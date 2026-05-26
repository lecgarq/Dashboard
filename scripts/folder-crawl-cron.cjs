/**
 * scripts/folder-crawl-cron.cjs
 *
 * Standalone folder-crawl runner — production scheduled job.
 *
 * Schedule: WEEKLY (Luis-approved cadence per CRAWL-ESTIMATE.md, 2026-05-11).
 *   Recommended Railway cron: `0 4 * * 0` (Sunday 04:00 UTC).
 *   See CRAWL-ESTIMATE.md for rationale (~48min best / ~4h worst parallel).
 *
 * Why standalone (not folded into the Railway release):
 *   - Full-hub crawl exceeds the 5-min release watchdog (SYNC-01).
 *   - Release path keeps `FOLDER_CRAWL_IN_RELEASE` OFF by default; this cron
 *     is the production path that writes AccFolder + AccFolderPermission rows.
 *
 * What it does:
 *   1. Resolve hub ID (Project.apsHubId — b.-prefixed) + accountId.
 *   2. Acquire 2-legged APS token.
 *   3. Iterate active AccProject rows under pLimit(5), invoking
 *      extractAndPersistFolders for each (additive upserts; soft-delete
 *      decisions are deferred — see SKIP-ARCHIVED-IN-FLIGHT scope in
 *      04-02-SUMMARY.md).
 *
 * Operator setup (NOT part of this script):
 *   - Configure a weekly Railway cron job pointing at this file once Plan 04
 *     is merged. See 04-04-SUMMARY.md for the operator checkbox.
 *
 * Pure CommonJS shell — TS helpers loaded via tsx/cjs runtime hook.
 */

const path = require("node:path");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

// Register tsx so we can require() the TS helper directly.
require("tsx/cjs");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";

function ts() {
  return new Date().toISOString();
}
function log(...args) {
  console.log(`[folder-crawl-cron ${ts()}]`, ...args);
}
function logErr(...args) {
  console.error(`[folder-crawl-cron ${ts()}]`, ...args);
}

function parseProjectStatuses() {
  const raw = (process.env.FOLDER_CRAWL_STATUSES || "never,partial,failed").trim();
  const statuses = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return statuses.length > 0 ? statuses : ["never", "partial", "failed"];
}

function parseProjectIds() {
  const raw = (process.env.FOLDER_CRAWL_PROJECT_IDS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^b\./, ""))
    .filter(Boolean);
}

function parsePositiveInt(name) {
  const raw = process.env[name] && process.env[name].trim();
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
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

async function main() {
  log("Starting weekly folder crawl…");
  const prisma = createPrisma();
  let exitCode = 0;

  try {
    // ── Hub ID (b.-prefixed, lives on Project.apsHubId) ────────────────────
    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow || !hubRow.apsHubId) {
      throw new Error("Project.apsHubId is not configured");
    }
    const hubId = String(hubRow.apsHubId);
    // accountId = bare UUID (strip b. prefix)
    const accountId = hubId.replace(/^b\./, "");
    log(`Hub ID: ${hubId}`);

    // ── Auth ──────────────────────────────────────────────────────────────
    const accessToken = await fetchAutodeskToken();
    log("Token acquired.");

    // ── Active projects ───────────────────────────────────────────────────
    const crawlStatuses = parseProjectStatuses();
    const projectIds = parseProjectIds();
    const projectLimit = parsePositiveInt("FOLDER_CRAWL_LIMIT");
    const projects = await prisma.accProject.findMany({
      where: {
        status: "active",
        folderCrawlStatus: { in: crawlStatuses },
        ...(projectIds.length > 0 ? { id: { in: projectIds } } : {}),
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" },
      ...(projectLimit ? { take: projectLimit } : {}),
    });
    log(
      `Found ${projects.length} active AccProject(s) with folderCrawlStatus in ` +
        `[${crawlStatuses.join(", ")}]${projectLimit ? ` (limit ${projectLimit})` : ""}.`
    );
    if (projects.length === 0) {
      log("No active projects; nothing to do.");
      return;
    }

    // ── Load TS extractor + pLimit ────────────────────────────────────────
    const { extractAndPersistFolders } = require(
      path.resolve(__dirname, "..", "lib", "acc", "folderCrawl.ts")
    );
    const pLimitMod = require("p-limit");
    const pLimit = pLimitMod && pLimitMod.default ? pLimitMod.default : pLimitMod;

    // ── Fan-out across projects at pLimit(5) ──────────────────────────────
    const startedAt = Date.now();
    const limit = pLimit(5);
    const results = await Promise.all(
      projects.map((p) =>
        limit(async () => {
          try {
            return await extractAndPersistFolders(
              prisma,
              hubId,
              { id: p.id, accountId, name: p.name },
              accessToken,
              { refreshAccessToken: fetchAutodeskToken },
            );
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            logErr(`Project ${p.name} (${p.id}) extraction threw: ${msg}`);
            return { folderCount: 0, permissionCount: 0, status: "failed" };
          }
        })
      )
    );

    const totalFolders = results.reduce((s, r) => s + (r.folderCount || 0), 0);
    const totalPerms = results.reduce((s, r) => s + (r.permissionCount || 0), 0);
    const okCount = results.filter((r) => r.status === "ok").length;
    const partialCount = results.filter((r) => r.status === "partial").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const durationMs = Date.now() - startedAt;

    log(
      `Crawl complete: folders=${totalFolders} perms=${totalPerms} ` +
        `ok=${okCount} partial=${partialCount} failed=${failedCount} ` +
        `duration=${(durationMs / 1000).toFixed(1)}s across ${projects.length} projects`
    );
  } catch (err) {
    logErr("Fatal:", err && err.message ? err.message : err);
    if (err && err.stack) logErr(err.stack);
    exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  log(`Done. exit=${exitCode}`);
  process.exit(exitCode);
}

main().catch((err) => {
  logErr("Uncaught fatal:", err);
  process.exit(1);
});
