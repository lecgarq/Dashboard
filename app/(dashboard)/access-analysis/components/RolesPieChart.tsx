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

// Range-slider chrome + donut card flourishes. `rp-` prefixed so the global
// <style> can't leak into the rest of the dashboard.
const PIE_CSS = `
.rp-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 9999px; cursor: pointer; }
.rp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 9999px; background: #fff; border: 3px solid #6366f1; box-shadow: 0 1px 4px rgba(0,0,0,.55); transition: transform .12s ease; }
.rp-range:hover::-webkit-slider-thumb { transform: scale(1.15); }
.rp-range:focus-visible::-webkit-slider-thumb { outline: 2px solid rgba(99,102,241,.5); outline-offset: 2px; }
.rp-range::-moz-range-thumb { width: 15px; height: 15px; border: 3px solid #6366f1; border-radius: 9999px; background: #fff; }
.rp-range::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
.rp-range:disabled { opacity: .45; cursor: not-allowed; }
`;

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
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950 text-sm text-zinc-400">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-700" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No role assignments found.
        <span className="text-xs text-zinc-600">Select at least one project above.</span>
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

  // "Show top" control state.
  const sliderMax = Math.max(singleCount, 1);
  const effectiveTop = Math.min(topN, sliderMax);
  const sliderValue = expanded ? sliderMax : effectiveTop;
  const trackPct = sliderMax > 1 ? ((sliderValue - 1) / (sliderMax - 1)) * 100 : 100;
  const presets = [10, 25].filter((n) => n < singleCount);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
      active
        ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-200"
        : "border-zinc-700/70 bg-zinc-800/40 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
    }`;

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
        top: "45%",
        textAlign: "center",
        textStyle: { color: "#fafafa", fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: "#a1a1aa", fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(24,24,27,0.96)",
      borderColor: "#3f3f46",
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: "#e4e4e7" },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.55);",
      formatter: "<div style='font-weight:700;color:#fafafa;margin-bottom:2px'>{b}</div><div style='color:#a1a1aa'>{c} users · <b style='color:#e4e4e7'>{d}%</b></div>",
    },
    legend: { show: false },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: "#09090b",
          borderWidth: 3,
          borderRadius: 7,
          shadowBlur: 14,
          shadowColor: "rgba(0,0,0,0.5)",
        },
        emphasis: {
          focus: "self",
          scaleSize: 12,
          itemStyle: { shadowBlur: 28, shadowColor: "rgba(0,0,0,0.65)" },
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: "#fafafa" },
        },
        blur: { itemStyle: { opacity: 0.22 } },
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
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950 p-4 shadow-xl shadow-black/30 ring-1 ring-white/5">
      <style>{PIE_CSS}</style>

      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggle(p.name) }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 text-xs">
        {/* Show top: slider + presets */}
        <div data-testid="role-controls" className="flex flex-wrap items-center gap-3 text-zinc-400">
          <span className="font-medium text-zinc-300">Show</span>
          <input
            data-testid="topn-input"
            type="range"
            min={1}
            max={sliderMax}
            value={sliderValue}
            onChange={(e) => changeTopN(e.target.value)}
            disabled={singleCount <= 1}
            aria-label="Number of top roles to show"
            className="rp-range w-36"
            style={{ background: `linear-gradient(to right, #6366f1 ${trackPct}%, #3f3f46 ${trackPct}%)` }}
          />
          <span className="min-w-[3.5rem] rounded-md border border-zinc-700/70 bg-zinc-800/60 px-2 py-0.5 text-center font-semibold tabular-nums text-zinc-100">
            {expanded ? `All ${singleCount}` : `Top ${effectiveTop}`}
          </span>
          <div className="flex items-center gap-1.5">
            {presets.map((n) => (
              <button key={n} type="button" onClick={() => { setTopN(n); setExpanded(false); }} className={chip(!expanded && topN === n)}>
                Top {n}
              </button>
            ))}
            <button type="button" aria-label="Show all roles" onClick={() => setExpanded(true)} className={chip(expanded)}>
              All
            </button>
          </div>
          <span className="text-zinc-500">of {singleCount} roles</span>
        </div>

        {/* Live metrics */}
        <div data-testid="role-metrics" className="flex flex-wrap items-center gap-2 text-zinc-400">
          <span className="rounded-md bg-zinc-800/50 px-2 py-0.5">
            <b className="text-zinc-100 tabular-nums">{activeCount}</b>
            <span className="text-zinc-500">/{displaySlices.length} shown</span>
          </span>
          <span className="rounded-md bg-zinc-800/50 px-2 py-0.5">
            <b className="text-zinc-100 tabular-nums">{activeUsers.toLocaleString()}</b> users
          </span>
          <span className="rounded-md bg-zinc-800/50 px-2 py-0.5 text-zinc-300">{fmtPct(activeUsers, grandTotal)} of all</span>
          {hidden.size > 0 && (
            <button onClick={resetHidden} className="rounded-md border border-zinc-700 px-2 py-0.5 text-zinc-300 transition hover:bg-zinc-800 hover:text-white">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Ranked legend: each row is a mini bar of its share. Column-major reading. */}
      <ul
        data-testid="role-legend"
        className="mt-3 list-none border-t border-zinc-800 pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {displaySlices.map((s) => {
          const on = !hidden.has(s.name);
          const warn = isWarning(s.name);
          const others = isOthers(s.name);
          const barPct = grandTotal > 0 ? (s.value / grandTotal) * 100 : 0;
          const color = colorFor(s.name);
          return (
            <li key={s.name} data-warning={warn || undefined} className="mb-1 flex items-center gap-1 break-inside-avoid">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.name)}
                title={`${s.name} — ${s.value.toLocaleString()} users (${fmtPct(s.value, grandTotal)})`}
                className={`group relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-800/60 ${
                  on ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {/* Proportion bar behind the row. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: color, opacity: on ? 0.16 : 0.05 }}
                />
                <span
                  className={`relative h-2.5 w-2.5 shrink-0 rounded-sm transition-opacity ${on ? "opacity-100" : "opacity-30"}`}
                  style={{ background: color, boxShadow: on ? `0 0 6px ${color}66` : "none" }}
                />
                {warn && (
                  <span data-testid="warning-icon" title="Data-quality warning" className="relative shrink-0 text-amber-400">
                    ⚠
                  </span>
                )}
                <span className={`relative flex-1 truncate ${on ? "" : "line-through"} ${warn ? "text-amber-300" : ""}`}>{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-zinc-100">{s.value.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-zinc-500">{fmtPct(s.value, grandTotal)}</span>
              </button>
              {others && (
                <button
                  type="button"
                  aria-label="Expand others"
                  title="Show every folded role"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 rounded-md border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-white"
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
