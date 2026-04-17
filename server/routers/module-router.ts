import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

import { upsertDriveJsonFile } from "@/lib/google/drive";
import { moduleTaskStatusSchema, wikiStatusSchema } from "@/lib/shared/module-schemas";
import { DEFAULT_WIKI_SECTIONS, normalizeWikiSectionKey } from "@/lib/wiki/sections";
import { ensureUniqueSection } from "@/lib/wiki/utils";

import { editorProcedure, protectedProcedure, router } from "../trpc";

type ModuleWikiRecord = {
  id: string;
  projectId: string;
  section: string;
  title: string;
  content: string;
  status: string;
  order: number;
  updatedAt: Date;
};

type ModuleTaskRecord = {
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
};

type ModuleEventEmitter = {
  emit: (event: "update", payload: unknown) => void;
};

type ModuleRouterConfig = {
  driveBackupPrefix: string;
  events: ModuleEventEmitter;
  listWikiSections: (db: PrismaClient, projectId: string) => Promise<ModuleWikiRecord[]>;
  createMissingDefaultSections: (
    db: PrismaClient,
    input: {
      projectId: string;
      data: Array<{
        projectId: string;
        section: string;
        title: string;
        content: string;
        status: string;
        order: number;
      }>;
    }
  ) => Promise<unknown>;
  findWikiSection: (
    db: PrismaClient,
    uniqueSection: string
  ) => Promise<{ id: string; order: number } | null>;
  getMaxWikiOrder: (db: PrismaClient, projectId: string) => Promise<number | null>;
  upsertWikiSection: (
    db: PrismaClient,
    input: {
      projectId: string;
      section: string;
      title: string;
      content: string;
      status?: string;
      order: number;
    }
  ) => Promise<ModuleWikiRecord>;
  updateWikiStatus: (
    db: PrismaClient,
    uniqueSection: string,
    status: string
  ) => Promise<ModuleWikiRecord>;
  deleteWikiSection: (
    db: PrismaClient,
    uniqueSection: string
  ) => Promise<{ id: string; section: string }>;
  reorderWikiSection: (
    db: PrismaClient,
    uniqueSection: string,
    order: number
  ) => Promise<unknown>;
  listTasks: (db: PrismaClient, projectId: string) => Promise<ModuleTaskRecord[]>;
  countTasks: (
    db: PrismaClient,
    input: { projectId: string; status?: string }
  ) => Promise<number>;
  createTask: (
    db: PrismaClient,
    input: {
      projectId: string;
      title: string;
      description?: string;
      status: string;
      milestone?: string;
      dueDate?: Date;
      owner?: string;
      order: number;
    }
  ) => Promise<ModuleTaskRecord>;
  updateTask: (
    db: PrismaClient,
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: string;
      milestone?: string;
      dueDate?: Date | null;
      owner?: string;
      isBlocked?: boolean;
      order?: number;
    }
  ) => Promise<ModuleTaskRecord>;
  deleteTask: (db: PrismaClient, id: string) => Promise<{ id: string }>;
  listReleases: (db: PrismaClient) => Promise<unknown[]>;
  createRelease: (
    db: PrismaClient,
    input: {
      version: string;
      changelog: string;
      downloadUrl?: string;
      testCases?: string;
    }
  ) => Promise<unknown>;
  auditFeedback: {
    score: number;
    feedback: string;
    suggestions: string[];
  };
};

function serializeTask(task: ModuleTaskRecord) {
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

async function backupWikiToDrive(
  config: ModuleRouterConfig,
  db: PrismaClient,
  projectId: string
) {
  const sections = await config.listWikiSections(db, projectId);

  await upsertDriveJsonFile(`${config.driveBackupPrefix}-${projectId}.json`, {
    projectId,
    updatedAt: new Date().toISOString(),
    sections: sections.map((section) => ({
      section: section.section,
      title: section.title,
      content: section.content,
      status: section.status,
      order: section.order,
    })),
  });
}

async function ensureDefaultWikiSections(
  config: ModuleRouterConfig,
  db: PrismaClient,
  projectId: string
) {
  const existing = await config.listWikiSections(db, projectId);

  const existingKeys = new Set(
    existing.map((section) => normalizeWikiSectionKey(section.section))
  );
  const missingDefaults = DEFAULT_WIKI_SECTIONS.filter(
    (section) => !existingKeys.has(section.section)
  );

  if (missingDefaults.length === 0) {
    return existing;
  }

  await config.createMissingDefaultSections(db, {
    projectId,
    data: missingDefaults.map((section) => ({
      projectId,
      section: ensureUniqueSection(projectId, section.section),
      title: section.title,
      content: "",
      status: "DRAFT",
      order: section.order,
    })),
  });

  return config.listWikiSections(db, projectId);
}

export function createModuleRouter(config: ModuleRouterConfig) {
  return router({
    getWikiSections: protectedProcedure.query(async ({ ctx }) => {
      return ensureDefaultWikiSections(config, ctx.db, ctx.projectId);
    }),

    upsertWikiSection: editorProcedure
      .input(
        z.object({
          section: z.string(),
          title: z.string(),
          content: z.string(),
          status: wikiStatusSchema.optional(),
          order: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const cleanSection = ensureUniqueSection(ctx.projectId, input.section);
        const sectionKey = normalizeWikiSectionKey(input.section);
        const defaultSection = DEFAULT_WIKI_SECTIONS.find(
          (section) => section.section === sectionKey
        );

        const existing = await config.findWikiSection(ctx.db, cleanSection);
        const maxOrder = existing
          ? existing.order
          : (await config.getMaxWikiOrder(ctx.db, ctx.projectId)) ?? -1;
        const createOrder = input.order ?? defaultSection?.order ?? maxOrder + 1;

        const result = await config.upsertWikiSection(ctx.db, {
          projectId: ctx.projectId,
          section: cleanSection,
          title: input.title,
          content: input.content,
          status: input.status,
          order: createOrder,
        });

        config.events.emit("update", {
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

        void backupWikiToDrive(config, ctx.db, ctx.projectId);

        return result;
      }),

    updateWikiStatus: editorProcedure
      .input(z.object({ section: z.string(), status: wikiStatusSchema }))
      .mutation(async ({ ctx, input }) => {
        const uniqueSection = ensureUniqueSection(ctx.projectId, input.section);
        const updated = await config.updateWikiStatus(ctx.db, uniqueSection, input.status);

        config.events.emit("update", {
          type: "wiki-status",
          projectId: ctx.projectId,
          wiki: {
            id: updated.id,
            section: updated.section,
            status: updated.status,
            updatedAt: updated.updatedAt.toISOString(),
          },
        });

        void backupWikiToDrive(config, ctx.db, ctx.projectId);

        return updated;
      }),

    deleteWikiSection: editorProcedure
      .input(z.object({ section: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const uniqueSection = ensureUniqueSection(ctx.projectId, input.section);
        const deleted = await config.deleteWikiSection(ctx.db, uniqueSection);

        config.events.emit("update", {
          type: "wiki-deleted",
          projectId: ctx.projectId,
          section: input.section,
        });

        void backupWikiToDrive(config, ctx.db, ctx.projectId);

        return deleted;
      }),

    reorderWikiSections: editorProcedure
      .input(z.array(z.object({ section: z.string(), order: z.number() })))
      .mutation(async ({ ctx, input }) => {
        await Promise.all(
          input.map((item) =>
            config.reorderWikiSection(
              ctx.db,
              ensureUniqueSection(ctx.projectId, item.section),
              item.order
            )
          )
        );

        config.events.emit("update", {
          type: "wiki-list-reordered",
          projectId: ctx.projectId,
        });

        void backupWikiToDrive(config, ctx.db, ctx.projectId);

        return { success: true };
      }),

    getTasks: protectedProcedure.query(async ({ ctx }) => {
      return config.listTasks(ctx.db, ctx.projectId);
    }),

    createTask: editorProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          status: moduleTaskStatusSchema.optional(),
          milestone: z.string().optional(),
          dueDate: z.date().optional(),
          owner: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const status = input.status ?? "PLANNING";
        const order = await config.countTasks(ctx.db, {
          projectId: ctx.projectId,
          status,
        });
        const task = await config.createTask(ctx.db, {
          projectId: ctx.projectId,
          title: input.title,
          description: input.description,
          status,
          milestone: input.milestone,
          dueDate: input.dueDate,
          owner: input.owner,
          order,
        });

        config.events.emit("update", {
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
          status: moduleTaskStatusSchema.optional(),
          milestone: z.string().optional(),
          dueDate: z.date().nullable().optional(),
          owner: z.string().optional(),
          isBlocked: z.boolean().optional(),
          order: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const task = await config.updateTask(ctx.db, id, data);

        config.events.emit("update", {
          type: "task-updated",
          projectId: ctx.projectId,
          task: serializeTask(task),
        });

        return task;
      }),

    deleteTask: editorProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await config.deleteTask(ctx.db, input.id);

        config.events.emit("update", {
          type: "task-deleted",
          projectId: ctx.projectId,
          taskId: deleted.id,
        });

        return deleted;
      }),

    getReleases: protectedProcedure.query(async ({ ctx }) => {
      return config.listReleases(ctx.db);
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
        return config.createRelease(ctx.db, input);
      }),

    getKPIs: protectedProcedure.query(async ({ ctx }) => {
      const [total, done] = await Promise.all([
        config.countTasks(ctx.db, { projectId: ctx.projectId }),
        config.countTasks(ctx.db, { projectId: ctx.projectId, status: "DONE" }),
      ]);

      return {
        total,
        done,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }),

    auditWiki: protectedProcedure
      .input(z.object({ content: z.string() }))
      .mutation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return config.auditFeedback;
      }),
  });
}
