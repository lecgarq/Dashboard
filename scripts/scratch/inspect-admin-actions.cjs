#!/usr/bin/env node
/** inspect-admin-actions.cjs — READ-ONLY. Inspect admin-source activity rows to see if
 *  they can be attributed precisely to a (user, project) node. Output -> stdout file. */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (sql) => client.query(sql).then((r) => r.rows);
  const out = [];
  const log = (s = "") => out.push(s);

  try {
    // column shape for admin rows
    log(`== admin rows: projectId / userEmail presence ==`);
    for (const r of await q(`
      SELECT "rawAction" AS a,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE "projectId" IS NOT NULL AND "projectId" <> '')::int AS has_proj,
             COUNT(*) FILTER (WHERE "userEmail" IS NOT NULL)::int AS has_email,
             COUNT(*) FILTER (WHERE details IS NOT NULL)::int AS has_details
      FROM "AccActivity" WHERE "sourceFile"='admin' GROUP BY "rawAction" ORDER BY n DESC`)) {
      log(`  ${String(r.a).padEnd(20)} n=${r.n}  hasProject=${r.has_proj}  hasEmail=${r.has_email}  hasDetails=${r.has_details}`);
    }

    log(`\n== sample admin rows (rawAction, userEmail, projectId, service, tool) ==`);
    for (const r of await q(`
      SELECT "rawAction" AS a, "userEmail" AS e, "projectId" AS p, service AS s, tool AS t
      FROM "AccActivity" WHERE "sourceFile"='admin' ORDER BY random() LIMIT 12`)) {
      log(`  ${String(r.a).padEnd(18)} email=${String(r.e).padEnd(34)} proj='${r.p}' svc=${r.s} tool=${r.t}`);
    }

    log(`\n== sample admin DETAILS payloads ==`);
    for (const r of await q(`
      SELECT "rawAction" AS a, LEFT(COALESCE(details,'(null)'), 400) AS d
      FROM "AccActivity" WHERE "sourceFile"='admin' AND details IS NOT NULL ORDER BY random() LIMIT 10`)) {
      log(`  [${r.a}] ${r.d}`);
    }

    // Do admin actor emails / target projects line up with real instances?
    log(`\n== admin actor emails that ARE real users (AccDcProjectUser join) ==`);
    const r0 = await q(`
      SELECT COUNT(DISTINCT lower(a."userEmail"))::int AS actors,
             COUNT(DISTINCT lower(u.email))::int AS actors_that_are_users
      FROM "AccActivity" a
      LEFT JOIN "AccDcUser" u ON lower(u.email)=lower(a."userEmail")
      WHERE a."sourceFile"='admin' AND a."userEmail" IS NOT NULL`);
    log(`  ${JSON.stringify(r0[0])}`);
  } finally {
    await client.end();
  }
  fs.writeFileSync("scripts/scratch/admin-actions-report.txt", out.join("\n"), "utf8");
  console.log("WROTE scripts/scratch/admin-actions-report.txt");
}
main().catch((e) => { console.error(e); process.exit(1); });
