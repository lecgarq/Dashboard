#!/usr/bin/env node
/**
 * scripts/wipe-legacy-acc-activity.cjs — Phase 08-07 / DC8-04 / Pitfall 10
 *
 * One-time wipe of the ~2,507 legacy AccActivity rows that originated from the
 * Phase-3 single-file Data Connector ingest (back when activity_*.csv had no
 * `service` column). Without wiping, the legacy rows have service=NULL and
 * pollute the cross-module surface promised by Phase 8 (every File Activity
 * row is supposed to render a module badge from row.service).
 *
 * Run AFTER the first successful Phase-8 dcIngest cycle has validated the new
 * pipeline. Plan 08-08 owns the actual invocation; this plan only ships the
 * script. The next dcIngest run will repopulate from per-module CSVs with
 * service set to the module name on every row.
 *
 * Safety: refuses to delete unless --yes is passed. --dry-run reports the row
 * count without touching the table.
 *
 * Usage:
 *   node scripts/wipe-legacy-acc-activity.cjs --dry-run
 *   node scripts/wipe-legacy-acc-activity.cjs --yes
 */
require("tsx/cjs");
// Best-effort .env loading — not all environments have dotenv installed,
// but the Windows Task Scheduler entrypoint relies on it picking up
// DATABASE_URL from the repo's .env file.
const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

function createPrisma() {
  const url =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });
}

async function main() {
  const prisma = createPrisma();
  try {
    const before = await prisma.accActivity.count();
    if (process.argv.includes("--dry-run")) {
      console.log(
        `[wipe] Would delete ${before} rows. Re-run without --dry-run to commit.`,
      );
      return;
    }
    if (!process.argv.includes("--yes")) {
      console.error("[wipe] Pass --yes to actually delete. Refusing.");
      process.exit(1);
    }
    const result = await prisma.accActivity.deleteMany({});
    console.log(
      `[wipe] Deleted ${result.count} legacy AccActivity rows (expected ~2507).`,
    );
    console.log(
      "[wipe] Next dcIngest run will repopulate from per-module CSVs.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
