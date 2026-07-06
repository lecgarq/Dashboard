"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import type { ProjectActivitySummary } from "../projectActivityCounts";
import { summarizeModules } from "../moduleCounts";

// Vibrant, cohesive palette for the project slices (mirrors RolesPieChart's
// name-keyed categorical rotation — the donut is about *which project*).
const PALETTE = [
  "#5e96ce", "#e8763f", "#21a3b0", "#d2a012", "#bc74a4", "#8fa65a",
  "#4fabc9", "#e06a62", "#86b3dc", "#f09a6f",
];
const OTHER_COLOR = "#71717a"; // zinc-500 — the data-rollup color (ModulesPieChart's UNMAPPED_COLOR role)

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

/**
 * "Activity share by project" donut (Overview tab, item 3, UAT-21.1-03) —
 * top-10 + Other, click-to-drill into that project's module breakdown.
 * Derives entirely from the same `ModuleActivityRow[]` the Overview already
 * loads (via `summarizeProjectActivity`) — NO new loader, NO new fetch. The
 * synthetic Account-level bucket is excluded from the donut by the transform;
 * its live excluded volume is stated in the caption below.
 *
 * LOCAL drill state only (mirrors `ModulesPieChart`/`ProvisionedModulesChart`'s
 * `toggleDrill` pattern) — this component does not wire into the shared
 * cross-filter-bus mechanism some sibling donuts use (no prop for an
 * externally controlled active slice, no emission back to a shared filter
 * store). Clicking a kept project slice computes
 * `summarizeModules` over that project's raw rows (`rowsByProject`) and
 * renders the module breakdown BELOW the legend (20.1-07 scroll-jump lesson —
 * drill content never renders above the legend). The "Other" slice expands
 * into the ranked list of its folded projects (`otherProjects`) — owner-
 * directed 2026-07-06; it was previously a deliberate no-op.
 *
 * Built UNMOUNTED here — plan 21.1-04 wires it into the Overview tab's new
 * 2-up row (Activity share by project + Provisioned modules).
 */
/** Drill-state sentinel for the Other slice (its projectId is "", which is
 *  also the Account-level sentinel — so the drill key gets its own value). */
const OTHER_DRILL = "__other__";

export function ProjectActivityDonut({ summary }: { summary: ProjectActivitySummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const { slices, total, accountLevelCount, otherProjectCount, otherProjects, rowsByProject } = summary;

  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (projectId: string) => {
    if (projectId === "") {
      // Other slice — expands into its folded-project list (when it exists).
      if (otherProjects.length === 0) return;
      setDrill((cur) => (cur === OTHER_DRILL ? null : OTHER_DRILL));
      return;
    }
    if (!rowsByProject.has(projectId)) return; // unknown id — no-op
    setDrill((cur) => (cur === projectId ? null : projectId));
  };

  // Stable color per project id — real projects get the categorical rotation,
  // the Other bucket always gets the muted zinc rollup color.
  const colorByProject = useMemo(() => {
    const m = new Map<string, string>();
    let hue = 0;
    for (const s of slices) {
      m.set(s.projectId, s.projectId === "" ? OTHER_COLOR : PALETTE[hue++ % PALETTE.length]);
    }
    return m;
  }, [slices]);
  const colorFor = (projectId: string) => colorByProject.get(projectId) ?? "#888";

  const drillSummary = useMemo(() => {
    if (!drill || drill === OTHER_DRILL) return null; // Other renders its own folded-project list
    return summarizeModules(rowsByProject.get(drill) ?? []);
  }, [drill, rowsByProject]);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No project activity for this selection.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const keptCount = slices.filter((s) => s.projectId !== "").length;

  const option: EChartsOption = {
    title: [
      {
        text: "",
        subtext: `${keptCount.toLocaleString()} projects · ${total.toLocaleString()} activities`,
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
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} activities · <b style='color:${cTitle}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Project activity",
        type: "pie",
        cursor: "pointer",
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
          const base = colorFor(s.projectId);
          return {
            name: s.name,
            value: s.value,
            id: s.projectId,
            itemStyle: {
              color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }] },
            },
          };
        }),
      },
    ],
  };

  return (
    <div className="panel-elevated p-5">
      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => (p.data as { id?: string })?.id !== undefined && toggleDrill((p.data as { id: string }).id) }}
      />

      {/* Ranked legend — click a project to drill into its module breakdown;
          click "Other" to expand the ranked list of its folded projects. */}
      <ul
        data-testid="project-activity-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {slices.map((s) => {
          const isOther = s.projectId === "";
          const open = drill === (isOther ? OTHER_DRILL : s.projectId);
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.projectId);
          return (
            <li key={s.projectId || "other"} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.projectId)}
                title={`${s.name} — ${s.value.toLocaleString()} activities (${fmtPct(s.value, total)}) — click to ${open ? "collapse" : "expand"}`}
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
                <span className="relative flex-1 truncate">{s.name}</span>
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

      {/* Drill-down: the Other slice's folded-project list — AFTER the legend
          (20.1-07 scroll-jump lesson: never insert new content above the row
          the user just clicked). Ranked by volume desc; % is of the WHOLE
          donut total so rows read consistently with the legend. */}
      {drill === OTHER_DRILL && otherProjects.length > 0 && (
        <div data-testid="project-activity-other-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OTHER_COLOR }} aria-hidden />
              {slices.find((s) => s.projectId === "")?.name ?? "Other"}
              <span className="text-xs font-normal text-muted-foreground">
                {otherProjects.reduce((sum, p) => sum + p.value, 0).toLocaleString()} activities
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
            {otherProjects.map((p) => (
              <li key={p.projectId} className="flex items-center gap-2 break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                <span className="relative flex-1 truncate" title={p.name}>{p.name}</span>
                <span className="shrink-0 tabular-nums text-foreground">{p.value.toLocaleString()}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(p.value, total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Drill-down: the clicked project's module breakdown — AFTER the
          legend (20.1-07 scroll-jump lesson: never insert new content above
          the row the user just clicked). */}
      {drill && drill !== OTHER_DRILL && drillSummary && (
        <div data-testid="project-activity-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {slices.find((s) => s.projectId === drill)?.name ?? drill}
              <span className="text-xs font-normal text-muted-foreground">
                {drillSummary.total.toLocaleString()} activities
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
            {drillSummary.slices.map((m) => (
              <li key={m.id} className="flex items-center gap-2 break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                <span className="relative flex-1 truncate">{m.name}</span>
                <span className="shrink-0 tabular-nums text-foreground">{m.value.toLocaleString()}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                  {fmtPct(m.value, drillSummary.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live data-truthfulness caption — never hardcoded figures. */}
      <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        {otherProjectCount > 0 && (
          <p>
            Top {keptCount.toLocaleString()} of {(keptCount + otherProjectCount).toLocaleString()} projects.
          </p>
        )}
        {accountLevelCount > 0 && (
          <p>
            Account-level admin activity ({accountLevelCount.toLocaleString()} actions) is excluded.
          </p>
        )}
      </div>
    </div>
  );
}
