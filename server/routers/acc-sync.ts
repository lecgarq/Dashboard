import { router, protectedProcedure } from "../trpc";

/**
 * accSyncRouter — exposes freshness state for the sidebar pill.
 *
 * SYNC-03 acceptance: status survives Railway container restart because the
 * source of truth is the `SyncMeta` and `AccDataConnectorJob` Postgres tables
 * (populated by plan 01-03's release script + nightly cron), not in-memory state.
 */
export const accSyncRouter = router({
  // Returns the last-known status for Quick Sync (release-step) and Deep Sync (nightly cron).
  // Reads persistent state, not in-memory — survives container restart.
  getSyncFreshness: protectedProcedure.query(async ({ ctx }) => {
    const [quickMeta, deepMeta, latestDeepSuccess] = await Promise.all([
      ctx.db.syncMeta.findUnique({ where: { id: "quick" } }),
      ctx.db.syncMeta.findUnique({ where: { id: "deep" } }),
      ctx.db.accDataConnectorJob.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true, requestId: true },
      }),
    ]);
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
