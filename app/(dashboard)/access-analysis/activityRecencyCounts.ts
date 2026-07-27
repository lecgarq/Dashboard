import { differenceInDays, parseISO, isValid } from "date-fns";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "./roleCounts";

/**
 * Locked activity-recency bands (ENG-01 semantic pivot, 20.1-CONTEXT.md) — order
 * matters, this is the exact bar order the chart renders. "Never active" is the
 * explicit, never-dropped null bucket: it is EXPECTED to be the largest bucket
 * (20.1-RESEARCH.md §2 — only ~33.2% of DC memberships have any accds activity),
 * and that is real, not a bug.
 */
export const ACTIVITY_RECENCY_BANDS = ["<30d", "30–90d", "90–365d", ">365d", "Never active"] as const;
export type ActivityRecencyBand = (typeof ACTIVITY_RECENCY_BANDS)[number];

/**
 * Buckets a serialized `lastActivityAt` into one of the 5 locked bands. Mirrors
 * `bucketSignInRecency`'s exact defensive parsing and day boundaries: <30d=[0,29],
 * 30-90d=[30,90], 90-365d=[91,365], >365d=[366+]. null/invalid -> "Never active".
 * `nowMs` is an explicit param for deterministic tests.
 */
export function bucketActivityRecency(lastActivityAt: string | null | undefined, nowMs: number): ActivityRecencyBand {
  if (lastActivityAt == null) return "Never active";

  let parsed: Date;
  try {
    parsed = parseISO(lastActivityAt);
  } catch {
    return "Never active";
  }
  if (!isValid(parsed)) return "Never active";

  const days = differenceInDays(nowMs, parsed);
  if (Number.isNaN(days)) return "Never active";

  if (days < 30) return "<30d";
  if (days <= 90) return "30–90d";
  if (days <= 365) return "90–365d";
  return ">365d";
}

/**
 * Attributes a membership's resolved role names to a single label: 0 roles ->
 * UNKNOWN_ROLE, 1 -> that role, 2+ -> MULTIPLE_ROLES. Exactly the
 * `summarizeActivityByRole` rule in roleActivityCounts.ts, so this panel's role
 * attribution stays comparable with the other role-bucketed panels.
 */
export function attributeRole(roles: string[]): string {
  const unique = [...new Set(roles)];
  if (unique.length === 0) return UNKNOWN_ROLE;
  if (unique.length === 1) return unique[0];
  return MULTIPLE_ROLES;
}

interface ActivityRecencyDrillPerson {
  name: string;
  company: string;
  role: string;
  lastActivityAt: string | null;
}

export interface ActivityRecencySummary {
  /** All 5 bands, locked order, zeros kept. */
  bands: { band: ActivityRecencyBand; count: number }[];
  /** Top-8 attributed roles by total membership count desc, + "Other roles" when more exist. */
  roleNames: string[];
  /** Attributed role name -> counts per band, in ACTIVITY_RECENCY_BANDS order. */
  countsByRole: Map<string, number[]>;
  /** Drill rows per band, sorted most-dormant first (oldest activity at top). */
  usersByBand: Map<ActivityRecencyBand, ActivityRecencyDrillPerson[]>;
  total: number;
}

const TOP_ROLE_LIMIT = 8;
const OTHER_ROLES_LABEL = "Other roles";

/**
 * Buckets + summarizes rows into the 5 locked bands, grouped by attributed role
 * for the role-stacked chart. Every band is always present (count 0 when empty).
 * LOSSLESS INVARIANT: sum of all band counts === rows.length AND sum over
 * countsByRole === rows.length.
 */
export function summarizeActivityRecencyByRole(rows: ActivityRecencyRow[], nowMs: number): ActivityRecencySummary {
  const bandCounts = new Map<ActivityRecencyBand, number>(ACTIVITY_RECENCY_BANDS.map((b) => [b, 0]));
  const usersByBand = new Map<ActivityRecencyBand, ActivityRecencyDrillPerson[]>(
    ACTIVITY_RECENCY_BANDS.map((b) => [b, []]),
  );

  // First pass: bucket each row once, compute per-role membership totals to pick top-8.
  const bucketed: { row: ActivityRecencyRow; band: ActivityRecencyBand; role: string }[] = [];
  const roleTotals = new Map<string, number>();

  for (const row of rows) {
    const band = bucketActivityRecency(row.lastActivityAt, nowMs);
    const role = attributeRole(row.roles);
    bucketed.push({ row, band, role });

    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    usersByBand.get(band)!.push({ name: row.name, company: row.company, role, lastActivityAt: row.lastActivityAt });
    roleTotals.set(role, (roleTotals.get(role) ?? 0) + 1);
  }

  // Sort each dated band's drill list oldest-first; "Never active" keeps input order.
  for (const band of ACTIVITY_RECENCY_BANDS) {
    if (band === "Never active") continue;
    const list = usersByBand.get(band)!;
    list.sort((a, b) => {
      const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return ta - tb;
    });
  }

  // Top-8 attributed roles by total membership count desc, + trailing "Other roles"
  // aggregate when more exist (so the stack legend stays readable).
  const sortedRoles = [...roleTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topRoles = sortedRoles.slice(0, TOP_ROLE_LIMIT).map(([name]) => name);
  const overflowRoles = new Set(sortedRoles.slice(TOP_ROLE_LIMIT).map(([name]) => name));
  const roleNames = overflowRoles.size > 0 ? [...topRoles, OTHER_ROLES_LABEL] : topRoles;

  const countsByRole = new Map<string, number[]>(roleNames.map((r) => [r, ACTIVITY_RECENCY_BANDS.map(() => 0)]));
  const bandIndex = new Map(ACTIVITY_RECENCY_BANDS.map((b, i) => [b, i]));

  for (const { band, role } of bucketed) {
    const label = overflowRoles.has(role) ? OTHER_ROLES_LABEL : role;
    const counts = countsByRole.get(label);
    if (!counts) continue; // defensive; every role is either topRoles or folded into Other
    counts[bandIndex.get(band)!] += 1;
  }

  return {
    bands: ACTIVITY_RECENCY_BANDS.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
    roleNames,
    countsByRole,
    usersByBand,
    total: rows.length,
  };
}
