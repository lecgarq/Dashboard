"use client";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption, LineSeriesOption } from "echarts";
import type { TimelineSummary } from "../timelineCounts";
import { deriveIssueCoverageCaption } from "../issueFunnelCounts";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

// Amber — distinct from the Activity timeline's sky (#38bdf8) so the two
// timelines aren't confused across tabs.
const ACCENT = "#f59e0b";

/** Live "N of M fetched projects" caption + honest empty-state distinction line. */
function coverageCaptionText(caption: ReturnType<typeof deriveIssueCoverageCaption>): string {
  const { fetched, total, unavailable } = caption;
  return `Issue data covers ${fetched} of ${total} fetched projects${
    unavailable > 0 ? ` — ${unavailable} forbidden/error` : ""
  }`;
}

export function IssueTimelineChart({
  summary,
  coverageProjects,
}: {
  summary: TimelineSummary;
  /** Selection-filtered Phase 20 coverage rows — never a hardcoded figure. */
  coverageProjects: ReadonlyArray<IssueCoverageInputRow>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const { points, total, peak, busiestYear } = summary;
  const caption = deriveIssueCoverageCaption(coverageProjects);

  // cAxis/cSplit injected by mergeEChartsTheme via the canonical wrapper.
  // cTitle used in tooltip formatter HTML (not injected by mergeEChartsTheme).
  const cAxis = dark ? "#a1a1aa" : "#52525b";
  const cTitle = dark ? "#fafafa" : "#111827";

  if (points.length === 0) {
    const distinctionLine =
      caption.unavailable > 0
        ? `Issue data unavailable for ${caption.unavailable} of ${caption.total} projects in this selection — absence here is not zero issues.`
        : "All projects in this selection were fetched — this selection genuinely has no issues.";
    return (
      <div
        data-testid="issue-timeline-empty"
        className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 px-6 text-center text-sm text-muted-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 14l4-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No issues for this view
        <span className="text-xs opacity-70">{distinctionLine}</span>
      </div>
    );
  }

  const lineSeries: LineSeriesOption = {
    name: "Issues",
    type: "line",
    smooth: true,
    showSymbol: false,
    data: points.map((p) => p.count),
    lineStyle: { color: ACCENT, width: 2.5 },
    itemStyle: { color: ACCENT },
    areaStyle: {
      color: {
        type: "linear",
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: `${ACCENT}66` },
          { offset: 1, color: `${ACCENT}00` },
        ],
      },
    },
    ...(peak
      ? {
          markPoint: {
            symbol: "pin",
            symbolSize: 46,
            itemStyle: { color: ACCENT },
            label: { color: "#1c1206", fontSize: 10, fontWeight: 700, formatter: () => "peak" },
            data: [{ name: "peak", coord: [peak.label, peak.count], value: peak.count }],
          },
        }
      : {}),
    animationDuration: 700,
    animationEasing: "cubicOut",
  };

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 16, bottom: 64, containLabel: true },
    tooltip: {
      trigger: "axis",
      padding: [10, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const arr = params as Array<{ dataIndex: number }>;
        const p = points[arr[0]?.dataIndex ?? 0];
        if (!p) return "";
        return (
          `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${p.label}</div>` +
          `<div style="color:${cAxis}">${p.count.toLocaleString()} issues</div>`
        );
      },
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      boundaryGap: false,
      axisLabel: { hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
    },
    dataZoom: [
      { type: "inside" },
      {
        type: "slider",
        height: 16,
        bottom: 18,
        borderColor: "transparent",
        backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        fillerColor: dark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.22)",
        handleStyle: { color: ACCENT },
        textStyle: { color: cAxis },
      },
    ],
    series: [lineSeries],
  };

  return (
    <div className="panel-elevated p-5">
      <div data-testid="issue-timeline-headline" className="mb-2 text-sm text-muted-foreground">
        <b className="text-foreground">{total.toLocaleString()}</b> issues
        {peak ? <> · busiest month <b className="text-foreground">{peak.label}</b></> : null}
        {busiestYear ? <> · busiest year <b className="text-foreground">{busiestYear.year}</b></> : null}
      </div>
      <EChart option={option} height={360} notMerge={false} />
      {caption.total > 0 ? (
        <p
          data-testid="issue-timeline-coverage-caption"
          className="mt-2 text-[10px] text-muted-foreground"
        >
          {coverageCaptionText(caption)}
        </p>
      ) : null}
    </div>
  );
}
