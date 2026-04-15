import { protectedProcedure, router } from "../trpc";

export const projectRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.project.findFirst();
    if (existing) return existing;
    return ctx.db.project.create({
      data: {
        name: process.env.APS_PROJECT_NAME ?? "BIM Dashboard",
        apsProjectId: process.env["APS_PROJECT-ID"] ?? null,
        apsHubId: process.env["APS_HUB-ID"] ?? null,
      },
    });
  }),
});
