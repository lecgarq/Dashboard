const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const prisma = new PrismaClient({ adapter, log: ["error"] });

(async () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [runs, legacyJobs] = await Promise.all([
    prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { startedAt: true, quotaUsed: true, status: true }
    }),
    prisma.accDataConnectorJob.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { startedAt: true, status: true, requestId: true }
    })
  ]);

  console.log(`=== QUOTA USED TODAY (${start.toISOString()} to ${end.toISOString()}) ===`);
  console.log("Ingest Runs:", JSON.stringify(runs, null, 2));
  console.log("Legacy Jobs:", JSON.stringify(legacyJobs, null, 2));

  const runQuota = runs.reduce((sum, r) => sum + r.quotaUsed, 0);
  const legacyQuota = legacyJobs.length;
  const totalUsed = runQuota + legacyQuota;

  console.log(`\nRun Quota Used: ${runQuota}`);
  console.log(`Legacy Job Quota Used: ${legacyQuota}`);
  console.log(`Total Quota Used Today: ${totalUsed}`);
  console.log(`Daily Safe Request Budget: 20`);
  console.log(`Daily Hard Quota Cap: 25`);
  console.log(`Remaining Safe Quota: ${Math.max(0, 20 - totalUsed)}`);

  await prisma.$disconnect();
})();
