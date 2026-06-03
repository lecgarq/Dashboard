#!/usr/bin/env node
/**
 * scripts/progress-monitor.cjs
 *
 * Standalone, read-only MTY progress monitor for:
 *   1. Autodesk Data Connector activity extraction
 *   2. Folder/permission crawls
 *
 * Run:   node scripts/progress-monitor.cjs
 * Then:  open http://localhost:4321   (override with PORT=5000)
 *
 * The server reads local Postgres only. It never calls Autodesk and never
 * submits extraction/crawl work, so refreshing this page cannot consume quota.
 */

const path = require("node:path");
const http = require("node:http");
const { PrismaClient, Prisma } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

require("tsx/cjs");
const {
  applySliceCompletion,
  planDailySlice,
  SLICE_DAYS,
} = require(path.resolve(__dirname, "..", "lib", "acc", "dcProgressiveBackfill.ts"));
const {
  buildQuotaBudget,
  limitSlicesToBudget,
  nextDailyQuotaReset,
  DAILY_QUOTA_CAP,
  DAILY_SAFE_REQUEST_BUDGET,
} = require(path.resolve(__dirname, "..", "lib", "acc", "dcQuota.ts"));

const PORT = Number.parseInt(process.env.PORT || "4321", 10);
const DAY_MS = 86_400_000;
const CRAWL_ELIGIBLE = ["never", "partial", "failed"];
const CRAWL_ACTIVE_WINDOW_MS = 10 * 60_000;
const FALLBACK_ALL_TIME_START = new Date("2018-11-23T00:00:00.000Z");
const DATA_CONNECTOR_PROJECT_LIMIT = 50;

const MTY_ALLOWLIST = Object.freeze(
  require(path.resolve(__dirname, "..", "lib", "acc", "mty-allowlist.json")),
);
const MTY_SET = new Set(MTY_ALLOWLIST);

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  console.error("DATABASE_URL or DIRECT_URL must be set (check .env).");
  process.exit(1);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl, max: 3 }),
});

function yesterdayUtc() {
  const now = new Date();
  const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(utcToday.getTime() - 1);
}

function utcMidnight() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / DAY_MS));
}

function minDate(values, fallback) {
  const valid = values.filter(Boolean).map((d) => new Date(d)).filter((d) => Number.isFinite(d.getTime()));
  if (!valid.length) return fallback;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

function rowCount(rows) {
  return Number(rows && rows[0] && rows[0].count ? rows[0].count : 0);
}

function isProgressComplete(projects, yday) {
  return projects.every((p) =>
    p.earliestCovered &&
    p.latestCovered &&
    p.earliestCovered.getTime() <= p.projectCreatedAt.getTime() &&
    p.latestCovered.getTime() >= yday.getTime() &&
    !p.newProjectFlag
  );
}

function simulateProgressiveBackfill(projects, yday) {
  let simulatedProjects = projects.map((p) => ({ ...p }));
  let actualRequests = 0;
  let dailyCadenceDays = 0;
  let plannerCycles = 0;

  for (let guard = 0; guard < 1_000 && !isProgressComplete(simulatedProjects, yday); guard += 1) {
    const plan = planDailySlice(simulatedProjects, yday);
    if (!plan.slices.length) break;

    actualRequests += plan.estimatedQuota;
    dailyCadenceDays += Math.ceil(plan.estimatedQuota / Math.max(1, DAILY_SAFE_REQUEST_BUDGET));
    plannerCycles += 1;

    const byProjectId = new Map(simulatedProjects.map((p) => [p.projectId, p]));
    for (const slice of plan.slices) {
      for (const projectId of slice.projectIds) {
        const prev = byProjectId.get(projectId);
        if (prev) byProjectId.set(projectId, applySliceCompletion(prev, slice));
      }
    }
    simulatedProjects = simulatedProjects.map((p) => byProjectId.get(p.projectId) || p);
  }

  return {
    actualRequests,
    quotaDays: Math.ceil(actualRequests / Math.max(1, DAILY_SAFE_REQUEST_BUDGET)),
    dailyCadenceDays,
    plannerCycles,
  };
}

async function collectExtraction() {
  const todayStart = utcMidnight();
  const yday = yesterdayUtc();
  const mtyIds = Prisma.join(MTY_ALLOWLIST);

  const [
    recentRuns,
    recentLegacyJobs,
    runsToday,
    legacyJobsToday,
    backfillRows,
    accProjects,
    dcProjects,
    dcProjectUserCountRows,
    dcDistinctUserRows,
    activityCountRows,
    latestActivityRows,
    activityProjectRows,
    activityByDay,
    quotaByDay,
    serviceBreakdownRaw,
    actionBreakdownRaw,
    folderLeaderboardRaw,
  ] = await Promise.all([
    prisma.accDcIngestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        startedAt: true,
        status: true,
        projectsProcessed: true,
        quotaUsed: true,
        sliceWindowStart: true,
        sliceWindowEnd: true,
        errorMessage: true,
      },
    }),
    prisma.accDataConnectorJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        requestId: true,
        status: true,
        dateRange: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
      },
    }),
    prisma.accDcIngestRun.findMany({
      where: { startedAt: { gte: todayStart } },
      select: { quotaUsed: true, projectsProcessed: true },
    }),
    prisma.accDataConnectorJob.count({ where: { startedAt: { gte: todayStart } } }),
    prisma.accDcBackfillProgress.findMany({ where: { projectId: { in: MTY_ALLOWLIST } } }),
    prisma.accProject.findMany({
      where: { id: { in: MTY_ALLOWLIST } },
      select: { id: true, name: true, createdAt: true, folderCrawlStatus: true },
    }),
    prisma.accDcProject.findMany({
      where: { id: { in: MTY_ALLOWLIST } },
      select: { id: true, name: true, createdAt: true, status: true },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "AccDcProjectUser"
      WHERE "projectId" IN (${mtyIds})
    `,
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT "userId")::int AS count
      FROM "AccDcProjectUser"
      WHERE "projectId" IN (${mtyIds})
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
    `,
    prisma.$queryRaw`
      SELECT MAX("createdAt") AS latest
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
    `,
    prisma.$queryRaw`
      SELECT "projectId", COUNT(*)::int AS count, MAX("createdAt") AS latest
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
      GROUP BY "projectId"
      ORDER BY count DESC
    `,
    prisma.$queryRaw`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*)::int AS rows
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
        AND "createdAt" >= (now() - interval '20 days')
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw`
      WITH quota_days AS (
        SELECT date_trunc('day', "startedAt") AS d, SUM("quotaUsed")::int AS requests
        FROM "AccDcIngestRun"
        WHERE "startedAt" >= (now() - interval '20 days')
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', "startedAt") AS d, COUNT(*)::int AS requests
        FROM "AccDataConnectorJob"
        WHERE "startedAt" >= (now() - interval '20 days')
        GROUP BY 1
      )
      SELECT to_char(d, 'YYYY-MM-DD') AS d, SUM(requests)::int AS quota
      FROM quota_days
      GROUP BY d
      ORDER BY d
    `,
    prisma.$queryRaw`
      SELECT COALESCE(service, 'unknown') AS service, COUNT(*)::int AS count
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
      GROUP BY service
      ORDER BY count DESC
      LIMIT 10
    `,
    prisma.$queryRaw`
      SELECT "rawAction", COUNT(*)::int AS count
      FROM "AccActivity"
      WHERE "projectId" IN (${mtyIds})
      GROUP BY "rawAction"
      ORDER BY count DESC
      LIMIT 10
    `,
    prisma.$queryRaw`
      SELECT "projectId", COUNT(*)::int AS count
      FROM "AccFolder"
      WHERE "projectId" IN (${mtyIds})
      GROUP BY "projectId"
      ORDER BY count DESC
    `,
  ]);

  const accProjectById = new Map(accProjects.map((p) => [p.id, p]));
  const dcProjectById = new Map(dcProjects.map((p) => [p.id, p]));
  const backfillById = new Map(backfillRows.map((p) => [p.projectId, p]));
  const activityByProjectId = new Map(activityProjectRows.map((p) => [p.projectId, p]));
  const oldestCreatedAt = minDate(
    [...accProjects.map((p) => p.createdAt), ...dcProjects.map((p) => p.createdAt)],
    FALLBACK_ALL_TIME_START,
  );

  const nameById = new Map();
  for (const projectId of MTY_ALLOWLIST) {
    const accProject = accProjectById.get(projectId);
    const dcProject = dcProjectById.get(projectId);
    nameById.set(projectId, (accProject && accProject.name) || (dcProject && dcProject.name) || projectId);
  }

  const progress = MTY_ALLOWLIST.map((projectId) => {
    const row = backfillById.get(projectId);
    const accProject = accProjectById.get(projectId);
    const dcProject = dcProjectById.get(projectId);
    return {
      projectId,
      earliestCovered: row ? row.earliestCovered : null,
      latestCovered: row ? row.latestCovered : null,
      projectCreatedAt:
        (row && row.projectCreatedAt) ||
        (dcProject && dcProject.createdAt) ||
        (accProject && accProject.createdAt) ||
        oldestCreatedAt,
      newProjectFlag: row ? row.newProjectFlag : true,
    };
  });

  const runQuotaUsedToday = runsToday.reduce((s, r) => s + (r.quotaUsed || 0), 0);
  const totalQuotaUsedToday = runQuotaUsedToday + legacyJobsToday;
  const projectsProcessedToday = runsToday.reduce((s, r) => s + (r.projectsProcessed || 0), 0);

  const plan = planDailySlice(progress, yday);
  const budget = buildQuotaBudget({ usedToday: totalQuotaUsedToday });
  const limited = limitSlicesToBudget(plan.slices, budget.safeRemainingToday);

  let fullyDone = 0;
  let needsBackward = 0;
  let needsForward = 0;
  let newProjects = 0;
  let progressiveRemainingRequests = 0;
  const backwardList = [];
  const forwardList = [];
  const missingProgressProjects = [];
  const topRemaining = [];

  for (const p of progress) {
    const hasProgress = backfillById.has(p.projectId);
    const isNew = p.newProjectFlag || !p.earliestCovered || !p.latestCovered;
    const createdAt = p.projectCreatedAt || oldestCreatedAt;
    let backDays = 0;
    let fwdDays = 0;
    let requests = 0;

    if (!hasProgress) {
      missingProgressProjects.push({
        name: nameById.get(p.projectId),
        createdAt,
      });
    }

    if (isNew) {
      newProjects += 1;
      backDays = daysBetween(yday, createdAt);
      requests = Math.max(1, Math.ceil(backDays / SLICE_DAYS));
    } else {
      backDays = daysBetween(p.earliestCovered, createdAt);
      fwdDays = daysBetween(yday, p.latestCovered);
      requests = Math.ceil(backDays / SLICE_DAYS) + (fwdDays > 0 ? 1 : 0);
      if (backDays > 0) {
        needsBackward += 1;
        backwardList.push({ name: nameById.get(p.projectId), days: backDays });
      }
      if (fwdDays > 0) {
        needsForward += 1;
        forwardList.push({ name: nameById.get(p.projectId), days: fwdDays });
      }
      if (backDays === 0 && fwdDays === 0) fullyDone += 1;
    }

    progressiveRemainingRequests += requests;
    topRemaining.push({
      projectId: p.projectId,
      name: nameById.get(p.projectId),
      requests,
      days: Math.max(backDays, fwdDays),
    });
  }

  backwardList.sort((a, b) => b.days - a.days);
  forwardList.sort((a, b) => b.days - a.days);
  missingProgressProjects.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  topRemaining.sort((a, b) => b.requests - a.requests || b.days - a.days);

  const topMtyActivity = activityProjectRows.map((row) => ({
    name: nameById.get(row.projectId) || row.projectId,
    count: row.count,
    latest: row.latest,
  }));

  const topMtyFolders = folderLeaderboardRaw.map((row) => ({
    name: nameById.get(row.projectId) || row.projectId,
    count: row.count,
  }));

  const remainingByProjectId = new Map(topRemaining.map((p) => [p.projectId, p]));
  const projectIndex = MTY_ALLOWLIST.map((projectId) => {
    const accProject = accProjectById.get(projectId);
    const activity = activityByProjectId.get(projectId);
    const remaining = remainingByProjectId.get(projectId);
    const backfill = backfillById.get(projectId);
    return {
      id: projectId,
      name: nameById.get(projectId) || projectId,
      activityRows: activity ? activity.count : 0,
      latestActivity: activity ? activity.latest : null,
      crawlStatus: accProject ? accProject.folderCrawlStatus : "missing",
      createdAt: accProject && accProject.createdAt ? accProject.createdAt : null,
      requests: remaining ? remaining.requests : 0,
      hasProgress: Boolean(backfill),
      earliestCovered: backfill ? backfill.earliestCovered : null,
      latestCovered: backfill ? backfill.latestCovered : null,
    };
  }).sort((a, b) => b.requests - a.requests || b.activityRows - a.activityRows || a.name.localeCompare(b.name));

  const rowsLast7 = activityByDay
    .filter((r) => new Date(r.d).getTime() >= Date.now() - 7 * DAY_MS)
    .reduce((sum, r) => sum + r.rows, 0);

  const allTimeRequests = Math.ceil(MTY_ALLOWLIST.length / DATA_CONNECTOR_PROJECT_LIMIT);
  const noActivityCount = MTY_ALLOWLIST.filter((projectId) => !activityByProjectId.has(projectId)).length;
  const progressiveSimulation = simulateProgressiveBackfill(progress, yday);
  const sliceByReason = { "new-project": 0, backward: 0, forward: 0 };
  for (const slice of plan.slices) {
    sliceByReason[slice.reason] = (sliceByReason[slice.reason] || 0) + 1;
  }

  const recentJobs = [
    ...recentRuns.map((run) => ({
      kind: "ingest-run",
      startedAt: run.startedAt,
      status: run.status,
      quota: run.quotaUsed,
      projects: run.projectsProcessed,
      windowStart: run.sliceWindowStart,
      windowEnd: run.sliceWindowEnd,
      message: run.errorMessage || "",
    })),
    ...recentLegacyJobs.map((job) => ({
      kind: "legacy-job",
      startedAt: job.startedAt,
      status: job.status,
      quota: 1,
      projects: null,
      windowStart: null,
      windowEnd: null,
      message: job.errorMessage || job.dateRange || job.requestId || "",
    })),
  ]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 10);

  return {
    scope: {
      label: "MTY",
      allowlistProjects: MTY_ALLOWLIST.length,
      projectRows: accProjects.length,
      dcProjectRows: dcProjects.length,
      oldestProjectCreatedAt: oldestCreatedAt,
    },
    latest: recentJobs[0] || null,
    recentJobs,
    quota: {
      usedToday: totalQuotaUsedToday,
      runQuotaUsedToday,
      legacyJobQuotaUsedToday: legacyJobsToday,
      cap: DAILY_QUOTA_CAP,
      safeBudget: DAILY_SAFE_REQUEST_BUDGET,
      safeRemaining: budget.safeRemainingToday,
      hardRemaining: budget.hardRemainingToday,
      reserve: budget.reserveRequests,
      nextReset: nextDailyQuotaReset().toISOString(),
      projectsProcessedToday,
    },
    allTimeBatch: {
      projects: MTY_ALLOWLIST.length,
      chunkSize: DATA_CONNECTOR_PROJECT_LIMIT,
      requests: allTimeRequests,
      quotaDays: Math.ceil(allTimeRequests / Math.max(1, DAILY_SAFE_REQUEST_BUDGET)),
      runnableNow: Math.min(allTimeRequests, budget.safeRemainingToday),
      canRunNow: budget.safeRemainingToday >= allTimeRequests,
      nextRunnableAt: budget.safeRemainingToday >= allTimeRequests ? new Date().toISOString() : nextDailyQuotaReset().toISOString(),
      start: oldestCreatedAt,
      end: yday,
    },
    progressive: {
      totalProjects: progress.length,
      fullyDone,
      needsBackward,
      needsForward,
      newProjects,
      missingProgress: missingProgressProjects.length,
      noActivity: noActivityCount,
      remainingRequests: progressiveRemainingRequests,
      projectWindows: progressiveRemainingRequests,
      batchedRequests: progressiveSimulation.actualRequests,
      batchedQuotaDays: progressiveSimulation.quotaDays,
      dailyCadenceDays: progressiveSimulation.dailyCadenceDays,
      plannerCycles: progressiveSimulation.plannerCycles,
      etaDays: progressiveSimulation.quotaDays,
      nextRun: {
        plannedRequests: plan.estimatedQuota,
        plannedProjects: plan.totalProjects,
        sliceByReason,
        runnableNow: limited.runnableRequests,
        deferred: limited.deferredRequests,
        runnableSlices: limited.runnableSlices.slice(0, 8).map((slice) => ({
          reason: slice.reason,
          projects: slice.projectIds.length,
          start: slice.start.toISOString(),
          end: slice.end.toISOString(),
        })),
      },
    },
    coverage: {
      dcProjects: dcProjects.length,
      projectUsers: rowCount(dcProjectUserCountRows),
      distinctUsers: rowCount(dcDistinctUserRows),
      activities: rowCount(activityCountRows),
      latestActivity: latestActivityRows[0] ? latestActivityRows[0].latest : null,
      rowsLast7,
    },
    history: {
      activityByDay,
      quotaByDay,
    },
    lists: {
      projectIndex,
      historyGaps: backwardList,
      recentGaps: forwardList,
      missingProgress: missingProgressProjects,
      topRemaining,
      topActivity: topMtyActivity,
      topFolders: topMtyFolders,
    },
    telemetry: {
      serviceBreakdown: serviceBreakdownRaw,
      actionBreakdown: actionBreakdownRaw,
    },
  };
}

async function collectCrawl() {
  const mtyIds = Prisma.join(MTY_ALLOWLIST);
  const [groups, activeCount, folderCount, permCountRows, lastFolderWrite, recent, eligible] = await Promise.all([
    prisma.accProject.groupBy({
      by: ["folderCrawlStatus"],
      where: { id: { in: MTY_ALLOWLIST } },
      _count: { _all: true },
    }),
    prisma.accProject.count({ where: { id: { in: MTY_ALLOWLIST }, status: "active" } }),
    prisma.accFolder.count({ where: { projectId: { in: MTY_ALLOWLIST } } }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "AccFolderPermission" p
      INNER JOIN "AccFolder" f ON f.id = p."folderId"
      WHERE f."projectId" IN (${mtyIds})
    `,
    prisma.accFolder.aggregate({
      where: { projectId: { in: MTY_ALLOWLIST } },
      _max: { syncedAt: true },
    }),
    prisma.accProject.findMany({
      where: { id: { in: MTY_ALLOWLIST }, folderCrawlStatus: { not: "never" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { id: true, name: true, folderCrawlStatus: true, updatedAt: true },
    }),
    prisma.accProject.findMany({
      where: {
        id: { in: MTY_ALLOWLIST },
        status: "active",
        folderCrawlStatus: { in: CRAWL_ELIGIBLE },
      },
      orderBy: { name: "asc" },
      take: 20,
      select: { id: true, name: true, folderCrawlStatus: true },
    }),
  ]);

  const crawl = { ok: 0, partial: 0, failed: 0, inaccessible: 0, never: 0 };
  let statusRows = 0;
  for (const group of groups) {
    crawl[group.folderCrawlStatus] = group._count._all;
    statusRows += group._count._all;
  }
  const missingRows = Math.max(0, MTY_ALLOWLIST.length - statusRows);
  crawl.never += missingRows;

  const lastWrite = lastFolderWrite._max.syncedAt;
  const recentlyActive =
    (recent[0] && Date.now() - new Date(recent[0].updatedAt).getTime() < CRAWL_ACTIVE_WINDOW_MS) ||
    (lastWrite && Date.now() - new Date(lastWrite).getTime() < CRAWL_ACTIVE_WINDOW_MS);

  return {
    ...crawl,
    total: MTY_ALLOWLIST.length,
    attempted: MTY_ALLOWLIST.length - (crawl.never || 0),
    active: activeCount,
    folders: folderCount,
    permissions: rowCount(permCountRows),
    lastWrite,
    isActive: Boolean(recentlyActive),
    eligibleNow: eligible.length,
    queue: eligible.map((p) => ({ name: p.name, status: p.folderCrawlStatus })),
    recent: recent.map((p) => ({
      name: p.name,
      status: p.folderCrawlStatus,
      updatedAt: p.updatedAt,
    })),
  };
}

async function collectStatus() {
  const [extraction, crawl] = await Promise.all([collectExtraction(), collectCrawl()]);
  return { now: new Date().toISOString(), extraction, crawl };
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MTY Data Monitor</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0d10;
    --panel: #14181d;
    --panel-2: #101419;
    --line: #252b33;
    --text: #eef2f6;
    --muted: #8b98a7;
    --soft: #b8c3cf;
    --good: #3fc17f;
    --warn: #e7b84b;
    --bad: #e26d6d;
    --blue: #65a8ff;
    --cyan: #57c7d4;
    --ink: #06080a;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 24px clamp(16px, 4vw, 48px) 40px;
  }
  .shell { max-width: 1440px; margin: 0 auto; }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--line);
  }
  h1 { margin: 0; font-size: 22px; letter-spacing: 0; font-weight: 680; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .statusline { color: var(--muted); font-size: 12px; text-align: right; white-space: nowrap; }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin: 0 -2px;
    padding: 12px 2px;
    background: rgba(11, 13, 16, .94);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(37, 43, 51, .85);
  }
  .searchbox {
    width: 100%;
    min-height: 38px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    color: var(--text);
    padding: 8px 11px;
    font: inherit;
    outline: none;
  }
  .searchbox:focus { border-color: rgba(101,168,255,.8); box-shadow: 0 0 0 3px rgba(101,168,255,.12); }
  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .control-btn, .navlink {
    min-height: 34px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--soft);
    padding: 7px 10px;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
    cursor: pointer;
  }
  .control-btn:hover, .navlink:hover { border-color: rgba(101,168,255,.55); color: var(--text); }
  .nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 7px; background: var(--muted); }
  .dot.live { background: var(--good); }
  .dot.warn { background: var(--warn); }
  .dot.bad { background: var(--bad); }
  .section {
    margin: 26px 0 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 11px;
    font-weight: 700;
  }
  .section-block { scroll-margin-top: 74px; }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 26px 0 10px;
  }
  .section-head .section { margin: 0; }
  .section-meta { color: var(--muted); font-size: 12px; font-weight: 600; text-align: right; }
  .section-toggle {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--soft);
    padding: 5px 9px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .section-toggle:hover { border-color: rgba(101,168,255,.55); color: var(--text); }
  .section-body { display: block; }
  .section-block.collapsed .section-body { display: none; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(12, 1fr); }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
    min-width: 0;
  }
  .span-3 { grid-column: span 3; }
  .span-4 { grid-column: span 4; }
  .span-5 { grid-column: span 5; }
  .span-6 { grid-column: span 6; }
  .span-7 { grid-column: span 7; }
  .span-8 { grid-column: span 8; }
  .span-12 { grid-column: span 12; }
  .label { color: var(--muted); font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; }
  .metric { margin-top: 6px; font-size: clamp(26px, 4vw, 40px); line-height: 1; font-weight: 720; letter-spacing: 0; }
  .metric small { font-size: 13px; color: var(--muted); font-weight: 500; }
  .note { color: var(--muted); font-size: 12px; margin-top: 9px; }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .row:last-child { border-bottom: 0; }
  .k { color: var(--muted); min-width: 0; }
  .v { color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; }
  .good { color: var(--good); }
  .warn { color: var(--warn); }
  .bad { color: var(--bad); }
  .muted { color: var(--muted); }
  .bar {
    height: 10px;
    background: #222832;
    border-radius: 999px;
    overflow: hidden;
    display: flex;
    margin: 13px 0 10px;
  }
  .bar span { display: block; height: 100%; min-width: 0; }
  .seg-good { background: var(--good); }
  .seg-warn { background: var(--warn); }
  .seg-bad { background: var(--bad); }
  .seg-blue { background: var(--blue); }
  .seg-muted { background: #48515d; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px 14px; color: var(--muted); font-size: 12px; }
  .legend span::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
    margin-right: 6px;
    background: var(--muted);
  }
  .lg-good::before { background: var(--good) !important; }
  .lg-warn::before { background: var(--warn) !important; }
  .lg-bad::before { background: var(--bad) !important; }
  .lg-blue::before { background: var(--blue) !important; }
  .lg-muted::before { background: #48515d !important; }
  .pill {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--soft);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    white-space: nowrap;
  }
  .pill.good { color: var(--good); border-color: rgba(63,193,127,.35); }
  .pill.warn { color: var(--warn); border-color: rgba(231,184,75,.35); }
  .pill.bad { color: var(--bad); border-color: rgba(226,109,109,.35); }
  .pill.blue { color: var(--blue); border-color: rgba(101,168,255,.35); }
  .list {
    margin-top: 8px;
    max-height: 300px;
    overflow: auto;
    padding-right: 4px;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .expanded-lists .list { max-height: 620px; }
  .result-count { color: var(--muted); font-size: 12px; margin-top: 8px; }
  .li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .li:last-child { border-bottom: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .subline { color: var(--muted); font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th, td { padding: 8px 8px; border-bottom: 1px solid rgba(255,255,255,.06); text-align: left; }
  th { color: var(--muted); font-weight: 650; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .chart { display: flex; align-items: flex-end; gap: 3px; height: 96px; margin-top: 12px; }
  .col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .colbar { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; }
  .axis { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 5px; }
  .error {
    margin-top: 16px;
    border: 1px solid rgba(226,109,109,.35);
    background: rgba(226,109,109,.08);
    color: #ffb5b5;
    border-radius: 8px;
    padding: 12px 14px;
  }
  @media (max-width: 1100px) {
    .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 6; }
  }
  @media (max-width: 720px) {
    body { padding: 18px 14px 30px; }
    header { display: block; }
    .statusline { margin-top: 10px; text-align: left; white-space: normal; }
    .toolbar { grid-template-columns: 1fr; }
    .controls { justify-content: flex-start; }
    .nav { width: 100%; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
    .grid { grid-template-columns: 1fr; }
    .span-3, .span-4, .span-5, .span-6, .span-7, .span-8, .span-12 { grid-column: span 1; }
    .metric { font-size: 30px; }
  }
</style>
</head>
<body>
<div class="shell">
  <header>
    <div>
      <h1>MTY Data Monitor</h1>
      <div class="sub">Read-only local status for Monterrey activity extraction, quota, and folder crawls.</div>
    </div>
    <div class="statusline"><span id="status-dot" class="dot"></span><span id="clock">connecting...</span></div>
  </header>

  <div class="toolbar" aria-label="Monitor controls">
    <input id="global-search" class="searchbox" type="search" placeholder="Search projects, actions, services, crawl status..." autocomplete="off" />
    <div class="controls">
      <nav class="nav" aria-label="Sections">
        <a class="navlink" href="#snapshot">Snapshot</a>
        <a class="navlink" href="#quota">Quota</a>
        <a class="navlink" href="#crawl">Crawl</a>
        <a class="navlink" href="#projects">Projects</a>
        <a class="navlink" href="#jobs">Jobs</a>
      </nav>
      <button id="clear-search" class="control-btn" type="button">Clear</button>
      <button id="toggle-lists" class="control-btn" type="button">Expand lists</button>
      <button id="collapse-all" class="control-btn" type="button">Collapse all</button>
      <button id="expand-all" class="control-btn" type="button">Expand all</button>
      <button id="top-button" class="control-btn" type="button">Top</button>
    </div>
  </div>

  <div id="app">
    <div class="section">Loading</div>
    <div class="card">Waiting for /api/status...</div>
  </div>
</div>

<script>
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c];
  });
};
var fmt = function (n) { return n == null ? "-" : Number(n).toLocaleString(); };
var pct = function (n, d) { return d ? Math.max(0, Math.min(100, Math.round((Number(n) / Number(d)) * 100))) : 0; };
var day = function (iso) { return iso ? new Date(iso).toISOString().slice(0, 10) : "-"; };
var date = function (iso) { return iso ? new Date(iso).toLocaleString() : "-"; };
var ago = function (iso) {
  if (!iso) return "never";
  var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};
var inFuture = function (iso) {
  var s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return "now";
  if (s < 3600) return "in " + Math.ceil(s / 60) + "m";
  return "in " + Math.floor(s / 3600) + "h " + Math.ceil((s % 3600) / 60) + "m";
};
var pillClass = function (value) {
  if (["success", "ok", "ready"].indexOf(value) >= 0) return "good";
  if (["quota-paused", "partial", "waiting", "never", "new-project"].indexOf(value) >= 0) return "warn";
  if (["failed", "inaccessible", "blocked"].indexOf(value) >= 0) return "bad";
  if (["running", "backward", "forward", "legacy-job", "ingest-run"].indexOf(value) >= 0) return "blue";
  return "";
};
var pill = function (value) {
  var v = String(value || "unknown");
  return '<span class="pill ' + pillClass(v) + '">' + esc(v) + '</span>';
};
var bars = function (segments, total) {
  return '<div class="bar">' + segments.map(function (s) {
    return '<span class="' + s.cls + '" style="width:' + pct(s.value, total) + '%"></span>';
  }).join("") + '</div>';
};
var rows = function (items) {
  return items.map(function (r) {
    return '<div class="row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + r[1] + '</span></div>';
  }).join("");
};
var list = function (items, empty) {
  if (!items || !items.length) return '<div class="note">' + esc(empty || "No rows.") + '</div>';
  return '<div class="list">' + items.join("") + '</div>';
};
var lastData = null;
var searchText = "";
var expandedLists = false;
var sectionIds = ["snapshot", "quota", "crawl", "breakdown", "projects", "trend", "jobs"];
var collapsedSections = {};
function normalizedSearch() {
  return String(searchText || "").trim().toLowerCase();
}
function matchesSearch(parts) {
  var q = normalizedSearch();
  if (!q) return true;
  return parts.filter(function (p) { return p != null; }).join(" ").toLowerCase().indexOf(q) >= 0;
}
function filteredItems(items, partsFn) {
  var source = items || [];
  return source.filter(function (item) { return matchesSearch(partsFn(item)); });
}
function listHeader(visible, total) {
  if (!normalizedSearch()) return '<div class="result-count">' + fmt(total) + ' rows</div>';
  return '<div class="result-count">Showing ' + fmt(visible) + ' of ' + fmt(total) + ' matches</div>';
}
function searchableList(items, partsFn, renderFn, empty) {
  var source = items || [];
  var visible = filteredItems(source, partsFn);
  return listHeader(visible.length, source.length) + list(visible.map(renderFn), empty || "No matching rows.");
}
function namedList(items, valueFn, partsFn) {
  return searchableList(
    items,
    partsFn || function (p) { return [p.name, valueFn(p)]; },
    function (p, idx) {
      return '<div class="li"><span class="name">#' + (idx + 1) + ' ' + esc(p.name) + '</span><span class="v">' + valueFn(p) + '</span></div>';
    },
    "No matching projects."
  );
}
function sectionBlock(id, title, content, meta) {
  var collapsed = Boolean(collapsedSections[id]);
  return '<section id="' + id + '" class="section-block ' + (collapsed ? "collapsed" : "") + '">' +
    '<div class="section-head">' +
      '<div><div class="section">' + esc(title) + '</div>' + (meta ? '<div class="section-meta">' + meta + '</div>' : '') + '</div>' +
      '<button class="section-toggle" type="button" onclick="toggleSection(&quot;' + id + '&quot;)">' + (collapsed ? "Expand" : "Collapse") + '</button>' +
    '</div>' +
    '<div class="section-body">' + content + '</div>' +
  '</section>';
}
function setSearch(value) {
  searchText = value || "";
  if (lastData) render(lastData);
}
function toggleSection(id) {
  collapsedSections[id] = !collapsedSections[id];
  if (lastData) render(lastData);
}
function collapseAllSections() {
  sectionIds.forEach(function (id) { collapsedSections[id] = true; });
  if (lastData) render(lastData);
}
function expandAllSections() {
  collapsedSections = {};
  if (lastData) render(lastData);
}
function toggleListHeight() {
  expandedLists = !expandedLists;
  if (lastData) render(lastData);
}
function bindControls() {
  var search = document.getElementById("global-search");
  var clear = document.getElementById("clear-search");
  var listToggle = document.getElementById("toggle-lists");
  var collapseAll = document.getElementById("collapse-all");
  var expandAll = document.getElementById("expand-all");
  var topButton = document.getElementById("top-button");
  if (search) search.addEventListener("input", function (event) { setSearch(event.target.value); });
  if (clear) clear.addEventListener("click", function () {
    searchText = "";
    if (search) search.value = "";
    if (lastData) render(lastData);
  });
  if (listToggle) listToggle.addEventListener("click", toggleListHeight);
  if (collapseAll) collapseAll.addEventListener("click", collapseAllSections);
  if (expandAll) expandAll.addEventListener("click", expandAllSections);
  if (topButton) topButton.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
}
function simpleChart(series, color, unit) {
  var byDay = new Map((series || []).map(function (r) { return [r.d, Number(r.rows || r.quota || 0)]; }));
  var days = [];
  for (var i = 19; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return byDay.get(d) || 0; })));
  var html = days.map(function (d) {
    var value = byDay.get(d) || 0;
    var height = Math.max(2, Math.round((value / max) * 100));
    return '<div class="col" title="' + d + ': ' + fmt(value) + ' ' + unit + '">' +
      '<div class="colbar" style="height:' + height + '%;background:' + color + '"></div></div>';
  }).join("");
  return '<div class="chart">' + html + '</div>' +
    '<div class="axis"><span>' + days[0].slice(5) + '</span><span>peak ' + fmt(max) + ' ' + unit + '</span><span>' + days[days.length - 1].slice(5) + '</span></div>';
}
function projectExplorer(items) {
  return searchableList(
    items,
    function (p) { return [p.name, p.id, p.crawlStatus, p.activityRows, p.requests, p.hasProgress ? "progress" : "no progress"]; },
    function (p) {
      return '<div class="li">' +
        '<span><span class="name">' + esc(p.name) + '</span>' +
        '<div class="subline">' + esc(p.id) + ' | latest ' + day(p.latestActivity) + ' | coverage ' + (p.hasProgress ? day(p.earliestCovered) + ' to ' + day(p.latestCovered) : 'none') + '</div></span>' +
        '<span class="v">' + fmt(p.activityRows) + ' rows | ' + fmt(p.requests) + ' req | ' + pill(p.crawlStatus) + '</span>' +
      '</div>';
    },
    "No matching MTY projects."
  );
}
function render(data) {
  var x = data.extraction;
  var c = data.crawl;
  var q = x.quota;
  var coverage = x.coverage;
  var progressive = x.progressive;
  var allTime = x.allTimeBatch;
  var latestAgeDays = coverage.latestActivity ? (Date.now() - new Date(coverage.latestActivity).getTime()) / 86400000 : Infinity;
  var healthy = latestAgeDays <= 2;
  var quotaState = q.safeRemaining >= allTime.requests ? "ready" : "waiting";
  var completePct = pct(progressive.fullyDone, progressive.totalProjects);
  var crawlPct = pct(c.attempted, c.total);
  var app = document.getElementById("app");
  var search = document.getElementById("global-search");
  var listToggle = document.getElementById("toggle-lists");
  var query = normalizedSearch();
  if (search && search.value !== searchText) search.value = searchText;
  if (listToggle) listToggle.textContent = expandedLists ? "Compact lists" : "Expand lists";
  app.className = expandedLists ? "expanded-lists" : "";

  var snapshot =
    '<div class="grid">' +
      '<div class="card span-3"><div class="label">MTY projects</div><div class="metric">' + fmt(x.scope.allowlistProjects) + '</div><div class="note">' + fmt(x.scope.projectRows) + ' project rows, ' + fmt(x.scope.dcProjectRows) + ' DC project rows</div></div>' +
      '<div class="card span-3"><div class="label">Activity rows</div><div class="metric">' + fmt(coverage.activities) + '</div><div class="note">' + fmt(coverage.rowsLast7) + ' event rows in the last 7 days</div></div>' +
      '<div class="card span-3"><div class="label">MTY users</div><div class="metric">' + fmt(coverage.distinctUsers) + '</div><div class="note">' + fmt(coverage.projectUsers) + ' project-user memberships</div></div>' +
      '<div class="card span-3"><div class="label">Latest activity</div><div class="metric">' + (healthy ? '<span class="good">Current</span>' : '<span class="warn">Stale</span>') + '</div><div class="note">' + date(coverage.latestActivity) + ' (' + ago(coverage.latestActivity) + ')</div></div>' +
    '</div>';

  var quota =
    '<div class="grid">' +
      '<div class="card span-4">' +
        '<div class="label">Quota gate</div>' +
        '<div class="metric ' + (q.safeRemaining >= allTime.requests ? 'good' : 'warn') + '">' + fmt(q.safeRemaining) + ' <small>safe left</small></div>' +
        bars([{ cls: "seg-good", value: Math.min(q.usedToday, q.safeBudget) }, { cls: "seg-warn", value: Math.max(0, q.usedToday - q.safeBudget) }], q.cap) +
        '<div class="legend"><span class="lg-good">safe used ' + fmt(Math.min(q.usedToday, q.safeBudget)) + '</span><span class="lg-warn">reserve used ' + fmt(Math.max(0, q.usedToday - q.safeBudget)) + '</span><span class="lg-muted">hard cap ' + fmt(q.cap) + '</span></div>' +
        rows([["Used today", fmt(q.usedToday) + " / " + fmt(q.cap)], ["Official runs", fmt(q.runQuotaUsedToday)], ["Legacy jobs", fmt(q.legacyJobQuotaUsedToday)], ["Reset", inFuture(q.nextReset) + " (" + day(q.nextReset) + " UTC)"]]) +
      '</div>' +
      '<div class="card span-4">' +
        '<div class="label">All-time MTY batch</div>' +
        '<div class="metric ' + (quotaState === "ready" ? "good" : "warn") + '">' + fmt(allTime.quotaDays) + ' <small>quota day' + (allTime.quotaDays === 1 ? "" : "s") + '</small></div>' +
        rows([["Status", pill(quotaState)], ["Requests needed", fmt(allTime.requests) + " / " + fmt(q.safeBudget) + " safe daily budget"], ["Earliest execution", allTime.canRunNow ? "today" : "after reset " + inFuture(allTime.nextRunnableAt)], ["Projects", fmt(allTime.projects) + " at " + fmt(allTime.chunkSize) + " per request"], ["Window", day(allTime.start) + " to " + day(allTime.end)], ["Runnable now", fmt(allTime.runnableNow) + " / " + fmt(allTime.requests)]]) +
        '<div class="note">This is the quota-safe custom extraction shape for MTY all-time coverage.</div>' +
      '</div>' +
      '<div class="card span-4">' +
        '<div class="label">Progressive backlog</div>' +
        '<div class="metric">' + fmt(progressive.batchedQuotaDays) + ' <small>quota days</small></div>' +
        rows([["Batched APS requests", fmt(progressive.batchedRequests)], ["Daily planner cadence", "~" + fmt(progressive.dailyCadenceDays) + " days"], ["Per-project 30-day windows", fmt(progressive.projectWindows)], ["Fully backfilled", fmt(progressive.fullyDone) + " / " + fmt(progressive.totalProjects) + " (" + completePct + "%)"], ["No progress row", fmt(progressive.missingProgress)], ["No activity rows", fmt(progressive.noActivity)], ["Next planner run", fmt(progressive.nextRun.runnableNow) + " runnable, " + fmt(progressive.nextRun.deferred) + " deferred"]]) +
      '</div>' +
    '</div>';

  var crawl =
    '<div class="grid">' +
      '<div class="card span-4">' +
        '<div class="label">Folder crawl status</div>' +
        '<div class="metric">' + crawlPct + '% <small>attempted</small></div>' +
        bars([{ cls: "seg-good", value: c.ok }, { cls: "seg-warn", value: c.partial }, { cls: "seg-bad", value: c.inaccessible + c.failed }, { cls: "seg-muted", value: c.never }], c.total) +
        '<div class="legend"><span class="lg-good">ok ' + fmt(c.ok) + '</span><span class="lg-warn">partial ' + fmt(c.partial) + '</span><span class="lg-bad">blocked ' + fmt((c.inaccessible || 0) + (c.failed || 0)) + '</span><span class="lg-muted">never ' + fmt(c.never) + '</span></div>' +
        rows([["Folders", fmt(c.folders)], ["Permissions", fmt(c.permissions)], ["Last folder write", ago(c.lastWrite)], ["Crawl activity", c.isActive ? pill("running") : pill("idle")]]) +
      '</div>' +
      '<div class="card span-4"><div class="label">Next crawl candidates</div>' +
        searchableList(c.queue || [], function (p) { return [p.name, p.status]; }, function (p) { return '<div class="li"><span class="name">' + esc(p.name) + '</span>' + pill(p.status) + '</div>'; }, "No MTY projects are crawlable right now.") +
      '</div>' +
      '<div class="card span-4"><div class="label">Recently crawled MTY projects</div>' +
        searchableList(c.recent || [], function (p) { return [p.name, p.status, p.updatedAt]; }, function (p) { return '<div class="li"><span class="name">' + esc(p.name) + '</span><span class="muted">' + ago(p.updatedAt) + '</span></div>'; }, "No matching recent crawl rows.") +
      '</div>' +
    '</div>';

  var breakdown =
    '<div class="grid">' +
      '<div class="card span-6"><div class="label">Activity by service</div>' +
        searchableList(x.telemetry.serviceBreakdown || [], function (s) { return [s.service, s.count]; }, function (s) { return '<div class="row"><span class="k">' + esc(s.service) + '</span><span class="v">' + fmt(s.count) + ' <span class="muted">(' + pct(s.count, coverage.activities) + '%)</span></span></div>'; }, "No matching service rows.") +
      '</div>' +
      '<div class="card span-6"><div class="label">Top raw actions</div>' +
        searchableList(x.telemetry.actionBreakdown || [], function (a) { return [a.rawAction, a.count]; }, function (a) { return '<div class="row"><span class="k">' + esc(a.rawAction) + '</span><span class="v">' + fmt(a.count) + ' <span class="muted">(' + pct(a.count, coverage.activities) + '%)</span></span></div>'; }, "No matching action rows.") +
      '</div>' +
      '<div class="card span-6"><div class="label">Top MTY activity rows</div>' + namedList(x.lists.topActivity, function (p) { return fmt(p.count) + " rows"; }) + '</div>' +
      '<div class="card span-6"><div class="label">Top MTY folder counts</div>' + namedList(x.lists.topFolders, function (p) { return fmt(p.count) + " folders"; }) + '</div>' +
      '<div class="card span-6"><div class="label">Largest progressive gaps</div>' + namedList(x.lists.topRemaining, function (p) { return fmt(p.requests) + " requests"; }) + '</div>' +
      '<div class="card span-6"><div class="label">Oldest projects without progress rows</div>' + namedList(x.lists.missingProgress, function (p) { return day(p.createdAt); }) + '</div>' +
    '</div>';

  var projects =
    '<div class="grid">' +
      '<div class="card span-12"><div class="label">MTY project explorer</div>' +
        '<div class="note">Search by project name, project ID, crawl status, progress state, request count, or activity volume.</div>' +
        projectExplorer(x.lists.projectIndex || []) +
      '</div>' +
    '</div>';

  var trend =
    '<div class="grid">' +
      '<div class="card span-6"><div class="label">MTY activity rows by event day</div>' + simpleChart(x.history.activityByDay, "var(--good)", "rows") + '</div>' +
      '<div class="card span-6"><div class="label">Account quota used by submit day</div>' + simpleChart(x.history.quotaByDay, "var(--blue)", "requests") + '<div class="note">Quota is account-level, so this includes legacy jobs and official ingest runs.</div></div>' +
    '</div>';

  var jobs = filteredItems(x.recentJobs || [], function (job) {
    return [job.kind, job.status, job.message, job.startedAt, job.quota, job.projects];
  });
  var jobsContent =
    '<div class="grid">' +
      '<div class="card span-12"><div class="label">Latest Data Connector jobs</div>' +
        listHeader(jobs.length, (x.recentJobs || []).length) +
        '<table><thead><tr><th>Started</th><th>Type</th><th>Status</th><th class="num">Quota</th><th class="num">Projects</th><th>Message</th></tr></thead><tbody>' +
        jobs.map(function (job) {
          return '<tr><td>' + date(job.startedAt) + '</td><td>' + pill(job.kind) + '</td><td>' + pill(job.status) + '</td><td class="num">' + fmt(job.quota) + '</td><td class="num">' + fmt(job.projects) + '</td><td class="muted">' + esc(String(job.message || "").slice(0, 110)) + '</td></tr>';
        }).join("") +
        '</tbody></table>' +
      '</div>' +
    '</div>';

  app.innerHTML =
    (query ? '<div class="note">Filtering list rows for "' + esc(searchText) + '". Summary metrics stay unfiltered.</div>' : '') +
    sectionBlock("snapshot", "MTY Snapshot", snapshot, fmt(x.scope.allowlistProjects) + " allowlisted projects") +
    sectionBlock("quota", "Quota And Next Extraction", quota, q.safeRemaining >= allTime.requests ? "ready" : "waiting for reset") +
    sectionBlock("crawl", "MTY Crawl Coverage", crawl, fmt(c.ok) + " ok / " + fmt((c.inaccessible || 0) + (c.failed || 0)) + " blocked") +
    sectionBlock("breakdown", "MTY Data Breakdown", breakdown, fmt(coverage.activities) + " activity rows") +
    sectionBlock("projects", "Project Explorer", projects, fmt((x.lists.projectIndex || []).length) + " projects") +
    sectionBlock("trend", "Recent Trend", trend, "20 days") +
    sectionBlock("jobs", "Recent Jobs", jobsContent, fmt((x.recentJobs || []).length) + " rows");

  var dot = document.getElementById("status-dot");
  dot.className = "dot " + (q.safeRemaining >= allTime.requests ? "live" : "warn");
  document.getElementById("clock").textContent = "updated " + new Date(data.now).toLocaleTimeString() + " - " + (q.safeRemaining >= allTime.requests ? "MTY batch can run" : "waiting for safe quota");
}
async function tick() {
  try {
    var res = await fetch("/api/status", { cache: "no-store" });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
    lastData = data;
    render(data);
  } catch (err) {
    document.getElementById("status-dot").className = "dot bad";
    document.getElementById("clock").textContent = "error";
    document.getElementById("app").innerHTML = '<div class="error">' + esc(err.message || String(err)) + '</div>';
  }
}
bindControls();
tick();
setInterval(tick, 5000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/status") {
    try {
      const data = await collectStatus();
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
    }
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(PAGE);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("  MTY data monitor running.");
  console.log(`  Open http://localhost:${PORT}`);
  console.log("  Reads local Postgres only. Ctrl+C to stop.");
  console.log("");
});

function shutdown() {
  server.close();
  prisma.$disconnect().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
