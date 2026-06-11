# Activity Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a continuous, month-by-month line/area chart of total ACC activity volume across all years to `/access-analysis`, tied to the existing project picker.

**Architecture:** Mirror the page's "ship-and-rebucket" pattern. A cached server loader ships per-(project, month) counts; a pure summarizer filters to the picked projects, sums per month, and zero-fills a continuous month axis; a theme-aware ECharts area chart renders it with a zoom slider, peak marker, and a year-over-year tooltip. The new panel is gated on an optional prop so existing tests are unaffected.

**Tech Stack:** Next.js (App Router, RSC), Prisma (`$queryRaw` + Postgres `date_trunc`), ECharts via `echarts-for-react`, `next-themes`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-11-activity-timeline-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `app/(dashboard)/access-analysis/timelineCounts.ts` (create) | Pure types + `summarizeActivityTimeline()` — filter, sum, zero-fill, headline. No React/IO. |
| `lib/server/activityTimelineView.ts` (create) | Cached `$queryRaw` → per-(project, month) rows. Server-only. |
| `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` (create) | Client ECharts area chart + headline + empty state. |
| `app/(dashboard)/access-analysis/page.tsx` (modify) | Load timeline rows; pass to charts. |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (modify) | Accept rows, summarize against `selected`, render section first. |
| `app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts` (create) | Summarizer unit tests. |
| `app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx` (create) | Chart render + empty-state tests. |
| `app/(dashboard)/access-analysis/page.test.tsx` (modify) | Mock the new loader so the route test still renders. |

---

## Task 1: Pure summarizer (`timelineCounts.ts`)

**Files:**
- Create: `app/(dashboard)/access-analysis/timelineCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeActivityTimeline } from "../timelineCounts";

const all = new Set<string>(["p1", "p2"]);

describe("summarizeActivityTimeline", () => {
  it("returns an empty summary when nothing is selected", () => {
    const rows = [{ projectId: "p1", month: "2024-01", count: 5 }];
    const s = summarizeActivityTimeline(rows, new Set());
    expect(s.points).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.peak).toBeNull();
    expect(s.busiestYear).toBeNull();
    expect(s.span).toBeNull();
  });

  it("sums multiple projects in the same month", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 5 },
      { projectId: "p2", month: "2024-01", count: 7 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points).toHaveLength(1);
    expect(s.points[0]).toMatchObject({ month: "2024-01", label: "Jan 2024", count: 12 });
    expect(s.total).toBe(12);
  });

  it("zero-fills missing months between the first and last", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 10 },
      { projectId: "p1", month: "2024-04", count: 4 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points.map((p) => p.month)).toEqual(["2024-01", "2024-02", "2024-03", "2024-04"]);
    expect(s.points.map((p) => p.count)).toEqual([10, 0, 0, 4]);
    expect(s.span).toEqual({ from: "2024-01", to: "2024-04" });
  });

  it("spans a year boundary", () => {
    const rows = [
      { projectId: "p1", month: "2023-11", count: 1 },
      { projectId: "p1", month: "2024-02", count: 2 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points.map((p) => p.month)).toEqual(["2023-11", "2023-12", "2024-01", "2024-02"]);
  });

  it("handles a single month (from == to)", () => {
    const rows = [{ projectId: "p1", month: "2024-06", count: 9 }];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points).toHaveLength(1);
    expect(s.span).toEqual({ from: "2024-06", to: "2024-06" });
  });

  it("picks the earliest month on a peak tie", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 8 },
      { projectId: "p1", month: "2024-02", count: 8 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.peak).toMatchObject({ month: "2024-01", count: 8 });
  });

  it("reports the busiest year and a total equal to the sum of points", () => {
    const rows = [
      { projectId: "p1", month: "2023-01", count: 5 },
      { projectId: "p1", month: "2024-01", count: 30 },
      { projectId: "p1", month: "2024-07", count: 10 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.busiestYear).toEqual({ year: "2024", count: 40 });
    expect(s.total).toBe(s.points.reduce((a, p) => a + p.count, 0));
    expect(s.total).toBe(45);
  });

  it("excludes unselected projects", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 5 },
      { projectId: "p2", month: "2024-01", count: 7 },
    ];
    const s = summarizeActivityTimeline(rows, new Set(["p1"]));
    expect(s.total).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts"`
Expected: FAIL — cannot resolve `../timelineCounts` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/(dashboard)/access-analysis/timelineCounts.ts`:

```ts
/**
 * Pure aggregation for the Activity timeline. Each input row is a (project,
 * month) activity count. The client passes the full row set plus the shared
 * project-picker selection; this filters to the selected projects, sums per
 * calendar month, and emits a CONTINUOUS, zero-filled month axis from the
 * earliest to the latest month in scope (so quiet months show as dips to zero).
 * No React/DOM/IO.
 */
export interface ActivityTimelineRow {
  projectId: string; // "" = account-level (admin) activity
  projectName: string;
  month: string; // "YYYY-MM" (UTC calendar month)
  count: number;
}

export interface TimelinePoint {
  month: string; // "YYYY-MM"
  label: string; // e.g. "Mar 2024"
  count: number;
}

export interface TimelineSummary {
  points: TimelinePoint[]; // continuous, zero-filled, ascending by month
  total: number;
  peak: TimelinePoint | null; // busiest month (ties -> earliest)
  busiestYear: { year: string; count: number } | null;
  span: { from: string; to: string } | null; // first/last month of the axis
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "YYYY-MM" -> absolute month index (year*12 + month0). Pure integer math, no Date. */
function monthIndex(m: string): number {
  const [y, mo] = m.split("-");
  return Number(y) * 12 + (Number(mo) - 1);
}

/** absolute month index -> "YYYY-MM". */
function indexToMonth(i: number): string {
  const y = Math.floor(i / 12);
  const mo = i % 12;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> "Mon YYYY". */
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
}

export function summarizeActivityTimeline(
  rows: ReadonlyArray<{ projectId: string; month: string; count: number }>,
  selected: ReadonlySet<string>,
): TimelineSummary {
  // 1. Filter to selected projects, sum per month.
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (!selected.has(r.projectId)) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.count);
  }
  if (byMonth.size === 0) {
    return { points: [], total: 0, peak: null, busiestYear: null, span: null };
  }

  // 2. Continuous axis bounds.
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of byMonth.keys()) {
    const i = monthIndex(m);
    if (i < lo) lo = i;
    if (i > hi) hi = i;
  }

  // 3. Zero-fill + aggregate in one ascending pass.
  const points: TimelinePoint[] = [];
  let total = 0;
  let peak: TimelinePoint | null = null;
  const yearTotals = new Map<string, number>();
  for (let i = lo; i <= hi; i++) {
    const month = indexToMonth(i);
    const count = byMonth.get(month) ?? 0;
    const point: TimelinePoint = { month, label: monthLabel(month), count };
    points.push(point);
    total += count;
    if (!peak || count > peak.count) peak = point; // strict > => ties keep the earliest
    const year = month.slice(0, 4);
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + count);
  }

  // 4. Busiest year.
  let busiestYear: { year: string; count: number } | null = null;
  for (const [year, count] of yearTotals) {
    if (!busiestYear || count > busiestYear.count) busiestYear = { year, count };
  }

  return {
    points,
    total,
    peak,
    busiestYear,
    span: { from: points[0].month, to: points[points.length - 1].month },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/timelineCounts.ts" "app/(dashboard)/access-analysis/__tests__/timelineCounts.test.ts"
git commit -m "feat(access-analysis): pure activity-timeline summarizer (zero-fill + headline)"
```

---

## Task 2: Server loader (`activityTimelineView.ts`)

**Files:**
- Create: `lib/server/activityTimelineView.ts`

This is an untested server view (matching `moduleActivityView.ts` / `activityByActorView.ts` — no unit test; verified via typecheck and, later, the route test). Model the SQL on the day-bucketed `getCoverageMatrix` query in `server/routers/acc-activity.ts:202`.

- [ ] **Step 1: Write the loader**

Create `lib/server/activityTimelineView.ts`:

```ts
import "server-only";
import { db } from "@/server/db";
import type { ActivityTimelineRow } from "@/app/(dashboard)/access-analysis/timelineCounts";

/** Label for the synthetic project that holds account-level (admin) activity. */
const ACCOUNT_LEVEL = "Account-level";

let cache: { at: number; rows: ActivityTimelineRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

interface RawRow {
  projectId: string;
  month: string;
  count: number;
}

/**
 * Per-(project, month) activity counts for the Activity timeline. One grouped
 * raw query buckets ~1M AccActivity rows by UTC calendar month (date_trunc),
 * collapsing to a few thousand compact rows the client re-buckets + zero-fills
 * (the same ship-and-rebucket shape as the donut views). Modeled on the
 * day-bucketed getCoverageMatrix query in server/routers/acc-activity.ts.
 *
 * Scope is ALL recorded activity (this is volume, not attributed users): rows
 * with a null userEmail are still counted; admin rows (null/empty projectId)
 * fold into an "Account-level" project — selectable in the picker like any other.
 */
export async function loadActivityTimeline(force = false): Promise<ActivityTimelineRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      SELECT
        COALESCE(NULLIF(a."projectId", ''), '') AS "projectId",
        to_char(date_trunc('month', a."createdAt"), 'YYYY-MM') AS month,
        COUNT(*)::int AS count
      FROM "AccActivity" a
      GROUP BY 1, 2
    `,
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ActivityTimelineRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : nameById.get(projectId) ?? projectId;
    return { projectId, projectName, month: p.month, count: p.count };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `activityTimelineView.ts` or `timelineCounts.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/server/activityTimelineView.ts
git commit -m "feat(access-analysis): activity-timeline loader (month-bucketed raw query)"
```

---

## Task 3: Chart component (`ActivityTimelineChart.tsx`)

**Files:**
- Create: `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const data = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-points={data.length} />;
  },
}));

import { ActivityTimelineChart } from "../components/ActivityTimelineChart";
import type { TimelineSummary } from "../timelineCounts";

const summary: TimelineSummary = {
  points: [
    { month: "2024-01", label: "Jan 2024", count: 10 },
    { month: "2024-02", label: "Feb 2024", count: 0 },
    { month: "2024-03", label: "Mar 2024", count: 25 },
  ],
  total: 35,
  peak: { month: "2024-03", label: "Mar 2024", count: 25 },
  busiestYear: { year: "2024", count: 35 },
  span: { from: "2024-01", to: "2024-03" },
};

const empty: TimelineSummary = { points: [], total: 0, peak: null, busiestYear: null, span: null };

describe("ActivityTimelineChart", () => {
  it("shows an empty state when there are no points", () => {
    const { queryByTestId, getByText } = render(<ActivityTimelineChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no activity/i)).toBeTruthy();
  });

  it("renders the headline and one data point per month", () => {
    const { getByTestId } = render(<ActivityTimelineChart summary={summary} />);
    expect(getByTestId("echart").getAttribute("data-points")).toBe("3");
    const headline = getByTestId("timeline-headline");
    expect(headline.textContent).toContain("35");
    expect(headline.textContent).toContain("Mar 2024");
    expect(headline.textContent).toContain("2024");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx"`
Expected: FAIL — cannot resolve `../components/ActivityTimelineChart`.

- [ ] **Step 3: Write the implementation**

Create `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx`:

```tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import type { TimelineSummary } from "../timelineCounts";

const ACCENT = "#38bdf8"; // sky — same accent as the Model-Coordination module

export function ActivityTimelineChart({ summary }: { summary: TimelineSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const { points, total, peak, busiestYear } = summary;

  // YoY delta per month = count(this month) - count(same month, prior year).
  const deltaByMonth = useMemo(() => {
    const at = new Map(points.map((p) => [p.month, p.count]));
    const d = new Map<string, number | null>();
    for (const p of points) {
      const [y, mo] = p.month.split("-");
      const prior = `${Number(y) - 1}-${mo}`;
      d.set(p.month, at.has(prior) ? p.count - (at.get(prior) ?? 0) : null);
    }
    return d;
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 14l4-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No activity found.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const cAxis = dark ? "#a1a1aa" : "#6b7280";
  const cSplit = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cTitle = dark ? "#fafafa" : "#111827";

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 16, bottom: 64, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: cTipBg,
      borderColor: cTipBorder,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: (params: unknown) => {
        const arr = params as Array<{ dataIndex: number }>;
        const p = points[arr[0]?.dataIndex ?? 0];
        if (!p) return "";
        const delta = deltaByMonth.get(p.month);
        const priorYear = Number(p.month.slice(0, 4)) - 1;
        const deltaLine =
          delta == null
            ? `<div style="color:${cAxis}">no ${priorYear} to compare</div>`
            : `<div style="color:${cAxis}">${delta >= 0 ? "▲ +" : "▼ −"}${Math.abs(delta).toLocaleString()} vs ${priorYear}</div>`;
        return (
          `<div style="font-weight:700;color:${cTitle};margin-bottom:2px">${p.label}</div>` +
          `<div style="color:${cTipText}">${p.count.toLocaleString()} activities</div>` +
          deltaLine
        );
      },
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      boundaryGap: false,
      axisLabel: { color: cAxis, hideOverlap: true },
      axisLine: { lineStyle: { color: cSplit } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: cAxis },
      splitLine: { lineStyle: { color: cSplit } },
    },
    dataZoom: [
      { type: "inside" },
      {
        type: "slider",
        height: 16,
        bottom: 18,
        borderColor: "transparent",
        backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        fillerColor: dark ? "rgba(56,189,248,0.18)" : "rgba(56,189,248,0.22)",
        handleStyle: { color: ACCENT },
        textStyle: { color: cAxis },
      },
    ],
    series: [
      {
        name: "Activity",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.count),
        lineStyle: { color: ACCENT, width: 2.5 },
        itemStyle: { color: ACCENT },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${ACCENT}66` },
              { offset: 1, color: `${ACCENT}00` },
            ],
          },
        },
        markPoint: peak
          ? {
              symbol: "pin",
              symbolSize: 46,
              itemStyle: { color: ACCENT },
              label: { color: "#06121b", fontSize: 10, fontWeight: 700, formatter: () => "peak" },
              data: [{ coord: [peak.label, peak.count], value: peak.count }],
            }
          : undefined,
        animationDuration: 700,
        animationEasing: "cubicOut",
      },
    ],
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <div data-testid="timeline-headline" className="mb-2 text-sm text-muted-foreground">
        <b className="text-foreground">{total.toLocaleString()}</b> activities
        {peak ? <> · busiest month <b className="text-foreground">{peak.label}</b></> : null}
        {busiestYear ? <> · busiest year <b className="text-foreground">{busiestYear.year}</b></> : null}
      </div>
      <EChart option={option} height={360} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx" "app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx"
git commit -m "feat(access-analysis): activity-timeline area chart (zoom, peak, YoY tooltip)"
```

---

## Task 4: Wire into the page

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
- Modify: `app/(dashboard)/access-analysis/page.tsx`
- Modify: `app/(dashboard)/access-analysis/page.test.tsx`

- [ ] **Step 1: Add the mock to the route test (failing first)**

In `app/(dashboard)/access-analysis/page.test.tsx`, add this mock block right after the existing `loadActivityByActor` mock (after line 30, the block that mocks `@/lib/server/activityByActorView`):

```ts
// Empty timeline -> the Activity-over-time section renders its empty state
// (no echart), so the singular getByTestId("echart") still resolves the roles donut.
vi.mock("@/lib/server/activityTimelineView", () => ({
  loadActivityTimeline: vi.fn(async () => []),
}));
```

- [ ] **Step 2: Run the route test to confirm it still targets one chart (and will break without wiring)**

Run: `npx vitest run "app/(dashboard)/access-analysis/page.test.tsx"`
Expected: PASS for now (the mock is inert until `page.tsx` imports the loader). This step seeds the mock so it is in place before Step 3 wires the real loader. Proceed regardless of pass/fail.

- [ ] **Step 3: Accept the prop and render the section in `AccessAnalysisCharts.tsx`**

Add these imports next to the existing summarizer/component imports (near lines 10-12):

```tsx
import { summarizeActivityTimeline, type ActivityTimelineRow } from "../timelineCounts";
import { ActivityTimelineChart } from "./ActivityTimelineChart";
```

Add the prop to the destructured params (alongside `moduleRows`, e.g. right after `roleRows,`):

```tsx
  timelineRows,
```

Add it to the props type (after the `roleRows: ProjectRoleRow[];` line):

```tsx
  /** Per-(project, month) activity totals for the Activity timeline. When omitted, that section is hidden. */
  timelineRows?: ActivityTimelineRow[];
```

Add the memo next to the other `useMemo` summaries (after the `roleSummary` memo, ~line 93):

```tsx
  const timelineSummary = useMemo(
    () => summarizeActivityTimeline(timelineRows ?? [], selected),
    [timelineRows, selected],
  );
```

Render the section as the FIRST chart panel — insert it immediately after the closing `</ProjectPicker>` tag's `/>` (after the `<ProjectPicker ... />` block, ~line 119) and BEFORE the `terrainProjects && ...` block:

```tsx
      {timelineRows ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity over time"
            subtitle="Total ACC activity per month across all years. Tick projects above to refocus the line; quiet months dip to zero."
          />
          <ActivityTimelineChart summary={timelineSummary} />
        </section>
      ) : null}
```

- [ ] **Step 4: Load the rows in `page.tsx` and pass them down**

Add the import after the other `lib/server` view imports (after line 6, the `folderPermissionTerrainView` import):

```tsx
import { loadActivityTimeline } from "@/lib/server/activityTimelineView";
```

Add `loadActivityTimeline()` to the `Promise.all` and capture it. Change the destructuring + array (lines 17-24) to:

```tsx
  const [view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timelineRows] = await Promise.all([
    loadInstanceView(),
    loadModuleActivity(),
    loadActivityByActor(),
    loadCoordinationByProject(),
    loadProjectCoverage(),
    loadTerrainProjects(),
    loadActivityTimeline(),
  ]);
```

Pass the prop to `<AccessAnalysisCharts>` (add a line inside the JSX props, e.g. right after `moduleRows={moduleRows}`):

```tsx
          timelineRows={timelineRows}
```

- [ ] **Step 5: Run the affected unit tests**

Run: `npx vitest run "app/(dashboard)/access-analysis/page.test.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"`
Expected: PASS. `AccessAnalysisCharts.test.tsx` does not pass `timelineRows`, so its section stays hidden and its assertions are unchanged. `page.test.tsx` renders the timeline section with empty rows → empty state (no `echart`), so the singular `getByTestId("echart")` still resolves the roles donut.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/page.tsx" "app/(dashboard)/access-analysis/page.test.tsx"
git commit -m "feat(access-analysis): wire Activity-over-time timeline as the first panel"
```

---

## Task 5: Full suite + lint gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS (existing total + 10 new tests; 0 failures).

- [ ] **Step 2: Lint the new/changed files**

Run: `npx eslint "app/(dashboard)/access-analysis/timelineCounts.ts" "app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx" "lib/server/activityTimelineView.ts" "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Final typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

> **Visual UAT (owner, deferred):** This page is served from a production build on `:3000` (see deploy mechanism — `npm run build` then restart, not a dev server). A visual check of the live timeline (theme, zoom slider, peak marker, tooltip) is an owner step after a rebuild; it is not part of this plan's automated gates.

---

## Self-review

**Spec coverage:**
- Line/area chart, total activity per month → Task 3 (series + areaStyle). ✓
- Ties to picker → Task 4 (`summarizeActivityTimeline(timelineRows, selected)`). ✓
- Continuous zero-fill → Task 1 (zero-fill loop) + test. ✓
- Account-level bucket via empty projectId, picker-selectable → Task 2 (`COALESCE(NULLIF(...),'')` + `ACCOUNT_LEVEL` label); already a picker option via the module donut's rows (no picker change). ✓
- Zoom slider, peak marker, YoY tooltip, headline → Task 3. ✓
- Placed first, after the picker → Task 4 (Step 3 insertion point). ✓
- Testing (summarizer + chart + route mock) → Tasks 1, 3, 4. ✓
- All UTC month bucketing → Task 2 (`date_trunc('month', ...)`, `to_char 'YYYY-MM'`). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `ActivityTimelineRow` (defined in `timelineCounts.ts`) is imported by `activityTimelineView.ts` and `AccessAnalysisCharts.tsx`. `TimelineSummary`/`TimelinePoint` defined in Task 1 are consumed identically in Task 3's component + test. `summarizeActivityTimeline(rows, selected)` signature matches every call site (Task 1 tests, Task 4 memo). `loadActivityTimeline` name matches across loader, page import, and route-test mock. ✓
