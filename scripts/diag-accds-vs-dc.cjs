#!/usr/bin/env node
/**
 * Parity check: for one project + month, compare AccActivityAccds (new) vs
 * AccActivity (DC source) row counts and per-verb / per-action breakdown.
 * Read-only. Run: node scripts/diag-accds-vs-dc.cjs <projectId> <YYYY-MM>
 */
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const projectId = process.argv[2] || 'de161948-703f-413c-979a-8983c70d84d9';
const month = process.argv[3] || '2026-05';

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  try {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const where = { projectId, createdAt: { gte: start, lt: end } };

    const [accdsTotal, dcTotal] = await Promise.all([
      prisma.accActivityAccds.count({ where }),
      prisma.accActivity.count({ where }),
    ]);
    const byVerb = await prisma.accActivityAccds.groupBy({ by: ['activityVerb'], where, _count: { accdsActivityId: true } });

    console.log(`project=${projectId} month=${month}`);
    console.log(`  AccActivityAccds (new): ${accdsTotal}`);
    console.log(`  AccActivity (DC):       ${dcTotal}`);
    console.log('  accds top verbs:');
    byVerb.sort((a, b) => b._count.accdsActivityId - a._count.accdsActivityId).slice(0, 12)
      .forEach((v) => console.log(`    ${String(v._count.accdsActivityId).padStart(8)}  ${v.activityVerb}`));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
