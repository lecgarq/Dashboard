"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import type { ProvisionedModuleSummary } from "../provisionedModulesCounts";
import { MODULE_COLORS } from "./ModulesPieChart";

const FALLBACK_COLOR = "#3a9dbf"; // state-blue sky — any module id absent from MODULE_COLORS
const DRILL_ROW_CAP = 30;

const colorFor = (id: string) => MODULE_COLORS[id] ?? FALLBACK_COLOR;

/**
 * "Provisioned modules" panel (Overview tab, item 1, UAT-21.1-01) — horizontal
 * bars of member-module grant counts (`AccProjectMember.products`, full
 * live-project coverage), one bar per module, click-to-drill into that
 * module's top-granted projects. LOCAL drill state only (mirrors
 * `ModulesPieChart`/`PermissionLevelChart`'s `toggleDrill` pattern) — this
 * component does not wire into the shared cross-filter-bus mechanism used by
 * some sibling donuts (no prop for an externally controlled active slice, no
 * emission back to a shared filter store).
 *
 * Built UNMOUNTED here — plan 21.1-04 wires it into the Overview tab's new
 * 2-up row (Activity share by project + Provisioned modules).
 */
export function ProvisionedModulesChart({ summary }: { summary: ProvisionedModuleSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (id: string) => setDrill((cur) => (cur === id ? null : id));

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";

  if (summary.total === 0) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No module grants for this selection.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const ordered = [...summary.bars].reverse(); // category axis renders bottom-up

  const option: EChartsOption = {
    grid: { left: 8, right: 48, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const list = params as Array<{ name: string; value: number }>;
        if (!list.length) return "";
        const { name, value } = list[0];
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${name}</div><div style="color:${cSub}">${value.toLocaleString()} grants</div>`;
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
      data: ordered.map((b) => b.name),
      axisLine: { lineStyle: { color: cAxis } },
      axisLabel: { color: cTitle },
    },
    series: [
      {
        name: "Module grants",
        type: "bar",
        cursor: "pointer",
        barWidth: "58%",
        label: {
          show: true,
          position: "right",
          color: cTitle,
          fontSize: 11,
          formatter: (p: unknown) => {
            const value = (p as { value?: number }).value;
            return typeof value === "number" ? value.toLocaleString() : "";
          },
        },
        data: ordered.map((b) => ({ value: b.value, id: b.id, itemStyle: { color: colorFor(b.id) } })),
        animationDuration: 700,
        animationEasing: "cubicOut",
      },
    ],
  };

  const drillRows = drill ? summary.projectsByModule.get(drill) ?? [] : [];
  const drillBar = drill ? summary.bars.find((b) => b.id === drill) : undefined;
  const visibleDrillRows = drillRows.slice(0, DRILL_ROW_CAP);
  const hiddenDrillCount = drillRows.length - visibleDrillRows.length;

  return (
    <div>
      <EChart
        option={option}
        height={Math.max(220, summary.bars.length * 38 + 48)}
        notMerge={false}
        onEvents={{ click: (p) => (p.data as { id?: string })?.id && toggleDrill((p.data as { id: string }).id) }}
      />

      {/* Drill-down: top projects for the selected module, above the zero-grant footer. */}
      {drill && drillBar && (
        <div data-testid="provisioned-modules-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {drillBar.name}
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
            {visibleDrillRows.map((p) => (
              <li key={p.projectId} className="break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                {p.projectName} — {p.count.toLocaleString()} grants
              </li>
            ))}
          </ul>
          {hiddenDrillCount > 0 && (
            <p className="mt-1 px-2 text-xs text-muted-foreground">+{hiddenDrillCount} more projects</p>
          )}
        </div>
      )}

      {/* Modules with no grants in the current scope — labeled, never hidden. */}
      {summary.zeroModules.length > 0 && (
        <div data-testid="provisioned-modules-zero" className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-medium">No grants:</span>
          {summary.zeroModules.map((m) => (
            <span key={m.id} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground/80">
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
