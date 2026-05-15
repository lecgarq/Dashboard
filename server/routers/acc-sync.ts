import { router, protectedProcedure } from "../trpc";

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
    const [lastRun, lastSuccess] = await Promise.all([
      ctx.db.accDcIngestRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ctx.db.accDcIngestRun.findFirst({
        where: { status: "success" },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const now = new Date();
    const lastSuccessAgeHrs = lastSuccess
      ? (now.getTime() - lastSuccess.startedAt.getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY;

    const tokenExpired = !!(
      lastRun?.errorMessage && /401|invalid_grant|token/i.test(lastRun.errorMessage)
    );

    let dcStatus: "green" | "amber" | "red";
    if (tokenExpired || lastSuccessAgeHrs > 36) {
      dcStatus = "red";
    } else if (
      lastSuccessAgeHrs > 24 ||
      lastRun?.status === "partial" ||
      lastRun?.status === "quarantined"
    ) {
      dcStatus = "amber";
    } else {
      dcStatus = "green";
    }

    const nextRunAt = nextScheduledRun(now);
    const hoursUntilNext = (nextRunAt.getTime() - now.getTime()) / 3_600_000;

    const quotaUsedToday =
      lastRun?.startedAt && isSameUtcDay(lastRun.startedAt, now)
        ? lastRun.quotaUsed
        : 0;

    return {
      dcStatus,
      lastRunAt: lastRun?.startedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
      lastSuccessAt: lastSuccess?.startedAt ?? null,
      nextRunInHours: Math.max(0, Math.round(hoursUntilNext)),
      quotaUsedToday,
      quotaCap: 25,
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
    const progress = await ctx.db.accDcBackfillProgress.findMany({
      select: {
        earliestCovered: true,
        latestCovered: true,
        projectCreatedAt: true,
      },
    });
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
    };
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

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
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
