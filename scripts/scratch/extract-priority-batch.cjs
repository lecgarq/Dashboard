#!/usr/bin/env node
/**
 * scripts/scratch/extract-priority-batch.cjs
 *
 * Scaled Data Connector extraction and ingestion script that:
 *  1. Discovers and filters projects to only those where Luis is Project Admin (bulletproof against 403s).
 *  2. Builds the priority plan dynamically from DB telemetry with custom limits.
 *  3. Supports dynamic date ranges via DC_DAYS (defaults to 30 days).
 *  4. Loops through all planned high-priority batches sequentially.
 *  5. Submits custom 3-leg Data Connector requests to Autodesk for each batch of projects.
 *  6. Polls each APS job status to completion.
 *  7. Streams and ingests the resulting activity ZIP logs, dynamically categorizing them on-the-fly.
 *  8. Updates AccDcBackfillProgress on database to mark the completed backfill coverage.
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
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";

const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";
const LUIS_ACC_USER_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60_000; // 1 hour per batch

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-priority ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[dc-priority ${ts()}]`, ...args); }

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
  const json = await res.json();
  if (!json.access_token) throw new Error("2-leg token failed: " + JSON.stringify(json));
  return json.access_token;
}

async function listProjectAdminProjects(accountId, token2Leg) {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${ADMIN_V1}/accounts/${accountId}/users/${LUIS_ACC_USER_ID}/projects?limit=200&offset=${offset}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token2Leg}` } });
    const data = await r.json();
    if (!data.results) throw new Error(`Admin v1 user-projects failed: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
    all.push(...data.results);
    const total = data.pagination?.totalResults ?? 0;
    offset += data.pagination?.limit ?? 200;
    if (offset >= total) break;
  }
  const actuallyAdmin = all.filter((p) => p.accessLevels?.projectAdmin === true);
  log(`Listed ${all.length} projects (member-or-admin); ${actuallyAdmin.length} with actual projectAdmin=true.`);
  return actuallyAdmin;
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

async function submitRequest(accountId, accessToken, projectIds, startDateIso, endDateIso) {
  const body = {
    description: `Dashboard priority activity sync ${startDateIso} to ${endDateIso}`,
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"],
    dateRange: "CUSTOM",
    startDate: startDateIso,
    endDate: endDateIso,
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

  // Automatically update local progressive backfill progress records
  await updateBackfillProgress(prisma, projectIds, startDate, endDate);

  return totals;
}

async function main() {
  const prisma = createPrisma();
  try {
    log("Resolving projectAdmin authorization list from Autodesk...");
    const accountId = await resolveAccountId(prisma);
    const token2Leg = await get2LegToken();
    const adminProjects = await listProjectAdminProjects(accountId, token2Leg);
    const adminProjectIds = new Set(adminProjects.map((p) => p.id));

    log("Resolving extraction priority plan candidates from database...");
    const windowDays = parseInt(process.env.DC_DAYS || "30", 10);
    const now = new Date();
    
    // Date window – windowDays days back, ending end-of-yesterday-UTC to match admin/ingest ranges
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endDate = new Date(utcToday.getTime() - 1);
    const startDate = new Date(utcToday.getTime() - windowDays * 24 * 60 * 60 * 1000);
    
    log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()} (${windowDays} days)`);

    const windowStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - windowDays + 1
    ));
    const windowEndExclusive = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ));

    const [dcProjectsRaw, folderProjects, memberCounts, progressRows, activityRows] =
      await Promise.all([
        prisma.accDcProject.findMany({
          select: { id: true, name: true, status: true, createdAt: true },
          orderBy: { name: "asc" },
        }),
        prisma.accProject.findMany({
          select: { id: true, folderCrawlStatus: true },
        }),
        prisma.accDcProjectUser.groupBy({
          by: ["projectId"],
          _count: { userId: true },
        }),
        prisma.accDcBackfillProgress.findMany({
          select: {
            projectId: true,
            earliestCovered: true,
            latestCovered: true,
            projectCreatedAt: true,
            newProjectFlag: true,
          },
        }),
        prisma.$queryRaw`
          SELECT
            NULLIF("projectId", '') AS "projectId",
            COUNT(*)::int AS rows,
            COUNT(DISTINCT date_trunc('day', "createdAt"))::int AS "activeDays",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(LOWER(service), ''), 'unknown')), NULL) AS services,
            MAX("createdAt") AS "lastActivityAt"
          FROM "AccActivity"
          WHERE "projectId" IS NOT NULL
            AND "projectId" <> ''
            AND "createdAt" >= ${windowStart}
            AND "createdAt" < ${windowEndExclusive}
          GROUP BY NULLIF("projectId", '')
        `,
      ]);

    // Apply strict projectAdmin filter to prevent any HTTP 403 Forbidden failures
    const dcProjects = dcProjectsRaw.filter((p) => adminProjectIds.has(p.id));
    log(`Filtered candidates: ${dcProjects.length} / ${dcProjectsRaw.length} projects authorized (Luis is Project Admin).`);

    const folderStatusByProject = new Map(
      folderProjects.map((project) => [project.id, project.folderCrawlStatus])
    );
    const memberCountByProject = new Map(
      memberCounts.map((row) => [row.projectId, row._count.userId])
    );
    const activity = activityRows
      .filter((row) => Boolean(row.projectId))
      .map((row) => ({
        projectId: row.projectId,
        rows: row.rows,
        activeDays: row.activeDays,
        services: row.services ?? [],
        lastActivityAt: row.lastActivityAt,
      }));

    const maxBatches = parseInt(process.env.DC_BATCH_LIMIT || "10", 10);

    const { buildExtractionPriorityPlan } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "extractionPriorityPlanner.ts"));
    const plan = buildExtractionPriorityPlan({
      generatedAt: now,
      windowDays,
      limit: 75,
      quotaLimit: maxBatches,
      projects: dcProjects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        createdAt: project.createdAt,
        folderCrawlStatus: folderStatusByProject.get(project.id) ?? "unknown",
        memberCount: memberCountByProject.get(project.id) ?? 0,
      })),
      activity,
      backfillProgress: progressRows,
    });

    const batches = plan.quotaPlan?.batches || [];
    if (batches.length === 0) {
      log("No high priority batches found in the extraction plan!");
      return;
    }

    log(`Found ${batches.length} high priority batch(es) in the extraction plan.`);
    log("Top projects to extract across all batches:");
    plan.rankedProjects.slice(0, 10).forEach((proj, idx) => {
      log(`  ${idx + 1}. ${proj.projectName} (Score: ${proj.score}, Members: ${proj.memberCount}, Lane: ${proj.lane})`);
    });

    const activeBatches = batches.slice(0, maxBatches);
    log(`Will process up to ${activeBatches.length} batch(es) sequentially.`);

    let totalInsertedAcrossBatches = 0;
    const batchStats = [];

    for (let i = 0; i < activeBatches.length; i++) {
      const batch = activeBatches[i];
      const targetProjectIds = batch.projectIds;
      const batchIdxStr = `Batch ${i + 1}/${activeBatches.length}`;

      log(`[${batchIdxStr}] Submitting custom extraction request for ${targetProjectIds.length} projects...`);
      const accessToken = await refreshAccessToken(prisma);
      
      const startDateIso = startDate.toISOString();
      const endDateIso = endDate.toISOString();
      
      const requestId = await submitRequest(accountId, accessToken, targetProjectIds, startDateIso, endDateIso);
      log(`[${batchIdxStr}] Saved Data Connector request ID: ${requestId}`);

      const row = await prisma.accDataConnectorJob.create({
        data: {
          requestId,
          status: "pending",
          serviceGroups: ["activities", "admin"],
          dateRange: `CUSTOM ${startDateIso} ${endDateIso}`,
        },
      });

      log(`[${batchIdxStr}] Registered AccDataConnectorJob ${row.id} locally. Proceeding to poll and ingest...`);
      const totals = await ingestRequest(prisma, accountId, accessToken, row, targetProjectIds, startDate, endDate);
      log(`[${batchIdxStr}] Complete. Ingested totals:`, JSON.stringify(totals));

      const insertedInBatch = Object.values(totals.rowsByFile || {}).reduce((a, b) => a + b, 0);
      totalInsertedAcrossBatches += insertedInBatch;

      batchStats.push({
        batchNumber: i + 1,
        requestId,
        projectCount: targetProjectIds.length,
        inserted: insertedInBatch,
      });

      // Cooldown between batches to respect rate limits
      if (i < activeBatches.length - 1) {
        log(`[${batchIdxStr}] Cooling down for 10 seconds before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    log("=== ALL BATCHES COMPLETE ===");
    console.log(JSON.stringify({ totalInsertedAcrossBatches, batchStats }, null, 2));

    await prisma.syncMeta.upsert({
      where: { id: "deep" },
      create: {
        id: "deep",
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: JSON.stringify({ totalInsertedAcrossBatches, batchStats }),
      },
      update: {
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: JSON.stringify({ totalInsertedAcrossBatches, batchStats }),
      },
    });

  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Fatal:", err && err.message ? err.message : err);
  process.exit(1);
});
