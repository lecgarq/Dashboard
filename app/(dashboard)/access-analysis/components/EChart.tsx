"use client";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export function EChart({
  option, height = 280, onEvents,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: { name?: string; data?: unknown; seriesName?: string }) => void>;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge
      lazyUpdate
      onEvents={onEvents}
    />
  );
}
