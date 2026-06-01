"use client";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { SummaryDTO, ModuleId } from "../types";

export function ModuleAccessChart({
  modules, onPickModule,
}: {
  modules: SummaryDTO["modules"];
  onPickModule: (id: ModuleId) => void;
}) {
  // DTO is sorted by total desc; reverse so the largest sits at the TOP of a horizontal bar chart.
  const ordered = [...modules].reverse();
  const option: EChartsOption = {
    grid: { left: 140, right: 24, top: 16, bottom: 16 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, right: 0, textStyle: { color: "#a1a1aa" } },
    xAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    yAxis: { type: "category", data: ordered.map((m) => m.label), axisLabel: { color: "#d4d4d8" } },
    series: [
      { name: "Member", type: "bar", stack: "x", itemStyle: { color: "#3f6212" }, data: ordered.map((m) => m.member) },
      { name: "Admin", type: "bar", stack: "x", itemStyle: { color: "#a3e635" }, data: ordered.map((m) => m.admin) },
    ],
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Module access</div>
      <EChart
        option={option}
        height={360}
        onEvents={{ click: (p) => {
          const hit = ordered.find((m) => m.label === p.name);
          if (hit) onPickModule(hit.id);
        } }}
      />
    </div>
  );
}
