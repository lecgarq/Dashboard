import "server-only";
import { google } from "googleapis";
import {
  GOOGLE_CHAT_REQUIRED_SCOPES,
  getGoogleChatClientId,
  getGoogleChatClientSecret,
  getMissingGoogleScopes,
} from "@/lib/google-oauth";
import { getOrgDirectoryPersonByAccountId } from "@/lib/google-directory";
import { createLogger } from "@/lib/server/logger";
import { db } from "@/server/db";

type GoogleAccountRecord = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

export type ChatConnectionStatus =
  | "ok"
  | "not_linked"
  | "reconnect_required"
  | "error";

interface ChatConnectionState {
  status: ChatConnectionStatus;
  hasRefreshToken: boolean;
  missingScopes: string[];
  message?: string;
}
const logger = createLogger("google-chat");

// Memory cache for space metadata to avoid redundant API hits during 3s polling
const membershipCache = new Map<string, { memberships: any[]; timestamp: number }>();
const MEMBERSHIP_CACHE_TTL = 60000; // 1 minute

type ViewerIdentity = {
  name: string | null;
  email: string | null;
  googleAccountIds: string[];
};

type ChatParticipant = {
  name?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  type?: string | null;
};

type ChatProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

export interface ChatSpace {
  name: string;
  displayName: string;
  type: string;
  spaceType: string;
  singleUserBotDm: boolean;
  avatarUrl?: string | null;
  subtitle?: string | null;
  previewText?: string | null;
  lastMessageTime?: string | null;
  counterpartEmail?: string | null;
}

export interface ChatSpacesResult extends ChatConnectionState {
  spaces: ChatSpace[];
}

export interface ChatAttachment {
  /** Unique attachment name from Chat API (e.g. spaces/.../messages/.../attachments/...) */
  name: string;
  /** Media resource name used by media.download for uploaded content. */
  resourceName?: string;
  /** Original file name */
  contentName: string;
  /** MIME type */
  contentType: string;
  /** "DRIVE_FILE" or "UPLOADED_CONTENT" */
  source: "DRIVE_FILE" | "UPLOADED_CONTENT";
  /** Drive file ID (only for DRIVE_FILE) */
  driveFileId?: string;
  /** Thumbnail URI from Chat API */
  thumbnailUri?: string;
  /** Download URI from Chat API */
  downloadUri?: string;
}

export interface ChatMessage {
  name: string;
  sender: { name: string; displayName: string; avatarUrl?: string | null; type: string };
  createTime: string;
  text: string;
  attachments: ChatAttachment[];
}

export interface ChatMessagesResult extends ChatConnectionState {
  messages: ChatMessage[];
  nextPageToken?: string;
}

async function getUserGoogleAccount(userId: string): Promise<GoogleAccountRecord | null> {
  const account = await db.account.findFirst({
    where: { userId, provider: "google-chat" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });

  return account;
}

async function getViewerIdentity(userId: string): Promise<ViewerIdentity> {
  const [user, accounts] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    db.account.findMany({
      where: {
        userId,
        provider: { in: ["google", "google-chat"] },
      },
      select: { providerAccountId: true },
    }),
  ]);

  return {
    name: user?.name?.trim() ?? null,
    email: user?.email?.trim().toLowerCase() ?? null,
    googleAccountIds: accounts
      .map((account) => account.providerAccountId?.trim())
      .filter((accountId): accountId is string => Boolean(accountId)),
  };
}

function buildOAuthClient(userId: string, account: GoogleAccountRecord) {
  const clientId = getGoogleChatClientId();
  const clientSecret = getGoogleChatClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google Chat OAuth client credentials.");
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret
  );

  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;
    if (Object.keys(data).length > 0) {
      await db.account.updateMany({ where: { userId, provider: "google-chat" }, data });
    }
  });

  return oauth2;
}

function buildReconnectMessage(missingScopes: string[], hasRefreshToken: boolean) {
  if (missingScopes.length > 0 && !hasRefreshToken) {
    return "Reconnect Google to grant Chat permissions and refresh offline access.";
  }
  if (missingScopes.length > 0) {
    return "Reconnect Google to grant the required Chat permissions.";
  }
  return "Reconnect Google to refresh Chat access.";
}

function getGoogleApiError(err: unknown) {
  const error = err as {
    code?: number;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: { message?: string } } };
  };

  const code = error.code ?? error.status ?? error.response?.status ?? 0;
  const message =
    error.response?.data?.error?.message ?? error.message ?? "Unknown Google Chat error.";

  return { code, message };
}

function normalizeIdentityValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isViewerUser(
  member: { name?: string | null; displayName?: string | null } | undefined,
  viewer: ViewerIdentity
) {
  const memberDisplayName = normalizeIdentityValue(member?.displayName);
  const memberName = normalizeIdentityValue(member?.name);
  const viewerName = normalizeIdentityValue(viewer.name);
  const viewerEmail = normalizeIdentityValue(viewer.email);

  if (viewerEmail) {
    if (memberDisplayName === viewerEmail) return true;
    if (memberName === `users/${viewerEmail}`) return true;
  }

  if (viewerName && memberDisplayName === viewerName) {
    return true;
  }

  if (
    viewer.googleAccountIds.some(
      (accountId) => memberName === normalizeIdentityValue(`users/${accountId}`)
    )
  ) {
    return true;
  }

  return false;
}

function getChatAccountId(userName?: string | null) {
  if (!userName?.startsWith("users/")) return null;
  const accountId = userName.slice("users/".length).trim();
  if (!accountId || accountId === "app" || accountId.includes("@")) return null;
  return accountId;
}

function mapPeopleProfile(person: any): ChatProfile | null {
  const displayName =
    person.names?.find((name: any) => name.metadata?.primary)?.displayName?.trim() ??
    person.names?.[0]?.displayName?.trim() ??
    null;

  const avatarUrl =
    person.photos?.find((photo: any) => photo.metadata?.primary)?.url ??
    person.photos?.[0]?.url ??
    null;

  const email =
    person.emailAddresses?.find((entry: any) => entry.metadata?.primary)?.value?.trim().toLowerCase() ??
    person.emailAddresses?.[0]?.value?.trim().toLowerCase() ??
    null;

  if (!displayName && !avatarUrl && !email) {
    return null;
  }

  return {
    displayName,
    avatarUrl,
    email,
  };
}

async function getPeopleProfileByAccountId(
  chatAuth: ReturnType<typeof buildOAuthClient>,
  accountId: string
): Promise<ChatProfile | null> {
  const people = google.people({ version: "v1", auth: chatAuth });

  try {
    const res = await people.people.get({
      resourceName: `people/${accountId}`,
      personFields: "names,photos,emailAddresses",
    });

    return mapPeopleProfile(res.data);
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("People profile lookup failed", {
      accountId,
      code,
      message,
      error: err,
    });
    return null;
  }
}

async function resolveDirectoryProfile(
  userId: string,
  chatUserName: string | null | undefined,
  cache: Map<string, Awaited<ReturnType<typeof getOrgDirectoryPersonByAccountId>>>
) {
  const accountId = getChatAccountId(chatUserName);
  if (!accountId) return null;

  if (!cache.has(accountId)) {
    cache.set(accountId, await getOrgDirectoryPersonByAccountId(userId, accountId));
  }

  return cache.get(accountId) ?? null;
}

async function resolveChatProfile(
  userId: string,
  chatAuth: ReturnType<typeof buildOAuthClient>,
  chatUserName: string | null | undefined
) {
  const accountId = getChatAccountId(chatUserName);
  if (!accountId) return null;

  // Utilize the centralized global directory cache from google-directory.ts
  // This is now the single source of truth for all modules.
  const profile = await getOrgDirectoryPersonByAccountId(userId, accountId);
  if (!profile) return null;

  return {
    displayName: profile.displayName ?? null,
    avatarUrl: profile.photoUrl ?? null,
    email: profile.email ?? null,
  } satisfies ChatProfile;
}

function summarizeSpaceType(spaceType: string) {
  switch (spaceType) {
    case "DIRECT_MESSAGE":
      return "Direct message";
    case "GROUP_CHAT":
      return "Group chat";
    case "SPACE":
      return "Space";
    default:
      return "Conversation";
  }
}

function cleanPreviewText(value?: string | null) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function formatMemberSummary(
  memberships: Array<{ member?: { displayName?: string | null; name?: string | null; type?: string | null } }>,
  viewer: ViewerIdentity
) {
  const visibleNames = memberships
    .map((membership) => membership.member)
    .filter(
      (member): member is { displayName?: string | null; name?: string | null; type?: string | null } =>
        Boolean(member)
    )
    .filter((member) => member.type === "HUMAN" && !isViewerUser(member, viewer))
    .map((member) => member.displayName?.trim())
    .filter((name): name is string => Boolean(name));

  if (visibleNames.length === 0) {
    return null;
  }

  if (visibleNames.length <= 3) {
    return visibleNames.join(", ");
  }

  return `${visibleNames.slice(0, 3).join(", ")} +${visibleNames.length - 3}`;
}

async function getSpaceMemberships(chat: ReturnType<typeof google.chat>, spaceName: string) {
  const cached = membershipCache.get(spaceName);
  if (cached && Date.now() - cached.timestamp < MEMBERSHIP_CACHE_TTL) {
    return cached.memberships;
  }

  const response = await chat.spaces.members.list({
    parent: spaceName,
    pageSize: 20,
  });

  const memberships = response.data.memberships ?? [];
  membershipCache.set(spaceName, { memberships, timestamp: Date.now() });
  return memberships;
}

async function getDirectMessagePreview(
  chat: ReturnType<typeof google.chat>,
  spaceName: string,
  viewer: ViewerIdentity
) {
  const response = await chat.spaces.messages.list({
    parent: spaceName,
    pageSize: 8,
    orderBy: "createTime desc",
  });

  const messages = response.data.messages ?? [];
  const latestTextMessage = messages.find((message) =>
    Boolean(cleanPreviewText(message.text ?? message.formattedText))
  );
  const counterpartMessage = messages.find(
    (message) =>
      message.sender?.type === "HUMAN" &&
      !isViewerUser(
        { displayName: message.sender?.displayName, name: message.sender?.name },
        viewer
      )
  );
  const counterpartSender = counterpartMessage?.sender as
    | { avatarUrl?: string | null; displayName?: string | null; name?: string | null }
    | undefined;

  const latestText = cleanPreviewText(latestTextMessage?.text ?? latestTextMessage?.formattedText);
  const latestSenderIsViewer = latestTextMessage
    ? isViewerUser(
        {
          displayName: latestTextMessage.sender?.displayName,
          name: latestTextMessage.sender?.name,
        },
        viewer
      )
    : false;

  return {
    counterpartName: counterpartSender?.name ?? null,
    avatarUrl: counterpartSender?.avatarUrl ?? null,
    counterpartDisplayName: counterpartSender?.displayName?.trim() ?? null,
    previewText:
      latestText && latestSenderIsViewer
        ? `You: ${latestText}`
        : latestText,
    lastMessageTime: latestTextMessage?.createTime ?? null,
  };
}

async function buildChatSpace(
  userId: string,
  chatAuth: ReturnType<typeof buildOAuthClient>,
  chat: ReturnType<typeof google.chat>,
  space: any,
  viewer: ViewerIdentity
): Promise<ChatSpace> {
  const baseDisplayName = space.displayName?.trim();
  const rawName = space.name ?? "";
  const spaceType = space.spaceType ?? "";
  const isDirectMessage = spaceType === "DIRECT_MESSAGE";

  let displayName = baseDisplayName;
  let subtitle = summarizeSpaceType(spaceType);
  let avatarUrl: string | null = null;
  let previewText: string | null = null;
  let lastMessageTime: string | null = null;
  let counterpart: ChatParticipant | null = null;
  let counterpartEmail: string | null = null;

  // If we don't have a display name from the API, start with a readable placeholder
  // instead of the raw technical ID (spaces/...)
  if (!displayName) {
    displayName = subtitle || "Conversation";
  }

  try {
    if (isDirectMessage || !baseDisplayName) {
      const memberships = await getSpaceMemberships(chat, rawName);
      const participants = memberships
        .map((membership) => membership.member)
        .filter(
          (member): member is { name?: string | null; displayName?: string | null; type?: string | null } =>
            Boolean(member)
        );

      if (isDirectMessage) {
        counterpart =
          (participants.find(
            (member) => member.type === "HUMAN" && !isViewerUser(member, viewer)
          ) ??
          participants.find((member) => member.type === "BOT") ??
          participants.find((member) => !isViewerUser(member, viewer))) ?? null;

        // If it's a DM with exactly 2 people and we missed the counterpart, 
        // take the one that isn't the viewer.
        if (!counterpart && isDirectMessage && participants.length === 2) {
          const found = participants.find((p) => !isViewerUser(p, viewer)) || participants[0];
          counterpart = found ?? null;
        }

        if (counterpart?.displayName?.trim()) {
          displayName = counterpart.displayName.trim();
        }
        subtitle = counterpart?.type === "BOT" ? "App conversation" : "Direct message";
      } else if (!baseDisplayName) {
        const summary = formatMemberSummary(memberships, viewer);
        if (summary) {
          displayName = summary;
        }
        subtitle = summarizeSpaceType(spaceType);
      }
    }
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("Space membership lookup failed", {
      spaceName: rawName,
      code,
      message,
      error: err,
    });
  }

  if (isDirectMessage) {
    try {
      const preview = await getDirectMessagePreview(chat, rawName, viewer);
      avatarUrl = preview.avatarUrl;
      previewText = preview.previewText;
      lastMessageTime = preview.lastMessageTime;
      if (!counterpart && preview.counterpartName) {
        counterpart = { name: preview.counterpartName };
      }
      if ((!baseDisplayName || displayName === rawName) && preview.counterpartDisplayName) {
        displayName = preview.counterpartDisplayName;
      }
    } catch (err) {
      const { code, message } = getGoogleApiError(err);
      logger.warn("Direct message preview lookup failed", {
        spaceName: rawName,
        code,
        message,
        error: err,
      });
    }
  }

  // For non-DM spaces, fetch just the latest message to get lastMessageTime for sorting
  if (!isDirectMessage && !lastMessageTime) {
    try {
      const latestRes = await chat.spaces.messages.list({
        parent: rawName,
        pageSize: 1,
        orderBy: "createTime desc",
      });
      const latestMsg = latestRes.data.messages?.[0];
      if (latestMsg) {
        lastMessageTime = latestMsg.createTime ?? null;
        if (!previewText) {
          previewText = cleanPreviewText(latestMsg.text ?? latestMsg.formattedText);
        }
      }
    } catch (err) {
      const { code, message } = getGoogleApiError(err);
      logger.warn("Latest message lookup failed", {
        spaceName: rawName,
        code,
        message,
        error: err,
      });
    }
  }

  if (isDirectMessage && counterpart?.type !== "BOT") {
    const profile = await resolveChatProfile(
      userId,
      chatAuth,
      counterpart?.name
    );

    if (profile) {
      displayName = profile.displayName || displayName;
      avatarUrl = profile.avatarUrl ?? avatarUrl;
      counterpartEmail = profile.email ?? counterpartEmail;
    }
  }

  return {
    name: rawName,
    displayName,
    type: space.type ?? "",
    spaceType,
    singleUserBotDm: space.singleUserBotDm ?? false,
    avatarUrl,
    subtitle,
    previewText,
    lastMessageTime,
    counterpartEmail,
  };
}

async function getUserChatConnection(
  userId: string
): Promise<ChatConnectionState & { auth?: ReturnType<typeof buildOAuthClient> }> {
  const account = await getUserGoogleAccount(userId);
  if (!account) {
    return {
      status: "not_linked",
      hasRefreshToken: false,
      missingScopes: [...GOOGLE_CHAT_REQUIRED_SCOPES],
      message: "Link your Google Chat account to use Google Chat.",
    };
  }

  const missingScopes = getMissingGoogleScopes(account.scope);
  const hasRefreshToken = Boolean(account.refresh_token);

  if (missingScopes.length > 0 || !hasRefreshToken) {
    return {
      status: "reconnect_required",
      hasRefreshToken,
      missingScopes,
      message: buildReconnectMessage(missingScopes, hasRefreshToken),
    };
  }

  return {
    status: "ok",
    hasRefreshToken,
    missingScopes: [],
    auth: buildOAuthClient(userId, account),
  };
}

// Server-side cache for listChatSpaces to prevent redundant API hits from multiple tabs/SSE
const spacesCache = new Map<string, { result: ChatSpacesResult; timestamp: number }>();
const SPACES_CACHE_TTL = 30000; // 30 seconds

/**
 * List Google Chat spaces the user is a member of.
 */
export async function listChatSpaces(userId: string): Promise<ChatSpacesResult> {
  const cached = spacesCache.get(userId);
  if (cached && Date.now() - cached.timestamp < SPACES_CACHE_TTL) {
    return cached.result;
  }

  const connection = await getUserChatConnection(userId);
  if (connection.status !== "ok" || !connection.auth) {
    return {
      ...connection,
      spaces: [],
    };
  }

  const chat = google.chat({ version: "v1", auth: connection.auth });
  const viewer = await getViewerIdentity(userId);
  const peopleCache = new Map<string, Promise<ChatProfile | null>>();
  const directoryCache = new Map<
    string,
    Awaited<ReturnType<typeof getOrgDirectoryPersonByAccountId>>
  >();

  try {
    const res = await chat.spaces.list({ pageSize: 50 });
    // Use controlled concurrency for space resolution to prevent rate limiting
    const spaces: ChatSpace[] = [];
    const BATCH_SIZE = 5;
    const rawSpaces = res.data.spaces ?? [];

    for (let i = 0; i < rawSpaces.length; i += BATCH_SIZE) {
      const batch = rawSpaces.slice(i, i + BATCH_SIZE);
      const resolvedBatch = await Promise.all(
        batch.map((s: any) =>
          buildChatSpace(userId, connection.auth!, chat, s, viewer)
        )
      );
      spaces.push(...resolvedBatch);
    }
    spaces.sort(
      (left, right) =>
        new Date(right.lastMessageTime ?? 0).getTime() -
        new Date(left.lastMessageTime ?? 0).getTime()
    );

    const result: ChatSpacesResult = {
      status: "ok",
      hasRefreshToken: true,
      missingScopes: [],
      spaces,
    };

    spacesCache.set(userId, { result, timestamp: Date.now() });
    return result;
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("Space list failed", {
      code,
      message,
      error: err,
    });
    return {
      status: "error",
      hasRefreshToken: true,
      missingScopes: [],
      spaces: [],
      message: `Google Chat failed to load spaces (${code || "unknown"}): ${message}`,
    };
  }
}

/**
 * List messages in a Google Chat space.
 */
export async function listChatMessages(
  userId: string,
  spaceName: string,
  pageToken?: string
): Promise<ChatMessagesResult> {
  const connection = await getUserChatConnection(userId);
  if (connection.status !== "ok" || !connection.auth) {
    return {
      ...connection,
      messages: [],
    };
  }

  const chat = google.chat({ version: "v1", auth: connection.auth });
  const peopleCache = new Map<string, Promise<ChatProfile | null>>();
  const directoryCache = new Map<
    string,
    Awaited<ReturnType<typeof getOrgDirectoryPersonByAccountId>>
  >();

  try {
    const res = await chat.spaces.messages.list({
      parent: spaceName,
      pageSize: 50,
      pageToken,
      orderBy: "createTime desc",
    });

    const messages: ChatMessage[] = await Promise.all(
      (res.data.messages ?? []).map(async (msg: any) => {
        const senderName = msg.sender?.name ?? "";
        const fallbackDisplayName =
          msg.sender?.displayName && msg.sender.displayName !== senderName
            ? msg.sender.displayName
            : null;
        const profile =
          msg.sender?.type === "HUMAN"
            ? await resolveChatProfile(
                userId,
                connection.auth!,
                senderName
              )
            : null;

        // Parse attachments
        const attachments: ChatAttachment[] = (msg.attachment ?? []).map(
          (att: any) => ({
            name: att.name ?? "",
            resourceName: att.attachmentDataRef?.resourceName ?? undefined,
            contentName: att.contentName ?? "file",
            contentType: att.contentType ?? "application/octet-stream",
            source: att.source === "DRIVE_FILE" ? "DRIVE_FILE" : "UPLOADED_CONTENT",
            driveFileId: att.driveDataRef?.driveFileId ?? undefined,
            thumbnailUri: att.thumbnailUri ?? undefined,
            downloadUri: att.downloadUri ?? undefined,
          })
        );

        return {
          name: msg.name ?? "",
          sender: {
            name: senderName,
            displayName: profile?.displayName ?? fallbackDisplayName ?? "Unknown",
            avatarUrl: profile?.avatarUrl ?? msg.sender?.avatarUrl ?? null,
            type: msg.sender?.type ?? "HUMAN",
          },
          createTime: msg.createTime ?? new Date().toISOString(),
          text: msg.text ?? msg.formattedText ?? "",
          attachments,
        };
      })
    );

    return {
      status: "ok",
      hasRefreshToken: true,
      missingScopes: [],
      messages: messages.reverse(),
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("Message list failed", {
      spaceName,
      code,
      message,
      error: err,
    });
    return {
      status: "error",
      hasRefreshToken: true,
      missingScopes: [],
      messages: [],
      message: `Google Chat failed to load messages (${code || "unknown"}): ${message}`,
    };
  }
}

// ─── Lightweight polling for SSE stream ──────────────────────────────────────
// Only fetches 1 message per space (vs 50 for full listChatMessages).
// Caches results for 5 seconds to deduplicate concurrent SSE stream polls.

const latestMessageCache = new Map<
  string,
  { message: ChatMessage | null; timestamp: number }
>();
const LATEST_MSG_CACHE_TTL = 5000; // 5 seconds

export async function pollLatestMessage(
  userId: string,
  spaceName: string
): Promise<{ status: ChatConnectionStatus; message: ChatMessage | null }> {
  // Check cache first
  const cacheKey = `${userId}:${spaceName}`;
  const cached = latestMessageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < LATEST_MSG_CACHE_TTL) {
    return { status: "ok", message: cached.message };
  }

  const connection = await getUserChatConnection(userId);
  if (connection.status !== "ok" || !connection.auth) {
    return { status: connection.status, message: null };
  }

  const chat = google.chat({ version: "v1", auth: connection.auth });

  try {
    const res = await chat.spaces.messages.list({
      parent: spaceName,
      pageSize: 1,
      orderBy: "createTime desc",
    });

    const raw = res.data.messages?.[0];
    if (!raw) {
      latestMessageCache.set(cacheKey, { message: null, timestamp: Date.now() });
      return { status: "ok", message: null };
    }

    const senderName = raw.sender?.name ?? "";
    const profile =
      raw.sender?.type === "HUMAN"
        ? await resolveChatProfile(userId, connection.auth, senderName)
        : null;
    const fallbackDisplayName =
      raw.sender?.displayName && raw.sender.displayName !== senderName
        ? raw.sender.displayName
        : null;

    const message: ChatMessage = {
      name: raw.name ?? "",
      sender: {
        name: senderName,
        displayName: profile?.displayName ?? fallbackDisplayName ?? "Unknown",
        avatarUrl: profile?.avatarUrl ?? (raw.sender as any)?.avatarUrl ?? null,
        type: raw.sender?.type ?? "HUMAN",
      },
      createTime: raw.createTime ?? new Date().toISOString(),
      text: raw.text ?? raw.formattedText ?? "",
      attachments: [],
    };

    latestMessageCache.set(cacheKey, { message, timestamp: Date.now() });
    return { status: "ok", message };
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("Latest message poll failed", {
      spaceName,
      code,
      message,
      error: err,
    });
    return { status: "error", message: null };
  }
}

/**
 * Send a message to a Google Chat space.
 */
export async function sendChatMessage(
  userId: string,
  spaceName: string,
  text: string
): Promise<ChatMessage | null> {
  const connection = await getUserChatConnection(userId);
  if (connection.status === "not_linked") {
    throw new Error("Link your Google Chat account to send Google Chat messages.");
  }
  if (connection.status === "reconnect_required") {
    throw new Error(connection.message ?? "Reconnect Google before sending Chat messages.");
  }
  if (connection.status !== "ok" || !connection.auth) {
    throw new Error(connection.message ?? "Google Chat is unavailable right now.");
  }

  const chat = google.chat({ version: "v1", auth: connection.auth });

  try {
    const res = await chat.spaces.messages.create({
      parent: spaceName,
      requestBody: { text },
    });

    const msg = res.data as any;
    return {
      name: msg.name ?? "",
      sender: {
        name: msg.sender?.name ?? "",
        displayName: msg.sender?.displayName ?? "Me",
        avatarUrl: msg.sender?.avatarUrl ?? null,
        type: msg.sender?.type ?? "HUMAN",
      },
      createTime: msg.createTime ?? new Date().toISOString(),
      text: msg.text ?? text,
      attachments: [],
    };
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.error("Send message failed", {
      spaceName,
      code,
      message,
      error: err,
    });
    throw new Error(`Google Chat failed to send the message (${code || "unknown"}): ${message}`);
  }
}
