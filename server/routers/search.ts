import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getValidAutodeskAccessToken } from "@/lib/server/aps-user-token";
import { IntegrationError } from "@/lib/server/integration-errors";
import { router, protectedProcedure } from "../trpc";

function toApsSearchError(error: unknown, fallbackMessage: string) {
  if (error instanceof IntegrationError) {
    return new TRPCError({
      code:
        error.code === "config_missing" || error.code === "reconnect_required"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}

export const searchRouter = router({
  query: protectedProcedure
    .input(z.object({ term: z.string(), limit: z.number().optional().default(5) }))
    .query(async ({ ctx, input }) => {
      const { term, limit } = input;
      if (!term || term.length < 2) return { families: [], tasks: [], clashTasks: [] };

      const userId = ctx.session!.user!.id;

      const [families, tasks, clashTasks] = await Promise.all([
        ctx.db.family.findMany({
          where: {
            OR: [
              { name: { contains: term } },
              { category: { contains: term } },
            ],
          },
          take: limit,
          select: { id: true, name: true, category: true },
        }),
        ctx.db.userTask.findMany({
          where: {
            OR: [
              { title: { contains: term } },
              { description: { contains: term } },
            ],
            // Only search user's own tasks for privacy
            userId: userId,
          },
          take: limit,
          select: { id: true, title: true, status: true },
        }),
        ctx.db.clashTask.findMany({
          where: {
            OR: [
              { title: { contains: term } },
              { description: { contains: term } },
            ],
          },
          take: limit,
          select: { id: true, title: true, status: true },
        }),
      ]);

      return {
        families: families.map(f => ({ ...f, type: 'family', label: f.name, sublabel: f.category })),
        tasks: tasks.map(t => ({ ...t, type: 'task', label: t.title, sublabel: `Status: ${t.status}` })),
        clashTasks: clashTasks.map(c => ({ ...c, type: 'clash', label: c.title, sublabel: `Status: ${c.status}` })),
      };
    }),

  getApsToken: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const { accessToken, expiresAt } = await getValidAutodeskAccessToken(
          ctx.session.user.id
        );
        return { token: accessToken, expiresAt };
      } catch (error) {
        throw toApsSearchError(
          error,
          "Unable to acquire an Autodesk token for the viewer."
        );
      }
    }),
});
