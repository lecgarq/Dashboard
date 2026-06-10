function normalizeEnvValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeEmail(value?: string | null) {
  return normalizeEnvValue(value)?.toLowerCase();
}

function parseEmailList(value?: string | null) {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((entry) => normalizeEmail(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
}

export function getAuthUrl() {
  return normalizeEnvValue(process.env.AUTH_URL) ??
    normalizeEnvValue(process.env.NEXTAUTH_URL);
}

export function getAuthSecret() {
  return normalizeEnvValue(process.env.AUTH_SECRET) ??
    normalizeEnvValue(process.env.NEXTAUTH_SECRET);
}

export function getConfiguredAuthOrigins() {
  return Array.from(
    new Set(
      [getAuthUrl(), normalizeEnvValue(process.env.NEXTAUTH_URL)]
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          try {
            return new URL(value).origin.toLowerCase();
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function getConfiguredAuthHosts() {
  return getConfiguredAuthOrigins().map((origin) => new URL(origin).host);
}

export function getConfiguredAuthHostnames() {
  return getConfiguredAuthOrigins().map((origin) => new URL(origin).hostname);
}

export function getPrimaryAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL) ?? "luis.cortes@hermosillo.com";
}

function getAdminEmailAliases() {
  const primary = getPrimaryAdminEmail();
  return parseEmailList(process.env.ADMIN_EMAIL_ALIAS).filter((email) => email !== primary);
}

export function isPrimaryAdminEmail(email?: string | null) {
  return normalizeEmail(email) === getPrimaryAdminEmail();
}

function isAdminIdentityEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  return normalized === getPrimaryAdminEmail() || getAdminEmailAliases().includes(normalized);
}

export function getCanonicalAdminEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;

  return isAdminIdentityEmail(normalized) ? getPrimaryAdminEmail() : normalized;
}
