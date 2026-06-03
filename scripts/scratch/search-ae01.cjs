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

  try {
    console.log("=== SEARCHING FOR PROJECTS MATCHING 'AE-01' OR SIMILAR ===\n");

    const searchPatterns = [
      "ae-01", "ae01", "ae", "maty", "mty"
    ];

    // Let's search live projects for names containing "ae" (case-insensitive)
    const matches = await prisma.accProject.findMany({
      where: {
        OR: [
          { name: { contains: "ae-01", mode: "insensitive" } },
          { name: { contains: "ae01", mode: "insensitive" } },
          { name: { contains: "ae", mode: "insensitive" } },
        ]
      },
      select: {
        id: true,
        name: true,
        status: true,
        folderCrawlStatus: true
      },
      orderBy: { name: "asc" }
    });

    console.log(`Found ${matches.length} matching project(s) containing "ae", "ae01" or "ae-01":`);
    for (const p of matches) {
      const activityCount = await prisma.accActivity.count({
        where: { projectId: p.id }
      });
      const backfill = await prisma.accDcBackfillProgress.findUnique({
        where: { projectId: p.id }
      });

      console.log(`- Name: "${p.name}"`);
      console.log(`  ID: ${p.id}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  Extracted Activity Count: ${activityCount}`);
      if (backfill?.earliestCovered) {
        console.log(`  Backfill Range: ${new Date(backfill.earliestCovered).toLocaleDateString()} to ${new Date(backfill.latestCovered).toLocaleDateString()}`);
      }
      console.log("--------------------------------------------------");
    }

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
