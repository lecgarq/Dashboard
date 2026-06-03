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
    console.log("=== QUERYING TOP PROJECTS BY ACTIVITY LOG COUNT ===\n");

    const topActivities = await prisma.$queryRaw`
      SELECT 
        "projectId", 
        COUNT(*)::int as "count" 
      FROM "AccActivity" 
      WHERE "projectId" IS NOT NULL AND "projectId" <> ''
      GROUP BY "projectId" 
      ORDER BY "count" DESC 
      LIMIT 25
    `;

    // Let's resolve the names of these projects
    const results = [];
    for (const item of topActivities) {
      const proj = await prisma.accProject.findUnique({
        where: { id: item.projectId },
        select: { name: true }
      });
      const dcProj = await prisma.accDcProject.findUnique({
        where: { id: item.projectId },
        select: { name: true }
      });

      const name = proj?.name || dcProj?.name || "Unknown Project";
      results.push({
        id: item.projectId,
        name,
        count: item.count
      });
    }

    console.log("==========================================================================");
    console.log("   RANK   | ACTIVITY COUNT | PROJECT NAME");
    console.log("==========================================================================");
    results.forEach((r, idx) => {
      console.log(`   #${String(idx + 1).padEnd(4)} | ${r.count.toLocaleString().padStart(14)} | ${r.name}`);
    });
    console.log("==========================================================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
