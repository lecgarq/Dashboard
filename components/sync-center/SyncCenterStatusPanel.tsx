"use client";

import {
  AlertTriangle,
  Clock3,
  FileText,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/core/utils";
import type { SyncCenterStatus } from "@/lib/acc/syncCenterState";

export type SyncCenterStatusViewModel = {
  status: SyncCenterStatus;
  activeJobId: string | null;
  activeRequestId: string | null;
  elapsedTime: string;
  estimatedRemainingTime: string | null;
  completionEstimateDuration: string | null;
  completionEstimateTime: Date | string | null;
  quotaUsedToday: number;
  quotaRemainingToday: number;
  dailyQuotaCap: number;
  dailySafeRequestBudget: number;
  reserveRequests: number;
  nextSafeRunTime: Date | string | null;
  plannedRequests: number;
  runnableRequestsToday: number;
  deferredRequests: number;
  paused: boolean;
  latestLogs: string[];
  latestErrors: string[];
  unknownModulesSeen?: string[];
  activityCoverage?: {
    rows: number;
    projectsWithActivity: number;
    daysWithActivity: number;
    earliestAt: Date | string | null;
    latestAt: Date | string | null;
  };
};

type SyncCenterStatusPanelProps = {
  data: SyncCenterStatusViewModel;
  isBusy: boolean;
  onStartDaily?: () => void;
  onResumeBackfill?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onOpenLogs?: () => void;
};

const STATUS_LABEL: Record<SyncCenterStatus, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  failed: "Failed",
  complete: "Complete",
  "quota-paused": "Quota paused",
};

const STATUS_CLASS: Record<SyncCenterStatus, string> = {
  idle: "bg-muted text-muted-foreground border-border",
  running: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
  paused: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  failed: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  "quota-paused": "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50",
};

export function SyncCenterStatusPanel({
  data,
  isBusy,
  onStartDaily,
  onResumeBackfill,
  onPause,
  onResume,
  onRetry,
  onOpenLogs,
}: SyncCenterStatusPanelProps) {
  const isRunning = data.status === "running";
  const isFailed = data.status === "failed";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            Sync Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ACC Data Connector extraction operations
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-semibold",
            STATUS_CLASS[data.status],
          )}
        >
          {STATUS_LABEL[data.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <MetricCard label="Elapsed" value={data.elapsedTime} icon={Clock3} />
        <MetricCard
          label="Remaining"
          value={data.estimatedRemainingTime ?? "Not enough data"}
          icon={Clock3}
        />
        <MetricCard
          label="Complete in"
          value={data.completionEstimateDuration ?? "Pending"}
          detail={formatDateTime(data.completionEstimateTime)}
          icon={Clock3}
        />
        <MetricCard
          label="Quota used"
          value={`${data.quotaUsedToday} / ${data.dailySafeRequestBudget}`}
          detail={`${data.quotaRemainingToday} safe requests`}
          icon={ShieldCheck}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Operations</h2>
          <div className="mt-4 grid gap-2">
            <ActionButton
              icon={Play}
              label="Start daily extraction"
              disabled={isBusy || isRunning}
              onClick={onStartDaily}
            />
            <ActionButton
              icon={RotateCcw}
              label="Resume backfill"
              disabled={isBusy || isRunning}
              onClick={onResumeBackfill}
            />
            <ActionButton
              icon={Pause}
              label="Pause extraction"
              disabled={isBusy || data.paused}
              onClick={onPause}
            />
            <ActionButton
              icon={Play}
              label="Resume extraction"
              disabled={isBusy || !data.paused}
              onClick={onResume}
            />
            <ActionButton
              icon={RotateCcw}
              label="Retry failed job"
              disabled={isBusy || isRunning || !isFailed}
              onClick={onRetry}
            />
            <ActionButton
              icon={FileText}
              label="Open logs"
              disabled={isBusy}
              onClick={onOpenLogs}
            />
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <Fact label="Active job" value={data.activeJobId ?? "None"} />
            <Fact label="Active request" value={data.activeRequestId ?? "None"} />
            <Fact label="Next safe run" value={formatDateTime(data.nextSafeRunTime) ?? "Now"} />
            <Fact label="Hard cap" value={`${data.dailyQuotaCap} requests/day`} />
            <Fact label="Reserve" value={`${data.reserveRequests} requests`} />
            {data.activityCoverage && (
              <>
                <Fact
                  label="Activity rows"
                  value={`${data.activityCoverage.rows.toLocaleString()} rows`}
                />
                <Fact
                  label="Activity scope"
                  value={`${data.activityCoverage.projectsWithActivity.toLocaleString()} projects / ${data.activityCoverage.daysWithActivity.toLocaleString()} days`}
                />
                <Fact
                  label="Activity range"
                  value={formatDateRange(
                    data.activityCoverage.earliestAt,
                    data.activityCoverage.latestAt,
                  )}
                />
              </>
            )}
          </div>
        </section>

        <section className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Plan</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <PlanTile label="Planned" value={data.plannedRequests} />
              <PlanTile label="Today" value={data.runnableRequestsToday} />
              <PlanTile label="Deferred" value={data.deferredRequests} />
            </div>

            {data.latestErrors.length > 0 && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertTriangle size={16} />
                  Latest errors
                </div>
                <ul className="space-y-1">
                  {data.latestErrors.map((line, index) => (
                    <li key={`${line}-${index}`} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.unknownModulesSeen && data.unknownModulesSeen.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 animate-pulse">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertTriangle size={16} />
                  Unknown modules detected
                </div>
                <p className="mb-2 text-xs opacity-90">
                  The following unmapped service modules were skipped during ingestion. Highlight any unmapped activity verbiage so system taxonomists can instantly adapt classification logic to changes in APS API behavior:
                </p>
                <ul className="list-disc pl-5 space-y-1 font-mono text-xs">
                  {data.unknownModulesSeen.map((mod) => (
                    <li key={mod} className="font-semibold">
                      {mod}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div
            id="logs"
            className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-white">Latest logs</h2>
            <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">
              {data.latestLogs.length > 0 ? data.latestLogs.join("\n") : "No logs yet"}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string | null;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon size={15} />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-normal text-foreground">
        {value}
      </div>
      {detail && <div className="mt-1 text-sm text-muted-foreground">{detail}</div>}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function PlanTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function formatDateTime(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateRange(
  start: Date | string | null,
  end: Date | string | null,
): string {
  const startText = formatDateTime(start);
  const endText = formatDateTime(end);
  if (!startText || !endText) return "No activity";
  if (startText === endText) return startText;
  return `${startText} - ${endText}`;
}
