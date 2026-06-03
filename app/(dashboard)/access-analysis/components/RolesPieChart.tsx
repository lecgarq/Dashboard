"use client";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { UNKNOWN_ROLE, type RoleSlice } from "../roleCounts";

// Vibrant, cohesive palette tuned for the zinc-950 dark background.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa",
  "#fb7185", "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80",
  "#fca5a5", "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac",
  "#67e8f9", "#fde047", "#f0abfc", "#a5b4fc", "#fbcfe8", "#bef264",
];
const UNKNOWN_COLOR = "#52525b"; // zinc-600 — role-less, intentionally muted

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function RolesPieChart({ data, distinctRoles }: { data: RoleSlice[]; distinctRoles: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Assign each role a stable color, reused by both the slice and its legend row.
  let hue = 0;
  const colored = data.map((d) => ({
    ...d,
    color: d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length],
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
        top: "44%",
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
    legend: { show: false }, // full HTML legend rendered below instead
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["52%", "78%"],
        center: ["50%", "50%"],
        minAngle: 0,
        // Labels live in the legend grid below — the ring stays clean.
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: "#09090b", borderWidth: 1 },
        emphasis: {
          scaleSize: 10,
          itemStyle: { shadowBlur: 20, shadowColor: "rgba(0,0,0,0.55)" },
          label: {
            show: true,
            formatter: "{b}\n{c} ({d}%)",
            fontSize: 13,
            fontWeight: 700,
            color: "#fafafa",
          },
        },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 18,
        data: colored.map((c) => ({ name: c.name, value: c.value, itemStyle: { color: c.color } })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <EChart option={option} height={400} />
      <ul
        data-testid="role-legend"
        className="mt-3 grid gap-x-6 gap-y-1 border-t border-zinc-800 pt-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
      >
        {colored.map((c) => (
          <li
            key={c.name}
            title={`${c.name} — ${c.value.toLocaleString()} users (${fmtPct(c.value, total)})`}
            className="flex items-center gap-2 text-xs text-zinc-300"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="shrink-0 tabular-nums text-zinc-100">{c.value.toLocaleString()}</span>
            <span className="w-14 shrink-0 text-right tabular-nums text-zinc-500">{fmtPct(c.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
