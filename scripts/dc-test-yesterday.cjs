#!/usr/bin/env node
/**
 * One-shot Data Connector test ingest — YESTERDAY only.
 *
 * Submits a single Data Connector request for service groups [activities, admin]
 * with dateRange=YESTERDAY, polls until completion, downloads each signed-URL
 * ZIP, and streams it through ingestActivityZip into AccActivity.
 *
 * SAFETY:
 *   - INSERT-only (createMany skipDuplicates). Never updates or deletes existing rows.
 *   - Uses Luis's stored 3-leg user token (data:create scope) — never 2-leg.
 *   - Idempotent: re-running submits a fresh request but the @@unique key on
 *     AccActivity prevents duplicate rows.
 *
 * Run: node --env-file=.env scripts/dc-test-yesterday.cjs
 */

const path = require("node:path");

// Register tsx so we can require ingestActivityZip.ts directly.
require("tsx/cjs");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";

const USER_EMAIL = "luis.cortes@hermosillo.com";
const POLL_INTERVAL_MS = 30_000; // 30s
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const DESCRIPTION = "Dashboard yesterday test 2026-05-12";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-test ${ts()}]`, ...args); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const adapter = new PrismaPg({ connectionString: url, max: 2 });
  return new PrismaClient({ adapter, log: ["error"] });
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "openid data:read data:create viewables:read user:read account:read",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: json.expires_in ? Math.floor(Date.now() / 1000) + json.expires_in : null,
    scope: json.scope ?? null,
  };
}

async function getUserToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct?.access_token || !acct.refresh_token) {
    throw new Error(`No Autodesk account/tokens stored for ${USER_EMAIL}`);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  // Refresh if within 5 min of expiry (defensive). Also always refresh since the
  // probe earlier today already rotated the access_token — keeps things predictable.
  const needRefresh = !acct.expires_at || acct.expires_at < nowSec + 300;
  if (!needRefresh) {
    log("Using stored access_token (still fresh).");
    return acct.access_token;
  }
  log("Refreshing access token…");
  const fresh = await refreshAccessToken(acct.refresh_token);
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: fresh.accessToken,
      refresh_token: fresh.refreshToken,
      expires_at: fresh.expiresAt,
      scope: fresh.scope,
    },
  });
  log("Token refreshed and saved.");
  return fresh.accessToken;
}

async function resolveAccountId() {
  const hub = process.env.APS_HUB_ID;
  if (!hub) throw new Error("APS_HUB_ID is not set");
  return hub.replace(/^b\./, "");
}

async function submitRequest(accountId, accessToken) {
  const url = `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`;
  // Per APS POST /requests spec: users with project-admin permissions MUST pass
  // projectIdList. Luis has HQ v1 role=account_admin which Data Connector treats
  // as project admin (not Executive Overview). Pass the test project for the
  // first run to verify the flow end-to-end.
  const projectIds = (process.env.DC_PROJECT_IDS || "8cb39392-56ac-42dd-a58d-3339137dcbdb")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ONE_TIME extracts cannot use predefined dateRange values (YESTERDAY/PAST_7_DAYS/etc.)
  // — APS rejects those as "should be used within scheduled extractions". Must use
  // CUSTOM with explicit startDate + endDate. Compute "yesterday in UTC" as a full
  // 00:00:00 → 23:59:59.999 window.
  const now = new Date();
  const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = new Date(utcToday.getTime() - 24 * 60 * 60 * 1000);
  const endDate = new Date(utcToday.getTime() - 1);

  const body = {
    description: DESCRIPTION,
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: ["activities", "admin"],
    dateRange: "CUSTOM",
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    projectIdList: projectIds,
  };
  log(`projectIdList (${projectIds.length}): ${JSON.stringify(projectIds)}`);
  log(`date window: ${startDate.toISOString()} → ${endDate.toISOString()}`);
  log("Submitting DC request:", JSON.stringify(body));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`POST /requests failed: HTTP ${res.status} ${text}`);
  }
  const requestId = json.id || json.requestId;
  if (!requestId) throw new Error(`POST /requests returned no id: ${text}`);
  log(`Submitted. requestId=${requestId}`);
  return { requestId, raw: json };
}

async function pollJobs(requestId, accountId, accessToken) {
  const url = `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`GET /jobs failed: HTTP ${res.status} ${text}`);
  const jobs = Array.isArray(json) ? json : Array.isArray(json.jobs) ? json.jobs : Array.isArray(json.results) ? json.results : [];
  return jobs;
}

function summarizeJobStatuses(jobs) {
  return jobs.map((j) => `${j.id || j.jobId || "?"}=${j.status || j.state || "?"}`).join(", ");
}

function reduceStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const norm = jobs.map((j) => String(j.status || j.state || "").toLowerCase());
  if (norm.some((s) => /fail|cancel|error/.test(s))) return "failed";
  if (norm.every((s) => /success|complete/.test(s))) return "success";
  return "running";
}

function extractDownloadUrls(jobs) {
  return jobs
    .map((j) => ({ jobId: j.id || j.jobId, url: j.downloadUrl || j.download_url || j.url }))
    .filter((j) => j.url);
}

async function pollUntilDone(requestId, accountId, accessToken) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const jobs = await pollJobs(requestId, accountId, accessToken);
    const status = reduceStatus(jobs);
    log(`Status: ${status} (${jobs.length} jobs) [${summarizeJobStatuses(jobs)}]`);
    if (status === "success") return jobs;
    if (status === "failed") throw new Error(`APS job failed: ${summarizeJobStatuses(jobs)}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Polling timed out after 30 minutes");
}

async function main() {
  log("=== Data Connector YESTERDAY test ingest ===");
  const prisma = createPrisma();
  let dcJobRow = null;

  try {
    const accountId = await resolveAccountId();
    log(`Account ID: ${accountId}`);

    const accessToken = await getUserToken(prisma);
    log(`Got 3-leg access token (length ${accessToken.length}).`);

    // Step 1: submit
    const { requestId } = await submitRequest(accountId, accessToken);

    // Step 2: persist job row before polling
    dcJobRow = await prisma.accDataConnectorJob.create({
      data: {
        requestId,
        status: "pending",
        serviceGroups: ["activities", "admin"],
        dateRange: "YESTERDAY",
      },
    });
    log(`Saved AccDataConnectorJob ${dcJobRow.id}.`);

    // Step 3: poll
    const jobs = await pollUntilDone(requestId, accountId, accessToken);
    const urls = extractDownloadUrls(jobs);
    if (urls.length === 0) {
      log("Job reports success but no download URLs returned. Nothing to ingest.");
      await prisma.accDataConnectorJob.update({
        where: { id: dcJobRow.id },
        data: { status: "success", completedAt: new Date() },
      });
      return;
    }
    log(`Got ${urls.length} signed download URL(s).`);

    // Step 4: ingest each (insert-only via createMany skipDuplicates)
    const { ingestActivityZip } = require(path.resolve(__dirname, "..", "lib", "acc", "ingestActivityZip.ts"));
    const totals = { rowsByFile: {}, unresolved: 0 };
    for (const { url } of urls) {
      log(`Ingesting from signed URL…`);
      const result = await ingestActivityZip(url, prisma, dcJobRow.id);
      for (const [file, n] of Object.entries(result.rowsByFile)) {
        totals.rowsByFile[file] = (totals.rowsByFile[file] || 0) + n;
      }
      totals.unresolved += result.unresolved;
    }

    // Step 5: mark success
    await prisma.accDataConnectorJob.update({
      where: { id: dcJobRow.id },
      data: {
        status: "success",
        completedAt: new Date(),
        downloadUrl: urls[0]?.url ?? null,
      },
    });

    log("=== INGEST COMPLETE ===");
    log(`Rows by file: ${JSON.stringify(totals.rowsByFile)}`);
    log(`Unresolved attributions: ${totals.unresolved}`);

    // Read back a row count to confirm the data landed.
    const accActivityCount = await prisma.accActivity.count();
    log(`Total AccActivity rows in DB after ingest: ${accActivityCount}`);
  } catch (err) {
    log(`ERROR: ${err.message || err}`);
    if (dcJobRow) {
      await prisma.accDataConnectorJob
        .update({
          where: { id: dcJobRow.id },
          data: { status: "failed", completedAt: new Date(), errorMessage: String(err.message || err) },
        })
        .catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
