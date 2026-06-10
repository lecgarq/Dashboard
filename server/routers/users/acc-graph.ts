// ACC sync & graph procedures for the users router: bulk ACC member sync,
// precomputed graph cache read/rebuild/invalidate, graph layout writes
// (disabled), and hub role definitions.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { adminProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import pLimit from "p-limit";
import { get2LeggedAutodeskToken } from "@/lib/server/aps-user-token";
import {
  buildAccGraphSnapshot,
  normalizeAccGraphPositions,
  type AccGraphStats,
} from "@/lib/acc/graphSnapshot";
import {
  fetchAllAccUsers,
  fetchAccUserProjects,
  fetchAccUserRoles,
  fetchAccUserProducts,
  type AccProject,
} from "@/lib/server/acc-admin";
import { rebuildAccGraphCache, sanitizeGraphPositions, ACC_GRAPH_CACHE_ID } from "@/lib/server/graph-rebuild";
import { invalidateAccHotCache } from "@/lib/server/acc-hot-cache";
import { logger, toAccRouterError, resolveAccountIdForRouter } from "./shared";

const EMPTY_ACC_GRAPH_STATS: AccGraphStats = {
  uniqueFoundUsers: 0,
  uniqueProjects: 0,
  totalProjectInstances: 0,
  roleCount: 0,
  moduleCount: 0,
  nodeCount: 0,
  edgeCount: 0,
};

export const userAccGraphProcedures = {
  bulkAccSync: adminProcedure
    .input(
      z
        .object({
          emails: z.array(z.string().email()).optional(),
          rebuildGraphCache: z.boolean().optional().default(true),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Token + accountId — fetch once for all users
      let accessToken: string;
      try {
        accessToken = await get2LeggedAutodeskToken();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ACC credentials not configured. Check APS_CLIENT_ID and APS_CLIENT_SECRET.",
          cause: error instanceof Error ? error : undefined,
        });
      }

      const accountId = await resolveAccountIdForRouter(ctx.db);

      // 2. Prefetch the entire ACC user list ONCE and build an email→user map. Previously
      // fetchAccUserByEmail paginated the full hub per call (O(emails × hub_size) API calls),
      // which blew past ACC rate limits on 1197 emails. Now it's one sweep up-front.
      let accUserByEmail: Map<string, { id: string; email: string; name: string; status: string; role: string; isAccountAdmin: boolean; company?: string; addedOn?: string; companyRole?: string; lastSignIn?: string }>;
      try {
        const allAccUsers = await fetchAllAccUsers(accountId, accessToken);
        accUserByEmail = new Map(allAccUsers.map((u) => [u.email.toLowerCase(), u]));
        logger.info("[bulkAccSync] prefetched ACC hub users", { count: allAccUsers.length });
      } catch (error) {
        throw toAccRouterError(error, "Failed to prefetch ACC user list for bulk sync.");
      }

      // 3. Emails to sync. Without explicit input, we want the FULL org-wide view —
      // every ACC user, plus any local registered users who may not be in ACC (those
      // get cached as notFound so the UI still shows them with that status).
      // Previously this was just `db.user` which limited the cache to 3 rows when
      // only 3 dashboard users had ever signed in.
      const emails = input?.emails && input.emails.length > 0
        ? input.emails
        : Array.from(new Set([
            ...Array.from(accUserByEmail.values(), (u) => u.email),
            ...(await ctx.db.user.findMany({ select: { email: true } })).map((u) => u.email),
          ]));
      logger.info("[bulkAccSync] sync target", {
        accUsers: accUserByEmail.size,
        totalEmails: emails.length,
      });

      let found = 0;
      let notFound = 0;
      let errors = 0;

      // 4. Per-email work: in-memory lookup, then only call per-user APIs for the handful
      // actually in ACC. Concurrency 3 — each found user fans out to projects+roles+products
      // which each paginate internally (~75 requests per user with many projects). A burst of
      // 6 found users × 3 API × pagination blew past ACC's quota. Retry-on-429 in the core
      // fetcher handles transient spikes; concurrency keeps the steady-state request rate low.
      const limit = pLimit(3);

      await Promise.all(
        emails.map((email) =>
          limit(async () => {
            try {
              const accUser = accUserByEmail.get(email.toLowerCase());

              if (!accUser) {
                const result = { found: false as const, syncedAt: new Date().toISOString() };
                await ctx.db.accMemberCache.upsert({
                  where: { email },
                  create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                  update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                });
                notFound++;
                return;
              }

              const [projects, rolesByProject, productsByProject] = await Promise.all([
                fetchAccUserProjects(accountId, accUser.id, accessToken).catch(() => [] as AccProject[]),
                fetchAccUserRoles(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
                fetchAccUserProducts(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
              ]);

              const enrichedProjects: AccProject[] = projects.map((proj) => ({
                ...proj,
                roles: rolesByProject.get(proj.id) ?? proj.roles,
                modules: productsByProject.get(proj.id) ?? [],
              }));

              // 04-02: normalize ACC join-date (HQ v1 `created_at`) to ISO 8601 string,
              // or null on parse failure / missing. Never write `Date.now()` here — that
              // would defeat the field's purpose by stamping every sync as "added now".
              let normalizedAddedOn: string | null = null;
              if (typeof accUser.addedOn === "string" && accUser.addedOn.length > 0) {
                const ts = Date.parse(accUser.addedOn);
                normalizedAddedOn = Number.isFinite(ts) && ts > 0
                  ? new Date(ts).toISOString()
                  : null;
              }

              const result = {
                found: true as const,
                autodeskId: accUser.id,
                name: accUser.name,
                status: accUser.status,
                role: accUser.role,
                company: accUser.company,
                addedOn: normalizedAddedOn,
                // 02.5-D fix: previously dropped here, leaving cached.data.companyRole and
                // cached.data.lastSignIn permanently undefined → "Unspecified" in the UI.
                companyRole: accUser.companyRole,
                lastSignIn: accUser.lastSignIn,
                // 04-01: ACC account-level admin flag (DASH-07). Derived from HQ v1
                // role === "account_admin"; distinct from per-project accessLevels.projectAdmin.
                isAccountAdmin: accUser.isAccountAdmin,
                projects: enrichedProjects,
                syncedAt: new Date().toISOString(),
              };

              await ctx.db.accMemberCache.upsert({
                where: { email },
                create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
              });
              found++;
            } catch (err) {
              logger.error("[bulkAccSync] failed for user", {
                email,
                error: err instanceof Error ? err.message : String(err),
              });
              errors++;
            }
          })
        )
      );

      let graphCache: { rebuilt: boolean; nodeCount?: number; edgeCount?: number; instanceCount?: number; projectCount?: number; error?: string } = {
        rebuilt: false,
      };
      if (input?.rebuildGraphCache ?? true) {
        try {
          const graph = await rebuildAccGraphCache(ctx.db);
          graphCache = {
            rebuilt: true,
            nodeCount: graph.stats.nodeCount,
            edgeCount: graph.stats.edgeCount,
            instanceCount: graph.stats.totalProjectInstances,
            projectCount: graph.stats.uniqueProjects,
          };
        } catch (error) {
          logger.error("[bulkAccSync] ACC graph cache rebuild failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          graphCache = {
            rebuilt: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      invalidateAccHotCache();
      return { total: emails.length, found, notFound, errors, graphCache };
    }),

  getPrecomputedGraph: adminProcedure.query(async ({ ctx }) => {
    let currentStats = EMPTY_ACC_GRAPH_STATS;
    let currentDataHash = "";

    try {
      // 1. Compute current dataHash from ALL AccMemberCache rows — server-side only
      //    Sort by email for determinism. Hash only fields that affect graph topology.
      const allRows = await ctx.db.accMemberCache.findMany({ orderBy: { email: "asc" } });
      const current = buildAccGraphSnapshot(allRows);
      currentStats = current.stats;
      currentDataHash = current.dataHash;

      // 2. Fetch stored layout
      const cached = await ctx.db.accGraphLayoutCache.findUnique({
        where: { id: ACC_GRAPH_CACHE_ID },
      });

      const cacheValid =
        cached &&
        cached.dataHash === current.dataHash &&
        cached.nodeCount === current.stats.nodeCount &&
        cached.edgeCount === current.stats.edgeCount &&
        cached.instanceCount === current.stats.totalProjectInstances &&
        cached.projectCount === current.stats.uniqueProjects &&
        cached.nodeIds.length === current.nodeIds.length &&
        cached.positions.length === current.stats.nodeCount * 2;

      if (!cacheValid) {
        return {
          hit: false as const,
          stale: !!cached,
          dataHash: current.dataHash,
          nodes: [] as unknown[],
          edges: [] as unknown[],
          positions: null,
          nodeIds: [] as string[],
          stats: current.stats,
        };
      }

      const fallbackPositions = normalizeAccGraphPositions(current.nodes);
      const { safePositions, usedFallback } = sanitizeGraphPositions(cached.positions, fallbackPositions);
      if (usedFallback) {
        logger.warn("ACC graph cache returned invalid positions; using semantic fallback positions", {
          nodeCount: current.stats.nodeCount,
        });
      }

      return {
        hit: true as const,
        stale: false,
        nodes: current.nodes as unknown[],
        edges: current.edges as unknown[],
        positions: safePositions,
        dataHash: current.dataHash,
        nodeIds: current.nodeIds,
        stats: current.stats,
      };
    } catch (error) {
      logger.error("Failed to load ACC graph cache", {
        error: error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
      });
      return {
        hit: false as const,
        stale: false,
        dataHash: currentDataHash,
        nodes: [] as unknown[],
        edges: [] as unknown[],
        positions: null,
        nodeIds: [] as string[],
        stats: currentStats,
      };
    }
  }),

  rebuildAccGraphCache: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const graph = await rebuildAccGraphCache(ctx.db);
      return {
        ok: true,
        dataHash: graph.dataHash,
        nodeCount: graph.stats.nodeCount,
        edgeCount: graph.stats.edgeCount,
        instanceCount: graph.stats.totalProjectInstances,
        projectCount: graph.stats.uniqueProjects,
        positionsLength: graph.positions.length,
        nodeIdsLength: graph.nodeIds.length,
        stats: graph.stats,
      };
    } catch (error) {
      logger.error("Failed to rebuild ACC graph cache", {
        error: error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
      });
      throw toAccRouterError(error, "Failed to rebuild ACC graph cache.");
    }
  }),

  saveGraphLayout: adminProcedure
    .input(
      z.object({
        positions: z.array(z.number()),
        dataHash: z.string(),
        nodeCount: z.number().int().positive(),
        nodeIds: z.array(z.string()),
      })
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Client-side ACC graph layout writes are disabled. Use rebuildAccGraphCache.",
      });
    }),

  invalidateGraphLayout: adminProcedure.mutation(async ({ ctx }) => {
    // Delete the singleton row — next getGraphLayout call will return hit: false
    // deleteMany is used because deleteUnique throws if row doesn't exist yet
    await ctx.db.accGraphLayoutCache.deleteMany({});
    return { ok: true };
  }),

  // -------------------------------------------------------------------------
  // Hub role definitions — roles that exist in ACC regardless of assignment
  // -------------------------------------------------------------------------

  // Reads from AccRole + AccProjectRole — populated per-project by the Quick Sync
  // path (TD-012 resolution: ACC has no hub-master roles endpoint, role rows are
  // accumulated from per-project /industry_roles responses).
  getHubRoles: adminProcedure.query(async ({ ctx }) => {
    const roles = await ctx.db.accRole.findMany({
      select: { id: true, name: true, syncedAt: true },
      orderBy: { name: "asc" },
    });
    if (roles.length === 0) {
      return { roles: [] as { id: string; name: string; memberCount: number }[], syncedAt: null };
    }
    const legacyCounts = await ctx.db.accProjectRole.groupBy({
      by: ["roleId"],
      where: { memberId: { not: null } },
      _count: { memberId: true },
    });
    const counts = legacyCounts.length > 0
      ? legacyCounts.map((c) => ({ roleId: c.roleId, memberCount: c._count.memberId }))
      : (await ctx.db.accDcProjectUserRole.groupBy({
          by: ["roleId"],
          where: { roleId: { in: roles.map((r) => r.id) } },
          _count: { userId: true },
        })).map((c) => ({ roleId: c.roleId, memberCount: c._count.userId }));
    const countByRole = new Map(counts.map((c) => [c.roleId, c.memberCount]));
    const syncedAt = roles.reduce<Date>(
      (latest, r) => (r.syncedAt > latest ? r.syncedAt : latest),
      roles[0].syncedAt,
    );
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        memberCount: countByRole.get(r.id) ?? 0,
      })),
      syncedAt,
    };
  }),
};
