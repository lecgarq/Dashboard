/**
 * accPersonGraph tRPC router — Task 10 (access-analysis-redesign).
 *
 * Serves pre-built AccPersonGraphSnapshot rows (k=6,8,10,12,14,16)
 * for the person-graph embedding feature.
 *
 * Procedures:
 *   - snapshot: returns the nearest-k snapshot row plus availableKs metadata.
 */

import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { PERSON_GRAPH_KS } from "@/lib/server/personGraphRebuild";

function nearestK(k: number): number {
  return PERSON_GRAPH_KS.reduce(
    (best, v) => (Math.abs(v - k) < Math.abs(best - k) ? v : best),
    PERSON_GRAPH_KS[0],
  );
}

export const accPersonGraphRouter = router({
  snapshot: adminProcedure
    .input(z.object({ k: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const k = nearestK(input?.k ?? 8);
      const row = await ctx.db.accPersonGraphSnapshot.findUnique({ where: { k } });
      if (!row) return null;
      return {
        k: row.k,
        dim: row.dim,
        personCount: row.personCount,
        nodes: row.nodes,
        edges: row.edges,
        clusters: row.clusters,
        availableKs: PERSON_GRAPH_KS,
      };
    }),
});
