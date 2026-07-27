#!/usr/bin/env node
/**
 * dc-admin-snapshot-refresh — full-universe DC admin snapshot refresh.
 *
 * WHY THIS EXISTS (2026-07-07 root cause):
 *   The daily ingest extracts only MTY-allowlisted projects (~183 of ~527
 *   admin projects) for quota efficiency. DC admin CSVs only cover the
 *   projects in the request, so the daily run's admin snapshot rebuild sees
 *   ~1.7k users vs the ~3.9k full-universe baseline and the anomaly guard
 *   (dcAnomalyChecks, 10% user-drop threshold) quarantines it — every day
 *   since 2026-06-04. The AccDc* admin tables can only advance via a
 *   full-universe extract. This script IS that extract:
 *
 *   1. Discover ALL projects where Luis is projectAdmin (Admin v1, 2-leg).
 *   2. Submit ceil(N/50) DC requests with a 1-day window (admin CSVs are
 *      NOT window-filtered — proven by the 1-day-window successes of
 *      2026-05-24..26 — so the smallest window keeps downloads light).
 *   3. Download ONLY admin_*.csv files, concatenated across batches.
 *   4. Promote atomically via ingestAdminSnapshot (anomaly guard stays on;
 *      a full-universe extract passes it legitimately).
 *   5. Record an AccDcIngestRun row so daily quota accounting stays honest.
 *
 * Quota: ceil(N/50) requests (~11 today) against the shared
 * DAILY_SAFE_REQUEST_BUDGET=20. The script refuses to start unless the
 * whole batch fits in today's remaining budget (override: DC_ADMIN_REFRESH_FORCE=1).
 *
 * Run manually:
 *   node --env-file=.env scripts/dc-admin-snapshot-refresh.cjs
 *
 * Scheduled weekly (Sunday) via scripts/dc-admin-snapshot-refresh.ps1.
 *
 * Future: replace with a quota-free Construction Admin API sync once the
 * DC-CSV vs HQ-API user-id spaces are proven identical (see lib/server/acc-admin.ts).
 */

require('tsx/cjs');
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');

const REPO_ROOT = path.join(__dirname, '..');
const KILL_SWITCH = path.join(REPO_ROOT, '.dc-ingest.disabled');

const APS_DC_BASE = 'https://developer.api.autodesk.com/data-connector/v1';
const PROJECT_BATCH = 50; // APS hard limit on projectIdList
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour per batch
const DC_USER_EMAIL =
  process.env.DC_USER_EMAIL?.trim() || 'luis.cortes@hermosillo.com';

function ts() {
  return new Date().toISOString();
}
function log(...args) {
  console.log(`[dc-admin-refresh ${ts()}]`, ...args);
}
function logErr(...args) {
  console.error(`[dc-admin-refresh ${ts()}]`, ...args);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPrisma() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const url =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL must be set');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 2 }),
    log: ['error'],
  });
}

// --- CSV part accumulation (same approach as scratch/salvage-dc-admin-snapshot.cjs:
//     keep the first header, append data rows from every batch; skipDuplicates
//     in ingestAdminSnapshot dedupes cross-batch repeats like admin_accounts). ---
function appendCsvPart(partsByFilename, filename, csvText) {
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines.shift();
  if (!header) return;
  const rows = lines.filter((line) => line.trim() !== '');
  const existing = partsByFilename.get(filename);
  if (!existing) {
    partsByFilename.set(filename, { header, rows });
    return;
  }
  existing.rows.push(...rows);
}

function sourcesFromParts(partsByFilename) {
  return [...partsByFilename.entries()].map(([filename, part]) => ({
    filename,
    csvStream: Readable.from([[part.header, ...part.rows].join('\n') + '\n']),
  }));
}

// --- Minimal DC poll/listing/download plumbing (script-local, mirrors
//     scripts/dc-ingest-where-i-admin.cjs; lib/acc/dcIngest.ts keeps its
//     equivalents private). Reads never consume DC daily quota — only
//     POST /requests does. ---
async function dcPollJobs(accountId, token, requestId) {
  const res = await fetch(
    `${APS_DC_BASE}/accounts/${accountId}/requests/${requestId}/jobs`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET /jobs ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.results ?? json.jobs ?? (Array.isArray(json) ? json : []);
}

function reduceJobsStatus(jobs) {
  if (jobs.length === 0) return 'pending';
  const norm = jobs.map((j) => ({
    status: String(j.status ?? '').toLowerCase(),
    completionStatus: String(j.completionStatus ?? '').toLowerCase(),
  }));
  if (norm.some((j) => /fail|cancel|error/.test(j.completionStatus))) return 'failed';
  if (norm.every((j) => j.status === 'complete' && j.completionStatus === 'success')) {
    return 'success';
  }
  return 'running';
}

async function dcDataListing(accountId, token, jobId) {
  const res = await fetch(
    `${APS_DC_BASE}/accounts/${accountId}/jobs/${jobId}/data-listing`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET /data-listing ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return Array.isArray(json) ? json : json.results ?? [];
}

async function fetchAdminCsv(accountId, token, jobId, filename) {
  let signedRes;
  for (let attempt = 1; attempt <= 4; attempt++) {
    signedRes = await fetch(
      `${APS_DC_BASE}/accounts/${accountId}/jobs/${jobId}/data/${encodeURIComponent(filename)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (signedRes.ok || signedRes.status < 500 || attempt === 4) break;
    await sleep(attempt * 5_000);
  }
  if (!signedRes || !signedRes.ok) {
    throw new Error(`${jobId} ${filename} signed URL ${signedRes?.status}`);
  }
  const signedJson = await signedRes.json();
  const signed = signedJson.url ?? signedJson.signedUrl ?? signedJson.downloadUrl;
  if (!signed) throw new Error(`${jobId} ${filename} missing signedUrl`);
  let csvRes;
  for (let attempt = 1; attempt <= 4; attempt++) {
    csvRes = await fetch(signed);
    if (csvRes.ok || csvRes.status < 500 || attempt === 4) break;
    await sleep(attempt * 5_000);
  }
  if (!csvRes || !csvRes.ok) {
    throw new Error(`${jobId} ${filename} fetch ${csvRes?.status}`);
  }
  return csvRes.text();
}

// Mirrors lib/acc/dcIngest.ts loadQuotaUsedToday (private there): POST /requests
// consumed today across the orchestrator run table and legacy job table.
async function loadQuotaUsedToday(prisma, now) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [runs, legacyJobs] = await Promise.all([
    prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { quotaUsed: true },
    }),
    prisma.accDataConnectorJob.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { id: true },
    }),
  ]);
  return (
    runs.reduce((sum, r) => sum + (r.quotaUsed ?? 0), 0) + legacyJobs.length
  );
}

async function main() {
  if (fs.existsSync(KILL_SWITCH)) {
    log('Kill switch active (.dc-ingest.disabled present) — exiting.');
    process.exit(0);
  }

  const { dcSubmit, QuotaExceededError } = require('../lib/acc/dcIngest');
  const {
    ADMIN_CSV_ALLOWLIST,
    ingestAdminSnapshot,
  } = require('../lib/acc/dcAdminCsvIngest');
  const { AnomalyError } = require('../lib/acc/dcAnomalyChecks');
  const {
    discoverAdminProjects,
    get2LegToken,
  } = require('../lib/acc/dcProjectDiscovery');
  const { refreshUserToken } = require('../lib/server/aps-oauth');
  const { DAILY_SAFE_REQUEST_BUDGET } = require('../lib/acc/dcQuota');

  const accountId = (process.env.APS_HUB_ID || process.env.ACC_ACCOUNT_ID)
    ?.trim()
    ?.replace(/^b\./, '');
  const userId = process.env.LUIS_ACC_USER_ID?.trim();
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  const missing = [];
  if (!accountId) missing.push('APS_HUB_ID/ACC_ACCOUNT_ID');
  if (!userId) missing.push('LUIS_ACC_USER_ID');
  if (!clientId) missing.push('APS_CLIENT_ID');
  if (!clientSecret) missing.push('APS_CLIENT_SECRET');
  if (missing.length > 0) {
    logErr(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const prisma = createPrisma();
  let ingestRunId = null;

  async function finalize(patch) {
    if (!ingestRunId) return;
    await prisma.accDcIngestRun
      .update({
        where: { id: ingestRunId },
        data: { endedAt: new Date(), ...patch },
      })
      .catch((e) => logErr('finalize failed:', e.message));
  }

  try {
    // 1. Discover the full admin-project universe (2-leg; no DC quota).
    const token2Leg = await get2LegToken(clientId, clientSecret);
    const adminProjects = await discoverAdminProjects({
      accountId,
      userId,
      token2Leg,
    });
    if (adminProjects.length === 0) {
      throw new Error('discoverAdminProjects returned 0 admin projects');
    }

    const batches = [];
    for (let i = 0; i < adminProjects.length; i += PROJECT_BATCH) {
      batches.push(adminProjects.slice(i, i + PROJECT_BATCH).map((p) => p.id));
    }

    // 2. Quota guard — the whole refresh must fit in today's remaining safe budget.
    const usedToday = await loadQuotaUsedToday(prisma, new Date());
    const remaining = DAILY_SAFE_REQUEST_BUDGET - usedToday;
    log(
      `Universe: ${adminProjects.length} admin projects -> ${batches.length} request(s); ` +
        `quota used today=${usedToday}, safe budget=${DAILY_SAFE_REQUEST_BUDGET}`,
    );
    if (batches.length > remaining && process.env.DC_ADMIN_REFRESH_FORCE !== '1') {
      logErr(
        `Refusing to start: needs ${batches.length} request(s) but only ${remaining} ` +
          `safe request(s) remain today. Re-run after 00:00 UTC or set DC_ADMIN_REFRESH_FORCE=1.`,
      );
      process.exit(2);
    }

    // 3. One-day window ending yesterday UTC — admin CSVs are entity snapshots
    //    per requested project, not window-filtered (evidence: 2026-05-24..26
    //    one-day-window runs carried the full 3.3k-user universe).
    const now = new Date();
    const endDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1,
    ); // yesterday 23:59:59.999Z
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000 + 1);

    const run = await prisma.accDcIngestRun.create({
      data: {
        status: 'running',
        rowsByModule: {},
        rowsByAdminCsv: {},
        sliceWindowStart: startDate,
        sliceWindowEnd: endDate,
      },
    });
    ingestRunId = run.id;
    log(`Run ${ingestRunId} started (admin-snapshot refresh)`);

    const adminFilenames = new Set(ADMIN_CSV_ALLOWLIST.map((e) => e.filename));
    const parts = new Map();
    let quotaUsed = 0;
    const projectsProcessed = new Set();

    // 4. Sequential submit -> poll -> download-admin-CSVs per batch.
    for (let bi = 0; bi < batches.length; bi++) {
      const projectIds = batches[bi];
      const userToken = await refreshUserToken(prisma, {
        userEmail: DC_USER_EMAIL,
      });
      log(
        `Batch ${bi + 1}/${batches.length}: submitting ${projectIds.length} project(s)`,
      );
      const requestId = await dcSubmit({
        accountId,
        userToken,
        projectIds,
        startDate,
        endDate,
        // APS rejects punctuation in description — alnum + space + dash only
        // (see scripts/dc-ingest-where-i-admin.cjs safeLabel note).
        description: `admin-snapshot-refresh batch ${bi + 1} of ${batches.length}`,
      });
      quotaUsed++;
      log(`Batch ${bi + 1}: request ${requestId}`);

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let jobs = [];
      let status = 'pending';
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const pollToken = await refreshUserToken(prisma, {
          userEmail: DC_USER_EMAIL,
        });
        jobs = await dcPollJobs(accountId, pollToken, requestId);
        status = reduceJobsStatus(jobs);
        if (status === 'success' || status === 'failed') break;
      }
      if (status !== 'success') {
        throw new Error(
          `Batch ${bi + 1} request ${requestId} ended status=${status} after polling`,
        );
      }

      for (const job of jobs) {
        const dlToken = await refreshUserToken(prisma, {
          userEmail: DC_USER_EMAIL,
        });
        const files = await dcDataListing(accountId, dlToken, job.id);
        const adminFiles = files.filter((f) => adminFilenames.has(f.name));
        log(
          `Batch ${bi + 1}: job ${job.id} — ${adminFiles.length} admin CSV(s) of ${files.length} file(s)`,
        );
        for (const f of adminFiles) {
          const csvText = await fetchAdminCsv(accountId, dlToken, job.id, f.name);
          appendCsvPart(parts, f.name, csvText);
        }
      }
      projectIds.forEach((id) => projectsProcessed.add(id));
    }

    // 5. Promote atomically. Previous metrics mirror lib/acc/dcIngest.ts
    //    loadPreviousRunMetrics: current table counts (set by the last good
    //    snapshot) + the last success run's rowsByAdminCsv.
    const prevRun = await prisma.accDcIngestRun.findFirst({
      where: { status: 'success' },
      orderBy: { startedAt: 'desc' },
    });
    const [userCount, projectCount] = await Promise.all([
      prisma.accDcUser.count(),
      prisma.accDcProject.count(),
    ]);
    const previous = prevRun
      ? {
          userCount,
          projectCount,
          rowsByAdminCsv: prevRun.rowsByAdminCsv ?? {},
        }
      : null;

    log(`Promoting admin snapshot from ${parts.size} concatenated CSV file(s)…`);
    const snapshot = await ingestAdminSnapshot(
      prisma,
      sourcesFromParts(parts),
      ingestRunId,
      previous,
    );

    await finalize({
      status: 'success',
      quotaUsed,
      projectsProcessed: projectsProcessed.size,
      rowsByAdminCsv: snapshot.rowsByAdminCsv,
      diffSummary: snapshot.diffSummary,
    });
    log(
      `Run ${ingestRunId} SUCCESS — projects=${projectsProcessed.size} quotaUsed=${quotaUsed}`,
    );
    log(`rowsByAdminCsv=${JSON.stringify(snapshot.rowsByAdminCsv)}`);
    log(`diffSummary=${JSON.stringify(snapshot.diffSummary)}`);
    process.exit(0);
  } catch (err) {
    const message = err?.message || String(err);
    if (err?.name === 'AnomalyError') {
      await finalize({
        status: 'quarantined',
        errorMessage: `Anomaly detected — admin snapshot rolled back: ${message}`,
      });
      logErr(`QUARANTINED: ${message}`);
    } else if (err?.name === 'QuotaExceededError') {
      await finalize({ status: 'quota-paused', errorMessage: message });
      logErr(`QUOTA-PAUSED: ${message}`);
    } else {
      await finalize({ status: 'failed', errorMessage: message });
      logErr(`FAILED: ${message}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr('Fatal:', err?.message || err);
  process.exit(1);
});
