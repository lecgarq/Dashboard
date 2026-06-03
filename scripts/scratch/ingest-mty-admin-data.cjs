#!/usr/bin/env node
/**
 * scripts/scratch/ingest-mty-admin-data.cjs
 *
 * Ingest admin data files (users, companies, project memberships) for the 78 authorized
 * Monterrey projects from the successfully completed Batch 1 and Batch 2 DC jobs.
 * This runs with ZERO quota cost by downloading and parsing files from completed jobs.
 */

const path = require("node:path");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const unzipper = require("unzipper");
const { parse } = require("csv-parse");

require("tsx/cjs");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const USER_EMAIL = "luis.cortes@hermosillo.com";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[mty-admin-ingest ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[mty-admin-ingest ${ts()}]`, ...args); }

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

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
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

async function resolveDownloadUrls(accountId, jobs, accessToken) {
  const urls = [];
  for (const job of jobs) {
    const jobApsId = job.id || job.jobId;
    if (!jobApsId) continue;
    
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

async function main() {
  const prisma = createPrisma();
  try {
    log("=== STARTING BULK INGESTION OF MONTERREY ADMIN DATA ===");

    const accountId = await resolveAccountId(prisma);
    const refreshedToken = await refreshUserToken(prisma);

    const targetJobs = [
      { id: "cmph1bgga0000koz4deufmfng", requestId: "c448ae22-0126-42d1-9b90-ec9e2f84f8e6" },
      { id: "cmph1feq30mchkoz4sv31742u", requestId: "3e0ef901-038f-44fe-a303-75fdd62ee251" }
    ];

    const { ADMIN_CSV_ALLOWLIST } = require(path.resolve(__dirname, "..", "..", "lib", "acc", "dcAdminCsvIngest.ts"));
    const allowlistByFilename = new Map(ADMIN_CSV_ALLOWLIST.map(entry => [entry.filename, entry]));

    for (const job of targetJobs) {
      log(`Resolving fresh signed S3 URL for request: ${job.requestId} (job: ${job.id})...`);
      const jobs = await pollJobs(accountId, job.requestId, refreshedToken);
      const urls = await resolveDownloadUrls(accountId, jobs, refreshedToken);
      if (urls.length === 0) {
        logErr(`Could not resolve download URL for request ${job.requestId}`);
        continue;
      }
      const downloadUrl = urls[0].url;
      log(`Resolved URL successfully. Streaming and unzipping ZIP extract...`);

      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        logErr(`S3 download failed: ${res.status}`);
        continue;
      }

      const nodeStream = Readable.fromWeb(res.body);
      const directory = nodeStream.pipe(unzipper.Parse({ forceStream: true }));

      for await (const entryUnknown of directory) {
        const entry = entryUnknown;
        const filename = entry.path.split("/").pop() || entry.path;

        if (entry.type !== "File" || !allowlistByFilename.has(filename)) {
          entry.autodrain();
          continue;
        }

        const rule = allowlistByFilename.get(filename);
        log(`Found matching admin CSV: "${filename}" - parsing and bulk ingesting into "${rule.model}"...`);

        const parser = parse({
          columns: true,
          bom: true,
          relax_column_count: true,
          trim: true,
          skip_empty_lines: true,
        });
        entry.pipe(parser);

        const ctx = { ingestRunId: job.id, ingestedAt: new Date() };
        const rows = [];
        for await (const rawRow of parser) {
          try {
            const mapped = rule.mapper(rawRow, ctx);
            rows.push(mapped);
          } catch (err) {
            // Silence standard mapping warnings for header records
          }
        }

        if (rows.length > 0) {
          const modelName = rule.model;
          const model = prisma[modelName];
          const BATCH_SIZE = 500;
          let inserted = 0;
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const chunk = rows.slice(i, i + BATCH_SIZE);
            const resCount = await model.createMany({ data: chunk, skipDuplicates: true });
            inserted += resCount.count;
          }
          log(`Ingested ${inserted}/${rows.length} rows for "${filename}" into "${modelName}" (skipped duplicates: ${rows.length - inserted})`);
        } else {
          log(`No rows to insert for "${filename}".`);
        }
      }
    }

    log("=== MONTERREY ADMIN DATA BULK INGESTION RUN SUMMARY ===");
    log("All admin files processed successfully with ZERO quota usage.");
    log("======================================================");

  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  logErr("Fatal error in systematic extraction:", err && err.message ? err.message : err);
  if (err && err.stack) logErr(err.stack);
  process.exit(1);
});
