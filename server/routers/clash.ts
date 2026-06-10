import type { PrismaClient } from "@prisma/client";

import clashEvents from "@/lib/events/clash";

import { createModuleRouter } from "./module-router";

export const clashRouter = createModuleRouter({
  driveBackupPrefix: "clash-wiki",
  events: clashEvents,
  listWikiSections: (db: PrismaClient, projectId: string) =>
    db.clashWiki.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
  createMissingDefaultSections: (db: PrismaClient, input) =>
    db.clashWiki.createMany({
      data: input.data,
      skipDuplicates: true,
    }),
  findWikiSection: (db: PrismaClient, uniqueSection: string) =>
    db.clashWiki.findUnique({
      where: { section: uniqueSection },
      select: { id: true, order: true },
    }),
  getMaxWikiOrder: async (db: PrismaClient, projectId: string) =>
    (await db.clashWiki.aggregate({
      where: { projectId },
      _max: { order: true },
    }))._max.order ?? null,
  upsertWikiSection: (db: PrismaClient, input) =>
    db.clashWiki.upsert({
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
    db.clashWiki.update({
      where: { section: uniqueSection },
      data: { status },
    }),
  deleteWikiSection: (db: PrismaClient, uniqueSection: string) =>
    db.clashWiki.delete({
      where: { section: uniqueSection },
      select: { id: true, section: true },
    }),
  reorderWikiSection: (db: PrismaClient, uniqueSection: string, order: number) =>
    db.clashWiki.update({
      where: { section: uniqueSection },
      data: { order },
    }),
  listTasks: (db: PrismaClient, projectId: string) =>
    db.clashTask.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { order: "asc" }],
    }),
  countTasks: (db: PrismaClient, input) =>
    db.clashTask.count({
      where: {
        projectId: input.projectId,
        ...(input.status ? { status: input.status } : {}),
      },
    }),
  createTask: (db: PrismaClient, input) =>
    db.clashTask.create({
      data: input,
    }),
  updateTask: (db: PrismaClient, id: string, data) =>
    db.clashTask.update({
      where: { id },
      data,
    }),
  deleteTask: (db: PrismaClient, id: string) =>
    db.clashTask.delete({
      where: { id },
      select: { id: true },
    }),
  auditFeedback: {
    score: 92,
    feedback:
      "Excellent documentation. The clash detection matrix is clearly defined and follows ISO 19650 standards.",
    suggestions: [
      "Add a link to the BIM Execution Plan (BEP)",
      "Highlight the turnaround time for high-priority clashes",
    ],
  },
});
