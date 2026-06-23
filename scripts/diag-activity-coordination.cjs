#!/usr/bin/env node
/**
 * Diagnostic 3: settle the Model-Coordination question and quantify the impact
 * of a service-authoritative rule. Read-only.
 *   (a) Do the 8 "coordination" issue verbs carry ANY in-data coordination
 *       marker (service / details), or are they indistinguishable from Build?
 *   (b) If `service` (when present) decided the module, how many rows move?
 */
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();
const { classifyActivity, donutModules } = require("../lib/acc/activityClassification.ts");

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}
const moduleLabel = new Map(donutModules().map((m) => [m.id, m.label]));
moduleLabel.set("unmapped", "Unmapped");
const pad = (s, n) => String(s).padEnd(n);

const COORD_VERBS = ["issue-attach", "issue-work-completed", "issue-ready-to-inspect",
  "issue-suggestion-generated", "issue-detach", "issue-respond", "issue-answered", "issue-void"];

// Defensible service -> module mapping (Autodesk's own service grouping).
const SERVICE_TO_MODULE = {
  docs: "dataManagement", sheets: "dataManagement", bridge: "dataManagement",
  issues: "build", submittals: "build", rfis: "build", admin: "adminActions",
};

async function main() {
  const prisma = createPrisma();
  try {
    // (a) coordination verbs: service spread + details samples
    console.log(`=== "coordination" verbs: where does Autodesk file them? ===`);
    for (const v of COORD_VERBS) {
      const bySvc = await prisma.accActivity.groupBy({ by: ["service"], where: { rawAction: v }, _count: { id: true } });
      const spread = bySvc.map((s) => `${s.service ?? "null"}:${s._count.id}`).join("  ");
      console.log(`  ${pad(v, 30)} ${spread || "(no rows)"}`);
    }
    console.log(`\n=== details samples (does anything say "coordination"?) ===`);
    for (const v of ["issue-suggestion-generated", "issue-attach", "issue-work-completed"]) {
      const rows = await prisma.accActivity.findMany({ where: { rawAction: v }, select: { service: true, details: true }, take: 4 });
      console.log(`  [${v}]`);
      rows.forEach((r) => console.log(`     svc=${r.service ?? "-"}  details=${(r.details ?? "(empty)").slice(0, 100)}`));
    }

    // (b) impact of a service-authoritative rule (service wins when present)
    const rows = await prisma.accActivity.groupBy({ by: ["service", "rawAction"], _count: { id: true } });
    let moved = 0, total = 0, nullKept = 0;
    const moves = new Map(); // `${from}->${to}` -> count
    for (const r of rows) {
      total += r._count.id;
      const cur = classifyActivity(r.rawAction).moduleId;
      const svcMod = r.service ? SERVICE_TO_MODULE[r.service] : null;
      if (!svcMod) { nullKept += r._count.id; continue; }
      if (svcMod !== cur) {
        moved += r._count.id;
        const k = `${moduleLabel.get(cur) ?? cur}  ->  ${moduleLabel.get(svcMod) ?? svcMod}`;
        moves.set(k, (moves.get(k) ?? 0) + r._count.id);
      }
    }
    console.log(`\n=== Impact: service-authoritative (service wins when non-null) ===`);
    console.log(`  total rows: ${total.toLocaleString()}   null-service kept on taxonomy: ${nullKept.toLocaleString()} (${(100*nullKept/total).toFixed(1)}%)`);
    console.log(`  rows that change module: ${moved.toLocaleString()} (${(100*moved/total).toFixed(2)}%)`);
    console.log(`  net module moves:`);
    [...moves.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
      console.log(`     ${pad(k, 48)} ${n.toLocaleString()}`));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
