#!/usr/bin/env node

const path = require("node:path");

require("tsx/cjs");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";

const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";
const START_DATE = process.env.DC_START_DATE || "2026-04-13T00:00:00.000Z";
const END_DATE = process.env.DC_END_DATE || "2026-05-13T23:59:59.999Z";
const CHUNK_SIZE = parsePositiveInt(process.env.DC_CHUNK_SIZE, 50);
const POLL_INTERVAL_MS = parsePositiveInt(process.env.DC_POLL_INTERVAL_MS, 30_000);
const POLL_TIMEOUT_MS = parsePositiveInt(process.env.DC_POLL_TIMEOUT_MS, 60 * 60_000);
const PROJECT_LIMIT = parsePositiveInt(process.env.DC_PROJECT_LIMIT, undefined);
const PROJECT_OFFSET = parsePositiveInt(process.env.DC_PROJECT_OFFSET, 0);

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-custom-3leg ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[dc-custom-3leg ${ts()}]`, ...args); }

function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

async function refreshAccessToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct?.refresh_token) throw new Error(`No Autodesk refresh token for ${USER_EMAIL}`);

  const nowSec = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) {
    return acct.access_token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "openid data:read data:create viewables:read user:read account:read",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await res.text();
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) {
    throw new Error(`Refresh failed (${res.status}): ${raw}`);
  }

  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token || acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      scope: json.scope || null,
    },
  });
  return json.access_token;
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
}

async function activeProjectIds(prisma) {
  const projects = await prisma.accProject.findMany({
    where: { status: "active" },
    select: { id: true },
    orderBy: { name: "asc" },
    skip: PROJECT_OFFSET,
    ...(PROJECT_LIMIT ? { take: PROJECT_LIMIT } : {}),
  });
  return projects.map((p) => p.id);
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function dcFetch(accessToken, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = text; }
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${text}`);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json;
}

async function submitRequest(accountId, accessToken, projectIds) {
  const body = {
    description: `Dashboard custom activity catch-up ${START_DATE} to ${END_DATE}`,
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"],
    dateRange: "CUSTOM",
    startDate: START_DATE,
    endDate: END_DATE,
    projectIdList: projectIds,
  };
  const json = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const requestId = json.id || json.requestId;
  if (!requestId) throw new Error(`POST /requests returned no id: ${JSON.stringify(json).slice(0, 500)}`);
  return requestId;
}

function normalizeJobs(json) {
  return Array.isArray(json)
    ? json
    : Array.isArray(json.jobs)
      ? json.jobs
      : Array.isArray(json.results)
        ? json.results
        : [];
}

function reduceStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const statuses = jobs.map((job) =>
    String(job.completionStatus || job.status || job.state || "").toLowerCase()
  );
  if (statuses.some((status) => /fail|cancel|error/.test(status))) return "failed";
  if (statuses.every((status) => /success|complete/.test(status))) return "success";
  return "running";
}

async function pollJobs(accountId, requestId, accessToken) {
  const json = await dcFetch(
    accessToken,
    `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`
  );
  return normalizeJobs(json);
}

async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = jobs
    .map((job) => ({ jobApsId: job.id || job.jobId || null, url: job.downloadUrl || job.download_url || job.url }))
    .filter((job) => job.url);
  if (urls.length > 0) return urls;

  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;
    const listing = await dcFetch(
      accessToken,
      `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`
    );
    const files = Array.isArray(listing) ? listing : Array.isArray(listing.results) ? listing.results : [];
    const zipFile = files.find((file) => String(file.name || "").endsWith(".zip"));
    if (!zipFile?.name) continue;
    const data = await dcFetch(
      accessToken,
      `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zipFile.name)}`
    );
    const url = data.signedUrl || data.downloadUrl || data.url;
    if (url) urls.push({ jobApsId, url });
  }
  return urls;
}

async function waitForSuccess(accountId, requestId, accessToken) {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const jobs = await pollJobs(accountId, requestId, accessToken);
    const status = reduceStatus(jobs);
    log(`request=${requestId} APS status=${status} jobs=${jobs.length}`);
    if (status === "success") return jobs;
    if (status === "failed") {
      const detail = jobs.map((job) => ({
        id: job.id || job.jobId,
        status: job.status || job.state,
        completionStatus: job.completionStatus,
        error: job.errorMessage || job.error || job.message,
      }));
      throw new Error(`APS job failed: ${JSON.stringify(detail).slice(0, 1000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Polling timed out after ${POLL_TIMEOUT_MS}ms`);
}

async function ingestRequest(prisma, accountId, accessToken, row) {
  const jobs = await waitForSuccess(accountId, row.requestId, accessToken);
  const urls = await resolveDownloadUrls(accountId, jobs, accessToken);
  if (urls.length === 0) throw new Error("APS job succeeded but returned no ZIP URLs");

  await prisma.accDataConnectorJob.update({
    where: { id: row.id },
    data: { status: "running" },
  });

  const { ingestActivityZip } = require(path.resolve(__dirname, "..", "lib", "acc", "ingestActivityZip.ts"));
  const totals = { rowsByFile: {}, unresolved: 0 };
  for (const { url } of urls) {
    const result = await ingestActivityZip(url, prisma, row.id);
    for (const [file, count] of Object.entries(result.rowsByFile)) {
      totals.rowsByFile[file] = (totals.rowsByFile[file] || 0) + count;
    }
    totals.unresolved += result.unresolved;
  }

  await prisma.accDataConnectorJob.update({
    where: { id: row.id },
    data: {
      status: "success",
      completedAt: new Date(),
      errorMessage: null,
      downloadUrl: urls[0]?.url || null,
    },
  });
  return totals;
}

async function processProjectSet(ctx, projectIds, label) {
  const { prisma, accountId, accessToken, skipped } = ctx;
  log(`${label}: submitting ${projectIds.length} project(s)`);
  let requestId;
  let row;
  try {
    requestId = await submitRequest(accountId, accessToken, projectIds);
    row = await prisma.accDataConnectorJob.create({
      data: {
        requestId,
        status: "pending",
        serviceGroups: ["activities", "admin"],
        dateRange: `CUSTOM ${START_DATE} ${END_DATE}`,
      },
    });
    log(`${label}: saved AccDataConnectorJob ${row.id} request=${requestId}`);
    const totals = await ingestRequest(prisma, accountId, accessToken, row);
    log(`${label}: ingested ${JSON.stringify(totals)}`);
    return { submitted: 1, success: 1 };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    logErr(`${label}: failed for ${projectIds.length} project(s): ${message}`);
    if (err?.status === 429) {
      throw err;
    }
    if (row) {
      await prisma.accDataConnectorJob.update({
        where: { id: row.id },
        data: { status: "failed", completedAt: new Date(), errorMessage: message },
      }).catch(() => {});
    }
    if (projectIds.length === 1) {
      skipped.push({ projectId: projectIds[0], reason: message });
      return { submitted: requestId ? 1 : 0, success: 0, skipped: 1 };
    }
    const mid = Math.ceil(projectIds.length / 2);
    const left = await processProjectSet(ctx, projectIds.slice(0, mid), `${label}.1`);
    const right = await processProjectSet(ctx, projectIds.slice(mid), `${label}.2`);
    return {
      submitted: (left.submitted || 0) + (right.submitted || 0),
      success: (left.success || 0) + (right.success || 0),
      skipped: (left.skipped || 0) + (right.skipped || 0),
    };
  }
}

async function main() {
  const prisma = createPrisma();
  const skipped = [];
  try {
    const inFlight = await prisma.accDataConnectorJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
      select: { requestId: true, status: true, startedAt: true },
    });
    if (inFlight) throw new Error(`Refusing to start: request ${inFlight.requestId} is ${inFlight.status}`);

    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);
    const ids = await activeProjectIds(prisma);
    const chunks = chunk(ids, CHUNK_SIZE);
    log(`Account=${accountId}; projects=${ids.length}; chunks=${chunks.length}; chunkSize=${CHUNK_SIZE}`);
    log(`Window ${START_DATE} -> ${END_DATE}`);

    const summary = { submitted: 0, success: 0, skipped: 0 };
    for (let i = 0; i < chunks.length; i++) {
      const result = await processProjectSet(
        { prisma, accountId, accessToken, skipped },
        chunks[i],
        `chunk ${i + 1}/${chunks.length}`
      );
      summary.submitted += result.submitted || 0;
      summary.success += result.success || 0;
      summary.skipped += result.skipped || 0;
    }

    const [activities, attributed, latest] = await Promise.all([
      prisma.accActivity.count(),
      prisma.accActivity.count({ where: { userEmail: { not: null } } }),
      prisma.accDataConnectorJob.findFirst({
        orderBy: { startedAt: "desc" },
        select: { requestId: true, status: true, startedAt: true, completedAt: true, errorMessage: true },
      }),
    ]);
    log("=== SUMMARY ===");
    console.log(JSON.stringify({ ...summary, skipped, activities, attributed, latest }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Fatal:", err && err.message ? err.message : err);
  process.exit(1);
});
