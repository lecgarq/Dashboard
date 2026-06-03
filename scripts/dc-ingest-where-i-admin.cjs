#!/usr/bin/env node
/**
 * Data Connector ingest — all projects where Luis is Project Admin.
 *
 * Pulls the projectAdmin list from the Construction Admin API, batches it
 * into groups of 50 (DC's projectIdList limit), and for each batch:
 *   1. POST /requests with CUSTOM dateRange covering the last N days
 *   2. Save an AccDataConnectorJob row
 *   3. Poll /jobs until completionStatus=success (or timeout/fail)
 *   4. GET /data-listing → per-file signed URL → stream-parse CSV → bulk insert
 *
 * INSERT-only into AccActivity (createMany skipDuplicates). Re-running is safe.
 *
 * Sequential per batch (no parallelism) to stay under DC's 10 req/min rate limit.
 * Token is refreshed up-front and saved back to the DB.
 *
 * Run:
 *   node --env-file=.env scripts/dc-ingest-where-i-admin.cjs            # PAST_30_DAYS, active+archived
 *   DC_DAYS=7 node ... scripts/dc-ingest-where-i-admin.cjs              # last 7 days
 *   DC_BATCH_LIMIT=2 node ... scripts/dc-ingest-where-i-admin.cjs       # test mode: only first 2 batches
 *   DC_ACTIVE_ONLY=1 node ... scripts/dc-ingest-where-i-admin.cjs       # active projects only
 *   DC_RESUME=1 node ... scripts/dc-ingest-where-i-admin.cjs            # process pending/running rows only
 */

const { parse } = require("csv-parse");
const { Readable } = require("node:stream");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DC_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";

const USER_EMAIL = "luis.cortes@hermosillo.com";
const LUIS_ACC_USER_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour per batch
const PROJECT_BATCH = 50; // APS hard limit on projectIdList
const BATCH_LIMIT = parseInt(process.env.DC_BATCH_LIMIT || "0", 10) || Infinity;
const DAYS = parseInt(process.env.DC_DAYS || "30", 10);
const ACTIVE_ONLY = process.env.DC_ACTIVE_ONLY === "1";
const RESUME_ONLY = process.env.DC_RESUME === "1";

const SERVICE_GROUPS = ["activities", "admin"];

// Activity CSV file names emitted by DC — covers all services we care about.
// The "activities_*_activities.csv" naming is the actual schema (not what HOW_TO suggested).
// Capture group exposes the module name for the `service` column derivation.
const ACTIVITY_FILE_RE = /^activities_([a-z_]+)_activities\.csv$/i;

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-batch ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[dc-batch ${ts()}]`, ...args); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

// ---------------------------------------------------------------------------
// Token handling — 3-leg user context (Luis)
// ---------------------------------------------------------------------------

async function refreshUserToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct?.refresh_token) {
    throw new Error(`No refresh_token in DB for ${USER_EMAIL}. Log in via Autodesk OAuth.`);
  }
  // If still fresh, reuse
  const nowSec = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) {
    return acct.access_token;
  }
  log("Refreshing 3-leg token…");
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
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`User token refresh failed (${res.status}): ${JSON.stringify(json)}`);
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
  log("User token refreshed.");
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

// ---------------------------------------------------------------------------
// Discover projects
// ---------------------------------------------------------------------------

async function listProjectAdminProjects(accountId, token2Leg) {
  // NOTE: the filter[accessLevel]=projectAdmin server-side filter is misleading —
  // it returns projects where the user has projectAdmin OR projectMember access.
  // We must filter LOCALLY on accessLevels.projectAdmin === true.
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

// ---------------------------------------------------------------------------
// DC request lifecycle
// ---------------------------------------------------------------------------

async function dcSubmit(accountId, userToken, projectIds, startDate, endDate, description) {
  const body = {
    description,
    scheduleInterval: "ONE_TIME",
    effectiveFrom: new Date().toISOString(),
    serviceGroups: SERVICE_GROUPS,
    dateRange: "CUSTOM",
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    projectIdList: projectIds,
  };
  // APS DC backend occasionally returns 504 Gateway Timeout on first attempt.
  // Retry up to 4 times with exponential backoff for 5xx errors only.
  const maxAttempts = 4;
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    attempt++;
    const res = await fetch(`${DC_BASE}/accounts/${accountId}/requests`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (res.ok) {
      const requestId = json.id || json.requestId;
      if (!requestId) throw new Error(`POST /requests OK but no id: ${JSON.stringify(json).slice(0, 200)}`);
      return requestId;
    }
    const summary = typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200);
    if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
      const backoffSec = Math.pow(2, attempt) * 5; // 10s, 20s, 40s, 80s
      log(`POST /requests ${res.status} (attempt ${attempt}/${maxAttempts}); retrying in ${backoffSec}s. ${summary}`);
      await new Promise((r) => setTimeout(r, backoffSec * 1000));
      lastErr = `${res.status}: ${summary}`;
      continue;
    }
    throw new Error(`POST /requests ${res.status}: ${summary}`);
  }
  throw new Error(`POST /requests gave up after ${maxAttempts} attempts. Last: ${lastErr}`);
}

async function dcPollJobs(accountId, userToken, requestId) {
  const res = await fetch(`${DC_BASE}/accounts/${accountId}/requests/${requestId}/jobs`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`GET /jobs ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200)}`);
  return json.results || json.jobs || (Array.isArray(json) ? json : []);
}

function reduceJobsStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const norm = jobs.map((j) => ({
    status: String(j.status || "").toLowerCase(),
    completionStatus: String(j.completionStatus || "").toLowerCase(),
  }));
  if (norm.some((j) => /fail|cancel|error/.test(j.completionStatus))) return "failed";
  if (norm.every((j) => j.status === "complete" && j.completionStatus === "success")) return "success";
  return "running";
}

async function dcDataListing(accountId, userToken, jobId) {
  const res = await fetch(`${DC_BASE}/accounts/${accountId}/jobs/${jobId}/data-listing`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`GET /data-listing ${res.status}: ${text.slice(0, 200)}`);
  return Array.isArray(json) ? json : json.results || [];
}

async function dcSignedUrl(accountId, userToken, jobId, name) {
  const res = await fetch(`${DC_BASE}/accounts/${accountId}/jobs/${jobId}/data/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GET /data/${name} ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.url || json.signedUrl || json.downloadUrl;
}

// ---------------------------------------------------------------------------
// CSV ingest → AccActivity
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

function mapRow(row, sourceFile, drops, moduleName, ingestRunId) {
  // Bug D fix (2026-05-19): real per-module schema uses BIM360-native columns:
  //   created_by      -> autodeskId (12-char APS user ID, e.g. "ESX2N8HJL88XVK2B")
  //   activity_verb   -> rawAction  (e.g. "view-entity", "issue-view")
  //   bim360_project_id -> projectId
  //   created_at      -> createdAt
  // Legacy aliases preserved for backward compatibility with old single-file
  // exports / mocked test fixtures. user_email is NOT in the new schema; it
  // gets backfilled by scripts/backfill-acc-activity-emails.cjs.
  const autodeskId = row.created_by || row.autodesk_id || row.autodeskId || row.user_id || row.userId || row.actor_id || row.actorId || "";
  const rawAction = row.activity_verb || row.raw_action || row.action || row.action_type || row.actionType || "";
  const createdAtRaw = row.created_at || row.createdAt || row.timestamp || row.event_time || "";
  if (!autodeskId) { drops.missingActor++; return null; }
  if (!rawAction) { drops.missingAction++; return null; }
  if (!createdAtRaw) { drops.missingDate++; return null; }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) { drops.invalidDate++; return null; }
  const rawProjectId = row.bim360_project_id || row.project_id || row.projectId || "";
  const projectId = sourceFile === "admin" ? "" : rawProjectId || "";
  const userEmailRaw = row.user_email || row.userEmail || row.email || "";
  return {
    autodeskId,
    userEmail: userEmailRaw ? userEmailRaw.toLowerCase() : null,
    projectId,
    rawAction,
    // Per-module CSVs no longer carry a service column; derive from filename.
    service: moduleName || row.service || null,
    tool: row.tool || null,
    details: row.details || row.description || null,
    sourceFile,
    ingestRunId: ingestRunId ?? null,
    createdAt,
  };
}

async function ingestCsvFromUrl(prisma, signedUrl, fileName, ingestRunId, rowsByModule) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Signed URL fetch ${res.status} for ${fileName}`);
  const match = fileName.match(ACTIVITY_FILE_RE);
  const moduleName = match ? match[1].toLowerCase() : null;
  const sourceFile = moduleName === "admin" ? "admin" : "project";
  // bom:true strips the UTF-8 BOM that DC prefixes to the first header column
  // (`﻿activity_id`); without it the first column key is unreachable.
  const parser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_quotes: true });
  let inserted = 0;
  let parsed = 0;
  const drops = { missingActor: 0, missingAction: 0, missingDate: 0, invalidDate: 0 };
  let buf = [];
  const flush = async () => {
    if (buf.length === 0) return;
    const r = await prisma.accActivity.createMany({ data: buf, skipDuplicates: true });
    inserted += r.count;
    buf = [];
  };
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(parser);
    parser.on("data", (row) => {
      parsed++;
      const mapped = mapRow(row, sourceFile, drops, moduleName, ingestRunId);
      if (!mapped) return;
      buf.push(mapped);
      if (buf.length >= BATCH_SIZE) {
        parser.pause();
        flush().then(() => parser.resume()).catch(reject);
      }
    });
    parser.on("end", () => flush().then(resolve).catch(reject));
    parser.on("error", reject);
  });
  // Tally per-module inserts for AccDcIngestRun.rowsByModule telemetry.
  if (moduleName && rowsByModule && inserted > 0) {
    rowsByModule[moduleName] = (rowsByModule[moduleName] || 0) + inserted;
  }
  // Visible-failure policy: parsed-but-all-dropped is exactly the Bug D failure
  // mode that hid behind clean status for 5 days. Log per-reason drop counts so
  // schema drift surfaces in the daily log instead of looking like an idle day.
  const droppedTotal = drops.missingActor + drops.missingAction + drops.missingDate + drops.invalidDate;
  if (parsed > 0 && droppedTotal === parsed) {
    log(`  ${fileName}: WARN parsed=${parsed} ALL DROPPED (actor=${drops.missingActor} action=${drops.missingAction} date=${drops.missingDate} bad=${drops.invalidDate}) — likely CSV schema drift`);
  } else if (droppedTotal > 0) {
    log(`  ${fileName}: parsed=${parsed} dropped=${droppedTotal} (actor=${drops.missingActor} action=${drops.missingAction} date=${drops.missingDate} bad=${drops.invalidDate}) inserted=${inserted}`);
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// One batch — submit, poll, ingest
// ---------------------------------------------------------------------------

async function processBatch(prisma, accountId, batchIdx, batchTotal, projectIds, startDate, endDate, ctx) {
  const label = `batch ${batchIdx + 1}/${batchTotal}`;
  log(`${label} — ${projectIds.length} projects, ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`);

  let row = null;
  let userToken = await refreshUserToken(prisma);

  // 1. Submit
  // APS rejects punctuation in description; keep it alnum + space + dash.
  const safeLabel = label.replace(/[^a-zA-Z0-9 -]/g, "-");
  let requestId;
  try {
    requestId = await dcSubmit(accountId, userToken, projectIds, startDate, endDate,
      `dc-ingest ${ctx.runId} ${safeLabel}`);
  } catch (err) {
    logErr(`${label} submit failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
  log(`${label} requestId=${requestId}`);
  // Each successful POST /requests consumes one DC quota unit.
  if (ctx.stats) ctx.stats.requestsSubmitted++;

  // 2. Persist AccDataConnectorJob
  row = await prisma.accDataConnectorJob.create({
    data: {
      requestId,
      status: "pending",
      serviceGroups: SERVICE_GROUPS,
      dateRange: `CUSTOM(${startDate.toISOString().slice(0, 10)}→${endDate.toISOString().slice(0, 10)}) [${projectIds.length} projects]`,
    },
  });

  // 3. Poll
  const pollStart = Date.now();
  let jobs = [];
  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    try {
      userToken = await refreshUserToken(prisma); // refresh if needed
      jobs = await dcPollJobs(accountId, userToken, requestId);
    } catch (err) {
      logErr(`${label} poll error: ${err.message}`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    const status = reduceJobsStatus(jobs);
    log(`${label} status=${status} (${jobs.length} jobs)`);
    if (status === "success") break;
    if (status === "failed") {
      await prisma.accDataConnectorJob.update({
        where: { id: row.id },
        data: { status: "failed", completedAt: new Date(), errorMessage: "APS reported job failure" },
      });
      return { ok: false, error: "APS job failed" };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (reduceJobsStatus(jobs) !== "success") {
    await prisma.accDataConnectorJob.update({
      where: { id: row.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: "Polling timed out" },
    });
    return { ok: false, error: "Poll timeout" };
  }

  // 4. Re-read the row — another worker (e.g. scripts/dc-ingest-pending-3leg.cjs
  // run by codex/cron) may have already ingested this job. If so, skip our ingest
  // pass to avoid the race that produces +0 logs.
  const currentRow = await prisma.accDataConnectorJob.findUnique({ where: { id: row.id } });
  if (currentRow?.status === "success") {
    log(`${label} already ingested by another worker; skipping our ingest.`);
    return { ok: true, inserted: 0, note: "ingested by other worker" };
  }

  // 4. Ingest each job's activity CSVs
  let totalInserted = 0;
  for (const job of jobs) {
    if (job.completionStatus !== "success") continue;
    userToken = await refreshUserToken(prisma);
    const files = await dcDataListing(accountId, userToken, job.id);
    const activityFiles = files.filter((f) => ACTIVITY_FILE_RE.test(f.name));
    log(`${label} job ${job.id}: ${activityFiles.length}/${files.length} files match activity pattern`);

    for (const f of activityFiles) {
      try {
        userToken = await refreshUserToken(prisma);
        const signed = await dcSignedUrl(accountId, userToken, job.id, f.name);
        const inserted = await ingestCsvFromUrl(prisma, signed, f.name, ctx.stats?.dbRunId, ctx.stats?.rowsByModule);
        log(`${label}   ${f.name}: +${inserted} rows`);
        totalInserted += inserted;
      } catch (err) {
        logErr(`${label} ingest ${f.name} failed: ${err.message}`);
      }
    }
  }

  // 5. Mark success
  await prisma.accDataConnectorJob.update({
    where: { id: row.id },
    data: { status: "success", completedAt: new Date() },
  });
  log(`${label} DONE: +${totalInserted} rows`);
  return { ok: true, inserted: totalInserted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  log(`=== Data Connector hub-ingest (run ${runId}) ===`);
  log(`Config: DAYS=${DAYS}, ACTIVE_ONLY=${ACTIVE_ONLY}, BATCH_LIMIT=${BATCH_LIMIT === Infinity ? "all" : BATCH_LIMIT}, RESUME_ONLY=${RESUME_ONLY}`);
  const prisma = createPrisma();
  // Telemetry shared with processBatch. Previously this script wrote NEITHER an
  // AccDcIngestRun row NOR ingestRunId on AccActivity, so the monitor read 0 rows
  // and could not see this path's quota usage. Now it records both.
  const stats = { dbRunId: null, rowsByModule: {}, requestsSubmitted: 0, projectsProcessed: 0 };

  try {
    const accountId = process.env.APS_HUB_ID.replace(/^b\./, "");
    log(`Account: ${accountId}`);

    // Date window — DAYS days back, ending end-of-yesterday-UTC
    const now = new Date();
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endDate = new Date(utcToday.getTime() - 1);
    const startDate = new Date(utcToday.getTime() - DAYS * 24 * 60 * 60 * 1000);
    log(`Date window: ${startDate.toISOString()} → ${endDate.toISOString()} (${DAYS} days)`);

    // Discover projects
    const token2Leg = await get2LegToken();
    let projects = await listProjectAdminProjects(accountId, token2Leg);
    log(`Found ${projects.length} projects where Luis is projectAdmin.`);
    if (ACTIVE_ONLY) projects = projects.filter((p) => p.status === "active");
    log(`After filter: ${projects.length} projects.`);

    const batches = [];
    for (let i = 0; i < projects.length; i += PROJECT_BATCH) {
      batches.push(projects.slice(i, i + PROJECT_BATCH).map((p) => p.id));
    }
    log(`Splitting into ${batches.length} batch(es) of up to ${PROJECT_BATCH} projects each.`);

    const totalBatches = Math.min(batches.length, BATCH_LIMIT);
    let totalInserted = 0;
    let okCount = 0;
    let failCount = 0;

    // Open the telemetry row for this run.
    try {
      const runRow = await prisma.accDcIngestRun.create({
        data: {
          status: "running",
          sliceWindowStart: startDate,
          sliceWindowEnd: endDate,
          rowsByModule: {},
          rowsByAdminCsv: {},
        },
      });
      stats.dbRunId = runRow.id;
      log(`AccDcIngestRun created: ${stats.dbRunId}`);
    } catch (err) {
      logErr(`Could not create AccDcIngestRun telemetry row: ${err.message}`);
    }

    for (let i = 0; i < totalBatches; i++) {
      const result = await processBatch(prisma, accountId, i, totalBatches, batches[i], startDate, endDate, { runId, stats });
      if (result.ok) {
        okCount++;
        totalInserted += result.inserted ?? 0;
        stats.projectsProcessed += batches[i].length;
      } else {
        failCount++;
      }
    }

    // Finalise the telemetry row so the monitor sees real rows + quota usage.
    if (stats.dbRunId) {
      const finalStatus = failCount === 0 ? "success" : okCount > 0 ? "partial" : "failed";
      await prisma.accDcIngestRun.update({
        where: { id: stats.dbRunId },
        data: {
          endedAt: new Date(),
          status: finalStatus,
          projectsProcessed: stats.projectsProcessed,
          quotaUsed: stats.requestsSubmitted,
          rowsByModule: stats.rowsByModule,
          errorMessage: failCount > 0 ? `${failCount} batch(es) failed` : null,
        },
      });
      log(`AccDcIngestRun ${stats.dbRunId} finalised: status=${finalStatus} quotaUsed=${stats.requestsSubmitted} rowsByModule=${JSON.stringify(stats.rowsByModule)}`);
    }

    const accActivityTotal = await prisma.accActivity.count();
    log("=== RUN COMPLETE ===");
    log(`Batches OK: ${okCount} / Failed: ${failCount}`);
    log(`Total rows inserted this run: ${totalInserted.toLocaleString()}`);
    log(`AccActivity total in DB: ${accActivityTotal.toLocaleString()}`);
  } catch (err) {
    logErr("Fatal:", err.message || err);
    // Close out the telemetry row so a crashed run isn't left "running" forever.
    if (stats.dbRunId) {
      await prisma.accDcIngestRun
        .update({
          where: { id: stats.dbRunId },
          data: {
            endedAt: new Date(),
            status: "failed",
            projectsProcessed: stats.projectsProcessed,
            quotaUsed: stats.requestsSubmitted,
            rowsByModule: stats.rowsByModule,
            errorMessage: String(err?.message || err).slice(0, 500),
          },
        })
        .catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
