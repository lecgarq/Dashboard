#!/usr/bin/env node
/**
 * scripts/scratch/mty-top-projects-audit.cjs
 *
 * Compiles a comprehensive leaderboard and audit of Monterrey projects
 * that HAVE data vs those that NEED data (incomplete or not yet backfilled).
 * Generates docs/mty-top-projects-report.md.
 */

require("dotenv").config();
const path = require("node:path");
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 1 }) });

async function main() {
  const mtyAllowlistPath = path.resolve(__dirname, "..", "..", "lib", "acc", "mty-allowlist.json");
  const rawAllowlist = require(mtyAllowlistPath);
  const mtySet = new Set(rawAllowlist);

  // Load all projects in the database
  const dbProjects = await prisma.accProject.findMany({
    select: { id: true, name: true, folderCrawlStatus: true }
  });

  // Filter to only allowlisted MTY projects
  const mtyProjects = dbProjects.filter(p => mtySet.has(p.id));

  // Fetch backfill progress for all these projects
  const backfills = await prisma.accDcBackfillProgress.findMany({
    where: { projectId: { in: rawAllowlist } }
  });
  const backfillMap = new Map(backfills.map(b => [b.projectId, b]));

  // Compile stats for each project
  const projectStats = [];
  for (const p of mtyProjects) {
    const activityCount = await prisma.accActivity.count({
      where: { projectId: p.id }
    });

    const folderCount = await prisma.accFolder.count({
      where: { projectId: p.id }
    });

    const backfill = backfillMap.get(p.id);
    
    projectStats.push({
      id: p.id,
      name: p.name,
      crawlStatus: p.folderCrawlStatus,
      activityCount,
      folderCount,
      earliestCovered: backfill?.earliestCovered || null,
      latestCovered: backfill?.latestCovered || null,
      hasBackfill: !!backfill
    });
  }

  // Categories:
  // 1. Projects with Data (sorted by Activity Count descending)
  const projectsWithData = projectStats
    .filter(p => p.activityCount > 0)
    .sort((a, b) => b.activityCount - a.activityCount);

  // 2. Projects that NEED Data - Incomplete backfills (Sorted by Indexed Folder Count Descending)
  const projectsNeedingData = projectStats
    .filter(p => p.activityCount === 0)
    .sort((a, b) => b.folderCount - a.folderCount);

  // Write comprehensive report to file
  let md = "# Monterrey (MTY) Projects - Data Status Report\n\n";
  md += `Report generated at: **${new Date().toLocaleString()}**\n\n`;
  md += `## Summary Dashboard\n`;
  md += `- **Total Pure MTY Projects Mapped**: ${mtyProjects.length}\n`;
  md += `- **Projects that HAVE Data (Extracted Activities > 0)**: ${projectsWithData.length}\n`;
  md += `- **Projects that NEED Data (Activities = 0)**: ${projectsNeedingData.length}\n`;
  const totalFoldersIndexed = projectStats.reduce((sum, p) => sum + p.folderCount, 0);
  const totalActivitiesExtracted = projectStats.reduce((sum, p) => sum + p.activityCount, 0);
  md += `- **Total Indexed Folders across MTY**: ${totalFoldersIndexed}\n`;
  md += `- **Total Extracted Activities across MTY**: ${totalActivitiesExtracted.toLocaleString()}\n\n`;

  md += `## 🏆 MTY Projects That HAVE Data (${projectsWithData.length})\n`;
  md += `These projects have been successfully extracted and have live activity logs.\n\n`;
  md += "| Rank | Activity Rows | Folders Indexed | Project Name | Project ID | Date Range Covered |\n";
  md += "|------|---------------|-----------------|--------------|------------|---------------------|\n";
  projectsWithData.forEach((p, idx) => {
    const range = p.earliestCovered ? `${p.earliestCovered.toISOString().slice(0,10)} to ${p.latestCovered.toISOString().slice(0,10)}` : "N/A";
    md += `| ${idx + 1} | ${p.activityCount.toLocaleString()} | ${p.folderCount} | ${p.name} | \`${p.id}\` | ${range} |\n`;
  });

  md += `\n## 🚀 MTY Projects That NEED Data (Top 50 by Folders Indexed)\n`;
  md += `These projects currently have 0 activity logs, ordered by structural size (folder count).\n\n`;
  md += "| Rank | Folders Indexed | Crawl Status | Project Name | Project ID |\n";
  md += "|------|-----------------|--------------|--------------|------------|\n";
  projectsNeedingData.forEach((p, idx) => {
    md += `| ${idx + 1} | ${p.folderCount} | ${p.crawlStatus} | ${p.name} | \`${p.id}\` |\n`;
  });

  const outputPath = path.resolve(__dirname, "..", "..", "docs", "mty-top-projects-report.md");
  fs.writeFileSync(outputPath, md);

  // Print concise summary to console
  console.log("=== MONTERREY PROJECTS SUMMARY ===");
  console.log(`- MTY Projects with Data (HAVE): ${projectsWithData.length}`);
  console.log(`- MTY Projects with 0 Activities (NEED): ${projectsNeedingData.length}`);
  console.log(`- Total MTY Projects Mapped: ${mtyProjects.length}`);
  console.log(`- Wrote full report to: docs/mty-top-projects-report.md\n`);

  console.log("TOP 25 PROJECTS THAT HAVE DATA:");
  console.log("==========================================================================");
  projectsWithData.slice(0, 25).forEach((p, idx) => {
    console.log(`${String(idx + 1).padStart(2, " ")}. [Rows: ${p.activityCount.toLocaleString().padStart(8)}] "${p.name}" (${p.id})`);
  });

  console.log("\nTOP 25 PROJECTS THAT NEED DATA (by highest folder counts):");
  console.log("==========================================================================");
  projectsNeedingData.slice(0, 25).forEach((p, idx) => {
    console.log(`${String(idx + 1).padStart(2, " ")}. [Folders: ${String(p.folderCount).padStart(5)}] "${p.name}" (${p.id})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
