import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { getAuthUrl } from "@/lib/auth-env";
import {
  buildGmailOAuthClient,
  getGmailOAuthConfig,
  getPrimaryGoogleOAuthClientConfig,
} from "@/lib/server/google-service-auth";
import { createGoogleIntegrationError } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";

type MailConfig = {
  gmailUser: string;
  gmailOauthClientId: string;
  gmailRefreshToken: string;
  oauthRedirectUri: string;
};

type GmailHeader = {
  name?: string | null;
  value?: string | null;
};

type GmailMessagePart = {
  partId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  headers?: GmailHeader[] | null;
  body?: {
    data?: string | null;
    attachmentId?: string | null;
    size?: number | null;
  } | null;
  parts?: GmailMessagePart[] | null;
};

type ExtractedMessageContent = {
  bodyHtml: string;
  bodyText: string;
  attachments: GmailAttachment[];
};

let gmailApi: ReturnType<typeof google.gmail> | null = null;
let gmailApiKey: string | null = null;
const logger = createLogger("email");

function getMailConfig(): MailConfig {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailConfig = getGmailOAuthConfig();

  const missing: string[] = [];
  if (!gmailUser) missing.push("GMAIL_USER");

  if (missing.length > 0) {
    logger.error("Missing Gmail config", { missing });
    throw new Error(`Missing Gmail email config: ${missing.join(", ")}`);
  }

  logger.debug("Resolved Gmail OAuth config", {
    gmailUser,
    clientIdPrefix: gmailConfig.clientId.slice(0, 12),
  });

  return {
    gmailUser: gmailUser!,
    gmailOauthClientId: gmailConfig.clientId,
    gmailRefreshToken: gmailConfig.refreshToken,
    oauthRedirectUri: gmailConfig.redirectUri,
  };
}

function getGmailApi() {
  const cfg = getMailConfig();
  const auth = buildGmailOAuthClient();
  const nextApiKey = [
    cfg.gmailUser,
    cfg.gmailOauthClientId,
    cfg.gmailRefreshToken,
    cfg.oauthRedirectUri,
  ].join("::");

  if (!gmailApi || gmailApiKey !== nextApiKey) {
    gmailApi = google.gmail({ version: "v1", auth });
    gmailApiKey = nextApiKey;
  }

  return gmailApi;
}

function normalizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value: string): string {
  const safe = normalizeHeaderValue(value);
  if (!safe) return "";
  return /^[\x20-\x7E]+$/.test(safe)
    ? safe
    : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function formatHeaderAddress(name: string, email: string): string {
  const safeEmail = normalizeHeaderValue(email);
  const safeName = name.replace(/[\r\n]+/g, " ").trim();

  if (!safeName) return safeEmail;

  const formattedName = /^[\x20-\x7E]+$/.test(safeName)
    ? `"${safeName.replace(/(["\\])/g, "\\$1")}"`
    : encodeHeaderValue(safeName);

  return `${formattedName} <${safeEmail}>`;
}

function normalizeHeaderAddressList(values: string[]): string {
  return values.map(normalizeHeaderValue).filter(Boolean).join(", ");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function normalizeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = normalized.length % 4;
  const padding = paddingLength === 0 ? "" : "=".repeat(4 - paddingLength);
  return `${normalized}${padding}`;
}

function decodeGmailBase64ToBuffer(value: string): Buffer {
  return Buffer.from(normalizeBase64Url(value), "base64");
}

function decodeGmailBase64ToString(value: string): string {
  return decodeGmailBase64ToBuffer(value).toString("utf8");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmailHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "<p></p>";

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function createPlainTextFallback(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildRawHtmlEmailMessage(input: {
  fromEmail?: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const normalizedHtml = normalizeEmailHtml(input.html);
  const plainText = createPlainTextFallback(normalizedHtml);
  const boundary = `bim-dashboard-${randomUUID()}`;
  const headers = [
    input.fromEmail
      ? `From: ${
          input.fromName
            ? formatHeaderAddress(input.fromName, input.fromEmail)
            : normalizeHeaderValue(input.fromEmail)
        }`
      : null,
    `To: ${normalizeHeaderAddressList(input.to)}`,
    input.cc?.length ? `Cc: ${normalizeHeaderAddressList(input.cc)}` : null,
    input.bcc?.length ? `Bcc: ${normalizeHeaderAddressList(input.bcc)}` : null,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    input.inReplyTo
      ? `In-Reply-To: ${normalizeHeaderValue(input.inReplyTo)}`
      : null,
    input.references
      ? `References: ${normalizeHeaderValue(input.references)}`
      : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(plainText, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(normalizedHtml, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function getHeaderValue(headers: GmailHeader[] | null | undefined, name: string) {
  const match = headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase()
  );
  return match?.value?.trim() ?? "";
}

function isAttachmentPart(part: GmailMessagePart): boolean {
  const filename = part.filename?.trim();
  const disposition = getHeaderValue(part.headers, "Content-Disposition").toLowerCase();
  const mimeType = part.mimeType ?? "";

  return (
    Boolean(filename) ||
    disposition.includes("attachment") ||
    (disposition.includes("inline") &&
      mimeType !== "text/plain" &&
      mimeType !== "text/html")
  );
}

function appendText(current: string, next: string): string {
  return current ? `${current}\n\n${next}` : next;
}

function extractMessageContent(
  part: GmailMessagePart | null | undefined,
  current: ExtractedMessageContent = {
    bodyHtml: "",
    bodyText: "",
    attachments: [],
  }
): ExtractedMessageContent {
  if (!part) return current;

  const mimeType = part.mimeType ?? "";
  const bodyData = part.body?.data;

  if (mimeType === "text/html" && bodyData) {
    current.bodyHtml = appendText(current.bodyHtml, decodeGmailBase64ToString(bodyData));
  } else if (mimeType === "text/plain" && bodyData) {
    current.bodyText = appendText(current.bodyText, decodeGmailBase64ToString(bodyData));
  }

  if (isAttachmentPart(part)) {
    const contentId = getHeaderValue(part.headers, "Content-ID").replace(/[<>]/g, "");
    current.attachments.push({
      partId: part.partId?.trim() || `part-${current.attachments.length + 1}`,
      filename:
        part.filename?.trim() || contentId || `attachment-${current.attachments.length + 1}`,
      mimeType: mimeType || "application/octet-stream",
      size: Number(part.body?.size ?? 0),
      isInline: getHeaderValue(part.headers, "Content-Disposition")
        .toLowerCase()
        .includes("inline"),
      contentId: contentId || undefined,
    });
  }

  if (part.parts) {
    for (const child of part.parts) {
      extractMessageContent(child, current);
    }
  }

  return current;
}

function findMessagePartById(
  part: GmailMessagePart | null | undefined,
  partId: string
): GmailMessagePart | null {
  if (!part) return null;
  if (part.partId === partId) return part;

  for (const child of part.parts ?? []) {
    const match = findMessagePartById(child, partId);
    if (match) return match;
  }

  return null;
}

function messageHasAttachments(part: GmailMessagePart | null | undefined): boolean {
  if (!part) return false;
  if (isAttachmentPart(part)) return true;
  return (part.parts ?? []).some((child) => messageHasAttachments(child));
}

async function sendEmailViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_EMAIL?.trim() || "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { id?: string };
  logger.info("Email sent via Resend", { to, subject, messageId: data.id ?? "unknown" });
}

async function sendEmailViaGmail(to: string, subject: string, html: string): Promise<void> {
  const cfg = getMailConfig();
  const gmail = getGmailApi();

  const raw = Buffer.from(
    buildRawHtmlEmailMessage({
      fromEmail: cfg.gmailUser,
      fromName: "BIM Dashboard",
      to: [to],
      subject,
      html,
    })
  ).toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  logger.info("Email sent via Gmail", {
    to,
    subject,
    messageId: result.data.id ?? "unknown",
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  logger.info("Sending email", { to, subject });
  try {
    if (process.env.RESEND_API_KEY?.trim()) {
      await sendEmailViaResend(to, subject, html);
      return;
    }
    await sendEmailViaGmail(to, subject, html);
  } catch (error) {
    const normalizedError = createGoogleIntegrationError("Gmail", error, {
      action: "send transactional email",
      reconnectMessage:
        "Email delivery is disconnected. Refresh the Gmail OAuth token before sending more mail.",
      unavailableMessage: "Email delivery is temporarily unavailable.",
      configMessage: "Email delivery is not configured.",
    });

    logger.error("Email send failed", {
      to,
      subject,
      error: normalizedError,
    });
    throw normalizedError;
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  await sendEmail(
    to,
    "Reset your BIM Dashboard password",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Password Reset</h2>
        <p>We received a request to reset your BIM Dashboard password.</p>
        <p>Click the button below to set a new password. The link expires in <strong>1 hour</strong>.</p>
        <a
          href="${resetUrl}"
          style="display:inline-block;margin:16px 0;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Reset Password
        </a>
        <p style="color:#888;font-size:13px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Internal Tools</p>
      </div>
    `
  );
}

export async function sendWelcomeEmail(
  to: string,
  name: string | null | undefined
): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Welcome to BIM Dashboard",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Welcome, ${displayName}!</h2>
        <p>Your BIM Dashboard account has been created successfully.</p>
        <p>You can now log in with your username and password.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Internal Tools</p>
      </div>
    `
  );
}

export async function sendPendingRequestEmail(
  to: string,
  name: string | null | undefined
): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Your BIM Dashboard access request is pending",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Request Received</h2>
        <p>Hi ${displayName},</p>
        <p>We've received your request to access the BIM Dashboard. An administrator will review it shortly.</p>
        <p>You'll receive another email once your request has been processed.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Internal Tools</p>
      </div>
    `
  );
}

export async function sendApprovedEmail(
  to: string,
  name: string | null | undefined
): Promise<void> {
  const displayName = name || to;
  const baseUrl = getAuthUrl() ?? "http://localhost:3000";
  await sendEmail(
    to,
    "Your BIM Dashboard access has been approved",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Approved!</h2>
        <p>Hi ${displayName},</p>
        <p>Great news - your request to access the BIM Dashboard has been <strong>approved</strong>.</p>
        <a
          href="${baseUrl}/login"
          style="display:inline-block;margin:16px 0;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Log In Now
        </a>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Internal Tools</p>
      </div>
    `
  );
}

export async function sendDeclinedEmail(
  to: string,
  name: string | null | undefined
): Promise<void> {
  const displayName = name || to;
  await sendEmail(
    to,
    "Your BIM Dashboard access request was not approved",
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Access Request Not Approved</h2>
        <p>Hi ${displayName},</p>
        <p>Unfortunately, your request to access the BIM Dashboard was not approved at this time.</p>
        <p>If you believe this is a mistake, please contact your administrator.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Internal Tools</p>
      </div>
    `
  );
}

/**
 * Send a sync-failure alert to the operator (luis.ecorteg@gmail.com).
 *
 * Used by Phase 1 sync orchestration scripts (`scripts/release.cjs` Quick Sync and
 * `scripts/deep-sync.cjs` Deep Sync) when their server-side run fails. Note the CJS
 * release/cron scripts cannot directly require this TS module — they implement an
 * inline raw-fetch Resend POST that mirrors this function's payload shape. This
 * export exists for TS callers (tRPC procedures, tests).
 *
 * Recipient is hardcoded per CONTEXT.md decision (email-only alerting for v2.0,
 * single operator). Internal `sendEmail` failures are swallowed — caller is already
 * in a failure path; we must not mask the original error with an alerting error.
 */
export async function sendSyncFailureAlert(opts: {
  syncType: "quick" | "deep";
  timestamp: string;
  errorMessage: string;
  jobId?: string;
}): Promise<void> {
  const { syncType, timestamp, errorMessage, jobId } = opts;
  const label =
    syncType === "quick" ? "Quick Sync (release step)" : "Deep Sync (nightly cron)";
  const subject = `[BIM Dashboard] ${label} failed — ${timestamp}`;
  const jobLine = jobId
    ? `<p><strong>Job ID:</strong> ${escapeHtml(jobId)}</p>`
    : "";
  try {
    await sendEmail(
      "luis.ecorteg@gmail.com",
      subject,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2>Sync Failure Alert</h2>
        <p><strong>Sync type:</strong> ${escapeHtml(label)}</p>
        <p><strong>Time:</strong> ${escapeHtml(timestamp)}</p>
        ${jobLine}
        <p><strong>Error:</strong></p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow:auto;">${escapeHtml(errorMessage)}</pre>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard — Automated Sync Alerts</p>
      </div>`
    );
  } catch (alertErr) {
    logger.warn("sendSyncFailureAlert failed (swallowed)", {
      syncType,
      timestamp,
      errorMessage,
      alertError: alertErr instanceof Error ? alertErr.message : String(alertErr),
    });
  }
}

export async function sendAdminNotificationEmail(
  userEmail: string,
  userName: string | null | undefined
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const displayName = userName || "New User";
  await sendEmail(
    adminEmail,
    `New Access Request: ${displayName}`,
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">New Access Request</h2>
        <p>A new user has requested access to the BIM Dashboard:</p>
        <p><strong>Name:</strong> ${displayName}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p style="margin-top:24px;">
          You can approve or decline this request in the User Management settings.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:12px;">BIM Dashboard - Admin Notifications</p>
      </div>
    `
  );
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
  hasAttachments: boolean;
}

export interface GmailAttachment {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
}

export interface GmailMessageFull extends GmailMessageSummary {
  to: string;
  cc?: string;
  messageIdHeader?: string;
  references?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments: GmailAttachment[];
}

export type SendGmailMessageInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
};

export function buildUserGmailApi(tokens: {
  refreshToken: string;
  accessToken?: string | null;
}) {
  const { clientId, clientSecret } = getPrimaryGoogleOAuthClientConfig();
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken ?? undefined,
  });
  return google.gmail({ version: "v1", auth });
}

export async function listRecentMessages(
  maxResults = 15,
  gmailApi?: ReturnType<typeof google.gmail>,
  query?: string
): Promise<GmailMessageSummary[]> {
  try {
    const gmail = gmailApi ?? getGmailApi();
    const searchQuery = ["in:inbox", query?.trim()].filter(Boolean).join(" ");
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: searchQuery,
    });

    const messages = res.data.messages || [];
    const summaries: GmailMessageSummary[] = [];

    await Promise.all(
      messages.map(async (msg) => {
        if (!msg.id) return;
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "full",
          });

          const headers = detail.data.payload?.headers || [];
          summaries.push({
            id: msg.id,
            threadId: msg.threadId || "",
            from: getHeaderValue(headers, "From") || "Unknown",
            subject: getHeaderValue(headers, "Subject") || "(No Subject)",
            date: getHeaderValue(headers, "Date"),
            snippet: detail.data.snippet || "",
            isUnread: (detail.data.labelIds || []).includes("UNREAD"),
            hasAttachments: messageHasAttachments(
              detail.data.payload as GmailMessagePart | undefined
            ),
          });
        } catch (err) {
          logger.warn(`Failed to fetch detail for message ${msg.id}`, { err });
        }
      })
    );

    return summaries.sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime()
    );
  } catch (error) {
    logger.error("Failed to list Gmail messages", { error });
    throw error;
  }
}

export async function getMessage(
  id: string,
  gmailApi?: ReturnType<typeof google.gmail>
): Promise<GmailMessageFull | null> {
  try {
    const gmail = gmailApi ?? getGmailApi();
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const data = res.data;
    const headers = data.payload?.headers || [];
    const extracted = extractMessageContent(data.payload as GmailMessagePart | undefined);

    return {
      id: data.id!,
      threadId: data.threadId!,
      from: getHeaderValue(headers, "From") || "Unknown",
      to: getHeaderValue(headers, "To"),
      cc: getHeaderValue(headers, "Cc") || undefined,
      subject: getHeaderValue(headers, "Subject") || "(No Subject)",
      date: getHeaderValue(headers, "Date"),
      snippet: data.snippet || "",
      isUnread: (data.labelIds || []).includes("UNREAD"),
      hasAttachments: extracted.attachments.length > 0,
      messageIdHeader: getHeaderValue(headers, "Message-ID") || undefined,
      references: getHeaderValue(headers, "References") || undefined,
      bodyHtml: extracted.bodyHtml,
      bodyText: extracted.bodyText,
      attachments: extracted.attachments,
    };
  } catch (error) {
    logger.error(`Failed to get message ${id}`, { error });
    return null;
  }
}

export async function getGmailAttachmentContent(
  messageId: string,
  partId: string,
  gmailApi?: ReturnType<typeof google.gmail>
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const gmail = gmailApi ?? getGmailApi();
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const part = findMessagePartById(
    message.data.payload as GmailMessagePart | undefined,
    partId
  );

  if (!part) {
    throw new Error(`Attachment part ${partId} was not found in message ${messageId}.`);
  }

  const mimeType = part.mimeType ?? "application/octet-stream";
  const filename = part.filename?.trim() || `attachment-${partId}`;

  if (part.body?.data) {
    return {
      buffer: decodeGmailBase64ToBuffer(part.body.data),
      filename,
      mimeType,
    };
  }

  const attachmentId = part.body?.attachmentId;
  if (!attachmentId) {
    throw new Error(
      `Attachment part ${partId} in message ${messageId} is missing attachment data.`
    );
  }

  const attachment = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  if (!attachment.data.data) {
    throw new Error(
      `Attachment ${attachmentId} in message ${messageId} returned no payload.`
    );
  }

  return {
    buffer: decodeGmailBase64ToBuffer(attachment.data.data),
    filename,
    mimeType,
  };
}

export async function sendGmailMessage(
  input: SendGmailMessageInput,
  gmailApi?: ReturnType<typeof google.gmail>
): Promise<{ id: string | null | undefined; threadId: string | null | undefined }> {
  const gmail = gmailApi ?? getGmailApi();
  let fromEmail: string | undefined;
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    fromEmail = profile.data.emailAddress ?? undefined;
  } catch (error) {
    logger.warn("Failed to resolve Gmail profile for From header", { error });
  }

  const raw = Buffer.from(
    buildRawHtmlEmailMessage({
      fromEmail,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
    })
  ).toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    },
  });

  logger.info("User Gmail message sent", {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    messageId: result.data.id ?? "unknown",
    threadId: result.data.threadId ?? input.threadId ?? "unknown",
  });

  return { id: result.data.id, threadId: result.data.threadId };
}

async function modifyGmailMessageLabels(
  id: string,
  labels: { addLabelIds?: string[]; removeLabelIds?: string[] },
  gmailApi?: ReturnType<typeof google.gmail>
) {
  const gmail = gmailApi ?? getGmailApi();
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: labels,
  });
}

export async function markGmailMessageRead(
  id: string,
  gmailApi?: ReturnType<typeof google.gmail>
) {
  await modifyGmailMessageLabels(id, { removeLabelIds: ["UNREAD"] }, gmailApi);
}

export async function markGmailMessageUnread(
  id: string,
  gmailApi?: ReturnType<typeof google.gmail>
) {
  await modifyGmailMessageLabels(id, { addLabelIds: ["UNREAD"] }, gmailApi);
}

export async function archiveGmailMessage(
  id: string,
  gmailApi?: ReturnType<typeof google.gmail>
) {
  await modifyGmailMessageLabels(id, { removeLabelIds: ["INBOX"] }, gmailApi);
}

export async function trashGmailMessage(
  id: string,
  gmailApi?: ReturnType<typeof google.gmail>
) {
  const gmail = gmailApi ?? getGmailApi();
  await gmail.users.messages.trash({
    userId: "me",
    id,
  });
}
