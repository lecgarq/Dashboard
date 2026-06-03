#!/usr/bin/env node
/**
 * Quick audit: list projects that have activity data but NOT the 60-day backfill,
 * sorted by row count so we can identify the highest-value targets for remaining quota.
 */
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });

  try {
    // All projects
    const allProjects = await prisma.accDcProject.findMany({ select: { id: true, name: true } });
    const nameMap = new Map(allProjects.map(p => [p.id, p.name]));

    // Activity counts per project
    const activityCounts = await prisma.$queryRawUnsafe(
      `SELECT "projectId", COUNT(*)::int as cnt, MIN("createdAt") as min_ts, MAX("createdAt") as max_ts FROM "AccActivity" WHERE "projectId" IS NOT NULL GROUP BY "projectId" ORDER BY cnt DESC`
    );

    // Backfill status
    const backfill = await prisma.accDcBackfillProgress.findMany();
    const bfMap = new Map(backfill.map(b => [b.projectId, b]));

    // Non-MTY, non-top25 projects that have activity but only 30-day data
    // (i.e., they weren't included in either backfill batch)
    const needsBackfill = activityCounts.filter(r => {
      const bf = bfMap.get(r.projectId);
      if (!bf) return r.cnt > 0; // has activity but no backfill progress record
      // Has backfill record — check if coverage is < 60 days
      const earliest = new Date(bf.earliestCovered);
      const latest = new Date(bf.latestCovered);
      const days = (latest - earliest) / (1000 * 60 * 60 * 24);
      return days < 50; // less than 50 days means it wasn't backfilled
    });

    console.log("=== PROJECTS WITH ACTIVITY THAT STILL NEED HISTORICAL BACKFILL ===");
    console.log(`(These projects have 30-day data but no 60-day backfill)\n`);

    let totalRows = 0;
    for (const r of needsBackfill) {
      const name = nameMap.get(r.projectId) || "UNKNOWN";
      const minD = new Date(r.min_ts).toLocaleDateString();
      const maxD = new Date(r.max_ts).toLocaleDateString();
      console.log(`  ${String(r.cnt).padStart(7)} rows | ${minD} → ${maxD} | ${name}`);
      totalRows += r.cnt;
    }

    console.log(`\n  Total: ${needsBackfill.length} projects, ${totalRows.toLocaleString()} rows`);

    // Now show projects with NO activity at all that are NOT demo/test projects
    const projectsWithActivity = new Set(activityCounts.map(r => r.projectId));
    const realProjectsNoData = allProjects.filter(p => {
      if (projectsWithActivity.has(p.id)) return false;
      const lower = p.name.toLowerCase();
      // Filter out obvious demo/test/template/sample projects
      if (/demo|test|prueba|template|sample|not use|assets|training|workshop|revit exporter|takeoff|lean-vdc|navisworks|gamma|integraciones|insight|collaborate pro|pre-template|introduction/i.test(lower)) return false;
      return true;
    });

    console.log(`\n=== REAL PROJECTS WITH ZERO ACTIVITY DATA ===`);
    console.log(`(Excluding demo/test/template projects)\n`);
    for (const p of realProjectsNoData) {
      console.log(`  - ${p.name}`);
    }
    console.log(`\n  Total: ${realProjectsNoData.length} projects`);

    // Summary
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total projects:              ${allProjects.length}`);
    console.log(`With activity data:          ${activityCounts.length}`);
    console.log(`Backfilled (60-90 days):     ${backfill.length}`);
    console.log(`Need historical backfill:    ${needsBackfill.length}`);
    console.log(`Real projects, zero data:    ${realProjectsNoData.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
