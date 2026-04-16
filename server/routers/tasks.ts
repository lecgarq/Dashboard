import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { router, protectedProcedure } from "../trpc";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("tasks-router");
const utapi = new UTApi();

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

      const attachments = await ctx.db.taskAttachment.findMany({
        where: { taskId: input.id },
        select: { url: true },
      });

      const result = await ctx.db.userTask.delete({
        where: { id: input.id },
      });

      if (attachments.length > 0) {
        const fileKeys = attachments
          .map((a) => a.url.split("/f/")[1])
          .filter((k): k is string => !!k);
        if (fileKeys.length > 0) {
          try {
            await utapi.deleteFiles(fileKeys);
          } catch (err) {
            logger.warn("Failed to delete UploadThing files after task deletion", { fileKeys, err: String(err) });
          }
        }
      }

      return result;
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
