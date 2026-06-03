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
    const res = await prisma.accActivity.aggregate({
      where: { projectId: "de161948-703f-413c-979a-8983c70d84d9" },
      _min: { createdAt: true },
      _max: { createdAt: true },
      _count: true
    });

    console.log("=== MTY AE-01 ACTIVITY RANGE ===");
    console.log(JSON.stringify(res, null, 2));

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
