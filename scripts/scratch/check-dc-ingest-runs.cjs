const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL or DIRECT_URL must be set");
    process.exit(1);
  }
  const pool = new (require("pg").Pool)({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const runs = await prisma.accDcIngestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    console.log("=== Recent AccDcIngestRun rows ===");
    console.log(JSON.stringify(runs, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
