/**
 * accFolders tRPC router — Wave 1 scaffold (Phase 04 Plan 03).
 *
 * Placeholder router so Plan 06 widget and any client component can bind
 * against a real router key today. Plan 05 will add:
 *   - getMatrix: folder × role permission matrix for a project
 *   - getOrphanRoles: roles with no folder-level grants
 *   - getProjectFolderTree: full folder hierarchy for a project
 */

import { router, protectedProcedure } from "../trpc";

export const accFoldersRouter = router({
  // Placeholder so the router is callable from the client even before Plan 05.
  // Plan 05 will add: getMatrix, getOrphanRoles, getProjectFolderTree
  ping: protectedProcedure.query(async () => {
    return { ok: true, ts: new Date().toISOString() };
  }),
});

export type AccFoldersRouter = typeof accFoldersRouter;
