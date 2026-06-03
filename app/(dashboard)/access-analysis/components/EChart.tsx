"use client";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export function EChart({
  option, height = 280, onEvents, notMerge = true,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: { name?: string; data?: unknown; seriesName?: string }) => void>;
  // Pass false to let ECharts diff + animate option updates instead of re-initialising.
  notMerge?: boolean;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
    />
  );
}
