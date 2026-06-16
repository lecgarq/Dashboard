import type { RoleSlice, DrillPerson } from "./roleCounts";

export interface CompanySummary {
  /** Company -> membership count, desc; includes the "Unknown company" bucket. */
  slices: RoleSlice[];
  /** Count of distinct real company names (excludes "Unknown company"). */
  distinctCompanies: number;
  /** Total number of (user, project) memberships. */
  total: number;
  /** Company label -> the people in that bucket (merged across memberships), sorted by seat count desc. */
  usersByCompany: Map<string, DrillPerson[]>;
}

/** Bucket for memberships with no resolvable company name. */
export const UNKNOWN_COMPANY = "Unknown company";

/** A membership carries exactly one company; blank/null/undefined -> Unknown company. */
const labelFor = (company?: string | null): string => {
  const name = (company ?? "").trim();
  return name.length > 0 ? name : UNKNOWN_COMPANY;
};

/**
 * Summarise company distribution across (user, project) memberships. Each
 * membership lands in exactly one bucket — its company, or "Unknown company"
 * when none is recorded — so slice values sum to the membership total and donut
 * percentages add to 100%. `distinctCompanies` counts only real company names.
 */
export function summarizeCompanies(
  rows: ReadonlyArray<{ company?: string | null; name?: string; email?: string }>,
): CompanySummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged person), so one person spanning memberships collapses.
  const usersAgg = new Map<string, Map<string, DrillPerson>>();
  for (const row of rows) {
    const label = labelFor(row.company);
    if (label !== UNKNOWN_COMPANY) distinct.add(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);

    if (row.email) {
      const byEmail = usersAgg.get(label) ?? usersAgg.set(label, new Map()).get(label)!;
      const cur = byEmail.get(row.email);
      if (cur) cur.count += 1;
      else byEmail.set(row.email, { email: row.email, name: row.name ?? row.email, count: 1 });
    }
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  const usersByCompany = new Map<string, DrillPerson[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByCompany.set(
      label,
      [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    );
  }
  return { slices, distinctCompanies: distinct.size, total, usersByCompany };
}

/**
 * Reduce the slice list to the top `topN` companies plus a single
 * "Others (k companies)" bucket for the remainder. "Unknown company" is pinned
 * (a data-quality marker) and never folds into Others. Mirrors
 * `collapseToTopSlices` in roleCounts.ts but with a single pinned bucket.
 */
export function collapseCompanySlices(slices: RoleSlice[], topN: number): RoleSlice[] {
  const limit = Math.max(0, topN);
  const pinned = new Set<string>([UNKNOWN_COMPANY]);
  const special = slices.filter((s) => pinned.has(s.name));
  const singles = slices.filter((s) => !pinned.has(s.name)); // already sorted desc
  const kept = singles.slice(0, limit);
  const rest = singles.slice(limit);

  const result = [...special, ...kept];
  if (rest.length > 0) {
    const value = rest.reduce((sum, d) => sum + d.value, 0);
    const noun = rest.length === 1 ? "company" : "companies";
    result.push({ name: `Others (${rest.length} ${noun})`, value });
  }
  return result.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
