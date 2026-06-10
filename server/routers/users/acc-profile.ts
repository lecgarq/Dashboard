// ACC profile procedures for the users router: bulk summary, per-user ACC
// profile (cached via AccMemberCache), activity feed, and derived folder
// access for a single user.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { adminProcedure, protectedProcedure } from "../../trpc";
import { get2LeggedAutodeskToken } from "@/lib/server/aps-user-token";
import {
  fetchAccUserByEmail,
  fetchAccUserProjects,
  fetchAccUserRoles,
  fetchAccUserProducts,
  type AccProject,
} from "@/lib/server/acc-admin";
import { getCachedBulkAccSummary, invalidateAccHotCache } from "@/lib/server/acc-hot-cache";
import { toAccRouterError, resolveAccountIdForRouter } from "./shared";

const ACC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function toStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function readAccGraphShape(raw: unknown): { found: boolean; roles: string[]; modules: string[] } {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      data = null;
    }
  }

  if (!data || typeof data !== "object") {
    return { found: false, roles: [], modules: [] };
  }

  const record = data as { found?: unknown; projects?: unknown };
  const found = record.found === true;
  if (!found || !Array.isArray(record.projects)) {
    return { found, roles: [], modules: [] };
  }

  const roleSet = new Set<string>();
  const moduleSet = new Set<string>();
  for (const project of record.projects) {
    if (!project || typeof project !== "object") continue;
    const projectRecord = project as { roles?: unknown; modules?: unknown };
    for (const role of toStringSet(projectRecord.roles)) roleSet.add(role);
    for (const moduleName of toStringSet(projectRecord.modules)) moduleSet.add(moduleName);
  }

  return {
    found,
    roles: [...roleSet].sort((a, b) => a.localeCompare(b)),
    modules: [...moduleSet].sort((a, b) => a.localeCompare(b)),
  };
}

export const userAccProfileProcedures = {
  // ── ACC Project Intelligence ──────────────────────────────────────────────

  /**
   * Reads all registered users + their AccMemberCache rows in two queries.
   * Returns a full per-user summary for both Plan 7.1 filter chips and
   * Plan 7.2 hub-wide permission analysis. Fields are strictly additive.
   */
  bulkAccSummary: adminProcedure.query(async ({ ctx }) => {
    return getCachedBulkAccSummary(ctx.db);
  }),

  getAccProfile: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const { email, forceRefresh } = input;

      // 1. Cache check — skip if forceRefresh requested
      if (!forceRefresh) {
        const cached = await ctx.db.accMemberCache.findUnique({
          where: { email },
        });
        if (
          cached &&
          Date.now() - cached.syncedAt.getTime() < ACC_CACHE_TTL_MS
        ) {
          type CachedAccUser = {
            found: boolean;
            syncedAt: string;
            autodeskId?: string;
            name?: string;
            status?: string;
            projects?: AccProject[];
          };
          const raw = cached.data as unknown;
          if (typeof raw === "string") {
            return JSON.parse(raw) as CachedAccUser;
          }
          return raw as CachedAccUser;
        }
      }

      // 2. Get 2-legged app token for HQ Admin API
      let accessToken: string;
      try {
        accessToken = await get2LeggedAutodeskToken();
      } catch (error) {
        throw toAccRouterError(
          error,
          "ACC Admin API: APS app credentials are not configured."
        );
      }

      // 3. Get accountId from Project table
      // CRITICAL: Strip "b." prefix — ACC Admin API uses bare UUID, not Data Management hub format
      const accountId = await resolveAccountIdForRouter(ctx.db);

      // 4. Search ACC for the person by email
      // Returns null if not found (empty results) — NOT a 404 error per ACC API design
      let accUser;
      try {
        accUser = await fetchAccUserByEmail(accountId, email, accessToken);
      } catch (error) {
        // 403 here means admin's Autodesk account lacks Account Admin privilege in the hub
        throw toAccRouterError(
          error,
          "ACC Admin API request failed. Ensure your Autodesk account has Account Admin privileges."
        );
      }

      // 5. Person not found in ACC — cache the negative result and return
      if (!accUser) {
        const result = { found: false as const, syncedAt: new Date().toISOString() };
        await ctx.db.accMemberCache.upsert({
          where: { email },
          create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
          update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
        });
        invalidateAccHotCache();
        return result;
      }

      // 6. Fetch project list and roles in parallel
      const [projects, rolesByProject, productsByProject] = await Promise.all([
        fetchAccUserProjects(accountId, accUser.id, accessToken).catch((error) => {
          throw toAccRouterError(error, "ACC Admin API: Failed to fetch project list.");
        }),
        fetchAccUserRoles(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
        fetchAccUserProducts(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
      ]);

      console.info(`[acc] roles map keys (${rolesByProject.size}):`, [...rolesByProject.keys()].slice(0, 5));
      console.info(`[acc] project ids (${projects.length}):`, projects.map((p) => p.id).slice(0, 5));

      const enrichedProjects: AccProject[] = projects.map((proj) => ({
        ...proj,
        roles: rolesByProject.get(proj.id) ?? proj.roles,
        modules: productsByProject.get(proj.id) ?? [],
      }));

      const result = {
        found: true as const,
        autodeskId: accUser.id,
        name: accUser.name,
        status: accUser.status,
        role: accUser.role,
        company: accUser.company,
        addedOn: accUser.addedOn,
        lastSignIn: accUser.lastSignIn,
        projects: enrichedProjects,
        syncedAt: new Date().toISOString(),
      };

      // 7. Upsert cache
      await ctx.db.accMemberCache.upsert({
        where: { email },
        create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
        update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
      });
      invalidateAccHotCache();

      return result;
    }),

  // -------------------------------------------------------------------------
  // getAccUserActivity — reads AccActivity for a single user (by email).
  // Returns last-30d count, top 5 actions, and 20 most-recent events with
  // project names resolved.
  // -------------------------------------------------------------------------
  getAccUserActivity: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input, ctx }) => {
      const email = input.email.toLowerCase();
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [last30dCount, totalCount, topActionsRaw, recentRows, projects] = await Promise.all([
        ctx.db.accActivity.count({ where: { userEmail: email, createdAt: { gte: since30d } } }),
        ctx.db.accActivity.count({ where: { userEmail: email } }),
        ctx.db.accActivity.groupBy({
          by: ["rawAction"],
          where: { userEmail: email, createdAt: { gte: since30d } },
          _count: { _all: true },
          orderBy: { _count: { rawAction: "desc" } },
          take: 5,
        }),
        ctx.db.accActivity.findMany({
          where: { userEmail: email },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            rawAction: true,
            service: true,
            tool: true,
            details: true,
            projectId: true,
            sourceFile: true,
          },
        }),
        ctx.db.accProject.findMany({ select: { id: true, name: true } }),
      ]);

      const projectName = new Map(projects.map((p) => [p.id, p.name]));

      return {
        last30dCount,
        totalCount,
        topActions: topActionsRaw.map((row) => ({
          action: row.rawAction,
          count: row._count._all,
        })),
        recentEvents: recentRows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          action: r.rawAction,
          service: r.service,
          tool: r.tool,
          details: r.details,
          projectId: r.projectId || null,
          projectName: r.projectId ? projectName.get(r.projectId) ?? null : null,
          sourceFile: r.sourceFile,
        })),
      };
    }),

  // -------------------------------------------------------------------------
  // getAccUserFolderAccess — derives the folders this user can access by
  // matching their cached project roles (by NAME, per project) to
  // AccProjectRole → AccRole.id → AccFolderPermission.
  // Returns partial results: only projects whose folders have been crawled
  // contribute rows. Coverage grows as folder-crawl-cron completes.
  // -------------------------------------------------------------------------
  getAccUserFolderAccess: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input, ctx }) => {
      const email = input.email.toLowerCase();

      const dcUser = await ctx.db.accDcUser.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (dcUser) {
        const [projectUsers, projectRoles] = await Promise.all([
          ctx.db.accDcProjectUser.findMany({
            where: { userId: dcUser.id },
            select: { projectId: true },
          }),
          ctx.db.accDcProjectUserRole.findMany({
            where: { userId: dcUser.id },
            select: { projectId: true, roleId: true },
          }),
        ]);

        const projectIds = [...new Set(projectUsers.map((p) => p.projectId))];
        if (projectIds.length === 0) {
          return { folders: [], coverage: { totalProjects: 0, crawledProjects: 0 } };
        }

        const roleProjectKeys = new Set(projectRoles.map((r) => `${r.projectId}::${r.roleId}`));
        const allRoleIds = [...new Set(projectRoles.map((r) => r.roleId))];
        const crawled = await ctx.db.accProject.count({
          where: { id: { in: projectIds }, folderCrawlStatus: { in: ["ok", "partial"] } },
        });

        if (allRoleIds.length === 0) {
          return { folders: [], coverage: { totalProjects: projectIds.length, crawledProjects: crawled } };
        }

        const [perms, roles] = await Promise.all([
          ctx.db.accFolderPermission.findMany({
            where: { roleId: { in: allRoleIds }, folder: { projectId: { in: projectIds } } },
            select: {
              id: true,
              roleId: true,
              actions: true,
              permType: true,
              folder: {
                select: {
                  id: true,
                  name: true,
                  fullPath: true,
                  projectId: true,
                  project: { select: { id: true, name: true } },
                },
              },
            },
          }),
          ctx.db.accRole.findMany({
            where: { id: { in: allRoleIds } },
            select: { id: true, name: true },
          }),
        ]);

        const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
        const filtered = perms.filter((p) => roleProjectKeys.has(`${p.folder.projectId}::${p.roleId}`));

        return {
          folders: filtered.map((p) => ({
            folderId: p.folder.id,
            folderName: p.folder.name,
            folderPath: p.folder.fullPath,
            projectId: p.folder.projectId,
            projectName: p.folder.project.name,
            roleId: p.roleId,
            roleName: roleNameById.get(p.roleId) ?? p.roleId,
            permType: p.permType,
            actions: p.actions,
          })),
          coverage: { totalProjects: projectIds.length, crawledProjects: crawled },
        };
      }

      // Pull the user's projects + role names from accMemberCache
      const cached = await ctx.db.accMemberCache.findUnique({ where: { email } });
      if (!cached) return { folders: [], coverage: { totalProjects: 0, crawledProjects: 0 } };

      const data = cached.data as unknown as {
        projects?: Array<{ id: string; name: string; roles?: string[]; isAdmin?: boolean }>;
      };
      const userProjects = data.projects ?? [];
      if (userProjects.length === 0) {
        return { folders: [], coverage: { totalProjects: 0, crawledProjects: 0 } };
      }

      const projectIds = userProjects.map((p) => p.id);
      // Set of "projectId::roleNameLower" to match per project (case-insensitive)
      const wantedRoleKeys = new Set<string>();
      for (const p of userProjects) {
        for (const roleName of p.roles ?? []) {
          wantedRoleKeys.add(`${p.id}::${roleName.toLowerCase()}`);
        }
      }

      // Resolve role names to role IDs scoped to this user's projects.
      // AccProjectRole rows tell us which AccRole.id is used per project, and
      // AccRole.name gives the human-readable name.
      const projectRoles = await ctx.db.accProjectRole.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          projectId: true,
          roleId: true,
          role: { select: { id: true, name: true } },
        },
      });
      const userRoleIdsByProject = new Map<string, Set<string>>();
      for (const pr of projectRoles) {
        const key = `${pr.projectId}::${pr.role.name.toLowerCase()}`;
        if (!wantedRoleKeys.has(key)) continue;
        if (!userRoleIdsByProject.has(pr.projectId)) userRoleIdsByProject.set(pr.projectId, new Set());
        userRoleIdsByProject.get(pr.projectId)!.add(pr.roleId);
      }
      const allRoleIds = new Set<string>();
      for (const set of userRoleIdsByProject.values()) for (const r of set) allRoleIds.add(r);
      if (allRoleIds.size === 0) {
        // User has roles but none match AccRole rows yet, or no folder crawl coverage
        const crawled = await ctx.db.accProject.count({
          where: { id: { in: projectIds }, folderCrawlStatus: { in: ["ok", "partial"] } },
        });
        return { folders: [], coverage: { totalProjects: projectIds.length, crawledProjects: crawled } };
      }

      const perms = await ctx.db.accFolderPermission.findMany({
        where: { roleId: { in: [...allRoleIds] } },
        select: {
          id: true,
          roleId: true,
          actions: true,
          permType: true,
          folder: {
            select: {
              id: true,
              name: true,
              fullPath: true,
              projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Filter to only this user's projects (defensive — roleId could in theory
      // appear across projects if a role was re-used)
      const projectIdSet = new Set(projectIds);
      const filtered = perms.filter((p) => projectIdSet.has(p.folder.projectId));

      // Resolve role NAME per row (for display)
      const roleNameById = new Map(projectRoles.map((pr) => [pr.roleId, pr.role.name]));

      const crawled = await ctx.db.accProject.count({
        where: { id: { in: projectIds }, folderCrawlStatus: { in: ["ok", "partial"] } },
      });

      return {
        folders: filtered.map((p) => ({
          folderId: p.folder.id,
          folderName: p.folder.name,
          folderPath: p.folder.fullPath,
          projectId: p.folder.projectId,
          projectName: p.folder.project.name,
          roleId: p.roleId,
          roleName: roleNameById.get(p.roleId) ?? p.roleId,
          permType: p.permType,
          actions: p.actions,
        })),
        coverage: { totalProjects: projectIds.length, crawledProjects: crawled },
      };
    }),
};
