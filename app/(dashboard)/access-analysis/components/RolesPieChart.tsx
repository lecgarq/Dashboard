"use client";
import { useMemo, useState } from "react";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { UNKNOWN_ROLE, MULTIPLE_ROLES, collapseToTopSlices, type RoleSlice } from "../roleCounts";

// Vibrant, cohesive palette tuned for the zinc-950 dark background.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
const UNKNOWN_COLOR = "#f59e0b"; // amber — warning: membership has no role
const MULTIPLE_COLOR = "#fb7185"; // rose — warning: membership has several roles
const OTHERS_COLOR = "#71717a";   // zinc-500 — the folded tail

const DEFAULT_TOP = 8;

const isWarning = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;
const isOthers = (name: string) => name.startsWith("Others (");

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function RolesPieChart({ data, distinctRoles }: { data: RoleSlice[]; distinctRoles: number }) {
  // Stable color per role name (kept across collapse/expand and toggling).
  const colorByName = useMemo(() => {
    const m = new Map<string, string>();
    let hue = 0;
    for (const d of data) {
      m.set(
        d.name,
        d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR
          : d.name === MULTIPLE_ROLES ? MULTIPLE_COLOR
            : PALETTE[hue++ % PALETTE.length],
      );
    }
    return m;
  }, [data]);
  const singleCount = useMemo(() => data.filter((d) => !isWarning(d.name)).length, [data]);

  const [topN, setTopN] = useState(DEFAULT_TOP);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  if (data.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const grandTotal = data.reduce((sum, d) => sum + d.value, 0);
  const displaySlices = expanded ? data : collapseToTopSlices(data, topN);

  const colorFor = (name: string) => (isOthers(name) ? OTHERS_COLOR : colorByName.get(name) ?? "#888");
  const activeUsers = displaySlices.reduce((sum, d) => sum + (hidden.has(d.name) ? 0 : d.value), 0);
  const activeCount = displaySlices.filter((d) => !hidden.has(d.name)).length;

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const resetHidden = () => setHidden(new Set());
  const changeTopN = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setTopN(n);
    setExpanded(false);
  };

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
        subtext: activeCount === displaySlices.length ? "users" : "users shown",
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
    legend: { show: false },
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
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 16,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: displaySlices.map((s) => ({
          name: s.name,
          value: hidden.has(s.name) ? 0 : s.value,
          itemStyle: { color: colorFor(s.name) },
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

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div data-testid="role-controls" className="flex items-center gap-2 text-zinc-400">
          <span>Show top</span>
          <input
            data-testid="topn-input"
            type="number"
            min={1}
            max={singleCount}
            value={topN}
            onChange={(e) => changeTopN(e.target.value)}
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-center text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />
          <span>of {singleCount} roles</span>
          {expanded && (
            <button
              type="button"
              aria-label="Collapse to top roles"
              onClick={() => setExpanded(false)}
              className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800"
            >
              − Collapse
            </button>
          )}
        </div>

        <div data-testid="role-metrics" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-400">
          <span>
            <b className="text-zinc-100">{activeCount}</b>/{displaySlices.length} shown
          </span>
          <span>
            <b className="text-zinc-100">{activeUsers.toLocaleString()}</b> users
          </span>
          <span>{fmtPct(activeUsers, grandTotal)} of all</span>
          {hidden.size > 0 && (
            <button onClick={resetHidden} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Multi-column = column-major reading order (top→bottom, then left→right). */}
      <ul
        data-testid="role-legend"
        className="mt-3 list-none border-t border-zinc-800 pt-3"
        style={{ columnWidth: "240px", columnGap: "1.5rem" }}
      >
        {displaySlices.map((s) => {
          const on = !hidden.has(s.name);
          const warn = isWarning(s.name);
          const others = isOthers(s.name);
          return (
            <li key={s.name} data-warning={warn || undefined} className="mb-1 flex items-center gap-1 break-inside-avoid">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.name)}
                title={`${s.name} — ${s.value.toLocaleString()} users (${fmtPct(s.value, grandTotal)})`}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-zinc-800/70 ${
                  on ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm transition-opacity ${on ? "opacity-100" : "opacity-30"}`}
                  style={{ background: colorFor(s.name) }}
                />
                {warn && (
                  <span data-testid="warning-icon" title="Data-quality warning" className="shrink-0 text-amber-400">
                    ⚠
                  </span>
                )}
                <span className={`flex-1 truncate ${on ? "" : "line-through"} ${warn ? "text-amber-300" : ""}`}>{s.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-100">{s.value.toLocaleString()}</span>
                <span className="w-14 shrink-0 text-right tabular-nums text-zinc-500">{fmtPct(s.value, grandTotal)}</span>
              </button>
              {others && (
                <button
                  type="button"
                  aria-label="Expand others"
                  title="Show every folded role"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  +
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
