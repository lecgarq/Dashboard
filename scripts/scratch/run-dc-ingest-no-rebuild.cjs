#!/usr/bin/env node
const dotenv = (() => {
  try {
    return require("dotenv");
  } catch {
    return null;
  }
})();
if (dotenv) dotenv.config();
require("tsx/cjs");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { runDcIngest } = require("../../lib/acc/dcIngest");

function log(...args) {
  console.log(`[dc-no-rebuild ${new Date().toISOString()}]`, ...args);
}

function createPrisma() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });
}

async function main() {
  const maxRuns = Math.max(1, Number.parseInt(process.argv[2] || "1", 10));
  process.env.DC_SKIP_ADMIN_SNAPSHOT = "1";
  const prisma = createPrisma();
  try {
    log(
      `adminSnapshot=skip cutoff=${process.env.DC_BACKFILL_CUTOFF_DATE || "(yesterday)"}`,
    );
    for (let i = 1; i <= maxRuns; i += 1) {
      log(`starting run ${i}/${maxRuns}`);
      const result = await runDcIngest(prisma);
      log(
        `run=${result.ingestRunId ?? "(none)"} status=${result.status} projectsProcessed=${result.projectsProcessed} quotaUsed=${result.quotaUsed}`,
      );
      log(`rowsByModule=${JSON.stringify(result.rowsByModule)}`);
      log(`rowsByAdminCsv=${JSON.stringify(result.rowsByAdminCsv)}`);
      if (result.errorMessage) log(`error=${result.errorMessage}`);

      if (
        result.status !== "success" ||
        result.quotaUsed === 0 ||
        result.projectsProcessed === 0
      ) {
        break;
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
