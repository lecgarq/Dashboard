import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

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
    .query(async () => {
      const { getInternalToken } = await import("@/lib/aps");
      const token = await getInternalToken();
      return { token };
    }),
});
