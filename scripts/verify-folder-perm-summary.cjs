#!/usr/bin/env node
/**
 * PROJ-01 (REF-03 foundation): proves AccFolderPermissionSummary equals the live
 * includePermissionSummary GROUP BY aggregate (acc-hot-cache.ts:304-317) BEFORE any
 * consumer is switched to read the projection (Phase 19).
 *
 * Asserts, against the live DB:
 *   1. row-count   — COUNT(*) of the live aggregate CTE == COUNT(*) of the projection
 *   2. full-diff   — FULL OUTER JOIN of live vs projection on (projectId, roleId);
 *                    mismatch count (missing key on either side, or folderCount /
 *                    totalBytes / permTypes differ) MUST be 0. All comparison happens
 *                    in SQL — no permission rows cross into Node.
 *   3. spot-check  — ~20 random (projectId, roleId) keys, live vs projection values
 *                    printed side by side; each sampled trio must match.
 *
 * All three assertions run against a single CTE-joined query per step — no untrusted
 * input is interpolated into SQL (sampled keys are only ever bound as query params,
 * never string-concatenated).
 *
 * Usage: node scripts/verify-folder-perm-summary.cjs [--out <path>]
 */
const fs = require('fs');
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Byte-identical GROUP BY body to lib/server/acc-hot-cache.ts:304-317 (the live
// includePermissionSummary aggregate this projection must mirror row-for-row).
const LIVE_CTE = `WITH raw_live AS (
  SELECT f."projectId" AS "projectId",
         fp."roleId" AS "roleId",
         COUNT(DISTINCT fp."folderId")::int AS "folderCount",
         COALESCE(SUM(COALESCE(f."totalSizeBytes", 0)), 0)::bigint AS "totalBytes",
         array_agg(DISTINCT fp."permType") AS "permTypes"
  FROM "AccFolderPermission" fp
  JOIN "AccFolder" f ON f.id = fp."folderId"
  JOIN "AccProject" p ON p.id = f."projectId"
  WHERE p."folderCrawlStatus" IN ('ok', 'partial')
  GROUP BY f."projectId", fp."roleId"
), live AS (
  -- Normalize permTypes array ordering (unnest + re-sort) so comparison against
  -- the projection is stable regardless of internal DISTINCT aggregation order.
  SELECT "projectId", "roleId", "folderCount", "totalBytes",
         (SELECT array_agg(t ORDER BY t) FROM unnest("permTypes") AS t) AS "permTypes"
  FROM raw_live
), proj AS (
  SELECT "projectId", "roleId", "folderCount", "totalBytes",
         (SELECT array_agg(t ORDER BY t) FROM unnest("permTypes") AS t) AS "permTypes"
  FROM "AccFolderPermissionSummary"
)`;

function outArgIndex(argv) {
  const i = argv.indexOf('--out');
  return i >= 0 ? argv[i + 1] : null;
}

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  const fails = [];
  const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };
  const lines = [];
  const record = (s) => { console.log(s); lines.push(s); };

  try {
    const q = (sql) => prisma.$queryRawUnsafe(sql);

    // 1. Row-count assertion.
    const [{ liveCount }] = await q(`${LIVE_CTE} SELECT COUNT(*)::int AS "liveCount" FROM live`);
    const [{ projCount }] = await q(`${LIVE_CTE} SELECT COUNT(*)::int AS "projCount" FROM proj`);

    record(`\n=== AccFolderPermissionSummary Reconciliation — ${new Date().toISOString()} ===`);
    record(`live aggregate row count:       ${liveCount}`);
    record(`projection row count:           ${projCount}`);
    ok(liveCount === projCount, `row-count: live (${liveCount}) == projection (${projCount})`);

    // 2. Full-diff assertion — everything happens in SQL.
    const [{ mismatchCount }] = await q(`${LIVE_CTE}
      SELECT COUNT(*)::int AS "mismatchCount"
      FROM live l
      FULL OUTER JOIN proj pr ON pr."projectId" = l."projectId" AND pr."roleId" = l."roleId"
      WHERE l."projectId" IS NULL
         OR pr."projectId" IS NULL
         OR l."folderCount" IS DISTINCT FROM pr."folderCount"
         OR l."totalBytes" IS DISTINCT FROM pr."totalBytes"
         OR l."permTypes" IS DISTINCT FROM pr."permTypes"
    `);
    record(`full-outer-join mismatch count:  ${mismatchCount}`);
    ok(mismatchCount === 0, `full-diff: 0 mismatches between live aggregate and projection`);

    // 3. Spot-check — ~20 random keys, live vs projection side by side.
    const spotRows = await q(`${LIVE_CTE}
      SELECT l."projectId", l."roleId",
             l."folderCount" AS "liveFolderCount", pr."folderCount" AS "projFolderCount",
             l."totalBytes" AS "liveTotalBytes", pr."totalBytes" AS "projTotalBytes",
             l."permTypes" AS "livePermTypes", pr."permTypes" AS "projPermTypes"
      FROM live l
      JOIN proj pr ON pr."projectId" = l."projectId" AND pr."roleId" = l."roleId"
      ORDER BY random()
      LIMIT 20
    `);

    record(`\nspot-checked keys (${spotRows.length}):`);
    let spotMismatches = 0;
    for (const r of spotRows) {
      const folderMatch = Number(r.liveFolderCount) === Number(r.projFolderCount);
      const bytesMatch = BigInt(r.liveTotalBytes) === BigInt(r.projTotalBytes);
      const permMatch = JSON.stringify(r.livePermTypes) === JSON.stringify(r.projPermTypes);
      const rowOk = folderMatch && bytesMatch && permMatch;
      if (!rowOk) spotMismatches++;
      record(
        `  ${rowOk ? 'MATCH' : 'MISMATCH'}  (${r.projectId}, ${r.roleId})  ` +
        `folderCount live=${r.liveFolderCount} proj=${r.projFolderCount}  ` +
        `totalBytes live=${r.liveTotalBytes} proj=${r.projTotalBytes}  ` +
        `permTypes live=${JSON.stringify(r.livePermTypes)} proj=${JSON.stringify(r.projPermTypes)}`,
      );
    }
    ok(spotRows.length >= 20 || spotRows.length === projCount, `spot-check: sampled ${spotRows.length} keys (target ~20)`);
    ok(spotMismatches === 0, `spot-check: 0/${spotRows.length} sampled keys mismatched`);

    const verdict = fails.length === 0 ? 'PASS' : 'FAIL';
    record(`\nVERDICT: ${verdict}${fails.length ? ` (${fails.length} assertion(s) failed)` : ''}`);
    record('=====================================================\n');

    const outPath = outArgIndex(process.argv);
    if (outPath) fs.writeFileSync(outPath, lines.join('\n'));

    if (fails.length) {
      console.error(`\n${fails.length} assertion(s) failed`);
      process.exit(1);
    }
    console.log('All reconciliation assertions passed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
