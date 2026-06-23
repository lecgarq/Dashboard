#!/usr/bin/env node
/**
 * Diagnostic: go deep on AccActivity "type of activity" classification.
 * Read-only. Pulls every distinct rawAction with volume, runs the live
 * classifyActivity(), and reports module/category distribution + the actions
 * hiding in "Other"/Unmapped + the unused service/tool/details signal.
 */
require("tsx/cjs");

const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { classifyActivity, CATEGORY_LABELS } = require("../lib/acc/activityClassification.ts");
const { donutModules } = require("../lib/acc/activityClassification.ts");

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

const moduleLabel = new Map(donutModules().map((m) => [m.id, m.label]));
moduleLabel.set("unmapped", "Unmapped");

const pad = (s, n) => String(s).padEnd(n);
const padn = (n, w) => String(n).padStart(w);
const pct = (n, d) => d ? ((100 * n) / d).toFixed(1) + "%" : "0%";

async function main() {
  const prisma = createPrisma();
  try {
    // 1) distinct rawAction with total volume
    const byAction = await prisma.accActivity.groupBy({ by: ["rawAction"], _count: { id: true } });
    const total = byAction.reduce((s, r) => s + r._count.id, 0);
    console.log(`\n=== AccActivity overview ===`);
    console.log(`distinct rawAction: ${byAction.length}   total rows: ${total.toLocaleString()}`);

    // 2) classify each, aggregate by module + category
    const modVol = new Map(), catVol = new Map();
    const other = [], unmapped = [];
    for (const r of byAction) {
      const c = classifyActivity(r.rawAction);
      modVol.set(c.moduleId, (modVol.get(c.moduleId) ?? 0) + r._count.id);
      catVol.set(c.category, (catVol.get(c.category) ?? 0) + r._count.id);
      if (c.category === CATEGORY_LABELS.unknown) other.push({ raw: r.rawAction, label: c.label, module: c.moduleId, n: r._count.id });
      if (c.moduleId === "unmapped") unmapped.push({ raw: r.rawAction, n: r._count.id });
    }

    console.log(`\n=== Volume by MODULE ===`);
    [...modVol.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) =>
      console.log(`  ${pad(moduleLabel.get(id) ?? id, 22)} ${padn(n.toLocaleString(), 12)}  ${pct(n, total)}`));

    console.log(`\n=== Volume by CATEGORY (action axis) ===`);
    [...catVol.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, n]) =>
      console.log(`  ${pad(cat, 22)} ${padn(n.toLocaleString(), 12)}  ${pct(n, total)}`));

    console.log(`\n=== Actions landing in "${CATEGORY_LABELS.unknown}" (uncategorized) — ${other.length} actions ===`);
    other.sort((a, b) => b.n - a.n).slice(0, 40).forEach((o) =>
      console.log(`  ${pad(o.raw, 42)} -> ${pad(moduleLabel.get(o.module) ?? o.module, 18)} ${padn(o.n.toLocaleString(), 10)}`));

    console.log(`\n=== UNMAPPED actions — ${unmapped.length} ===`);
    unmapped.sort((a, b) => b.n - a.n).forEach((u) => console.log(`  ${pad(u.raw, 42)} ${padn(u.n, 8)}`));

    // 3) unused signal: service / tool distinct values
    const [bySvc, byTool] = await Promise.all([
      prisma.accActivity.groupBy({ by: ["service"], _count: { id: true } }),
      prisma.accActivity.groupBy({ by: ["tool"], _count: { id: true } }),
    ]);
    console.log(`\n=== Distinct service values (${bySvc.length}) — currently UNUSED by classifier ===`);
    bySvc.sort((a, b) => b._count.id - a._count.id).slice(0, 25).forEach((s) =>
      console.log(`  ${pad(s.service ?? "(null)", 30)} ${padn(s._count.id.toLocaleString(), 12)}`));
    console.log(`\n=== Distinct tool values (${byTool.length}) — currently UNUSED ===`);
    byTool.sort((a, b) => b._count.id - a._count.id).slice(0, 25).forEach((t) =>
      console.log(`  ${pad(t.tool ?? "(null)", 30)} ${padn(t._count.id.toLocaleString(), 12)}`));

    // 4) sample details for the top "Other" actions to see if details disambiguates
    const sampleRaws = other.sort((a, b) => b.n - a.n).slice(0, 6).map((o) => o.raw);
    if (sampleRaws.length) {
      console.log(`\n=== details samples for top "Other" actions ===`);
      for (const raw of sampleRaws) {
        const rows = await prisma.accActivity.findMany({
          where: { rawAction: raw }, select: { service: true, tool: true, details: true }, take: 3,
        });
        console.log(`  [${raw}]`);
        rows.forEach((r) => console.log(`     svc=${r.service ?? "-"} tool=${r.tool ?? "-"} details=${(r.details ?? "").slice(0, 90)}`));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
