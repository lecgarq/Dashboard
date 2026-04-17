import type { PrismaClient } from "@prisma/client";

import simEvents from "@/lib/events/sim";

import { createModuleRouter } from "./module-router";

export const simRouter = createModuleRouter({
  driveBackupPrefix: "sim-wiki",
  events: simEvents,
  listWikiSections: (db: PrismaClient, projectId: string) =>
    db.simWiki.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
  createMissingDefaultSections: (db: PrismaClient, input) =>
    db.simWiki.createMany({
      data: input.data,
      skipDuplicates: true,
    }),
  findWikiSection: (db: PrismaClient, uniqueSection: string) =>
    db.simWiki.findUnique({
      where: { section: uniqueSection },
      select: { id: true, order: true },
    }),
  getMaxWikiOrder: async (db: PrismaClient, projectId: string) =>
    (await db.simWiki.aggregate({
      where: { projectId },
      _max: { order: true },
    }))._max.order ?? null,
  upsertWikiSection: (db: PrismaClient, input) =>
    db.simWiki.upsert({
      where: { section: input.section },
      update: {
        title: input.title,
        content: input.content,
        status: input.status,
      },
      create: {
        projectId: input.projectId,
        section: input.section,
        title: input.title,
        content: input.content,
        status: input.status ?? "DRAFT",
        order: input.order,
      },
    }),
  updateWikiStatus: (db: PrismaClient, uniqueSection: string, status: string) =>
    db.simWiki.update({
      where: { section: uniqueSection },
      data: { status },
    }),
  deleteWikiSection: (db: PrismaClient, uniqueSection: string) =>
    db.simWiki.delete({
      where: { section: uniqueSection },
      select: { id: true, section: true },
    }),
  reorderWikiSection: (db: PrismaClient, uniqueSection: string, order: number) =>
    db.simWiki.update({
      where: { section: uniqueSection },
      data: { order },
    }),
  listTasks: (db: PrismaClient, projectId: string) =>
    db.simTask.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { order: "asc" }],
    }),
  countTasks: (db: PrismaClient, input) =>
    db.simTask.count({
      where: {
        projectId: input.projectId,
        ...(input.status ? { status: input.status } : {}),
      },
    }),
  createTask: (db: PrismaClient, input) =>
    db.simTask.create({
      data: input,
    }),
  updateTask: (db: PrismaClient, id: string, data) =>
    db.simTask.update({
      where: { id },
      data,
    }),
  deleteTask: (db: PrismaClient, id: string) =>
    db.simTask.delete({
      where: { id },
      select: { id: true },
    }),
  listReleases: (db: PrismaClient) =>
    db.simToolRelease.findMany({
      orderBy: { releasedAt: "desc" },
    }),
  createRelease: (db: PrismaClient, input) =>
    db.simToolRelease.create({
      data: input,
    }),
  auditFeedback: {
    score: 85,
    feedback:
      "Content is well-structured but missing specific BIM naming convention details for the 'Standard' category.",
    suggestions: [
      "Include a table of family prefixes",
      "Specify the required Revit version for this module",
    ],
  },
});
