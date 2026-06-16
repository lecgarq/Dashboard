import type { RoleSlice } from "./roleCounts";

export interface CompanySummary {
  /** Company -> membership count, desc; includes the "Unknown company" bucket. */
  slices: RoleSlice[];
  /** Count of distinct real company names (excludes "Unknown company"). */
  distinctCompanies: number;
  /** Total number of (user, project) memberships. */
  total: number;
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
  rows: ReadonlyArray<{ company?: string | null }>,
): CompanySummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  for (const row of rows) {
    const label = labelFor(row.company);
    if (label !== UNKNOWN_COMPANY) distinct.add(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  return { slices, distinctCompanies: distinct.size, total };
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
