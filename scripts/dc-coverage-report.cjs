#!/usr/bin/env node
/**
 * Read-only Data Connector coverage report. Mutates nothing.
 *
 * Census mode (default): prints active / DC-acknowledged / eligible / covered /
 * remaining counts and the estimated request count. "Eligible" reuses the SAME
 * filter the daily backfill uses — lib/acc/dcProjectEligibility.ts
 * isDcBackfillEligibleProject = MTY allowlist ∩ not-low-value-name — so this
 * report reflects the real extraction universe, not every DC-acknowledged project.
 *
 * Probe mode (DC_PROBE_PROJECT_ID set): also prints that project's
 * AccActivity date range and AccDcBackfillProgress.earliestCovered.
 *
 * Env: DC_START_DATE (floor; default 2019-01-01T00:00:00.000Z)
 *      DC_PROBE_PROJECT_ID (optional)
 */
require("tsx/cjs");
const path = require("node:path");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const FLOOR = new Date(process.env.DC_START_DATE || "2019-01-01T00:00:00.000Z");
const PROBE_ID = process.env.DC_PROBE_PROJECT_ID?.trim() || null;

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function main() {
  const { isDcBackfillEligibleProject } = require(
    path.resolve(__dirname, "..", "lib", "acc", "dcProjectEligibility.ts")
  );
  const prisma = createPrisma();
  try {
    const [activeProjects, dcProjects, backfills] = await Promise.all([
      prisma.accProject.findMany({ where: { status: "active" }, select: { id: true, name: true } }),
      prisma.accDcProject.findMany({ select: { id: true } }),
      prisma.accDcBackfillProgress.findMany({ select: { projectId: true, earliestCovered: true } }),
    ]);
    const dcIds = new Set(dcProjects.map((p) => p.id));
    const eligible = activeProjects.filter((p) => isDcBackfillEligibleProject(p.id, p.name));
    const earliestById = new Map(backfills.map((b) => [b.projectId, b.earliestCovered]));

    let done = 0, remaining = 0;
    for (const p of eligible) {
      const e = earliestById.get(p.id) ?? null;
      if (e && e.getTime() <= FLOOR.getTime()) done++; else remaining++;
    }

    console.log("=== DC coverage census ===");
    console.log(`floor              : ${FLOOR.toISOString()}`);
    console.log(`active projects    : ${activeProjects.length}`);
    console.log(`DC-acknowledged    : ${dcIds.size}`);
    console.log(`eligible (MTY ∩)   : ${eligible.length}`);
    console.log(`already covered    : ${done}`);
    console.log(`remaining to pull  : ${remaining}`);
    console.log(`est. requests      : ${Math.ceil(remaining / 50)} (at 50/req)`);

    if (PROBE_ID) {
      const agg = await prisma.accActivity.aggregate({
        where: { projectId: PROBE_ID },
        _min: { createdAt: true },
        _max: { createdAt: true },
        _count: true,
      });
      const bf = await prisma.accDcBackfillProgress.findUnique({ where: { projectId: PROBE_ID } });
      console.log(`\n=== probe ${PROBE_ID} ===`);
      console.log(`activity rows      : ${agg._count}`);
      console.log(`min(createdAt)     : ${agg._min.createdAt ? agg._min.createdAt.toISOString() : "(none)"}`);
      console.log(`max(createdAt)     : ${agg._max.createdAt ? agg._max.createdAt.toISOString() : "(none)"}`);
      console.log(`earliestCovered    : ${bf?.earliestCovered ? bf.earliestCovered.toISOString() : "(none)"}`);
      console.log(`projectCreatedAt   : ${bf?.projectCreatedAt ? bf.projectCreatedAt.toISOString() : "(none)"}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
