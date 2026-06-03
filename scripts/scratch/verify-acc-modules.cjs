#!/usr/bin/env node
/**
 * verify-acc-modules.cjs — READ-ONLY. Investigates how to map extracted data -> excel modules.
 * Dumps AccActivity.service / .tool, serviceKey access, and rawAction×service crosstab.
 * Output -> scripts/scratch/acc-modules-report.txt (UTF-8). SELECT only.
 */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (sql, p) => client.query(sql, p).then((r) => r.rows);
  const out = [];
  const log = (s = "") => out.push(s);

  try {
    log(`== AccActivity.service distribution (project) ==`);
    for (const r of await q(`SELECT COALESCE(service,'(null)') AS s, COUNT(*)::int AS n, COUNT(DISTINCT "rawAction")::int AS actions FROM "AccActivity" WHERE "sourceFile"='project' GROUP BY service ORDER BY n DESC`)) {
      log(`  ${String(r.s).padEnd(28)} rows=${r.n.toLocaleString().padStart(10)}  distinctActions=${r.actions}`);
    }

    log(`\n== AccActivity.tool distribution (project) ==`);
    for (const r of await q(`SELECT COALESCE(tool,'(null)') AS t, COUNT(*)::int AS n, COUNT(DISTINCT "rawAction")::int AS actions FROM "AccActivity" WHERE "sourceFile"='project' GROUP BY tool ORDER BY n DESC`)) {
      log(`  ${String(r.t).padEnd(28)} rows=${r.n.toLocaleString().padStart(10)}  distinctActions=${r.actions}`);
    }

    log(`\n== rawAction x service crosstab (project) — service per action ==`);
    const ct = await q(`
      SELECT "rawAction" AS a, COALESCE(service,'(null)') AS s, COALESCE(tool,'(null)') AS t, COUNT(*)::int AS n
      FROM "AccActivity" WHERE "sourceFile"='project'
      GROUP BY "rawAction", service, tool ORDER BY "rawAction", n DESC`);
    let cur = null;
    for (const r of ct) {
      if (r.a !== cur) { log(`  ${r.a}`); cur = r.a; }
      log(`      service=${String(r.s).padEnd(22)} tool=${String(r.t).padEnd(22)} ${r.n.toLocaleString().padStart(10)}`);
    }

    log(`\n== AccDcProjectUserService.serviceKey distribution (service-level access) ==`);
    for (const r of await q(`SELECT "serviceKey" AS k, COUNT(*)::int AS n, COUNT(DISTINCT ("projectId"||'::'||"userId"))::int AS inst FROM "AccDcProjectUserService" GROUP BY "serviceKey" ORDER BY n DESC`)) {
      log(`  ${String(r.k).padEnd(28)} rows=${r.n.toLocaleString().padStart(10)} instances=${r.inst.toLocaleString().padStart(10)}`);
    }

    log(`\n== AccDcProjectUserService.accessLevel distribution ==`);
    for (const r of await q(`SELECT COALESCE("accessLevel",'(null)') AS a, COUNT(*)::int AS n FROM "AccDcProjectUserService" GROUP BY "accessLevel" ORDER BY n DESC`)) {
      log(`  ${String(r.a).padEnd(28)} ${r.n.toLocaleString().padStart(10)}`);
    }

    log(`\n== AccDcProjectUserProduct.accessLevel distribution ==`);
    for (const r of await q(`SELECT COALESCE("accessLevel",'(null)') AS a, COUNT(*)::int AS n FROM "AccDcProjectUserProduct" GROUP BY "accessLevel" ORDER BY n DESC`)) {
      log(`  ${String(r.a).padEnd(28)} ${r.n.toLocaleString().padStart(10)}`);
    }
  } finally {
    await client.end();
  }
  fs.writeFileSync("scripts/scratch/acc-modules-report.txt", out.join("\n"), "utf8");
  console.log("WROTE scripts/scratch/acc-modules-report.txt");
}
main().catch((e) => { console.error(e); process.exit(1); });
