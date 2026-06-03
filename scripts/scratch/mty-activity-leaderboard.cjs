#!/usr/bin/env node
/**
 * scripts/scratch/mty-activity-leaderboard.cjs
 *
 * Queries the database for all Monterrey projects, gets their logged activity counts,
 * and prints a descending leaderboard of most active projects.
 */

require("dotenv").config();
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function main() {
  console.log("=== MONTERREY PROJECTS ACTIVITY LEADERBOARD ===\n");

  const mtyAllowlist = require(path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json"));
  const mtySet = new Set(mtyAllowlist);

  // Fetch all active/inactive projects
  const dbProjects = await prisma.accProject.findMany({
    select: { id: true, name: true }
  });

  const mtyProjects = dbProjects.filter(p => mtySet.has(p.id));
  console.log(`Analyzing ${mtyProjects.length} Monterrey projects...\n`);

  const leaderboard = [];
  for (const p of mtyProjects) {
    const activityCount = await prisma.accActivity.count({
      where: { projectId: p.id }
    });

    const backfill = await prisma.accDcBackfillProgress.findUnique({
      where: { projectId: p.id }
    });

    leaderboard.push({
      id: p.id,
      name: p.name,
      count: activityCount,
      earliest: backfill?.earliestCovered || null,
      latest: backfill?.latestCovered || null
    });
  }

  // Sort by count descending
  leaderboard.sort((a, b) => b.count - a.count);

  console.log("RANK | ROW COUNT   | PROJECT NAME (ID)");
  console.log("-----|-------------|------------------");
  
  // Filter to those with > 0 activities or show top 25
  const topActive = leaderboard.filter(item => item.count > 0);
  
  topActive.forEach((item, idx) => {
    const rank = String(idx + 1).padStart(3, " ");
    const formattedCount = String(item.count.toLocaleString()).padStart(11, " ");
    console.log(`${rank}  | ${formattedCount} | "${item.name}" (${item.id})`);
    if (item.earliest) {
      console.log(`     |             |   Range: ${new Date(item.earliest).toLocaleDateString()} to ${new Date(item.latest).toLocaleDateString()}`);
    }
  });

  console.log("\n===============================================");
  console.log(`Total MTY projects with >0 activities: ${topActive.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
