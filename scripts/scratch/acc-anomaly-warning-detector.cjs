#!/usr/bin/env node
/**
 * scripts/scratch/acc-anomaly-warning-detector.cjs
 *
 * Advanced ACC Anomaly & Abnormal Activity Detector.
 * Scans the 214,080+ activity records to flag potential security or operational risks:
 *
 * 1. Bulk Download Spikes (IP Leak warning)
 * 2. Destructive Activity Spikes (Bulk File Deletion warning)
 * 3. Suspicious Off-Hours Access (Credential Theft/Sharing warning)
 * 4. Rapid Project Hopping (Directory Scraping warning)
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("==========================================================================");
    console.log("             LECG / HERMOSILLO ACC ABNORMAL USE & WARNINGS REPORT          ");
    console.log("==========================================================================\n");

    // ==========================================================================
    // WARNING 1: BULK DOWNLOAD SPIKES (IP LEAK WARNING)
    // Flag any user downloading more than 30 files in a single day.
    // ==========================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" ⚠️ [WARNING 1] INTELLECTUAL PROPERTY PROTECTION: BULK DOWNLOAD SPIKES");
    console.log("--------------------------------------------------------------------------");

    const bulkDownloads = await prisma.$queryRaw`
      SELECT 
        LOWER("userEmail") as email,
        DATE("createdAt") as d_date,
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "rawAction" = 'download-entity' AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), DATE("createdAt")
      HAVING COUNT(*) >= 30
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (bulkDownloads.length > 0) {
      console.log("Detected Download Spikes (Possible template/model harvesting):");
      bulkDownloads.forEach((item, idx) => {
        const fmtDate = new Date(item.d_date).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. User: <${item.email}> downloaded ${item.cnt} files in 1 day [Date: ${fmtDate}]`);
      });
    } else {
      console.log("✅ Zero bulk download spikes detected. All model downloads are within safe standard ranges.");
    }

    // ==========================================================================
    // WARNING 2: DESTRUCTIVE SPURTS (BULK FILE DELETION WARNING)
    // Flag any user executing more than 20 deletions in a single day.
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⚠️ [WARNING 2] DATA INTEGRITY: DESTRUCTIVE FILE DELETION SPURTS");
    console.log("--------------------------------------------------------------------------");

    const bulkDeletions = await prisma.$queryRaw`
      SELECT 
        LOWER("userEmail") as email,
        DATE("createdAt") as d_date,
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "rawAction" IN ('File Deleted', 'delete-entity', 'delete-sheet', 'asset-delete')
        AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), DATE("createdAt")
      HAVING COUNT(*) >= 20
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (bulkDeletions.length > 0) {
      console.log("Detected Deletion Spurts (Possible accidental directory purge):");
      bulkDeletions.forEach((item, idx) => {
        const fmtDate = new Date(item.d_date).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. User: <${item.email}> deleted ${item.cnt} files in 1 day [Date: ${fmtDate}]`);
      });
    } else {
      console.log("✅ Zero bulk deletion spurts detected. All file deletes are safe.");
    }

    // ==========================================================================
    // WARNING 3: SUSPICIOUS OFF-HOURS ACCESS
    // Flag actions executed during late night/early morning hours (10:00 PM - 5:00 AM)
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⚠️ [WARNING 3] SECURITY HYGIENE: SUSPICIOUS OFF-HOURS ACTIVITY");
    console.log("--------------------------------------------------------------------------");

    // Extract hour from createdAt in UTC (corresponds roughly to late night in Mexico CST)
    const offHours = await prisma.$queryRaw`
      SELECT 
        LOWER("userEmail") as email,
        DATE("createdAt") as d_date,
        EXTRACT(HOUR FROM "createdAt")::int as hr,
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE EXTRACT(HOUR FROM "createdAt") >= 3 AND EXTRACT(HOUR FROM "createdAt") <= 9 -- 3 AM to 9 AM UTC is 9 PM to 3 AM CST
        AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), DATE("createdAt"), EXTRACT(HOUR FROM "createdAt")
      HAVING COUNT(*) >= 40
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (offHours.length > 0) {
      console.log("Detected Late-Night High-Volume Operations (Possible credential sharing or scraping):");
      offHours.forEach((item, idx) => {
        const fmtDate = new Date(item.d_date).toISOString().split('T')[0];
        const localHour = (item.hr - 6 + 24) % 24; // Simple conversion to CST
        console.log(`  #${idx + 1}. User: <${item.email}> executed ${item.cnt} actions around ${localHour}:00 CST [Date: ${fmtDate}]`);
      });
    } else {
      console.log("✅ Zero off-hours activity anomalies detected.");
    }

    // ==========================================================================
    // WARNING 4: RAPID PROJECT HOPPING
    // Flag users accessing more than 4 distinct projects in a single 24-hour window.
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⚠️ [WARNING 4] INTELLECTUAL PROPERTY: RAPID PROJECT HOPPING");
    console.log("--------------------------------------------------------------------------");

    const hopping = await prisma.$queryRaw`
      SELECT 
        LOWER("userEmail") as email,
        DATE("createdAt") as d_date,
        COUNT(DISTINCT "projectId")::int as proj_cnt
      FROM "AccActivity"
      WHERE "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
      GROUP BY LOWER("userEmail"), DATE("createdAt")
      HAVING COUNT(DISTINCT "projectId") >= 4
      ORDER BY proj_cnt DESC
      LIMIT 10
    `;

    if (hopping.length > 0) {
      console.log("Detected Project Hopping (Users scraping drawings across multiple projects):");
      hopping.forEach((item, idx) => {
        const fmtDate = new Date(item.d_date).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. User: <${item.email}> accessed ${item.proj_cnt} distinct projects in 1 day [Date: ${fmtDate}]`);
      });
    } else {
      console.log("✅ Zero multi-project hopping anomalies detected.");
    }
    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
