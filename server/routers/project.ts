import { protectedProcedure, router } from "../trpc";

export const projectRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const envHubId = process.env["APS_HUB-ID"] ?? null;
    const envProjectId = process.env["APS_PROJECT-ID"] ?? null;
    const envName = process.env.APS_PROJECT_NAME ?? "BIM Dashboard";

    const existing = await ctx.db.project.findFirst();
    if (!existing) {
      return ctx.db.project.create({
        data: { name: envName, apsProjectId: envProjectId, apsHubId: envHubId },
      });
    }

    // Backfill env-sourced fields if they are now set but were missing at creation time
    const needsUpdate =
      (envHubId && !existing.apsHubId) ||
      (envProjectId && !existing.apsProjectId);

    if (!needsUpdate) return existing;

    return ctx.db.project.update({
      where: { id: existing.id },
      data: {
        ...(envHubId && !existing.apsHubId ? { apsHubId: envHubId } : {}),
        ...(envProjectId && !existing.apsProjectId ? { apsProjectId: envProjectId } : {}),
      },
    });
  }),
});
