"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { formatAbsolute } from "../relativeTime";
import {
  ACTIVITY_RECENCY_BANDS,
  bucketActivityRecency,
  summarizeActivityRecencyByRole,
  type ActivityRecencyBand,
} from "../activityRecencyCounts";
import { buildRoleColorMap, UNKNOWN_ROLE_COLOR, MULTIPLE_ROLES_COLOR } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";

const OTHER_ROLES_COLOR = "#a1a1aa"; // zinc-400 — muted fallback, distinct from the warning hues
const NEVER_ACTIVE_MUTED = "#71717a"; // zinc-500 — matches DormantSignInChart's "Never" tone

/**
 * Role-stacked activity-recency panel (ENG-01 semantic pivot, 20.1-01): the owner
 * rejected sign-in recency as the engagement signal — this bar chart buckets DC
 * memberships by how long ago each user's account was last SEEN ACTIVE (per
 * `AccActivityAccds`), stacked by role so the recency-vs-role relationship is
 * visible directly. Template mirrors `DormantSignInChart.tsx` (drill pattern,
 * theme-color resolution, honest captions). Built UNMOUNTED — 20.1-06 wires this
 * in and removes the old sign-in-recency panel.
 */
export function ActivityRecencyChart({
  rows,
  coverage,
  dataFloor,
}: {
  rows: ActivityRecencyRow[];
  /** Live accds project-coverage counts (from a live loader) — never hardcoded. */
  coverage?: { covered: number; total: number };
  /** Earliest date the accds crawl has data from, if known. */
  dataFloor?: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  // Captured once per mount so the chart is render-stable (band boundaries don't
  // shift mid-session as wall-clock time ticks forward).
  const [now] = useState(() => Date.now());
  const [drill, setDrill] = useState<ActivityRecencyBand | null>(null);

  const summary = useMemo(() => summarizeActivityRecencyByRole(rows, now), [rows, now]);
  const roleColors = useMemo(() => buildRoleColorMap(summary.roleNames), [summary.roleNames]);

  // Owner ask 2026-07-13: surface "no activity in the last year" (the >365d
  // band PLUS Never active) as a headline number, counted in PEOPLE (distinct
  // emails) — the bars below count memberships, so both units are stated.
  const staleYear = useMemo(() => {
    const all = new Set<string>();
    const stale = new Set<string>();
    const never = new Set<string>();
    for (const r of rows) {
      const email = r.email.toLowerCase();
      all.add(email);
      const band = bucketActivityRecency(r.lastActivityAt, now);
      if (band === ">365d" || band === "Never active") {
        stale.add(email);
        if (band === "Never active") never.add(email);
      }
    }
    // A person stale on one membership may be recently active on another —
    // only count someone stale when EVERY membership of theirs is stale.
    for (const r of rows) {
      const band = bucketActivityRecency(r.lastActivityAt, now);
      if (band !== ">365d" && band !== "Never active") {
        stale.delete(r.email.toLowerCase());
        never.delete(r.email.toLowerCase());
      }
    }
    return { people: stale.size, neverPeople: never.size, totalPeople: all.size };
  }, [rows, now]);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";

  if (rows.length === 0) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" strokeLinecap="round" />
        </svg>
        No memberships in this view.
      </div>
    );
  }

  const toggleDrill = (band: ActivityRecencyBand) => {
    setDrill((cur) => (cur === band ? null : band));
  };

  const colorFor = (roleName: string) => {
    if (roleName === "Other roles") return OTHER_ROLES_COLOR;
    if (roleName === UNKNOWN_ROLE) return UNKNOWN_ROLE_COLOR;
    if (roleName === MULTIPLE_ROLES) return MULTIPLE_ROLES_COLOR;
    return roleColors.get(roleName) ?? "#888";
  };

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 24, bottom: 32, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const list = (params as { seriesName: string; value: number; name: string }[]).filter((p) => p.value > 0);
        if (list.length === 0) return "";
        const band = list[0]?.name ?? "";
        const total = list.reduce((s, p) => s + p.value, 0);
        const rowsHtml = list
          .map((p) => `<div style="color:${cSub}">${p.seriesName}: ${p.value.toLocaleString()}</div>`)
          .join("");
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${band} — ${total.toLocaleString()} total</div>${rowsHtml}`;
      },
    },
    xAxis: {
      type: "category",
      data: [...ACTIVITY_RECENCY_BANDS],
      axisTick: { show: false },
    },
    yAxis: { type: "value" },
    series: summary.roleNames.map((roleName) => ({
      name: roleName,
      type: "bar",
      stack: "recency",
      cursor: "pointer",
      barMaxWidth: 64,
      itemStyle: { color: colorFor(roleName) },
      emphasis: { itemStyle: { opacity: 0.85 } },
      animationDuration: 700,
      animationEasing: "cubicOut",
      data: summary.countsByRole.get(roleName)?.map((count, i) => ({
        name: ACTIVITY_RECENCY_BANDS[i],
        value: count,
      })) ?? [],
    })),
  };

  const drillPeople = drill ? summary.usersByBand.get(drill) ?? [] : [];

  return (
    <div className="panel-elevated p-5">
      <div data-testid="activity-recency-headline" className="mb-2 text-sm text-muted-foreground">
        <b className="text-foreground">{rows.length.toLocaleString()}</b> project memberships by activity recency
      </div>

      {/* No-activity-in-a-year callout — people (distinct emails), not memberships. */}
      {staleYear.people > 0 && (
        <div
          data-testid="activity-recency-stale-callout"
          className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2"
        >
          <span className="text-xl font-bold tabular-nums text-amber-400">
            {staleYear.people.toLocaleString()}
          </span>
          <span className="text-sm text-foreground/90">
            of {staleYear.totalPeople.toLocaleString()} people have no recorded activity in the last year
          </span>
          <span className="text-xs text-muted-foreground">
            ({staleYear.neverPeople.toLocaleString()} of them never recorded at all — click the bars to see who)
          </span>
        </div>
      )}

      <EChart
        option={option}
        height={340}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name as ActivityRecencyBand) }}
      />

      {drill && (
        <div data-testid="activity-recency-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: drill === "Never active" ? NEVER_ACTIVE_MUTED : cTitle }}
                aria-hidden
              />
              {drill}
              <span className="text-xs font-normal text-muted-foreground">
                {drillPeople.length} {drillPeople.length === 1 ? "person" : "people"}
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
          <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "280px", columnGap: "1.5rem" }}>
            {drillPeople.map((p, i) => (
              <li key={`${p.name}-${p.company}-${i}`} className="break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                {p.name} — {p.company} — {p.role} — {p.lastActivityAt ? formatAbsolute(p.lastActivityAt) : "Never active"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {coverage && (
        <p data-testid="activity-recency-coverage-caption" className="mt-2 text-[10px] text-muted-foreground">
          Activity data covers {coverage.covered} of {coverage.total} ACC projects — memberships come from the DC
          snapshot.
        </p>
      )}
      <p data-testid="activity-recency-semantics-caption" className="mt-1 text-[10px] text-muted-foreground">
        &quot;Never active&quot; = no recorded activity in the ACCDS-crawled window
        {dataFloor ? ` (data available from ${dataFloor})` : ""}.
      </p>
    </div>
  );
}
