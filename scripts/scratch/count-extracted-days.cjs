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
    // 1. Min/Max dates and unique calendar days count
    const stats = await prisma.$queryRaw`
      SELECT 
        MIN("createdAt") as "minDate", 
        MAX("createdAt") as "maxDate",
        COUNT(DISTINCT DATE("createdAt"))::int as "uniqueDaysCount",
        COUNT(*)::int as "totalCount"
      FROM "AccActivity"
    `;

    const minDate = new Date(stats[0].minDate);
    const maxDate = new Date(stats[0].maxDate);
    const totalCount = stats[0].totalCount;
    const uniqueDaysCount = stats[0].uniqueDaysCount;

    // Calculate span duration in days
    const diffTime = Math.abs(maxDate - minDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    console.log("=========================================");
    console.log("     ACTIVITY TEMPORAL COVERAGE AUDIT    ");
    console.log("=========================================");
    console.log(`Earliest Extracted Activity : ${minDate.toUTCString()}`);
    console.log(`Latest Extracted Activity   : ${maxDate.toUTCString()}`);
    console.log(`Total Days Span             : ${diffDays} calendar days`);
    console.log(`Unique Days with Activity   : ${uniqueDaysCount} days`);
    console.log(`Total Extracted Activity Logs: ${totalCount.toLocaleString()} logs`);
    console.log("=========================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
