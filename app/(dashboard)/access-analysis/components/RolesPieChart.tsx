"use client";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import type { RoleSlice } from "../roleCounts";

export function RolesPieChart({ data, assignments }: { data: RoleSlice[]; assignments: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const option: EChartsOption = {
    title: {
      text: "Role distribution",
      subtext: `${assignments.toLocaleString()} assignments across ${data.length} roles`,
      left: "center",
      textStyle: { color: "#fafafa", fontSize: 16, fontWeight: 600 },
      subtextStyle: { color: "#a1a1aa", fontSize: 12 },
    },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 8,
      top: 48,
      bottom: 8,
      textStyle: { color: "#a1a1aa" },
      pageTextStyle: { color: "#a1a1aa" },
    },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: "62%",
        center: ["38%", "56%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#09090b", borderWidth: 1 },
        label: { show: false },
        labelLine: { show: false },
        data: data.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <EChart option={option} height={480} />
    </div>
  );
}
