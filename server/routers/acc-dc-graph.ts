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
});
