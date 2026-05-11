/**
 * scripts/dry-run-folder-crawl.cjs
 *
 * Dry-run BFS folder crawl against the live ACC hub.
 * Performs ZERO DB writes — uses crawlProjectFolders(dryRun: true).
 *
 * Produces: .planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md
 *
 * Usage:
 *   node scripts/dry-run-folder-crawl.cjs
 *
 * Requires: APS_CLIENT_ID, APS_CLIENT_SECRET, DATABASE_URL (or DIRECT_URL) in env.
 */

const path = require("node:path");
const fs = require("node:fs");

const dotenv = (() => {
  try { return require("dotenv"); } catch { return null; }
})();
if (dotenv) dotenv.config();

// Register tsx so we can require() TypeScript helpers directly.
require("tsx/cjs");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";

function ts() {
  return new Date().toISOString();
}
function log(...args) {
  console.log(`[dry-run-crawl ${ts()}]`, ...args);
}
function logErr(...args) {
  console.error(`[dry-run-crawl ${ts()}]`, ...args);
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
    throw new Error(`Autodesk token fetch failed: HTTP ${res.status} — ${raw}`);
  }
  return json.access_token;
}

/**
 * Format milliseconds as "Xm Ys" for display.
 */
function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

/**
 * Pad a string to a given width (left-aligned).
 */
function padEnd(str, n) {
  return String(str).padEnd(n);
}
function padStart(str, n) {
  return String(str).padStart(n);
}

async function main() {
  log("Starting dry-run folder crawl…");

  const prisma = createPrisma();
  let exitCode = 0;

  try {
    // ── Verify zero writes (baseline count) ──────────────────────────────────
    const folderCountBefore = await prisma.accFolder.count();
    const permCountBefore = await prisma.accFolderPermission.count();
    log(`DB baseline — AccFolder: ${folderCountBefore} rows, AccFolderPermission: ${permCountBefore} rows`);

    // ── Auth ─────────────────────────────────────────────────────────────────
    log("Fetching 2-legged APS token…");
    let accessToken;
    try {
      accessToken = await fetchAutodeskToken();
      log("Token acquired.");
    } catch (err) {
      logErr("AUTHENTICATION FAILED:", err && err.message ? err.message : err);
      logErr(
        "Ensure APS_CLIENT_ID and APS_CLIENT_SECRET are set and the app has account:read data:read scopes."
      );
      process.exit(1);
    }

    // ── Hub ID (b.-prefixed) ──────────────────────────────────────────────────
    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow || !hubRow.apsHubId) {
      logErr("No project row with apsHubId found — cannot determine hub.");
      process.exit(1);
    }
    // hubId is stored WITH the b. prefix (Data Management format)
    const hubId = String(hubRow.apsHubId);
    log(`Hub ID: ${hubId}`);

    // ── Active projects ────────────────────────────────────────────────────────
    const projects = await prisma.accProject.findMany({
      where: { status: "active" },
      select: { id: true, name: true, accountId: true },
      orderBy: { name: "asc" },
    });
    log(`Found ${projects.length} active AccProject(s).`);

    if (projects.length === 0) {
      log("No active projects to crawl. Exiting.");
      process.exit(0);
    }

    // ── Load TS crawler ───────────────────────────────────────────────────────
    const { crawlProjectFolders } = require(
      path.resolve(__dirname, "..", "lib", "acc", "folderCrawl.ts")
    );

    // ── Per-project crawl (sequential — clean per-project timing) ─────────────
    const results = [];

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      // AccProject.id is stored WITHOUT b. prefix (Construction Admin format)
      // Data Management endpoint needs b.-prefix
      const projectIdForDM = `b.${project.id}`;
      // BIM360 Docs permissions endpoint needs bare UUID
      const projectIdForPerms = project.id;

      log(`[${i + 1}/${projects.length}] Crawling project: ${project.name} (${project.id})…`);

      let crawlResult;
      try {
        crawlResult = await crawlProjectFolders(
          hubId,
          projectIdForDM,
          projectIdForPerms,
          accessToken,
          {
            dryRun: true,
            softCapMs: 5 * 60_000,   // 5 min
            hardCapMs: 15 * 60_000,  // 15 min
            pLimitConcurrency: 5,
          }
        );
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        logErr(`  Crawl threw for ${project.name}: ${msg}`);
        crawlResult = {
          folders: [],
          permissions: [],
          durationMs: 0,
          status: "failed",
          reason: msg,
        };
      }

      log(
        `  Done: ${crawlResult.folders.length} folders, ${crawlResult.permissions.length} permissions, ` +
        `${fmtMs(crawlResult.durationMs)}, status=${crawlResult.status}` +
        (crawlResult.reason ? ` (${crawlResult.reason})` : "")
      );

      results.push({
        name: project.name,
        id: project.id,
        folders: crawlResult.folders.length,
        permissions: crawlResult.permissions.length,
        durationMs: crawlResult.durationMs,
        status: crawlResult.status,
        reason: crawlResult.reason,
      });
    }

    // ── Verify zero DB writes ─────────────────────────────────────────────────
    const folderCountAfter = await prisma.accFolder.count();
    const permCountAfter = await prisma.accFolderPermission.count();
    const zeroWritesConfirmed =
      folderCountAfter === folderCountBefore && permCountAfter === permCountBefore;
    log(
      `DB after crawl — AccFolder: ${folderCountAfter} rows (delta ${folderCountAfter - folderCountBefore}), ` +
      `AccFolderPermission: ${permCountAfter} rows (delta ${permCountAfter - permCountBefore})`
    );
    if (!zeroWritesConfirmed) {
      logErr("WARNING: DB write count changed during dry-run — review folderCrawl.ts for Prisma calls");
    }

    // ── Hub totals ────────────────────────────────────────────────────────────
    const totalFolders = results.reduce((s, r) => s + r.folders, 0);
    const totalPermissions = results.reduce((s, r) => s + r.permissions, 0);
    const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0);
    // pLimit(5) parallel estimate: assume projects run 5 at a time
    const parallelEstimateMs = totalDurationMs / 5;

    // ── Cadence recommendation ───────────────────────────────────────────────
    const parallelEstimateMin = parallelEstimateMs / 60_000;
    const cadenceRecommendation =
      parallelEstimateMin < 60
        ? "nightly cron + Railway release"
        : "weekly cron + Railway release only (nightly drops out due to crawl length)";

    log(
      `Hub totals: ${totalFolders} folders, ${totalPermissions} permissions, ` +
      `sequential ${fmtMs(totalDurationMs)}, pLimit(5) estimated ${fmtMs(parallelEstimateMs)}`
    );
    log(`Cadence recommendation: ${cadenceRecommendation}`);

    // ── Write CRAWL-ESTIMATE.md ───────────────────────────────────────────────
    const outputDir = path.resolve(
      __dirname,
      "..",
      ".planning",
      "phases",
      "04-folders-folder-role-permissions"
    );
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "CRAWL-ESTIMATE.md");

    // Build per-project table
    const nameW = Math.max(20, ...results.map((r) => r.name.length));
    const header =
      `| ${padEnd("Project", nameW)} | ${padStart("Folders", 9)} | ${padStart("Permissions", 13)} | ${padStart("Duration", 10)} | ${padStart("Status", 8)} |`;
    const separator =
      `|${"-".repeat(nameW + 2)}|${"-".repeat(11)}:|${"-".repeat(15)}:|${"-".repeat(12)}:|${"-".repeat(10)}:|`;

    const rows = results.map((r) =>
      `| ${padEnd(r.name, nameW)} | ${padStart(r.folders, 9)} | ${padStart(r.permissions, 13)} | ${padStart(fmtMs(r.durationMs), 10)} | ${padStart(r.status, 8)} |` +
      (r.reason ? ` <!-- ${r.reason} -->` : "")
    );

    const partialProjects = results.filter((r) => r.status !== "ok");
    const estimateContent = `# CRAWL-ESTIMATE.md
<!-- Generated by scripts/dry-run-folder-crawl.cjs on ${new Date().toISOString()} -->
<!-- Zero DB writes confirmed: ${zeroWritesConfirmed ? "YES" : "NO (see warnings in script output)"} -->

## Per-Project Results

${header}
${separator}
${rows.join("\n")}
${separator}
| ${padEnd("**Hub Total**", nameW)} | ${padStart(totalFolders, 9)} | ${padStart(totalPermissions, 13)} | ${padStart(fmtMs(totalDurationMs), 10)} | ${padStart("—", 8)} |

## Hub Totals

| Metric | Value |
|--------|-------|
| Total projects crawled | ${results.length} |
| Total folders discovered | ${totalFolders} |
| Total role permissions | ${totalPermissions} |
| Sequential duration (all projects) | ${fmtMs(totalDurationMs)} |
| pLimit(5) estimated parallel duration | ${fmtMs(parallelEstimateMs)} (${parallelEstimateMin.toFixed(1)} min) |
| Projects with partial/failed status | ${partialProjects.length} |

${partialProjects.length > 0 ? `### Partial / Failed Projects\n\n${partialProjects.map((r) => `- **${r.name}** — status=${r.status}${r.reason ? `, reason: ${r.reason}` : ""}`).join("\n")}\n` : ""}
## Cadence Recommendation

**${cadenceRecommendation}**

${
  parallelEstimateMin < 60
    ? `Estimated parallel crawl duration is **${parallelEstimateMin.toFixed(1)} min** (< 60 min threshold). ` +
      `A nightly cron is feasible in addition to the Railway release trigger.`
    : `Estimated parallel crawl duration is **${parallelEstimateMin.toFixed(1)} min** (>= 60 min threshold). ` +
      `Nightly cron would risk overlapping crawls. Recommend weekly cron only, ` +
      `plus full crawl on every Railway release.`
}

## Approval Gate

Luis must approve this estimate before Plan 04 wires DB persistence (AccFolder / AccFolderPermission writes).

- [ ] Per-project numbers look plausible (check against ACC console for 1-2 known projects)
- [ ] Hub totals are reasonable
- [ ] Cadence trade-off is acceptable
- [ ] **Type \`approved\` to unblock Plan 04**

_Generated: ${new Date().toISOString()}_
`;

    fs.writeFileSync(outputPath, estimateContent, "utf8");
    log(`CRAWL-ESTIMATE.md written to: ${outputPath}`);

    // ── Final dry-run integrity check ─────────────────────────────────────────
    if (!zeroWritesConfirmed) {
      logErr("CRITICAL: Dry-run integrity failed — DB rows changed. DO NOT proceed to Plan 04.");
      exitCode = 1;
    }

  } catch (err) {
    logErr("Fatal error:", err && err.message ? err.message : err);
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
