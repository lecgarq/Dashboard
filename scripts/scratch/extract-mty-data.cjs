#!/usr/bin/env node
/**
 * scripts/scratch/extract-mty-data.cjs
 *
 * Systematic extraction of Monterrey/MTY projects:
 * 1. Find all MTY/Monterrey projects in our DB.
 * 2. Get Autodesk tokens (2-leg and Luis's 3-leg).
 * 3. Find where Luis is Project Admin.
 * 4. Submit ONE custom Data Connector request for all authorized MTY projects (30-day window).
 * 5. Poll, download and ingest activities.
 * 6. Crawl folders and permissions for ALL active MTY projects (using 2-leg token, no DC quota used).
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

const USER_EMAIL = "luis.cortes@hermosillo.com";
const LUIS_ACC_USER_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324";
const POLL_INTERVAL_MS = 20_000;
const POLL_TIMEOUT_MS = 60 * 60_000; // 1 hour timeout

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[mty-extract ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[mty-extract ${ts()}]`, ...args); }

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

async function refreshUserToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct?.refresh_token) throw new Error(`No Autodesk refresh token in DB for ${USER_EMAIL}`);

  const nowSec = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) {
    return acct.access_token;
  }

  log("Refreshing Luis's 3-leg token...");
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
  log("Luis's 3-leg token refreshed successfully.");
  return json.access_token;
}

async function get2LegToken() {
  log("Acquiring 2-leg token...");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("2-leg token acquisition failed: " + JSON.stringify(json));
  log("2-leg token acquired.");
  return json.access_token;
}

async function listProjectAdminProjects(accountId, token2Leg) {
  log("Fetching user-projects from Autodesk Construction Admin API...");
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
  log(`Autodesk reported ${all.length} projects total for Luis; ${actuallyAdmin.length} have projectAdmin=true.`);
  return actuallyAdmin;
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
}

async function submitDCRequest(accountId, accessToken, projectIds, startDateIso, endDateIso) {
  const body = {
    description: "MTY Projects Systematic Activity Sync",
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"],
    dateRange: "CUSTOM",
    startDate: startDateIso,
    endDate: endDateIso,
    projectIdList: projectIds,
  };
  log(`Submitting Data Connector request for ${projectIds.length} projects...`);
  const res = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = text; }
  if (!res.ok) {
    throw new Error(`Data Connector submit failed (${res.status}): ${text}`);
  }
  const requestId = json.id || json.requestId;
  if (!requestId) throw new Error(`POST /requests returned no id: ${JSON.stringify(json)}`);
  return requestId;
}

async function pollJobs(accountId, requestId, accessToken) {
  const res = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = text; }
  if (!res.ok) throw new Error(`GET /jobs failed: ${text}`);
  return Array.isArray(json) ? json : json.jobs || json.results || [];
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

async function waitForSuccess(accountId, requestId, accessToken) {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const jobs = await pollJobs(accountId, requestId, accessToken);
    const status = reduceStatus(jobs);
    log(`Request=${requestId} APS Status=${status} (jobs=${jobs.length})`);
    if (status === "success") return jobs;
    if (status === "failed") {
      const detail = jobs.map((job) => ({
        id: job.id || job.jobId,
        status: job.status || job.state,
        completionStatus: job.completionStatus,
        error: job.errorMessage || job.error || job.message,
      }));
      throw new Error(`APS job failed: ${JSON.stringify(detail)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Polling timed out after ${POLL_TIMEOUT_MS}ms`);
}

async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = [];
  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;
    
    // Attempt downloadUrl first
    const directUrl = job.downloadUrl || job.download_url || job.url;
    if (directUrl) {
      urls.push({ jobApsId, url: directUrl });
      continue;
    }

    log(`Listing files for job ${jobApsId}...`);
    const res = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listing = await res.json();
    const files = Array.isArray(listing) ? listing : listing.results || [];
    const zipFile = files.find((file) => String(file.name || "").endsWith(".zip"));
    if (!zipFile?.name) continue;

    const dataRes = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zipFile.name)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await dataRes.json();
    const url = data.signedUrl || data.downloadUrl || data.url;
    if (url) urls.push({ jobApsId, url });
  }
  return urls;
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
      const proj = await prisma.accProject.findUnique({
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

async function main() {
  const prisma = createPrisma();
  try {
    log("=== STARTING SYSTEMATIC MONTERREY/MTY PROJECT EXTRACTION ===");

    // Step 1: Find all MTY/Monterrey projects in DB
    const mtyProjects = await prisma.accProject.findMany({
      where: {
        OR: [
          { name: { contains: "mty", mode: "insensitive" } },
          { name: { contains: "monterrey", mode: "insensitive" } },
        ]
      },
      select: {
        id: true,
        name: true,
        status: true,
        folderCrawlStatus: true
      },
      orderBy: { name: "asc" }
    });

    log(`Found ${mtyProjects.length} Monterrey/MTY projects in the local database.`);

    // Step 2: Get Autodesk authorization context
    const accountId = await resolveAccountId(prisma);
    const token2Leg = await get2LegToken();
    const userToken = await refreshUserToken(prisma);

    // Step 3: Fetch projects where Luis is Project Admin
    const adminProjects = await listProjectAdminProjects(accountId, token2Leg);
    const adminProjectIds = new Set(adminProjects.map((p) => p.id));

    // Step 4: Intersect lists to identify target authorized Monterrey projects
    const authorizedMtyProjects = mtyProjects.filter((p) => adminProjectIds.has(p.id));
    log(`Authorized MTY Projects for Data Connector (Luis is Admin): ${authorizedMtyProjects.length} / ${mtyProjects.length}`);
    authorizedMtyProjects.forEach((p, i) => {
      log(`  ${i + 1}. [${p.status}] ${p.name} (${p.id})`);
    });

    const unauthorizedMtyProjects = mtyProjects.filter((p) => !adminProjectIds.has(p.id));
    if (unauthorizedMtyProjects.length > 0) {
      log(`Unauthorized MTY Projects (Luis is NOT Admin): ${unauthorizedMtyProjects.length}`);
      unauthorizedMtyProjects.forEach((p, i) => {
        log(`  ${i + 1}. [${p.status}] ${p.name} (${p.id}) - (Activities cannot be extracted via Luis's credentials)`);
      });
    }

    if (authorizedMtyProjects.length === 0) {
      log("No authorized Monterrey projects found for activity extraction!");
    } else {
      // Step 5: Submit chunked Data Connector requests for 30-day activity logs (max 50 projects per batch)
      const windowDays = 30;
      const now = new Date();
      const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const endDate = new Date(utcToday.getTime() - 1);
      const startDate = new Date(utcToday.getTime() - windowDays * 24 * 60 * 60 * 1000);
      
      log(`Activity extraction date window: ${startDate.toISOString()} to ${endDate.toISOString()} (${windowDays} days)`);

      const targetProjectIds = authorizedMtyProjects.map((p) => p.id);
      const startDateIso = startDate.toISOString();
      const endDateIso = endDate.toISOString();

      // Chunk targetProjectIds into groups of 50
      const BATCH_SIZE_LIMIT = 50;
      const projectBatches = [];
      for (let i = 0; i < targetProjectIds.length; i += BATCH_SIZE_LIMIT) {
        projectBatches.push(targetProjectIds.slice(i, i + BATCH_SIZE_LIMIT));
      }
      log(`Chunked ${targetProjectIds.length} projects into ${projectBatches.length} batch(es) of up to 50 projects.`);

      const { ingestActivityZip } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "ingestActivityZip.ts"));

      for (let b = 0; b < projectBatches.length; b++) {
        const batchProjectIds = projectBatches[b];
        const batchNumStr = `Batch ${b + 1}/${projectBatches.length}`;
        log(`[${batchNumStr}] Processing extraction for ${batchProjectIds.length} projects...`);

        const refreshedToken = await refreshUserToken(prisma);
        const requestId = await submitDCRequest(accountId, refreshedToken, batchProjectIds, startDateIso, endDateIso);
        log(`[${batchNumStr}] Saved Data Connector request ID: ${requestId}`);

        const jobRow = await prisma.accDataConnectorJob.create({
          data: {
            requestId,
            status: "pending",
            serviceGroups: ["activities", "admin"],
            dateRange: `CUSTOM ${startDateIso} ${endDateIso}`,
          },
        });
        log(`[${batchNumStr}] Registered local AccDataConnectorJob ${jobRow.id}. Polling...`);

        // Poll request
        const jobs = await waitForSuccess(accountId, requestId, refreshedToken);
        const urls = await resolveDownloadUrls(accountId, jobs, refreshedToken);
        if (urls.length === 0) {
          throw new Error(`[${batchNumStr}] APS jobs succeeded but returned no download URLs!`);
        }

        log(`[${batchNumStr}] Request succeeded! Found ${urls.length} download URL(s). Ingesting activities...`);
        await prisma.accDataConnectorJob.update({
          where: { id: jobRow.id },
          data: { status: "running" },
        });

        const totals = { rowsByFile: {}, unresolved: 0 };
        for (const { url } of urls) {
          log(`[${batchNumStr}] Streaming zip log file from ${url.slice(0, 100)}...`);
          const result = await ingestActivityZip(url, prisma, jobRow.id);
          for (const [file, count] of Object.entries(result.rowsByFile)) {
            totals.rowsByFile[file] = (totals.rowsByFile[file] || 0) + count;
          }
          totals.unresolved += result.unresolved;
        }

        await prisma.accDataConnectorJob.update({
          where: { id: jobRow.id },
          data: {
            status: "success",
            completedAt: new Date(),
            errorMessage: null,
            downloadUrl: urls[0]?.url || null,
          },
        });

        await updateBackfillProgress(prisma, batchProjectIds, startDate, endDate);
        log(`[${batchNumStr}] Ingestion complete! Ingested activity breakdown: ${JSON.stringify(totals)}`);

        // Cooldown between batches to respect rate limits
        if (b < projectBatches.length - 1) {
          log(`[${batchNumStr}] Cooling down for 10 seconds before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      }
    }

    // Step 6: BFS Folder Permissions Crawl for ALL active MTY projects (uses 2-leg token, NO Data Connector quota!)
    const activeMtyProjects = mtyProjects.filter((p) => p.status === "active");
    log(`\n=== PROCEEDING TO FOLDER PERMISSIONS CRAWL FOR ALL ACTIVE MTY PROJECTS (${activeMtyProjects.length} projects) ===`);
    log("This uses standard Data Management APIs with a 2-leg token, so it DOES NOT consume Data Connector quota.");

    const { extractAndPersistFolders } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "folderCrawl.ts"));
    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow?.apsHubId) {
      throw new Error("Project.apsHubId is not configured in DB.");
    }
    const hubId = String(hubRow.apsHubId);

    let crawledCount = 0;
    let failedCount = 0;

    for (let i = 0; i < activeMtyProjects.length; i++) {
      const p = activeMtyProjects[i];
      const idxStr = `${i + 1}/${activeMtyProjects.length}`;
      log(`[${idxStr}] Crawling folders & permissions for: "${p.name}" (${p.id}) | Current Status: ${p.folderCrawlStatus}`);
      try {
        const result = await extractAndPersistFolders(
          prisma,
          hubId,
          { id: p.id, accountId, name: p.name },
          token2Leg,
          { refreshAccessToken: get2LegToken }
        );
        log(`[${idxStr}] Complete: folders=${result.folderCount} permissions=${result.permissionCount} status=${result.status}`);
        crawledCount++;
      } catch (err) {
        logErr(`[${idxStr}] Failed crawling folders for ${p.name}: ${err && err.message ? err.message : err}`);
        failedCount++;
      }
      
      // Cooldown between folder crawls to respect API rate limits
      if (i < activeMtyProjects.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    log(`\n=== MONTERREY/MTY EXTRACTION RUN SUMMARY ===`);
    log(`Data Connector Quota Used today: 1 request`);
    log(`Projects crawled for folders/permissions: ${crawledCount} succeeded, ${failedCount} failed.`);
    log(`============================================`);

  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Fatal error in systematic extraction:", err && err.message ? err.message : err);
  if (err && err.stack) logErr(err.stack);
  process.exit(1);
});
