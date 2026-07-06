"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import {
  summarizeIssueStatus,
  deriveIssueCoverageCaption,
  type IssueStatusInputRow,
} from "../issueFunnelCounts";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

// Fixed per-status color map — semantic honesty: "settled" statuses (closed/
// completed) read green/teal, "active" statuses (open/in_progress) read
// warm/blue. Colors are distinct from the timeline's amber accent.
const STATUS_COLORS: Record<string, string> = {
  open: "#38bdf8", // sky — active
  in_progress: "#f59e0b", // amber — active
  in_review: "#a78bfa", // violet — active, pending review
  pending: "#fbbf24", // yellow — active, waiting
  draft: "#71717a", // zinc — not yet active
  not_approved: "#fb7185", // rose — active, blocked
  completed: "#34d399", // emerald — settled
  closed: "#10b981", // green — settled
};
const OVERFLOW_COLOR = "#e879f9"; // fuchsia — any unexpected raw status value

const colorFor = (status: string) => STATUS_COLORS[status] ?? OVERFLOW_COLOR;

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

/** Live "N of M fetched projects" caption text — shared wording with IssueTimelineChart. */
function coverageCaptionText(caption: ReturnType<typeof deriveIssueCoverageCaption>): string {
  const { fetched, total, unavailable } = caption;
  return `Issue data covers ${fetched} of ${total} fetched projects${
    unavailable > 0 ? ` — ${unavailable} forbidden/error` : ""
  }`;
}

export function IssueStatusChart({
  rows,
  coverageProjects,
}: {
  /** Selection-filtered statusRows — component summarizes internally. */
  rows: ReadonlyArray<IssueStatusInputRow>;
  coverageProjects: ReadonlyArray<IssueCoverageInputRow>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (status: string) => setDrill((cur) => (cur === status ? null : status));

  const summary = useMemo(() => summarizeIssueStatus(rows), [rows]);
  const caption = deriveIssueCoverageCaption(coverageProjects);

  if (rows.length === 0) {
    const distinctionLine =
      caption.unavailable > 0
        ? `Issue data unavailable for ${caption.unavailable} of ${caption.total} projects in this selection — absence here is not zero issues.`
        : "All projects in this selection were fetched — this selection genuinely has no issues.";
    return (
      <div
        data-testid="issue-status-empty"
        className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card px-6 text-center text-sm text-muted-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No issues for this view
        <span className="text-xs opacity-70">{distinctionLine}</span>
      </div>
    );
  }

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: summary.total.toLocaleString(),
        subtext: "issues",
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
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} issues · <b style='color:${cTitle}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Issue status",
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
      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => (p.data as { id?: string })?.id && toggleDrill((p.data as { id: string }).id) }}
      />

      {/* Drill-down: the projects behind the selected status — above the legend. */}
      {drill && drillSlice && (
        <div data-testid="issue-status-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
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
                  <span className="shrink-0 tabular-nums text-foreground">{r.count.toLocaleString()} issues</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ranked legend — all 8 statuses always present, click any to drill into its projects. */}
      <ul
        data-testid="issue-status-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {summary.slices.map((s) => {
          const open = drill === s.status;
          const barPct = summary.total > 0 ? (s.count / summary.total) * 100 : 0;
          const color = colorFor(s.status);
          return (
            <li key={s.status} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.status)}
                title={`${s.label} — ${s.count.toLocaleString()} issues (${fmtPct(s.count, summary.total)}) — click to ${open ? "collapse" : "expand"}`}
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
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.count, summary.total)}</span>
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

      {caption.total > 0 ? (
        <p
          data-testid="issue-status-coverage-caption"
          className="mt-2 text-[10px] text-muted-foreground"
        >
          {coverageCaptionText(caption)}
        </p>
      ) : null}
    </div>
  );
}
