#!/usr/bin/env node
/**
 * accds/v0 activity crawler. Pages every admin-accessible project (no DC quota)
 * over the trailing ACCDS_MONTHS_BACK months and upserts into AccActivityAccds.
 *
 * Env:
 *   ACCDS_MONTHS_BACK=12   trailing window (default 12)
 *   ACCDS_PROJECT=<id>     crawl only this project (smoke test); else all distinct
 *                          projectIds already present in AccActivity (admin-accessible set)
 *
 * Requires scratch/acc-session.json (run scripts/accds-login.cjs first).
 * Run: node scripts/accds-activity-ingest.cjs
 */
const path = require('node:path');
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
require('tsx/cjs');

function createPrisma() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const url = (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
              (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL must be set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 }), log: ['error'] });
}

const { loadCookieHeader, createTokenProvider } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsToken.ts'));
const { crawlProjectActivity } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsActivity.ts'));
const { mapAccdsRow } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsActivityMap.ts'));
const pLimitMod = require('p-limit');
const pLimit = pLimitMod.default || pLimitMod;

const SESSION = path.join(process.cwd(), 'scratch', 'acc-session.json');
const MONTHS_BACK = Number(process.env.ACCDS_MONTHS_BACK || 12);
const ONLY = process.env.ACCDS_PROJECT || null;
const NAME_LIKE = process.env.ACCDS_NAME_LIKE || null; // case-insensitive regex on project name (e.g. office prefix "MTY")
const RESUME = process.env.ACCDS_RESUME === '1'; // skip projects that already have ANY accds rows (crawl only the un-crawled remainder)

async function main() {
  const prisma = createPrisma();
  const runId = 'accds-' + new Date().toISOString();
  try {
    const cookieHeader = await loadCookieHeader(SESSION);
    const getToken = createTokenProvider(cookieHeader);

    const toISO = new Date().toISOString();
    // Trailing window in 30-day "months" (ACCDS_MONTHS_BACK * 30d), not calendar months.
    const fromISO = new Date(Date.now() - MONTHS_BACK * 30 * 24 * 60 * 60 * 1000).toISOString();

    let projectIds;
    if (ONLY) {
      projectIds = [ONLY];
    } else {
      const rows = await prisma.accActivity.findMany({
        where: { projectId: { not: null } },
        distinct: ['projectId'],
        select: { projectId: true },
      });
      projectIds = rows.map((r) => r.projectId).filter((p) => p && p.length > 0);
      if (NAME_LIKE) {
        // Filter the admin-accessible set by project name (office scoping).
        const [dc, ap] = await Promise.all([
          prisma.accDcProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
          prisma.accProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
        ]);
        const nameById = new Map();
        for (const p of ap) nameById.set(p.id, p.name);
        for (const p of dc) if (!nameById.has(p.id)) nameById.set(p.id, p.name);
        const re = new RegExp(NAME_LIKE, 'i');
        const before = projectIds.length;
        projectIds = projectIds.filter((id) => re.test(nameById.get(id) || ''));
        console.log(`[accds] name filter /${NAME_LIKE}/i matched ${projectIds.length} of ${before} projects`);
      }
    }
    if (RESUME && !ONLY) {
      // Skip projects already crawled (they have accds rows); crawl only the remainder.
      const done = await prisma.accActivityAccds.findMany({ distinct: ['projectId'], select: { projectId: true } });
      const doneSet = new Set(done.map((r) => r.projectId));
      const before = projectIds.length;
      projectIds = projectIds.filter((id) => !doneSet.has(id));
      console.log(`[accds] resume: skipping ${before - projectIds.length} already-crawled, ${projectIds.length} remaining`);
    }
    console.log(`[accds] ${projectIds.length} project(s); window ${fromISO} .. ${toISO}; run ${runId}`);

    const limit = pLimit(4);
    let totalInserted = 0;
    await Promise.all(projectIds.map((projectId) => limit(async () => {
      const seen = new Set();
      let buffer = [];
      let projectInserted = 0;
      let skipped = 0;
      const flush = async () => {
        if (!buffer.length) return;
        const res = await prisma.accActivityAccds.createMany({ data: buffer, skipDuplicates: true });
        totalInserted += res.count;
        projectInserted += res.count;
        buffer = [];
      };
      try {
        const { fetched } = await crawlProjectActivity({
          getToken, projectId, fromISO, toISO,
          onRows: async (rows) => {
            for (const r of rows) {
              if (!r.activity_id || seen.has(r.activity_id)) continue;
              seen.add(r.activity_id);
              const rec = mapAccdsRow(r, runId);
              // accds omits project_id on some (e.g. account-level) rows; we crawl per
              // project, so attribute to the crawled projectId. Skip rows still missing a
              // NOT NULL column so one bad row can't reject the whole 500-row batch.
              if (!rec.projectId) rec.projectId = projectId;
              if (!rec.autodeskId || !rec.activityVerb) { skipped++; continue; }
              buffer.push(rec);
            }
            if (buffer.length >= 500) await flush();
          },
        });
        await flush();
        console.log(`  ✓ ${projectId}  fetched=${fetched} inserted=${projectInserted}${skipped ? ` skipped=${skipped}` : ''}`);
      } catch (e) {
        // SessionExpiredError is fatal to the whole run — no other project can succeed.
        if (e && e.name === 'SessionExpiredError') throw e;
        console.error(`  ✗ ${projectId}: ${e && e.message ? e.message : e}`);
      }
    })));

    console.log(`[accds] done. inserted ~${totalInserted} new rows (run ${runId}).`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
