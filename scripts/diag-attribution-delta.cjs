#!/usr/bin/env node
/**
 * Live before/after evidence for the 21.1-01 service-first attribution fix
 * (UAT-21.1-02). Read-only diagnostic mirroring scripts/diag-activity-service-xtab.cjs's
 * bootstrapping conventions.
 *
 * NOTE: this script duplicates the per-(project, action, service) aggregate SQL
 * from lib/server/moduleActivityView.ts rather than importing it, per the
 * scripts -> app/lib boundary convention (scripts must not import from
 * lib/server; they legitimately import from lib/acc, per BND-02 precedent --
 * see the four sibling diag-activity-*.cjs scripts).
 *
 * For every aggregate row, classifies twice using the SAME (new, service-first)
 * classifier:
 *   - BEFORE: classifyActivity(rawAction)            -- verb-only (service omitted)
 *   - AFTER:  classifyActivity(rawAction, service)    -- service-first
 * Emits per-module totals before vs after (absolute + delta + % of grand total),
 * a from-module -> to-module movement matrix for rows that moved, and the
 * overall service-attributed vs verb-inferred volume split (AFTER).
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
const MODULE_ORDER = [...donutModules().map((m) => m.id), "unmapped"];
const labelOf = (id) => moduleLabel.get(id) ?? id;
const num = (n) => n.toLocaleString();
// Adaptive precision: small shares (movement is expected to be tiny per research)
// need more than 2 decimals or they all read as a misleading "0.00%".
const pct = (n, total) => {
  if (total <= 0) return "0.0000%";
  const p = (100 * n) / total;
  if (p === 0) return "0.0000%";
  return `${p < 1 ? p.toFixed(4) : p.toFixed(2)}%`;
};

// Duplicated from lib/server/moduleActivityView.ts's union (post-21.1-01 shape).
const UNION_SQL = `
  WITH astart AS (
    SELECT "projectId", MIN("createdAt") AS s
    FROM "AccActivityAccds"
    GROUP BY "projectId"
  )
  SELECT pid AS "projectId", action AS "rawAction", service, SUM(c)::int AS count
  FROM (
    SELECT "projectId" AS pid, "activityVerb" AS action, "serviceGroup" AS service, COUNT(*)::int AS c
      FROM "AccActivityAccds"
      GROUP BY 1, 2, 3
    UNION ALL
    SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, d."service" AS service, COUNT(*)::int AS c
      FROM "AccActivity" d
      LEFT JOIN astart a ON a."projectId" = d."projectId"
      WHERE d."projectId" IS NULL OR d."projectId" = ''
         OR a.s IS NULL
         OR d."createdAt" < a.s
      GROUP BY 1, 2, 3
  ) u
  GROUP BY pid, action, service
`;

async function main() {
  const prisma = createPrisma();
  try {
    const rows = await prisma.$queryRawUnsafe(UNION_SQL);

    const beforeTotals = new Map(); // moduleId -> volume
    const afterTotals = new Map();
    const movementMatrix = new Map(); // "fromId->toId" -> volume
    let grandTotal = 0;
    let serviceAttributed = 0;
    let verbInferred = 0;
    let movedVolume = 0;

    for (const r of rows) {
      const count = r.count;
      grandTotal += count;

      const before = classifyActivity(r.rawAction); // verb-only (service omitted)
      const after = classifyActivity(r.rawAction, r.service); // service-first

      beforeTotals.set(before.moduleId, (beforeTotals.get(before.moduleId) ?? 0) + count);
      afterTotals.set(after.moduleId, (afterTotals.get(after.moduleId) ?? 0) + count);

      if (after.attributedBy === "service") serviceAttributed += count;
      else verbInferred += count;

      if (before.moduleId !== after.moduleId) {
        movedVolume += count;
        const key = `${before.moduleId}->${after.moduleId}`;
        movementMatrix.set(key, (movementMatrix.get(key) ?? 0) + count);
      }
    }

    const out = [];
    out.push(`# Phase 21.1 Plan 01: Attribution-movement evidence (before/after)`);
    out.push(``);
    out.push(`Generated read-only from the live PostgreSQL DB (\`scripts/diag-attribution-delta.cjs\`),`);
    out.push(`2026-07-06, against the post-21.1-01 per-(project, action, service) aggregate`);
    out.push(`(${num(rows.length)} aggregate rows, ${num(grandTotal)} total activities).`);
    out.push(``);
    out.push(`**BEFORE** = \`classifyActivity(rawAction)\` (verb-only, the pre-21.1-01 behavior).`);
    out.push(`**AFTER** = \`classifyActivity(rawAction, service)\` (service-first, 21.1-01's new default).`);
    out.push(``);
    out.push(`## Headline`);
    out.push(``);
    out.push(`- Total activity volume: **${num(grandTotal)}**`);
    out.push(`- Moved to a different module: **${num(movedVolume)}** (${pct(movedVolume, grandTotal)} of total)`);
    out.push(`- Service-attributed (AFTER): **${num(serviceAttributed)}** (${pct(serviceAttributed, grandTotal)})`);
    out.push(`- Verb-inferred (AFTER): **${num(verbInferred)}** (${pct(verbInferred, grandTotal)})`);
    out.push(``);
    out.push(`## Per-module totals: before vs after`);
    out.push(``);
    out.push(`| Module | Before | After | Delta | Delta % of grand total |`);
    out.push(`|---|--:|--:|--:|--:|`);
    for (const id of MODULE_ORDER) {
      const b = beforeTotals.get(id) ?? 0;
      const a = afterTotals.get(id) ?? 0;
      if (b === 0 && a === 0) continue;
      const delta = a - b;
      const sign = delta > 0 ? "+" : "";
      out.push(`| ${labelOf(id)} | ${num(b)} | ${num(a)} | ${sign}${num(delta)} | ${sign}${pct(Math.abs(delta), grandTotal)} |`);
    }
    out.push(``);
    out.push(`## Movement matrix (rows that moved module)`);
    out.push(``);
    if (movementMatrix.size === 0) {
      out.push(`(no movement)`);
    } else {
      out.push(`| From | To | Volume | % of total |`);
      out.push(`|---|---|--:|--:|`);
      const sortedMoves = [...movementMatrix.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key, vol] of sortedMoves) {
        const [fromId, toId] = key.split("->");
        out.push(`| ${labelOf(fromId)} | ${labelOf(toId)} | ${num(vol)} | ${pct(vol, grandTotal)} |`);
      }
    }
    out.push(``);
    out.push(`## Interpretation`);
    out.push(``);
    out.push(
      `Movement is real but small (order of ${pct(movedVolume, grandTotal)} of total activity). The`,
    );
    out.push(`live movement matrix above shows the actual shape of this run, not a hypothetical:`);
    for (const [key, vol] of [...movementMatrix.entries()].sort((a, b) => b[1] - a[1])) {
      const [fromId, toId] = key.split("->");
      out.push(`- **${labelOf(fromId)} -> ${labelOf(toId)}**: ${num(vol)} rows (${pct(vol, grandTotal)}).`);
    }
    out.push(``);
    out.push(
      `Most of this is the Unmapped rescue (a previously-Unmapped rawAction resolved by a recognized`,
    );
    out.push(
      `service tag), plus a small number of decisive-service overrides (e.g. a rawAction that verb-classified`,
    );
    out.push(
      `to Data Management but carries an \`issues\`/\`submittals\`/\`rfis\`/\`admin\` service tag, so service wins).`,
    );
    out.push(
      `The much larger ~8,107-row \`docs\`-serviceGroup-to-Admin-Actions population 21.1-RESEARCH.md measured`,
    );
    out.push(
      `is an UMBRELLA service (docs/sheets/bridge) deferring to an already-correct, more granular verb`,
    );
    out.push(
      `refinement — by design (locked decision) it produces **zero** module movement here, because the`,
    );
    out.push(
      `verb taxonomy's Design Collaboration / Datum / Admin Actions splits are intentional, not bugs, and`,
    );
    out.push(`an umbrella service never flattens them back to Data Management.`);
    out.push(``);
    out.push(
      `This is **not** a Model Coordination reclassification — that was already fixed 2026-06-05 by`,
    );
    out.push(
      `commit \`6164cfae\`, which redirected all \`issue-*\` verbs to Build and excluded Model Coordination`,
    );
    out.push(
      `from the donut entirely. \`docs/activity-module-audit.md\`'s "~966 Model Coordination" figure is stale`,
    );
    out.push(`(untracked, predates that commit) and is superseded by this live evidence — it should not be`);
    out.push(`cited going forward.`);
    out.push(``);
    out.push(
      `The service-attributed/verb-inferred split above (${pct(serviceAttributed, grandTotal)} / ${pct(verbInferred, grandTotal)})`,
    );
    out.push(
      `is the live figure the Overview tab's TRUTH-03 caveat should state (wired in plan 21.1-04), replacing the`,
    );
    out.push(`stale "~40.7% disagreement" framing (that number was always \`AccActivity\`'s population rate, not`,
    );
    out.push(`a disagreement rate).`);
    out.push(``);

    const dest = path.join(
      ".planning",
      "phases",
      "21.1-overview-tab-uat-follow-ups",
      "21.1-ATTRIBUTION-DELTA.md",
    );
    fs.writeFileSync(dest, out.join("\n"), "utf8");
    console.log(`wrote ${dest}`);
    console.log(`total=${num(grandTotal)} moved=${num(movedVolume)} (${pct(movedVolume, grandTotal)})`);
    console.log(`serviceAttributed=${num(serviceAttributed)} (${pct(serviceAttributed, grandTotal)})  verbInferred=${num(verbInferred)} (${pct(verbInferred, grandTotal)})`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
