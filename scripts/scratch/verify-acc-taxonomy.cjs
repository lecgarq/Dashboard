#!/usr/bin/env node
/**
 * verify-acc-taxonomy.cjs — READ-ONLY taxonomy reconciliation for the dimension redesign.
 *
 * Dumps the REAL vocabulary present in the local DB so we can validate acc.xlsx:
 *   - distinct AccActivity.rawAction (project activity) + row counts + instance coverage
 *   - sourceFile breakdown
 *   - distinct productKey (modules), permType (access ladder)
 *   - structural cardinalities: instances, projects, roles, companies, statuses
 *
 * SELECT/aggregate only. No writes. Output -> scripts/scratch/acc-taxonomy-report.txt (UTF-8).
 */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (sql, params) => client.query(sql, params).then((r) => r.rows);
  const out = [];
  const log = (s = "") => out.push(s);

  try {
    // 0. instance universe
    const inst = (await q(`SELECT COUNT(*)::int AS n FROM "AccDcProjectUser"`))[0].n;
    log(`INSTANCE UNIVERSE (AccDcProjectUser rows = nodes): ${inst.toLocaleString()}`);

    // sourceFile breakdown
    log(`\n== AccActivity sourceFile breakdown ==`);
    for (const r of await q(`SELECT "sourceFile" AS sf, COUNT(*)::int AS n FROM "AccActivity" GROUP BY "sourceFile" ORDER BY n DESC`)) {
      log(`  ${r.sf}: ${r.n.toLocaleString()}`);
    }

    // 1. distinct rawAction for project activity, with row + instance coverage
    const actions = await q(`
      SELECT "rawAction" AS a,
             COUNT(*)::int AS rows,
             COUNT(DISTINCT (lower("userEmail") || '::' || "projectId"))::int AS instances
      FROM "AccActivity"
      WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
      GROUP BY "rawAction"
      ORDER BY rows DESC
    `);
    log(`\n== DISTINCT rawAction (project activity): ${actions.length} distinct ==`);
    log(`  ${"rawAction".padEnd(48)} ${"rows".padStart(12)} ${"instances".padStart(12)}`);
    for (const r of actions) {
      log(`  ${String(r.a).padEnd(48)} ${r.rows.toLocaleString().padStart(12)} ${r.instances.toLocaleString().padStart(12)}`);
    }

    // 1b. admin-sourced actions too (in case some live there)
    const adminActions = await q(`
      SELECT "rawAction" AS a, COUNT(*)::int AS rows
      FROM "AccActivity"
      WHERE "sourceFile" <> 'project'
      GROUP BY "rawAction" ORDER BY rows DESC
    `);
    log(`\n== DISTINCT rawAction (non-project sourceFile): ${adminActions.length} distinct ==`);
    for (const r of adminActions) log(`  ${String(r.a).padEnd(48)} ${r.rows.toLocaleString().padStart(12)}`);

    // 2. modules (productKey)
    const products = await q(`SELECT "productKey" AS k, COUNT(*)::int AS n, COUNT(DISTINCT ("projectId"||'::'||"userId"))::int AS instances FROM "AccDcProjectUserProduct" GROUP BY "productKey" ORDER BY n DESC`);
    log(`\n== DISTINCT productKey (module access): ${products.length} ==`);
    for (const r of products) log(`  ${String(r.k).padEnd(36)} rows=${r.n.toLocaleString().padStart(10)} instances=${r.instances.toLocaleString().padStart(10)}`);

    // 3. permType (access ladder)
    const perms = await q(`SELECT "permType" AS p, COUNT(*)::int AS n FROM "AccFolderPermission" GROUP BY "permType" ORDER BY n DESC`);
    log(`\n== DISTINCT permType (AccFolderPermission): ${perms.length} ==`);
    for (const r of perms) log(`  ${String(r.p).padEnd(48)} ${r.n.toLocaleString().padStart(12)}`);

    // 4. structural cardinalities
    log(`\n== STRUCTURAL cardinalities ==`);
    const card = async (label, sql) => log(`  ${label}: ${(await q(sql))[0].n.toLocaleString()}`);
    await card("distinct projects (AccDcProjectUser)", `SELECT COUNT(DISTINCT "projectId")::int AS n FROM "AccDcProjectUser"`);
    await card("distinct users (AccDcProjectUser)", `SELECT COUNT(DISTINCT "userId")::int AS n FROM "AccDcProjectUser"`);
    await card("distinct roles (AccDcProjectUserRole)", `SELECT COUNT(DISTINCT "roleId")::int AS n FROM "AccDcProjectUserRole"`);
    await card("distinct companies (AccDcProjectUserCompany)", `SELECT COUNT(DISTINCT "companyId")::int AS n FROM "AccDcProjectUserCompany"`);

    // project statuses
    log(`\n== project status distribution (AccProject) ==`);
    for (const r of await q(`SELECT COALESCE(status,'(null)') AS s, COUNT(*)::int AS n FROM "AccProject" GROUP BY status ORDER BY n DESC`)) {
      log(`  ${String(r.s).padEnd(24)} ${r.n.toLocaleString().padStart(10)}`);
    }
  } finally {
    await client.end();
  }

  fs.writeFileSync("scripts/scratch/acc-taxonomy-report.txt", out.join("\n"), "utf8");
  console.log("WROTE scripts/scratch/acc-taxonomy-report.txt");
}

main().catch((e) => { console.error(e); process.exit(1); });
