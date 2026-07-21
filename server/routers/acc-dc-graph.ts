/**
 * accDcGraph tRPC router — Task 4 (access-analysis-redesign).
 *
 * Sources user/project membership data exclusively from the DC snapshot
 * tables (AccDc*) and assembles it via the pure `assembleDcUsers` function.
 *
 * v2.7 Phase 39 (ACT-03): the instance-graph procedures (graphSnapshot,
 * instanceEmbedding, instanceNeighbors, similarityEdges) retired with the
 * user×project instance graph. The surviving procedures feed the /users
 * directory and the profile panels.
 *
 * Note: roleId in AccDcProjectUserRole joins to AccRole (not AccDcRole) —
 * confirmed by live join-count query (AccRole: 13,711 matches; AccDcRole: 0).
 */

import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { getCachedAccDcBulkUsers, getAccDataVersion } from "@/lib/server/acc-hot-cache";

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
});
