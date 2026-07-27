#!/usr/bin/env node
/**
 * Grant Model Coordination access to one ACC user on a project list.
 *
 * Defaults to the latest issue-backfill projects with status=forbidden.
 *
 * Env:
 *   ACC_GRANT_EMAIL                         default luis.cortes@hermosillo.com
 *   ACC_GRANT_MODEL_COORDINATION_ACCESS     member | administrator | none (default member)
 *   ACC_GRANT_MODEL_COORDINATION_IDS_FILE   optional newline/comma-separated project IDs
 *   ACC_GRANT_DRY_RUN=1                     fetch current state, write nothing
 *   ACC_GRANT_DELAY_MS                      default 500
 *   ACC_GRANT_OUT_DIR                       default C:\tmp
 */
require("tsx/cjs");

const fs = require("node:fs");
const path = require("node:path");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const {
  mergeModelCoordinationProduct,
  normalizeModelCoordinationAccess,
  summarizeGrantResults,
} = require("../lib/acc/modelCoordinationGrant.ts");

const TOK = "https://developer.api.autodesk.com/authentication/v2/token";
const ADM = "https://developer.api.autodesk.com/construction/admin";
const USERINFO = "https://api.userprofile.autodesk.com/userinfo";

const EMAIL = (process.env.ACC_GRANT_EMAIL || process.env.DC_GRANT_EMAIL || "luis.cortes@hermosillo.com").toLowerCase();
const IDS_FILE = process.env.ACC_GRANT_MODEL_COORDINATION_IDS_FILE || process.env.DC_GRANT_IDS_FILE || "";
const ACCESS = normalizeModelCoordinationAccess(process.env.ACC_GRANT_MODEL_COORDINATION_ACCESS);
const DRY = process.env.ACC_GRANT_DRY_RUN === "1" || process.env.DC_GRANT_DRY_RUN === "1";
const DELAY = Number.parseInt(process.env.ACC_GRANT_DELAY_MS || "500", 10);
const OUT_DIR = process.env.ACC_GRANT_OUT_DIR || path.join(process.cwd(), ".tmp");

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[grant-mc ${ts()}]`, ...args); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function prisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

function loadIds(file) {
  return [...new Set(fs.readFileSync(file, "utf8").split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
}

async function resolveAccountId(db) {
  const hub = process.env.APS_HUB_ID || (await db.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
}

async function twoLeg() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "account:read account:write data:read",
  });
  const res = await fetch(TOK, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!json.access_token) throw new Error(`no 2-legged token (${res.status}): ${raw.slice(0, 500)}`);
  return json.access_token;
}

async function call(method, url, token, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = raw; }
  return { status: res.status, ok: res.ok, json, raw };
}

async function resolveAutodeskUserId(db) {
  const account = await db.account.findFirst({
    where: { provider: "autodesk", user: { email: EMAIL } },
    select: { providerAccountId: true, access_token: true },
  });
  if (account?.providerAccountId) return account.providerAccountId;
  if (account?.access_token) {
    const userInfo = await call("GET", USERINFO, account.access_token);
    if (userInfo.json?.sub) return userInfo.json.sub;
  }
  const member = await db.accProjectMember.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
    select: { autodeskId: true },
  });
  if (member?.autodeskId) return member.autodeskId;
  throw new Error(`Could not resolve Autodesk ID for ${EMAIL}`);
}

async function latestForbiddenProjects(db) {
  const latest = await db.$queryRaw`
    SELECT "id"
    FROM "AccIssueFetchRun"
    ORDER BY "startedAt" DESC
    LIMIT 1
  `;
  const runId = latest[0]?.id;
  if (!runId) throw new Error("No AccIssueFetchRun rows found");

  const rows = await db.$queryRaw`
    SELECT r."projectId" AS "id", COALESCE(r."projectName", p."name") AS "name"
    FROM "AccIssueProjectFetchResult" r
    LEFT JOIN "AccProject" p ON p."id" = r."projectId"
    WHERE r."runId" = ${runId}
      AND r."status" = 'forbidden'
    ORDER BY COALESCE(r."projectName", p."name"), r."projectId"
  `;
  return { runId, projects: rows };
}

async function projectsFromIds(db, ids) {
  const projects = await db.accProject.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const byId = new Map(projects.map((project) => [project.id, project.name]));
  return ids.map((id) => ({ id, name: byId.get(id) || id }));
}

function productAccess(products, key) {
  const product = Array.isArray(products) ? products.find((item) => item?.key === key) : null;
  return typeof product?.access === "string" ? product.access : "none";
}

function accessRank(access) {
  if (access === "administrator") return 2;
  if (access === "member") return 1;
  return 0;
}

async function findProjectUser(projectId, token) {
  const url = `${ADM}/v1/projects/${projectId}/users?filter[email]=${encodeURIComponent(EMAIL)}&limit=20`;
  const response = await call("GET", url, token);
  if (!response.ok) throw new Error(`find-user ${response.status}: ${JSON.stringify(response.json).slice(0, 300)}`);
  const results = Array.isArray(response.json?.results) ? response.json.results : [];
  return results.find((user) => String(user.email || "").toLowerCase() === EMAIL) || null;
}

async function patchProjectUser(projectId, user, token, autodeskId) {
  const userId = user.id || user.autodeskId || autodeskId;
  const products = mergeModelCoordinationProduct(user.products, ACCESS);
  return call(
    "PATCH",
    `${ADM}/v1/projects/${projectId}/users/${encodeURIComponent(userId)}`,
    token,
    { products },
    { "User-Id": autodeskId },
  );
}

async function postProjectUser(projectId, token, autodeskId) {
  const body = {
    email: EMAIL,
    products: [{ key: "modelCoordination", access: ACCESS }],
    suppressAdministrativeEmails: true,
  };
  return call("POST", `${ADM}/v1/projects/${projectId}/users`, token, body, { "User-Id": autodeskId });
}

async function main() {
  const db = prisma();
  try {
    const accountId = await resolveAccountId(db);
    const autodeskId = await resolveAutodeskUserId(db);
    const token = await twoLeg();
    const source = IDS_FILE ? { runId: null, projects: await projectsFromIds(db, loadIds(IDS_FILE)) } : await latestForbiddenProjects(db);

    log(`account=${accountId} user=${EMAIL} autodeskId=${autodeskId} projects=${source.projects.length} access=${ACCESS} dryRun=${DRY}`);
    if (source.runId) log(`source=latest AccIssueFetchRun ${source.runId} forbidden projects`);
    if (source.projects.length === 0) {
      log("No projects to update.");
      return;
    }

    const results = [];
    for (let i = 0; i < source.projects.length; i++) {
      const project = source.projects[i];
      const label = `"${String(project.name || project.id).trim()}"`;
      try {
        const existing = await findProjectUser(project.id, token);
        if (existing) {
          const current = productAccess(existing.products, "modelCoordination");
          if (accessRank(current) >= accessRank(ACCESS)) {
            results.push({ projectId: project.id, projectName: project.name, status: "already", current });
            log(`= [${i + 1}/${source.projects.length}] already ${current} ${label}`);
          } else if (DRY) {
            const products = mergeModelCoordinationProduct(existing.products, ACCESS);
            results.push({ projectId: project.id, projectName: project.name, status: "skipped", current, planned: ACCESS, products });
            log(`DRY [${i + 1}/${source.projects.length}] patch ${current}->${ACCESS} ${label}`);
          } else {
            const patched = await patchProjectUser(project.id, existing, token, autodeskId);
            if (patched.ok) {
              results.push({ projectId: project.id, projectName: project.name, status: "updated", current, planned: ACCESS });
              log(`✓ [${i + 1}/${source.projects.length}] updated ${current}->${ACCESS} ${label}`);
            } else {
              results.push({ projectId: project.id, projectName: project.name, status: "failed", step: "patch", current, httpStatus: patched.status, error: patched.json });
              log(`✗ [${i + 1}/${source.projects.length}] PATCH ${patched.status} ${label} :: ${JSON.stringify(patched.json).slice(0, 180)}`);
            }
          }
        } else if (DRY) {
          results.push({ projectId: project.id, projectName: project.name, status: "skipped", current: "not-member", planned: ACCESS });
          log(`DRY [${i + 1}/${source.projects.length}] add ${ACCESS} ${label}`);
        } else {
          const posted = await postProjectUser(project.id, token, autodeskId);
          if (posted.status === 201 || posted.ok) {
            results.push({ projectId: project.id, projectName: project.name, status: "added", planned: ACCESS });
            log(`✓ [${i + 1}/${source.projects.length}] added ${ACCESS} ${label}`);
          } else {
            results.push({ projectId: project.id, projectName: project.name, status: "failed", step: "post", current: "not-member", httpStatus: posted.status, error: posted.json });
            log(`✗ [${i + 1}/${source.projects.length}] POST ${posted.status} ${label} :: ${JSON.stringify(posted.json).slice(0, 180)}`);
          }
        }
      } catch (error) {
        results.push({ projectId: project.id, projectName: project.name, status: "failed", step: "read", error: error?.message || String(error) });
        log(`✗ [${i + 1}/${source.projects.length}] READ ${label} :: ${error?.message || error}`);
      }
      await sleep(DELAY);
    }

    let outFile = path.join(OUT_DIR, `acc-model-coordination-grant-${new Date().toISOString().slice(0, 10)}.json`);
    const report = JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceRunId: source.runId,
      email: EMAIL,
      access: ACCESS,
      dryRun: DRY,
      summary: summarizeGrantResults(results),
      results,
    }, null, 2);
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(outFile, report, "utf8");
    } catch (error) {
      log(`WARN report write failed: ${error?.message || error}`);
      outFile = null;
    }

    log("=== SUMMARY ===");
    console.log(JSON.stringify({ summary: summarizeGrantResults(results), report: outFile }, null, 2));
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Fatal:", error?.message || error);
  process.exit(1);
});
