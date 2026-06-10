#!/usr/bin/env node
/**
 * 2026-05-18 Phase: DC ingest drift recovery — one-shot progress reset.
 *
 * Rolls all AccDcBackfillProgress rows back to the "no coverage" state so the
 * planner re-emits new-project slices for every project. Used exactly once
 * after the 2026-05-18 fix ships, because the 2026-04-17 → 2026-05-17 window
 * the planner *thought* was covered actually contained zero activity rows
 * (Bug A silently failed every insert; Bug B swallowed the errors).
 *
 * Safety:
 *   - Refuses to run without --confirm (default = dry run).
 *   - Refuses to run unless .dc-ingest.disabled is present (race-condition guard
 *     so this never runs while the daily cron is firing).
 *   - WHERE clause makes the UPDATE idempotent.
 *
 * Usage:
 *   node --env-file=.env scripts/dc-reset-progress.cjs            # dry run
 *   node --env-file=.env scripts/dc-reset-progress.cjs --confirm  # actually update
 *
 * See: docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md
 */

const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.join(__dirname, '..');
const KILL_SWITCH = path.join(REPO_ROOT, '.dc-ingest.disabled');

function ts() {
  return new Date().toISOString();
}

function log(...args) {
   
  console.log(`[dc-reset-progress ${ts()}]`, ...args);
}

function logErr(...args) {
   
  console.error(`[dc-reset-progress ${ts()}]`, ...args);
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
  const confirm = process.argv.includes('--confirm');

  if (!fs.existsSync(KILL_SWITCH)) {
    logErr(
      `Refusing to run: ${KILL_SWITCH} does not exist. Create the kill switch first to prevent the cron from racing this reset.`,
    );
    process.exit(2);
  }

  const prisma = createPrisma();
  try {
    const summary = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int                                                    AS total,
         COUNT(*) FILTER (WHERE "earliestCovered" IS NOT NULL)::int       AS with_earliest,
         COUNT(*) FILTER (WHERE "latestCovered"   IS NOT NULL)::int       AS with_latest,
         COUNT(*) FILTER (WHERE "newProjectFlag")::int                    AS already_new
       FROM "AccDcBackfillProgress"`,
    );
    const row = summary[0] ?? {};
    log(
      `Pre-state: total=${row.total} with_earliest=${row.with_earliest} with_latest=${row.with_latest} already_new=${row.already_new}`,
    );

    if (!confirm) {
      log(
        'Dry run only. Re-run with --confirm to actually reset earliestCovered/latestCovered to NULL and newProjectFlag to true.',
      );
      return;
    }

    const result = await prisma.$executeRawUnsafe(
      `UPDATE "AccDcBackfillProgress"
          SET "earliestCovered" = NULL,
              "latestCovered"   = NULL,
              "newProjectFlag"  = true,
              "updatedAt"       = NOW()
        WHERE "earliestCovered" IS NOT NULL
           OR "latestCovered"   IS NOT NULL
           OR "newProjectFlag"  = false`,
    );
    log(`Update affected ${result} row(s).`);

    const post = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int                                                    AS total,
         COUNT(*) FILTER (WHERE "earliestCovered" IS NOT NULL)::int       AS with_earliest,
         COUNT(*) FILTER (WHERE "latestCovered"   IS NOT NULL)::int       AS with_latest,
         COUNT(*) FILTER (WHERE "newProjectFlag")::int                    AS already_new
       FROM "AccDcBackfillProgress"`,
    );
    const p = post[0] ?? {};
    log(
      `Post-state: total=${p.total} with_earliest=${p.with_earliest} with_latest=${p.with_latest} already_new=${p.already_new}`,
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr('Fatal:', err?.message || err);
  process.exit(1);
});
