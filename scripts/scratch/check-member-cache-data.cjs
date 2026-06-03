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
    const res = await prisma.$queryRaw`
      SELECT data 
      FROM "AccMemberCache" 
      LIMIT 1
    `;
    console.log("=== AccMemberCache data JSONB SAMPLE ===");
    console.log(JSON.stringify(res, null, 2));

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
