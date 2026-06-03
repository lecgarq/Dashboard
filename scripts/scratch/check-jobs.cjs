const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const p = new PrismaClient({ adapter, log: ["error"] });

(async () => {
  const jobs = await p.accDataConnectorJob.findMany({
    orderBy: { startedAt: "desc" },
    take: 10
  });
  console.log("=== LATEST ACC DATA CONNECTOR JOBS ===");
  console.log(JSON.stringify(jobs, null, 2));

  const dcRuns = await p.accDcIngestRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10
  });
  console.log("\n=== LATEST DC INGEST RUNS ===");
  console.log(JSON.stringify(dcRuns, null, 2));

  await p.$disconnect();
})();
