/**
 * scripts/folder-perms-recover.cjs
 *
 * Permissions-only recovery pass for projects that hit the Phase-1 hard cap
 * during a folder crawl. Such projects have AccFolder rows populated but
 * AccFolderPermission rows missing (Phase 2 never ran). This script:
 *
 *   1. Finds projects with folderCrawlStatus in [partial, failed] (configurable).
 *   2. For each, reads existing AccFolder rows.
 *   3. Fetches BIM360 Docs folder permissions per folder and upserts.
 *   4. Updates AccProject.folderCrawlStatus to ok / partial.
 *
 * Skips the entire BFS folder-walk phase, so it's NOT subject to the cap that
 * caused the partial in the first place. Idempotent: re-runs refresh syncedAt.
 *
 * Run:
 *   node --env-file=.env scripts/folder-perms-recover.cjs                # all partial+failed
 *   FOLDER_RECOVER_STATUSES=partial node ... folder-perms-recover.cjs    # only partial
 *   FOLDER_RECOVER_LIMIT=5         node ... folder-perms-recover.cjs     # cap project count
 *   FOLDER_RECOVER_PROJECT_IDS=b.foo,b.bar node ... folder-perms-recover.cjs
 *
 * No per-project time cap — re-running is safe, and the cap is the bug we're
 * working around. Project-level concurrency is pLimit(3) to keep APS happy.
 */

const path = require("node:path");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

require("tsx/cjs");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[perms-recover-cron ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[perms-recover-cron ${ts()}]`, ...args); }

function parseStatuses() {
  const raw = (process.env.FOLDER_RECOVER_STATUSES || "partial,failed").trim();
  const out = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return out.length > 0 ? out : ["partial", "failed"];
}

function parseProjectIds() {
  const raw = (process.env.FOLDER_RECOVER_PROJECT_IDS || "").trim();
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function parsePositiveInt(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    }),
    log: ["error"],
  });
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
  log("Starting permissions-only recovery pass…");
  const prisma = createPrisma();
  let exitCode = 0;

  try {
    const statuses = parseStatuses();
    const projectIds = parseProjectIds();
    const projectLimit = parsePositiveInt("FOLDER_RECOVER_LIMIT");

    const accessToken = await fetchAutodeskToken();
    log("Token acquired.");

    const projects = await prisma.accProject.findMany({
      where: {
        status: "active",
        folderCrawlStatus: { in: statuses },
        ...(projectIds.length > 0 ? { id: { in: projectIds } } : {}),
      },
      select: { id: true, name: true, folderCrawlStatus: true },
      orderBy: { name: "asc" },
      ...(projectLimit ? { take: projectLimit } : {}),
    });

    log(
      `Found ${projects.length} project(s) with folderCrawlStatus in ` +
        `[${statuses.join(", ")}]${projectLimit ? ` (limit ${projectLimit})` : ""}.`,
    );
    if (projects.length === 0) {
      log("Nothing to do.");
      return;
    }

    const { recoverPermissionsForExistingFolders } = require(
      path.resolve(__dirname, "..", "lib", "acc", "folderCrawl.ts"),
    );
    const pLimitMod = require("p-limit");
    const pLimit = pLimitMod && pLimitMod.default ? pLimitMod.default : pLimitMod;

    const startedAt = Date.now();
    const limit = pLimit(3);
    const results = await Promise.all(
      projects.map((p) =>
        limit(async () => {
          try {
            return await recoverPermissionsForExistingFolders(
              prisma,
              { id: p.id, name: p.name },
              accessToken,
              { refreshAccessToken: fetchAutodeskToken },
            );
          } catch (err) {
            logErr(
              `project=${p.name} threw: ${err instanceof Error ? err.message : err}`,
            );
            return { folderCount: 0, permissionCount: 0, permissionFetchFailures: 0, status: "failed", durationMs: 0 };
          }
        }),
      ),
    );

    const totals = results.reduce(
      (acc, r) => {
        acc.folders += r.folderCount;
        acc.perms += r.permissionCount;
        acc.fetchFails += r.permissionFetchFailures;
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      { folders: 0, perms: 0, fetchFails: 0 },
    );

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(
      `Recovery complete: folders=${totals.folders} perms=${totals.perms} ` +
        `fetchFailures=${totals.fetchFails} ok=${totals.ok || 0} partial=${totals.partial || 0} ` +
        `failed=${totals.failed || 0} duration=${durationSec}s across ${projects.length} projects`,
    );
  } catch (err) {
    logErr("Fatal:", err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  log(`Done. exit=${exitCode}`);
  process.exit(exitCode);
}

main();
