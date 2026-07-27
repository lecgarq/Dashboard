/**
 * Flat row type for the /users DataTable and the derivation function that
 * produces it from raw OrgPerson + BulkAccUser data.
 *
 * Pure module — NO React, NO tRPC imports.
 */
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { OrgPerson } from "./useMergedAccUsers";
import { officeCodeFor, officeLabel as officeLabelFor } from "@/app/(dashboard)/access-analysis/projectGroups";
import { classifyAffiliation } from "./access-analysis/internalDomains";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Users with a lastActivity older than this many days are considered dormant. */
export const DORMANT_THRESHOLD_DAYS = 90;

const DORMANT_THRESHOLD_MS = DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// DirectoryRow type
// ---------------------------------------------------------------------------

export interface DirectoryRow {
  /** Stable TanStack row key (Google People resourceName or local user id). */
  resourceName: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  /** Cost center from the org directory — carried so Group-by can band on it. */
  costCenter: string | null;

  /** First of allRoles (null when the user has no ACC roles). */
  primaryRole: string | null;
  /** How many additional roles beyond the first (0 when only one role, or no roles). */
  extraRoleCount: number;

  /**
   * Office code derived from the MODE (most frequent) officeCodeFor() across the
   * user's project names. Null when the user has no project memberships.
   */
  officeCode: string | null;
  /** Human-readable office label (e.g. "Monterrey"). Null when officeCode is null. */
  officeLabel: string | null;

  /**
   * Maximum (latest) project.lastActivity ISO string across all of the user's
   * project memberships. Null when every project.lastActivity is null/absent.
   * NOTE: NEVER sourced from BulkAccUser.lastSignIn — per RESEARCH Pitfall 1.
   */
  lastActivity: string | null;

  /** Total project membership count (ALL statuses). */
  projectCount: number;

  /**
   * True only when lastActivity is non-null AND older than DORMANT_THRESHOLD_DAYS.
   * Users with lastActivity===null are "status unknown" — isDormant=false.
   */
  isDormant: boolean;

  /**
   * Company display name — DC firm affiliation (firmName) first, falling back
   * to the enrichment companyName (AccProjectMember). Null when neither is set.
   */
  company: string | null;

  /** True when the email domain is external (canonical internalDomains rule). */
  isExternal: boolean;

  /** The raw BulkAccUser record, or null when no match was found in accSummaryMap. */
  accUser: BulkAccUser | null;
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/**
 * Returns the mode (most frequent) string in an array.
 * On ties, the first element encountered wins (project order).
 */
function mode(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// buildDirectoryRows
// ---------------------------------------------------------------------------

/**
 * Convert a list of OrgPerson entries (from Google Directory / local DB fallback)
 * into flat DirectoryRow objects suitable for the DataTable.
 *
 * @param people   Ordered list from useMergedAccUsers / useOrgDirectoryPeople.
 * @param accSummaryMap  Map<email (lowercased), BulkAccUser> from the ACC snapshot.
 * @param lastActivityByEmail  Optional Map<email_lowercase, ISO string | null> from
 *   the accActivity.lastFileActivityByEmailAll query (G1 fix). When provided and the
 *   map HAS an entry for this user's email (even if null), that value is used as the
 *   authoritative lastActivity instead of project.lastActivity. When the map is
 *   provided but has NO entry for the email, falls back to project.lastActivity.
 *   When the param is absent entirely, original project.lastActivity-max behavior
 *   is preserved for backward compatibility.
 */
export function buildDirectoryRows(
  people: OrgPerson[],
  accSummaryMap: Map<string, BulkAccUser>,
  lastActivityByEmail?: Map<string, string | null>,
): DirectoryRow[] {
  const now = Date.now();

  return people.map((person) => {
    const accUser = accSummaryMap.get(person.email.toLowerCase()) ?? null;
    const emailKey = person.email.toLowerCase();

    // ── lastActivity ─────────────────────────────────────────────────────────
    // G1 fix: if lastActivityByEmail map is provided AND has an entry for this
    // email (existence check via .has() — the value may be null), use it as the
    // authoritative source. This replaces the always-null project.lastActivity
    // path for the /users directory view.
    // When the map is absent or has no entry, fall back to project.lastActivity-max.
    let lastActivity: string | null = null;
    if (lastActivityByEmail !== undefined && lastActivityByEmail.has(emailKey)) {
      // Authoritative: map entry wins (may be null = no file activity)
      lastActivity = lastActivityByEmail.get(emailKey) ?? null;
    } else if (accUser) {
      // Fallback: max over project.lastActivity (original behavior — NEVER lastSignIn)
      const validDates = accUser.projects
        .map((p) => p.lastActivity ?? null)
        .filter((d): d is string => d !== null && d !== undefined);
      if (validDates.length > 0) {
        // ISO strings sort lexicographically — pick the last (max) value.
        validDates.sort();
        lastActivity = validDates[validDates.length - 1];
      }
    }

    // ── isDormant ──────────────────────────────────────────────────────────
    let isDormant = false;
    if (lastActivity !== null) {
      const ageMs = now - new Date(lastActivity).getTime();
      isDormant = ageMs > DORMANT_THRESHOLD_MS;
    }

    // ── primaryRole / extraRoleCount ────────────────────────────────────────
    const allRoles = accUser?.allRoles ?? [];
    const primaryRole = allRoles[0] ?? null;
    const extraRoleCount = Math.max(0, allRoles.length - 1);

    // ── officeCode / officeLabel ─────────────────────────────────────────────
    // Derive from the MODE across project names — no mtyIds (name-token path).
    let officeCode: string | null = null;
    let officeLabel: string | null = null;
    if (accUser && accUser.projects.length > 0) {
      const codes = accUser.projects.map((p) =>
        officeCodeFor({ id: p.id, name: p.name }),
      );
      const modeCode = mode(codes);
      if (modeCode) {
        officeCode = modeCode;
        officeLabel = officeLabelFor(modeCode);
      }
    }

    // ── projectCount ─────────────────────────────────────────────────────────
    const projectCount = accUser?.projects.length ?? 0;

    return {
      resourceName: person.resourceName,
      email: person.email,
      displayName: person.displayName,
      photoUrl: person.photoUrl,
      jobTitle: person.jobTitle,
      department: person.department,
      costCenter: person.costCenter ?? null,
      primaryRole,
      extraRoleCount,
      officeCode,
      officeLabel,
      lastActivity,
      projectCount,
      isDormant,
      company: accUser?.firmName ?? accUser?.companyName ?? null,
      isExternal: classifyAffiliation(person.email) === "external",
      accUser,
    };
  });
}
