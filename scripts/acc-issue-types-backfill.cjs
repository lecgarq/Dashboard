// scripts/acc-issue-types-backfill.cjs
// One-time (re-runnable) backfill: crawl APS issue-types metadata per project,
// upsert into AccIssueType (global GUID->name dedupe, last-crawled name wins).
// Purely additive — never touches AccIssue or any existing issue query.
// Flags: --project=<id> (single project), --dry-run (no DB writes, logs raw response).
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");

const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;

function prisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(url, token, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
  }
  return { status: 429, ok: false, body: "retries exhausted" };
}

function buildIssueTypesUrl({ baseUrl, projectId, limit, offset }) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), include: "subtypes" });
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/construction/issues/v1/projects/${encodeURIComponent(projectId)}/issue-types?${params}`;
}

async function listIssueTypes(token, projectId) {
  const out = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const url = buildIssueTypesUrl({ baseUrl: BASE, projectId, limit, offset });
    const { status, ok, body } = await apiGet(url, token);
    if (status === 401) throw new Error(`issue-types 401 (scope problem): ${JSON.stringify(body).slice(0, 200)}`);
    if (status === 403) return { forbidden: true, types: [] };
    if (!ok) throw new Error(`issue-types ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    for (const it of body.results || []) out.push(it);
    const total = body.pagination?.totalResults ?? out.length;
    offset += limit;
    if (offset >= total || !(body.results || []).length) break;
  }
  return { forbidden: false, types: out };
}

(async () => {
  const db = prisma();
  let token = await refreshAndPersistFromDb(db, "data:read");
  let tokenAt = Date.now();
  const projects = ONLY
    ? [{ id: ONLY, name: ONLY }]
    : await db.accProject.findMany({ select: { id: true, name: true } });

  let ok = 0, zeroTypes = 0, forbidden = 0, errors = 0, typesUpserted = 0, subtypesUpserted = 0;

  for (const p of projects) {
    if (Date.now() - tokenAt > 45 * 60 * 1000) {
      token = await refreshAndPersistFromDb(db, "data:read");
      tokenAt = Date.now();
    }
    let r;
    try {
      r = await listIssueTypes(token, p.id);
    } catch (e) {
      errors++;
      console.error(`  ${p.id} ERROR ${e.message}`);
      continue;
    }
    if (r.forbidden) {
      forbidden++;
      console.log(`  ${p.id} 403 (skipped)`);
      continue;
    }
    if (r.types.length === 0) {
      zeroTypes++;
    } else {
      ok++;
    }
    if (DRY) {
      if (r.types.length > 0) console.log(JSON.stringify(r.types[0], null, 2));
      console.log(`  ${p.name?.slice(0, 30) || p.id}: ${r.types.length} types (dry-run, no writes)`);
      continue;
    }
    for (const type of r.types) {
      await db.accIssueType.upsert({
        where: { id: type.id },
        create: { id: type.id, name: type.title ?? "", kind: "type", parentTypeId: null },
        update: { name: type.title ?? "", kind: "type", parentTypeId: null },
      });
      typesUpserted++;
      for (const sub of type.subtypes ?? []) {
        await db.accIssueType.upsert({
          where: { id: sub.id },
          create: { id: sub.id, name: sub.title ?? "", kind: "subtype", parentTypeId: type.id },
          update: { name: sub.title ?? "", kind: "subtype", parentTypeId: type.id },
        });
        subtypesUpserted++;
      }
    }
    console.log(`  ${p.name?.slice(0, 30) || p.id}: ${r.types.length} types`);
  }

  console.log(
    `\n${DRY ? "[DRY] " : ""}` +
    `projects ok=${ok} zero=${zeroTypes} forbidden=${forbidden} error=${errors} ` +
    `types upserted=${typesUpserted} subtypes upserted=${subtypesUpserted}`
  );
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
