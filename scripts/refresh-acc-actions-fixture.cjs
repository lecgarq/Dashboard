// scripts/refresh-acc-actions-fixture.cjs
/**
 * READ-ONLY. Snapshots the distinct AccActivity rawActions (project + admin) with a
 * canonical service, into __fixtures__/acc-db-actions.json for the pure coverage gate.
 * Re-run after a re-ingest. SELECT only.
 */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

const OUT = "app/(dashboard)/users/access-analysis/__fixtures__/acc-db-actions.json";

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (sql) => client.query(sql).then((r) => r.rows);
  try {
    const project = await q(`
      SELECT "rawAction" AS "rawAction",
             MODE() WITHIN GROUP (ORDER BY service) FILTER (WHERE service IS NOT NULL) AS service
      FROM "AccActivity"
      WHERE "sourceFile"='project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
      GROUP BY "rawAction" ORDER BY "rawAction"`);
    const admin = await q(`
      SELECT "rawAction" AS "rawAction",
             MODE() WITHIN GROUP (ORDER BY service) FILTER (WHERE service IS NOT NULL) AS service
      FROM "AccActivity"
      WHERE "sourceFile"='admin' AND "userEmail" IS NOT NULL
      GROUP BY "rawAction" ORDER BY "rawAction"`);
    const payload = { generatedAt: new Date().toISOString(), project, admin };
    fs.mkdirSync("app/(dashboard)/users/access-analysis/__fixtures__", { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
    console.log(`wrote ${project.length} project + ${admin.length} admin actions to ${OUT}`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
