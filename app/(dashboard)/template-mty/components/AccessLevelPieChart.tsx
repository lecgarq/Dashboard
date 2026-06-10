// app/(dashboard)/template-mty/components/AccessLevelPieChart.tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import type { EChartsOption } from "echarts";
import type { CategorySlice } from "@/lib/server/templateView";

// Project Admin = primary indigo, Project Member = zinc; anything else falls back.
const COLORS: Record<string, string> = {
  "Project Admin": "#6366f1",
  "Project Member": "#a1a1aa",
};
const colorFor = (name: string) => COLORS[name] ?? "#888";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(0)}%`;
}

export function AccessLevelPieChart({ slices }: { slices: CategorySlice[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const total = slices.reduce((s, x) => s + x.value, 0);

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
        text: total.toLocaleString(),
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
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} members · {d}%</div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Access",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: { focus: "self", scaleSize: 12, label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: cTitle } },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.name) } })),
      },
    ],
  }), [slices, total, cTitle, cSub, cTipBg, cTipBorder, cTipText, cSlice, cShadow]);

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No members found.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <EChart option={option} height={400} notMerge={false} />
      <ul data-testid="access-level-legend" className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(s.name) }} />
            <span className="text-foreground/85">{s.name}</span>
            <span className="tabular-nums text-foreground">{s.value}</span>
            <span className="tabular-nums text-muted-foreground">{fmtPct(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
