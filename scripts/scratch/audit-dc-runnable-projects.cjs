#!/usr/bin/env node
const dotenv = (() => {
  try {
    return require("dotenv");
  } catch {
    return null;
  }
})();
if (dotenv) dotenv.config();
require("tsx/cjs");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  planDailySlice,
} = require("../../lib/acc/dcProgressiveBackfill");
const {
  isLowValueExtractionProjectName,
} = require("../../lib/acc/dcProjectEligibility");

const DAY = 86_400_000;

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });

  try {
    const now = new Date();
    const utcToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const yesterday = new Date(utcToday.getTime() - 1);

    const [progressRows, projects] = await Promise.all([
      prisma.accDcBackfillProgress.findMany(),
      prisma.accDcProject.findMany({ select: { id: true, name: true } }),
    ]);
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    const progress = progressRows.map((row) => ({
      projectId: row.projectId,
      projectName: nameById.get(row.projectId) || null,
      earliestCovered: row.earliestCovered,
      latestCovered: row.latestCovered,
      projectCreatedAt:
        row.projectCreatedAt || new Date(utcToday.getTime() - 365 * DAY),
      newProjectFlag: row.newProjectFlag,
    }));

    const plan = planDailySlice(progress, yesterday, {
      filterProjectEligibility: true,
    });
    const runnableIds = new Set(
      plan.slices.flatMap((slice) => slice.projectIds),
    );
    const bad = [...runnableIds]
      .map((id) => ({ id, name: nameById.get(id) || "" }))
      .filter((project) => isLowValueExtractionProjectName(project.name));

    console.log("=== DC RUNNABLE PROJECT AUDIT ===");
    console.log(`progressRows=${progressRows.length}`);
    console.log(`slices=${plan.slices.length}`);
    console.log(`runnableProjects=${runnableIds.size}`);
    console.log(`excludedKeywordRunnable=${bad.length}`);
    if (bad.length > 0) {
      for (const p of bad) console.log(`BAD ${p.id} ${p.name}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
