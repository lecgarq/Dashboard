"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { ECHARTS_DARK, ECHARTS_LIGHT } from "@/lib/colors/echartsTheme";
import type { WorkflowToolSummary } from "../workflowToolCounts";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/** Lighten a hex color by mixing it toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round((255 - ((n >> 16) & 0xff)) * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * amt));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * One workflow-tool donut (Reviews / RFIs / Submittals — Projects tab).
 * Slices are the tool's action types by volume; clicking a slice or its
 * legend row drills into that action's per-project counts BELOW the legend
 * (20.1-07 scroll-jump lesson). Colors come from the LECG brand categorical
 * palette (lib/colors/echartsTheme.ts), resolved per theme.
 */
export function WorkflowToolDonut({ label, summary }: { label: string; summary: WorkflowToolSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const { slices, total, projectCount } = summary;
  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (actionLabel: string) => setDrill((cur) => (cur === actionLabel ? null : actionLabel));

  const palette = dark ? ECHARTS_DARK.chart : ECHARTS_LIGHT.chart;
  const colorByLabel = useMemo(() => {
    const m = new Map<string, string>();
    slices.forEach((s, i) => m.set(s.label, palette[i % palette.length]));
    return m;
  }, [slices, palette]);
  const colorFor = (l: string) => colorByLabel.get(l) ?? "#888";

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";

  if (slices.length === 0) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No {label} activity for this selection.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: total.toLocaleString(),
        subtext: "actions",
        left: "center",
        top: "42%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 26, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 12 },
      },
    ],
    tooltip: {
      trigger: "item",
      padding: [10, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} actions · <b style='color:${cTitle}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: label,
        type: "pie",
        cursor: "pointer",
        radius: ["58%", "82%"],
        center: ["50%", "50%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: {
          focus: "self",
          scaleSize: 10,
          itemStyle: { shadowBlur: 28, shadowColor: cShadowHover },
        },
        blur: { itemStyle: { opacity: 0.22 } },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 24,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: slices.map((s) => {
          const base = colorFor(s.label);
          return {
            name: s.label,
            value: s.value,
            itemStyle: {
              color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }] },
            },
          };
        }),
      },
    ],
  };

  const drillSlice = drill ? slices.find((s) => s.label === drill) : null;

  return (
    <div>
      <p className="text-center text-xs text-muted-foreground">
        {projectCount.toLocaleString()} {projectCount === 1 ? "project" : "projects"} · {slices.length.toLocaleString()} action types
      </p>
      <EChart
        option={option}
        height={280}
        notMerge={false}
        onEvents={{ click: (p) => typeof p.name === "string" && toggleDrill(p.name) }}
      />

      {/* Ranked legend — click an action to drill into its per-project counts. */}
      <ul data-testid={`workflow-tool-legend-${label.toLowerCase()}`} className="mt-3 list-none border-t border-border pt-3">
        {slices.map((s) => {
          const open = drill === s.label;
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.label);
          return (
            <li key={s.label} className="mb-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.label)}
                title={`${s.label} — ${s.value.toLocaleString()} actions (${fmtPct(s.value, total)}) — click to ${open ? "collapse" : "expand"} its project breakdown`}
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                  open ? "bg-accent text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: color, opacity: open ? 0.24 : 0.16 }}
                />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
                <span className="relative flex-1 truncate">{s.label}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, total)}</span>
                <span
                  aria-hidden
                  className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Drill-down: the clicked action's per-project counts — AFTER the legend
          (20.1-07 scroll-jump lesson). % is of the WHOLE donut total. */}
      {drillSlice && (
        <div data-testid={`workflow-tool-drilldown-${label.toLowerCase()}`} className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(drillSlice.label) }} aria-hidden />
              <span className="truncate">{drillSlice.label}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {drillSlice.value.toLocaleString()} actions
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
          <ul className="max-h-64 list-none space-y-0.5 overflow-auto pr-1">
            {drillSlice.projects.map((p) => (
              <li key={p.projectId || "account-level"} className="flex items-center gap-2 truncate px-2 py-1 text-xs text-foreground/85">
                <span className="relative flex-1 truncate">{p.name}</span>
                <span className="shrink-0 tabular-nums text-foreground">{p.value.toLocaleString()}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(p.value, total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
