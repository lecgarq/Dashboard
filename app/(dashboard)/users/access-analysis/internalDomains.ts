/**
 * internalDomains.ts — Single source of truth for internal/external/unknown
 * classification of a user by email domain.
 *
 * Canonical rule (P1):
 *   - Internal = valid email whose domain is `hermosillo.com` or a subdomain
 *     ending in `.hermosillo.com`.
 *   - External = valid email whose domain is anything else.
 *   - Unknown  = null / empty / malformed / no valid domain (NEVER auto-external).
 *
 * Replaces two legacy `lecg.com` sites that mislabeled every user:
 *   - featureSnapshot.ts  (hardcoded `LIKE '%@lecg.com'` SQL CASE)
 *   - dataLayer.ts        (`INTERNAL_DOMAINS = new Set(["lecg.com"])`)
 *
 * Backed by data discovery (2026-05-22): `@lecg.com` matched 0 / 3,367 users;
 * `hermosillo.com` is the real internal domain (1,265 users).
 *
 * Classification is by EMAIL DOMAIN ONLY in P1 — firmName/company is intentionally
 * not consulted. Pure module: no I/O, deterministic.
 */

/** Configurable internal-domain allowlist. Default canonical domain: hermosillo.com. */
export const INTERNAL_DOMAINS: readonly string[] = ["hermosillo.com"];

export type Affiliation = "internal" | "external" | "unknown";

/**
 * Extract a normalized, valid domain from an email, or null when the email is
 * missing/malformed. A "valid domain" has exactly one `@`, a non-empty local
 * part, and a dotted domain with no empty labels.
 */
function extractValidDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed === "") return null;

  const at = trimmed.indexOf("@");
  // at <= 0 covers both "no @" ("bademail") and empty local part ("@domain.com").
  if (at <= 0) return null;
  // Reject more than one "@".
  if (trimmed.indexOf("@", at + 1) !== -1) return null;

  const domain = trimmed.slice(at + 1);
  if (domain === "") return null; // "user@"
  // Require a dotted domain with non-empty labels (rejects "user@localhost", "a..b").
  if (!domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;
  if (domain.split(".").some((label) => label === "")) return null;

  return domain;
}

/** Classify a user's affiliation from their email domain. */
export function classifyAffiliation(email: string | null | undefined): Affiliation {
  const domain = extractValidDomain(email);
  if (domain === null) return "unknown";

  for (const allowed of INTERNAL_DOMAINS) {
    const d = allowed.toLowerCase();
    if (domain === d || domain.endsWith(`.${d}`)) return "internal";
  }
  return "external";
}

/** Convenience predicate: true only when the email resolves to an internal domain. */
export function isInternalEmail(email: string | null | undefined): boolean {
  return classifyAffiliation(email) === "internal";
}
