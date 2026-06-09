// app/(dashboard)/template-mty/components/ProvisionedModulesPieChart.tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import type { EChartsOption } from "echarts";
import type { ProvisionedModuleSummary } from "../provisionedModules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

// One stable colour per module id (matches the activity donut's palette).
const MODULE_COLORS: Record<ModuleId, string> = {
  dataManagement: "#6366f1",
  insight: "#facc15",
  build: "#f59e0b",
  modelCoordination: "#38bdf8",
  designCollaboration: "#34d399",
  preconstruction: "#a78bfa",
  design: "#2dd4bf",
  autospecs: "#c084fc",
  datum: "#fb7185",
};
const colorFor = (id: ModuleId) => MODULE_COLORS[id] ?? "#888";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function ProvisionedModulesPieChart({ summary }: { summary: ProvisionedModuleSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const { slices, total, memberCount } = summary;

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";

  const option = useMemo<EChartsOption>(() => ({
    title: [
      {
        text: "",
        subtext: `${slices.length} modules · ${memberCount} members`,
        left: "center", top: 0, subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: memberCount.toLocaleString(),
        subtext: "members",
        left: "center", top: "45%", textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: cTipBg, borderColor: cTipBorder, borderWidth: 1, padding: [8, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} members</div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Modules",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: { focus: "self", scaleSize: 12, label: { show: true, formatter: "{b}\n{c}", fontSize: 13, fontWeight: 700, color: cTitle } },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.id) } })),
      },
    ],
  }), [slices, memberCount, cTitle, cSub, cTipBg, cTipBorder, cTipText, cSlice, cShadow]);

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No module access found.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <EChart option={option} height={400} notMerge={false} />
      <ul data-testid="provisioned-module-legend" className="mt-3 list-none border-t border-border pt-3"
          style={{ columnWidth: "248px", columnGap: "1.5rem" }}>
        {slices.map((s) => {
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.id);
          return (
            <li key={s.id} className="mb-1 break-inside-avoid">
              <div className="relative flex min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-xs text-foreground/85"
                   title={`${s.name} — ${s.value} members provisioned`}>
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-md"
                      style={{ width: `${barPct}%`, background: color, opacity: 0.16 }} />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
                <span className="relative flex-1 truncate">{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value}</span>
                <span className="relative w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                  {fmtPct(s.value, total)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
