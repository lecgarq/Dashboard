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
    console.log("=== COLUMNS IN AccProjectMember ===");
    const cols = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'AccProjectMember'
    `;
    cols.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    console.log("\n=== COLUMNS IN AccMemberCache ===");
    const cacheCols = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'AccMemberCache'
    `;
    cacheCols.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    console.log("\n=== AccProjectMember SAMPLE ===");
    const members = await prisma.$queryRaw`
      SELECT * FROM "AccProjectMember" LIMIT 2
    `;
    console.log(JSON.stringify(members, null, 2));

  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(console.error);
