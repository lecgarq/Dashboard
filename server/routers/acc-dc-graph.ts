/**
 * accDcGraph tRPC router — Task 4 (access-analysis-redesign).
 *
 * Sources user/project membership data exclusively from the DC snapshot
 * tables (AccDc*) and assembles it via the pure `assembleDcUsers` function.
 *
 * Procedures:
 *   - bulkUsers: returns all AccDcUser records assembled into BulkAccUser
 *     shape, enriched with project membership, roles, products, and company.
 *
 * Note: roleId in AccDcProjectUserRole joins to AccRole (not AccDcRole) —
 * confirmed by live join-count query (AccRole: 13,711 matches; AccDcRole: 0).
 */

import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { getCachedAccDcBulkUsers, getAccDataVersion } from "@/lib/server/acc-hot-cache";
import { dedupeAndSelectClusterAware } from "@/lib/acc/embedding/similarityEdgeSet";
import { normalizeNeighborsPayload } from "@/lib/acc/embedding/neighborPayload";

export const accDcGraphRouter = router({
  /**
   * Opaque fingerprint of the tables behind the /users directory snapshots
   * (~50 bytes). The client polls this on an interval and invalidates its
   * heavy snapshot queries only when the token changes — data lands on
   * screen without a manual reload, and unchanged data costs no refetch.
   * `null` means the probe was unavailable; clients must treat it as no-op.
   */
  dataVersion: adminProcedure.query(async ({ ctx }) => {
    return { version: await getAccDataVersion(ctx.db) };
  }),

  bulkUsers: adminProcedure
    .input(z.object({
      includePermissionContexts: z.boolean().optional(),
      includePermissionSummary: z.boolean().optional(),
      includeActivityMix: z.boolean().optional(),
      // Empties per-project roles[]/modules[] — the /users directory's lean payload.
      leanProjects: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getCachedAccDcBulkUsers(ctx.db, input ?? undefined);
    }),

  /**
   * Single-user full (non-lean) fetch from the DC snapshot.
   *
   * Returns the BulkAccUser for the given email with full per-project
   * roles[] and modules[] populated — the /users page uses leanProjects
   * which empties these arrays, so the profile panel calls this proc to
   * enrich the view without hitting the live Autodesk API.
   *
   * Uses the shared hot-cache (full variant key) so the first call after
   * a cold start pays the assembly cost once; subsequent calls are instant.
   */
  bulkUser: adminProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ ctx, input }) => {
      const users = await getCachedAccDcBulkUsers(ctx.db, {});
      return users.find(
        (u) => u.email.toLowerCase() === input.email.toLowerCase(),
      ) ?? null;
    }),
  instanceEmbedding: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.accInstanceEmbedding.findMany({
      select: { nodeId: true, x: true, y: true, cluster: true },
    });
    // Map keyed by nodeId; the client joins to its sorted nodeIds (cosmos order).
    return rows as Array<{ nodeId: string; x: number; y: number; cluster: number | null }>;
  }),
  /**
   * Neighbors of one node, normalized to the Phase 30 v2 payload
   * ({matches, twins}) regardless of the stored Json generation — old
   * bare-array rows render as matches with empty `why` and zero twins.
   */
  instanceNeighbors: adminProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.accInstanceEmbedding.findUnique({
        where: { nodeId: input.nodeId },
        select: { neighbors: true },
      });
      return normalizeNeighborsPayload(row?.neighbors);
    }),
  similarityEdges: adminProcedure
    .input(
      z
        .object({ limit: z.number().int().positive().max(40000).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 18000;
      const rows = await ctx.db.accInstanceEmbedding.findMany({
        select: { nodeId: true, neighbors: true, cluster: true },
      });
      // De-twinned matches only (Phase 30): exact-vector twin edges are collapsed
      // upstream in the pipeline, so the web connects distinct profiles.
      const nodes = rows.map((r) => ({
        nodeId: r.nodeId,
        neighbors: normalizeNeighborsPayload(r.neighbors).matches.map((m) => ({
          nodeId: m.nodeId,
          score: m.score,
        })),
      }));
      // Cluster-aware selection so cross-cluster "bridge" edges survive the cap
      // (pre-collapse, plain top-N was 100% saturated by score-1.0 twin edges;
      // post-collapse re-tune evidence lives in the Phase 30 verification).
      const clusterById = new Map<string, number | null>(
        rows.map((r) => [r.nodeId, r.cluster]),
      );
      return dedupeAndSelectClusterAware(nodes, clusterById, limit);
    }),
});
