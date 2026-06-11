# Activity timeline — design

**Date:** 2026-06-11
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/access-analysis`

## Goal

Add an **Activity timeline** to the Access Analysis page: a continuous month-by-month
line/area chart of total ACC activity volume across all years. It answers: *how has
activity density risen and fallen over time?* — the temporal view the page currently
lacks (every existing panel is a point-in-time snapshot).

It sits alongside the existing panels:

- **Folder permission terrain** — folder × role permission structure (now).
- **Role distribution / Activity by role / Activity by module** — who, how much, where (now).
- **Activity timeline** — *when* (new).

## Confirmed product decisions

- **Chart form = line/area timeline.** One continuous line, height = activity that
  month, area gradient fill. (Heatmap and stacked-bar forms were considered and
  declined.)
- **Y axis = total activity count** (raw number of `AccActivity` rows in the bucket).
  Same unit as the module donut.
- **Ties to the project picker.** Ticking/unticking projects at the top refocuses
  the line to just those projects' activity, exactly like the donuts. The
  `"Account-level"` admin bucket is already a selectable option in that picker, so
  account-level activity is in or out of scope by the same control.
- **Continuous, zero-filled X axis.** Every month from the earliest activity to the
  latest is plotted in order; a month with no activity in the current scope dips to
  zero. Quiet stretches are visible — this is the truest "density over time".
- **Interactive + information-dense** (consistent with the other panels): a zoom
  slider for the long axis, a rich hover tooltip (month · exact count · Δ vs. same
  month last year), and a marker on the peak month, plus a one-line headline.
- **Placement: first**, immediately after the project picker — a timeline is the
  natural "orient me" overview before the per-project detail panels.

## Data model & scope

`AccActivity.createdAt` is a real `DateTime` (the activity timestamp) with a
`[projectId, createdAt]` index. Timestamps from Autodesk are UTC; month buckets are
computed in UTC (`date_trunc('month', "createdAt")`), so a bucket is a calendar
month UTC.

**Scope = all recorded activity**, partitioned by project so the picker can refocus
it. Empty-string `projectId` rows (admin / account-level activity) fold into the
same `"Account-level"` bucket the donuts use — selectable in the picker like any
project. Rows with a null `userEmail` are still counted (this is activity *volume*,
not attributed user counts), matching the module donut's framing rather than the
activity-by-role donut's.

Because the picker is client-side and must refocus instantly, the server ships
**per-(project, month) counts** and the client sums the selected projects — the same
ship-and-rebucket shape as every sibling panel. A re-query-per-selection design is
rejected (laggy); reusing the existing activity rows is impossible (they carry no
timestamp).

## Components & data flow

All four units mirror existing siblings; none introduces a new pattern.

### 1. `lib/server/activityTimelineView.ts` (new)

One cached `$queryRaw` (5-min TTL, like `moduleActivityView`), modeled directly on
the existing `getCoverageMatrix` query in `server/routers/acc-activity.ts` — swap
`date_trunc('day', …)` → `'month'` and drop the date window:

```sql
SELECT
  COALESCE(NULLIF(a."projectId", ''), '')           AS "projectId",   -- '' = account-level
  to_char(date_trunc('month', a."createdAt"), 'YYYY-MM') AS month,
  COUNT(*)::int                                       AS count
FROM "AccActivity" a
GROUP BY 1, 2
```

Project **names** are resolved in JS from a `db.accDcProject.findMany` (same as the
module loader), with the empty-`projectId` bucket labeled `"Account-level"` — keeping
the label logic identical to `moduleActivityView` rather than duplicating it in SQL.

```ts
interface ActivityTimelineRow {
  projectId: string;    // "" = account-level
  projectName: string;  // resolved; "" → "Account-level"
  month: string;        // "YYYY-MM" (UTC calendar month)
  count: number;
}
```

Expected size: distinct (project, month) pairs ≈ a few thousand rows (sparse), in
line with the ~2.8k rows the module donut ships. Performance parity with the module
donut: a single grouped scan over ~1M rows (~200 ms); the `[projectId, createdAt]`
index supports the bucketing.

### 2. `app/(dashboard)/access-analysis/timelineCounts.ts` (new, pure)

No React/DOM/IO — unit-tested in isolation.

```ts
interface TimelinePoint { month: string; label: string; count: number; }

interface TimelineSummary {
  points: TimelinePoint[];   // continuous, zero-filled, ascending by month
  total: number;             // sum of all points in scope
  peak: TimelinePoint | null;     // busiest month
  busiestYear: { year: string; count: number } | null;
  span: { from: string; to: string } | null; // first/last month with the axis
}

function summarizeActivityTimeline(
  rows: ReadonlyArray<{ projectId: string; month: string; count: number }>,
  selected: ReadonlySet<string>,
): TimelineSummary;
```

Algorithm:

1. Filter `rows` to `selected` projects, sum `count` per `month` into a map.
2. Find min/max month across the **filtered** set. If empty → return an empty
   summary (`points: []`, nulls) so the chart shows its empty state.
3. **Zero-fill**: walk calendar months from min to max inclusive, emitting a
   `TimelinePoint` for each (0 when the map has no entry). `label` is a human month
   (e.g. `"Mar 2024"`), computed by parsing `"YYYY-MM"` arithmetically (no `Date`
   timezone surprises).
4. Compute `total`, `peak` (max count; ties → earliest), and `busiestYear` (sum by
   `YYYY` prefix).

Month iteration is pure integer math on `year*12 + (month-1)` to avoid Date/TZ
pitfalls.

### 3. `components/ActivityTimelineChart.tsx` (new, client)

ECharts line/area, theme-aware via `useTheme` (reads `resolvedTheme`, mirrors
`ModulesPieChart`'s light/dark color tokens). Built from `TimelineSummary`:

- **Series**: smooth `line` with `areaStyle` gradient (the mockup-B look), single
  accent color.
- **X axis**: `category` over `points.map(p => p.label)`; auto-thinned tick labels so
  ~60 months don't crowd.
- **Zoom**: a `dataZoom` slider (and inside-scroll) so a period can be focused.
- **Tooltip**: `axis` trigger — month, `count.toLocaleString()` activities, and Δ vs.
  the same month one year earlier (±n, or "no prior year").
- **Peak marker**: `markPoint` on `peak`.
- **Headline line** above/below the card: `total` activities · busiest month
  (`peak.label`) · busiest year. Information-dense, like the donut subtitles.
- **Empty state**: matches the donuts — "No activity found · Select at least one
  project above."

### 4. Wiring

- **`page.tsx`**: add `loadActivityTimeline()` to the existing `Promise.all`; pass the
  rows to `AccessAnalysisCharts` as `timelineRows`.
- **`AccessAnalysisCharts.tsx`**: accept `timelineRows`; `useMemo` →
  `summarizeActivityTimeline(timelineRows, selected)` (note: this summarizer takes the
  full rows + the `selected` Set directly, since it filters internally — it does not
  use `filterRowsBySelection`). Render a new `<section>` titled **"Activity over
  time"** as the **first** chart section, immediately after `<ProjectPicker>` and
  before the terrain. The picker's project option list already unions role + module +
  coordination projects; account-level is present, so no picker change is needed.

## Testing

- `__tests__/timelineCounts.test.ts` (new): zero-fill across a gap (missing middle
  month → 0); single-month input (from == to, one point); empty selection → empty
  summary; sums across two selected projects in the same month; `peak` tie → earliest;
  `busiestYear` aggregation; `total` equals sum of points; `label` formatting.
- `__tests__/ActivityTimelineChart.test.tsx` (new): renders the headline + a chart for
  a non-empty summary; shows the empty state for an empty summary. Mirrors the other
  chart component tests (mock `EChart`).
- Update `AccessAnalysisCharts.test.tsx` / `page.test.tsx` only where they assert the
  panel set or props (add the new section; pass `timelineRows`).

## Out of scope (YAGNI)

- Granularity toggle (week / quarter / year) — month only, as requested.
- Per-project or per-module breakdown lines (the stacked-bar form was declined).
- Click-to-drill from a month into its activity.
- A persisted date-range filter (the page has none; the zoom slider is view-only).
- Any change to the existing panels.
