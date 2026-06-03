#!/usr/bin/env node

/**
 * scripts/scratch/extend-history-top25.cjs
 *
 * Dedicated script to submit a custom Autodesk Data Connector request for the top 25
 * highest-activity projects for a historical window (Feb 22, 2026 to Apr 22, 2026),
 * poll for job success, download the zipped output, stream-ingest all activities
 * into the database, and update the progressive backfill progress.
 *
 * Consumes exactly 1 Data Connector API quota request.
 */

const path = require("node:path");
const fs = require("node:fs");

require("tsx/cjs");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";

const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";
const START_DATE = "2026-02-22T00:00:00.000Z";
const END_DATE = "2026-04-22T00:00:00.000Z";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60_000; // 1 hour timeout

const topProjectIds = [
  '2752ab7b-0911-4c96-b9ab-e090f3b364e3',
  '03a120e6-99eb-41e8-a721-2b43431c247e',
  'bedf0380-adc8-4f57-b9fc-54d7695fb139',
  '2522c60e-02a5-45aa-ae12-6e48b9083dce',
  '5fb6b6a5-690f-4c7b-8f01-2391860a7822',
  '56c5ba90-fd88-4be9-b0af-2f2e7c0ed6e0',
  '8ac02215-b399-4098-8b2a-1414a9cc4279',
  '242c1430-76f4-4370-8375-7a193998c103',
  '6c6dd2eb-9760-4d69-8651-aea5535dcf1e',
  '0fe326b2-d61e-40b5-92ca-c92caa98f46f',
  '74bffe39-3afe-4af3-8c7b-312b2578f722',
  '1e2cac73-27a1-4d13-80ed-c6f46e8351e9',
  '9ff7d8a5-035e-4efa-8464-854feec533ec',
  '82f74c6c-904a-4012-b658-45f69e3acd3a',
  'eff55021-b84e-47e0-96af-a747208b5cab',
  '3e1c3bc2-5be3-4822-9ed5-103256aab9bb',
  '61d0629d-0264-4c2c-9751-d55fd826cd31',
  '4930f201-b8ab-47be-b59b-4ff51ebf6a5d',
  'd4bf780e-2c0b-4cd2-aa29-55161f62a8be',
  'baa6a8f0-c237-4f99-8a56-519edcf63d3d',
  '08eb7461-b8d0-41a5-bc8f-34e5d1c0a4ec',
  '5739117b-6509-4f3d-af07-98337bf3a8fa',
  '9e22cffe-2b68-458a-8a75-6f85e4533156',
  '0a9607a6-320f-4fb1-9045-fbeb3b7f88cb',
  'cdd21f33-a8eb-4e01-9fd6-1d0aec2701d6'
];

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-extend-top25 ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[dc-extend-top25 ${ts()}]`, ...args); }

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

  log("Refreshing Autodesk 3-leg token...");
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
    description: `Dashboard Top25 historical ${START_DATE} to ${END_DATE}`,
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
    log(`Request=${requestId} APS Status=${status} jobs=${jobs.length}`);
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

async function updateBackfillProgress(prisma, projectIds, startDate, endDate) {
  log(`Updating backfill progress metadata for ${projectIds.length} projects...`);
  for (const projectId of projectIds) {
    const prev = await prisma.accDcBackfillProgress.findUnique({
      where: { projectId },
    });
    
    let projectCreatedAt = null;
    if (prev) {
      projectCreatedAt = prev.projectCreatedAt;
    } else {
      const proj = await prisma.accDcProject.findUnique({
        where: { id: projectId },
        select: { createdAt: true },
      });
      projectCreatedAt = proj?.createdAt ?? null;
      if (!projectCreatedAt) {
        projectCreatedAt = startDate;
      }
    }
    
    const earliestCovered = prev?.earliestCovered 
      ? (startDate < prev.earliestCovered ? startDate : prev.earliestCovered)
      : startDate;
      
    const latestCovered = prev?.latestCovered 
      ? (endDate > prev.latestCovered ? endDate : prev.latestCovered)
      : endDate;
      
    await prisma.accDcBackfillProgress.upsert({
      where: { projectId },
      create: {
        projectId,
        earliestCovered,
        latestCovered,
        projectCreatedAt,
        newProjectFlag: false,
      },
      update: {
        earliestCovered,
        latestCovered,
        projectCreatedAt,
        newProjectFlag: false,
      },
    });
  }
}

async function ingestRequest(prisma, accountId, accessToken, row, projectIds, startDate, endDate) {
  const jobs = await waitForSuccess(accountId, row.requestId, accessToken);
  const urls = await resolveDownloadUrls(accountId, jobs, accessToken);
  if (urls.length === 0) throw new Error("APS job succeeded but returned no ZIP URLs");

  await prisma.accDataConnectorJob.update({
    where: { id: row.id },
    data: { status: "running" },
  });

  const { ingestActivityZip } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "ingestActivityZip.ts"));
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

  // Update AccDcBackfillProgress rows to register the backfilled date range
  await updateBackfillProgress(prisma, projectIds, startDate, endDate);

  return totals;
}

async function main() {
  const prisma = createPrisma();
  let row;
  try {
    const reuseRequestId = process.env.REUSE_REQUEST_ID || process.argv[2];

    const inFlight = await prisma.accDataConnectorJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
      select: { requestId: true, status: true, startedAt: true },
    });
    if (inFlight && !reuseRequestId) throw new Error(`Refusing to start: request ${inFlight.requestId} is ${inFlight.status}`);

    log("Resolving account ID and refreshing tokens...");
    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);

    let requestId;
    if (reuseRequestId) {
      log(`Reusing existing request ID: ${reuseRequestId}`);
      requestId = reuseRequestId;
      
      const existingRow = await prisma.accDataConnectorJob.findFirst({
        where: { requestId },
        orderBy: { startedAt: "desc" }
      });
      
      if (existingRow) {
        row = existingRow;
        log(`Found existing job row ${row.id} for request ${requestId}`);
        await prisma.accDataConnectorJob.update({
          where: { id: row.id },
          data: { status: "pending", errorMessage: null }
        });
      } else {
        row = await prisma.accDataConnectorJob.create({
          data: {
            requestId,
            status: "pending",
            serviceGroups: ["activities", "admin"],
            dateRange: `CUSTOM ${START_DATE} ${END_DATE}`,
          },
        });
        log(`Created new AccDataConnectorJob row ${row.id} for request=${requestId}`);
      }
    } else {
      log(`Submitting single batch custom request for ${topProjectIds.length} projects.`);
      log(`Date range window: ${START_DATE} -> ${END_DATE}`);

      requestId = await submitRequest(accountId, accessToken, topProjectIds);
      row = await prisma.accDataConnectorJob.create({
        data: {
          requestId,
          status: "pending",
          serviceGroups: ["activities", "admin"],
          dateRange: `CUSTOM ${START_DATE} ${END_DATE}`,
        },
      });
      log(`Saved AccDataConnectorJob ${row.id} request=${requestId}`);
    }

    const totals = await ingestRequest(
      prisma,
      accountId,
      accessToken,
      row,
      topProjectIds,
      new Date(START_DATE),
      new Date(END_DATE)
    );

    log(`Ingested successfully! Totals: ${JSON.stringify(totals)}`);
    console.log("\n=== SUCCESS ===");
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    logErr(`Failed during submission or ingestion: ${message}`);
    if (row) {
      await prisma.accDataConnectorJob.update({
        where: { id: row.id },
        data: { status: "failed", completedAt: new Date(), errorMessage: message },
      }).catch(() => {});
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
