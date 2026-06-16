#!/usr/bin/env node
/**
 * Build the ordered project-ID file consumed by scripts/dc-extract-id-list.cjs.
 *
 * Loads the eligible/coverage/activity maps from Postgres, delegates selection to
 * the pure lib/acc/selectBackfillProjects.ts, writes one ID per line, and prints a
 * summary. Re-running regenerates the REMAINING work (state lives in
 * AccDcBackfillProgress.earliestCovered) — this is the resume loop.
 *
 * "Eligible" reuses the SAME filter the census uses —
 * lib/acc/dcProjectEligibility.ts isDcBackfillEligibleProject (MTY allowlist ∩
 * not-low-value-name) — so this list matches scripts/dc-coverage-report.cjs.
 *
 * Read-only against the DB except for writing the local output txt file.
 * Mutates no DB rows and never touches the Autodesk token (no network).
 *
 * Env: DC_START_DATE (floor; default 2019-01-01T00:00:00.000Z)
 *      DC_LIST_OUT   (output file; default tmp/dc-extract-list.txt)
 */
const fs = require("node:fs");
const path = require("node:path");
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const FLOOR = new Date(process.env.DC_START_DATE || "2019-01-01T00:00:00.000Z");
const OUT = process.env.DC_LIST_OUT?.trim() || path.join("tmp", "dc-extract-list.txt");

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function main() {
  const { selectBackfillProjects } = require(
    path.resolve(__dirname, "..", "lib", "acc", "selectBackfillProjects.ts")
  );
  const { isDcBackfillEligibleProject } = require(
    path.resolve(__dirname, "..", "lib", "acc", "dcProjectEligibility.ts")
  );
  const prisma = createPrisma();
  try {
    const [activeProjects, backfills, activityGroups] = await Promise.all([
      prisma.accProject.findMany({ where: { status: "active" }, select: { id: true, name: true } }),
      prisma.accDcBackfillProgress.findMany({ select: { projectId: true, earliestCovered: true } }),
      prisma.accActivity.groupBy({ by: ["projectId"], _count: { _all: true } }),
    ]);

    const eligible = activeProjects.filter((p) => isDcBackfillEligibleProject(p.id, p.name));

    const input = {
      eligibleIds: new Set(eligible.map((p) => p.id)),
      earliestCoveredById: new Map(backfills.map((b) => [b.projectId, b.earliestCovered])),
      activityCountById: new Map(
        activityGroups.filter((g) => g.projectId).map((g) => [g.projectId, g._count._all])
      ),
      floor: FLOOR,
    };

    const ids = selectBackfillProjects(input);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, ids.join("\n") + (ids.length ? "\n" : ""), "utf8");

    console.log(`[dc-build-extract-list] floor=${FLOOR.toISOString()}`);
    console.log(`[dc-build-extract-list] eligible (MTY ∩)=${eligible.length}`);
    console.log(`[dc-build-extract-list] remaining projects=${ids.length} -> ${OUT}`);
    console.log(`[dc-build-extract-list] est. requests=${Math.ceil(ids.length / 50)} (at 50/req)`);
    if (ids.length === 0) console.log("[dc-build-extract-list] NOTHING REMAINING — campaign complete.");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
