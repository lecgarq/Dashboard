#!/usr/bin/env node
/**
 * scripts/scratch/query-status.cjs
 *
 * Invokes the progress monitor status collector directly to verify the output metrics.
 */

const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

// Reuse the exact collector logic from scripts/progress-monitor.cjs
// Since it's a CJS module, we can require it, or we can just require collectStatus if it's exported.
// Wait, it is not exported, but we can copy the collector call or require the file and extract functions if we export them,
// or just invoke our own query using Prisma directly.
// Let's write a direct verification query using the exact same metrics calculations as progress-monitor.cjs to verify!

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function verify() {
  const mtyAllowlist = require(path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json"));
  const mtySet = new Set(mtyAllowlist);
  const backfillRows = await prisma.accDcBackfillProgress.findMany();
  
  const progress = backfillRows
    .filter((r) => mtySet.has(r.projectId))
    .map((r) => ({
      projectId: r.projectId,
      earliestCovered: r.earliestCovered,
      latestCovered: r.latestCovered,
      projectCreatedAt: r.projectCreatedAt,
      newProjectFlag: r.newProjectFlag,
    }));

  const yday = (() => {
    const now = new Date();
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return new Date(utcToday.getTime() - 1);
  })();

  const daysBetween = (a, b) => Math.max(0, Math.round((a.getTime() - b.getTime()) / 86400000));

  let fullyDone = 0, needsBackward = 0, needsForward = 0, newProjects = 0;
  let totalRemainingRequests = 0;
  const backwardList = [];
  const forwardList = [];
  for (const p of progress) {
    const isNew = p.newProjectFlag || !p.earliestCovered || !p.latestCovered;
    if (isNew) {
      newProjects++; totalRemainingRequests += 1;
      continue;
    }
    const backDays = daysBetween(p.earliestCovered, p.projectCreatedAt);
    const fwdDays = daysBetween(yday, p.latestCovered);
    const backSteps = Math.ceil(backDays / 30);
    const fwdSteps = fwdDays > 0 ? 1 : 0;
    totalRemainingRequests += backSteps + fwdSteps;
    if (backSteps > 0) { needsBackward++; backwardList.push({ id: p.projectId, days: backDays }); }
    if (fwdSteps > 0) { needsForward++; forwardList.push({ id: p.projectId, days: fwdDays }); }
    if (backSteps === 0 && fwdSteps === 0) fullyDone++;
  }

  const etaDaysToBackfill = Math.ceil(totalRemainingRequests / 100); // 100 safe budget/day

  console.log("=== MTY EXTRACTION METRICS VERIFICATION ===");
  console.log(`Total MTY Projects tracked: ${progress.length}`);
  console.log(`Fully Done: ${fullyDone}`);
  console.log(`Needs History (Backward): ${needsBackward}`);
  console.log(`Needs Catch-up (Forward): ${needsForward}`);
  console.log(`Brand New: ${newProjects}`);
  console.log(`Total Remaining Requests for MTY Backfill: ${totalRemainingRequests}`);
  console.log(`Estimated Days Left to complete MTY backfill: ${etaDaysToBackfill} days`);
  console.log("===========================================");
}

verify().catch(console.error).finally(() => prisma.$disconnect());
