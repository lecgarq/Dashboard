#!/usr/bin/env node

/**
 * scripts/scratch/poll-and-ingest-submitted.cjs
 *
 * Dedicated script to poll, download, and ingest the 3 successfully submitted requests:
 *   - Request 1: 35f597aa-8cf2-430c-b9ea-c81bf624d6ab (Batch 1, 50 projects)
 *   - Request 2: 31dae12d-38b0-432a-bc63-9b337f7c0ad4 (Batch 2, 50 projects)
 *   - Request 3: 63bcf8ab-e5f3-41b8-a466-77d1b8233020 (Batch 3, 50 projects)
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
const POLL_TIMEOUT_MS = 75 * 60_000;

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[poll-recovery ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[poll-recovery ${ts()}]`, ...args); }

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
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) return acct.access_token;

  log("Refreshing Autodesk 3-leg token...");
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: acct.refresh_token,
    client_id: process.env.APS_CLIENT_ID, client_secret: process.env.APS_CLIENT_SECRET,
    scope: "openid data:read data:create viewables:read user:read account:read",
  });
  const res = await fetch(APS_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) throw new Error(`Refresh token failed (${res.status}): ${raw}`);
  await prisma.account.update({
    where: { id: acct.id },
    data: { access_token: json.access_token, refresh_token: json.refresh_token || acct.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600) },
  });
  return json.access_token;
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID not configured");
  return String(hub).replace(/^b\./, "");
}

async function dcFetch(accessToken, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = text; }
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${text.slice(0, 500)}`); e.status = res.status; e.body = json; throw e; }
  return json;
}

function normalizeJobs(json) {
  return Array.isArray(json) ? json : Array.isArray(json.jobs) ? json.jobs : Array.isArray(json.results) ? json.results : [];
}

function reduceStatus(jobs) {
  if (jobs.length === 0) return "running";
  const ss = jobs.map((j) => String(j.completionStatus || j.status || j.state || "").toLowerCase());
  if (ss.some((s) => /fail|cancel|error/.test(s))) return "failed";
  if (ss.every((s) => /success|complete/.test(s))) return "success";
  return "running";
}

async function pollJobs(accountId, requestId, accessToken) {
  const json = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`);
  return normalizeJobs(json);
}

async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = [];
  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;
    const listing = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`);
    const files = Array.isArray(listing) ? listing : Array.isArray(listing.results) ? listing.results : [];
    const zipFile = files.find((file) => String(file.name || "").endsWith(".zip"));
    if (!zipFile?.name) continue;
    const data = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zipFile.name)}`);
    const url = data.signedUrl || data.downloadUrl || data.url;
    if (url) urls.push({ jobApsId, url });
  }
  return urls;
}

async function updateBackfillProgress(prisma, projectIds) {
  const start = new Date(START_DATE);
  const end = new Date(END_DATE);
  for (const projectId of projectIds) {
    const prev = await prisma.accDcBackfillProgress.findUnique({ where: { projectId } });
    const projectCreatedAt = prev?.projectCreatedAt || start;
    const earliestCovered = prev?.earliestCovered ? (start < prev.earliestCovered ? start : prev.earliestCovered) : start;
    const latestCovered = prev?.latestCovered ? (end > prev.latestCovered ? end : prev.latestCovered) : end;
    await prisma.accDcBackfillProgress.upsert({
      where: { projectId },
      create: { projectId, earliestCovered, latestCovered, projectCreatedAt, newProjectFlag: false },
      update: { earliestCovered, latestCovered, newProjectFlag: false },
    });
  }
}

async function main() {
  log("Starting recovery polling and ingestion for submitted requests...");
  const prisma = createPrisma();

  try {
    const activeRequests = [
      { label: "Request-2 (Batch 2)", id: "31dae12d-38b0-432a-bc63-9b337f7c0ad4" },
      { label: "Request-3 (Batch 3)", id: "63bcf8ab-e5f3-41b8-a466-77d1b8233020" }
    ];

    const accountId = await resolveAccountId(prisma);
    const accessToken = await refreshAccessToken(prisma);

    const { ingestActivityZip } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "ingestActivityZip.ts"));

    for (const req of activeRequests) {
      log(`Starting to poll [${req.label}] - ID: ${req.id}`);
      try {
        const started = Date.now();
        let jobs = [];
        while (Date.now() - started < POLL_TIMEOUT_MS) {
          jobs = await pollJobs(accountId, req.id, accessToken);
          const status = reduceStatus(jobs);
          log(`[${req.label}] Status=${status} jobs=${jobs.length}`);
          if (status === "success") break;
          if (status === "failed") {
            throw new Error(`Jobs failed for ${req.label}`);
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        log(`[${req.label}] Successfully completed on Autodesk! Resolving downloads...`);
        const downloads = await resolveDownloadUrls(accountId, jobs, accessToken);
        log(`[${req.label}] Found ${downloads.length} ZIP files.`);

        let totalRows = 0;
        for (const d of downloads) {
          log(`[${req.label}] Processing Job: ${d.jobApsId}`);
          const ingestRes = await ingestActivityZip(d.url, prisma, req.id);
          const rowsInserted = Object.values(ingestRes.rowsByFile || {}).reduce((a, b) => a + b, 0);
          totalRows += rowsInserted;
        }

        // We can find projectIds that were requested in this job
        const job = jobs[0];
        // Resolve projectIds from the local database where they are registered
        const dcProjectIds = (await prisma.accDcProject.findMany({ select: { id: true } })).map(p => p.id);
        
        // Update backfill progress for all target projectIds
        await updateBackfillProgress(prisma, dcProjectIds);

        log(`[${req.label}] Ingest completed successfully! Total rows: ${totalRows}`);

      } catch (reqErr) {
        logErr(`[${req.label}] Process failed:`, reqErr.message);
      }
    }

    log("All recovery polling completed!");

  } catch (err) {
    logErr("Fatal:", err.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch(console.error);
