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

  // The search terms requested by the user:
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
    console.log("=== SPECIFIC PROJECTS EXTRACTION STATUS CHECK ===\n");

    for (const item of searchTerms) {
      console.log(`Searching for: "${item.label}" (Keywords: ${item.terms.join(", ")})`);

      // Search projects that match ALL keywords in the name
      const matches = await prisma.accProject.findMany({
        where: {
          AND: item.terms.map(term => ({
            name: {
              contains: term,
              mode: "insensitive"
            }
          }))
        },
        select: {
          id: true,
          name: true,
          status: true,
          folderCrawlStatus: true
        }
      });

      if (matches.length === 0) {
        console.log("❌ No matching projects found in database.");
      } else {
        console.log(`Found ${matches.length} matching project(s):`);
        for (const p of matches) {
          const activityCount = await prisma.accActivity.count({
            where: { projectId: p.id }
          });

          const backfill = await prisma.accDcBackfillProgress.findUnique({
            where: { projectId: p.id }
          });

          console.log(`   - Name: "${p.name}"`);
          console.log(`     ID: ${p.id}`);
          console.log(`     Status: ${p.status} | Folder Crawl: ${p.folderCrawlStatus}`);
          console.log(`     Extracted Activity Log Count: ${activityCount.toLocaleString()} rows`);
          if (backfill?.earliestCovered) {
            console.log(`     Backfill Range: ${new Date(backfill.earliestCovered).toLocaleDateString()} to ${new Date(backfill.latestCovered).toLocaleDateString()}`);
          } else {
            console.log(`     Backfill Range: None`);
          }
        }
      }
      console.log("----------------------------------------------------------------------\n");
    }

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
