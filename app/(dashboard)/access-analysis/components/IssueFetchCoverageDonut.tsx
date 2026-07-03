"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { formatRelativeTime, formatAbsolute } from "../relativeTime";
import {
  summarizeIssueCoverage,
  type IssueCoverageInputRow,
} from "../issueFetchCoverageCounts";

// Semantically honest bucket colors — ok = positive (emerald), zero_issues =
// neutral (zinc), forbidden = amber, error = red/rose. Matches the amber/rose
// precedent already used for warning slices (roleColors.ts UNKNOWN/MULTIPLE).
const BUCKET_COLORS: Record<string, string> = {
  ok: "#34d399", // emerald — issues were fetched
  zero_issues: "#71717a", // zinc-500 — neutral, not a problem
  forbidden: "#f59e0b", // amber — credentials issue
  error: "#fb7185", // rose — fetch failed
};
const OVERFLOW_COLOR = "#a78bfa"; // violet — any unexpected raw status value

const colorFor = (status: string) => BUCKET_COLORS[status] ?? OVERFLOW_COLOR;

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

/** Honest per-bucket status note shown in the drill list for non-ok buckets. */
function statusNote(status: string): string {
  if (status === "zero_issues") return "No issues found";
  if (status === "forbidden") return "Access forbidden — could not scan";
  if (status === "error") return "Fetch failed";
  return `Status: ${status}`;
}

export interface IssueFetchCoverageDonutProps {
  /** Latest run's metadata, or null when no AccIssueFetchRun exists yet at all. */
  coverage: {
    runStatus: string;
    runStartedAt: string | null;
    runFinishedAt: string | null;
  } | null;
  /** Selection-filtered per-project rows (parent applies filterRowsBySelection). */
  projects: ReadonlyArray<IssueCoverageInputRow>;
}

/**
 * "Issue-fetch coverage" donut (ISSUE-01) — trust framing for every issue metric
 * built on top of it. Always shows all 4 honest status buckets (ok / zero_issues
 * / forbidden / error), even at 0 — nothing hidden or merged. Any bucket
 * (including ok/zero_issues) is drillable to its project list.
 */
export function IssueFetchCoverageDonut({ coverage, projects }: IssueFetchCoverageDonutProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (status: string) => setDrill((cur) => (cur === status ? null : status));

  const summary = useMemo(() => summarizeIssueCoverage(projects), [projects]);
  const total = summary.slices.reduce((sum, s) => sum + s.count, 0);

  if (coverage === null) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No issue fetch run recorded yet.
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No fetch results for this selection.
      </div>
    );
  }

  const inProgress = coverage.runStatus === "running" || coverage.runFinishedAt == null;

  const cTitle = dark ? "#fafafa" : "#111827";
  // #52525b (zinc-600) — see chartContrast.test.ts: nudged from gray-500 for
  // genuine projector headroom while staying a muted sub-label (~7.0:1 on #fff).
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: "",
        subtext: `${total.toLocaleString()} projects checked`,
        left: "center",
        top: 0,
        subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: total.toLocaleString(),
        subtext: "projects checked",
        left: "center",
        top: "45%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} projects · <b style='color:${cTitle}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Issue fetch coverage",
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
        data: summary.slices.map((s) => {
          const base = colorFor(s.status);
          return {
            name: s.label,
            value: s.count,
            id: s.status,
            itemStyle: {
              color: {
                type: "linear" as const,
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }],
              },
            },
          };
        }),
      },
    ],
  };

  const drillSlice = drill ? summary.slices.find((s) => s.status === drill) : undefined;
  const drillRows = drill ? summary.projectsByStatus.get(drill) ?? [] : [];

  return (
    <div className="panel-elevated p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {coverage.runStartedAt && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
            title={`Latest issue fetch: ${formatAbsolute(coverage.runStartedAt)}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_currentColor]" aria-hidden />
            Latest issue fetch: {formatRelativeTime(coverage.runStartedAt)}
          </span>
        )}
        {inProgress && (
          <span
            data-testid="issue-coverage-in-progress"
            className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning"
          >
            Issue extraction in progress — counts are partial
          </span>
        )}
      </header>

      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => (p.data as { id?: string })?.id && toggleDrill((p.data as { id: string }).id) }}
      />

      {/* Drill-down: the projects behind the selected bucket — above the legend. */}
      {drill && drillSlice && (
        <div data-testid="issue-coverage-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(drill) }} aria-hidden />
              {drillSlice.label}
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
          <ul className="max-h-80 list-none space-y-0.5 overflow-y-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
            {drillRows.map((r) => (
              <li key={r.projectId} className="break-inside-avoid">
                <div className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                  <span className="flex-1 truncate text-foreground/85" title={r.projectName}>{r.projectName}</span>
                  {drill === "ok" ? (
                    <span className="shrink-0 tabular-nums text-foreground">{r.issueCount.toLocaleString()} issues</span>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">{statusNote(r.status)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ranked legend — all 4 honest buckets, click any to drill into its projects. */}
      <ul
        data-testid="issue-coverage-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {summary.slices.map((s) => {
          const open = drill === s.status;
          const barPct = total > 0 ? (s.count / total) * 100 : 0;
          const color = colorFor(s.status);
          return (
            <li key={s.status} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.status)}
                title={`${s.label} — ${s.count.toLocaleString()} projects (${fmtPct(s.count, total)}) — click to ${open ? "collapse" : "expand"}`}
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
                <span className="relative shrink-0 tabular-nums text-foreground">{s.count.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.count, total)}</span>
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
    </div>
  );
}
