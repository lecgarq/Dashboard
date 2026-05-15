#!/usr/bin/env node
/**
 * Phase 8 plan 08-06 — daily Data Connector ingest entry point.
 *
 * Loads tsx/cjs to consume `lib/acc/dcIngest.ts` directly (no build step,
 * matches Phase 3 03-02 pattern for `scripts/deep-sync-ingest.cjs`).
 *
 * Behavior:
 *   - Pre-flight kill-switch check (in addition to runtime check inside runDcIngest)
 *   - Initialise PrismaClient (with PrismaPg adapter, mirrors dc-ingest-where-i-admin.cjs)
 *   - runDcIngest(prisma) -> RunResult
 *   - Exit 0 on status in {success, killed}
 *   - Exit 1 on any other status (so Windows Task Scheduler logs "task failed")
 */

require('tsx/cjs');
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.join(__dirname, '..');
const KILL_SWITCH = path.join(REPO_ROOT, '.dc-ingest.disabled');

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(`[dc-daily-ingest ${ts()}]`, ...args);
}

function logErr(...args) {
  // eslint-disable-next-line no-console
  console.error(`[dc-daily-ingest ${ts()}]`, ...args);
}

function createPrisma() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const url =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ['error'],
  });
}

async function main() {
  // Pre-flight kill-switch — fast-path so we don't even touch the DB.
  if (fs.existsSync(KILL_SWITCH)) {
    log('Kill switch active (.dc-ingest.disabled present) — exiting.');
    process.exit(0);
  }

  const { runDcIngest } = require('../lib/acc/dcIngest');

  const prisma = createPrisma();
  try {
    log('Starting Data Connector daily ingest…');
    const result = await runDcIngest(prisma);
    log(
      `Run ${result.ingestRunId ?? '(none)'} ended with status=${result.status}`,
    );
    log(
      `projectsProcessed=${result.projectsProcessed} quotaUsed=${result.quotaUsed}`,
    );
    log(`rowsByModule=${JSON.stringify(result.rowsByModule)}`);
    log(`rowsByAdminCsv=${JSON.stringify(result.rowsByAdminCsv)}`);
    if (result.diffSummary) {
      log(`diffSummary=${JSON.stringify(result.diffSummary)}`);
    }
    if (result.unknownModulesSeen.length > 0) {
      log(`unknownModulesSeen=${result.unknownModulesSeen.join(',')}`);
    }
    if (result.errorMessage) {
      logErr(`ERROR: ${result.errorMessage}`);
    }
    process.exit(
      result.status === 'success' ||
        result.status === 'killed' ||
        result.status === 'skipped'
        ? 0
        : 1,
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr('Fatal:', err?.message || err);
  process.exit(1);
});
