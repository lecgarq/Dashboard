#!/usr/bin/env node
/**
 * Complete the existing Data Connector job that already finished APS-side.
 * Picks up at step 3 of the workflow (list files → signed URLs → ingest).
 *
 * Uses the existing AccDataConnectorJob row created earlier today.
 * INSERT-only; never deletes or updates AccActivity outside of itself.
 *
 * Run: node --env-file=.env scripts/dc-finish-existing.cjs
 */

const { parse } = require("csv-parse");
const { Readable } = require("node:stream");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DC_BASE = "https://developer.api.autodesk.com/data-connector/v1";

const USER_EMAIL = "luis.cortes@hermosillo.com";
// 2026-05-19: APS DC migrated to a per-module CSV schema
// (activities_<module>_activities.csv). The legacy single-file patterns above
// matched zero files in the new format. Match the per-module name strictly so
// _changes.csv siblings and target_*.csv aren't picked up (Pitfall 11).
const ACTIVITY_FILE_RE = /^activities_([a-z_]+)_activities\.csv$/i;
function classifyFile(name) {
  const match = name.match(ACTIVITY_FILE_RE);
  if (!match) return null;
  const moduleName = match[1].toLowerCase();
  // admin module rows land with empty projectId (sentinel for the @@unique dedup
  // on AccActivity since Postgres treats NULL != NULL); everything else is project.
  return { kind: moduleName === "admin" ? "admin" : "project", moduleName };
}
const BATCH_SIZE = 500;

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[dc-finish ${ts()}]`, ...args); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function refreshAndStore(prisma, acct) {
  log("Refreshing access token…");
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
    throw new Error(`Refresh failed (${res.status}): ${JSON.stringify(json)}`);
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
  log("Token refreshed and persisted.");
  return json.access_token;
}

async function getUserToken(prisma) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!acct) throw new Error(`No Autodesk account for ${USER_EMAIL}`);
  const nowSec = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at > nowSec + 300) {
    log("Using stored access_token (fresh).");
    return acct.access_token;
  }
  if (!acct.refresh_token) throw new Error("No refresh_token in DB — please re-auth via Autodesk OAuth.");
  return refreshAndStore(prisma, acct);
}

async function dcGet(token, path) {
  const res = await fetch(`${DC_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}: ${typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

function mapRow(row, sourceFile, drops, moduleName) {
  // Bug D fix (2026-05-19): real per-module schema uses BIM360-native columns:
  //   created_by      -> autodeskId (12-char APS user ID, e.g. "ESX2N8HJL88XVK2B")
  //   activity_verb   -> rawAction  (e.g. "view-entity", "issue-view")
  //   bim360_project_id -> projectId
  //   created_at      -> createdAt  (space-separated, parses cleanly via Date)
  // Legacy aliases preserved for backward compatibility with old single-file
  // exports / mocked test fixtures. user_email is NOT in the new schema; it
  // gets backfilled by scripts/backfill-acc-activity-emails.cjs.
  const autodeskId = row.created_by || row.autodesk_id || row.autodeskId || row.user_id || row.userId || row.actor_id || row.actorId || "";
  const rawAction = row.activity_verb || row.raw_action || row.action || row.action_type || row.actionType || "";
  const createdAtRaw = row.created_at || row.createdAt || row.timestamp || row.event_time || "";
  if (!autodeskId) { drops.missingActor++; return null; }
  if (!rawAction)  { drops.missingAction++; return null; }
  if (!createdAtRaw) { drops.missingDate++; return null; }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) { drops.invalidDate++; return null; }

  const rawProjectId = row.bim360_project_id || row.project_id || row.projectId || "";
  const projectId = sourceFile === "admin" ? "" : (rawProjectId || "");
  const userEmailRaw = row.user_email || row.userEmail || row.email || "";
  const userEmail = userEmailRaw ? userEmailRaw.toLowerCase() : null;

  return {
    autodeskId,
    userEmail,
    projectId,
    rawAction,
    // service column is now derived from the filename (parseModuleFromFilename
    // in lib/acc/dcActivityCsvIngest.ts), since per-module CSVs no longer carry
    // an inline `service` column. Falls back to row.service for the rare CSV
    // (or test fixture) that still includes it.
    service: moduleName || row.service || null,
    tool: row.tool || null,
    details: row.details || row.description || null,
    sourceFile,
    createdAt,
  };
}

async function ingestCsvFromUrl(signedUrl, fileName, sourceFile, moduleName, prisma, opts) {
  log(`Downloading ${fileName} from signed URL (${signedUrl.slice(0, 60)}…)`);
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Signed URL fetch failed ${res.status}`);

  // bom:true strips the UTF-8 BOM that DC prefixes to the first header column
  // (`﻿activity_id`); without it the first column key is unreachable. We don't
  // currently consume activity_id but adding it now prevents a future class of
  // silent-drop bugs if anyone keys off it.
  const parser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_quotes: true });
  let parsed = 0;
  let attempted = 0;
  let inserted = 0;
  const drops = { missingActor: 0, missingAction: 0, missingDate: 0, invalidDate: 0 };
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    attempted += batch.length;
    if (opts.dryRun) {
      inserted += batch.length; // simulate
    } else {
      const result = await prisma.accActivity.createMany({ data: batch, skipDuplicates: true });
      inserted += result.count;
    }
    batch = [];
  };

  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(parser);
    parser.on("data", (row) => {
      parsed++;
      const mapped = mapRow(row, sourceFile, drops, moduleName);
      if (!mapped) return;
      batch.push(mapped);
      if (batch.length >= BATCH_SIZE) {
        parser.pause();
        flush().then(() => parser.resume()).catch(reject);
      }
    });
    parser.on("end", () => flush().then(resolve).catch(reject));
    parser.on("error", reject);
  });

  const droppedTotal = drops.missingActor + drops.missingAction + drops.missingDate + drops.invalidDate;
  log(`  ${fileName}: parsed=${parsed} dropped=${droppedTotal} (actor=${drops.missingActor} action=${drops.missingAction} date=${drops.missingDate} bad=${drops.invalidDate}) attempted=${attempted} inserted=${inserted} duplicates_skipped=${attempted - inserted}${opts.dryRun ? " [DRY-RUN]" : ""}`);
  return { parsed, attempted, inserted, droppedTotal };
}

async function resolveRequestId(prisma, argv) {
  const flagIdx = argv.indexOf("--request-id");
  if (flagIdx >= 0 && argv[flagIdx + 1]) return argv[flagIdx + 1];
  const positional = argv.find((a) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a));
  if (positional) return positional;
  if (process.env.DC_REQUEST_ID) return process.env.DC_REQUEST_ID;
  const latest = await prisma.accDataConnectorJob.findFirst({
    where: { status: "success" },
    orderBy: { startedAt: "desc" },
    select: { requestId: true, startedAt: true, dateRange: true },
  });
  if (!latest) throw new Error("No successful AccDataConnectorJob in DB to promote.");
  log(`No --request-id given; defaulting to latest success: ${latest.requestId} (${latest.startedAt.toISOString()}, ${latest.dateRange || "?"})`);
  return latest.requestId;
}

async function main() {
  log("=== Finish existing Data Connector job ===");
  const prisma = createPrisma();
  const opts = { dryRun: process.argv.includes("--dry-run") };
  if (opts.dryRun) log("DRY-RUN mode: APS quota will be spent, but NO rows will be inserted.");
  try {
    const accountId = process.env.APS_HUB_ID.replace(/^b\./, "");
    const requestId = await resolveRequestId(prisma, process.argv.slice(2));
    log(`Account: ${accountId}`);
    log(`Request: ${requestId}`);

    const token = await getUserToken(prisma);

    // 1. Get jobs for this request
    const jobsResp = await dcGet(token, `/accounts/${accountId}/requests/${requestId}/jobs`);
    const jobs = jobsResp.results || jobsResp.jobs || [];
    log(`Found ${jobs.length} job(s).`);
    if (jobs.length === 0) throw new Error("No jobs found for this request");

    let totals = { parsed: 0, attempted: 0, inserted: 0, droppedTotal: 0, filesSeen: 0, filesIngested: 0, filesUnmatched: [] };

    for (const job of jobs) {
      const jobId = job.id;
      const status = job.status;
      const completionStatus = job.completionStatus;
      log(`Job ${jobId}: status=${status}, completionStatus=${completionStatus}`);
      if (status !== "complete" || completionStatus !== "success") {
        log(`  Skipping (not complete+success).`);
        continue;
      }

      const listing = await dcGet(token, `/accounts/${accountId}/jobs/${jobId}/data-listing`);
      const files = Array.isArray(listing) ? listing : listing.results || [];
      log(`  ${files.length} file(s) in data-listing.`);

      for (const f of files) {
        const name = f.name;
        totals.filesSeen++;
        const classification = classifyFile(name);
        if (!classification) {
          log(`  WARN: file ${name} (${f.size} bytes) did not match any TARGET_FILE_PATTERNS — skipping.`);
          totals.filesUnmatched.push(name);
          continue;
        }
        const { kind: sourceFile, moduleName } = classification;
        log(`  Target file: ${name} (${f.size} bytes, kind=${sourceFile}, module=${moduleName})`);

        const signed = await dcGet(token, `/accounts/${accountId}/jobs/${jobId}/data/${encodeURIComponent(name)}`);
        const url = signed.url || signed.signedUrl || signed.downloadUrl;
        if (!url) {
          log(`  Could not find signed URL in response: ${JSON.stringify(signed).slice(0, 300)}`);
          continue;
        }

        const r = await ingestCsvFromUrl(url, name, sourceFile, moduleName, prisma, opts);
        totals.parsed += r.parsed;
        totals.attempted += r.attempted;
        totals.inserted += r.inserted;
        totals.droppedTotal += r.droppedTotal;
        totals.filesIngested++;
      }
    }

    const accActivityTotal = await prisma.accActivity.count();
    const sample = await prisma.accActivity.findMany({ take: 3, orderBy: { createdAt: "desc" } });

    log("=== COMPLETE ===");
    log(`Files seen=${totals.filesSeen} ingested=${totals.filesIngested} unmatched=${totals.filesUnmatched.length}${totals.filesUnmatched.length ? ' ['+totals.filesUnmatched.join(', ')+']' : ''}`);
    log(`CSV parsed=${totals.parsed} dropped=${totals.droppedTotal} attempted=${totals.attempted} inserted=${totals.inserted} duplicates_skipped=${totals.attempted - totals.inserted}${opts.dryRun ? ' [DRY-RUN]' : ''}`);
    log(`Total AccActivity rows in DB: ${accActivityTotal}`);
    if (sample.length) {
      log("Sample rows:");
      for (const r of sample) {
        log(`  ${r.createdAt.toISOString()} | ${r.rawAction} | user=${r.userEmail || r.autodeskId} | project=${r.projectId || '(admin)'} | ${(r.details || '').slice(0, 60)}`);
      }
    }
  } catch (err) {
    log("ERROR:", err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
