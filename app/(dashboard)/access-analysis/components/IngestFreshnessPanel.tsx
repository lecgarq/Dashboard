"use client";
import { useState } from "react";
import type { IngestFreshness } from "@/lib/server/ingestFreshnessView";
import { formatRelativeTime, formatAbsolute } from "../relativeTime";
import { ingestStaleness, statusTone, formatRunDuration, type StatusToneKind } from "../ingestFreshnessCounts";

const TONE_CLASS: Record<StatusToneKind, string> = {
  positive: "bg-success/15 text-success",
  caution: "bg-warning/15 text-warning",
  negative: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

function Tile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="flex flex-col gap-0.5" title={title}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="text-xs font-medium tabular-nums text-foreground/90">{value}</span>
    </span>
  );
}

/**
 * PIPE-01 — compact, muted ops-metadata strip: latest ingest run facts + live
 * throughput. Deliberately NOT an analytics-headline card — no chart, no run
 * history, no polling (static per-page-load read).
 */
export function IngestFreshnessPanel({ freshness }: { freshness: IngestFreshness | null }) {
  const [now] = useState(() => Date.now());

  if (!freshness) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No Data Connector ingest runs recorded.
      </div>
    );
  }

  const { stale, ageHours } = ingestStaleness(freshness.startedAt, now);
  const tone = statusTone(freshness.status);
  const duration = formatRunDuration(freshness.startedAt, freshness.endedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
      <Tile
        label="Last ingest"
        value={formatRelativeTime(freshness.startedAt, now)}
        title={formatAbsolute(freshness.startedAt)}
      />
      <Tile
        label="Ended"
        value={freshness.endedAt ? formatRelativeTime(freshness.endedAt, now) : "in progress"}
        title={freshness.endedAt ? formatAbsolute(freshness.endedAt) : undefined}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Status</span>
        <span className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone.tone]}`}>
          {tone.label}
        </span>
      </span>
      <Tile label="Duration" value={duration} />
      <Tile label="Projects processed" value={freshness.projectsProcessed.toLocaleString()} />
      <Tile label="Activity rows this run" value={freshness.activityRowCount.toLocaleString()} />
      {stale && (
        <span
          className="inline-flex w-fit items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning"
          title={`Latest run started ${Math.round(ageHours)}h ago`}
        >
          stale — last run {Math.round(ageHours)}h ago
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground/60">
        Account-wide — not affected by the project filter.
      </span>
    </div>
  );
}
