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
    // 1. Min and Max date in AccActivity
    const range = await prisma.$queryRaw`
      SELECT 
        MIN("createdAt") as "minDate", 
        MAX("createdAt") as "maxDate",
        COUNT(*)::int as "totalCount"
      FROM "AccActivity"
    `;

    console.log("=== ACTIVITY DATE RANGE ===");
    console.log(JSON.stringify(range, null, 2));

    // 2. Activity count grouped by year-month
    const monthlyStats = await prisma.$queryRaw`
      SELECT 
        TO_CHAR("createdAt", 'YYYY-MM') as "month",
        COUNT(*)::int as "count"
      FROM "AccActivity"
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY "month" ASC
    `;

    console.log("\n=== MONTHLY ACTIVITY DISTRIBUTION ===");
    console.log(monthlyStats);

    // 3. Activity count grouped by sourceFile
    const sourceStats = await prisma.$queryRaw`
      SELECT 
        "sourceFile",
        COUNT(*)::int as "count"
      FROM "AccActivity"
      GROUP BY "sourceFile"
    `;

    console.log("\n=== SOURCE FILE DISTRIBUTION ===");
    console.log(sourceStats);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
