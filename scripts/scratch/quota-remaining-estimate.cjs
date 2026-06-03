#!/usr/bin/env node
/**
 * Read-only. Estimates remaining DC quota (slices) to finish the progressive
 * backfill, using the same logic as lib/acc/dcProgressiveBackfill.ts:
 *   - backward slices: 30-day steps from earliestCovered down to projectCreatedAt
 *   - forward slices:  one slice if latestCovered < yesterday
 * Each slice covers <=50 projects sharing an identical (start,end,reason) window,
 * and each slice = 1 quota unit. Since windows differ per project, we approximate
 * the batching benefit by counting per-project slices then dividing by an avg
 * pack factor — but we also report the raw per-project slice count (worst case).
 */
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const SLICE_DAYS = 30;
const DAY = 86400000;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
  try {
    const now = new Date();
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(utcToday.getTime() - DAY);

    const projects = await prisma.accDcProject.findMany({ select: { id: true, name: true, status: true, createdAt: true } });
    const bf = await prisma.accDcBackfillProgress.findMany();
    const bfMap = new Map(bf.map(b => [b.projectId, b]));

    // Earliest known activity per project = a fallback creation floor.
    const minActivity = await prisma.$queryRawUnsafe(
      `SELECT "projectId", MIN("createdAt") AS min_ts FROM "AccActivity" WHERE "projectId" IS NOT NULL GROUP BY "projectId"`
    );
    const minMap = new Map(minActivity.map(r => [r.projectId, new Date(r.min_ts)]));

    const LOW = /\b(demo|template|test|sandbox|training|capacitacion|migracion|prueba|not use)\b/i;

    let backwardSlices = 0, forwardSlices = 0;
    let projNeedingBackward = 0, projNeedingForward = 0;
    let lowValueSkipped = 0, uninitialized = 0;
    const buckets = new Map(); // (start|end|reason) -> count, to estimate packed quota

    for (const p of projects) {
      const name = (p.name || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (LOW.test(name) || p.status === "archived" || p.status === "inactive") { lowValueSkipped++; continue; }
      const prog = bfMap.get(p.id);
      const floor = p.createdAt || minMap.get(p.id) || new Date(utcToday.getTime() - 2 * 365 * DAY);

      if (!prog || !prog.earliestCovered || !prog.latestCovered || prog.newProjectFlag) {
        uninitialized++;
        // one new-project slice
        const key = `new|${p.id}`; buckets.set(key, 1);
        continue;
      }
      const earliest = new Date(prog.earliestCovered);
      const latest = new Date(prog.latestCovered);

      // backward: how many 30-day steps from earliest down to floor
      if (earliest.getTime() > floor.getTime()) {
        const gapDays = (earliest.getTime() - floor.getTime()) / DAY;
        const steps = Math.ceil(gapDays / SLICE_DAYS);
        backwardSlices += steps;
        if (steps > 0) projNeedingBackward++;
      }
      // forward: one slice if behind yesterday
      if (latest.getTime() < yesterday.getTime()) {
        forwardSlices += 1;
        projNeedingForward++;
        const key = `fwd|${latest.toISOString().slice(0,10)}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    }

    const perProjectSlices = backwardSlices + forwardSlices + uninitialized;
    // Packed estimate: forward+new-project slices pack ~50/req when windows align;
    // backward windows are highly project-specific so assume minimal packing.
    const packedForwardNew = Math.ceil((forwardSlices + uninitialized) / 50) || 0;
    const packedEstimate = backwardSlices + packedForwardNew;

    console.log("=== REMAINING DC BACKFILL ESTIMATE (read-only) ===");
    console.log(`As of (UTC yesterday): ${yesterday.toISOString().slice(0,10)}`);
    console.log(`Total projects: ${projects.length}`);
    console.log(`Low-value/archived skipped: ${lowValueSkipped}`);
    console.log(`Uninitialized (need first 30d pull): ${uninitialized}`);
    console.log(`Projects needing BACKWARD history: ${projNeedingBackward}  -> ${backwardSlices} slices (30d steps)`);
    console.log(`Projects needing FORWARD catch-up: ${projNeedingForward}  -> ${forwardSlices} slices`);
    console.log(`-- Per-project slice total (worst case, no packing): ${perProjectSlices}`);
    console.log(`-- Packed estimate (fwd/new batched 50/req): ~${packedEstimate} requests`);
    console.log(`\nAt ~25 requests/UTC-day quota:`);
    console.log(`  worst case: ~${Math.ceil(perProjectSlices / 25)} days`);
    console.log(`  packed:     ~${Math.ceil(packedEstimate / 25)} days`);

    // Today's quota already spent
    const since = new Date(utcToday.getTime());
    const runsToday = await prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: since } },
      select: { quotaUsed: true, status: true, startedAt: true },
    });
    const spentToday = runsToday.reduce((a, r) => a + (r.quotaUsed || 0), 0);
    console.log(`\nQuota spent so far today (UTC): ${spentToday} (across ${runsToday.length} runs)`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch(e => { console.error(e); process.exit(1); });
