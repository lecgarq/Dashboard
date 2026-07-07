"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { DEFAULT_TOP_N, PERMISSION_LEVEL_ORDER, summarizePermissionLevel } from "../permissionLevelCounts";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";

const isOther = (roleName: string) => roleName.startsWith("Other (");

// ACC role names are third-party data rendered into tooltip HTML via innerHTML
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Sequential intensity ramp aligned to `PERMISSION_LEVEL_ORDER` (strongest ->
 * weakest): most-intense color = "Full Controller", coolest = "View Only".
 * Any level beyond the known 6 (research-verified live vocabulary) falls back
 * to a neutral zinc tone — still rendered, never hidden.
 */
const LEVEL_COLOR_RAMP = [
  "#d03a35", // Full Controller — warm red
  "#e2683a", // View+Download+Upload+Edit — naranja
  "#d2a012", // View+Download+Upload — goldenrod
  "#e5bc4c", // View+Download — goldenrod (light)
  "#bc74a4", // Upload Only — wine
  "#4fabc9", // View Only — state-blue sky
];
const UNKNOWN_LEVEL_COLOR = "#71717a"; // zinc-500 — fallback for any unrecognized level

function buildLevelColorMap(levels: ReadonlyArray<string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const level of levels) {
    const knownIndex = (PERMISSION_LEVEL_ORDER as readonly string[]).indexOf(level);
    m.set(level, knownIndex >= 0 ? LEVEL_COLOR_RAMP[knownIndex] : UNKNOWN_LEVEL_COLOR);
  }
  return m;
}

/**
 * Permission-volume-by-level panel (PERM-01 reframe — owner UAT item 3,
 * verbatim: "which role has the most admin permissions out of all"). Horizontal
 * STACKED bars: one bar per role (top-10 + Other), segments = verbatim stored
 * permission level, valued by folder-permission COUNT (never bytes — the
 * byte-sized footprint chart this replaces is being dropped per the locked
 * decision). Clicking a role's bar drills into its per-project breakdown,
 * identical drill UX to `PermissionFootprintChart`. Local drill state only —
 * mirrors `RolesPieChart.tsx`'s toggleDrill pattern, not the shared
 * cross-filter bus.
 *
 * Built UNMOUNTED here — plan 20.1-06 mounts this in the Roles tab in place of
 * `PermissionFootprintChart`.
 */
export function PermissionLevelChart({ rows }: { rows: PermissionLevelRow[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const [drill, setDrill] = useState<string | null>(null);
  // UAT gap-closure item 2: clicking "Other (N roles)" reveals the folded roles as
  // their own bars instead of being a dead end — same expand-in-place pattern as
  // RolesPieChart's Others slice (topN -> Infinity, no separate data fetch).
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(
    () => summarizePermissionLevel(rows, expanded ? rows.length : DEFAULT_TOP_N),
    [rows, expanded],
  );
  const colorByLevel = useMemo(() => buildLevelColorMap(summary.levels), [summary.levels]);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (rows.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No permission data for this view.
      </div>
    );
  }

  const toggleDrill = (roleName: string) => {
    if (isOther(roleName)) {
      setExpanded(true); // reveal the folded roles as their own bars — no drill entry for "Other" itself
      return;
    }
    setDrill((cur) => (cur === roleName ? null : roleName));
  };

  const ordered = [...summary.bars].reverse(); // category axis renders bottom-up

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    legend: {
      data: summary.levels,
      top: 0,
      textStyle: { color: cSub, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 12,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const list = params as Array<{ name: string; seriesName: string; value: number }>;
        if (!list.length) return "";
        const roleName = list[0].name;
        const bar = summary.bars.find((b) => b.roleName === roleName);
        if (!bar) return "";
        const lines = list
          .filter((p) => (p.value ?? 0) > 0)
          .map((p) => `<div style="color:${cSub}">${escapeHtml(p.seriesName)}: ${p.value.toLocaleString()}</div>`)
          .join("");
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${escapeHtml(roleName)}</div>${lines}<div style="color:${cSub};margin-top:2px">Total: ${bar.total.toLocaleString()}</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cSub, formatter: (value: number) => value.toLocaleString() },
      splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.roleName),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cTitle },
    },
    series: summary.levels.map((level) => ({
      name: level,
      type: "bar",
      stack: "levels",
      cursor: "pointer",
      barWidth: "58%",
      itemStyle: { color: colorByLevel.get(level) ?? UNKNOWN_LEVEL_COLOR },
      data: ordered.map((b) => b.byLevel[level] ?? 0),
      animationDuration: 700,
      animationEasing: "cubicOut",
    })),
  };

  const drillRows = drill ? summary.projectsByRole.get(drill) ?? [] : [];

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={Math.max(220, summary.bars.length * 38 + 64)}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        Counts folder-permission grants by level, from the live folder-permission table (View Only
        dominates account-wide).
        {!expanded && summary.bars.some((b) => isOther(b.roleName)) && " Click “Other” to see the rest."}
      </p>

      {expanded && (
        <button
          type="button"
          onClick={() => {
            // While expanded, summary.bars is the full sorted list (nothing folded)
            // — a drilled role beyond the top-N cutoff would fold into "Other" on
            // collapse and its drilldown would otherwise show stale/empty data.
            const rank = drill ? summary.bars.findIndex((b) => b.roleName === drill) : -1;
            if (rank >= DEFAULT_TOP_N) setDrill(null);
            setExpanded(false);
          }}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          Showing all {summary.bars.length} roles — collapse to top {DEFAULT_TOP_N}
        </button>
      )}

      {drill && (
        <div data-testid="permission-level-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {drill}
              <span className="text-xs font-normal text-muted-foreground">
                {drillRows.length} {drillRows.length === 1 ? "project" : "projects"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDrill(null)}
              aria-label="Close breakdown"
              className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
            {drillRows.map((p) => (
              <li key={p.projectId} className="break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                {p.projectName} — {p.folderCount.toLocaleString()} folders
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
