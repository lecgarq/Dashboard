"use client";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { UNKNOWN_ROLE, type RoleSlice } from "../roleCounts";

// Vibrant, cohesive palette tuned for the zinc-950 dark background.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa",
  "#fb7185", "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80",
];
const UNKNOWN_COLOR = "#52525b"; // zinc-600 — role-less, muted
const OTHER_COLOR = "#71717a";   // zinc-500 — the folded tail, muted

function colorFor(name: string, nextHue: () => number): string {
  if (name === UNKNOWN_ROLE) return UNKNOWN_COLOR;
  if (name.startsWith("Other (")) return OTHER_COLOR;
  return PALETTE[nextHue() % PALETTE.length];
}

export function RolesPieChart({ data, distinctRoles }: { data: RoleSlice[]; distinctRoles: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  let hue = 0;
  const seriesData = data.map((d) => ({
    name: d.name,
    value: d.value,
    itemStyle: { color: colorFor(d.name, () => hue++) },
  }));

  const option: EChartsOption = {
    title: [
      {
        text: "Role distribution",
        subtext: `${distinctRoles.toLocaleString()} roles · ${total.toLocaleString()} user–project memberships`,
        left: "center",
        top: 0,
        textStyle: { color: "#fafafa", fontSize: 16, fontWeight: 600 },
        subtextStyle: { color: "#a1a1aa", fontSize: 12 },
      },
      {
        // Center total — sits in the donut hole.
        text: total.toLocaleString(),
        subtext: "users",
        left: "center",
        top: "47%",
        textAlign: "center",
        textStyle: { color: "#fafafa", fontSize: 30, fontWeight: 700 },
        subtextStyle: { color: "#a1a1aa", fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: "#18181b",
      borderColor: "#3f3f46",
      textStyle: { color: "#e4e4e7" },
      formatter: "<b>{b}</b><br/>{c} users ({d}%)",
    },
    legend: {
      type: "scroll",
      bottom: 4,
      left: "center",
      textStyle: { color: "#a1a1aa" },
      pageTextStyle: { color: "#a1a1aa" },
      pageIconColor: "#a1a1aa",
      pageIconInactiveColor: "#52525b",
    },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "54%"],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        minAngle: 2,
        itemStyle: { borderColor: "#09090b", borderWidth: 2, borderRadius: 6 },
        label: {
          show: true,
          formatter: "{b}\n{c} ({d}%)",
          color: "#e4e4e7",
          fontSize: 11,
          lineHeight: 14,
        },
        labelLine: { show: true, length: 14, length2: 12, lineStyle: { color: "#52525b" } },
        labelLayout: { hideOverlap: true },
        emphasis: {
          scaleSize: 14,
          itemStyle: { shadowBlur: 24, shadowColor: "rgba(0,0,0,0.55)" },
          label: { show: true, fontSize: 13, fontWeight: 700, color: "#fafafa" },
        },
        // Astonishing entrance: slices scale in, staggered, with an elastic settle.
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 900,
        animationDelay: (idx: number) => idx * 60,
        data: seriesData,
      },
    ],
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <EChart option={option} height={560} />
    </div>
  );
}
