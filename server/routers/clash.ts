import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure, editorProcedure } from "../trpc";
import clashEvents from "@/lib/events/clash";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("clash");
import { upsertDriveJsonFile } from "@/lib/google/drive";
import { DEFAULT_WIKI_SECTIONS, normalizeWikiSectionKey } from "@/lib/wiki/sections";
import { ensureUniqueSection } from "@/lib/wiki/utils";

const TaskStatusEnum = z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "DONE"]);
const WikiStatusEnum = z.enum(["DRAFT", "REVIEW", "APPROVED"]);

function serializeTask(task: {
  id: string;
  status: string;
  order: number;
  title: string;
  description: string | null;
  milestone: string | null;
  dueDate: Date | null;
  owner: string | null;
  isBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    status: task.status,
    order: task.order,
    title: task.title,
    description: task.description,
    milestone: task.milestone,
    dueDate: task.dueDate?.toISOString() ?? null,
    owner: task.owner,
    isBlocked: task.isBlocked,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function backupWikiToDrive(db: PrismaClient, projectId: string) {
  const sections = await db.clashWiki.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });

  await upsertDriveJsonFile(`clash-wiki-${projectId}.json`, {
    projectId,
    updatedAt: new Date().toISOString(),
    sections: sections.map((s) => ({
      section: s.section,
      title: s.title,
      content: s.content,
      status: s.status,
      order: s.order,
    })),
  });
}

async function ensureDefaultWikiSections(db: PrismaClient, projectId: string) {
  const existing = await db.clashWiki.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });

  const existingKeys = new Set(
    existing.map((section) => normalizeWikiSectionKey(section.section))
  );
  const missingDefaults = DEFAULT_WIKI_SECTIONS.filter(
    (section) => !existingKeys.has(section.section)
  );

  if (missingDefaults.length === 0) {
    return existing;
  }

  await db.clashWiki.createMany({
    data: missingDefaults.map((section) => ({
      projectId,
      section: ensureUniqueSection(projectId, section.section),
      title: section.title,
      content: "",
      status: "DRAFT",
      order: section.order,
    })),
    skipDuplicates: true,
  });

  return db.clashWiki.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}

export const clashRouter = router({
  // Wiki
  getWikiSections: protectedProcedure
    .query(async ({ ctx }) => {
      return ensureDefaultWikiSections(ctx.db, ctx.projectId);
    }),

  upsertWikiSection: editorProcedure
    .input(
      z.object({
        section: z.string(),
        title: z.string(),
        content: z.string(),
        status: WikiStatusEnum.optional(),
        order: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanSection = ensureUniqueSection(ctx.projectId, input.section);
      const sectionKey = normalizeWikiSectionKey(input.section);
      const defaultSection = DEFAULT_WIKI_SECTIONS.find(
        (section) => section.section === sectionKey
      );

      const existing = await ctx.db.clashWiki.findUnique({
        where: { section: cleanSection },
        select: { id: true, order: true },
      });
      const maxOrder = existing
        ? existing.order
        : (await ctx.db.clashWiki.aggregate({
            where: { projectId: ctx.projectId },
            _max: { order: true },
          }))._max.order ?? -1;
      const createOrder =
        input.order ??
        defaultSection?.order ??
        maxOrder + 1;

      const result = await ctx.db.clashWiki.upsert({
        where: { section: cleanSection },
        update: {
          title: input.title,
          content: input.content,
          status: input.status,
        },
        create: {
          projectId: ctx.projectId,
          section: cleanSection,
          title: input.title,
          content: input.content,
          status: input.status ?? "DRAFT",
          order: createOrder,
        },
      });

      clashEvents.emit("update", {
        type: "wiki-upsert",
        projectId: ctx.projectId,
        wiki: {
          id: result.id,
          section: result.section,
          title: result.title,
          content: result.content,
          status: result.status,
          order: result.order,
          updatedAt: result.updatedAt.toISOString(),
        },
      });

      // Non-blocking Drive backup
      backupWikiToDrive(ctx.db, ctx.projectId)
        .catch((err) => logger.error("Drive backup failed", { err }));

      return result;
    }),

  updateWikiStatus: editorProcedure
    .input(z.object({ section: z.string(), status: WikiStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const uniqueSection = ensureUniqueSection(ctx.projectId, input.section);
      const updated = await ctx.db.clashWiki.update({
        where: { section: uniqueSection },
        data: { status: input.status },
      });

      clashEvents.emit("update", {
        type: "wiki-status",
        projectId: ctx.projectId,
        wiki: {
          id: updated.id,
          section: updated.section,
          status: updated.status,
          updatedAt: updated.updatedAt.toISOString(),
        },
      });

      return updated;
    }),

  deleteWikiSection: editorProcedure
    .input(z.object({ section: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const uniqueSection = ensureUniqueSection(ctx.projectId, input.section);
      const deleted = await ctx.db.clashWiki.delete({
        where: { section: uniqueSection },
      });

      clashEvents.emit("update", {
        type: "wiki-deleted",
        projectId: ctx.projectId,
        section: input.section,
      });

      return deleted;
    }),

  reorderWikiSections: editorProcedure
    .input(z.array(z.object({ section: z.string(), order: z.number() })))
    .mutation(async ({ ctx, input }) => {
      const updates = input.map((item) => {
        const uniqueSection = ensureUniqueSection(ctx.projectId, item.section);
        return ctx.db.clashWiki.update({
          where: { section: uniqueSection },
          data: { order: item.order },
        });
      });

      await Promise.all(updates);

      clashEvents.emit("update", {
        type: "wiki-list-reordered",
        projectId: ctx.projectId,
      });

      return { success: true };
    }),

  // Tasks
  getTasks: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.clashTask.findMany({
        where: { projectId: ctx.projectId },
        orderBy: [{ status: "asc" }, { order: "asc" }]
      });
    }),

  createTask: editorProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: TaskStatusEnum.optional(),
        milestone: z.string().optional(),
        dueDate: z.date().optional(),
        owner: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.clashTask.count({ where: { projectId: ctx.projectId, status: input.status ?? "PLANNING" } });
      const task = await ctx.db.clashTask.create({
        data: { ...input, projectId: ctx.projectId, status: input.status ?? "PLANNING", order: count },
      });

      clashEvents.emit("update", {
        type: "task-created",
        projectId: ctx.projectId,
        task: serializeTask(task),
      });

      return task;
    }),

  updateTask: editorProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: TaskStatusEnum.optional(),
        milestone: z.string().optional(),
        dueDate: z.date().nullable().optional(),
        owner: z.string().optional(),
        isBlocked: z.boolean().optional(),
        order: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const task = await ctx.db.clashTask.update({ where: { id }, data });

      clashEvents.emit("update", {
        type: "task-updated",
        projectId: ctx.projectId,
        task: serializeTask(task),
      });

      return task;
    }),

  deleteTask: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.clashTask.delete({ where: { id: input.id } });

      clashEvents.emit("update", {
        type: "task-deleted",
        projectId: ctx.projectId,
        taskId: deleted.id,
      });

      return deleted;
    }),

  // Releases
  getReleases: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.clashToolRelease.findMany({ orderBy: { releasedAt: "desc" } });
  }),

  createRelease: editorProcedure
    .input(
      z.object({
        version: z.string().min(1),
        changelog: z.string(),
        downloadUrl: z.string().optional(),
        testCases: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.clashToolRelease.create({ data: input });
    }),

  getKPIs: protectedProcedure
    .query(async ({ ctx }) => {
      const [total, done] = await Promise.all([
        ctx.db.clashTask.count({ where: { projectId: ctx.projectId } }),
        ctx.db.clashTask.count({ where: { projectId: ctx.projectId, status: "DONE" } }),
      ]);
      return {
        total,
        done,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }),

  aiAudit: editorProcedure
    .input(z.object({ section: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Phase 27 Placeholder: In the future, this will call a Vertex AI model
      // to audit the content against company BIM standards.
      // ctx.projectId is always available from tRPC context

      await new Promise(r => setTimeout(r, 1500)); // Simulate AI thinking

      return {
        score: 92,
        feedback: "Excellent documentation. The clash detection matrix is clearly defined and follows ISO 19650 standards.",
        suggestions: [
          "Add a link to the BIM Execution Plan (BEP)",
          "Highlight the turnaround time for high-priority clashes"
        ]
      };
    }),
});
