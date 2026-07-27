#!/usr/bin/env node
/**
 * Diagnostic 2: cross-tab Autodesk's native `service` field against our
 * rawAction-derived module/category. Surfaces disagreements (where Autodesk
 * says one product but classifyActivity says another) and what the huge
 * null-service population actually is. Read-only.
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
const padn = (n, w) => String(n).padStart(w);

async function main() {
  const prisma = createPrisma();
  try {
    // group by (service, rawAction) so we can attribute each row's service to a module
    const rows = await prisma.accActivity.groupBy({ by: ["service", "rawAction"], _count: { id: true } });

    // service x module matrix
    const cell = new Map(); // `${service}|${module}` -> count
    const svcTotal = new Map();
    const disagree = []; // service implies product X but module is unrelated
    const SERVICE_TO_MODULE = {
      docs: "dataManagement", sheets: "dataManagement", bridge: "dataManagement",
      issues: "build", submittals: "build", rfis: "build", admin: "adminActions",
    };
    for (const r of rows) {
      const svc = r.service ?? "(null)";
      const c = classifyActivity(r.rawAction);
      cell.set(`${svc}|${c.moduleId}`, (cell.get(`${svc}|${c.moduleId}`) ?? 0) + r._count.id);
      svcTotal.set(svc, (svcTotal.get(svc) ?? 0) + r._count.id);
      const expected = SERVICE_TO_MODULE[svc];
      if (expected && expected !== c.moduleId) {
        disagree.push({ svc, raw: r.rawAction, got: c.moduleId, expected, n: r._count.id });
      }
    }

    console.log(`\n=== service -> module cross-tab (rows by Autodesk service vs our module) ===`);
    const services = [...svcTotal.keys()].sort((a, b) => (svcTotal.get(b)) - (svcTotal.get(a)));
    for (const svc of services) {
      console.log(`\n  service="${svc}"  total=${svcTotal.get(svc).toLocaleString()}`);
      [...cell.entries()].filter(([k]) => k.startsWith(svc + "|"))
        .sort((a, b) => b[1] - a[1])
        .forEach(([k, n]) => {
          const mod = k.split("|")[1];
          console.log(`       ${pad(moduleLabel.get(mod) ?? mod, 22)} ${padn(n.toLocaleString(), 12)}`);
        });
    }

    console.log(`\n=== DISAGREEMENTS: Autodesk service implies a different module than classifyActivity ===`);
    if (!disagree.length) console.log("  (none)");
    const byKey = new Map();
    for (const d of disagree) {
      const k = `${d.svc}::${d.raw}::${d.got}`;
      byKey.set(k, (byKey.get(k) ?? 0) + d.n);
    }
    [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).forEach(([k, n]) => {
      const [svc, raw, got] = k.split("::");
      console.log(`  svc=${pad(svc, 10)} action=${pad(raw, 40)} -> we say ${pad(moduleLabel.get(got) ?? got, 18)} ${padn(n.toLocaleString(), 10)}`);
    });

    // what is the null-service population? top actions
    console.log(`\n=== null-service population: top rawActions ===`);
    const nullRows = rows.filter((r) => r.service == null);
    const nullTotal = nullRows.reduce((s, r) => s + r._count.id, 0);
    console.log(`  null-service total = ${nullTotal.toLocaleString()} across ${nullRows.length} distinct actions`);
    nullRows.sort((a, b) => b._count.id - a._count.id).slice(0, 20).forEach((r) => {
      const c = classifyActivity(r.rawAction);
      console.log(`  ${pad(r.rawAction, 42)} -> ${pad(moduleLabel.get(c.moduleId) ?? c.moduleId, 18)} ${padn(r._count.id.toLocaleString(), 12)}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
