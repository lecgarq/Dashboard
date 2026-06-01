"use client";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { Category } from "../types";

function lineOption(title: string, rows: Category[], color: string): EChartsOption {
  return {
    title: { text: title, left: 8, top: 0, textStyle: { color: "#a1a1aa", fontSize: 12, fontWeight: 500 } },
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: "#71717a" } },
    yAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    series: [{ type: "line", smooth: true, showSymbol: false, areaStyle: { opacity: 0.15 }, itemStyle: { color }, data: rows.map((r) => r.value) }],
  };
}

export function Trends({ activityPerWeek, accessAdded }: { activityPerWeek: Category[]; accessAdded: Category[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart option={lineOption("Activity events / week", activityPerWeek, "#22d3ee")} height={240} />
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart option={lineOption("Access added / month", accessAdded, "#a3e635")} height={240} />
      </div>
    </div>
  );
}
