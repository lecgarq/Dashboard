"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import type { EChartsOption, LineSeriesOption } from "echarts";
import type { TimelineSummary } from "../timelineCounts";

const ACCENT = "#38bdf8"; // sky — same accent as the Model-Coordination module

export function ActivityTimelineChart({ summary }: { summary: TimelineSummary }) {
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

  const cAxis = dark ? "#a1a1aa" : "#6b7280";
  const cSplit = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cTitle = dark ? "#fafafa" : "#111827";

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
      backgroundColor: cTipBg,
      borderColor: cTipBorder,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: cTipText },
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
        return (
          `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${p.label}</div>` +
          `<div style="color:${cTipText}">${p.count.toLocaleString()} activities</div>` +
          deltaLine
        );
      },
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      boundaryGap: false,
      axisLabel: { color: cAxis, hideOverlap: true },
      axisLine: { lineStyle: { color: cSplit } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: cAxis },
      splitLine: { lineStyle: { color: cSplit } },
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
      <EChart option={option} height={360} />
    </div>
  );
}
