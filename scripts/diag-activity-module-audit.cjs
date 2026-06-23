#!/usr/bin/env node
/**
 * Deep diagnosis: full per-activity-type -> module audit.
 * For every distinct rawAction: volume, assigned module + label + category
 * (from classifyActivity), and the Autodesk `service` spread, with an agreement
 * flag where service implies a different module. Writes a readable markdown
 * audit grouped by assigned module. Read-only.
 */
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
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
// Module display order = donut order, Unmapped last.
const MODULE_ORDER = [...donutModules().map((m) => m.id), "unmapped"];

// Autodesk service -> the module it implies (its native product grouping).
const SERVICE_TO_MODULE = {
  docs: "dataManagement", sheets: "dataManagement", bridge: "dataManagement",
  issues: "build", submittals: "build", rfis: "build", admin: "adminActions",
};
const num = (n) => n.toLocaleString();

async function main() {
  const prisma = createPrisma();
  try {
    const rows = await prisma.accActivity.groupBy({ by: ["rawAction", "service"], _count: { id: true } });

    // collapse to per-action: total + service spread
    const byAction = new Map(); // raw -> { total, svc: Map<service,count> }
    for (const r of rows) {
      const a = byAction.get(r.rawAction) ?? { total: 0, svc: new Map() };
      a.total += r._count.id;
      a.svc.set(r.service ?? null, (a.svc.get(r.service ?? null) ?? 0) + r._count.id);
      byAction.set(r.rawAction, a);
    }

    const grandTotal = [...byAction.values()].reduce((s, a) => s + a.total, 0);

    // build per-action audit record
    const records = [];
    for (const [raw, a] of byAction) {
      const c = classifyActivity(raw);
      // dominant non-null service (if any)
      const svcPairs = [...a.svc.entries()].filter(([s]) => s != null).sort((x, y) => y[1] - x[1]);
      const svcStr = [...a.svc.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([s, n]) => `${s ?? "(null)"}:${num(n)}`).join(", ");
      // disagreement: any non-null service implies a different module than assigned
      let flag = "";
      for (const [s, n] of svcPairs) {
        const implied = SERVICE_TO_MODULE[s];
        if (implied && implied !== c.moduleId) { flag = `⚠ ${moduleLabel.get(implied) ?? implied}`; break; }
      }
      records.push({ raw, label: c.label, moduleId: c.moduleId, category: c.category,
        total: a.total, svcStr, flag });
    }

    // group by assigned module
    const byModule = new Map();
    for (const r of records) (byModule.get(r.moduleId) ?? byModule.set(r.moduleId, []).get(r.moduleId)).push(r);

    // ---- write markdown ----
    const out = [];
    out.push(`# Activity-type → module audit`);
    out.push(``);
    out.push(`Generated read-only from live PG. **${num(grandTotal)} rows · ${byAction.size} distinct activity types.**`);
    out.push(`Module + category from \`classifyActivity\`; \`service\` is Autodesk's own product attribution.`);
    out.push(`A ⚠ flag means the dominant \`service\` implies a different module than we assigned (review candidate).`);
    out.push(``);
    // module summary table
    out.push(`## Module totals`);
    out.push(``);
    out.push(`| Module | Activity types | Volume | % | ⚠ flagged types |`);
    out.push(`|---|--:|--:|--:|--:|`);
    for (const id of MODULE_ORDER) {
      const list = byModule.get(id);
      if (!list) continue;
      const vol = list.reduce((s, r) => s + r.total, 0);
      const flagged = list.filter((r) => r.flag).length;
      out.push(`| ${moduleLabel.get(id) ?? id} | ${list.length} | ${num(vol)} | ${(100*vol/grandTotal).toFixed(1)}% | ${flagged || ""} |`);
    }
    out.push(``);
    // per-module action tables
    for (const id of MODULE_ORDER) {
      const list = byModule.get(id);
      if (!list) continue;
      list.sort((a, b) => b.total - a.total);
      const vol = list.reduce((s, r) => s + r.total, 0);
      out.push(`## ${moduleLabel.get(id) ?? id} — ${num(vol)} activities, ${list.length} types`);
      out.push(``);
      out.push(`| Activity (label) | rawAction | Volume | Category | service spread | review |`);
      out.push(`|---|---|--:|---|---|---|`);
      for (const r of list) {
        out.push(`| ${r.label} | \`${r.raw}\` | ${num(r.total)} | ${r.category} | ${r.svcStr} | ${r.flag} |`);
      }
      out.push(``);
    }

    const dest = path.join("docs", "activity-module-audit.md");
    fs.writeFileSync(dest, out.join("\n"), "utf8");
    console.log(`wrote ${dest}  (${byAction.size} types, ${num(grandTotal)} rows)`);

    // console: the flagged (review-candidate) actions, the real signal
    const flagged = records.filter((r) => r.flag).sort((a, b) => b.total - a.total);
    console.log(`\n=== ${flagged.length} activity types where service implies a different module (review) ===`);
    for (const r of flagged) {
      console.log(`  ${String(num(r.total)).padStart(8)}  ${r.raw.padEnd(34)} assigned=${(moduleLabel.get(r.moduleId)||r.moduleId).padEnd(20)} ${r.flag}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
