/**
 * accMembers tRPC router — Phase 5 Wave 5.1 data bridge (GRAPH-01..04).
 *
 * Provides `enrichedUsers`: per-email aggregation of v2.0 AccProjectMember fields
 * (status, projectAdmin, executive, companyName, perProjectRoleNames) sourced from
 * the normalised AccProjectMember table.
 *
 * IMPORTANT: This is ADDITIVE. It does NOT replace or modify bulkAccSummary. The
 * DashboardClient runs both queries in parallel and merges on email. All returned
 * fields are optional on BulkAccUser so no existing consumer is broken.
 *
 * Note on isAccountAdmin: AccProjectMember does NOT carry isAccountAdmin (that field
 * lives in AccMemberCache / BulkAccUser, populated by the HQ v1 sync). The
 * enrichedUsers procedure omits isAccountAdmin — consumers read it from BulkAccUser
 * (already non-optional there since Plan 02-04).
 */

import { router, protectedProcedure } from "../trpc";

type RawMember = {
  email: string;
  status: string;
  projectAdmin: boolean;
  executive: boolean;
  companyName: string | null;
  project: { id: string; name: string };
  projectRoles: { role: { name: string } }[];
};

export interface EnrichedUser {
  email: string;
  /** "active" if ANY project has status active, else "pending" if any pending, else "deleted" */
  aggregatedStatus: "active" | "pending" | "deleted";
  /** true if projectAdmin on ANY project */
  projectAdmin: boolean;
  /** true if executive on ANY project */
  executive: boolean;
  companyName: string | null;
  /** Distinct role names across all active projects this user belongs to */
  perProjectRoleNames: string[];
  /** Per-project breakdown for cross-referencing */
  perProjectStatuses: {
    projectId: string;
    projectName: string;
    status: string;
    projectAdmin: boolean;
  }[];
}

function aggregateByEmail(members: RawMember[]): EnrichedUser[] {
  const map = new Map<
    string,
    {
      statuses: string[];
      projectAdmin: boolean;
      executive: boolean;
      companyName: string | null;
      roleNames: Set<string>;
      perProject: { projectId: string; projectName: string; status: string; projectAdmin: boolean }[];
    }
  >();

  for (const m of members) {
    const key = m.email.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        statuses: [],
        projectAdmin: false,
        executive: false,
        companyName: m.companyName,
        roleNames: new Set(),
        perProject: [],
      };
      map.set(key, entry);
    }
    entry.statuses.push(m.status);
    if (m.projectAdmin) entry.projectAdmin = true;
    if (m.executive) entry.executive = true;
    if (!entry.companyName && m.companyName) entry.companyName = m.companyName;
    for (const pr of m.projectRoles) entry.roleNames.add(pr.role.name);
    entry.perProject.push({
      projectId: m.project.id,
      projectName: m.project.name,
      status: m.status,
      projectAdmin: m.projectAdmin,
    });
  }

  const results: EnrichedUser[] = [];
  for (const [email, entry] of map.entries()) {
    let aggregatedStatus: "active" | "pending" | "deleted" = "deleted";
    if (entry.statuses.includes("active")) aggregatedStatus = "active";
    else if (entry.statuses.includes("pending")) aggregatedStatus = "pending";

    results.push({
      email,
      aggregatedStatus,
      projectAdmin: entry.projectAdmin,
      executive: entry.executive,
      companyName: entry.companyName,
      perProjectRoleNames: Array.from(entry.roleNames).sort(),
      perProjectStatuses: entry.perProject,
    });
  }
  return results;
}

export const accMembersRouter = router({
  /**
   * GRAPH-01 / GRAPH-03 data bridge: per-email aggregated v2.0 fields from AccProjectMember.
   * Returns empty array (not null) when no members are synced yet.
   * Consumer staleTime: 5 * 60 * 1000 (5 minutes).
   */
  enrichedUsers: protectedProcedure.query(async ({ ctx }) => {
    const members = await ctx.db.accProjectMember.findMany({
      where: { project: { status: "active" } },
      select: {
        email: true,
        status: true,
        projectAdmin: true,
        executive: true,
        companyName: true,
        project: { select: { id: true, name: true } },
        projectRoles: { select: { role: { select: { name: true } } } },
      },
    });
    return aggregateByEmail(members);
  }),
});
