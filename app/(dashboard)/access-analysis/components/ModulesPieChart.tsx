"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { UNMAPPED_MODULE, type ModuleSummary, type ActivityType } from "../moduleCounts";
import { GROUP_ORDER } from "../moduleOverrides";

/** Group a module's activity types by ACC tool (Files / Reviews / Sheets / …), ordered for display. */
function groupByTool(types: ActivityType[]): Array<[string, ActivityType[]]> {
  const m = new Map<string, ActivityType[]>();
  for (const t of types) (m.get(t.group) ?? m.set(t.group, []).get(t.group)!).push(t);
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g);
    return i < 0 ? GROUP_ORDER.length : i;
  };
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

// One stable color per module id — the donut is about *which module*, so colors
// are fixed (not rotated like role names). Reads well on light + dark cards.
export const MODULE_COLORS: Record<string, string> = {
  dataManagement: "#4e8ccb", // azul
  build: "#e2683a", // naranja
  designCollaboration: "#849c4c", // palm
  preconstruction: "#b4679c", // wine
  modelCoordination: "#3a9dbf", // state-blue sky
  adminActions: "#e0577b", // wine-rose — permission/membership/admin activity
  datum: "#e05b55", // warm red
  insight: "#efb628", // goldenrod
  design: "#0e98a8", // seaweed
  autospecs: "#c992b8", // wine (light tier)
};
const UNMAPPED_COLOR = "#71717a"; // zinc-500 — the data-quality bucket

const colorFor = (id: string) => (id === UNMAPPED_MODULE ? UNMAPPED_COLOR : MODULE_COLORS[id] ?? "#888");

/** Lighten a hex color by mixing it toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round((255 - ((n >> 16) & 0xff)) * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * amt));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function ModulesPieChart({ summary }: { summary: ModuleSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const { slices, total, activeModules, zeroModules, typesByModule } = summary;

  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (id: string) => setDrill((cur) => (cur === id ? null : id));

  // Precompute a rich tooltip per slice: header + top activity types.
  const cTitle = dark ? "#fafafa" : "#111827";
  // #52525b (zinc-600) — nudged from #6b7280 (gray-500, 4.6:1 marginal) to give
  // genuine projector headroom while remaining a muted sub-label. ~7.0:1 on #fff.
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const tooltipByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slices) {
      const types = (typesByModule.get(s.id) ?? []).slice(0, 5);
      const rows = types
        .map(
          (t) =>
            `<div style='display:flex;justify-content:space-between;gap:14px;color:${cSub}'><span>${t.label}</span><b style='color:${cTitle}'>${t.count.toLocaleString()}</b></div>`,
        )
        .join("");
      const more = (typesByModule.get(s.id)?.length ?? 0) - types.length;
      const moreLine = more > 0 ? `<div style='color:${cSub};margin-top:2px'>+${more} more — click to expand</div>` : "";
      m.set(
        s.name,
        `<div style='font-weight:700;color:${cTitle};margin-bottom:4px'>${s.name}</div>` +
          `<div style='color:${cSub};margin-bottom:6px'>${s.value.toLocaleString()} activities · ${fmtPct(s.value, total)}</div>` +
          rows +
          moreLine,
      );
    }
    return m;
  }, [slices, typesByModule, total, cTitle, cSub]);

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No activity found.
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
        // Title text lives in the section header above the card; keep only the
        // live count line here so the heading isn't repeated inside the donut.
        text: "",
        subtext: `${activeModules.toLocaleString()} active modules · ${total.toLocaleString()} activities`,
        left: "center",
        top: 0,
        subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: total.toLocaleString(),
        subtext: "activities",
        left: "center",
        top: "45%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      padding: [10, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (p: unknown) => {
        const name = (p as { name?: string }).name;
        return name ? tooltipByName.get(name) ?? name : "";
      },
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
        universalTransition: true,
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: {
          focus: "self",
          scaleSize: 12,
          itemStyle: { shadowBlur: 28, shadowColor: cShadowHover },
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: cTitle },
        },
        blur: { itemStyle: { opacity: 0.22 } },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 24,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: slices.map((s) => {
          const base = colorFor(s.id);
          return {
            name: s.name,
            value: s.value,
            id: s.id,
            itemStyle: {
              color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }] },
            },
          };
        }),
      },
    ],
  };

  const drillTypes = drill ? typesByModule.get(drill) ?? [] : [];
  const drillSlice = drill ? slices.find((s) => s.id === drill) : undefined;

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => (p.data as { id?: string })?.id && toggleDrill((p.data as { id: string }).id) }}
      />

      {/* Drill-down: every activity type that maps into the selected module. */}
      {drill && drillSlice && (
        <div data-testid="module-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {drillSlice.name}
              <span className="text-xs font-normal text-muted-foreground">
                {drillTypes.length} activity types · {drillSlice.value.toLocaleString()} activities
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
          {/* Activity types grouped by the module's ACC tools (Files / Reviews / Sheets / …). */}
          <div className="max-h-80 space-y-3 overflow-auto pr-1">
            {groupByTool(drillTypes).map(([group, items]) => {
              const catTotal = items.reduce((s, t) => s + t.count, 0);
              return (
                <div key={group}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{group}</span>
                    <span className="tabular-nums text-muted-foreground/80">
                      {catTotal.toLocaleString()} · {fmtPct(catTotal, drillSlice.value)}
                    </span>
                  </div>
                  <ul className="list-none space-y-0.5" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
                    {items.map((t) => {
                      const barPct = drillSlice.value > 0 ? (t.count / drillSlice.value) * 100 : 0;
                      return (
                        <li key={t.raw} className="relative flex items-center gap-2 break-inside-avoid overflow-hidden rounded-md px-2 py-1 text-xs">
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 rounded-md"
                            style={{ width: `${barPct}%`, background: colorFor(drill), opacity: 0.12 }}
                          />
                          <span className="relative flex-1 truncate text-foreground/85" title={t.raw}>{t.label}</span>
                          <span className="relative shrink-0 tabular-nums text-foreground">{t.count.toLocaleString()}</span>
                          <span className="relative w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(t.count, drillSlice.value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranked legend — click a module to drill into its activity types. */}
      <ul
        data-testid="module-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {slices.map((s) => {
          const warn = s.id === UNMAPPED_MODULE;
          const open = drill === s.id;
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.id);
          const typeCount = typesByModule.get(s.id)?.length ?? 0;
          return (
            <li key={s.id} data-warning={warn || undefined} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.id)}
                title={`${s.name} — ${s.value.toLocaleString()} activities (${fmtPct(s.value, total)}) · ${typeCount} activity types — click to ${open ? "collapse" : "expand"}`}
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                  open ? "bg-accent text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: color, opacity: open ? 0.24 : 0.16 }}
                />
                <span
                  className="relative h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
                />
                {warn && (
                  <span data-testid="warning-icon" title="Activity not in the taxonomy" className="relative shrink-0 text-warning">
                    ⚠
                  </span>
                )}
                <span className={`relative flex-1 truncate ${warn ? "text-warning" : ""}`}>{s.name}</span>
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

      {/* Modules with no activity in the current scope. */}
      {zeroModules.length > 0 && (
        <div data-testid="module-zero" className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-medium">No activity in scope:</span>
          {zeroModules.map((m) => (
            <span key={m.id} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground/80">
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
