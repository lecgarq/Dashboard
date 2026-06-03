"use client";
import { useMemo, useState } from "react";
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
  // Stable color per role, reused by both the slice and its legend row.
  const colored = useMemo(() => {
    let hue = 0;
    return data.map((d) => ({
      ...d,
      color: d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length],
    }));
  }, [data]);

  // Which roles are currently switched on. Default: everything.
  const [active, setActive] = useState<Set<string>>(() => new Set(data.map((d) => d.name)));

  if (data.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const grandTotal = data.reduce((sum, d) => sum + d.value, 0);
  const activeUsers = colored.reduce((sum, d) => sum + (active.has(d.name) ? d.value : 0), 0);
  const activeCount = colored.filter((d) => active.has(d.name)).length;

  const toggle = (name: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const showAll = () => setActive(new Set(data.map((d) => d.name)));
  const clearAll = () => setActive(new Set());

  const option: EChartsOption = {
    title: [
      {
        text: "Role distribution",
        subtext: `${distinctRoles.toLocaleString()} roles · ${grandTotal.toLocaleString()} user–project memberships`,
        left: "center",
        top: 0,
        textStyle: { color: "#fafafa", fontSize: 16, fontWeight: 600 },
        subtextStyle: { color: "#a1a1aa", fontSize: 12 },
      },
      {
        text: activeUsers.toLocaleString(),
        subtext: activeCount === colored.length ? "users" : "users shown",
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
    legend: { show: false }, // full interactive HTML legend rendered below
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["52%", "78%"],
        center: ["50%", "50%"],
        minAngle: 0,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: "#09090b", borderWidth: 1 },
        emphasis: {
          scaleSize: 10,
          itemStyle: { shadowBlur: 20, shadowColor: "rgba(0,0,0,0.55)" },
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: "#fafafa" },
        },
        // Entrance: staggered elastic scale-in. Updates (toggles) animate smoothly.
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 16,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        // Hidden roles stay in the data at value 0 so toggling animates as grow/shrink.
        data: colored.map((c) => ({
          name: c.name,
          value: active.has(c.name) ? c.value : 0,
          itemStyle: { color: c.color },
        })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggle(p.name) }}
      />

      <div
        data-testid="role-metrics"
        className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400"
      >
        <span>
          <b className="text-zinc-100">{activeCount}</b>/{colored.length} roles
        </span>
        <span>
          <b className="text-zinc-100">{activeUsers.toLocaleString()}</b> users
        </span>
        <span>{fmtPct(activeUsers, grandTotal)} of all</span>
        {activeCount < colored.length && (
          <button onClick={showAll} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
            Show all
          </button>
        )}
        {activeCount > 0 && (
          <button onClick={clearAll} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
            Clear
          </button>
        )}
      </div>

      {/* Multi-column = column-major reading order (top→bottom, then left→right). */}
      <ul
        data-testid="role-legend"
        className="mt-3 list-none border-t border-zinc-800 pt-3"
        style={{ columnWidth: "230px", columnGap: "1.5rem" }}
      >
        {colored.map((c) => {
          const on = active.has(c.name);
          return (
            <li key={c.name} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.name)}
                title={`${c.name} — ${c.value.toLocaleString()} users (${fmtPct(c.value, grandTotal)})`}
                className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-zinc-800/70 ${
                  on ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm transition-opacity ${on ? "opacity-100" : "opacity-30"}`}
                  style={{ background: c.color }}
                />
                <span className={`flex-1 truncate ${on ? "" : "line-through"}`}>{c.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-100">{c.value.toLocaleString()}</span>
                <span className="w-14 shrink-0 text-right tabular-nums text-zinc-500">{fmtPct(c.value, grandTotal)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
