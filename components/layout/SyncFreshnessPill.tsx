"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

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
const DC_REFETCH_MS = 5 * 60_000;       // Phase 08-07: DC ingest status refresh cadence

/**
 * SyncFreshnessPill — sidebar bottom-section indicator for Quick + Deep Sync freshness.
 *
 * Reads `accSync.getSyncFreshness` (Postgres-sourced — survives Railway container restart).
 * Polling cadence adapts: 15s when a deep sync is pending/running, 5min when idle.
 * Collapsed sidebar shows only the colored dot with a tooltip; expanded shows full label.
 *
 * Phase 08-07 — extended with DC ingest awareness (DC8-14, DC8-15):
 *   - Reads accSync.getDcIngestStatus + getBackfillProgress.
 *   - Overall pill color = worst of {phase-3 freshness, dc.dcStatus} (red > amber > green).
 *   - Tooltip body enriched with: DC last success, backfill progress, next-run countdown,
 *     quota used today, 24h diff summary, unknown-modules detected.
 *   - Click handler: if dc.tokenExpired -> signIn('autodesk', { callbackUrl }).
 *     Otherwise click is a no-op (pill stays read-only per feedback_no_manual_sync_ui.md).
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

  // Phase 08-07 — DC ingest status + backfill rollup.
  const dc = trpc.accSync.getDcIngestStatus.useQuery(undefined, {
    refetchInterval: DC_REFETCH_MS,
    staleTime: 60_000,
  });
  const backfill = trpc.accSync.getBackfillProgress.useQuery(undefined, {
    refetchInterval: DC_REFETCH_MS,
    staleTime: 60_000,
  });

  const baseState = computePillState(freshness.data, deepSyncActive, freshness.isLoading);
  const state = mergeWithDcState(baseState, dc.data, backfill.data);

  // tokenExpired drives the click-to-reauth path. Cursor flips to pointer only when
  // the click will actually do something (i.e. signIn is wired).
  const tokenExpired = !!dc.data?.tokenExpired;
  const handleClick = tokenExpired
    ? () => {
        const callbackUrl =
          typeof window !== "undefined" ? window.location.href : "/";
        void signIn("autodesk", { callbackUrl });
      }
    : undefined;

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex justify-center mb-3",
          tokenExpired && "cursor-pointer"
        )}
        title={state.tooltip}
        onClick={handleClick}
        role={tokenExpired ? "button" : undefined}
      >
        <div className="relative flex items-center justify-center h-6 w-6">
          {deepSyncActive ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : (
            <>
              <span className={cn("inline-block h-2 w-2 rounded-full", state.dotClass)} aria-label={state.tooltip} />
              {state.dotClass.includes("emerald") && (
                <span className="absolute inset-0 rounded-full animate-pulseGlow bg-emerald-500/20" />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 mb-3 rounded-xl transition-smooth group/pill",
        "bg-white/40 border border-white/60 hover:bg-white/60 hover:border-white/80 shadow-soft-sm",
        tokenExpired && "cursor-pointer"
      )}
      title={state.tooltip}
      onClick={handleClick}
      role={tokenExpired ? "button" : undefined}
    >
      <div className="relative flex items-center justify-center shrink-0">
        {deepSyncActive ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : (
          <>
            <span className={cn("inline-block h-2 w-2 rounded-full transition-smooth", state.dotClass)} />
            {state.dotClass.includes("emerald") && (
              <span className="absolute -inset-1 rounded-full animate-pulseGlow bg-emerald-500/15" />
            )}
            {state.dotClass.includes("rose") && (
              <span className="absolute -inset-1 rounded-full animate-pulse bg-rose-500/10" />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 group-hover/pill:text-muted-foreground/80 transition-colors">
          {deepSyncActive ? "Deep Sync" : "Last Synced"}
        </span>
        <span className="text-[11px] font-medium text-foreground/80 truncate">
          {state.label}
        </span>
      </div>
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
    // Phase 03-04 — activity-ingest rollup from accSync router.
    ingestState: "green" | "amber" | "running" | "none";
    partial: boolean;
    lastIngestAt: Date | null;
    lastIngestError: string | null;
  };
};

type DcStatusData = {
  dcStatus: "green" | "amber" | "red";
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastSuccessAt: Date | null;
  nextRunInHours: number;
  quotaUsedToday: number;
  quotaCap: number;
  diffSummary:
    | {
        usersAdded: number;
        usersRemoved: number;
        projectsAdded: number;
        projectsRemoved: number;
      }
    | null;
  unknownModulesSeen: string[];
  tokenExpired: boolean;
};

type BackfillData = {
  monthsCovered: number;
  monthsTotal: number;
  backfillPct: number;
  projectsTracked: number;
};

function computePillState(
  data: FreshnessData | undefined,
  deepSyncActive: boolean,
  isLoading: boolean
): PillState {
  if (isLoading || !data) {
    return {
      dotClass: "bg-zinc-300",
      label: "Checking…",
      tooltip: "Verifying sync freshness…",
    };
  }

  if (deepSyncActive) {
    return {
      dotClass: "bg-primary",
      label: "Running…",
      tooltip: "A nightly Deep Sync job is currently pending or running",
    };
  }

  // Pick the most recent informative timestamp across both sync types.
  const quickAt = data.quick.lastRunAt ? new Date(data.quick.lastRunAt) : null;
  const deepSuccessAt = data.deep.lastSuccessCompletedAt
    ? new Date(data.deep.lastSuccessCompletedAt)
    : null;

  // Surface failures aggressively — the freshest record decides the visible state.
  const deepRunAt = data.deep.lastRunAt ? new Date(data.deep.lastRunAt) : null;
  const mostRecentRun = pickLatest(quickAt, deepRunAt);

  if (!mostRecentRun) {
    return {
      dotClass: "bg-zinc-400",
      label: "Never",
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
      dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]",
      label: `Failed ${ago}`,
      tooltip: error
        ? `Last sync failed ${ago}: ${error}`
        : `Last sync failed ${ago}`,
    };
  }

  if (status === "skipped") {
    const successAgo = deepSuccessAt
      ? formatDistanceToNow(new Date(deepSuccessAt), { addSuffix: true })
      : ago;
    return {
      dotClass: "bg-amber-500",
      label: successAgo,
      tooltip: `Most recent attempt skipped; last successful sync ${successAgo}`,
    };
  }

  // Phase 03-04: surface Deep-Sync-ingest failure / partial-success.
  // Quick-Sync amber/failed paths above take precedence; this branch fires when
  // Quick-Sync is otherwise green/skipped but the most recent activity-ingest
  // job failed or returned partial CSV row counts.
  if (data.deep.ingestState === "amber") {
    const ingestAgo = data.deep.lastIngestAt
      ? formatDistanceToNow(new Date(data.deep.lastIngestAt), { addSuffix: true })
      : ago;
    const labelTag = data.deep.partial ? "Partial" : "Sync failed";
    const reason = data.deep.lastIngestError ?? "see logs";
    return {
      dotClass: "bg-amber-500",
      label: `${labelTag} ${ingestAgo}`,
      tooltip: `Activity sync: ${
        data.deep.partial ? "Partial" : "Failed"
      } — ${reason} (last attempt ${ingestAgo})`,
    };
  }

  // Success
  return {
    dotClass: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
    label: ago,
    tooltip: `Last sync succeeded ${ago}`,
  };
}

/**
 * Phase 08-07 — fold DC ingest status into the existing pill state.
 *
 * Color rule: pill renders the worst of {phase-3 baseState, dc.dcStatus}.
 *   red > amber > green
 * (Container restart, token expiry, or 36h-stale DC each force red even if
 * Quick-Sync is green.)
 *
 * Tooltip is always rebuilt as a multi-line block so Luis can answer all four
 * CONTEXT promises at a glance: last success, backfill progress, next-run
 * countdown, quota used. Read the tooltip via native browser hover (no Popover
 * primitive in the design system; falling back to title= so this stays
 * Phase-08-07 self-contained).
 */
function mergeWithDcState(
  base: PillState,
  dc: DcStatusData | undefined,
  backfill: BackfillData | undefined
): PillState {
  if (!dc) return base;

  // Color escalation — worst-of policy.
  let dotClass = base.dotClass;
  const baseRank = colorRank(base.dotClass);
  const dcRank = colorRank(dcStatusToColorClass(dc.dcStatus));
  if (dcRank > baseRank) {
    dotClass = dcStatusToColorClass(dc.dcStatus);
  }

  const lines: string[] = [];
  // Existing one-line summary stays as the first line for continuity.
  lines.push(`Quick Sync: ${base.label}`);

  const lastSuccessAt = dc.lastSuccessAt ? new Date(dc.lastSuccessAt) : null;
  const lastSuccessAgo = lastSuccessAt
    ? formatDistanceToNow(lastSuccessAt, { addSuffix: true })
    : "never";
  const lastRunStatus = dc.lastRunStatus ?? "no runs yet";
  lines.push(`Deep Sync (DC): ${dc.dcStatus} · ${lastRunStatus} · last success ${lastSuccessAgo}`);

  if (backfill) {
    if (backfill.monthsTotal > 0) {
      lines.push(
        `Backfill: month ${backfill.monthsCovered} of ${backfill.monthsTotal} (${Math.round(
          backfill.backfillPct * 100
        )}%) across ${backfill.projectsTracked} projects`
      );
    } else {
      lines.push("Backfill: no progress rows yet");
    }
  }

  lines.push(`Next run: in ${dc.nextRunInHours}h`);
  lines.push(`Quota: ${dc.quotaUsedToday}/${dc.quotaCap} used today`);

  if (dc.diffSummary) {
    const d = dc.diffSummary;
    lines.push(
      `Access changes last 24h: +${d.usersAdded} / -${d.usersRemoved} users · +${d.projectsAdded} / -${d.projectsRemoved} projects`
    );
  }

  if (dc.unknownModulesSeen && dc.unknownModulesSeen.length > 0) {
    lines.push(`Unknown modules detected: ${dc.unknownModulesSeen.join(", ")}`);
  }

  if (dc.tokenExpired) {
    lines.push("Autodesk token expired — click to re-authenticate.");
  }

  return {
    dotClass,
    label: base.label,
    tooltip: lines.join("\n"),
  };
}

function dcStatusToColorClass(s: "green" | "amber" | "red"): string {
  if (s === "red") return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]";
  if (s === "amber") return "bg-amber-500";
  return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
}

function colorRank(dotClass: string): number {
  if (dotClass.includes("rose")) return 3;          // red
  if (dotClass.includes("amber")) return 2;         // amber
  if (dotClass.includes("emerald")) return 1;       // green
  return 0;                                         // neutral / loading
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}
