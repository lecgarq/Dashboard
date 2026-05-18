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

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { windowToDateRange } from "@/lib/acc/timelineBucketing";

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

  /**
   * Phase 09 LIST-04: lazy per-user products fetch for the side-panel
   * Module Access section.
   *
   * Returns one row per (active) project the user is a member of, carrying the
   * raw `products` JSON straight from `AccProjectMember`. The client side
   * uses `parseProductsJson()` (lib/acc/productsTierMap.ts) to convert each
   * row into `ProductTier[]` — keeping the parse/validation logic in one place
   * and matching the LIST-04 lock (no raw JSON rendering, unknown modules surfaced).
   *
   * Filter to `project.status === "active"` per the soft-delete contract (PROJ-02);
   * deleted projects must not pollute Module Access. NEVER promote this onto
   * `BulkAccUser`/`enrichedUsers` (RESEARCH Anti-Pattern — products payload can be
   * ~projectCount × 1KB per row).
   */
  getProductsForUser: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const rows = await ctx.db.accProjectMember.findMany({
        where: { email, project: { status: "active" } },
        select: {
          products: true,
          project: { select: { id: true, name: true } },
        },
      });
      return rows.map((r) => ({
        projectId: r.project.id,
        projectName: r.project.name,
        products: r.products,
      }));
    }),

  /**
   * KPI strip data: members, access changes, active admins, stale members.
   * Returns absolute values + deltas vs the prior equivalent window.
   * Active-admins and stale-members deltas ship as 0 (no historical snapshots yet).
   */
  getKpiSummary: protectedProcedure
    .input(z.object({ window: z.enum(["30d", "90d", "1y", "all"]) }))
    .query(async ({ ctx, input }) => {
      const range = windowToDateRange(input.window);
      const priorRange = {
        start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime())),
        end: range.start,
      };

      const members = await ctx.db.accMemberCache.count();
      const membersAtStart = await ctx.db.accMemberCache.count({
        where: { createdAt: { lte: range.start } },
      });

      const accessChanges = await ctx.db.accActivity.count({
        where: { createdAt: { gte: range.start, lte: range.end } },
      });
      const priorAccessChanges = await ctx.db.accActivity.count({
        where: { createdAt: { gte: priorRange.start, lte: priorRange.end } },
      });

      const adminRows = await ctx.db.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(DISTINCT email)::int AS count FROM "AccMemberCache" WHERE (data->>'projectAdmin')::boolean = true OR (data->>'accountAdmin')::boolean = true`,
      );
      const activeAdmins = adminRows[0]?.count ?? 0;

      const staleRows = await ctx.db.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM "AccMemberCache" mc WHERE NOT EXISTS (SELECT 1 FROM "AccActivity" a WHERE LOWER(a."userEmail") = LOWER(mc.email) AND a."createdAt" >= $1 AND a."createdAt" <= $2)`,
        range.start,
        range.end,
      );
      const staleMembers = staleRows[0]?.count ?? 0;

      const earliest = await ctx.db.accActivity.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      return {
        members: { value: members, delta: members - membersAtStart },
        accessChanges: { value: accessChanges, delta: accessChanges - priorAccessChanges },
        activeAdmins: { value: activeAdmins, delta: 0 },
        staleMembers: { value: staleMembers, delta: 0 },
        dataEarliestEvent: earliest?.createdAt.toISOString() ?? null,
      };
    }),
});
