---
phase: 11-data-truthfulness-labels
plan: "03"
subsystem: access-analysis / activity-timeline
tags: [truth-labels, data-floor, timeline, vitest, tdd]
dependency_graph:
  requires: []
  provides: [dataFloor, floorByProject, buildFloors, timeline-data-floor-caption, timeline-floor-tooltip]
  affects: [lib/server/activityTimelineView.ts, app/(dashboard)/access-analysis/mainCharts.tsx, app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx, app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx]
tech_stack:
  added: []
  patterns: [TDD RED/GREEN, pure transform export, optional prop threading, fmtFloor helper]
key_files:
  created:
    - lib/server/__tests__/activityTimelineView.test.ts
  modified:
    - lib/server/activityTimelineView.ts
    - app/(dashboard)/access-analysis/mainCharts.tsx
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
    - app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx
    - app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx
    - app/(dashboard)/access-analysis/page.test.tsx
decisions:
  - "buildFloors is a pure exported function for unit-testability; DB logic stays in loadActivityTimeline"
  - "dataFloor/floorByProject passed as optional props through AccessAnalysisCharts so the section gracefully hides when omitted"
  - "Account-wide dataFloor used in tooltip (not per-project) because the timeline aggregates all selected projects; per-project surface deferred"
  - "Floor query is a small separate SQL in the Promise.all (not folded into the complex timeline CTE) for maintainability"
metrics:
  duration: "6 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  files_changed: 6
status: complete
---

# Phase 11 Plan 03: TRUTH-02 dataFloor Timeline Label Summary

One-liner: Added live account-wide ACCDS `MIN(createdAt)` floor as "Data available from [Mon YYYY]" caption + tooltip line on the Activity-over-time timeline, threaded through a TDD-pinned `buildFloors` pure function.

## What Was Built

**TRUTH-02** surfaces the ACCDS ~12-month history limit honestly on `/access-analysis`:

1. **`buildFloors` (pure, exported)** — given raw `(projectId, floorMonth)` pairs, returns `{ dataFloor: string | null, floorByProject: Record<string,string> }`. Account-wide `dataFloor` is the earliest `YYYY-MM` across all projects.

2. **`loadActivityTimeline`** — return type changed from `ActivityTimelineRow[]` to `ActivityTimelineResult { rows, dataFloor, floorByProject }`. A small parallel floor query (`SELECT "projectId", to_char(date_trunc('month', MIN("createdAt")), 'YYYY-MM') FROM "AccActivityAccds" GROUP BY "projectId"`) runs in the existing `Promise.all`. Cache shape updated. 5-minute TTL preserved.

3. **`mainCharts.tsx`** — destructures `timeline` object; passes `timeline.rows`, `timeline.dataFloor`, `timeline.floorByProject` to `<AccessAnalysisCharts />`.

4. **`AccessAnalysisCharts.tsx`** — accepts `dataFloor?` / `floorByProject?` as optional props and threads them to `<ActivityTimelineChart />`.

5. **`ActivityTimelineChart.tsx`** — accepts the new optional props:
   - Renders `<p data-testid="timeline-data-floor" class="mt-2 text-[10px] text-muted-foreground">Data available from {Mon YYYY}</p>` below the chart when `dataFloor` is present. Hidden in empty state.
   - Adds a muted `"Data from {Mon YYYY}"` line at the bottom of the axis tooltip formatter using `cAxis` resolved color. No day component — month-year only.
   - Local `fmtFloor("YYYY-MM")` helper converts to "Mon YYYY".

6. **`page.test.tsx`** — mock updated from `vi.fn(async () => [])` to `vi.fn(async () => ({ rows: [], dataFloor: null, floorByProject: {} }))`.

## Verification Evidence

### `npx tsc --noEmit`
```
(no output — clean)
```

### Vitest (13/13 pass)
```
Test Files  3 passed (3)
     Tests  13 passed (13)
  Duration  2.79s
```

Files tested:
- `lib/server/__tests__/activityTimelineView.test.ts` — 6 tests (pure `buildFloors`)
- `app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx` — 5 tests (3 existing + 2 new floor caption cases)
- `app/(dashboard)/access-analysis/page.test.tsx` — 2 tests (mock shape)

### `rg "loadActivityTimeline"` callers
```
lib\server\activityTimelineView.ts    — export definition
app\(dashboard)\access-analysis\mainCharts.tsx — runtime caller (updated)
app\(dashboard)\access-analysis\page.test.tsx  — mock (updated)
```
No unhandled callers.

### Hard-coded month check
No literal year strings (`2025`, `Jun 2025`) found in `ActivityTimelineChart.tsx`. `dataFloor` is live-derived from `MIN(createdAt)` in Postgres.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (TDD GREEN) | e042f1a2 | `buildFloors` + `ActivityTimelineResult` return type; 6 Vitest tests |
| 2 (callers) | 926c57dc | `mainCharts.tsx` + `page.test.tsx` mock + `AccessAnalysisCharts` interface |
| 3 (render) | c350377c | Caption + tooltip + chart test extended |

## Deviations from Plan

### Deviation 1: Task 2/3 interface split
**Rule 3 — blocking issue.** Task 2 was specified to pass `dataFloor`/`floorByProject` props to `AccessAnalysisCharts` in the same commit that also had `tsc --noEmit` as its gate. Since `ActivityTimelineChart` didn't accept those props yet (Task 3's work), passing them in Task 2's JSX would fail tsc. Resolution: Task 2 added the `dataFloor`/`floorByProject` props to `AccessAnalysisCharts`'s interface (but did NOT yet thread to `ActivityTimelineChart`); Task 3 completed the thread + rendering. Both tasks passed tsc cleanly. Net effect: identical to the plan, just split across tasks.

### Deviation 2: Floor query as separate SQL
**Claude discretion.** The plan offered "second small grouped select reusing astart" as an option. Rather than modify the complex CTE to emit discriminated rows, a small parallel `SELECT "projectId", to_char(date_trunc('month', MIN("createdAt")), 'YYYY-MM')` runs in the `Promise.all` alongside the timeline query. This is more maintainable and the DB runs it in parallel.

### Deviation 3: floorByProject in tooltip uses account-wide floor
**Claude discretion (plan authorized it).** The axis tooltip spans all selected projects; showing the account-wide `dataFloor` is the plan's authorized fallback. The `floorByProject` prop is accepted and reserved for future per-project tooltip granularity.

## Data Truthfulness Notes

- `dataFloor` is always live-derived from `MIN(createdAt)` over `AccActivityAccds`. No hard-coded dates.
- Month-year format (`"Mon YYYY"`) avoids implying false daily precision for the ACCDS ~12-month floor.
- The caption is hidden in the empty state (no projects selected).
- The `floorByProject` map is available for future use (e.g., per-project drill tooltip).

## Known Stubs

None. The floor values flow from live Postgres to the UI with no placeholder data.

## Workshop Impact

On `/access-analysis`, the "Activity over time" panel now shows "Data available from [Mon YYYY]" in muted `text-[10px] text-muted-foreground` zinc text below the chart, and the hover tooltip carries the same floor note. Visual UAT (rebuild on :3000) is deferred to end-of-phase per `human_verify_mode: end-of-phase`.

## Threat Flags

None. `dataFloor`/`floorByProject` are server-derived `YYYY-MM` strings (no user input). The tooltip formatter interpolates only the formatted month — consistent with the existing safe formatter pattern (T-11-05 mitigated).

## Dashboard Self-Check

- **Context:** 11-03-PLAN.md, 11-CONTEXT.md, STATE.md, activityTimelineView.ts (astart CTE), mainCharts.tsx, AccessAnalysisCharts.tsx, ActivityTimelineChart.tsx, page.test.tsx, ActivityTimelineChart.test.tsx — all read.
- **Evidence:** `astart` MIN(createdAt) at activityTimelineView.ts lines 76-80; sole runtime caller = mainCharts.tsx (confirmed via `rg`); page.test.tsx mock at line 35; chart uses `useTheme` + `cAxis`/`cTitle`.
- **Constraints applied:** zinc theme (`text-muted-foreground`, `text-[10px]`); no hardcoded colors; `cAxis` resolved color in tooltip; month-year only (no false daily precision); ≤200ms (no new animation); no new WebGL; `/users/spatial-graph` untouched; DB access stays in `lib/server`.
- **Gates run:** `npx vitest run` (3 files, 13 tests PASS) + `npx tsc --noEmit` (CLEAN). Rebuild deferred (end-of-phase, per config).
- **VERIFY remaining:** Visual/light+dark check on `/access-analysis` at rebuild; confirm floor label is legible on projector (zinc-600 muted color).

## Self-Check: PASSED

All claimed files exist. All 3 commits exist in `git log`. 13 tests pass. tsc clean. No unhandled callers. No hard-coded month strings.
