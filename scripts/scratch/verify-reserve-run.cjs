#!/usr/bin/env node
// Read-only verification of the 2026-05-25 value-first reserve run.
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
  try {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);

    const runsToday = await prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { id: true, status: true, quotaUsed: true, projectsProcessed: true, startedAt: true, rowsByModule: true },
      orderBy: { startedAt: "asc" },
    });
    const legacyToday = await prisma.accDataConnectorJob.count({ where: { startedAt: { gte: start, lt: end } } });
    const quotaToday = runsToday.reduce((a, r) => a + (r.quotaUsed || 0), 0) + legacyToday;

    console.log("=== AccDcIngestRun rows today (UTC) ===");
    for (const r of runsToday) {
      console.log(`  ${r.startedAt.toISOString()} status=${r.status} quotaUsed=${r.quotaUsed} projectsProcessed=${r.projectsProcessed}`);
    }
    console.log(`Legacy AccDataConnectorJob rows today: ${legacyToday}`);
    console.log(`>>> FINAL quotaUsed today (runs + legacy): ${quotaToday}  (hard cap 25)`);

    const total = await prisma.accActivity.count();
    console.log(`\nAccActivity total rows now: ${total.toLocaleString()}`);

    // Backfill progress for the two successful-slice samples + recently-updated rows
    const recent = await prisma.accDcBackfillProgress.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { projectId: true, earliestCovered: true, latestCovered: true, newProjectFlag: true, updatedAt: true },
    });
    console.log(`\n=== 8 most-recently-updated AccDcBackfillProgress rows ===`);
    for (const b of recent) {
      const e = b.earliestCovered ? b.earliestCovered.toISOString().slice(0,10) : "null";
      const l = b.latestCovered ? b.latestCovered.toISOString().slice(0,10) : "null";
      console.log(`  upd=${b.updatedAt.toISOString()} cov=[${e} → ${l}] newFlag=${b.newProjectFlag} proj=${b.projectId.slice(0,8)}`);
    }
    const updatedInLastHour = await prisma.accDcBackfillProgress.count({
      where: { updatedAt: { gte: new Date(Date.now() - 3600_000) } },
    });
    console.log(`\nBackfillProgress rows updated in the last hour: ${updatedInLastHour}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch(e => { console.error(e); process.exit(1); });
