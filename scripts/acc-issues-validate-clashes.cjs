// scripts/acc-issues-validate-clashes.cjs
// Pass 2: per MC-enabled project, collect clash-generated issueIds and reconcile
// against stored AccIssue. Flags: --project=<id>, --dry-run.
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { reconcileClashes } = require("../lib/acc/reconcileClashes.ts");
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

async function listModelSets(token, containerId) {
  const modelSets = []; let cont = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100", includeDisabled: "true" });
    if (cont) qs.set("continuationToken", cont);
    const url = `${BASE}/bim360/modelset/v3/containers/${containerId}/modelsets?${qs}`;
    const { status, ok, body } = await apiGet(url, token);
    if (status === 403 || status === 404) return [];
    if (!ok) throw new Error(`modelsets ${status}`);
    for (const m of body.modelSets || []) modelSets.push(m.modelSetId || m.id);
    cont = body.page?.continuationToken || null;
  } while (cont);
  return modelSets.filter(Boolean);
}
async function assignedIssueIds(token, containerId, modelSetId) {
  const ids = new Set(); let cont = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100" });
    if (cont) qs.set("continuationToken", cont);
    const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets/${modelSetId}/clashes/assigned?${qs}`;
    const { status, ok, body } = await apiGet(url, token);
    if (!ok) throw new Error(`assigned-clashes ${status}`);
    for (const g of body.groups || []) if (g.issueId) ids.add(g.issueId);
    cont = body.page?.continuationToken || null;
  } while (cont);
  return ids;
}

(async () => {
  const db = prisma();
  let token = await refreshAndPersistFromDb(db, "data:read");
  let tokenAt = Date.now();
  const projectIds = ONLY
    ? [ONLY]
    : (await db.accIssue.findMany({ distinct: ["projectId"], select: { projectId: true } })).map((r) => r.projectId);

  let totV = 0, totFN = 0, totFP = 0, mcProjects = 0;
  for (const pid of projectIds) {
    if (Date.now() - tokenAt > 45 * 60 * 1000) {
      token = await refreshAndPersistFromDb(db, "data:read");
      tokenAt = Date.now();
    }
    try {
      const sets = await listModelSets(token, pid);
      if (!sets.length) continue; // not MC-enabled
      mcProjects++;
      const clashIds = new Set();
      for (const s of sets) for (const id of await assignedIssueIds(token, pid, s)) clashIds.add(id);
      const stored = await db.accIssue.findMany({ where: { projectId: pid }, select: { id: true, isCoordination: true } });
      const r = reconcileClashes(stored, clashIds);
      totV += r.validatedIds.length; totFN += r.falseNegIds.length; totFP += r.falsePosIds.length;
      console.log(`  ${pid}: clash=${clashIds.size} validated=${r.validatedIds.length} falseNeg=${r.falseNegIds.length} falsePos=${r.falsePosIds.length} missing=${r.missingIds.length}`);
      if (DRY) continue;
      await db.accIssue.updateMany({ where: { projectId: pid }, data: { projectMcEnabled: true } });
      if (r.validatedIds.length)
        await db.accIssue.updateMany({ where: { id: { in: r.validatedIds } }, data: { clashValidated: true } });
      if (r.falseNegIds.length)
        await db.accIssue.updateMany({ where: { id: { in: r.falseNegIds } }, data: { isCoordination: true, coordinationSource: "clash-endpoint" } });
    } catch (e) {
      console.error(`  ${pid} ERROR ${e.message} (skipped)`);
      continue;
    }
  }
  console.log(`\n${DRY ? "[DRY] " : ""}MC projects=${mcProjects}  validated=${totV}  falseNeg=${totFN}  falsePos=${totFP}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
