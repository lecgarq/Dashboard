#!/usr/bin/env node
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const pmCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "AccProjectMember"`;
    console.log(`AccProjectMember count: ${pmCount[0].count}`);

    const mcCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "AccMemberCache"`;
    console.log(`AccMemberCache count: ${mcCount[0].count}`);

    console.log("\n=== AccMemberCache SAMPLE ===");
    const cacheSample = await prisma.$queryRaw`SELECT * FROM "AccMemberCache" LIMIT 2`;
    console.log(JSON.stringify(cacheSample, null, 2));

    const actCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "AccActivity"`;
    console.log(`AccActivity count: ${actCount[0].count}`);

  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(console.error);
