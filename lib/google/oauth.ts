const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const GMAIL_SCOPE = "https://mail.google.com/";

const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
  GOOGLE_DRIVE_SCOPE,
  GMAIL_SCOPE,
] as const;

export const GOOGLE_DRIVE_REQUIRED_SCOPES = [GOOGLE_DRIVE_SCOPE] as const;

const GOOGLE_CHAT_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/chat.memberships.readonly",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
] as const;

export const GOOGLE_CHAT_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/chat.memberships.readonly",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
] as const;

export const googleAuthScopeString = GOOGLE_OAUTH_SCOPES.join(" ");
export const googleChatAuthScopeString = GOOGLE_CHAT_OAUTH_SCOPES.join(" ");

export interface GoogleApiErrorSummary {
  statusCode: number | null;
  reasons: string[];
  message: string;
}

function getFirstConfiguredEnvVar(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getGoogleChatClientId() {
  return getFirstConfiguredEnvVar([
    "GOOGLE_CHAT_CLIENT_ID",
    "GOOGLE_CLOUD_CLIENT-ID",
    "GOOGLE_CLIENT_ID",
  ]);
}

export function getGoogleChatClientSecret() {
  return getFirstConfiguredEnvVar([
    "GOOGLE_CHAT_CLIENT_SECRET",
    "GOOGLE_CLOUD-CLIENT-SECRET",
    "GOOGLE_CLIENT_SECRET",
  ]);
}

function parseGoogleScopeString(scope?: string | null) {
  return new Set(
    (scope ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStatusCode(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getNestedErrorItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeGoogleApiReason(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function summarizeGoogleApiError(error: unknown): GoogleApiErrorSummary {
  const errorRecord = isRecord(error) ? error : {};
  const response = isRecord(errorRecord.response) ? errorRecord.response : {};
  const data = isRecord(response.data) ? response.data : {};
  const apiError = isRecord(data.error) ? data.error : {};
  const nestedErrorItems = [
    ...getNestedErrorItems(apiError.errors),
    ...getNestedErrorItems(errorRecord.errors),
  ];

  const reasons = Array.from(
    new Set(
      nestedErrorItems
        .map((item) => normalizeGoogleApiReason(item.reason))
        .filter((value): value is string => Boolean(value))
    )
  );

  const message =
    [apiError.message, errorRecord.message].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    )?.trim() ?? "Unknown Google API error";

  return {
    statusCode: toStatusCode(response.status ?? errorRecord.code),
    reasons,
    message,
  };
}

export function hasGoogleApiReason(summary: GoogleApiErrorSummary, ...reasons: string[]) {
  const normalizedReasons = new Set(summary.reasons.map((reason) => reason.toLowerCase()));
  return reasons.some((reason) => normalizedReasons.has(reason.toLowerCase()));
}

export function googleApiErrorMessageIncludes(
  summary: GoogleApiErrorSummary,
  ...fragments: string[]
) {
  const normalizedMessage = summary.message.toLowerCase();
  return fragments.some((fragment) => normalizedMessage.includes(fragment.toLowerCase()));
}

export function getMissingGoogleScopes(
  scope: string | null | undefined,
  requiredScopes: readonly string[] = GOOGLE_CHAT_REQUIRED_SCOPES
) {
  const grantedScopes = parseGoogleScopeString(scope);
  return requiredScopes.filter((requiredScope) => !grantedScopes.has(requiredScope));
}
