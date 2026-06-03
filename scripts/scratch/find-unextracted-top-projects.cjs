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
    console.log("=== CHECKING PROJECTS UNEXTRACTED MEMBERS RANKED BY ACTIVITY COUNT ===\n");

    const projectsWithActivities = await prisma.$queryRaw`
      SELECT 
        ap.id,
        ap.name,
        ap.status,
        COALESCE(act.act_count, 0) as "activityCount",
        (SELECT COUNT(*)::int FROM "AccProjectMember" apm WHERE apm."projectId" = ap.id) as "memberCount"
      FROM "AccProject" ap
      LEFT JOIN (
        SELECT "projectId", COUNT(*)::int as act_count
        FROM "AccActivity"
        WHERE "projectId" IS NOT NULL AND "projectId" <> ''
        GROUP BY "projectId"
      ) act ON act."projectId" = ap.id
      ORDER BY "memberCount" ASC, "activityCount" DESC
      LIMIT 40
    `;

    console.log("==========================================================================================");
    console.log("   RANK   | MEMBER COUNT | ACTIVITY COUNT | STATUS | PROJECT NAME");
    console.log("==========================================================================================");
    projectsWithActivities.forEach((r, idx) => {
      console.log(`   #${String(idx + 1).padEnd(4)} | ${String(r.memberCount).padStart(12)} | ${String(r.activityCount).toLocaleString().padStart(14)} | ${String(r.status).padEnd(6)} | ${r.name} (${r.id})`);
    });
    console.log("==========================================================================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
