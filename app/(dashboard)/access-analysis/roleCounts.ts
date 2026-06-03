import type { AccessInstance } from "./types";

export interface RoleSlice {
  name: string;
  value: number;
}

export interface RoleSummary {
  /** Unknown + "Multiple roles" + one entry per single role, sorted by count desc. */
  slices: RoleSlice[];
  /** Count of distinct role names across all memberships (the "how many roles" answer). */
  distinctRoles: number;
  /** Total number of (user, project) memberships. */
  total: number;
}

/** Label for memberships that carry no role at all. */
export const UNKNOWN_ROLE = "Unknown";
/** Single bucket collecting every membership that has more than one role. */
export const MULTIPLE_ROLES = "Multiple roles";

/**
 * Summarise role distribution across (user, project) memberships.
 *
 * Each membership lands in exactly one bucket: no role -> "Unknown", one role ->
 * that role, more than one role -> "Multiple roles" (so a long tail of one-off
 * role combinations never explodes the category count). Slice values therefore
 * sum to the membership total and donut percentages add to 100%.
 *
 * `distinctRoles` counts the unique role NAMES seen anywhere (including inside
 * multi-role memberships) — that is the honest answer to "how many roles do I
 * have", independent of how slices are grouped for display.
 */
export function summarizeRoles(rows: AccessInstance[]): RoleSummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  for (const row of rows) {
    const uniqueRoles = [...new Set(row.roles)];
    for (const r of uniqueRoles) distinct.add(r);
    const label =
      uniqueRoles.length === 0 ? UNKNOWN_ROLE
        : uniqueRoles.length === 1 ? uniqueRoles[0]
          : MULTIPLE_ROLES;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  return { slices, distinctRoles: distinct.size, total };
}
