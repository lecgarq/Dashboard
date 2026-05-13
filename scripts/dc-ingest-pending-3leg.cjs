#!/usr/bin/env node
/* eslint-disable no-console */

const path = require("node:path");

require("tsx/cjs");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const USER_EMAIL = process.env.DC_USER_EMAIL || "luis.cortes@hermosillo.com";

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

function reduceStatus(jobs) {
  if (jobs.length === 0) return "pending";
  const statuses = jobs.map((job) =>
    String(job.completionStatus || job.status || job.state || "").toLowerCase()
  );
  if (statuses.some((status) => /fail|cancel|error/.test(status))) return "failed";
  if (statuses.every((status) => /success|complete/.test(status))) return "success";
  return "running";
}

function extractDownloadUrls(jobs) {
  return jobs
    .map((job) => job.downloadUrl || job.download_url || job.url)
    .filter(Boolean);
}

async function main() {
  const prisma = createPrisma();
  try {
    const accountId = (process.env.APS_HUB_ID || "").replace(/^b\./, "");
    if (!accountId) throw new Error("APS_HUB_ID is not set");

    const row = await prisma.accDataConnectorJob.findFirst({
      where: process.env.DC_REQUEST_ID
        ? { requestId: process.env.DC_REQUEST_ID }
        : { status: { in: ["pending", "running", "success"] } },
      orderBy: { startedAt: "desc" },
    });
    if (!row) {
      console.log("[dc-ingest-3leg] No pending Data Connector job.");
      return;
    }

    const account = await prisma.account.findFirst({
      where: { provider: "autodesk", user: { email: USER_EMAIL } },
      select: { access_token: true },
    });
    if (!account?.access_token) throw new Error(`No Autodesk access token for ${USER_EMAIL}`);

    console.log(`[dc-ingest-3leg] Polling request ${row.requestId}`);
    const jobsUrl = `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${row.requestId}/jobs`;
    const response = await fetch(jobsUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GET /jobs failed: HTTP ${response.status} ${text}`);
    }

    const json = JSON.parse(text);
    const jobs = Array.isArray(json)
      ? json
      : Array.isArray(json.jobs)
        ? json.jobs
        : Array.isArray(json.results)
          ? json.results
          : [];
    const status = reduceStatus(jobs);
    console.log(`[dc-ingest-3leg] APS status=${status}, jobs=${jobs.length}`);

    if (status === "failed") {
      await prisma.accDataConnectorJob.update({
        where: { id: row.id },
        data: { status: "failed", completedAt: new Date(), errorMessage: "APS job failed" },
      });
      throw new Error("APS job failed");
    }
    if (status !== "success") return;

    let urls = extractDownloadUrls(jobs);
    if (urls.length === 0) {
      for (const job of jobs) {
        const jobId = job.id || job.jobId;
        if (!jobId) continue;
        const listingResponse = await fetch(
          `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobId}/data-listing`,
          { headers: { Authorization: `Bearer ${account.access_token}` } },
        );
        const listingText = await listingResponse.text();
        if (!listingResponse.ok) {
          throw new Error(`GET /jobs/${jobId}/data-listing failed: HTTP ${listingResponse.status} ${listingText}`);
        }
        const listingJson = JSON.parse(listingText);
        const files = Array.isArray(listingJson)
          ? listingJson
          : Array.isArray(listingJson.results)
            ? listingJson.results
            : [];
        const zipFile = files.find((file) => String(file.name || "").endsWith(".zip"));
        if (!zipFile?.name) continue;
        const dataResponse = await fetch(
          `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobId}/data/${encodeURIComponent(zipFile.name)}`,
          { headers: { Authorization: `Bearer ${account.access_token}` } },
        );
        const dataText = await dataResponse.text();
        if (!dataResponse.ok) {
          throw new Error(`GET /jobs/${jobId}/data/${zipFile.name} failed: HTTP ${dataResponse.status} ${dataText}`);
        }
        const dataJson = JSON.parse(dataText);
        if (dataJson.signedUrl) urls.push(dataJson.signedUrl);
      }
    }
    console.log(`[dc-ingest-3leg] Download URLs=${urls.length}`);
    if (urls.length === 0) return;

    const { ingestActivityZip } = require(path.resolve(__dirname, "..", "lib", "acc", "ingestActivityZip.ts"));
    const totals = { rowsByFile: {}, unresolved: 0 };
    for (const url of urls) {
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
        downloadUrl: urls[0] || null,
      },
    });
    await prisma.syncMeta.upsert({
      where: { id: "deep" },
      create: {
        id: "deep",
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: JSON.stringify(totals),
      },
      update: {
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: JSON.stringify(totals),
      },
    });

    console.log(JSON.stringify({
      ...totals,
      totalActivityRows: await prisma.accActivity.count(),
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[dc-ingest-3leg] ERROR:", error.message || error);
  process.exit(1);
});
