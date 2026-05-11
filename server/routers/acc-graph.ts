/**
 * accGraph tRPC router — Phase 5 Wave 5.1 (GRAPH-01 / GRAPH-04).
 *
 * Procedures:
 *  - perProjectRoleFacets: returns distinct role names + member counts for the
 *    per-project role filter sidebar group (GRAPH-01).
 *  - folderClusterNodes: (GRAPH-04, Phase 4 GO only) folder cluster data.
 *    Currently a placeholder — fleshed out in Task 4 if Phase 4 is GO.
 */

import { router, protectedProcedure } from "../trpc";

export const accGraphRouter = router({
  /**
   * GRAPH-01: Distinct per-project role names with member counts for the filter sidebar.
   * Excludes unassigned-default rows (memberId IS NULL — those are role definitions
   * without actual member assignments).
   */
  perProjectRoleFacets: protectedProcedure.query(async ({ ctx }) => {
    // Group by role name, count distinct members assigned
    const rows = await ctx.db.accProjectRole.findMany({
      where: { memberId: { not: null } },
      select: {
        role: { select: { name: true } },
        memberId: true,
      },
    });

    // Aggregate: role name -> set of member IDs
    const roleMap = new Map<string, Set<string>>();
    for (const row of rows) {
      const name = row.role.name;
      if (!roleMap.has(name)) roleMap.set(name, new Set());
      if (row.memberId) roleMap.get(name)!.add(row.memberId);
    }

    return Array.from(roleMap.entries())
      .map(([name, members]) => ({ name, memberCount: members.size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
});
