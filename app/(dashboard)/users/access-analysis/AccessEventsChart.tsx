"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { trpc } from "@/lib/core/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGE_STREAM_META, CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";

const STREAM_LABELS = CHANGE_STREAMS.map((id) => CHANGE_STREAM_META[id].label);

export function AccessEventsChart() {
  const { window } = useAccessAnalysis();
  const query = trpc.accActivity.getTimeline.useQuery(
    { window },
    { staleTime: 60_000, refetchInterval: 60_000 },
  );

  if (query.isLoading || !query.data) {
    return <Skeleton className="h-[400px] w-full" />;
  }
  if (query.error) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Failed to load timeline: {query.error.message}</div>;
  }

  const hasAnyData = query.data.points.some((d) => d.membership + d.permission + d.project + d.admin > 0);
  if (!hasAnyData) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-md border border-dashed text-center">
        <p className="text-base font-medium">No access events in this window</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.data.dataEarliestEvent
            ? `Earliest data: ${new Date(query.data.dataEarliestEvent).toISOString().slice(0, 10)}`
            : "No activity data has been ingested yet."}
        </p>
      </div>
    );
  }

  const option: EChartsOption = {
    animationDuration: 450,
    color: CHANGE_STREAMS.map((id) => CHANGE_STREAM_META[id].color),
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => Number(value).toLocaleString(),
    },
    legend: {
      bottom: 0,
      data: STREAM_LABELS,
      textStyle: { color: "inherit" },
    },
    grid: { top: 24, right: 20, bottom: 54, left: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: query.data.points.map((point) => new Date(point.bucket).toISOString().slice(5, 10)),
      axisLabel: { color: "inherit" },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "inherit" },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
    },
    series: CHANGE_STREAMS.map((stream) => ({
      name: CHANGE_STREAM_META[stream].label,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      areaStyle: { opacity: 0.12 },
      emphasis: { focus: "series" },
      data: query.data.points.map((point) => point[stream]),
    })),
  };

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <header className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight">Access activity timeline</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Membership churn, permission drift, project access, and admin grants.
        </p>
      </header>
      <ReactECharts option={option} notMerge lazyUpdate style={{ height: 400, width: "100%" }} />
    </section>
  );
}
