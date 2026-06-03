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
    console.log("=== CHECKING ACTIVITY DATE RANGES FOR TOP PROJECTS ===\n");

    const ranges = await prisma.$queryRaw`
      SELECT 
        ap.id,
        ap.name,
        MIN(aa."createdAt") as "minDate",
        MAX(aa."createdAt") as "maxDate",
        COUNT(aa.id)::int as "count"
      FROM "AccProject" ap
      JOIN "AccActivity" aa ON aa."projectId" = ap.id
      WHERE ap.id IN (
        '2752ab7b-0911-4c96-b9ab-e090f3b364e3', -- MXL PSF Planta Conversión QRO
        '03a120e6-99eb-41e8-a721-2b43431c247e', -- MXL Plateros RED
        'bedf0380-adc8-4f57-b9fc-54d7695fb139', -- FWD Walmart CEDIS Bajío Secos
        '2522c60e-02a5-45aa-ae12-6e48b9083dce', -- CDMX Platah ESPEC 01 OMEX066
        '5fb6b6a5-690f-4c7b-8f01-2391860a7822'  -- MXL Siemens Energy STM300
      )
      GROUP BY ap.id, ap.name
    `;

    ranges.forEach((r) => {
      console.log(`Project: ${r.name}`);
      console.log(`  - Count: ${r.count.toLocaleString()}`);
      console.log(`  - Min Date: ${r.minDate}`);
      console.log(`  - Max Date: ${r.maxDate}`);
      console.log("-----------------------------------------");
    });

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
