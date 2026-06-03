#!/usr/bin/env node

/**
 * scripts/scratch/submit-more-slices.cjs
 *
 * Submits 3 additional backward-slice requests to cover all remaining 112 candidate projects:
 *   - Batch 2: Projects #51 to #100 (50 projects)
 *   - Batch 3: Projects #101 to #150 (50 projects)
 *   - Batch 4: Projects #151 to #162 (12 projects)
 *
 * Unified date window: 2025-11-22 to 2026-02-22 (92 days).
 * Consumes exactly 3 Data Connector requests, which perfectly utilizes the user's quota request!
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
const POLL_TIMEOUT_MS = 75 * 60_000; // 1.25 hours timeout

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[bulk-backward ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[bulk-backward ${ts()}]`, ...args); }

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

async function submitRequest(accountId, accessToken, projectIds, batchLabel) {
  const body = {
    description: `Bulk backward slice ${batchLabel} 2025-11-22 to 2026-02-22`,
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

async function updateBackfillProgress(prisma, projectIds, startDateStr, endDateStr) {
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
  log("Starting bulk backward slice extraction...");
  const prisma = createPrisma();

  try {
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

    candidates.sort((a,b) => b.diffDays - a.diffDays);
    
    // Exclude the top 50 that are already processing in Request 1
    const remainingCandidates = candidates.slice(50);
    log(`Total remaining candidate projects: ${remainingCandidates.length}`);

    if (remainingCandidates.length === 0) {
      log("No remaining candidates to process!");
      return;
    }

    // Chunk remaining candidates into Batch 2 (50), Batch 3 (50), Batch 4 (remaining)
    const batches = [];
    for (let i = 0; i < remainingCandidates.length; i += 50) {
      batches.push(remainingCandidates.slice(i, i + 50));
    }

    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);

    const activeRequests = [];

    for (let idx = 0; idx < batches.length; idx++) {
      const batch = batches[idx];
      const batchLabel = `Batch-${idx + 2}`;
      const projectIds = batch.map(c => c.id);

      log(`Submitting ${batchLabel} with ${projectIds.length} projects...`);
      const requestId = await submitRequest(accountId, accessToken, projectIds, batchLabel);
      log(`${batchLabel} submitted successfully. Request ID: ${requestId}`);

      // Create an ingest run entry to record this quota consumption
      const ingestRun = await prisma.accDcIngestRun.create({
        data: {
          startedAt: new Date(),
          status: "running",
          sliceWindowStart: new Date(START_DATE),
          sliceWindowEnd: new Date(END_DATE),
          projectsProcessed: projectIds.length,
          quotaUsed: 1,
          rowsByModule: {},
          rowsByAdminCsv: {}
        }
      });

      activeRequests.push({
        batchLabel,
        requestId,
        projectIds,
        ingestRunId: ingestRun.id
      });
    }

    log(`Submitted all ${activeRequests.length} requests successfully in parallel!`);
    log("Waiting for all jobs to succeed concurrently...");

    const { ingestZipBySignedUrl } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "dcIngest"));

    for (const req of activeRequests) {
      try {
        log(`[${req.batchLabel}] Polling Request ID: ${req.requestId}...`);
        const started = Date.now();
        let jobs = [];
        
        while (Date.now() - started < POLL_TIMEOUT_MS) {
          jobs = await pollJobs(accountId, req.requestId, accessToken);
          const status = reduceStatus(jobs);
          log(`[${req.batchLabel}] Status=${status} jobs=${jobs.length}`);
          if (status === "success") break;
          if (status === "failed") {
            throw new Error(`Jobs failed for ${req.batchLabel}`);
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        log(`[${req.batchLabel}] All jobs completed successfully! Resolving downloads...`);
        const downloads = await resolveDownloadUrls(accountId, jobs, accessToken);
        log(`[${req.batchLabel}] Found ${downloads.length} ZIP files to process.`);

        let batchDocs = 0;
        let batchIssues = 0;

        for (const d of downloads) {
          log(`[${req.batchLabel}] Processing Job ID: ${d.jobApsId}`);
          const ingestRes = await ingestZipBySignedUrl(prisma, d.url);
          batchDocs += ingestRes.docsCount || 0;
          batchIssues += ingestRes.issuesCount || 0;
        }

        // Update progress metadata
        await updateBackfillProgress(prisma, req.projectIds, START_DATE, END_DATE);

        // Update Ingest Run to Success
        await prisma.accDcIngestRun.update({
          where: { id: req.ingestRunId },
          data: {
            endedAt: new Date(),
            status: "success",
            rowsByModule: {
              docs: batchDocs,
              issues: batchIssues
            }
          }
        });

        log(`[${req.batchLabel}] Ingest complete! Docs=${batchDocs}, Issues=${batchIssues}`);

      } catch (reqErr) {
        logErr(`[${req.batchLabel}] Failed:`, reqErr.message);
        await prisma.accDcIngestRun.update({
          where: { id: req.ingestRunId },
          data: {
            endedAt: new Date(),
            status: "failed",
            errorMessage: reqErr.message
          }
        }).catch(() => {});
      }
    }

    log("All bulk backward slices processed successfully!");

  } catch (err) {
    logErr("Fatal error during bulk backward extraction:", err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Uncaught fatal:", err);
  process.exit(1);
});
