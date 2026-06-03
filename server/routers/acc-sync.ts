import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

import {
  isDcExtractionPaused,
  pauseDcExtraction,
  readLatestDcLogLines,
  resumeDcExtraction,
  startDcExtractionProcess,
  type ExtractionStartKind,
} from "@/lib/acc/dcControl";
import { estimateExtractionTiming } from "@/lib/acc/dcEta";
import {
  buildQuotaBudget,
  DAILY_QUOTA_CAP,
  isSameUtcDay,
  nextDailyQuotaReset,
} from "@/lib/acc/dcQuota";
import { planDailySlice, type ProjectProgress } from "@/lib/acc/dcProgressiveBackfill";
import { mapRunStatusToSyncCenterStatus } from "@/lib/acc/syncCenterState";
import {
  buildExtractionPriorityPlan,
  type ExtractionPriorityActivityInput,
} from "@/lib/acc/extractionPriorityPlanner";
import { router, protectedProcedure } from "../trpc";
import { z } from "zod";

/**
 * accSyncRouter — exposes freshness state for the sidebar pill.
 *
 * SYNC-03 acceptance: status survives Railway container restart because the
 * source of truth is the `SyncMeta` and `AccDataConnectorJob` Postgres tables
 * (populated by plan 01-03's release script + nightly cron), not in-memory state.
 *
 * Phase 03-04: extended with Deep-Sync-ingest status (Stage-2 cron writes the
 * latest AccDataConnectorJob terminal row). The pill rolls activity-ingest
 * health into the same surface — no new pill (CONTEXT.md lock).
 *
 * Partial-success heuristic: the Stage-2 cron persists a summary string into
 * SyncMeta('deep').lastError of the form `rowsByFile={"project":N,"admin":M} unresolved=K`
 * even on success. We parse that to distinguish full-success from partial
 * (one CSV ingested zero rows).
 */
type RowsByFile = { project?: number; admin?: number } | null;

type ActivityJobStatus = {
  requestId?: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
};

type DcRunStatus = {
  id?: string | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  errorMessage: string | null;
  quotaUsed?: number;
};

type OperationStatus = {
  source: "dc-run" | "activity-job";
  id: string | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  errorMessage: string | null;
  quotaUsed: number;
};

type ObservedActivityCoverage = {
  rows: number;
  projectsWithActivity: number;
  daysWithActivity: number;
  earliestAt: Date | null;
  latestAt: Date | null;
};

const EXTRACTION_PRIORITY_INPUT = z
  .object({
    windowDays: z.number().int().min(1).max(730).default(30),
    limit: z.number().int().min(1).max(500).default(75),
    quotaLimit: z.number().int().min(0).max(20).default(5),
  })
  .optional();

function parseRowsByFile(raw: string | null | undefined): RowsByFile {
  if (!raw) return null;
  const match = raw.match(/rowsByFile=(\{[^}]*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const project = typeof parsed.project === "number" ? parsed.project : undefined;
    const admin = typeof parsed.admin === "number" ? parsed.admin : undefined;
    return { project, admin };
  } catch {
    return null;
  }
}

function computeIngestState(
  latestJob:
    | { status: string; startedAt: Date; completedAt: Date | null; errorMessage: string | null }
    | null,
  deepMeta: { lastStatus: string | null; lastError: string | null } | null,
): {
  ingestState: "green" | "amber" | "running" | "none";
  partial: boolean;
  lastIngestAt: Date | null;
  lastIngestError: string | null;
} {
  if (!latestJob) {
    return { ingestState: "none", partial: false, lastIngestAt: null, lastIngestError: null };
  }
  if (latestJob.status === "pending" || latestJob.status === "running") {
    return {
      ingestState: "running",
      partial: false,
      lastIngestAt: latestJob.startedAt,
      lastIngestError: null,
    };
  }
  const lastIngestAt = latestJob.completedAt ?? latestJob.startedAt;
  if (latestJob.status === "failed") {
    return {
      ingestState: "amber",
      partial: false,
      lastIngestAt,
      lastIngestError: latestJob.errorMessage ?? deepMeta?.lastError ?? null,
    };
  }
  if (latestJob.status === "success") {
    // Parse the Stage-2 summary for partial-success detection.
    const rowsByFile = parseRowsByFile(deepMeta?.lastError);
    if (rowsByFile) {
      const projectZero = rowsByFile.project === 0;
      const adminZero = rowsByFile.admin === 0;
      // Partial = exactly one of the two CSVs ingested zero rows. Both-zero
      // implies the Data Connector exported an empty window (not a partial run).
      const partial = projectZero !== adminZero;
      if (partial) {
        return {
          ingestState: "amber",
          partial: true,
          lastIngestAt,
          lastIngestError: deepMeta?.lastError ?? null,
        };
      }
    }
    return { ingestState: "green", partial: false, lastIngestAt, lastIngestError: null };
  }
  // Unknown terminal status — treat as amber to surface visibility.
  return {
    ingestState: "amber",
    partial: false,
    lastIngestAt,
    lastIngestError: latestJob.errorMessage ?? null,
  };
}

function activityJobToOperation(job: ActivityJobStatus | null): OperationStatus | null {
  if (!job) return null;
  return {
    source: "activity-job",
    id: job.requestId ?? null,
    status: job.status,
    startedAt: job.startedAt,
    endedAt: job.completedAt,
    errorMessage: job.errorMessage,
    quotaUsed: 1,
  };
}

function dcRunToOperation(run: DcRunStatus | null): OperationStatus | null {
  if (!run) return null;
  return {
    source: "dc-run",
    id: run.id ?? null,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    errorMessage: run.errorMessage,
    quotaUsed: run.quotaUsed ?? 0,
  };
}

function operationEventTime(operation: OperationStatus): Date {
  return operation.endedAt ?? operation.startedAt;
}

function pickLatestOperation(
  run: DcRunStatus | null,
  activityJob: ActivityJobStatus | null,
): OperationStatus | null {
  const runOperation = dcRunToOperation(run);
  const jobOperation = activityJobToOperation(activityJob);
  if (!runOperation) return jobOperation;
  if (!jobOperation) return runOperation;
  return operationEventTime(jobOperation).getTime() >= operationEventTime(runOperation).getTime()
    ? jobOperation
    : runOperation;
}

function activityJobSuccessAt(job: ActivityJobStatus | null): Date | null {
  if (!job || job.status !== "success") return null;
  return job.completedAt ?? job.startedAt;
}

function pickLatestDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function computeDcStatus(input: {
  now: Date;
  latestOperation: OperationStatus | null;
  latestSuccessAt: Date | null;
  tokenExpired: boolean;
}): "green" | "amber" | "red" {
  if (input.tokenExpired) return "red";
  if (!input.latestSuccessAt) return "red";

  const lastSuccessAgeHrs =
    (input.now.getTime() - input.latestSuccessAt.getTime()) / 3_600_000;
  if (lastSuccessAgeHrs > 36) return "red";

  if (
    input.latestOperation?.status === "failed" ||
    input.latestOperation?.status === "quarantined" ||
    input.latestOperation?.status === "partial" ||
    input.latestOperation?.status === "quota-paused" ||
    input.latestOperation?.status === "quota-exceeded"
  ) {
    return "amber";
  }

  if (lastSuccessAgeHrs > 24) return "amber";
  return "green";
}

function countSameUtcDay(rows: Array<{ startedAt: Date }>, now: Date): number {
  return rows.filter((row) => isSameUtcDay(row.startedAt, now)).length;
}

async function loadObservedActivityCoverage(db: PrismaClient): Promise<ObservedActivityCoverage> {
  const [rows, projectRows, dayRows] = await Promise.all([
    db.accActivity.count(),
    db.accActivity.groupBy({
      by: ["projectId"],
      where: { projectId: { not: "" } },
      _count: { _all: true },
    }),
    db.$queryRawUnsafe<
      Array<{ min: Date | null; max: Date | null; days: number | bigint | null }>
    >(
      `SELECT MIN("createdAt") AS min,
              MAX("createdAt") AS max,
              COUNT(DISTINCT date_trunc('day', "createdAt"))::int AS days
       FROM "AccActivity"`,
    ),
  ]);
  const rollup = dayRows[0] ?? { min: null, max: null, days: 0 };
  return {
    rows,
    projectsWithActivity: projectRows.filter((row) => Boolean(row.projectId)).length,
    daysWithActivity: Number(rollup.days ?? 0),
    earliestAt: rollup.min ?? null,
    latestAt: rollup.max ?? null,
  };
}

export const accSyncRouter = router({
  // Returns the last-known status for Quick Sync (release-step) and Deep Sync (nightly cron).
  // Reads persistent state, not in-memory — survives container restart.
  //
  // Phase 03-04: adds `deep.ingestState` / `deep.partial` / `deep.lastIngestAt`
  // / `deep.lastIngestError` derived from the most recent AccDataConnectorJob
  // row. Existing fields preserved verbatim — SyncFreshnessPill callers from
  // SYNC-03 are not broken.
  getSyncFreshness: protectedProcedure.query(async ({ ctx }) => {
    const [quickMeta, deepMeta, latestDeepSuccess, latestJob] = await Promise.all([
      ctx.db.syncMeta.findUnique({ where: { id: "quick" } }),
      ctx.db.syncMeta.findUnique({ where: { id: "deep" } }),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true, requestId: true },
      }),
      ctx.db.accDataConnectorJob.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
    ]);

    const ingest = computeIngestState(
      latestJob,
      deepMeta ? { lastStatus: deepMeta.lastStatus, lastError: deepMeta.lastError } : null,
    );

    return {
      quick: {
        lastRunAt: quickMeta?.lastRunAt ?? null,
        lastStatus: quickMeta?.lastStatus ?? null,
        lastError: quickMeta?.lastError ?? null,
      },
      deep: {
        lastRunAt: deepMeta?.lastRunAt ?? null,
        lastStatus: deepMeta?.lastStatus ?? null,
        lastError: deepMeta?.lastError ?? null,
        lastSuccessCompletedAt: latestDeepSuccess?.completedAt ?? null,
        lastSuccessRequestId: latestDeepSuccess?.requestId ?? null,
        // Phase 03-04 additions — activity-ingest rollup.
        ingestState: ingest.ingestState,
        partial: ingest.partial,
        lastIngestAt: ingest.lastIngestAt,
        lastIngestError: ingest.lastIngestError,
      },
    };
  }),

  // Drives the polling cadence — pill speeds up refetch when a deep sync is in flight.
  // Returns the most recently started non-terminal job, or null if none active.
  getActiveDeepSyncJob: protectedProcedure.query(async ({ ctx }) => {
    const active = await ctx.db.accDataConnectorJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
      select: { requestId: true, status: true, startedAt: true },
    });
    return active ?? null;
  }),

  // ---------------------------------------------------------------------------
  // Phase 08-07 — DC ingest awareness (DC8-14, DC8-15, DC8-16)
  // ---------------------------------------------------------------------------
  //
  // getDcIngestStatus rolls AccDcIngestRun up into a single status object the
  // SyncFreshnessPill renders alongside (not instead of) the Phase 3 quick/deep
  // surfaces. Token-expired detection looks for "401" / "invalid_grant" / "token"
  // tokens in the latest run's errorMessage so the pill can route a click to
  // signIn('autodesk', ...) without the user having to find the Login page.
  //
  // getBackfillProgress aggregates AccDcBackfillProgress rows into a single
  // (months_covered, months_total) tuple — the pill uses it to render
  // "month X of Y" so Luis can answer the CONTEXT promise: "how far has the
  // 2-yr backfill progressed?".
  getDcIngestStatus: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = utcDayStart(now);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const [
      lastRun,
      lastSuccess,
      todayRuns,
      latestActivityJob,
      latestActivitySuccess,
      todayActivityJobs,
    ] = await Promise.all([
      ctx.db.accDcIngestRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ctx.db.accDcIngestRun.findFirst({
        where: { status: "success" },
        orderBy: { startedAt: "desc" },
      }),
      ctx.db.accDcIngestRun.findMany({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
        select: { quotaUsed: true },
      }),
      ctx.db.accDataConnectorJob.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          requestId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
        select: {
          requestId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      ctx.db.accDataConnectorJob.findMany({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
        select: { startedAt: true },
      }),
    ]);

    const tokenExpired = !!(
      (lastRun?.errorMessage && /401|invalid_grant|token/i.test(lastRun.errorMessage)) ||
      (latestActivityJob?.errorMessage && /401|invalid_grant|token/i.test(latestActivityJob.errorMessage))
    );
    const latestOperation = pickLatestOperation(lastRun, latestActivityJob);
    const latestSuccessAt = pickLatestDate(
      lastSuccess?.startedAt ?? null,
      activityJobSuccessAt(latestActivitySuccess),
    );
    const dcStatus = computeDcStatus({
      now,
      latestOperation,
      latestSuccessAt,
      tokenExpired,
    });

    const nextRunAt = nextScheduledRun(now);
    const hoursUntilNext = (nextRunAt.getTime() - now.getTime()) / 3_600_000;

    const quotaUsedToday =
      todayRuns.reduce((sum, run) => sum + run.quotaUsed, 0) +
      countSameUtcDay(todayActivityJobs, now);

    return {
      dcStatus,
      lastRunAt: latestOperation?.startedAt ?? null,
      lastRunStatus: latestOperation?.status ?? null,
      lastSuccessAt: latestSuccessAt,
      nextRunInHours: Math.max(0, Math.round(hoursUntilNext)),
      quotaUsedToday,
      quotaCap: DAILY_QUOTA_CAP,
      diffSummary:
        (lastSuccess?.diffSummary as {
          usersAdded: number;
          usersRemoved: number;
          projectsAdded: number;
          projectsRemoved: number;
        } | null) ?? null,
      unknownModulesSeen: lastSuccess?.unknownModulesSeen ?? [],
      tokenExpired,
    };
  }),

  getBackfillProgress: protectedProcedure.query(async ({ ctx }) => {
    const [progress, activityCoverage] = await Promise.all([
      ctx.db.accDcBackfillProgress.findMany({
        select: {
          earliestCovered: true,
          latestCovered: true,
          projectCreatedAt: true,
        },
      }),
      loadObservedActivityCoverage(ctx.db),
    ]);
    const now = new Date();
    let totalMonths = 0;
    let coveredMonths = 0;
    for (const p of progress) {
      const total = Math.max(1, monthsBetween(p.projectCreatedAt, now));
      const covered =
        p.earliestCovered && p.latestCovered
          ? monthsBetween(p.earliestCovered, p.latestCovered)
          : 0;
      totalMonths += total;
      coveredMonths += covered;
    }
    return {
      monthsCovered: coveredMonths,
      monthsTotal: totalMonths,
      backfillPct: totalMonths > 0 ? coveredMonths / totalMonths : 0,
      projectsTracked: progress.length,
      activityCoverage,
    };
  }),

  getExtractionPriorityPlan: protectedProcedure
    .input(EXTRACTION_PRIORITY_INPUT)
    .query(async ({ ctx, input }) => {
      const windowDays = input?.windowDays ?? 30;
      const now = new Date();
      const windowStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - windowDays + 1,
      ));
      const windowEndExclusive = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      ));

      const [dcProjects, folderProjects, memberCounts, progressRows, activityRows] =
        await Promise.all([
          ctx.db.accDcProject.findMany({
            select: { id: true, name: true, status: true, createdAt: true },
            orderBy: { name: "asc" },
          }),
          ctx.db.accProject.findMany({
            select: { id: true, folderCrawlStatus: true },
          }),
          ctx.db.accDcProjectUser.groupBy({
            by: ["projectId"],
            _count: { userId: true },
          }),
          ctx.db.accDcBackfillProgress.findMany({
            select: {
              projectId: true,
              earliestCovered: true,
              latestCovered: true,
              projectCreatedAt: true,
              newProjectFlag: true,
            },
          }),
          ctx.db.$queryRaw<
            Array<{
              projectId: string;
              rows: number | bigint;
              activeDays: number | bigint;
              services: string[] | null;
              lastActivityAt: Date | null;
            }>
          >`
            SELECT
              NULLIF("projectId", '') AS "projectId",
              COUNT(*)::int AS rows,
              COUNT(DISTINCT date_trunc('day', "createdAt"))::int AS "activeDays",
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(LOWER(service), ''), 'unknown')), NULL) AS services,
              MAX("createdAt") AS "lastActivityAt"
            FROM "AccActivity"
            WHERE "projectId" IS NOT NULL
              AND "projectId" <> ''
              AND "createdAt" >= ${windowStart}
              AND "createdAt" < ${windowEndExclusive}
            GROUP BY NULLIF("projectId", '')
          `,
        ]);

      const folderStatusByProject = new Map(
        folderProjects.map((project) => [project.id, project.folderCrawlStatus]),
      );
      const memberCountByProject = new Map(
        memberCounts.map((row) => [row.projectId, row._count.userId]),
      );
      const activity: ExtractionPriorityActivityInput[] = activityRows
        .filter((row) => Boolean(row.projectId))
        .map((row) => ({
          projectId: row.projectId,
          rows: row.rows,
          activeDays: row.activeDays,
          services: row.services ?? [],
          lastActivityAt: row.lastActivityAt,
        }));

      return buildExtractionPriorityPlan({
        generatedAt: now,
        windowDays,
        limit: input?.limit,
        quotaLimit: input?.quotaLimit,
        projects: dcProjects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          createdAt: project.createdAt,
          folderCrawlStatus: folderStatusByProject.get(project.id) ?? "unknown",
          memberCount: memberCountByProject.get(project.id) ?? 0,
        })),
        activity,
        backfillProgress: progressRows,
      });
    }),

  getSyncCenterStatus: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = utcDayStart(now);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(todayStart.getTime() - 1);

    const [
      lastRun,
      lastSuccess,
      todayRuns,
      progressRows,
      activeLegacyJob,
      latestActivityJob,
      latestActivitySuccess,
      todayActivityJobs,
      activityCoverage,
    ] = await Promise.all([
      ctx.db.accDcIngestRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ctx.db.accDcIngestRun.findFirst({
        where: { status: "success" },
        orderBy: { startedAt: "desc" },
      }),
      ctx.db.accDcIngestRun.findMany({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
        select: { quotaUsed: true },
      }),
      ctx.db.accDcBackfillProgress.findMany(),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: { in: ["pending", "running"] } },
        orderBy: { startedAt: "desc" },
        select: { requestId: true, status: true, startedAt: true },
      }),
      ctx.db.accDataConnectorJob.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          requestId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
        select: {
          requestId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      ctx.db.accDataConnectorJob.findMany({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
        select: { startedAt: true },
      }),
      loadObservedActivityCoverage(ctx.db),
    ]);

    const quotaUsedToday =
      todayRuns.reduce((sum, run) => sum + run.quotaUsed, 0) +
      countSameUtcDay(todayActivityJobs, now);
    const quotaBudget = buildQuotaBudget({ usedToday: quotaUsedToday });
    const projectProgress: ProjectProgress[] = progressRows.map((row) => ({
      projectId: row.projectId,
      earliestCovered: row.earliestCovered,
      latestCovered: row.latestCovered,
      projectCreatedAt: row.projectCreatedAt,
      newProjectFlag: row.newProjectFlag,
    }));
    const plan = planDailySlice(projectProgress, yesterday);
    const paused = isDcExtractionPaused();
    const latestOperation = pickLatestOperation(lastRun, latestActivityJob);
    const mappedStatus = mapRunStatusToSyncCenterStatus(latestOperation?.status);
    const status =
      paused && mappedStatus !== "running"
        ? "paused"
        : quotaBudget.safeRemainingToday === 0 && plan.estimatedQuota > 0
          ? "quota-paused"
          : mappedStatus;
    const timing = estimateExtractionTiming({
      startedAt: latestOperation?.startedAt ?? null,
      endedAt: latestOperation?.endedAt ?? null,
      quotaUsed: latestOperation?.quotaUsed ?? 0,
      plannedRequests: Math.max(plan.estimatedQuota, latestOperation?.quotaUsed ?? 0),
      now,
    });
    const latestLogs = readLatestDcLogLines(process.cwd(), 80);
    const latestSuccessAt = pickLatestDate(
      lastSuccess?.startedAt ?? null,
      activityJobSuccessAt(latestActivitySuccess),
    );

    return {
      status,
      activeJobId:
        mappedStatus === "running" && latestOperation?.source === "dc-run"
          ? latestOperation.id
          : null,
      activeRequestId: activeLegacyJob?.requestId ?? null,
      elapsedTime: timing.elapsedLabel,
      estimatedRemainingTime: timing.remainingLabel,
      completionEstimateDuration: timing.completionDurationLabel,
      completionEstimateTime: timing.completionTime,
      quotaUsedToday,
      quotaRemainingToday: quotaBudget.safeRemainingToday,
      dailyQuotaCap: quotaBudget.dailyQuotaCap,
      dailySafeRequestBudget: quotaBudget.dailySafeRequestBudget,
      reserveRequests: quotaBudget.reserveRequests,
      plannedRequests: plan.estimatedQuota,
      runnableRequestsToday: Math.min(plan.estimatedQuota, quotaBudget.safeRemainingToday),
      deferredRequests: Math.max(0, plan.estimatedQuota - quotaBudget.safeRemainingToday),
      nextSafeRunTime:
        status === "quota-paused" || quotaBudget.safeRemainingToday === 0
          ? nextDailyQuotaReset(now)
          : nextScheduledRun(now),
      paused,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            endedAt: lastRun.endedAt,
            projectsProcessed: lastRun.projectsProcessed,
            quotaUsed: lastRun.quotaUsed,
            errorMessage: lastRun.errorMessage,
          }
        : null,
      lastSuccessAt: latestSuccessAt,
      unknownModulesSeen: lastSuccess?.unknownModulesSeen ?? [],
      activityCoverage,
      latestLogs,
      latestErrors: [
        latestOperation?.errorMessage ?? null,
        ...latestLogs.filter((line) => /error|failed|quota|429/i.test(line)).slice(-10),
      ].filter((line): line is string => Boolean(line)),
    };
  }),

  startDailyExtraction: protectedProcedure.mutation(async ({ ctx }) => {
    return startExtractionIfIdle(ctx, "daily");
  }),

  resumeBackfill: protectedProcedure.mutation(async ({ ctx }) => {
    return startExtractionIfIdle(ctx, "backfill");
  }),

  retryFailedJob: protectedProcedure.mutation(async ({ ctx }) => {
    return startExtractionIfIdle(ctx, "retry");
  }),

  pauseExtraction: protectedProcedure.mutation(() => {
    pauseDcExtraction();
    return { paused: true };
  }),

  resumeExtraction: protectedProcedure.mutation(() => {
    resumeDcExtraction();
    return { paused: false };
  }),
});

// ---------------------------------------------------------------------------
// Helpers (Phase 08-07)
// ---------------------------------------------------------------------------

/**
 * Hermosillo cron runs at 03:00 local. Hermosillo (America/Hermosillo) does
 * NOT observe DST and is UTC-7 year-round, so 03:00 local == 10:00 UTC every
 * day. Returns the next 10:00 UTC instant strictly greater than `now`.
 */
function nextScheduledRun(now: Date): Date {
  const target = new Date(now);
  target.setUTCHours(10, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whole-month delta floor (start..end). Returns 0 when end < start. */
function monthsBetween(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const months = end.getUTCMonth() - start.getUTCMonth();
  let total = years * 12 + months;
  if (end.getUTCDate() < start.getUTCDate()) total -= 1;
  return Math.max(0, total);
}

async function startExtractionIfIdle(
  ctx: { db: PrismaClient },
  kind: ExtractionStartKind,
): Promise<{ started: true; pid: number | null; logPath: string }> {
  const [activeRun, activeLegacyJob] = await Promise.all([
    ctx.db.accDcIngestRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    }),
    ctx.db.accDataConnectorJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
      select: { requestId: true },
    }),
  ]);

  if (activeRun || activeLegacyJob) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Extraction already active (${activeRun?.id ?? activeLegacyJob?.requestId}).`,
    });
  }

  resumeDcExtraction();
  const started = startDcExtractionProcess(kind);
  return { started: true, ...started };
}
