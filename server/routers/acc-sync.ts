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
});
