"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption, LineSeriesOption } from "echarts";
import type { TimelineSummary } from "../timelineCounts";

const ACCENT = "#3a9dbf"; // state-blue sky — same accent as the Model-Coordination module

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "YYYY-MM" -> "Mon YYYY" (month-year only, no false daily precision). */
function fmtFloor(yyyyMm: string): string {
  const [y, mo] = yyyyMm.split("-");
  return `${MONTH_NAMES[Number(mo) - 1] ?? mo} ${y}`;
}

export function ActivityTimelineChart({
  summary,
  dataFloor,
  floorByProject: _floorByProject,
}: {
  summary: TimelineSummary;
  /** TRUTH-02: account-wide earliest activity month as "YYYY-MM". Renders as caption when present. */
  dataFloor?: string | null;
  /** TRUTH-02: per-project earliest activity month as "YYYY-MM". Reserved for future per-project tooltip. */
  floorByProject?: Record<string, string>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const { points, total, peak, busiestYear } = summary;

  // YoY delta per month = count(this month) - count(same month, prior year).
  const deltaByMonth = useMemo(() => {
    const at = new Map(points.map((p) => [p.month, p.count]));
    const d = new Map<string, number | null>();
    for (const p of points) {
      const [y, mo] = p.month.split("-");
      const prior = `${Number(y) - 1}-${mo}`;
      d.set(p.month, at.has(prior) ? p.count - (at.get(prior) ?? 0) : null);
    }
    return d;
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 14l4-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No activity found.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  // cAxis/cSplit injected by mergeEChartsTheme via the canonical wrapper.
  // cTitle used in tooltip formatter HTML (not injected by mergeEChartsTheme).
  // #52525b (zinc-600) — nudged from #6b7280 (gray-500, 4.6:1 marginal) to give
  // genuine projector headroom while remaining a muted sub-label. ~7.0:1 on #fff.
  const cAxis = dark ? "#a1a1aa" : "#52525b";
  const cTitle = dark ? "#fafafa" : "#111827";

  // Formatted floor label for the tooltip (TRUTH-02 — account-wide scope floor).
  const floorLabel = dataFloor ? fmtFloor(dataFloor) : null;

  const lineSeries: LineSeriesOption = {
    name: "Activity",
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
            label: { color: "#06121b", fontSize: 10, fontWeight: 700, formatter: () => "peak" },
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
        const delta = deltaByMonth.get(p.month);
        const priorYear = Number(p.month.slice(0, 4)) - 1;
        const deltaLine =
          delta == null
            ? `<div style="color:${cAxis}">no ${priorYear} to compare</div>`
            : `<div style="color:${cAxis}">${delta >= 0 ? "▲ +" : "▼ −"}${Math.abs(delta).toLocaleString()} vs ${priorYear}</div>`;
        // TRUTH-02: muted floor line in the tooltip — account-wide earliest activity month.
        const floorLine = floorLabel
          ? `<div style="color:${cAxis};margin-top:4px;font-size:11px">Data from ${floorLabel}</div>`
          : "";
        return (
          `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${p.label}</div>` +
          `<div>${p.count.toLocaleString()} activities</div>` +
          deltaLine +
          floorLine
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
        fillerColor: dark ? "rgba(56,189,248,0.18)" : "rgba(56,189,248,0.22)",
        handleStyle: { color: ACCENT },
        textStyle: { color: cAxis },
      },
    ],
    series: [lineSeries],
  };

  return (
    <div className="panel-elevated p-5">
      <div data-testid="timeline-headline" className="mb-2 text-sm text-muted-foreground">
        <b className="text-foreground">{total.toLocaleString()}</b> activities
        {peak ? <> · busiest month <b className="text-foreground">{peak.label}</b></> : null}
        {busiestYear ? <> · busiest year <b className="text-foreground">{busiestYear.year}</b></> : null}
      </div>
      <EChart option={option} height={360} notMerge={false} />
      {/* TRUTH-02: account-wide data floor caption — month-year only, no false daily precision. */}
      {dataFloor && floorLabel ? (
        <p
          data-testid="timeline-data-floor"
          className="mt-2 text-[10px] text-muted-foreground"
        >
          Data available from {floorLabel}
        </p>
      ) : null}
    </div>
  );
}
