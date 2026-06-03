#!/usr/bin/env node
/**
 * Read-only diagnostic for MTY all-time extraction access.
 *
 * Compares an ordered MTY project ID list against:
 * - Autodesk Construction Admin live user/project access for Luis
 * - local AccProject and AccProjectMember state
 * - Data Connector project-user product/service snapshots
 *
 * Writes safe follow-up ID lists to C:\tmp by default. Does not call Data
 * Connector and does not mutate Autodesk/project access.
 */
require("tsx/cjs");

const fs = require("node:fs");
const path = require("node:path");

const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";
const USERINFO = "https://api.userprofile.autodesk.com/userinfo";

const USER_EMAIL = (process.env.DC_USER_EMAIL || process.env.DC_GRANT_EMAIL || "luis.cortes@hermosillo.com").toLowerCase();
const IDS_FILE = process.env.DC_IDS_FILE || "C:\\tmp\\mty-alltime-ids-2026-05-30.txt";
const OUT_DIR = process.env.DC_ACCESS_OUT_DIR || "C:\\tmp";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[mty-access ${ts()}]`, ...args); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ["error"],
  });
}

function loadIds(file) {
  const ids = fs.readFileSync(file, "utf8").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
}

async function get2LegToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "account:read data:read",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!json.access_token) throw new Error(`2-leg token failed (${res.status}): ${raw}`);
  return json.access_token;
}

async function resolveAutodeskUserId(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { providerAccountId: true, access_token: true },
  });
  if (acct?.providerAccountId) return acct.providerAccountId;
  if (acct?.access_token) {
    const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${acct.access_token}` } });
    const raw = await res.text();
    let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
    if (json.sub) return json.sub;
  }
  const member = await prisma.accProjectMember.findFirst({
    where: { email: { equals: USER_EMAIL, mode: "insensitive" } },
    select: { autodeskId: true },
  });
  if (member?.autodeskId) return member.autodeskId;
  throw new Error(`Could not resolve Autodesk user id for ${USER_EMAIL}`);
}

async function listLiveUserProjects(accountId, userId, token) {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${ADMIN_V1}/accounts/${accountId}/users/${userId}/projects?limit=200&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const raw = await res.text();
    let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
    if (!res.ok || !Array.isArray(json.results)) {
      throw new Error(`Admin user-projects failed (${res.status}): ${raw.slice(0, 500)}`);
    }
    all.push(...json.results);
    const total = json.pagination?.totalResults ?? 0;
    const limit = json.pagination?.limit ?? 200;
    offset += limit;
    if (offset >= total || json.results.length === 0) break;
  }
  return all;
}

function indexBy(items, keyFn) {
  const m = new Map();
  for (const item of items) m.set(keyFn(item), item);
  return m;
}

function hasProjectAdminProduct(rows) {
  return rows.some((row) => String(row.accessLevel || "").toLowerCase() === "project_admin");
}

async function main() {
  const prisma = createPrisma();
  try {
    const ids = loadIds(IDS_FILE);
    const accountId = await resolveAccountId(prisma);
    const autodeskUserId = await resolveAutodeskUserId(prisma);
    log(`ids=${ids.length} account=${accountId} user=${USER_EMAIL} autodeskId=${autodeskUserId}`);

    const token = await get2LegToken();
    const liveUserProjects = await listLiveUserProjects(accountId, autodeskUserId, token);
    const liveById = indexBy(liveUserProjects, (p) => p.id);

    const [projects, members, dcUsers] = await Promise.all([
      prisma.accProject.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, status: true, folderCrawlStatus: true, createdAt: true },
      }),
      prisma.accProjectMember.findMany({
        where: { projectId: { in: ids }, OR: [{ email: { equals: USER_EMAIL, mode: "insensitive" } }, { autodeskId: autodeskUserId }] },
        select: { projectId: true, email: true, status: true, projectAdmin: true, products: true },
      }),
      prisma.accDcUser.findMany({
        where: { OR: [{ email: { equals: USER_EMAIL, mode: "insensitive" } }, { autodeskId: autodeskUserId }, { id: autodeskUserId }] },
        select: { id: true, email: true, autodeskId: true },
      }),
    ]);
    const projectById = indexBy(projects, (p) => p.id);
    const memberByProject = indexBy(members, (m) => m.projectId);
    const dcUserIds = [...new Set(dcUsers.flatMap((u) => [u.id, u.autodeskId]).filter(Boolean))];
    const [dcProducts, dcServices, activityCounts] = await Promise.all([
      dcUserIds.length === 0 ? [] : prisma.accDcProjectUserProduct.findMany({
        where: { projectId: { in: ids }, userId: { in: dcUserIds } },
        select: { projectId: true, userId: true, productKey: true, accessLevel: true },
      }),
      dcUserIds.length === 0 ? [] : prisma.accDcProjectUserService.findMany({
        where: { projectId: { in: ids }, userId: { in: dcUserIds } },
        select: { projectId: true, userId: true, serviceKey: true, accessLevel: true },
      }),
      prisma.accActivity.groupBy({
        by: ["projectId"],
        where: { projectId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const dcProductsByProject = new Map();
    for (const row of dcProducts) {
      if (!dcProductsByProject.has(row.projectId)) dcProductsByProject.set(row.projectId, []);
      dcProductsByProject.get(row.projectId).push(row);
    }
    const dcServicesByProject = new Map();
    for (const row of dcServices) {
      if (!dcServicesByProject.has(row.projectId)) dcServicesByProject.set(row.projectId, []);
      dcServicesByProject.get(row.projectId).push(row);
    }
    const activityByProject = new Map(activityCounts.map((r) => [r.projectId, r._count._all]));

    const rows = ids.map((id, idx) => {
      const live = liveById.get(id);
      const project = projectById.get(id);
      const member = memberByProject.get(id);
      const products = dcProductsByProject.get(id) || [];
      const services = dcServicesByProject.get(id) || [];
      const liveProjectAdmin = live?.accessLevels?.projectAdmin === true;
      const localDcProjectAdmin =
        hasProjectAdminProduct(products) ||
        services.some((row) => /project/i.test(String(row.serviceKey || "")) && String(row.accessLevel || "").toLowerCase() === "admin");
      return {
        idx: idx + 1,
        id,
        name: (project?.name || live?.name || "(unknown)").trim(),
        projectStatus: project?.status || live?.status || null,
        folderCrawlStatus: project?.folderCrawlStatus || null,
        liveMember: Boolean(live),
        liveProjectAdmin,
        localMember: Boolean(member),
        localProjectAdmin: member?.projectAdmin === true,
        localDcProjectAdmin,
        activityRows: activityByProject.get(id) || 0,
        accessLevels: live?.accessLevels || null,
      };
    });

    const authorized = rows.filter((r) => r.liveProjectAdmin);
    const needsProjectAdmin = rows.filter((r) => !r.liveProjectAdmin);
    const notEvenMember = rows.filter((r) => !r.liveMember);
    const localMismatch = rows.filter((r) => r.liveProjectAdmin !== r.localProjectAdmin);
    const inaccessibleLocal = rows.filter((r) => r.folderCrawlStatus === "inaccessible");

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const needsFile = path.join(OUT_DIR, `mty-alltime-needs-project-admin-${date}.txt`);
    const authorizedFile = path.join(OUT_DIR, `mty-alltime-authorized-${date}.txt`);
    const reportFile = path.join(OUT_DIR, `mty-alltime-access-report-${date}.json`);
    fs.writeFileSync(needsFile, needsProjectAdmin.map((r) => r.id).join("\n") + (needsProjectAdmin.length ? "\n" : ""), "utf8");
    fs.writeFileSync(authorizedFile, authorized.map((r) => r.id).join("\n") + (authorized.length ? "\n" : ""), "utf8");
    fs.writeFileSync(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), idsFile: IDS_FILE, user: USER_EMAIL, accountId, autodeskUserId, summary: {
      total: rows.length,
      liveUserProjects: liveUserProjects.length,
      authorized: authorized.length,
      needsProjectAdmin: needsProjectAdmin.length,
      notEvenMember: notEvenMember.length,
      localMismatch: localMismatch.length,
      inaccessibleLocal: inaccessibleLocal.length,
    }, rows }, null, 2), "utf8");

    const byBatch = [];
    for (let start = 0; start < rows.length; start += 50) {
      const batch = rows.slice(start, start + 50);
      byBatch.push({
        batch: Math.floor(start / 50) + 1,
        projects: batch.length,
        authorized: batch.filter((r) => r.liveProjectAdmin).length,
        needsProjectAdmin: batch.filter((r) => !r.liveProjectAdmin).length,
      });
    }

    log("=== SUMMARY ===");
    console.log(JSON.stringify({
      total: rows.length,
      liveUserProjects: liveUserProjects.length,
      authorized: authorized.length,
      needsProjectAdmin: needsProjectAdmin.length,
      notEvenMember: notEvenMember.length,
      localMismatch: localMismatch.length,
      inaccessibleLocal: inaccessibleLocal.length,
      byBatch,
      output: { needsFile, authorizedFile, reportFile },
      firstNeedsProjectAdmin: needsProjectAdmin.slice(0, 20).map((r) => ({
        idx: r.idx,
        id: r.id,
        name: r.name,
        liveMember: r.liveMember,
        folderCrawlStatus: r.folderCrawlStatus,
        localProjectAdmin: r.localProjectAdmin,
        localDcProjectAdmin: r.localDcProjectAdmin,
        activityRows: r.activityRows,
      })),
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Fatal:", err?.message || err);
  process.exit(1);
});
