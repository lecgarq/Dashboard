#!/usr/bin/env node
/* eslint-disable no-console */

const { parse } = require("csv-parse/sync");

const dotenv = (() => {
  try {
    return require("dotenv");
  } catch {
    return null;
  }
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

async function fetchDataConnectorUserMap(prisma) {
  const accountId = (process.env.APS_HUB_ID || "").replace(/^b\./, "");
  if (!accountId) return new Map();

  const row = await prisma.accDataConnectorJob.findFirst({
    where: process.env.DC_REQUEST_ID
      ? { requestId: process.env.DC_REQUEST_ID }
      : { status: "success" },
    orderBy: { startedAt: "desc" },
  });
  if (!row?.requestId) return new Map();

  const account = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { access_token: true },
  });
  if (!account?.access_token) return new Map();

  const auth = { Authorization: `Bearer ${account.access_token}` };
  const jobsResponse = await fetch(
    `${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests/${row.requestId}/jobs`,
    { headers: auth }
  );
  if (!jobsResponse.ok) return new Map();

  const jobsJson = await jobsResponse.json();
  const jobs = Array.isArray(jobsJson)
    ? jobsJson
    : Array.isArray(jobsJson.jobs)
      ? jobsJson.jobs
      : Array.isArray(jobsJson.results)
        ? jobsJson.results
        : [];

  const emailsById = new Map();
  for (const job of jobs) {
    const jobId = job.id || job.jobId;
    if (!jobId) continue;

    const dataResponse = await fetch(
      `${DATA_CONNECTOR_BASE}/accounts/${accountId}/jobs/${jobId}/data/admin_users.csv`,
      { headers: auth }
    );
    if (!dataResponse.ok) continue;

    const dataJson = await dataResponse.json();
    if (!dataJson.signedUrl) continue;

    const csvResponse = await fetch(dataJson.signedUrl);
    if (!csvResponse.ok) continue;

    const rows = parse(await csvResponse.text(), {
      columns: true,
      bom: true,
      relax_column_count: true,
      trim: true,
      skip_empty_lines: true,
    });
    for (const row of rows) {
      const autodeskId = row.autodesk_id || row.autodeskId;
      const email = row.email?.toLowerCase();
      if (autodeskId && email) emailsById.set(autodeskId, email);
    }
  }

  return emailsById;
}

async function fetchCacheUserMap(prisma) {
  const emailsById = new Map();
  const rows = await prisma.accMemberCache.findMany({
    select: { email: true, data: true },
  });
  for (const row of rows) {
    if (!row.email || !row.data || typeof row.data !== "object") continue;
    const autodeskId = row.data.autodeskId;
    if (typeof autodeskId === "string") {
      emailsById.set(autodeskId, row.email.toLowerCase());
    }
  }
  return emailsById;
}

async function main() {
  const prisma = createPrisma();
  try {
    const [dcMap, cacheMap] = await Promise.all([
      fetchDataConnectorUserMap(prisma),
      fetchCacheUserMap(prisma),
    ]);
    const emailsById = new Map([...cacheMap, ...dcMap]);
    console.log(`[activity-backfill] user ids available=${emailsById.size}`);

    const ids = await prisma.accActivity.findMany({
      where: { userEmail: null },
      distinct: ["autodeskId"],
      select: { autodeskId: true },
    });

    let updated = 0;
    for (const { autodeskId } of ids) {
      const email = emailsById.get(autodeskId);
      if (!email) continue;
      const result = await prisma.accActivity.updateMany({
        where: { autodeskId, userEmail: null },
        data: { userEmail: email },
      });
      updated += result.count;
    }

    console.log(
      JSON.stringify(
        {
          unmatchedIds: ids.filter(({ autodeskId }) => !emailsById.has(autodeskId)).length,
          updated,
          totalActivityRows: await prisma.accActivity.count(),
          attributedActivityRows: await prisma.accActivity.count({
            where: { userEmail: { not: null } },
          }),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[activity-backfill] ERROR:", error.message || error);
  process.exit(1);
});
