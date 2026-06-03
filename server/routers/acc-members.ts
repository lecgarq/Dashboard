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
import { analyzeGovernanceCompliance, type ComplianceSummary } from "@/lib/acc/governanceCompliance";
import { analyzeDeepFindings, combineComplianceFindings } from "@/lib/acc/deepFindings";
import { getCachedAccMembersEnrichedUsers } from "@/lib/server/acc-hot-cache";

// In-memory 15-minute cache for the combined compliance report. The deep findings
// run ~10 heavy queries over ~1M permission rows, so we compute at most once per
// window. `next start` is a single long-running process, so module scope is shared
// across requests; a server restart simply recomputes on next call.
const COMPLIANCE_TTL_MS = 15 * 60_000;
let complianceCache: { at: number; data: ComplianceSummary } | null = null;

async function getCachedComplianceReport(db: unknown): Promise<ComplianceSummary> {
  if (complianceCache && Date.now() - complianceCache.at < COMPLIANCE_TTL_MS) {
    return complianceCache.data;
  }
  const base = await analyzeGovernanceCompliance(db);
  const deep = await analyzeDeepFindings(db);
  const data = combineComplianceFindings(base, deep);
  complianceCache = { at: Date.now(), data };
  return data;
}

type RawMember = {
  email: string;
  status: string;
  projectAdmin: boolean;
  executive: boolean;
  companyName: string | null;
  project: { id: string; name: string };
  roles: { role: { name: string } }[];
};

type DcUserRow = {
  id: string;
  email: string | null;
  status: string | null;
  companyId: string | null;
};

type DcProjectUserRow = {
  projectId: string;
  userId: string;
  status: string | null;
};

type DcProjectUserRoleRow = {
  projectId: string;
  userId: string;
  roleId: string;
};

type DcProjectUserProductRow = {
  projectId: string;
  userId: string;
  productKey: string;
  accessLevel: string;
};

type DcProjectUserCompanyRow = {
  projectId: string;
  userId: string;
  companyId: string;
};

type DcProjectRow = {
  id: string;
  name: string;
  status: string | null;
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

function aggregateStatus(statuses: string[]): "active" | "pending" | "deleted" {
  if (statuses.includes("active")) return "active";
  if (statuses.includes("pending")) return "pending";
  return "deleted";
}

function normalizeMemberStatus(status: string | null | undefined): "active" | "pending" | "deleted" {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active" || normalized === "pending" || normalized === "deleted") return normalized;
  return "deleted";
}

function isActiveProjectStatus(status: string | null | undefined): boolean {
  return !status || status.toLowerCase() === "active";
}

function pickDominantCompanyName(
  companyCounts: Map<string, number>,
  companyById: Map<string, string>,
): string | null {
  const ranked = [...companyCounts.entries()]
    .filter(([companyId]) => companyById.has(companyId))
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) return countDelta;
      return (companyById.get(a[0]) ?? a[0]).localeCompare(companyById.get(b[0]) ?? b[0]);
    });
  const companyId = ranked[0]?.[0];
  return companyId ? companyById.get(companyId) ?? null : null;
}

function dcAccessLevelToProductTier(accessLevel: string): "administrator" | "member" | string {
  if (accessLevel === "project_admin") return "administrator";
  if (accessLevel === "project_user") return "member";
  return accessLevel;
}

function mergeProductTier(existing: unknown, next: string) {
  if (existing === "administrator" || next === "administrator") return "administrator";
  if (existing === "member" || next === "member") return "member";
  return next;
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
    for (const pr of m.roles) entry.roleNames.add(pr.role.name);
    entry.perProject.push({
      projectId: m.project.id,
      projectName: m.project.name,
      status: m.status,
      projectAdmin: m.projectAdmin,
    });
  }

  const results: EnrichedUser[] = [];
  for (const [email, entry] of map.entries()) {
    results.push({
      email,
      aggregatedStatus: aggregateStatus(entry.statuses),
      projectAdmin: entry.projectAdmin,
      executive: entry.executive,
      companyName: entry.companyName,
      perProjectRoleNames: Array.from(entry.roleNames).sort(),
      perProjectStatuses: entry.perProject,
    });
  }
  return results;
}

async function aggregateDcEnrichedUsers(db: any): Promise<EnrichedUser[]> {
  const [
    users,
    projectUsers,
    projectUserRoles,
    projectUserProducts,
    projectUserCompanies,
    companies,
    roles,
    projects,
  ] =
    await Promise.all([
      db.accDcUser.findMany({
        select: { id: true, email: true, status: true, companyId: true },
      }),
      db.accDcProjectUser.findMany({
        select: { projectId: true, userId: true, status: true },
      }),
      db.accDcProjectUserRole.findMany({
        select: { projectId: true, userId: true, roleId: true },
      }),
      db.accDcProjectUserProduct.findMany({
        select: { projectId: true, userId: true, productKey: true, accessLevel: true },
      }),
      db.accDcProjectUserCompany.findMany({
        select: { projectId: true, userId: true, companyId: true },
      }),
      db.accDcCompany.findMany({
        select: { id: true, name: true },
      }),
      // AccDcProjectUserRole.roleId joins AccRole.id in the current dataset.
      db.accRole.findMany({
        select: { id: true, name: true },
      }),
      db.accDcProject.findMany({
        select: { id: true, name: true, status: true },
      }),
    ]);

  const userById = new Map((users as DcUserRow[]).map((u) => [u.id, u]));
  const companyById = new Map((companies as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const roleNameById = new Map((roles as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const projectById = new Map((projects as DcProjectRow[]).map((p) => [p.id, p]));

  const rolesByUserProject = new Map<string, Set<string>>();
  for (const role of projectUserRoles as DcProjectUserRoleRow[]) {
    const key = `${role.userId}::${role.projectId}`;
    const set = rolesByUserProject.get(key) ?? new Set<string>();
    set.add(roleNameById.get(role.roleId) ?? role.roleId);
    rolesByUserProject.set(key, set);
  }

  const adminByUserProject = new Set<string>();
  for (const product of projectUserProducts as DcProjectUserProductRow[]) {
    if (product.accessLevel === "project_admin") {
      adminByUserProject.add(`${product.userId}::${product.projectId}`);
    }
  }

  const companyIdByUserProject = new Map<string, string>();
  for (const company of projectUserCompanies as DcProjectUserCompanyRow[]) {
    companyIdByUserProject.set(`${company.userId}::${company.projectId}`, company.companyId);
  }

  const map = new Map<
    string,
    {
      statuses: string[];
      projectAdmin: boolean;
      companyName: string | null;
      companyCounts: Map<string, number>;
      roleNames: Set<string>;
      perProject: { projectId: string; projectName: string; status: string; projectAdmin: boolean }[];
    }
  >();

  for (const membership of projectUsers as DcProjectUserRow[]) {
    const user = userById.get(membership.userId);
    if (!user) continue;
    const email = user.email?.toLowerCase();
    if (!email) continue;

    const project = projectById.get(membership.projectId);
    if (project && !isActiveProjectStatus(project.status)) continue;

    let entry = map.get(email);
    if (!entry) {
      entry = {
        statuses: [],
        projectAdmin: false,
        companyName: user.companyId ? (companyById.get(user.companyId) ?? null) : null,
        companyCounts: new Map(),
        roleNames: new Set(),
        perProject: [],
      };
      map.set(email, entry);
    }

    if (!entry.companyName && user.companyId) {
      entry.companyName = companyById.get(user.companyId) ?? null;
    }

    const projectKey = `${membership.userId}::${membership.projectId}`;
    const companyId = user.companyId ?? companyIdByUserProject.get(projectKey);
    if (companyId) {
      entry.companyCounts.set(companyId, (entry.companyCounts.get(companyId) ?? 0) + 1);
    }

    const status = normalizeMemberStatus(membership.status ?? user.status ?? project?.status);
    const projectAdmin = adminByUserProject.has(projectKey);
    entry.statuses.push(status);
    if (projectAdmin) entry.projectAdmin = true;

    for (const roleName of rolesByUserProject.get(projectKey) ?? []) {
      entry.roleNames.add(roleName);
    }

    entry.perProject.push({
      projectId: membership.projectId,
      projectName: project?.name ?? membership.projectId,
      status,
      projectAdmin,
    });
  }

  return [...map.entries()]
    .map(([email, entry]) => ({
      email,
      aggregatedStatus: aggregateStatus(entry.statuses),
      projectAdmin: entry.projectAdmin,
      executive: false,
      companyName: entry.companyName ?? pickDominantCompanyName(entry.companyCounts, companyById),
      perProjectRoleNames: [...entry.roleNames].sort(),
      perProjectStatuses: entry.perProject.sort((a, b) =>
        a.projectName.localeCompare(b.projectName) || a.projectId.localeCompare(b.projectId),
      ),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

type KpiSourceStats = {
  members: number;
  membersAtStart: number;
  activeAdmins: number;
  staleMembers: number;
};

async function getDcKpiSourceStats(
  db: any,
  range: { start: Date; end: Date },
  window: "30d" | "90d" | "1y" | "all",
): Promise<KpiSourceStats | null> {
  if (!db.accDcUser?.findMany) return null;

  const dcUsers = await db.accDcUser.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, status: true },
  });
  const emailSet = new Set<string>();
  const activeUserIds = new Set<string>();
  for (const user of dcUsers as Array<{ id: string; email: string | null; status: string | null }>) {
    const email = user.email?.toLowerCase();
    if (email) emailSet.add(email);
    if (user.status?.toLowerCase() === "active") activeUserIds.add(user.id);
  }
  if (emailSet.size === 0) return null;

  const [adminRows, activeEmailRows] = await Promise.all([
    db.accDcProjectUserProduct.groupBy({
      by: ["userId"],
      where: { accessLevel: "project_admin" },
      _count: { userId: true },
    }),
    db.accActivity.groupBy({
      by: ["userEmail"],
      where: {
        userEmail: { in: [...emailSet] },
        createdAt: { gte: range.start, lte: range.end },
      },
      _count: { _all: true },
    }),
  ]);

  const activeEmails = new Set<string>();
  for (const row of activeEmailRows as Array<{ userEmail: string | null }>) {
    const email = row.userEmail?.toLowerCase();
    if (email) activeEmails.add(email);
  }

  return {
    members: emailSet.size,
    membersAtStart: window === "all" ? 0 : emailSet.size,
    activeAdmins: (adminRows as Array<{ userId: string }>).filter((row) => activeUserIds.has(row.userId)).length,
    staleMembers: Math.max(0, emailSet.size - activeEmails.size),
  };
}

async function getLegacyKpiSourceStats(
  db: any,
  range: { start: Date; end: Date },
): Promise<KpiSourceStats> {
  const members = await db.accMemberCache.count();
  const membersAtStart = await db.accMemberCache.count({
    where: { createdAt: { lte: range.start } },
  });

  const adminRows = (await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT email)::int AS count FROM "AccMemberCache" WHERE (data->>'projectAdmin')::boolean = true OR (data->>'accountAdmin')::boolean = true`,
  )) as { count: number }[];
  const activeAdmins = adminRows[0]?.count ?? 0;

  const staleRows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "AccMemberCache" mc WHERE NOT EXISTS (SELECT 1 FROM "AccActivity" a WHERE LOWER(a."userEmail") = LOWER(mc.email) AND a."createdAt" >= $1 AND a."createdAt" <= $2)`,
    range.start,
    range.end,
  )) as { count: number }[];
  const staleMembers = staleRows[0]?.count ?? 0;

  return { members, membersAtStart, activeAdmins, staleMembers };
}

export const accMembersRouter = router({
  /**
   * GRAPH-01 / GRAPH-03 data bridge: per-email aggregated v2.0 fields from AccProjectMember.
   * Returns empty array (not null) when no members are synced yet.
   * Consumer staleTime: 5 * 60 * 1000 (5 minutes).
   */
  enrichedUsers: protectedProcedure.query(async ({ ctx }) => {
    return getCachedAccMembersEnrichedUsers(ctx.db);
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
      if (rows.length > 0) return rows.map((r) => ({
        projectId: r.project.id,
        projectName: r.project.name,
        products: r.products,
      }));

      const dcUser = await ctx.db.accDcUser.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!dcUser) return [];

      const dcRows = await ctx.db.accDcProjectUserProduct.findMany({
        where: { userId: dcUser.id },
        select: { projectId: true, productKey: true, accessLevel: true },
      });
      if (dcRows.length === 0) return [];

      const projectIds = [...new Set(dcRows.map((r) => r.projectId))];
      const projects = await ctx.db.accDcProject.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, status: true },
      });
      const projectById = new Map(projects.map((p) => [p.id, p]));

      const byProject = new Map<string, { projectId: string; projectName: string; products: Record<string, string> }>();
      for (const row of dcRows) {
        const project = projectById.get(row.projectId);
        if (project?.status && project.status.toLowerCase() !== "active") continue;

        let entry = byProject.get(row.projectId);
        if (!entry) {
          entry = {
            projectId: row.projectId,
            projectName: project?.name ?? row.projectId,
            products: {},
          };
          byProject.set(row.projectId, entry);
        }

        const tier = dcAccessLevelToProductTier(row.accessLevel);
        entry.products[row.productKey] = mergeProductTier(entry.products[row.productKey], tier);
      }

      return [...byProject.values()].sort((a, b) =>
        a.projectName.localeCompare(b.projectName) || a.projectId.localeCompare(b.projectId),
      );
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

      const accessChanges = await ctx.db.accActivity.count({
        where: { createdAt: { gte: range.start, lte: range.end } },
      });
      const priorAccessChanges = await ctx.db.accActivity.count({
        where: { createdAt: { gte: priorRange.start, lte: priorRange.end } },
      });

      const kpiSource =
        (await getDcKpiSourceStats(ctx.db, range, input.window)) ??
        (await getLegacyKpiSourceStats(ctx.db, range));

      const earliest = await ctx.db.accActivity.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      return {
        members: { value: kpiSource.members, delta: kpiSource.members - kpiSource.membersAtStart },
        accessChanges: { value: accessChanges, delta: accessChanges - priorAccessChanges },
        activeAdmins: { value: kpiSource.activeAdmins, delta: 0 },
        staleMembers: { value: kpiSource.staleMembers, delta: 0 },
        dataEarliestEvent: earliest?.createdAt.toISOString() ?? null,
      };
    }),

  getGovernanceCompliance: protectedProcedure.query(async ({ ctx }) => {
    return getCachedComplianceReport(ctx.db);
  }),

  getPermissionRiskScorecard: protectedProcedure.query(async ({ ctx }) => {
    // 1. Worst users by footprint
    const worstUsersByFootprint = await ctx.db.$queryRaw`
      WITH user_projects AS (
        SELECT 
          LOWER(email) as email,
          data->>'name' as name,
          data->>'company' as company,
          proj->>'id' as project_id,
          role_name::text as role_assigned
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj,
        LATERAL jsonb_array_elements_text(proj->'roles') as role_name
      )
      SELECT 
        name,
        email,
        company,
        COUNT(DISTINCT project_id)::int as "projectCount",
        COUNT(DISTINCT role_assigned)::int as "distinctRoles",
        ARRAY_AGG(DISTINCT role_assigned) as "rolesHeld"
      FROM user_projects
      GROUP BY name, email, company
      ORDER BY "projectCount" DESC, "distinctRoles" DESC
      LIMIT 10
    `;

    // 2. Worst users by blast radius
    const worstUsersByBlastRadius = await ctx.db.$queryRaw`
      WITH user_roles AS (
        SELECT 
          LOWER(email) as email,
          data->>'name' as name,
          data->>'company' as company,
          proj->>'id' as project_id,
          role_name::text as role_assigned
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj,
        LATERAL jsonb_array_elements_text(proj->'roles') as role_name
      ),
      folder_perms AS (
        SELECT 
          fp."roleId", 
          r.name as role_name, 
          f."projectId", 
          f.id as folder_id,
          fp."permType"
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
      )
      SELECT 
        ur.name,
        ur.email,
        ur.company,
        COUNT(DISTINCT fp.folder_id)::int as "writeFolderCount",
        COUNT(DISTINCT CASE WHEN fp."permType" = 'Full Controller' THEN fp.folder_id END)::int as "adminFolderCount"
      FROM user_roles ur
      JOIN folder_perms fp ON ur.project_id = fp."projectId" AND ur.role_assigned = fp.role_name
      GROUP BY ur.name, ur.email, ur.company
      ORDER BY "writeFolderCount" DESC
      LIMIT 10
    `;

    // 3. Overprivileged roles
    const overPrivilegedRoles = await ctx.db.$queryRaw`
      SELECT 
        r.name as "roleName",
        COUNT(fp.id)::int as "fullControllerCount",
        COUNT(DISTINCT f."projectId")::int as "projectCount"
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE fp."permType" = 'Full Controller'
        AND r.name NOT IN ('Project Admin', 'Document Controller', 'Dirección', 'Director General', 'BIM Manager')
      GROUP BY r.name
      ORDER BY "fullControllerCount" DESC
      LIMIT 10
    `;

    // 4. Inheritance breaks
    const inheritanceBreaks = await ctx.db.$queryRaw`
      SELECT 
        r.name as "roleName",
        COUNT(fp.id)::int as "totalFolderAssignments",
        COUNT(DISTINCT f."projectId")::int as "projectCount",
        ROUND(COUNT(fp.id)::numeric / NULLIF(COUNT(DISTINCT f."projectId"), 0), 1)::float as "averageAssignmentsPerProject"
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      GROUP BY r.name
      ORDER BY "totalFolderAssignments" DESC
      LIMIT 10
    `;

    // 5. Lockout risks
    const lockouts = await ctx.db.$queryRaw`
      SELECT 
        p.name as "projectName",
        f.name as "folderName",
        f."fullPath" as "folderPath"
      FROM "AccFolder" f
      JOIN "AccProject" p ON f."projectId" = p.id
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      WHERE parent.name = 'Project Files'
        AND (f.name LIKE '%Design%' OR f.name LIKE '%Planos%' OR f.name LIKE '%Client%')
        AND NOT EXISTS (
          SELECT 1 FROM "AccFolderPermission" fp
          JOIN "AccRole" r ON r.id = fp."roleId"
          WHERE fp."folderId" = f.id AND r.name = 'Architect'
        )
      ORDER BY p.name, f.name
      LIMIT 20
    `;

    // 6. Sprawl folders
    const sprawlFolders = await ctx.db.$queryRaw`
      WITH sprawl AS (
        SELECT 
          f."projectId", 
          f.name as "folderName",
          f."fullPath" as "folderPath",
          COUNT(fp.id)::int as "totalRoles"
        FROM "AccFolder" f
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
        WHERE parent.name = 'Project Files'
        GROUP BY f."projectId", f.id, f.name, f."fullPath"
        HAVING COUNT(fp.id) >= 15
      )
      SELECT 
        p.name as "projectName",
        s."folderName",
        s."folderPath",
        s."totalRoles"
      FROM sprawl s
      JOIN "AccProject" p ON s."projectId" = p.id
      ORDER BY s."totalRoles" DESC
      LIMIT 20
    `;

    return {
      worstUsersByFootprint,
      worstUsersByBlastRadius,
      overPrivilegedRoles,
      inheritanceBreaks,
      lockouts,
      sprawlFolders
    };
  }),
});
