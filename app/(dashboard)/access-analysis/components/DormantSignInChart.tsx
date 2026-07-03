"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { formatAbsolute } from "../relativeTime";
import { summarizeSignInRecency, type RecencyBand } from "../signInRecencyCounts";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";

// Warm ramp for the 4 dated bands (healthy -> stale); "Never signed in" gets a
// muted zinc tone so it reads as "different in kind" (no date at all), not just
// another degree of staleness.
const BAND_COLOR: Record<RecencyBand, string> = {
  "<30d": "#34d399", // emerald — recently active
  "30–90d": "#fbbf24", // amber
  "90–365d": "#fb923c", // orange
  ">365d": "#f87171", // red — long dormant
  "Never signed in": "#71717a", // zinc-500 — muted, distinct in kind (no date at all)
};

/**
 * Dormant-user engagement panel (ENG-01): a vertical bar per sign-in recency band,
 * sourced from AccDcUser.lastSignIn joined per-project via AccDcProjectUser (see
 * lib/server/signInRecencyView.ts DEVIATION note — AccProjectMember.lastSignIn is
 * a dead field). Clicking a band drills to the users behind it, sorted most-dormant
 * first. Carries an explicit DC-coverage scope caption per the Dashboard "under-covered
 * sources labeled, not hidden" constraint — never hardcode the coverage numbers.
 */
export function DormantSignInChart({
  rows,
  dcCoverage,
}: {
  rows: SignInRecencyRow[];
  /** Live DC-coverage counts (from loadDcCoverage) — parent passes this, never hardcoded. */
  dcCoverage?: { covered: number; total: number };
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  // Captured once per mount so the chart is render-stable (band boundaries don't
  // shift mid-session as wall-clock time ticks forward).
  const [now] = useState(() => Date.now());
  const [drill, setDrill] = useState<RecencyBand | null>(null);

  const summary = useMemo(() => summarizeSignInRecency(rows, now), [rows, now]);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";

  if (rows.length === 0) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" strokeLinecap="round" />
        </svg>
        No sign-in data for this selection (Data Connector coverage only).
      </div>
    );
  }

  const toggleDrill = (band: RecencyBand) => {
    setDrill((cur) => (cur === band ? null : band));
  };

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 24, bottom: 32, containLabel: true },
    tooltip: {
      trigger: "item",
      padding: [8, 12],
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number };
        return `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${p.name}</div><div style="color:${cSub}">${p.value.toLocaleString()} users</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: summary.bands.map((b) => b.band),
      axisTick: { show: false },
    },
    yAxis: { type: "value" },
    series: [
      {
        name: "Users",
        type: "bar",
        cursor: "pointer",
        barMaxWidth: 64,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: (params: unknown) => {
            const p = params as { name: string };
            return BAND_COLOR[p.name as RecencyBand] ?? "#888";
          },
        },
        emphasis: { itemStyle: { opacity: 0.85 } },
        label: { show: true, position: "top", formatter: "{c}", color: cSub, fontSize: 11 },
        animationDuration: 700,
        animationEasing: "cubicOut",
        data: summary.bands.map((b) => ({ name: b.band, value: b.count })),
      },
    ],
  };

  const drillPeople = drill ? summary.usersByBand.get(drill) ?? [] : [];

  return (
    <div className="panel-elevated p-5">
      <div data-testid="dormant-headline" className="mb-2 text-sm text-muted-foreground">
        <b className="text-foreground">{rows.length.toLocaleString()}</b> project memberships by sign-in recency
      </div>

      <EChart
        option={option}
        height={320}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name as RecencyBand) }}
      />

      {drill && (
        <div data-testid="dormant-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[drill] }} aria-hidden />
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
          <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
            {drillPeople.map((p, i) => (
              <li key={`${p.name}-${p.company}-${i}`} className="break-inside-avoid truncate px-2 py-1 text-xs text-foreground/85">
                {p.name} — {p.company} — {p.lastSignIn ? formatAbsolute(p.lastSignIn) : "Never"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dcCoverage && (
        <p data-testid="dormant-scope-caption" className="mt-2 text-[10px] text-muted-foreground">
          Sign-in dates come from Data Connector metadata ({dcCoverage.covered} of {dcCoverage.total} projects). The
          live ACC API sync captures no sign-in timestamps.
        </p>
      )}
    </div>
  );
}
