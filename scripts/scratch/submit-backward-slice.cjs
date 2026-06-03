#!/usr/bin/env node

/**
 * scripts/scratch/submit-backward-slice.cjs
 *
 * Custom backward history extraction script.
 * Selects up to 50 active projects where earliestCovered is around 2026-02-22
 * and they are missing a lot of older history before that date.
 * Submits a 92-day custom Data Connector request (2025-11-22 to 2026-02-22),
 * polls for success, downloads the zipped output, ingests all activity logs,
 * and updates AccDcBackfillProgress.earliestCovered to 2025-11-22.
 *
 * Consumes exactly 1 Data Connector API quota request today.
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
const START_DATE = "2025-11-22T00:00:00.000Z";
const END_DATE = "2026-02-22T00:00:00.000Z";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60_000; // 1 hour timeout

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[backward-slice ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[backward-slice ${ts()}]`, ...args); }

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
    throw new Error(`Refresh token failed (${res.status}): ${raw}`);
  }
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token || acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
    },
  });
  return json.access_token;
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID not configured");
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
    const e = new Error(`HTTP ${res.status} ${text.slice(0, 500)}`);
    e.status = res.status;
    e.body = json;
    throw e;
  }
  return json;
}

async function submitRequest(accountId, accessToken, projectIds) {
  const body = {
    description: "Backward slice extraction 2025-11-22 to 2026-02-22",
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
  if (jobs.length === 0) return "running";
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
  const urls = [];
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
    log(`Request=${requestId} Status=${status} jobs=${jobs.length}`);
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

async function updateBackfillProgress(prisma, projectIds, startDateStr, endDateStr) {
  log(`Updating backfill progress metadata for ${projectIds.length} projects...`);
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
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
        projectCreatedAt = start;
      }
    }
    
    const earliestCovered = prev?.earliestCovered 
      ? (start < prev.earliestCovered ? start : prev.earliestCovered)
      : start;
      
    const latestCovered = prev?.latestCovered 
      ? (end > prev.latestCovered ? end : prev.latestCovered)
      : end;
      
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
        newProjectFlag: false,
      },
    });
  }
}

async function main() {
  log("Starting backward slice historical backfill...");
  const prisma = createPrisma();

  try {
    // 1. Find all active projects where earliestCovered >= 2026-02-22 and we have missing days before that floor.
    const projects = await prisma.accProject.findMany({
      where: { status: "active" },
      select: { id: true, name: true, createdAt: true }
    });

    const backfills = await prisma.accDcBackfillProgress.findMany({
      select: { projectId: true, earliestCovered: true }
    });

    const backfilledMap = new Map(backfills.map(b => [b.projectId, b]));
    const candidates = [];

    projects.forEach(p => {
      const b = backfilledMap.get(p.id);
      if (b && b.earliestCovered) {
        const floor = p.createdAt;
        const earliest = b.earliestCovered;
        // Project ID must exist in AccDcProject as well to be allowed in DC extraction
        if (floor && earliest > floor && earliest >= new Date("2026-02-22T00:00:00.000Z")) {
          const diffDays = Math.ceil((earliest - floor) / (1000 * 60 * 60 * 24));
          if (diffDays > 5) {
            candidates.push({
              id: p.id,
              name: p.name,
              diffDays
            });
          }
        }
      }
    });

    log(`Total backward backfill candidate projects identified: ${candidates.length}`);
    if (candidates.length === 0) {
      log("No candidates found! Everything has already reached its floor date.");
      return;
    }

    // Sort by missing days descending and take top 50 (APS limit per batch)
    candidates.sort((a,b) => b.diffDays - a.diffDays);
    const targetCandidates = candidates.slice(0, 50);
    const targetProjectIds = targetCandidates.map(c => c.id);

    log(`Selected ${targetProjectIds.length} projects for backward extraction:`);
    targetCandidates.forEach((c, idx) => {
      log(`  #${idx + 1}: ${c.name} (${c.diffDays} missing days)`);
    });

    // 2. Submit Data Connector request
    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);
    log(`Resolved Account ID: ${accountId}`);

    log(`Submitting POST /requests for date range ${START_DATE.slice(0, 10)} to ${END_DATE.slice(0, 10)}...`);
    const requestId = await submitRequest(accountId, accessToken, targetProjectIds);
    log(`Submitted successfully. Request ID: ${requestId}`);

    // Create an ingest run entry to record this quota consumption
    const ingestRun = await prisma.accDcIngestRun.create({
      data: {
        startedAt: new Date(),
        status: "running",
        sliceWindowStart: new Date(START_DATE),
        sliceWindowEnd: new Date(END_DATE),
        projectsProcessed: targetProjectIds.length,
        quotaUsed: 1,
        rowsByModule: {},
        rowsByAdminCsv: {}
      }
    });

    // 3. Poll for Success
    log("Waiting for jobs to succeed (polling every 30s)...");
    const jobs = await waitForSuccess(accountId, requestId, accessToken);
    log("All jobs succeeded!");

    // 4. Resolve download URLs and Ingest
    log("Resolving ZIP download URLs...");
    const downloads = await resolveDownloadUrls(accountId, jobs, accessToken);
    log(`Found ${downloads.length} ZIP files to process.`);

    const { ingestActivityZip } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "ingestActivityZip.ts"));
    
    let totalRows = 0;

    for (const d of downloads) {
      log(`Processing download for Job ID: ${d.jobApsId}`);
      const ingestRes = await ingestActivityZip(d.url, prisma, ingestRun.id);
      const rowsInserted = Object.values(ingestRes.rowsByFile || {}).reduce((a, b) => a + b, 0);
      totalRows += rowsInserted;
    }

    // 5. Update Backfill Progress Records
    await updateBackfillProgress(prisma, targetProjectIds, START_DATE, END_DATE);

    // Update Ingest Run to Success
    await prisma.accDcIngestRun.update({
      where: { id: ingestRun.id },
      data: {
        endedAt: new Date(),
        status: "success",
        rowsByModule: {
          totalRows
        }
      }
    });

    log(`Backward backfill execution complete! Ingested ${totalDocsRows} docs rows, ${totalIssuesRows} issues rows. Status updated to Success.`);

  } catch (err) {
    logErr("Fatal error during backward backfill:", err && err.message ? err.message : err);
    if (err && err.stack) logErr(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Uncaught fatal:", err);
  process.exit(1);
});
