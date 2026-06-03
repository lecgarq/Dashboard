#!/usr/bin/env node
/**
 * scripts/scratch/run-bulk-mty-folders.cjs
 *
 * A high-concurrency wrapper around folder-crawl-cron.cjs.
 * 1. Find all active Monterrey (MTY) projects that are NOT yet successfully crawled (status in never, partial, failed).
 * 2. Set them in the FOLDER_CRAWL_PROJECT_IDS environment variable.
 * 3. Invoke folder-crawl-cron.cjs to perform the crawl in bulk (parallel fanning under pLimit(5)).
 *
 * This crawls everything with ZERO Data Connector quota usage!
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const path = require("node:path");
const fs = require("node:fs");

require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL or DIRECT_URL must be set");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1 }),
  });

  try {
    console.log("=== PREPARING BULK FOLDER CRAWL FOR MONTERREY PROJECTS ===");

    // Find active Monterrey projects whose folderCrawlStatus is never, partial, or failed
    const mtyProjects = await prisma.accProject.findMany({
      where: {
        status: "active",
        folderCrawlStatus: { in: ["never", "partial", "failed"] },
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" },
    });

    console.log(`Found ${mtyProjects.length} active MTY projects requiring folder crawl.`);

    if (mtyProjects.length === 0) {
      console.log("All active Monterrey projects are already successfully crawled! Nothing to do.");
      return;
    }

    const idsList = mtyProjects.map((p) => p.id).join(",");
    
    // Inject the target project IDs and statuses into environment variables
    process.env.FOLDER_CRAWL_PROJECT_IDS = idsList;
    process.env.FOLDER_CRAWL_STATUSES = "never,partial,failed";
    
    console.log("Targeting MTY Projects:");
    mtyProjects.forEach((p, idx) => {
      console.log(`  ${idx + 1}. [${p.folderCrawlStatus}] ${p.name} (${p.id})`);
    });

    console.log("\nStarting bulk parallel crawler via folder-crawl-cron.cjs...");
    console.log("This will crawl 5 projects in parallel (using standard 2-legged tokens, ZERO quota used).");
    console.log("--------------------------------------------------------------------------------\n");

    // Close database connection before handing over control to folder-crawl-cron
    await prisma.$disconnect();

    // Load and run the cron script
    require("../folder-crawl-cron.cjs");

  } catch (err) {
    console.error("Error in bulk crawler wrapper:", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
