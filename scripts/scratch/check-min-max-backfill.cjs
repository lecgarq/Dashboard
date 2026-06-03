const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  const pool = new (require("pg").Pool)({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const stats = await prisma.accDcBackfillProgress.aggregate({
      _min: { earliestCovered: true },
      _max: { latestCovered: true },
      _count: true
    });
    console.log("=== BACKFILL GLOBAL PROGRESS ===");
    console.log(JSON.stringify(stats, null, 2));

    // Also get year breakdown of covered dates
    const dates = await prisma.$queryRaw`
      SELECT 
        MIN("earliestCovered") as "globalMin", 
        MAX("latestCovered") as "globalMax"
      FROM "AccDcBackfillProgress"
    `;
    console.log("\n=== RAW GLOBAL RANGE ===");
    console.log(dates);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch(console.error);
