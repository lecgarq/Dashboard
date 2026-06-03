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
    console.log("=== CHECKING BACKFILL PROGRESS FOR TOP 25 PROJECTS ===\n");

    const topProjectIds = [
      '2752ab7b-0911-4c96-b9ab-e090f3b364e3',
      '03a120e6-99eb-41e8-a721-2b43431c247e',
      'bedf0380-adc8-4f57-b9fc-54d7695fb139',
      '2522c60e-02a5-45aa-ae12-6e48b9083dce',
      '5fb6b6a5-690f-4c7b-8f01-2391860a7822',
      '56c5ba90-fd88-4be9-b0af-2f2e7c0ed6e0',
      '8ac02215-b399-4098-8b2a-1414a9cc4279',
      '242c1430-76f4-4370-8375-7a193998c103',
      '6c6dd2eb-9760-4d69-8651-aea5535dcf1e',
      '0fe326b2-d61e-40b5-92ca-c92caa98f46f',
      '74bffe39-3afe-4af3-8c7b-312b2578f722',
      '1e2cac73-27a1-4d13-80ed-c6f46e8351e9',
      '9ff7d8a5-035e-4efa-8464-854feec533ec',
      '82f74c6c-904a-4012-b658-45f69e3acd3a',
      'eff55021-b84e-47e0-96af-a747208b5cab',
      '3e1c3bc2-5be3-4822-9ed5-103256aab9bb',
      '61d0629d-0264-4c2c-9751-d55fd826cd31',
      '4930f201-b8ab-47be-b59b-4ff51ebf6a5d',
      'd4bf780e-2c0b-4cd2-aa29-55161f62a8be',
      'baa6a8f0-c237-4f99-8a56-519edcf63d3d',
      '08eb7461-b8d0-41a5-bc8f-34e5d1c0a4ec',
      '5739117b-6509-4f3d-af07-98337bf3a8fa',
      '9e22cffe-2b68-458a-8a75-6f85e4533156',
      '0a9607a6-320f-4fb1-9045-fbeb3b7f88cb',
      'cdd21f33-a8eb-4e01-9fd6-1d0aec2701d6'
    ];

    const backfills = await prisma.accDcBackfillProgress.findMany({
      where: { projectId: { in: topProjectIds } },
      select: { projectId: true, earliestCovered: true, latestCovered: true }
    });

    const backfilledMap = new Map(backfills.map(b => [b.projectId, b]));

    const liveProjs = await prisma.accProject.findMany({
      where: { id: { in: topProjectIds } },
      select: { id: true, name: true }
    });

    console.log("==========================================================================================");
    console.log("   PROJECT NAME                                | BACKFILLED? | MIN DATE   | MAX DATE");
    console.log("==========================================================================================");
    liveProjs.forEach(p => {
      const b = backfilledMap.get(p.id);
      if (b) {
        console.log(`   ${p.name.padEnd(43)} | YES         | ${b.earliestCovered?.toISOString().slice(0,10)} | ${b.latestCovered?.toISOString().slice(0,10)}`);
      } else {
        console.log(`   ${p.name.padEnd(43)} | NO          | -          | -`);
      }
    });
    console.log("==========================================================================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
