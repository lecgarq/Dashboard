"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { DEFAULT_TOP_N, summarizeIssueType, type IssueTypeBucket } from "../issueTypeCounts";
import { deriveIssueCoverageCaption } from "../issueFunnelCounts";
import type { IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";
import type { IssueCoverageProjectRow } from "@/lib/server/coordinationByProjectView";

// Named ACC issue types share one teal accent — distinct from the amber
// timeline and the status donut's semantic 8-color map. Unknown/no-type
// buckets get muted zinc tones, distinct from each other and from the
// "Other" rollup color (zinc-500 — the standing sibling convention).
const NAMED_COLOR = "#2dd4bf"; // teal-400
const UNKNOWN_COLOR = "#52525b"; // zinc-600 — GUID present, not in the lookup table
const NONE_COLOR = "#3f3f46"; // zinc-700 — issueTypeId is null
const OTHER_COLOR = "#71717a"; // zinc-500 — folded "Other (N types)" rollup

function colorFor(bucket: IssueTypeBucket): string {
  switch (bucket.kind) {
    case "unknown":
      return UNKNOWN_COLOR;
    case "none":
      return NONE_COLOR;
    case "other":
      return OTHER_COLOR;
    default:
      return NAMED_COLOR;
  }
}

/** Live "N of M fetched projects" caption text — shared wording with the sibling issue panels. */
function coverageCaptionText(caption: ReturnType<typeof deriveIssueCoverageCaption>): string {
  const { fetched, total, unavailable } = caption;
  return `Issue data covers ${fetched} of ${total} fetched projects${
    unavailable > 0 ? ` — ${unavailable} forbidden/error` : ""
  }`;
}

/**
 * "Issues by type" panel (ISSUE-05) — third full-width issue panel on the
 * Projects tab, directly below `IssueStatusChart`. Horizontal bars, top-10 +
 * expandable "Other", every `issueTypeId` resolved to a human-readable name
 * via the Phase 22-01 `AccIssueType` lookup table — never a raw GUID.
 *
 * LOCAL drill state only (mirrors `IssueStatusChart`/`PermissionLevelChart`'s
 * `toggleDrill` pattern) — no cross-filter-bus wiring (no externally
 * controlled active slice, no emission back to a shared filter store).
 * Clicking a named/unknown/none bar opens its per-project drill; clicking the
 * "Other" bar is a guaranteed no-op (21.1-03 convention) — expanding the fold
 * is a separate, always-visible link below the chart (20.1-07 expand-in-place
 * pattern: re-invoke `summarizeIssueType` with `topN = rows.length`).
 */
export function IssueTypeChart({
  rows,
  coverageProjects,
}: {
  rows: ReadonlyArray<IssueFunnelTypeRow>;
  coverageProjects: ReadonlyArray<IssueCoverageProjectRow>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const [drill, setDrill] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(
    () => summarizeIssueType(rows, expanded ? rows.length : DEFAULT_TOP_N),
    [rows, expanded],
  );
  const caption = deriveIssueCoverageCaption(coverageProjects);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (rows.length === 0) {
    const distinctionLine =
      caption.unavailable > 0
        ? `Issue data unavailable for ${caption.unavailable} of ${caption.total} projects in this selection — absence here is not zero issues.`
        : "All projects in this selection were fetched — this selection genuinely has no issues.";
    return (
      <div
        data-testid="issue-type-empty"
        className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card px-6 text-center text-sm text-muted-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No issues for this view
        <span className="text-xs opacity-70">{distinctionLine}</span>
      </div>
    );
  }

  // Never-backfilled state: GUIDs exist on the rows but none resolve — the
  // AccIssueType lookup table is empty/stale. Never render a wall of 100%
  // "Unknown type" bars; tell the presenter what to run instead.
  if (summary.totalTypeGuids > 0 && summary.resolvedTypeGuids === 0) {
    return (
      <div
        data-testid="issue-type-not-backfilled"
        className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 text-center text-sm text-muted-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Type names not yet backfilled
        <span className="text-xs opacity-70">Run scripts/acc-issue-types-backfill.cjs to resolve issue type names.</span>
      </div>
    );
  }

  const ordered = [...summary.buckets].reverse(); // category axis renders bottom-up

  const option: EChartsOption = {
    grid: { left: 8, right: 48, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const list = params as Array<{ name: string; value: number }>;
        if (!list.length) return "";
        const { name, value } = list[0];
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${name}</div><div style="color:${cSub}">${value.toLocaleString()} issues</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cSub, formatter: (value: number) => value.toLocaleString() },
      splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.label),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cTitle },
    },
    series: [
      {
        name: "Issues by type",
        type: "bar",
        cursor: "pointer",
        barWidth: "58%",
        label: {
          show: true,
          position: "right",
          color: cTitle,
          fontSize: 11,
          formatter: (p: unknown) => {
            const value = (p as { value?: number }).value;
            return typeof value === "number" ? value.toLocaleString() : "";
          },
        },
        data: ordered.map((b) => ({ value: b.count, id: b.key, itemStyle: { color: colorFor(b) } })),
        animationDuration: 700,
        animationEasing: "cubicOut",
      },
    ],
  };

  const toggleDrill = (bucket: IssueTypeBucket) => {
    if (bucket.kind === "other") return; // guaranteed no-op — expand via the link below instead
    setDrill((cur) => (cur === bucket.key ? null : bucket.key));
  };

  const drillBucket = drill ? summary.buckets.find((b) => b.key === drill) : undefined;
  const drillRows = drill ? summary.projectsByBucket[drill] ?? [] : [];
  const hasOther = summary.buckets.some((b) => b.kind === "other");

  const captionParts: string[] = [];
  if (summary.totalTypeGuids > 0) {
    captionParts.push(`${summary.resolvedTypeGuids} of ${summary.totalTypeGuids} type GUIDs resolved to names`);
  }
  if (caption.total > 0) captionParts.push(coverageCaptionText(caption));

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={Math.max(220, summary.buckets.length * 38 + 48)}
        notMerge={false}
        onEvents={{
          click: (p) => {
            const key = (p.data as { id?: string })?.id;
            const bucket = key ? summary.buckets.find((b) => b.key === key) : undefined;
            if (bucket) toggleDrill(bucket);
          },
        }}
      />

      {/* Drill-down: the projects behind the selected type — above the footer links. */}
      {drill && drillBucket && (
        <div data-testid="issue-type-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drillBucket) }} aria-hidden />
              {drillBucket.label}
              <span className="text-xs font-normal text-muted-foreground">
                {drillRows.length} {drillRows.length === 1 ? "project" : "projects"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDrill(null)}
              aria-label="Close breakdown"
              className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
            {drillRows.map((r) => (
              <li key={r.projectId} className="break-inside-avoid">
                <div className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                  <span className="flex-1 truncate text-foreground/85" title={r.projectName}>{r.projectName}</span>
                  <span className="shrink-0 tabular-nums text-foreground">{r.count.toLocaleString()} issues</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!expanded && hasOther && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          Showing top {DEFAULT_TOP_N} of {summary.totalBuckets} types — show all
        </button>
      )}

      {expanded && (
        <button
          type="button"
          onClick={() => {
            // While expanded, summary.buckets is the full sorted list (nothing
            // folded) — a drilled type beyond the top-N cutoff would fold back
            // into "Other" on collapse and its drilldown would show stale data.
            const rank = drill ? summary.buckets.findIndex((b) => b.key === drill) : -1;
            if (rank >= DEFAULT_TOP_N) setDrill(null);
            setExpanded(false);
          }}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          Showing all {summary.totalBuckets} types — collapse to top {DEFAULT_TOP_N}
        </button>
      )}

      {captionParts.length > 0 && (
        <p data-testid="issue-type-coverage-caption" className="mt-2 text-[10px] text-muted-foreground">
          {captionParts.join(" · ")}
        </p>
      )}
    </div>
  );
}
