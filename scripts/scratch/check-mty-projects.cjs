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
    const mtyLiveProjects = await prisma.accProject.findMany({
      where: {
        name: {
          startsWith: "MTY",
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        name: true,
        status: true,
        folderCrawlStatus: true
      },
      orderBy: { name: "asc" }
    });

    const results = [];
    for (const p of mtyLiveProjects) {
      const activityCount = await prisma.accActivity.count({
        where: { projectId: p.id }
      });
      
      const backfill = await prisma.accDcBackfillProgress.findUnique({
        where: { projectId: p.id }
      });

      if (activityCount > 0 || backfill?.earliestCovered) {
        results.push({
          id: p.id,
          name: p.name,
          status: p.status,
          folderCrawlStatus: p.folderCrawlStatus,
          activityCount,
          earliestCovered: backfill?.earliestCovered || null,
          latestCovered: backfill?.latestCovered || null
        });
      }
    }

    console.log(`=== MTY PROJECTS WITH EXTRACTED ACTIVITIES (${results.length} / ${mtyLiveProjects.length}) ===\n`);
    
    results.forEach((r, idx) => {
      console.log(`${idx + 1}. Project Name: "${r.name}"`);
      console.log(`   Project URN ID: ${r.id}`);
      console.log(`   Activity Count: ${r.activityCount.toLocaleString()} rows`);
      if (r.earliestCovered) {
        console.log(`   Extracted Range: ${new Date(r.earliestCovered).toLocaleDateString()} to ${new Date(r.latestCovered).toLocaleDateString()}`);
      } else {
        console.log(`   Extracted Range: Inferred from default/nightly activity ingestion`);
      }
      console.log("----------------------------------------------------------------------");
    });

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
