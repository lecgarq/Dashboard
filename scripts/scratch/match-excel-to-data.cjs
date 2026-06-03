#!/usr/bin/env node
/**
 * match-excel-to-data.cjs — READ-ONLY. Systematic excel<->data reconciliation.
 *
 * 1. Parses the excel activity hierarchy (module -> group -> action) from acc_dump.txt.
 * 2. Re-queries distinct DB rawActions (project) + canonical service per action.
 * 3. Matches via kebab-normalized labels. Reports:
 *      - matched   (excel action that has data)        -> module+group (excel) + service (db)
 *      - excelOnly (excel action with NO data)         -> will render greyed
 *      - dbOnly    (data action NOT in excel)          -> needs cataloguing (service-based fallback)
 * Output -> scripts/scratch/excel-data-match-report.txt (UTF-8). SELECT only.
 */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

const MODULES = new Set([
  "AutoSpecs", "Build", "Data Management", "Datum", "Design Collaboration",
  "Insight", "Model Coordination", "Preconstruction",
]);
const GROUPS = new Set([
  "Content Change", "Delete", "Read", "Workflow Change", "ACCess Change",
  "Unknown", "Pre-Wired / Not Observed",
]);
const SKIP_PREFIXES = ["No empirical", "Pre-Wired"];
const TRAILING_META = new Set(["Activity Date", "Activity Project Id"]);

const kebab = (s) =>
  s.toLowerCase().replace(/\+/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function parseExcel(dumpPath) {
  const lines = fs.readFileSync(dumpPath, "utf8").split(/\r?\n/);
  // dump lines look like:  "58\t[R58] A: ACTIVITY MODULE TYPE DATA"
  const cells = [];
  for (const ln of lines) {
    const m = ln.match(/\[R\d+\]\s+A:\s?(.*)$/);
    if (m) cells.push(m[1]);
  }
  const start = cells.findIndex((c) => c === "ACTIVITY MODULE TYPE DATA");
  const actions = [];
  let mod = null, grp = null;
  for (let i = start + 1; i < cells.length; i++) {
    const c = (cells[i] || "").trim();
    if (!c) continue;
    if (TRAILING_META.has(c)) continue;
    if (MODULES.has(c)) { mod = c; grp = null; continue; }
    if (GROUPS.has(c)) { grp = c; continue; }
    if (SKIP_PREFIXES.some((p) => c.startsWith(p))) continue;
    actions.push({ label: c, norm: kebab(c), module: mod, group: grp });
  }
  return actions;
}

async function main() {
  const excel = parseExcel("acc_dump.txt");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const rows = await client.query(`
    SELECT "rawAction" AS a,
           MODE() WITHIN GROUP (ORDER BY service) FILTER (WHERE service IS NOT NULL) AS svc,
           COUNT(*)::int AS n,
           COUNT(DISTINCT (lower("userEmail")||'::'||"projectId"))::int AS inst
    FROM "AccActivity" WHERE "sourceFile"='project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
    GROUP BY "rawAction"`).then((r) => r.rows);
  await client.end();

  const dbByNorm = new Map(rows.map((r) => [r.a, r]));
  const excelByNorm = new Map(excel.map((e) => [e.norm, e]));

  const out = [];
  const log = (s = "") => out.push(s);

  const matched = excel.filter((e) => dbByNorm.has(e.norm));
  const excelOnly = excel.filter((e) => !dbByNorm.has(e.norm));
  const dbOnly = rows.filter((r) => !excelByNorm.has(r.a));

  log(`EXCEL actions parsed: ${excel.length}`);
  log(`DB distinct actions:  ${rows.length}`);
  log(`MATCHED (excel action WITH data): ${matched.length}`);
  log(`EXCEL-ONLY (greyed, no data):     ${excelOnly.length}`);
  log(`DB-ONLY (in data, not in excel):  ${dbOnly.length}`);

  log(`\n== MATCHED (module | group | action | service | instances) ==`);
  for (const e of matched.sort((a, b) => (a.module + a.group).localeCompare(b.module + b.group))) {
    const d = dbByNorm.get(e.norm);
    log(`  ${String(e.module).padEnd(20)} ${String(e.group).padEnd(16)} ${e.norm.padEnd(46)} svc=${String(d.svc || "-").padEnd(12)} inst=${d.inst}`);
  }
  log(`\n== EXCEL-ONLY (will render greyed) ==`);
  for (const e of excelOnly) log(`  ${String(e.module).padEnd(20)} ${String(e.group).padEnd(16)} ${e.label}  (norm=${e.norm})`);
  log(`\n== DB-ONLY (needs cataloguing; map via service) ==`);
  for (const r of dbOnly.sort((a, b) => b.inst - a.inst)) log(`  ${String(r.a).padEnd(46)} svc=${String(r.svc || "-").padEnd(12)} inst=${r.inst} rows=${r.n}`);

  fs.writeFileSync("scripts/scratch/excel-data-match-report.txt", out.join("\n"), "utf8");
  console.log("WROTE scripts/scratch/excel-data-match-report.txt");
  console.log(`matched=${matched.length} excelOnly=${excelOnly.length} dbOnly=${dbOnly.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
