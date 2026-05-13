/**
 * Railway cron entry point — Stage 2 of Deep Sync.
 *
 * Schedule: every 30 min (cron "*\/30 * * * *") — configured via Railway dashboard.
 *
 * Lifecycle (Phase 1 owns submission; this script owns ingest):
 *   1. Find AccDataConnectorJob rows where status IN ('pending', 'running').
 *   2. For each (sequential, no parallelism — see RESEARCH Pitfall 3):
 *      a. Poll APS GET /requests/:requestId/jobs for terminal status.
 *      b. On "success": mark row 'running' with ingestStartedAt, run streaming
 *         ingest into AccActivity, mark row 'success' with completedAt + rowsByFile JSON.
 *      c. On "failed"/"cancelled": mark row 'failed' with error message.
 *      d. Otherwise (still pending/running APS-side): leave row alone for next tick.
 *   3. On 403 from signed S3 URL: re-poll APS once for a fresh URL (Pitfall 2).
 *
 * Overlap guard: skip any candidate row where status='running' AND ingestStartedAt
 * is within the last 60min — assume a concurrent ingest worker or in-flight stream.
 * Stuck workers older than 60min are reclaimable.
 *
 * Flags:
 *   --dry-run  Poll APS and log decisions, but do not mutate the DB or ingest.
 *
 * Pure CommonJS shell that registers tsx's loader hook so the heavy lifting can
 * live in lib/acc/ingestActivityZip.ts (TypeScript).
 */

const path = require("node:path");
const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

// Register tsx so we can require() the TS helper directly.
require("tsx/cjs");

// Optional CLI flag.
const DRY_RUN = process.argv.includes("--dry-run");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const STUCK_LOCK_MINUTES = 60;
const OPERATOR_EMAIL = "luis.ecorteg@gmail.com";

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[deep-sync-ingest ${ts()}]`, ...args);
}

function logErr(...args) {
  console.error(`[deep-sync-ingest ${ts()}]`, ...args);
}

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const adapter = new PrismaPg({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

async function fetchAutodeskToken() {
  const clientId = process.env.APS_CLIENT_ID && process.env.APS_CLIENT_ID.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET && process.env.APS_CLIENT_SECRET.trim();
  if (!clientId || !clientSecret) {
    throw new Error("APS_CLIENT_ID / APS_CLIENT_SECRET not configured");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const raw = await res.text();
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) {
    throw new Error(`Autodesk token fetch failed: HTTP ${res.status} ${raw}`);
  }
  return json.access_token;
}

async function resolveAccountId(prisma) {
  const hub = await prisma.project.findFirst({ select: { apsHubId: true } });
  if (!hub || !hub.apsHubId) throw new Error("APS_HUB_ID is not configured");
  return String(hub.apsHubId).replace(/^b\./, "");
}

/**
 * Poll APS for the status of a Data Connector request.
 * Returns: { status, jobs: [{ id, status, downloadUrl?, ... }] }
 *
 * APS endpoint: GET /requests/:requestId/jobs
 * Response shape (HOW_TO_Extract_Activity_Logs.md):
 *   - At least one "job" per request; on success, each job exposes a signed
 *     downloadUrl (different URL per service group: "activities", "admin").
 */
async function pollApsJob(requestId, accountId, accessToken) {
  const url = `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${requestId}/jobs`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await res.text();
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok) {
    throw new Error(`APS GET /jobs failed: HTTP ${res.status} ${raw}`);
  }
  // Some APS responses wrap in { jobs: [...] }, others return an array.
  const jobs = Array.isArray(json)
    ? json
    : Array.isArray(json.jobs)
      ? json.jobs
      : Array.isArray(json.results)
        ? json.results
        : [];
  return { jobs, raw: json };
}

/**
 * Reduce APS job array → single status:
 *   - "success" only if ALL jobs are complete.
 *   - "failed" if any job is failed/cancelled.
 *   - "running" otherwise.
 */
function reduceJobStatus(jobs) {
  if (jobs.length === 0) return "running";
  const norm = jobs.map((j) =>
    String(j.completionStatus || j.status || j.state || "").toLowerCase()
  );
  if (norm.some((s) => s === "failed" || s === "cancelled" || s === "canceled" || s === "error")) {
    return "failed";
  }
  if (norm.every((s) => s === "success" || s === "complete" || s === "completed")) {
    return "success";
  }
  return "running";
}

function extractDownloadUrls(jobs) {
  const urls = [];
  for (const j of jobs) {
    const url = j.downloadUrl || j.download_url || j.url;
    if (url) urls.push({ jobApsId: j.id || j.jobId || null, url });
  }
  return urls;
}

async function resolveDownloadUrls(jobs, accountId, accessToken) {
  const urls = extractDownloadUrls(jobs);
  if (urls.length > 0) return urls;

  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;

    const listingRes = await fetch(
      `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data-listing`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listingRaw = await listingRes.text();
    let listingJson;
    try { listingJson = listingRaw ? JSON.parse(listingRaw) : {}; } catch { listingJson = {}; }
    if (!listingRes.ok) {
      throw new Error(`APS GET /jobs/${jobApsId}/data-listing failed: HTTP ${listingRes.status} ${listingRaw}`);
    }

    const files = Array.isArray(listingJson)
      ? listingJson
      : Array.isArray(listingJson.results)
        ? listingJson.results
        : [];
    const zipFile = files.find((file) => String(file.name || "").endsWith(".zip"));
    if (!zipFile?.name) continue;

    const dataRes = await fetch(
      `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobApsId}/data/${encodeURIComponent(zipFile.name)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const dataRaw = await dataRes.text();
    let dataJson;
    try { dataJson = dataRaw ? JSON.parse(dataRaw) : {}; } catch { dataJson = {}; }
    if (!dataRes.ok) {
      throw new Error(`APS GET /jobs/${jobApsId}/data/${zipFile.name} failed: HTTP ${dataRes.status} ${dataRaw}`);
    }
    const url = dataJson.signedUrl || dataJson.downloadUrl || dataJson.url;
    if (url) urls.push({ jobApsId, url });
  }

  return urls;
}

/**
 * Overlap guard: a row is "claimed by another worker" if it's in 'running' state
 * with ingestStartedAt within STUCK_LOCK_MINUTES. Anything older is reclaimable.
 *
 * Plan 01 did NOT add an `ingestStartedAt` column — the AccDataConnectorJob model
 * has `startedAt` (job submission time) and `completedAt`. We use `startedAt` as
 * a coarse proxy: a row that's been 'running' for < 60min is presumed in-flight.
 * Acceptable because Plan 01's `running` is only set BY this script.
 */
function isLockedByConcurrentWorker(row) {
  if (row.status !== "running") return false;
  if (!row.startedAt) return false;
  const ageMin = (Date.now() - new Date(row.startedAt).getTime()) / 60_000;
  return ageMin < STUCK_LOCK_MINUTES;
}

async function findCandidates(prisma) {
  return prisma.accDataConnectorJob.findMany({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { startedAt: "asc" },
  });
}

async function processCandidate(row, ctx) {
  const { prisma, accountId, accessToken } = ctx;
  log(`Polling APS for request ${row.requestId} (status=${row.status})…`);

  let poll;
  try {
    poll = await pollApsJob(row.requestId, accountId, accessToken);
  } catch (err) {
    logErr(`Poll failed for ${row.requestId}:`, err && err.message ? err.message : err);
    return { decision: "poll-error", row };
  }

  const apsStatus = reduceJobStatus(poll.jobs);
  log(`Request ${row.requestId} APS-side status: ${apsStatus} (${poll.jobs.length} jobs)`);

  if (apsStatus === "failed") {
    if (DRY_RUN) return { decision: "would-mark-failed", row };
    const errorJob = poll.jobs.find((j) => /fail|cancel|error/i.test(String(j.status || j.state || "")));
    const errorMsg = errorJob ? String(errorJob.errorMessage || errorJob.error || errorJob.status || "APS reported failure") : "APS reported failure";
    await prisma.accDataConnectorJob.update({
      where: { id: row.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: errorMsg },
    });
    log(`Marked ${row.requestId} as failed: ${errorMsg}`);
    return { decision: "marked-failed", row };
  }

  if (apsStatus !== "success") {
    // Still pending APS-side — leave the row alone, next cron tick re-polls.
    log(`Request ${row.requestId} still in-flight at APS; no action.`);
    return { decision: "still-pending", row };
  }

  // APS reports success → ingest each downloadable job.
  const urls = await resolveDownloadUrls(poll.jobs, accountId, accessToken);
  if (urls.length === 0) {
    log(`Request ${row.requestId} reports success but exposes no downloadUrl; skipping.`);
    return { decision: "no-download-url", row };
  }

  if (DRY_RUN) {
    log(`[dry-run] Would ingest ${urls.length} signed URL(s) for ${row.requestId}.`);
    return { decision: "would-ingest", row, urls: urls.length };
  }

  // Mark the row 'running' before downloading, so a concurrent cron tick skips us.
  await prisma.accDataConnectorJob.update({
    where: { id: row.id },
    data: { status: "running" },
  });

  let { ingestActivityZip } = require(path.resolve(__dirname, "..", "lib", "acc", "ingestActivityZip.ts"));

  const rowsByFile = {};
  let unresolvedTotal = 0;

  try {
    for (const { jobApsId, url } of urls) {
      let result;
      try {
        result = await ingestActivityZip(url, prisma, row.id);
      } catch (err) {
        // 403 on signed URL → re-poll APS once for fresh URL (Pitfall 2).
        const msg = err && err.message ? err.message : String(err);
        if (/\b403\b/.test(msg)) {
          log(`Got 403 on signed URL; re-polling APS for fresh URL…`);
          const repoll = await pollApsJob(row.requestId, accountId, accessToken);
          const fresh = await resolveDownloadUrls(repoll.jobs, accountId, accessToken);
          const freshUrl =
            fresh.find((u) => u.jobApsId === jobApsId && u.url !== url)?.url ||
            fresh.find((u) => u.url !== url)?.url;
          if (!freshUrl) throw err;
          result = await ingestActivityZip(freshUrl, prisma, row.id);
        } else {
          throw err;
        }
      }
      for (const [file, n] of Object.entries(result.rowsByFile)) {
        rowsByFile[file] = (rowsByFile[file] || 0) + n;
      }
      unresolvedTotal += result.unresolved;
    }

    const summary = `rowsByFile=${JSON.stringify(rowsByFile)} unresolved=${unresolvedTotal}`;
    await prisma.accDataConnectorJob.update({
      where: { id: row.id },
      data: {
        status: "success",
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    // Surface a one-line summary into SyncMeta('deep').lastError when success
    // (re-purposed as latest-run notes for the freshness pill).
    await prisma.syncMeta.upsert({
      where: { id: "deep" },
      create: {
        id: "deep",
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: summary,
      },
      update: {
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: summary,
      },
    });
    log(`Ingest complete for ${row.requestId}: ${summary}`);
    return { decision: "ingested", row, rowsByFile, unresolvedTotal };
  } catch (err) {
    const errorMsg = err && err.message ? err.message : String(err);
    logErr(`Ingest failed for ${row.requestId}:`, errorMsg);
    await prisma.accDataConnectorJob.update({
      where: { id: row.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: errorMsg },
    });
    await prisma.syncMeta
      .upsert({
        where: { id: "deep" },
        create: { id: "deep", lastRunAt: new Date(), lastStatus: "failed", lastError: errorMsg },
        update: { lastRunAt: new Date(), lastStatus: "failed", lastError: errorMsg },
      })
      .catch(() => {});
    return { decision: "ingest-failed", row, error: errorMsg };
  }
}

async function main() {
  log(`Starting Stage-2 Deep Sync ingest${DRY_RUN ? " (DRY RUN)" : ""}…`);
  const prisma = createPrisma();
  let exitCode = 0;
  try {
    const candidates = await findCandidates(prisma);
    if (candidates.length === 0) {
      log("No pending or running AccDataConnectorJob rows; nothing to do.");
      return;
    }
    log(`Found ${candidates.length} candidate job row(s).`);

    // Filter out rows locked by a concurrent worker.
    const ready = candidates.filter((c) => {
      if (isLockedByConcurrentWorker(c)) {
        log(`Skipping ${c.requestId} — locked by concurrent worker (started ${c.startedAt}).`);
        return false;
      }
      return true;
    });
    if (ready.length === 0) {
      log("All candidates are locked by concurrent workers; nothing to do.");
      return;
    }

    // Resolve APS credentials once (shared across all candidates).
    const accessToken = await fetchAutodeskToken();
    const accountId = await resolveAccountId(prisma);

    for (const row of ready) {
      try {
        await processCandidate(row, { prisma, accessToken, accountId });
      } catch (err) {
        logErr(`Unhandled error processing ${row.requestId}:`, err && err.message ? err.message : err);
        exitCode = 1;
      }
    }
  } catch (err) {
    logErr("Fatal:", err && err.message ? err.message : err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
  log(`Done. exit=${exitCode}`);
  process.exit(exitCode);
}

main().catch((err) => {
  logErr("Fatal (uncaught):", err);
  process.exit(1);
});

// Silence unused-var lint
void OPERATOR_EMAIL;
