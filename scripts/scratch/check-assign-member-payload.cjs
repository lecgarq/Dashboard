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
      SELECT "userEmail", "autodeskId", "details", "createdAt" 
      FROM "AccActivity" 
      WHERE "rawAction" = 'assign-member' 
      LIMIT 10
    `;
    console.log("=== assign-member PAYLOAD SAMPLES ===");
    console.log(JSON.stringify(res, null, 2));

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
