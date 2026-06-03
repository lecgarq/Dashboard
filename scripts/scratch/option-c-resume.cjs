#!/usr/bin/env node

/**
 * scripts/scratch/option-c-resume.cjs
 *
 * Resume Option C after B1 was already submitted.
 *   B1: REUSE request debb152d-9471-4b2a-adb0-69d82b5891e0 (50 backfill projects, already submitted)
 *   B2: SKIP (4 backfill projects with invalid access — would waste quota)
 *   B3-B7: Submit 5 new batches of ~55 zero-data projects each (Feb 22 – May 22)
 *
 * Total new quota: 5 requests (6 total including B1 already used)
 */

const path = require("node:path");
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 90 * 60_000;
const MAX_PER_REQUEST = 50;

// B1 was already submitted
const B1_REQUEST_ID = "debb152d-9471-4b2a-adb0-69d82b5891e0";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[option-c ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[option-c ${ts()}]`, ...args); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 3 }), log: ["error"] });
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
  if (!res.ok || !json.access_token) throw new Error(`Refresh failed (${res.status}): ${raw}`);
  await prisma.account.update({
    where: { id: acct.id },
    data: { access_token: json.access_token, refresh_token: json.refresh_token || acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600), scope: json.scope || null },
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

async function submitRequestSafe(accountId, accessToken, projectIds, description, startDate, endDate) {
  if (projectIds.length > MAX_PER_REQUEST) throw new Error(`${projectIds.length} > max ${MAX_PER_REQUEST}`);
  const body = {
    description, scheduleInterval: "ONE_TIME", effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"], dateRange: "CUSTOM", startDate, endDate, projectIdList: projectIds,
  };
  try {
    const json = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const requestId = json.id || json.requestId;
    if (!requestId) throw new Error(`No requestId: ${JSON.stringify(json).slice(0, 500)}`);
    return { ok: true, requestId };
  } catch (err) {
    if (err.status === 403) {
      logErr(`  ⚠ 403 Forbidden — skipping batch (${err.body?.detail || err.message})`);
      return { ok: false, error: err.message };
    }
    throw err; // re-throw non-403 errors
  }
}

function normalizeJobs(json) {
  return Array.isArray(json) ? json : Array.isArray(json.jobs) ? json.jobs : Array.isArray(json.results) ? json.results : [];
}
function reduceStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const ss = jobs.map(j => String(j.completionStatus || j.status || j.state || "").toLowerCase());
  if (ss.some(s => /fail|cancel|error/.test(s))) return "failed";
  if (ss.every(s => /success|complete/.test(s))) return "success";
  return "running";
}

async function waitForSuccess(accountId, requestId, accessToken, label) {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const json = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`);
    const jobs = normalizeJobs(json);
    const status = reduceStatus(jobs);
    log(`[${label}] req=${requestId.slice(0,8)}… status=${status} jobs=${jobs.length}`);
    if (status === "success") return jobs;
    if (status === "failed") throw new Error(`Job failed: ${JSON.stringify(jobs.map(j=>j.errorMessage||j.error)).slice(0,500)}`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timeout for ${label}`);
}

async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = jobs.map(j => ({ jobApsId: j.id || j.jobId, url: j.downloadUrl || j.download_url || j.url })).filter(j => j.url);
  if (urls.length > 0) return urls;
  for (const job of jobs) {
    const jobApsId = job.id || job.jobId; if (!jobApsId) continue;
    const listing = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`);
    const files = Array.isArray(listing) ? listing : Array.isArray(listing.results) ? listing.results : [];
    const zipFile = files.find(f => String(f.name || "").endsWith(".zip"));
    if (!zipFile?.name) continue;
    const data = await dcFetch(accessToken, `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zipFile.name)}`);
    const url = data.signedUrl || data.downloadUrl || data.url;
    if (url) urls.push({ jobApsId, url });
  }
  return urls;
}

async function updateBackfillProgress(prisma, projectIds, startDate, endDate) {
  for (const pid of projectIds) {
    const prev = await prisma.accDcBackfillProgress.findUnique({ where: { projectId: pid } });
    let pca = prev?.projectCreatedAt || null;
    if (!pca) { const p = await prisma.accDcProject.findUnique({ where: { id: pid }, select: { createdAt: true } }); pca = p?.createdAt ?? startDate; }
    const ec = prev?.earliestCovered ? (startDate < prev.earliestCovered ? startDate : prev.earliestCovered) : startDate;
    const lc = prev?.latestCovered ? (endDate > prev.latestCovered ? endDate : prev.latestCovered) : endDate;
    await prisma.accDcBackfillProgress.upsert({
      where: { projectId: pid },
      create: { projectId: pid, earliestCovered: ec, latestCovered: lc, projectCreatedAt: pca, newProjectFlag: false },
      update: { earliestCovered: ec, latestCovered: lc, projectCreatedAt: pca, newProjectFlag: false },
    });
  }
}

async function processBatch(prisma, accountId, accessToken, batch) {
  const { label, requestId, projectIds, startDate, endDate, dbRowId } = batch;
  const jobs = await waitForSuccess(accountId, requestId, accessToken, label);
  const urls = await resolveDownloadUrls(accountId, jobs, accessToken);

  if (urls.length === 0) {
    log(`[${label}] No ZIP — zero activity in window`);
    await prisma.accDataConnectorJob.update({ where: { id: dbRowId }, data: { status: "success", completedAt: new Date(), errorMessage: "No data" } });
    await updateBackfillProgress(prisma, projectIds, new Date(startDate), new Date(endDate));
    return { label, rowsByFile: {}, unresolved: 0 };
  }

  await prisma.accDataConnectorJob.update({ where: { id: dbRowId }, data: { status: "running" } });
  const { ingestActivityZip } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "ingestActivityZip.ts"));
  const totals = { rowsByFile: {}, unresolved: 0 };
  for (const { url } of urls) {
    try {
      const result = await ingestActivityZip(url, prisma, dbRowId);
      for (const [f, c] of Object.entries(result.rowsByFile)) totals.rowsByFile[f] = (totals.rowsByFile[f] || 0) + c;
      totals.unresolved += result.unresolved;
    } catch (err) { logErr(`[${label}] ZIP error: ${err.message}`); }
  }

  await prisma.accDataConnectorJob.update({ where: { id: dbRowId }, data: { status: "success", completedAt: new Date(), errorMessage: null, downloadUrl: urls[0]?.url || null } });
  await updateBackfillProgress(prisma, projectIds, new Date(startDate), new Date(endDate));
  return { label, ...totals };
}

function chunk(arr, size) { const r = []; for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size)); return r; }

async function main() {
  const prisma = createPrisma();
  const results = [];

  try {
    log("=== OPTION C RESUME: Reuse B1 + Submit ZD batches ===");
    const accountId = await resolveAccountId(prisma);
    let accessToken = await refreshAccessToken(prisma);

    // ── Reuse B1 ──
    const b1Existing = await prisma.accDataConnectorJob.findFirst({ where: { requestId: B1_REQUEST_ID } });
    let b1Row;
    if (b1Existing) {
      b1Row = b1Existing;
      await prisma.accDataConnectorJob.update({ where: { id: b1Row.id }, data: { status: "pending", errorMessage: null } });
      log(`Reusing B1 job ${b1Row.id} for request ${B1_REQUEST_ID}`);
    } else {
      b1Row = await prisma.accDataConnectorJob.create({
        data: { requestId: B1_REQUEST_ID, status: "pending", serviceGroups: ["activities", "admin"], dateRange: "CUSTOM 2026-02-22 2026-04-22" },
      });
      log(`Created B1 job ${b1Row.id} for request ${B1_REQUEST_ID}`);
    }

    // Get the 50 backfill project IDs (same set that was submitted)
    const actCounts = await prisma.$queryRawUnsafe(
      `SELECT "projectId", COUNT(*)::int as cnt FROM "AccActivity" WHERE "projectId" IS NOT NULL GROUP BY "projectId" HAVING COUNT(*) > 0 ORDER BY cnt DESC`
    );
    const activeIds = new Set(actCounts.map(r => r.projectId));
    const validProjects = await prisma.accDcProject.findMany({ select: { id: true, name: true } });
    const validIds = new Set(validProjects.map(p => p.id));
    const bfRows = await prisma.accDcBackfillProgress.findMany();
    const bfMap = new Map(bfRows.map(b => [b.projectId, b]));

    const needsBackfill = [...activeIds].filter(id => {
      if (!validIds.has(id)) return false;
      const bf = bfMap.get(id);
      if (!bf) return true;
      return (new Date(bf.latestCovered) - new Date(bf.earliestCovered)) / 86400000 < 50;
    });

    // B1 used the first 50
    const b1ProjectIds = needsBackfill.slice(0, 50);
    const bfStart = "2026-02-22T00:00:00.000Z", bfEnd = "2026-04-22T00:00:00.000Z";

    const batches = [
      { label: "B1-BF(50)", requestId: B1_REQUEST_ID, projectIds: b1ProjectIds, startDate: bfStart, endDate: bfEnd, dbRowId: b1Row.id }
    ];

    // ── Zero-data projects: submit up to 5 batches of 50 ──
    const zeroData = validProjects.filter(p => !activeIds.has(p.id));
    const zdIds = zeroData.map(p => p.id);
    const zdChunks = chunk(zdIds, MAX_PER_REQUEST).slice(0, 5); // max 5 new requests
    const zdStart = "2026-02-22T00:00:00.000Z", zdEnd = "2026-05-22T00:00:00.000Z";

    log(`Zero-data: ${zeroData.length} projects → ${zdChunks.length} batches of ≤50`);

    let submitted = 0;
    for (let i = 0; i < zdChunks.length; i++) {
      const ch = zdChunks[i];
      const batchNum = i + 2;
      log(`Submitting B${batchNum}: ${ch.length} zero-data projects`);

      const result = await submitRequestSafe(accountId, accessToken, ch, `OptC-B${batchNum} ZD ${ch.length}p`, zdStart, zdEnd);
      if (!result.ok) {
        logErr(`  B${batchNum} skipped: ${result.error}`);
        continue;
      }

      const row = await prisma.accDataConnectorJob.create({
        data: { requestId: result.requestId, status: "pending", serviceGroups: ["activities", "admin"], dateRange: `CUSTOM ${zdStart} ${zdEnd}` },
      });
      batches.push({ label: `B${batchNum}-ZD(${ch.length})`, requestId: result.requestId, projectIds: ch, startDate: zdStart, endDate: zdEnd, dbRowId: row.id });
      log(`  → ${result.requestId}`);
      submitted++;
      await new Promise(r => setTimeout(r, 2000));
    }

    log(`\n✅ ${submitted} new requests submitted + 1 reused = ${batches.length} total. Polling...\n`);

    // ── Process each batch ──
    for (const b of batches) {
      try {
        accessToken = await refreshAccessToken(prisma);
        log(`\n>>> ${b.label}...`);
        const r = await processBatch(prisma, accountId, accessToken, b);
        results.push(r);
        const t = Object.values(r.rowsByFile || {}).reduce((s, c) => s + c, 0);
        log(`<<< ${b.label}: ${t.toLocaleString()} rows`);
      } catch (err) {
        logErr(`!!! ${b.label} FAILED: ${err.message}`);
        await prisma.accDataConnectorJob.update({ where: { id: b.dbRowId }, data: { status: "failed", completedAt: new Date(), errorMessage: err.message.slice(0, 1000) } }).catch(() => {});
        results.push({ label: b.label, error: err.message });
      }
    }

    // ── Summary ──
    console.log("\n========== OPTION C FINAL RESULTS ==========");
    let grand = 0;
    for (const r of results) {
      if (r.error) { console.log(`  FAIL ${r.label}: ${r.error.slice(0, 200)}`); }
      else {
        const t = Object.values(r.rowsByFile || {}).reduce((s, c) => s + c, 0);
        grand += t;
        console.log(`  OK   ${r.label}: ${t.toLocaleString()} rows`);
        for (const [f, c] of Object.entries(r.rowsByFile || {})) if (c > 0) console.log(`         ${f}: ${c.toLocaleString()}`);
      }
    }
    console.log(`\n  GRAND TOTAL: ${grand.toLocaleString()} new rows ingested`);
    console.log("========== COMPLETE ==========");
  } catch (err) {
    logErr(`Fatal: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
