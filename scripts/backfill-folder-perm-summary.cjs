#!/usr/bin/env node
/**
 * PROJ-01 (REF-03 foundation): backfills AccFolderPermissionSummary from
 * AccFolderPermission entirely server-side. Read+write against the live local DB.
 *
 * MUST NEVER `findMany`/`$queryRaw` the ~6M AccFolderPermission rows into Node — that
 * re-opens the exact OOM window guarded by TEST-01 (lib/server/acc-hot-cache.test.ts).
 * The INSERT...SELECT...GROUP BY body below is byte-identical to the live
 * includePermissionSummary aggregate at lib/server/acc-hot-cache.ts:304-317, including
 * the folderCrawlStatus IN ('ok','partial') coverage-boundary filter.
 *
 * Idempotent: TRUNCATE + INSERT inside one transaction, so re-running yields the same
 * result every time (exact-mirror semantics — no orphan rows; Phase 19 owns incremental
 * refresh).
 *
 * Usage: node scripts/backfill-folder-perm-summary.cjs
 */
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const TRUNCATE_SQL = `TRUNCATE "AccFolderPermissionSummary"`;

// Byte-identical GROUP BY body to lib/server/acc-hot-cache.ts:304-317, plus a
// server-generated id + refreshedAt for the projection row.
const INSERT_SQL = `
  INSERT INTO "AccFolderPermissionSummary"
    ("id","projectId","roleId","folderCount","totalBytes","permTypes","refreshedAt")
  SELECT gen_random_uuid()::text AS "id",
         f."projectId" AS "projectId",
         fp."roleId" AS "roleId",
         COUNT(DISTINCT fp."folderId")::int AS "folderCount",
         COALESCE(SUM(COALESCE(f."totalSizeBytes", 0)), 0)::bigint AS "totalBytes",
         array_agg(DISTINCT fp."permType") AS "permTypes",
         now() AS "refreshedAt"
  FROM "AccFolderPermission" fp
  JOIN "AccFolder" f ON f.id = fp."folderId"
  JOIN "AccProject" p ON p.id = f."projectId"
  WHERE p."folderCrawlStatus" IN ('ok', 'partial')
  GROUP BY f."projectId", fp."roleId"
`;

// Group-row upper bound: distinct (projectId, roleId) present in the same filtered
// join — the same bound TEST-01 asserts (inserted rows <= n_projects x n_roles).
const BOUND_SQL = `
  SELECT COUNT(DISTINCT f."projectId")::int AS "nProjects",
         COUNT(DISTINCT fp."roleId")::int AS "nRoles"
  FROM "AccFolderPermission" fp
  JOIN "AccFolder" f ON f.id = fp."folderId"
  JOIN "AccProject" p ON p.id = f."projectId"
  WHERE p."folderCrawlStatus" IN ('ok', 'partial')
`;

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  try {
    console.log('Backfilling AccFolderPermissionSummary (server-side GROUP BY, no row scan)...');

    // ~6M-row source table: the GROUP BY aggregate can take longer than Prisma's
    // default 5s interactive-transaction timeout. Widen both maxWait (time to
    // acquire the transaction) and timeout (time the transaction may stay open).
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(TRUNCATE_SQL);
        await tx.$executeRawUnsafe(INSERT_SQL);
      },
      { timeout: 300_000, maxWait: 30_000 },
    );

    const [{ count: insertedCount }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "AccFolderPermissionSummary"`,
    );
    const [{ nProjects, nRoles }] = await prisma.$queryRawUnsafe(BOUND_SQL);
    const upperBound = nProjects * nRoles;

    console.log('\n=== Backfill Summary ===');
    console.log(`inserted rows:            ${insertedCount}`);
    console.log(`n_projects (filtered):    ${nProjects}`);
    console.log(`n_roles (filtered):       ${nRoles}`);
    console.log(`upper bound (n_p x n_r):  ${upperBound}`);
    console.log(`within bound:             ${insertedCount <= upperBound ? 'YES' : 'NO'}`);
    console.log('========================\n');

    if (insertedCount <= 0) {
      throw new Error('Backfill produced 0 rows — expected > 0 given a populated AccFolderPermission table.');
    }
    if (insertedCount > upperBound) {
      throw new Error(`Backfill produced ${insertedCount} rows, exceeding the n_projects x n_roles bound of ${upperBound}.`);
    }

    console.log('Backfill complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
