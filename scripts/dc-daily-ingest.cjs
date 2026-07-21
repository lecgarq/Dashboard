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
 *
 * Environment flags:
 *   DC_PRIORITY_BACKFILL=1
 *     Enable value-first backfill ordering: high-value projects' slices are moved to
 *     the front of the queue so scarce daily quota is spent on the most important
 *     history first. Default OFF (unset or any value other than "1") = fair
 *     breadth-first ordering — byte-for-byte identical to the pre-feature behavior.
 *
 *   DC_FAIRNESS_RESERVE=<int>
 *     Override the per-run fairness reserve slot count (only active when
 *     DC_PRIORITY_BACKFILL=1). The reserve is filled from the oldest-progressed
 *     projects to prevent indefinite starvation of low-priority items.
 *     Default: max(1, floor(safeRemainingToday * 0.2)) — roughly 20% of the
 *     remaining daily safe budget, minimum 1 when budget > 0.
 *
 *   DC_PROGRESSIVE_SLICE_DAYS=<1..366>
 *     Override the default 30-day progressive extraction window. Useful for
 *     bounded manual catch-up runs that need fewer APS Data Connector requests.
 *
 *   DC_SKIP_ADMIN_SNAPSHOT=1
 *     Manual backfill mode: ingest activity CSVs and advance backfill progress,
 *     but leave the last known-good admin snapshot untouched. Use when running
 *     scoped/project-window continuation batches that would otherwise compare a
 *     partial admin CSV against the full-account baseline and quarantine.
 *
 *   DC_BACKFILL_CUTOFF_DATE=YYYY-MM-DD
 *     Manual history mode: use the end of this UTC date as the extraction
 *     ceiling instead of yesterday. Example: 2026-06-06 means do not spend
 *     quota catching up activity after 2026-06-06; continue historical backfill
 *     backward from that ceiling.
 *
 *   Note: PRIORITY_WINDOW_DAYS=30 is the activity-analysis window used by the
 *   priority ranker to compute scores. It is a compile-time constant in
 *   lib/acc/dcIngest.ts, not a runtime env var.
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
  console.log(`[dc-daily-ingest ${ts()}]`, ...args);
}

function logErr(...args) {
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
    if (result.status === 'success') {
      // PROJ-03 (REF-03 completion): refresh the AccFolderPermissionSummary
      // projection FIRST — before the person-graph rebuild and (critically)
      // before build-instance-features.ts, which reads the projection via
      // includePermissionSummary (PROJ-02), so the same run's embedding sees
      // fresh data. Reuses the idempotent server-side backfill script
      // (TRUNCATE + INSERT...SELECT...GROUP BY) verbatim — the single owner
      // of the aggregate SQL, no duplication, no Node-side row scan. Non-fatal
      // (matches the person-graph / embedding blocks below): a refresh
      // failure never aborts the ingest exit status. The TRUNCATE takes a
      // brief ACCESS EXCLUSIVE lock (~seconds); concurrent projection readers
      // wait then see the new rows — they never observe an empty table.
      try {
        log('Refreshing AccFolderPermissionSummary projection (server-side aggregate)...');
        const { execSync } = require('node:child_process');
        execSync('node scripts/backfill-folder-perm-summary.cjs', { stdio: 'inherit' });
      } catch (e) {
        log('AccFolderPermissionSummary refresh failed (non-fatal): ' + e.message);
      }
      try {
        log('Rebuilding person-similarity graph snapshot...');
        const { execSync } = require('node:child_process');
        execSync('npx tsx scripts/rebuild-person-graph.ts', { stdio: 'inherit' });
      } catch (e) {
        log('person-graph rebuild failed (non-fatal): ' + e.message);
      }
      try {
        log('Building per-instance embedding (features → PaCMAP)...');
        const { execSync } = require('node:child_process');
        execSync('npx tsx scripts/build-instance-features.ts', { stdio: 'inherit' });
        execSync('python scripts/compute_instance_embeddings.py', { stdio: 'inherit' });
      } catch (e) {
        log('instance-embedding build failed (non-fatal): ' + e.message);
      }
      // v2.7 Phase 38 (owner decision: manual refresh only): the activity-
      // universe embedding is NOT rebuilt nightly (~34 min full fit). This
      // block only LOGS how many unified activity events have no position yet
      // so staleness is visible; a manual compute_activity_embeddings.py +
      // build-activity-universe-payload.ts run clears it. Non-fatal always.
      try {
        const [{ built }] = await prisma.$queryRawUnsafe(
          'SELECT COUNT(*)::int AS built FROM "AccActivityEmbedding"',
        );
        if (built === 0) {
          log('[activity-universe] embedding not built yet — skipping staleness check');
        } else {
          // ponytail: two anti-join PK probes over ~4.9M ids (~seconds,
          // nightly offline); switch to a watermark column if it ever hurts.
          const [{ missing }] = await prisma.$queryRawUnsafe(`
            SELECT (
              (SELECT COUNT(*) FROM "AccActivityAccds" a
                WHERE NOT EXISTS (SELECT 1 FROM "AccActivityEmbedding" e
                                  WHERE e.id = 'accds:' || a."accdsActivityId"))
              +
              (SELECT COUNT(*) FROM "AccActivity" d
                LEFT JOIN (
                  SELECT "projectId", MIN("createdAt") AS s
                  FROM "AccActivityAccds" GROUP BY "projectId"
                ) ast ON ast."projectId" = d."projectId"
                WHERE (d."projectId" IS NULL OR d."projectId" = ''
                       OR ast.s IS NULL OR d."createdAt" < ast.s)
                  AND NOT EXISTS (SELECT 1 FROM "AccActivityEmbedding" e
                                  WHERE e.id = d.id))
            )::int AS missing
          `);
          if (missing > 0) {
            log(`[activity-universe] ${missing} new events without positions — manual pipeline run needed`);
          } else {
            log('[activity-universe] positions current (0 unpositioned events)');
          }
        }
      } catch (e) {
        log('[activity-universe] staleness check failed (non-fatal): ' + e.message);
      }
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
