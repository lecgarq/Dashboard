#!/usr/bin/env node
/**
 * Targeted Data Connector extraction over an explicit, ordered project-ID list.
 *
 * Unlike scripts/dc-custom-chunks-3leg.cjs (which sweeps ALL active projects
 * alphabetically), this runner takes a caller-supplied ordered ID list so the
 * most important projects are extracted first, and adds three quota-safety
 * controls absent from the original:
 *
 *   DC_IDS_FILE       (required) newline/comma-separated, ORDERED project IDs.
 *   DC_START_DATE     ISO; default 2019-01-01T00:00:00.000Z  (≈ "all time")
 *   DC_END_DATE       ISO; default now
 *   DC_CHUNK_SIZE     projects per request; default 50 (APS hard cap)
 *   DC_MAX_REQUESTS   hard cap on total submit attempts (incl. bisection); stops cleanly.
 *   DC_NO_BISECT=1    on a failed batch, skip the whole batch (cost = 1 request)
 *                     instead of recursively bisecting (which can burn many units).
 *   DC_DRY_RUN=1      validate auth + print the plan; submit NOTHING.
 *   DC_USER_EMAIL     default luis.cortes@hermosillo.com
 *
 * Each successful or failed submit creates an AccDataConnectorJob row, so
 * lib/acc/dcIngest.ts loadQuotaUsedToday keeps counting today's quota correctly.
 */
const path = require("node:path");
const fs = require("node:fs");
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";

const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";
const START_DATE = process.env.DC_START_DATE || "2019-01-01T00:00:00.000Z";
const END_DATE = process.env.DC_END_DATE || new Date().toISOString();
const CHUNK_SIZE = parsePositiveInt(process.env.DC_CHUNK_SIZE, 50);
const POLL_INTERVAL_MS = parsePositiveInt(process.env.DC_POLL_INTERVAL_MS, 30_000);
const POLL_TIMEOUT_MS = parsePositiveInt(process.env.DC_POLL_TIMEOUT_MS, 60 * 60_000);
const MAX_REQUESTS = parsePositiveInt(process.env.DC_MAX_REQUESTS, undefined);
const NO_BISECT = process.env.DC_NO_BISECT === "1";
const DRY_RUN = process.env.DC_DRY_RUN === "1";
const IDS_FILE = process.env.DC_IDS_FILE?.trim();

let submitCount = 0; // counts every POST /requests attempt (real quota spend)

function ts() { return new Date().toISOString(); }
function log(...a) { console.log(`[dc-extract ${ts()}]`, ...a); }
function logErr(...a) { console.error(`[dc-extract ${ts()}]`, ...a); }
function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const v = Number.parseInt(String(raw), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

function loadIds() {
  if (!IDS_FILE) throw new Error("DC_IDS_FILE is required");
  const raw = fs.readFileSync(IDS_FILE, "utf8");
  const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`DC_IDS_FILE ${IDS_FILE} contained no IDs`);
  return [...new Set(ids)];
}

async function refreshAccessToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct?.refresh_token) throw new Error(`No Autodesk refresh token for ${USER_EMAIL}`);
  const nowSec = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) return acct.access_token;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "openid data:read data:create viewables:read user:read account:read",
  });
  const res = await fetch(APS_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) throw new Error(`Refresh failed (${res.status}): ${raw}`);
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

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function dcFetch(accessToken, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = text; }
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${text}`); e.status = res.status; e.body = json; throw e; }
  return json;
}

async function submitRequest(accountId, accessToken, projectIds) {
  submitCount++;
  const body = {
    description: `Dashboard priority all-time extraction ${START_DATE}..${END_DATE}`,
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"],
    dateRange: "CUSTOM",
    startDate: START_DATE,
    endDate: END_DATE,
    projectIdList: projectIds,
  };
  const json = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const requestId = json.id || json.requestId;
  if (!requestId) throw new Error(`POST /requests returned no id: ${JSON.stringify(json).slice(0, 500)}`);
  return requestId;
}

function normalizeJobs(json) {
  return Array.isArray(json) ? json : Array.isArray(json.jobs) ? json.jobs : Array.isArray(json.results) ? json.results : [];
}
function reduceStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const s = jobs.map((j) => String(j.completionStatus || j.status || j.state || "").toLowerCase());
  if (s.some((x) => /fail|cancel|error/.test(x))) return "failed";
  if (s.every((x) => /success|complete/.test(x))) return "success";
  return "running";
}
async function pollJobs(accountId, requestId, accessToken) {
  return normalizeJobs(await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`));
}
async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = jobs.map((j) => ({ jobApsId: j.id || j.jobId || null, url: j.downloadUrl || j.download_url || j.url })).filter((j) => j.url);
  if (urls.length > 0) return urls;
  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;
    const listing = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`);
    const files = Array.isArray(listing) ? listing : Array.isArray(listing.results) ? listing.results : [];
    const zip = files.find((f) => String(f.name || "").endsWith(".zip"));
    if (!zip?.name) continue;
    const data = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zip.name)}`);
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
      const detail = jobs.map((j) => ({ id: j.id || j.jobId, status: j.status || j.state, completionStatus: j.completionStatus, error: j.errorMessage || j.error || j.message }));
      throw new Error(`APS job failed: ${JSON.stringify(detail).slice(0, 1000)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Polling timed out after ${POLL_TIMEOUT_MS}ms`);
}
async function ingestRequest(prisma, accountId, accessToken, row) {
  const jobs = await waitForSuccess(accountId, row.requestId, accessToken);
  const urls = await resolveDownloadUrls(accountId, jobs, accessToken);
  if (urls.length === 0) throw new Error("APS job succeeded but returned no ZIP URLs");
  await prisma.accDataConnectorJob.update({ where: { id: row.id }, data: { status: "running" } });
  const { ingestActivityZip } = require(path.resolve(__dirname, "..", "lib", "acc", "ingestActivityZip.ts"));
  const totals = { rowsByFile: {}, unresolved: 0 };
  for (const { url } of urls) {
    const result = await ingestActivityZip(url, prisma, row.id);
    for (const [file, count] of Object.entries(result.rowsByFile)) totals.rowsByFile[file] = (totals.rowsByFile[file] || 0) + count;
    totals.unresolved += result.unresolved;
  }
  await prisma.accDataConnectorJob.update({ where: { id: row.id }, data: { status: "success", completedAt: new Date(), errorMessage: null, downloadUrl: urls[0]?.url || null } });
  return totals;
}

function budgetExhausted() { return MAX_REQUESTS !== undefined && submitCount >= MAX_REQUESTS; }

async function processProjectSet(ctx, projectIds, label) {
  const { prisma, accountId, accessToken, skipped, deferred } = ctx;
  if (budgetExhausted()) {
    log(`${label}: request budget (${MAX_REQUESTS}) reached — deferring ${projectIds.length} project(s)`);
    deferred.push(...projectIds);
    return { submitted: 0, success: 0, skipped: 0, deferred: projectIds.length };
  }
  log(`${label}: submitting ${projectIds.length} project(s)  [request #${submitCount + 1}${MAX_REQUESTS ? "/" + MAX_REQUESTS : ""}]`);
  let requestId, row;
  try {
    requestId = await submitRequest(accountId, accessToken, projectIds);
    row = await prisma.accDataConnectorJob.create({ data: { requestId, status: "pending", serviceGroups: ["activities", "admin"], dateRange: `CUSTOM ${START_DATE} ${END_DATE}` } });
    log(`${label}: saved AccDataConnectorJob ${row.id} request=${requestId}`);
    const totals = await ingestRequest(prisma, accountId, accessToken, row);
    log(`${label}: ingested ${JSON.stringify(totals)}`);
    return { submitted: 1, success: 1, skipped: 0, deferred: 0 };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    logErr(`${label}: failed for ${projectIds.length} project(s): ${message}`);
    if (err?.status === 429) throw err; // stop the whole run on quota exhaustion
    if (row) await prisma.accDataConnectorJob.update({ where: { id: row.id }, data: { status: "failed", completedAt: new Date(), errorMessage: message } }).catch(() => {});
    if (projectIds.length === 1) { skipped.push({ projectId: projectIds[0], reason: message }); return { submitted: requestId ? 1 : 0, success: 0, skipped: 1, deferred: 0 }; }
    if (NO_BISECT) {
      log(`${label}: NO_BISECT set — skipping whole batch of ${projectIds.length}`);
      for (const id of projectIds) skipped.push({ projectId: id, reason: `batch-skip: ${message}` });
      return { submitted: requestId ? 1 : 0, success: 0, skipped: projectIds.length, deferred: 0 };
    }
    const mid = Math.ceil(projectIds.length / 2);
    const left = await processProjectSet(ctx, projectIds.slice(0, mid), `${label}.1`);
    const right = await processProjectSet(ctx, projectIds.slice(mid), `${label}.2`);
    return {
      submitted: (left.submitted || 0) + (right.submitted || 0),
      success: (left.success || 0) + (right.success || 0),
      skipped: (left.skipped || 0) + (right.skipped || 0),
      deferred: (left.deferred || 0) + (right.deferred || 0),
    };
  }
}

async function main() {
  const prisma = createPrisma();
  const skipped = [], deferred = [];
  try {
    const ids = loadIds();
    const chunks = chunk(ids, CHUNK_SIZE);
    log(`IDs=${ids.length} chunkSize=${CHUNK_SIZE} chunks=${chunks.length} window=${START_DATE}..${END_DATE}`);
    log(`controls: MAX_REQUESTS=${MAX_REQUESTS ?? "∞"} NO_BISECT=${NO_BISECT} DRY_RUN=${DRY_RUN} user=${USER_EMAIL}`);

    const inFlight = await prisma.accDataConnectorJob.findFirst({ where: { status: { in: ["pending", "running"] } }, orderBy: { startedAt: "desc" }, select: { requestId: true, status: true, startedAt: true } });
    if (inFlight) throw new Error(`Refusing to start: request ${inFlight.requestId} is ${inFlight.status}`);

    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);
    log(`account=${accountId}; token OK (${accessToken.slice(0, 6)}…)`);

    if (DRY_RUN) {
      log("DRY RUN — no requests submitted. Planned chunks:");
      chunks.forEach((c, i) => log(`  chunk ${i + 1}/${chunks.length}: ${c.length} projects`));
      const wouldSubmit = MAX_REQUESTS ? Math.min(chunks.length, MAX_REQUESTS) : chunks.length;
      log(`Would submit up to ${wouldSubmit} request(s) (chunks=${chunks.length}, cap=${MAX_REQUESTS ?? "∞"}).`);
      return;
    }

    const summary = { submitted: 0, success: 0, skipped: 0, deferred: 0 };
    for (let i = 0; i < chunks.length; i++) {
      if (budgetExhausted()) { deferred.push(...chunks.slice(i).flat()); log(`Budget reached; deferring remaining ${chunks.length - i} chunk(s).`); break; }
      const r = await processProjectSet({ prisma, accountId, accessToken, skipped, deferred }, chunks[i], `chunk ${i + 1}/${chunks.length}`);
      summary.submitted += r.submitted || 0; summary.success += r.success || 0; summary.skipped += r.skipped || 0; summary.deferred += r.deferred || 0;
    }

    const [activities, attributed] = await Promise.all([
      prisma.accActivity.count(),
      prisma.accActivity.count({ where: { userEmail: { not: null } } }),
    ]);
    log("=== SUMMARY ===");
    console.log(JSON.stringify({ ...summary, totalSubmits: submitCount, skippedDetail: skipped, deferredCount: deferred.length, activities, attributed }, null, 2));
  } catch (err) {
    logErr("Run aborted:", err && err.message ? err.message : err);
    console.log(JSON.stringify({ totalSubmits: submitCount, skipped, deferred: deferred.length }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
