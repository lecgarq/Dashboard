// One-shot diagnostic — reads SyncMeta + recent jobs and prints them.
// Run: railway run --service Dashboard node scripts/sync-status-check.cjs
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL or DIRECT_URL must be set");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString: url, max: 2, connectionTimeoutMillis: 5_000 });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const rows = await prisma.syncMeta.findMany();
    console.log("=== SyncMeta ===");
    console.log(JSON.stringify(rows, null, 2));
    const recentJobs = await prisma.accDataConnectorJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 3,
      select: { requestId: true, status: true, startedAt: true, completedAt: true, errorMessage: true },
    });
    console.log("=== Recent ACC Data Connector jobs ===");
    console.log(JSON.stringify(recentJobs, null, 2));
  } catch (e) {
    console.error("ERR:", e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
