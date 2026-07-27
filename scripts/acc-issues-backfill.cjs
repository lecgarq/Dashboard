// scripts/acc-issues-backfill.cjs
// Pass 1: fetch all undeleted and deleted issues per project, classify coordination, upsert AccIssue.
// Flags: --project=<id> (single project), --dry-run (no DB writes).
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { classifyCoordination } = require("../lib/acc/coordinationClassifier.ts");
const {
  buildIssueProjectFetchResult,
  summarizeIssueProjectFetchResults,
} = require("../lib/acc/issueBackfillAudit.ts");
const {
  ISSUE_DELETED_FILTER_PASSES,
  buildIssueListUrl,
} = require("../lib/acc/issueListQuery.ts");
const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");

const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;
// NOTE: do NOT use the ACC Issues `fields=` query param. It corrupts the `deleted`
// boolean (returns true for every issue) and truncates the payload to the requested
// subset. Omitting it returns the full ~40-field object with a correct `deleted` and
// a complete rawJson for the "full dataset" goal. (description is returned natively.)

function prisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureProjectFetchResultTable(db) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AccIssueProjectFetchResult" (
      "id" TEXT NOT NULL,
      "runId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "projectName" TEXT,
      "status" TEXT NOT NULL,
      "issueCount" INTEGER NOT NULL DEFAULT 0,
      "coordinationCount" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "startedAt" TIMESTAMP(3) NOT NULL,
      "finishedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AccIssueProjectFetchResult_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AccIssueProjectFetchResult_runId_projectId_key"
      ON "AccIssueProjectFetchResult"("runId", "projectId")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AccIssueProjectFetchResult_runId_idx"
      ON "AccIssueProjectFetchResult"("runId")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AccIssueProjectFetchResult_projectId_idx"
      ON "AccIssueProjectFetchResult"("projectId")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AccIssueProjectFetchResult_status_idx"
      ON "AccIssueProjectFetchResult"("status")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AccIssueProjectFetchResult_runId_status_idx"
      ON "AccIssueProjectFetchResult"("runId", "status")
  `);
}

async function recordProjectFetchResult(db, result) {
  await db.$executeRaw`
    INSERT INTO "AccIssueProjectFetchResult" (
      "id",
      "runId",
      "projectId",
      "projectName",
      "status",
      "issueCount",
      "coordinationCount",
      "errorMessage",
      "startedAt",
      "finishedAt",
      "updatedAt"
    )
    VALUES (
      ${`${result.runId}:${result.projectId}`},
      ${result.runId},
      ${result.projectId},
      ${result.projectName},
      ${result.status},
      ${result.issueCount},
      ${result.coordinationCount},
      ${result.errorMessage},
      ${result.startedAt},
      ${result.finishedAt},
      ${new Date()}
    )
    ON CONFLICT ("runId", "projectId") DO UPDATE SET
      "projectName" = EXCLUDED."projectName",
      "status" = EXCLUDED."status",
      "issueCount" = EXCLUDED."issueCount",
      "coordinationCount" = EXCLUDED."coordinationCount",
      "errorMessage" = EXCLUDED."errorMessage",
      "startedAt" = EXCLUDED."startedAt",
      "finishedAt" = EXCLUDED."finishedAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

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

async function listIssuesForDeletedFilter(token, projectId, deleted) {
  const out = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const url = buildIssueListUrl({ baseUrl: BASE, projectId, limit, offset, deleted });
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

async function listIssues(token, projectId) {
  const byId = new Map();
  for (const deleted of ISSUE_DELETED_FILTER_PASSES) {
    const r = await listIssuesForDeletedFilter(token, projectId, deleted);
    if (r.forbidden) return { forbidden: true, issues: [] };
    for (const it of r.issues) byId.set(it.id, it);
  }
  return { forbidden: false, issues: [...byId.values()] };
}

let db; let run = { id: "dry-run" };

(async () => {
  db = prisma();
  let token = await refreshAndPersistFromDb(db, "data:read");
  let tokenAt = Date.now();
  const projects = ONLY
    ? [{ id: ONLY, name: ONLY }]
    : await db.accProject.findMany({ select: { id: true, name: true } });

  run = DRY ? { id: "dry-run" } : await db.accIssueFetchRun.create({ data: {} });
  if (!DRY) await ensureProjectFetchResultTable(db);
  const projectResults = [];
  let ok = 0, zeroIssues = 0, forbidden = 0, errors = 0, upserted = 0, coordination = 0;

  for (const p of projects) {
    const projectStartedAt = new Date();
    if (Date.now() - tokenAt > 45 * 60 * 1000) {
      token = await refreshAndPersistFromDb(db, "data:read");
      tokenAt = Date.now();
    }
    let r;
    try {
      r = await listIssues(token, p.id);
    } catch (e) {
      errors++;
      const result = buildIssueProjectFetchResult({
        runId: run.id,
        projectId: p.id,
        projectName: p.name ?? null,
        errorMessage: e.message,
        startedAt: projectStartedAt,
        finishedAt: new Date(),
      });
      projectResults.push(result);
      if (!DRY) await recordProjectFetchResult(db, result);
      console.error(`  ${p.id} ERROR ${e.message}`);
      continue;
    }
    if (r.forbidden) {
      forbidden++;
      const result = buildIssueProjectFetchResult({
        runId: run.id,
        projectId: p.id,
        projectName: p.name ?? null,
        forbidden: true,
        startedAt: projectStartedAt,
        finishedAt: new Date(),
      });
      projectResults.push(result);
      if (!DRY) await recordProjectFetchResult(db, result);
      console.log(`  ${p.id} 403 (skipped)`);
      continue;
    }
    if (r.issues.length === 0) {
      zeroIssues++;
    } else {
      ok++;
    }
    let projectCoordination = 0;
    for (const it of r.issues) {
      const v = classifyCoordination({ title: it.title, description: it.description });
      if (v.isCoordination) {
        coordination++;
        projectCoordination++;
      }
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
    const result = buildIssueProjectFetchResult({
      runId: run.id,
      projectId: p.id,
      projectName: p.name ?? null,
      issueCount: r.issues.length,
      coordinationCount: projectCoordination,
      startedAt: projectStartedAt,
      finishedAt: new Date(),
    });
    projectResults.push(result);
    if (!DRY) await recordProjectFetchResult(db, result);
    console.log(`  ${p.name?.slice(0, 30) || p.id}: ${r.issues.length} issues (${result.status})`);
  }

  const summary = summarizeIssueProjectFetchResults(projectResults);
  if (!DRY) {
    await db.accIssueFetchRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), projectsTotal: projects.length, projectsOk: summary.fetchedOk,
        projectsForbidden: forbidden, issuesUpserted: upserted, coordinationCount: coordination, status: "done" },
    });
  }
  console.log(
    `\n${DRY ? "[DRY] " : ""}` +
    `projects ok=${ok} zero=${zeroIssues} forbidden=${forbidden} error=${errors} ` +
    `fetchedOk=${summary.fetchedOk}/${summary.total} ` +
    `issues upserted=${upserted} coordination=${coordination}`
  );
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    if (db && run?.id && run.id !== "dry-run") {
      await db.accIssueFetchRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } });
    }
  } catch {}
  try { if (db) await db.$disconnect(); } catch {}
  process.exit(1);
});
