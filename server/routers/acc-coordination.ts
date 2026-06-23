/**
 * accCoordination tRPC router — Phase 10 Plan 01 (BND-01 boundary fix).
 *
 * Provides `getProjectClashes`: the per-project clash drill-down query,
 * delegating to lib/server/projectClashView.ts. This is the canonical tRPC
 * home for any future client-side caller; the existing Server Action
 * (coordinationActions.ts) calls the same helper server-side so the call
 * site in mainCharts.tsx is unchanged.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { loadProjectClashes } from "@/lib/server/projectClashView";

export const accCoordinationRouter = router({
  /**
   * BND-01: per-project coordination issue drill-down.
   * Returns the same ClashIssue[] shape as the Server Action.
   * Auth is enforced at the procedure level (protectedProcedure) AND
   * inside the helper (auth() gate) — double-gating is safe and preserves
   * the return [] contract when session is absent.
   */
  getProjectClashes: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return loadProjectClashes(input.projectId);
    }),
});
