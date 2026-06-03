#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const path = require("node:path");

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function main() {
  console.log("=== LEADERBOARD & BREAKDOWN QUERIES TEST ===\n");

  const mtyAllowlist = require(path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json"));
  const mtySet = new Set(mtyAllowlist);

  // 1. Top MTY projects by activity logs
  const activityLeaderboard = await prisma.$queryRawUnsafe(`
    SELECT "projectId", count(*)::int as count
    FROM "AccActivity"
    WHERE "projectId" IS NOT NULL AND "projectId" != ''
    GROUP BY "projectId"
    ORDER BY count DESC
  `);
  
  // Filter to MTY only
  const mtyActivityLeaderboard = activityLeaderboard
    .filter(row => mtySet.has(row.projectId))
    .slice(0, 6);

  console.log("Top MTY projects by Activity Count:");
  for (const row of mtyActivityLeaderboard) {
    const proj = await prisma.accProject.findUnique({ where: { id: row.projectId }, select: { name: true } });
    console.log(`  • "${proj?.name || row.projectId}": ${row.count.toLocaleString()} rows`);
  }

  // 2. Top MTY projects by folders count
  const folderLeaderboard = await prisma.$queryRawUnsafe(`
    SELECT "projectId", count(*)::int as count
    FROM "AccFolder"
    GROUP BY "projectId"
    ORDER BY count DESC
  `);

  const mtyFolderLeaderboard = folderLeaderboard
    .filter(row => mtySet.has(row.projectId))
    .slice(0, 6);

  console.log("\nTop MTY projects by Folder Count:");
  for (const row of mtyFolderLeaderboard) {
    const proj = await prisma.accProject.findUnique({ where: { id: row.projectId }, select: { name: true } });
    console.log(`  • "${proj?.name || row.projectId}": ${row.count.toLocaleString()} folders`);
  }

  // 3. Activity Service breakdown
  const serviceBreakdown = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(service, 'unknown') as service, count(*)::int as count
    FROM "AccActivity"
    GROUP BY service
    ORDER BY count DESC
  `);
  console.log("\nActivity Counts by Service:");
  serviceBreakdown.forEach(row => {
    console.log(`  • ${row.service}: ${row.count.toLocaleString()} rows`);
  });

  // 4. Activity rawAction breakdown
  const actionBreakdown = await prisma.$queryRawUnsafe(`
    SELECT "rawAction", count(*)::int as count
    FROM "AccActivity"
    GROUP BY "rawAction"
    ORDER BY count DESC
    LIMIT 6
  `);
  console.log("\nTop Raw Actions:");
  actionBreakdown.forEach(row => {
    console.log(`  • ${row.rawAction}: ${row.count.toLocaleString()} rows`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
