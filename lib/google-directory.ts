import "server-only";
import { google } from "googleapis";
import { db } from "@/server/db";
import {
  getMissingGoogleScopes,
  googleApiErrorMessageIncludes,
  hasGoogleApiReason,
  summarizeGoogleApiError,
} from "@/lib/google-oauth";
import { buildPrimaryGoogleOAuthClient } from "@/lib/server/google-service-auth";
import { createLogger } from "@/lib/server/logger";

type DirectoryLookupStatus = "ok" | "not_linked" | "reconnect_required";
const GOOGLE_DIRECTORY_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/directory.readonly",
] as const;
const logger = createLogger("google-directory");

interface GoogleAccountRecord {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
}

export interface OrgPerson {
  resourceName: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  costCenter: string | null;
}

export interface CalendarGuestDirectoryResult {
  status: DirectoryLookupStatus;
  people: OrgPerson[];
  departments: string[];
  costCenters: string[];
  message?: string;
}

function buildReconnectRequiredDirectoryResult(
  people: OrgPerson[],
  departments: string[],
  costCenters: string[],
  message: string
): CalendarGuestDirectoryResult {
  return {
    status: "reconnect_required",
    people,
    departments,
    costCenters,
    message,
  };
}

async function getUserGoogleAccount(userId: string): Promise<GoogleAccountRecord | null> {
  // Find all potential Google/Chat accounts
  const accounts = await db.account.findMany({
    where: { 
      userId, 
      provider: { in: ["google", "google-chat"] } 
    },
    select: { provider: true, access_token: true, refresh_token: true, expires_at: true, scope: true },
  });

  if (accounts.length === 0) return null;

  // Prefer the account that can actually call the directory API.
  // A Google Chat link may be newer than the main Google account but lack directory scope.
  const bestAccount = accounts.sort((a, b) => {
    const missingScopeDelta =
      getMissingDirectoryScopes(a).length - getMissingDirectoryScopes(b).length;
    if (missingScopeDelta !== 0) return missingScopeDelta;
    if (a.provider === "google" && b.provider !== "google") return -1;
    if (a.provider !== "google" && b.provider === "google") return 1;
    if (a.refresh_token && !b.refresh_token) return -1;
    if (!a.refresh_token && b.refresh_token) return 1;
    return (b.expires_at ?? 0) - (a.expires_at ?? 0);
  })[0];

  return bestAccount || null;
}

function getMissingDirectoryScopes(account: Pick<GoogleAccountRecord, "scope"> | null | undefined) {
  return getMissingGoogleScopes(account?.scope, GOOGLE_DIRECTORY_REQUIRED_SCOPES);
}

function hasUsableDirectoryToken(account: GoogleAccountRecord | null) {
  return Boolean(account?.refresh_token || account?.access_token);
}

function buildDirectoryReconnectMessage(
  account: GoogleAccountRecord | null,
  error?: unknown
): string {
  const missingScopes = getMissingDirectoryScopes(account);
  const hasRefreshToken = Boolean(account?.refresh_token);

  if (missingScopes.length > 0 && !hasRefreshToken) {
    return "Reconnect your Google account to grant Directory access and refresh offline access.";
  }
  if (missingScopes.length > 0) {
    return "Reconnect your Google account to grant Directory access.";
  }
  if (!hasUsableDirectoryToken(account)) {
    return "Reconnect your Google account to restore Directory access.";
  }

  if (error) {
    const summary = summarizeGoogleApiError(error);
    if (
      summary.statusCode === 401 ||
      hasGoogleApiReason(summary, "authError", "invalid_grant") ||
      googleApiErrorMessageIncludes(summary, "invalid credentials", "invalid_grant")
    ) {
      return "Reconnect your Google account to refresh Directory access.";
    }
    if (
      summary.statusCode === 403 ||
      hasGoogleApiReason(summary, "insufficientPermissions", "insufficient_scope", "forbidden")
    ) {
      return "Reconnect your Google account to grant Directory access.";
    }
  }

  return "Reconnect your Google account to restore Directory access.";
}

function buildUserAuth(userId: string, account: GoogleAccountRecord | null) {
  if (!account || !hasUsableDirectoryToken(account)) return null;
  const activeAccount = account;

  let oauth2: InstanceType<typeof google.auth.OAuth2>;
  try {
    oauth2 = buildPrimaryGoogleOAuthClient();
  } catch (error) {
    logger.error("Google OAuth config missing for directory auth", {
      userId,
      error,
    });
    return null;
  }

  oauth2.setCredentials({
    access_token: activeAccount.access_token ?? undefined,
    refresh_token: activeAccount.refresh_token,
    expiry_date: activeAccount.expires_at ? activeAccount.expires_at * 1000 : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;
    if (Object.keys(data).length > 0) {
      await db.account.updateMany({ where: { userId, provider: activeAccount.provider }, data });
    }
  });

  return oauth2;
}

function mapDirectoryCollections(people: OrgPerson[]) {
  const departments = Array.from(
    new Set(people.map((person) => person.department).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b));

  const costCenters = Array.from(
    new Set(people.map((person) => person.costCenter).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b));

  return { departments, costCenters };
}

const COST_CENTER_KEYS = [
  "centro de costos",
  "centro de costo",
  "centro de presupuestos",
  "centro de presupuesto",
  "cost center",
  "cost centre",
  "costcenter",
  "costcentre",
];

function matchesCostCenterKey(key: string): boolean {
  const normalized = key.toLowerCase().trim();
  return COST_CENTER_KEYS.some((term) => normalized.includes(term));
}

function extractUserDefinedCostCenter(userDefined: any[] | undefined | null): string | null {
  if (!Array.isArray(userDefined)) return null;
  for (const field of userDefined) {
    if (field.key && matchesCostCenterKey(field.key) && field.value) {
      return String(field.value).trim() || null;
    }
  }
  return null;
}

function extractClientDataCostCenter(clientData: any[] | undefined | null): string | null {
  if (!Array.isArray(clientData)) return null;
  for (const field of clientData) {
    if (field.key && matchesCostCenterKey(field.key) && field.value) {
      return String(field.value).trim() || null;
    }
  }
  return null;
}

function mapPersonToOrgPerson(person: any): OrgPerson | null {
  const name =
    person.names?.find((n: any) => n.metadata?.primary)?.displayName ??
    person.names?.[0]?.displayName ??
    "";

  const email =
    person.emailAddresses?.find((e: any) => e.metadata?.primary)?.value ??
    person.emailAddresses?.[0]?.value ??
    "";

  if (!email) return null;

  const photo =
    person.photos?.find((p: any) => p.metadata?.primary)?.url ??
    person.photos?.[0]?.url ??
    null;

  const org =
    person.organizations?.find((o: any) => o.metadata?.primary) ??
    person.organizations?.[0];

  const phone =
    person.phoneNumbers?.find((p: any) => p.metadata?.primary)?.value ??
    person.phoneNumbers?.[0]?.value ??
    null;

  // Try to extract cost center from multiple sources (no admin needed)
  const costCenter =
    org?.costCenter ??
    extractUserDefinedCostCenter(person.userDefined) ??
    extractClientDataCostCenter(person.clientData) ??
    null;

  return {
    resourceName: person.resourceName ?? email,
    displayName: name,
    email,
    photoUrl: photo ?? null,
    department: org?.department ?? null,
    jobTitle: org?.title ?? null,
    phoneNumber: phone,
    costCenter,
  };
}

// Server-side cache for the organization directory to prevent massive redundant fetches
const directoryCache = new Map<string, { people: OrgPerson[]; timestamp: number }>();
const directoryInFlight = new Map<string, Promise<OrgPerson[]>>();

// Global individual person cache to share across modules (Directory, Chat, etc.)
// This prevents multiple components from hammering the People API for the same user.
const globalPersonCache = new Map<string, { person: OrgPerson; timestamp: number }>();
const globalPersonInFlight = new Map<string, Promise<OrgPerson | null>>();

const DIRECTORY_CACHE_TTL = 300000; // 5 minutes
const PERSON_CACHE_TTL = 3600000; // 1 hour for individuals (avatars don't change often)
const DIRECTORY_REQUEST_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * List people in the Google Workspace organization directory.
 * Uses the People API with the directory.readonly scope.
 * Any Workspace member can call this - no admin required.
 */
export async function listOrgDirectoryPeople(userId: string): Promise<OrgPerson[]> {
  // Check memory cache first
  const cached = directoryCache.get(userId);
  if (cached && Date.now() - cached.timestamp < DIRECTORY_CACHE_TTL) {
    return cached.people;
  }

  // Check if a fetch is already in-flight to prevent race conditions (Single-Flight)
  if (directoryInFlight.has(userId)) {
    return directoryInFlight.get(userId)!;
  }

  const fetchPromise = (async () => {
    try {
      const result = await fetchOrgDirectoryInternal(userId);
      
      // Proactively populate the global individual cache with everyone in the directory
      const now = Date.now();
      for (const person of result) {
        if (person.resourceName) {
          globalPersonCache.set(person.resourceName, { person, timestamp: now });
        }
      }

      directoryCache.set(userId, { people: result, timestamp: Date.now() });
      return result;
    } finally {
      directoryInFlight.delete(userId);
    }
  })();

  directoryInFlight.set(userId, fetchPromise);
  return fetchPromise;
}

async function fetchOrgDirectoryInternal(userId: string): Promise<OrgPerson[]> {
  const account = await getUserGoogleAccount(userId);
  const auth = buildUserAuth(userId, account);
  if (!auth) return [];

  const people = google.people({ version: "v1", auth });

  try {
    const all: OrgPerson[] = [];
    let pageToken: string | undefined;

    do {
      const res = await people.people.listDirectoryPeople({
        readMask: "names,emailAddresses,photos,organizations,phoneNumbers,userDefined,clientData",
        sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
        pageSize: 200,
        pageToken,
      });

      const connections = res.data.people ?? [];
      for (const person of connections) {
        const mappedPerson = mapPersonToOrgPerson(person);
        if (mappedPerson) {
          all.push(mappedPerson);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return all.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (err: any) {
    logger.warn("Directory people lookup failed", {
      userId,
      error: err,
    });
    throw err; // Let the caller handle the error
  }
}

export async function getOrgDirectoryPersonByAccountId(
  userId: string,
  accountId: string
): Promise<OrgPerson | null> {
  const resourceName = `people/${accountId}`;

  // 1. Check Global Cache
  const cached = globalPersonCache.get(resourceName);
  if (cached && Date.now() - cached.timestamp < PERSON_CACHE_TTL) {
    return cached.person;
  }

  // 2. Check if a fetch is already in-flight (Single-Flight)
  if (globalPersonInFlight.has(resourceName)) {
    return globalPersonInFlight.get(resourceName)!;
  }

  const fetchPromise = (async () => {
    const account = await getUserGoogleAccount(userId);
    const auth = buildUserAuth(userId, account);
    if (!auth) return null;

    const people = google.people({ version: "v1", auth });

    try {
      const res = await people.people.get({
        resourceName,
        personFields: "names,emailAddresses,photos,organizations,phoneNumbers",
        sources: ["READ_SOURCE_TYPE_PROFILE"],
      });

      const mapped = mapPersonToOrgPerson(res.data);
      if (mapped) {
        globalPersonCache.set(resourceName, { person: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err: any) {
      logger.warn("Directory person lookup by account id failed", {
        accountId,
        error: err,
      });
      return null;
    } finally {
      globalPersonInFlight.delete(resourceName);
    }
  })();

  globalPersonInFlight.set(resourceName, fetchPromise);
  return fetchPromise;
}

export async function listCalendarGuestDirectory(
  userId: string
): Promise<CalendarGuestDirectoryResult> {
  const account = await getUserGoogleAccount(userId);
  if (!account) {
    return {
      status: "not_linked",
      people: [],
      departments: [],
      costCenters: [],
      message: "Link your Google account to search your Workspace directory.",
    };
  }

  if (getMissingDirectoryScopes(account).length > 0) {
    return buildReconnectRequiredDirectoryResult(
      [],
      [],
      [],
      buildDirectoryReconnectMessage(account)
    );
  }

  const auth = buildUserAuth(userId, account);
  if (!auth) {
    return buildReconnectRequiredDirectoryResult(
      [],
      [],
      [],
      buildDirectoryReconnectMessage(account)
    );
  }

  try {
    // Use the People API directory (works for any Workspace member, no admin needed)
    const people = await withTimeout(
      listOrgDirectoryPeople(userId),
      DIRECTORY_REQUEST_TIMEOUT_MS,
      "Google Directory request"
    );
    const collections = mapDirectoryCollections(people);

    return {
      status: "ok",
      people,
      departments: collections.departments,
      costCenters: collections.costCenters,
      message: people.length > 0
        ? undefined
        : "No people found in your organization directory.",
    };
  } catch (err: any) {
    logger.error("Calendar guest directory lookup failed", {
      userId,
      error: err,
    });
    const summary = summarizeGoogleApiError(err);
    return {
      status: "reconnect_required",
      people: [],
      departments: [],
      costCenters: [],
      message: `Google Directory failed to load (${summary.statusCode ?? "unknown"}): ${summary.message}. ${buildDirectoryReconnectMessage(account, err)}`,
    };
  }
}
