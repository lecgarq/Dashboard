"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { collapseCompanySlices, UNKNOWN_COMPANY } from "../companyCounts";
import type { CompanyActivitySummary } from "../companyActivityCounts";

// Same role palette + warning colors as RolesPieChart, so a role reads the same
// hue in both donuts. Slices are data colors that work on light + dark cards.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
const UNKNOWN_COLOR = "#f59e0b"; // amber — activity by someone with no company on that project
const OTHERS_COLOR = "#71717a"; // zinc-500 — the folded tail

const DEFAULT_TOP = 8;

const PIE_CSS = `
.ar-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 9999px; cursor: pointer; }
.ar-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 9999px; background: var(--card); border: 3px solid var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,.35); transition: transform .12s ease; }
.ar-range:hover::-webkit-slider-thumb { transform: scale(1.15); }
.ar-range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--ring); outline-offset: 2px; }
.ar-range::-moz-range-thumb { width: 15px; height: 15px; border: 3px solid var(--primary); border-radius: 9999px; background: var(--card); }
.ar-range::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
.ar-range:disabled { opacity: .45; cursor: not-allowed; }
`;

const isWarning = (name: string) => name === UNKNOWN_COMPANY;
const isOthers = (name: string) => name.startsWith("Others (");

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * "Activity by company" donut: each slice is a company sized by the total activity
 * its people performed (summed across projects). Clicking a company drills into the
 * people behind it — the "from whom" view. Mirrors CompaniesPieChart's Top-N collapse
 * and palette, and ModulesPieChart's click-to-drill legend.
 */
export function CompaniesActivityPieChart({
  summary,
  onUserClick,
}: {
  summary: CompanyActivitySummary;
  /** Open a person's profile (same drawer Model Coordination uses). */
  onUserClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves
  const { slices, total, distinctCompanies, usersByCompany } = summary;

  // Stable color per role name, assigned over the full (uncollapsed) slice list.
  const colorByName = useMemo(() => {
    const m = new Map<string, string>();
    let hue = 0;
    for (const d of slices) {
      m.set(
        d.name,
        d.name === UNKNOWN_COMPANY ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length],
      );
    }
    return m;
  }, [slices]);
  const singleCount = useMemo(() => slices.filter((d) => !isWarning(d.name)).length, [slices]);

  const [topN, setTopN] = useState(DEFAULT_TOP);
  const [expanded, setExpanded] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No company activity found.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const displaySlices = expanded ? slices : collapseCompanySlices(slices, topN);
  const colorFor = (name: string) => (isOthers(name) ? OTHERS_COLOR : colorByName.get(name) ?? "#888");

  const toggleDrill = (name: string) => {
    if (isOthers(name)) { setExpanded(true); return; }
    setDrill((cur) => (cur === name ? null : name));
  };
  const changeTopN = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setTopN(n);
    setExpanded(false);
  };

  const sliderMax = Math.max(singleCount, 1);
  const effectiveTop = Math.min(topN, sliderMax);
  const sliderValue = expanded ? sliderMax : effectiveTop;
  const trackPct = sliderMax > 1 ? ((sliderValue - 1) / (sliderMax - 1)) * 100 : 100;
  const presets = [10, 25].filter((n) => n < singleCount);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
      active
        ? "border-primary/60 bg-primary/15 text-primary"
        : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  // ECharts colors are baked into the JS option (not CSS), so branch on theme.
  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: "",
        subtext: `${distinctCompanies.toLocaleString()} companies · ${total.toLocaleString()} activities attributed to a company`,
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
      backgroundColor: cTipBg,
      borderColor: cTipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} activities · <b style='color:${cTipText}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Activity by company",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
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
        animationDelay: (idx: number) => idx * 16,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: displaySlices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.name) } })),
      },
    ],
  };

  const drillUsers = drill ? usersByCompany.get(drill) ?? [] : [];
  const drillSlice = drill ? slices.find((s) => s.name === drill) : undefined;

  return (
    <div className="panel-elevated p-5">
      <style>{PIE_CSS}</style>

      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}
      />

      {/* Show top: slider + presets. */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="activity-company-controls">
        <span className="font-medium text-foreground">Show</span>
        <input
          data-testid="activity-company-topn-input"
          type="range"
          min={1}
          max={sliderMax}
          value={sliderValue}
          onChange={(e) => changeTopN(e.target.value)}
          disabled={singleCount <= 1}
          aria-label="Number of top companies to show"
          className="ar-range w-36"
          style={{ background: `linear-gradient(to right, var(--primary) ${trackPct}%, var(--border) ${trackPct}%)` }}
        />
        <span className="min-w-[3.5rem] rounded-md border border-border bg-muted px-2 py-0.5 text-center font-semibold tabular-nums text-foreground">
          {expanded ? `All ${singleCount}` : `Top ${effectiveTop}`}
        </span>
        <div className="flex items-center gap-1.5">
          {presets.map((n) => (
            <button key={n} type="button" onClick={() => { setTopN(n); setExpanded(false); }} className={chip(!expanded && topN === n)}>
              Top {n}
            </button>
          ))}
          <button type="button" aria-label="Show all companies" onClick={() => setExpanded(true)} className={chip(expanded)}>
            All
          </button>
        </div>
        <span className="text-muted-foreground">of {singleCount} companies</span>
      </div>

      {/* Ranked legend — click a role to drill into the people behind it. */}
      <ul
        data-testid="activity-company-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {displaySlices.map((s) => {
          const warn = isWarning(s.name);
          const others = isOthers(s.name);
          const open = drill === s.name;
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.name);
          const userCount = usersByCompany.get(s.name)?.length ?? 0;
          return (
            <li key={s.name} data-warning={warn || undefined} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.name)}
                title={
                  others
                    ? "Show every folded company"
                    : `${s.name} — ${s.value.toLocaleString()} activities (${fmtPct(s.value, total)}) · ${userCount} ${userCount === 1 ? "person" : "people"} — click to ${open ? "collapse" : "expand"}`
                }
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
                {warn && (
                  <span data-testid="warning-icon" title="Activity that can't be tied to a single project company" className="relative shrink-0 text-warning">
                    ⚠
                  </span>
                )}
                <span className={`relative flex-1 truncate ${warn ? "text-warning" : ""}`}>{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, total)}</span>
                {!others && (
                  <span
                    aria-hidden
                    className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Drill-down: the people behind the selected role, busiest first. */}
      {drill && drillSlice && (
        <div data-testid="activity-company-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {drill}
              <span className="text-xs font-normal text-muted-foreground">
                {drillUsers.length} {drillUsers.length === 1 ? "person" : "people"} · {drillSlice.value.toLocaleString()} activities
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
            {drillUsers.map((u) => {
              const barPct = drillSlice.value > 0 ? (u.count / drillSlice.value) * 100 : 0;
              const clickable = !!(u.email && onUserClick);
              return (
                <li key={u.email} className="break-inside-avoid">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onUserClick!(u.email)}
                    title={clickable ? `View ${u.name}'s profile` : u.email}
                    className={`group/u relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ${
                      clickable ? "cursor-pointer hover:bg-accent" : "cursor-default"
                    }`}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${barPct}%`, background: colorFor(drill), opacity: 0.12 }} />
                    <span
                      className={`relative flex-1 truncate ${
                        clickable ? "text-foreground/90 group-hover/u:text-primary group-hover/u:underline underline-offset-2" : "text-foreground/85"
                      }`}
                    >
                      {u.name}
                    </span>
                    <span className="relative shrink-0 tabular-nums text-foreground">{u.count.toLocaleString()}</span>
                    <span className="relative w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(u.count, drillSlice.value)}</span>
                    {clickable && (
                      <span aria-hidden className="relative shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/u:opacity-100">›</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
