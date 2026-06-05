// scripts/acc-issues-backfill.cjs
// Pass 1: fetch all issues per project, classify coordination, upsert AccIssue.
// Flags: --project=<id> (single project), --dry-run (no DB writes).
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { classifyCoordination } = require("../lib/acc/coordinationClassifier.ts");
const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");

const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;
const FIELDS = "id,displayId,title,description,status,issueTypeId,issueSubtypeId,createdBy,createdAt,deleted";

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

async function listIssues(token, projectId) {
  const out = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const url = `${BASE}/construction/issues/v1/projects/${projectId}/issues?limit=${limit}&offset=${offset}&fields=${FIELDS}`;
    const { status, ok, body } = await apiGet(url, token);
    if (status === 403) return { forbidden: true, issues: [] };
    if (!ok) throw new Error(`issues-list ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    for (const it of body.results || []) out.push(it);
    const total = body.pagination?.totalResults ?? out.length;
    offset += limit;
    if (offset >= total || !(body.results || []).length) break;
  }
  return { forbidden: false, issues: out };
}

(async () => {
  const db = prisma();
  const token = await refreshAndPersistFromDb(db, "data:read");
  const projects = ONLY
    ? [{ id: ONLY, name: ONLY }]
    : await db.accProject.findMany({ select: { id: true, name: true } });

  const run = DRY ? { id: "dry-run" } : await db.accIssueFetchRun.create({ data: {} });
  let ok = 0, forbidden = 0, upserted = 0, coordination = 0;

  for (const p of projects) {
    let r;
    try { r = await listIssues(token, p.id); }
    catch (e) { console.error(`  ${p.id} ERROR ${e.message}`); continue; }
    if (r.forbidden) { forbidden++; console.log(`  ${p.id} 403 (skipped)`); continue; }
    ok++;
    for (const it of r.issues) {
      const v = classifyCoordination({ title: it.title, description: it.description });
      if (v.isCoordination) coordination++;
      if (DRY) continue;
      await db.accIssue.upsert({
        where: { id: it.id },
        create: {
          id: it.id, projectId: p.id, displayId: it.displayId ?? null, title: it.title ?? "",
          description: it.description ?? null, status: it.status ?? null,
          issueTypeId: it.issueTypeId ?? null, issueSubtypeId: it.issueSubtypeId ?? null,
          createdBy: it.createdBy ?? null, createdAt: it.createdAt ? new Date(it.createdAt) : null,
          deleted: !!it.deleted, isCoordination: v.isCoordination, coordinationSource: v.source,
          confidence: v.confidence, clashId: v.clashId, rawJson: it, fetchRunId: run.id,
        },
        update: {
          title: it.title ?? "", description: it.description ?? null, status: it.status ?? null,
          deleted: !!it.deleted, isCoordination: v.isCoordination, coordinationSource: v.source,
          confidence: v.confidence, clashId: v.clashId, rawJson: it, fetchRunId: run.id, fetchedAt: new Date(),
        },
      });
      upserted++;
    }
    console.log(`  ${p.name?.slice(0, 30) || p.id}: ${r.issues.length} issues`);
  }

  if (!DRY) {
    await db.accIssueFetchRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), projectsTotal: projects.length, projectsOk: ok,
        projectsForbidden: forbidden, issuesUpserted: upserted, coordinationCount: coordination, status: "done" },
    });
  }
  console.log(`\n${DRY ? "[DRY] " : ""}projects ok=${ok} forbidden=${forbidden}  issues upserted=${upserted}  coordination=${coordination}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
