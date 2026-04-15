import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const tasksRouter = router({
  getMyTasks: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: ctx.session!.user!.email! },
      });
      if (!user) return [];

      return ctx.db.userTask.findMany({
        where: { userId: user.id, projectId: ctx.projectId },
        orderBy: [
          { status: "asc" },
          { priority: "desc" },
          { createdAt: "desc" },
        ],
        include: { attachments: true },
      });
    }),

  createTask: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
        dueDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: ctx.session!.user!.email! },
      });
      if (!user) throw new Error("User not found");

      return ctx.db.userTask.create({
        data: {
          userId: user.id,
          projectId: ctx.projectId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
        },
      });
    }),

  updateTask: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional().nullable(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        dueDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: ctx.session!.user!.email! },
      });
      if (!user) throw new Error("User not found");

      // Verify task belongs to user
      const task = await ctx.db.userTask.findUnique({
        where: { id: input.id },
      });
      if (!task || task.userId !== user.id) {
        throw new Error("Task not found");
      }

      const { id, ...data } = input;
      return ctx.db.userTask.update({
        where: { id },
        data,
      });
    }),

  deleteTask: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: ctx.session!.user!.email! },
      });
      if (!user) throw new Error("User not found");

      // Verify task belongs to user
      const task = await ctx.db.userTask.findUnique({
        where: { id: input.id },
      });
      if (!task || task.userId !== user.id) {
        throw new Error("Task not found");
      }

      return ctx.db.userTask.delete({
        where: { id: input.id },
      });
    }),

  addAttachment: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        url: z.string(),
        name: z.string(),
        type: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create task attachment
      return ctx.db.taskAttachment.create({
        data: {
          taskId: input.taskId,
          url: input.url,
          name: input.name,
          type: input.type,
        },
      });
    }),
});
