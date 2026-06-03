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
    const cols = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'AccFolderPermission'
    `;
    cols.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    console.log("\n=== AccFolderPermission SAMPLE ===");
    const sample = await prisma.$queryRaw`SELECT * FROM "AccFolderPermission" LIMIT 2`;
    console.log(JSON.stringify(sample, null, 2));

  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(console.error);
