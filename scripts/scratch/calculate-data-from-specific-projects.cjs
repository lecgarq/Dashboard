#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Search terms requested by the user
  const searchTerms = [
    { label: "1. MTY-AREYA", terms: ["areya"] },
    { label: "2. PROLOGIS PARK APODACA", terms: ["prologis", "apodaca"] },
    { label: "3. DANFOS 02", terms: ["danfos", "02"] },
    { label: "4. DAVISA 03", terms: ["davisa", "03"] },
    { label: "5. CATERPILLAR AZTECA", terms: ["caterpillar", "azteca"] },
    { label: "6. VESTA 04", terms: ["vesta", "04"] },
    { label: "7. HUB", terms: ["hub"] },
  ];

  try {
    const matchedProjectIds = new Set();
    const matchedProjectsInfo = [];

    // First resolve the full set of matching project IDs
    for (const item of searchTerms) {
      const matches = await prisma.accProject.findMany({
        where: {
          AND: item.terms.map(term => ({
            name: {
              contains: term,
              mode: "insensitive"
            }
          }))
        },
        select: { id: true, name: true }
      });

      for (const p of matches) {
        if (!matchedProjectIds.has(p.id)) {
          matchedProjectIds.add(p.id);
          matchedProjectsInfo.push(p);
        }
      }
    }

    const projectIdsList = Array.from(matchedProjectIds);

    console.log(`=== CALCULATING DATABASE TELEMETRY FOR ${projectIdsList.length} MATCHING PROJECTS ===\n`);

    // Let's run a query to get counts for all relational tables specifically for these projects
    const activityCount = await prisma.accActivity.count({
      where: { projectId: { in: projectIdsList } }
    });

    const folderCount = await prisma.accFolder.count({
      where: { projectId: { in: projectIdsList } }
    });

    const permissionCount = await prisma.accFolderPermission.count({
      where: { folder: { projectId: { in: projectIdsList } } }
    });

    const memberCount = await prisma.accProjectMember.count({
      where: { projectId: { in: projectIdsList } }
    });

    const roleCount = await prisma.accProjectRole.count({
      where: { projectId: { in: projectIdsList } }
    });

    const backfillCount = await prisma.accDcBackfillProgress.count({
      where: { projectId: { in: projectIdsList } }
    });

    console.log("=========================================");
    console.log("     DETAILED RECORD COUNTS BY MODULE    ");
    console.log("=========================================");
    console.log(`Activity Logs (AccActivity)       : ${activityCount.toLocaleString()} rows`);
    console.log(`Filesystem Folders (AccFolder)    : ${folderCount.toLocaleString()} rows`);
    console.log(`Folder Permissions (AccPermission): ${permissionCount.toLocaleString()} rows`);
    console.log(`Project Members (AccMember)       : ${memberCount.toLocaleString()} rows`);
    console.log(`Project Member Roles (AccRoleLink): ${roleCount.toLocaleString()} rows`);
    console.log(`Backfill Coverage Records         : ${backfillCount.toLocaleString()} rows`);
    console.log("-----------------------------------------");
    
    const grandTotal = activityCount + folderCount + permissionCount + memberCount + roleCount + backfillCount;
    console.log(`GRAND TOTAL ACC RELATIONAL DATA   : ${grandTotal.toLocaleString()} records`);
    console.log("=========================================\n");

    // Breakdown of activity count per project (only for those that have > 0 records)
    const breakdown = [];
    for (const p of matchedProjectsInfo) {
      const cnt = await prisma.accActivity.count({
        where: { projectId: p.id }
      });
      if (cnt > 0) {
        breakdown.push({ name: p.name, count: cnt });
      }
    }

    breakdown.sort((a, b) => b.count - a.count);

    console.log("=== ACTIVITY COUNT BREAKDOWN (TOP EXTRACTED PROJECTS) ===");
    breakdown.forEach((b, idx) => {
      console.log(`${idx + 1}. "${b.name}" -> ${b.count.toLocaleString()} activity logs`);
    });

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
