"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { buildRoleColorMap } from "../roleColors";
import { formatBytes, summarizePermissionFootprint } from "../permissionFootprintCounts";
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";

const OTHER_COLOR = "#71717a"; // zinc-500 — the folded "Other" tail
const isOther = (roleName: string) => roleName.startsWith("Other (");

// ACC role names are third-party data rendered into tooltip HTML via innerHTML
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Permission-footprint-by-role panel (PERM-01): horizontal bars, one per role,
 * sorted by total granted bytes desc — "which roles reach the most data". Bar
 * length = totalBytes; folder count + project count surface via label/tooltip.
 * Clicking a role (bar or legend row) drills into its per-project breakdown,
 * sourced entirely from `AccFolderPermissionSummary` (no raw-table touch). Local
 * drill state only — mirrors `RolesPieChart.tsx`'s toggleDrill pattern, not the
 * shared cross-filter bus (per 20-RESEARCH.md Open Q3 resolution).
 */
export function PermissionFootprintChart({ rows }: { rows: PermissionFootprintRow[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const [drill, setDrill] = useState<string | null>(null);

  const summary = useMemo(() => summarizePermissionFootprint(rows), [rows]);

  const colorByRole = useMemo(
    () => buildRoleColorMap(summary.bars.filter((b) => !isOther(b.roleName)).map((b) => b.roleName)),
    [summary.bars],
  );
  const colorFor = (roleName: string) => (isOther(roleName) ? OTHER_COLOR : colorByRole.get(roleName) ?? "#888");

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (rows.length === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No permission summary rows for this selection.
      </div>
    );
  }

  const toggleDrill = (roleName: string) => {
    if (isOther(roleName)) return; // no drill entry for the folded tail
    setDrill((cur) => (cur === roleName ? null : roleName));
  };

  const ordered = [...summary.bars].reverse(); // category axis renders bottom-up

  const option: EChartsOption = {
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number };
        const bar = summary.bars.find((b) => b.roleName === p.name);
        if (!bar) return "";
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${escapeHtml(bar.roleName)}</div><div style="color:${cSub}">${formatBytes(bar.totalBytes)} · ${bar.folderCount.toLocaleString()} folders · ${bar.projectCount.toLocaleString()} projects</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cSub, formatter: (value: number) => formatBytes(value) },
      splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.roleName),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cTitle },
    },
    series: [
      {
        name: "Permission footprint",
        type: "bar",
        cursor: "pointer",
        barWidth: "58%",
        data: ordered.map((b) => ({
          value: b.totalBytes,
          itemStyle: { color: colorFor(b.roleName), borderRadius: [0, 5, 5, 0] },
        })),
        label: { show: true, position: "right", color: cSub, formatter: (p: unknown) => formatBytes((p as { value: number }).value) },
        animationDuration: 700,
        animationEasing: "cubicOut",
      },
    ],
  };

  const drillRows = drill ? summary.projectsByRole.get(drill) ?? [] : [];

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={Math.max(200, summary.bars.length * 38 + 40)}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}
      />

      {drill && (
        <div data-testid="permission-footprint-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
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
                {p.projectName} — {p.folderCount.toLocaleString()} folders — {formatBytes(p.totalBytes)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul
        data-testid="permission-footprint-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {summary.bars.map((b) => {
          const open = drill === b.roleName;
          const other = isOther(b.roleName);
          return (
            <li key={b.roleName} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                disabled={other}
                onClick={() => toggleDrill(b.roleName)}
                title={`${b.roleName} — ${formatBytes(b.totalBytes)} · ${b.folderCount.toLocaleString()} folders · ${b.projectCount.toLocaleString()} projects`}
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ${
                  other ? "cursor-default text-muted-foreground" : "hover:bg-accent text-foreground/85"
                } ${open ? "bg-accent text-foreground" : ""}`}
              >
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(b.roleName) }} />
                <span className="relative flex-1 truncate">{b.roleName}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{formatBytes(b.totalBytes)}</span>
                <span className="relative w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                  {b.folderCount.toLocaleString()} folders
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
