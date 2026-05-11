"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

type SyncFreshnessPillProps = {
  collapsed?: boolean;
};

type PillState = {
  dotClass: string;
  label: string;
  tooltip: string;
};

const ACTIVE_REFETCH_MS = 15_000;       // SYNC-03: 5-30s window while deep sync in flight
const IDLE_REFETCH_MS = 5 * 60_000;     // Idle cadence — pill is informational, not real-time
const ACTIVE_POLL_MS = 15_000;          // Cadence for checking "is a deep sync running?"

/**
 * SyncFreshnessPill — sidebar bottom-section indicator for Quick + Deep Sync freshness.
 *
 * Reads `accSync.getSyncFreshness` (Postgres-sourced — survives Railway container restart).
 * Polling cadence adapts: 15s when a deep sync is pending/running, 5min when idle.
 * Collapsed sidebar shows only the colored dot with a tooltip; expanded shows full label.
 */
export function SyncFreshnessPill({ collapsed = false }: SyncFreshnessPillProps) {
  const activeJobQuery = trpc.accSync.getActiveDeepSyncJob.useQuery(undefined, {
    refetchInterval: ACTIVE_POLL_MS,
    staleTime: 10_000,
  });
  const deepSyncActive = activeJobQuery.data !== null && activeJobQuery.data !== undefined;

  const freshness = trpc.accSync.getSyncFreshness.useQuery(undefined, {
    refetchInterval: deepSyncActive ? ACTIVE_REFETCH_MS : IDLE_REFETCH_MS,
    staleTime: 60_000,
  });

  const state = computePillState(freshness.data, deepSyncActive, freshness.isLoading);

  if (collapsed) {
    return (
      <div className="flex justify-center mb-2" title={state.tooltip}>
        {deepSyncActive ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : (
          <span className={cn("inline-block h-2 w-2 rounded-full", state.dotClass)} aria-label={state.tooltip} />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 mb-2 text-[11px] text-muted-foreground"
      title={state.tooltip}
    >
      {deepSyncActive ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
      ) : (
        <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", state.dotClass)} />
      )}
      <span className="truncate">{state.label}</span>
    </div>
  );
}

type FreshnessData = {
  quick: {
    lastRunAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
  };
  deep: {
    lastRunAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
    lastSuccessCompletedAt: Date | null;
    lastSuccessRequestId: string | null;
  };
};

function computePillState(
  data: FreshnessData | undefined,
  deepSyncActive: boolean,
  isLoading: boolean
): PillState {
  if (isLoading || !data) {
    return {
      dotClass: "bg-zinc-300",
      label: "Loading…",
      tooltip: "Loading sync status…",
    };
  }

  if (deepSyncActive) {
    return {
      dotClass: "bg-primary",
      label: "Deep sync running…",
      tooltip: "A nightly Deep Sync job is currently pending or running",
    };
  }

  // Pick the most recent informative timestamp across both sync types.
  const quickAt = data.quick.lastRunAt ? new Date(data.quick.lastRunAt) : null;
  const deepSuccessAt = data.deep.lastSuccessCompletedAt
    ? new Date(data.deep.lastSuccessCompletedAt)
    : null;

  // Surface failures aggressively — the freshest record decides the visible state.
  // Compare quick.lastRunAt against the latest deep run (success OR failure timestamp).
  const deepRunAt = data.deep.lastRunAt ? new Date(data.deep.lastRunAt) : null;
  const mostRecentRun = pickLatest(quickAt, deepRunAt);

  if (!mostRecentRun) {
    return {
      dotClass: "bg-zinc-300",
      label: "Never synced",
      tooltip: "No sync has run yet — waiting for first deploy or nightly cron",
    };
  }

  // Determine which sync produced the most recent run, then derive its status.
  const isQuickMostRecent =
    quickAt && (!deepRunAt || quickAt.getTime() >= deepRunAt.getTime());
  const status = isQuickMostRecent ? data.quick.lastStatus : data.deep.lastStatus;
  const error = isQuickMostRecent ? data.quick.lastError : data.deep.lastError;
  const ago = formatDistanceToNow(mostRecentRun, { addSuffix: true });

  if (status === "failed") {
    return {
      dotClass: "bg-red-500",
      label: `Sync failed ${ago}`,
      tooltip: error
        ? `Last sync failed ${ago}: ${error}`
        : `Last sync failed ${ago}`,
    };
  }

  if (status === "skipped") {
    // Skipped is not a failure — previous job still in-flight.
    const successAgo = deepSuccessAt
      ? formatDistanceToNow(new Date(deepSuccessAt), { addSuffix: true })
      : ago;
    return {
      dotClass: "bg-amber-400",
      label: `Last synced ${successAgo}`,
      tooltip: `Most recent attempt skipped (previous still in-flight); last successful sync ${successAgo}`,
    };
  }

  // Success (or unknown but-present status — treat as success-color).
  return {
    dotClass: "bg-emerald-500",
    label: `Last synced ${ago}`,
    tooltip: `Last sync succeeded ${ago}`,
  };
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}
