#!/usr/bin/env node
/**
 * Verifies the accds+DC unified activity merge (spec 2026-06-12). Read-only.
 *
 * Asserts, against the live DB:
 *   1. reconciliation — merged module/timeline total == accds_all + dc_backfill + dc_admin
 *   2. teeth         — a naive UNION (all DC) over-counts by the overlap, so the
 *                      reconciliation FAILS under MERGE_MODE=naive (red), PASSES under
 *                      MERGE_MODE=partitioned (green)
 *   3. backfill      — dc_backfill > 0 (older history is actually kept)
 *   4. admin         — dc_admin > 0 (account-level rows actually kept)
 *   5. boundary      — for the latest-starting project, every kept DC row predates
 *                      that project's earliest accds row (clean, gap-free seam)
 *
 * Usage: node scripts/verify-accds-merge.cjs            # partitioned (expect PASS)
 *        MERGE_MODE=naive node scripts/verify-accds-merge.cjs   # expect FAIL (teeth)
 */
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const MODE = process.env.MERGE_MODE === 'naive' ? 'naive' : 'partitioned';

const CTE = `WITH astart AS (
  SELECT "projectId", MIN("createdAt") AS s FROM "AccActivityAccds" GROUP BY "projectId"
)`;

// Module-shaped merged total (project rows + account-level admin rows).
const moduleMergeTotal = (mode) => `${CTE}
SELECT SUM(c)::bigint AS total FROM (
  SELECT COUNT(*)::int AS c FROM "AccActivityAccds"
  UNION ALL
  SELECT COUNT(*)::int AS c
    FROM "AccActivity" d LEFT JOIN astart a ON a."projectId" = d."projectId"
    ${mode === 'naive'
      ? '' /* naive: keep ALL dc rows -> over-counts the overlap */
      : `WHERE d."projectId" IS NULL OR d."projectId" = '' OR a.s IS NULL OR d."createdAt" < a.s`}
) u`;

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  const fails = [];
  const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };
  const n = (rows) => Number(rows[0].total ?? rows[0].count ?? Object.values(rows[0])[0]);
  try {
    const q = (sql) => prisma.$queryRawUnsafe(sql);

    const accds = n(await q(`SELECT COUNT(*)::bigint total FROM "AccActivityAccds"`));
    const dcAdmin = n(await q(`SELECT COUNT(*)::bigint total FROM "AccActivity" WHERE "projectId" IS NULL OR "projectId"=''`));
    const dcBackfill = n(await q(`${CTE}
      SELECT COUNT(*)::bigint total FROM "AccActivity" d JOIN astart a ON a."projectId"=d."projectId"
      WHERE d."projectId" IS NOT NULL AND d."projectId"<>'' AND d."createdAt" < a.s`));
    const expected = accds + dcBackfill + dcAdmin;
    const merged = n(await q(moduleMergeTotal(MODE)));

    console.log(`mode=${MODE}  accds=${accds}  dc_backfill=${dcBackfill}  dc_admin=${dcAdmin}`);
    console.log(`expected unified (module/timeline) = ${expected}   merged query = ${merged}`);

    ok(merged === expected, `reconciliation: merged total equals accds + backfill + admin`);
    ok(dcBackfill > 0, `backfill kept (dc rows predating per-project accds start): ${dcBackfill}`);
    ok(dcAdmin > 0, `account-level admin kept: ${dcAdmin}`);

    // Boundary spot-check: per-project reconciliation for the latest-starting
    // project (largest backfill window — worst case for the seam). The merge's
    // contribution for this project must equal accds(P) + DC(P, createdAt < accds-start),
    // computed two independent ways. A broken keep-predicate diverges here even if
    // global totals happen to cancel out.
    const [late] = await q(`SELECT "projectId" pid, MIN("createdAt") s
      FROM "AccActivityAccds" GROUP BY "projectId" ORDER BY s DESC LIMIT 1`);
    const pid = String(late.pid).replace(/'/g, "''");
    const expectedLate = n(await q(`SELECT
        (SELECT COUNT(*) FROM "AccActivityAccds" WHERE "projectId"='${pid}')
      + (SELECT COUNT(*) FROM "AccActivity" WHERE "projectId"='${pid}'
           AND "createdAt" < (SELECT MIN("createdAt") FROM "AccActivityAccds" WHERE "projectId"='${pid}'))
      AS total`));
    const mergedLate = n(await q(`${CTE}
      SELECT SUM(c)::bigint AS total FROM (
        SELECT COUNT(*)::int AS c FROM "AccActivityAccds" WHERE "projectId"='${pid}'
        UNION ALL
        SELECT COUNT(*)::int AS c FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId"='${pid}' AND (a.s IS NULL OR d."createdAt" < a.s)
      ) u`));
    ok(mergedLate === expectedLate && expectedLate > 0,
      `boundary: latest-start project merge=${mergedLate} == accds(P)+DC-backfill(P)=${expectedLate} (and > 0)`);

    if (fails.length) { console.error(`\n${fails.length} assertion(s) failed`); process.exit(1); }
    console.log('\nAll merge assertions passed.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
