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
import { getCachedAccDcBulkUsers } from "@/lib/server/acc-hot-cache";
import { dedupeAndCapEdges } from "@/lib/acc/embedding/similarityEdgeSet";

export const accDcGraphRouter = router({
  bulkUsers: adminProcedure
    .input(z.object({
      includePermissionContexts: z.boolean().optional(),
      includePermissionSummary: z.boolean().optional(),
      includeActivityMix: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getCachedAccDcBulkUsers(ctx.db, input ?? undefined);
    }),
  instanceEmbedding: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.accInstanceEmbedding.findMany({
      select: { nodeId: true, x: true, y: true, cluster: true },
    });
    // Map keyed by nodeId; the client joins to its sorted nodeIds (cosmos order).
    return rows as Array<{ nodeId: string; x: number; y: number; cluster: number | null }>;
  }),
  instanceNeighbors: adminProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.accInstanceEmbedding.findUnique({
        where: { nodeId: input.nodeId },
        select: { neighbors: true },
      });
      return (row?.neighbors ?? []) as Array<{ nodeId: string; score: number }>;
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
        select: { nodeId: true, neighbors: true },
      });
      const nodes = rows.map((r) => ({
        nodeId: r.nodeId,
        neighbors: (r.neighbors ?? []) as Array<{ nodeId: string; score: number }>,
      }));
      return dedupeAndCapEdges(nodes, limit);
    }),
});
