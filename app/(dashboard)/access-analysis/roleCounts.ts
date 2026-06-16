/** One contributing person within a drilled slice. Shared by every people-donut. */
export interface DrillPerson {
  email: string;
  name: string;
  count: number;
}

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
  /** Slice label -> the people in that bucket (merged across memberships), sorted by seat count desc. */
  usersByRole: Map<string, DrillPerson[]>;
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
export function summarizeRoles(
  rows: ReadonlyArray<{ roles: string[]; name?: string; email?: string }>,
): RoleSummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged person), so one person spanning memberships collapses.
  const usersAgg = new Map<string, Map<string, DrillPerson>>();
  for (const row of rows) {
    const uniqueRoles = [...new Set(row.roles)];
    for (const r of uniqueRoles) distinct.add(r);
    const label =
      uniqueRoles.length === 0 ? UNKNOWN_ROLE
        : uniqueRoles.length === 1 ? uniqueRoles[0]
          : MULTIPLE_ROLES;
    counts.set(label, (counts.get(label) ?? 0) + 1);

    // Attribute the seat to its person. No email -> not attributable, so it stays
    // out of the drill list (slice value still counts the membership).
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

  const usersByRole = new Map<string, DrillPerson[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByRole.set(
      label,
      [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    );
  }
  return { slices, distinctRoles: distinct.size, total, usersByRole };
}

/**
 * Reduce the slice list to the top `topN` individual roles plus a single
 * "Others (k roles)" bucket for the remainder. "Unknown" and "Multiple roles"
 * are pinned — they are data-quality warnings and never fold into Others.
 * Used when the donut is collapsed; the UI can pass the full list instead to
 * "expand" everything. Sorted by count desc.
 */
export function collapseToTopSlices(slices: RoleSlice[], topN: number): RoleSlice[] {
  const limit = Math.max(0, topN);
  const pinned = new Set<string>([UNKNOWN_ROLE, MULTIPLE_ROLES]);
  const special = slices.filter((s) => pinned.has(s.name));
  const singles = slices.filter((s) => !pinned.has(s.name)); // already sorted desc
  const kept = singles.slice(0, limit);
  const rest = singles.slice(limit);

  const result = [...special, ...kept];
  if (rest.length > 0) {
    const value = rest.reduce((sum, d) => sum + d.value, 0);
    const noun = rest.length === 1 ? "role" : "roles";
    result.push({ name: `Others (${rest.length} ${noun})`, value });
  }
  return result.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
