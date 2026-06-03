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
    const totalActive = await prisma.accProject.count({ where: { status: "active" } });
    
    const zeroAct = await prisma.$queryRaw`
      SELECT COUNT(*)::int as "count"
      FROM "AccProject" ap
      WHERE ap.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM "AccActivity" aa WHERE aa."projectId" = ap.id
        )
    `;

    const zeroActWithMembers = await prisma.$queryRaw`
      SELECT COUNT(*)::int as "count"
      FROM "AccProject" ap
      WHERE ap.status = 'active'
        AND (SELECT COUNT(*)::int FROM "AccProjectMember" apm WHERE apm."projectId" = ap.id) > 0
        AND NOT EXISTS (
          SELECT 1 FROM "AccActivity" aa WHERE aa."projectId" = ap.id
        )
    `;

    console.log(`Total Active Projects in DB: ${totalActive}`);
    console.log(`Active Projects with ZERO activity logs: ${zeroAct[0].count}`);
    console.log(`Active Projects with ZERO activity logs but HAVE extracted members: ${zeroActWithMembers[0].count}`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
