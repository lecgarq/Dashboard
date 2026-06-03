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
    console.log("=== CHECKING PROJECTS WITH ZERO ACTIVITIES IN ACCACTIVITY ===\n");

    const zeroActivities = await prisma.$queryRaw`
      SELECT 
        ap.id,
        ap.name,
        (SELECT COUNT(*)::int FROM "AccProjectMember" apm WHERE apm."projectId" = ap.id) as "memberCount"
      FROM "AccProject" ap
      LEFT JOIN "AccActivity" aa ON aa."projectId" = ap.id
      WHERE ap.status = 'active'
      GROUP BY ap.id, ap.name
      HAVING COUNT(aa.id) = 0
      ORDER BY "memberCount" DESC
      LIMIT 30
    `;

    console.log("==========================================================================================");
    console.log("   RANK   | MEMBER COUNT | ACTIVITY COUNT | PROJECT NAME");
    console.log("==========================================================================================");
    zeroActivities.forEach((r, idx) => {
      console.log(`   #${String(idx + 1).padEnd(4)} | ${String(r.memberCount).padStart(12)} |              0 | ${r.name} (${r.id})`);
    });
    console.log("==========================================================================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
