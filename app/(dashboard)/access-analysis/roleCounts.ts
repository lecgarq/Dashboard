import type { AccessInstance } from "./types";

export interface RoleSlice {
  name: string;
  value: number;
}

/** Label used for memberships that carry no role at all. */
export const UNKNOWN_ROLE = "Unknown";

/** Separator joining the roles of a multi-role membership into one slice label. */
const COMBINED_SEP = " + ";

/**
 * Bucket every (user, project) membership into exactly one slice and count them.
 *
 * Each membership lands in a single bucket based on the roles on THAT membership:
 *   - no role          -> "Unknown"
 *   - exactly one role -> that role's name
 *   - multiple roles   -> the alphabetised combination ("Admin + Member"),
 *                         treated as its own specific slice
 *
 * Because each membership counts once, the slice values sum to the total number
 * of memberships and the donut's percentages add to 100%. Sorted by count
 * descending, ties broken by name for deterministic output.
 */
export function roleBuckets(rows: AccessInstance[]): RoleSlice[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const uniqueRoles = [...new Set(row.roles)];
    const label =
      uniqueRoles.length === 0
        ? UNKNOWN_ROLE
        : uniqueRoles.sort((a, b) => a.localeCompare(b)).join(COMBINED_SEP);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
