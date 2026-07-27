---
phase: 21-issue-funnel-status-time
plan: 03
subsystem: ui
tags: [echarts, react, next-themes, vitest, jsdom]

requires:
  - phase: 21-issue-funnel-status-time (plan 21-01)
    provides: "lib/server/issueFunnelView.ts loadIssueFunnel() — monthRows/statusRows aggregates"
  - phase: 21-issue-funnel-status-time (plan 21-02)
    provides: "app/(dashboard)/access-analysis/issueFunnelCounts.ts — summarizeIssueStatus, deriveIssueCoverageCaption, ISSUE_STATUSES"
provides:
  - "IssueTimelineChart.tsx — monthly area line chart (ISSUE-02), amber accent, zoom brush + peak pin, no YoY"
  - "IssueStatusChart.tsx — 8-status donut with local drill (ISSUE-03)"
  - "12 new Vitest component tests (5 + 7) covering headline/caption/empty-state/no-YoY/drill/overflow-bucket"
affects: [21-04-issue-funnel-wiring]

tech-stack:
  added: []
  patterns:
    - "IssueTimelineChart clones ActivityTimelineChart's EChart/dataZoom/markPoint pattern minus YoY/floor-caption, plus a live coverage caption"
    - "IssueStatusChart clones IssueFetchCoverageDonut's local-drill-state donut pattern (never the RolesPieChart onSliceClick/sliceFilters bus)"

key-files:
  created:
    - "app/(dashboard)/access-analysis/components/IssueTimelineChart.tsx"
    - "app/(dashboard)/access-analysis/components/IssueStatusChart.tsx"
    - "app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx"
    - "app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx"
  modified: []

key-decisions:
  - "IssueTimelineChart accent is amber (#f59e0b), distinct from ActivityTimelineChart's sky (#38bdf8), so the two timelines aren't confused across tabs"
  - "IssueStatusChart status color map: closed/completed read green/emerald ('settled'), open/in_progress/in_review/pending/not_approved read warm/blue/violet ('active'), draft reads neutral zinc, overflow reads fuchsia (#e879f9) — distinct from both the timeline accent and IssueFetchCoverageDonut's bucket palette"
  - "Both components built UNMOUNTED per CONTEXT.md's locked decision — plan 21-04 wires them into ProjectsTabPanel.tsx"

patterns-established: []

requirements-completed: [ISSUE-02, ISSUE-03]

duration: 20min
completed: 2026-07-06
---

# Phase 21 Plan 03: Issue Funnel Chart Components Summary

**Two unmounted presentational charts for the Projects tab — a monthly issue-creation area line (amber accent, zoom+peak pin, no YoY) and an 8-status donut with local per-status drill — both driven by live `deriveIssueCoverageCaption` numbers instead of any hardcoded coverage figure.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-06T15:00:00Z (approx, continuation of same session as 21-02)
- **Completed:** 2026-07-06T15:04:00Z
- **Tasks:** 2/2
- **Files modified:** 4 (all new)

## Accomplishments
- `IssueTimelineChart` — structural adaptation of `ActivityTimelineChart.tsx`: kept the EChart smooth area-line/gradient fill, `dataZoom` (inside+slider) zoom brush, `markPoint` peak pin, and axis/tooltip styling; removed the `deltaByMonth`/YoY tooltip line and the `dataFloor`/`floorByProject` props+caption entirely (locked decision — issue history is shorter/spikier, YoY would compare against sparse early months); added a live `deriveIssueCoverageCaption` subtitle and a coverage-aware empty state distinguishing "unavailable" vs "genuinely zero."
- `IssueStatusChart` — structural adaptation of `IssueFetchCoverageDonut.tsx`: local `useState`/`toggleDrill` drill (no `onSliceClick`/`activeSlice`/`sliceFilters` — verified absent via grep), ranked clickable legend with all 8 `ISSUE_STATUSES` always present (zeros kept) plus an appended overflow row for any unexpected status string, per-status project drill list (pre-resolved project names, never a raw GUID), same live coverage caption convention as the timeline chart.
- 12 new Vitest jsdom component tests (5 timeline + 7 status), all green; `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: IssueTimelineChart (monthly area line, no YoY) + test** - `fc9a008c` (feat)
2. **Task 2: IssueStatusChart (8-status donut, local drill) + test** - `23191885` (feat)

_No plan-metadata commit deviation — this SUMMARY + STATE/ROADMAP updates are committed as the standard final docs commit._

## Files Created/Modified
- `app/(dashboard)/access-analysis/components/IssueTimelineChart.tsx` - Monthly issue-creation area line, amber accent, zoom+peak, live coverage caption, honest empty state (153 lines)
- `app/(dashboard)/access-analysis/components/IssueStatusChart.tsx` - 8-status donut, local drill, fixed semantic color map + overflow bucket, live coverage caption, honest empty state (261 lines)
- `app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx` - 5 Vitest cases (headline, caption, both empty-state branches, no-YoY regression pin)
- `app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx` - 7 Vitest cases (legend order/zeros, drill open/close, overflow bucket, caption, both empty-state branches, no-prop-contract check)

## Verification Evidence
- **Commands run:** `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx"` -> 5 passed. `npx vitest run "app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx"` -> 7 passed. Combined run of both files -> 12 passed.
- **Type/build gate:** `npx tsc --noEmit` -> exit 0, no output.
- **Targeted checks:** `grep -n "onSliceClick\|activeSlice\|sliceFilters" app/(dashboard)/access-analysis/components/IssueStatusChart.tsx` -> no matches (grep exit 1), confirming the locked no-cross-filter-bus decision.
- **Repo-map check:** not needed — no import/data-flow/boundary changes; both components are new, self-contained, unmounted leaf files consuming only existing exports (`issueFunnelCounts.ts`, `issueFetchCoverageCounts.ts`, `timelineCounts.ts`, `@/components/ui/EChart`, `next-themes`).
- **Staged-file proof (per task):** `git diff --cached --name-only` before each commit showed exactly the 2 files for that task — no stray staging from the branch's heavy uncommitted WIP.

## Dashboard Evidence
- **Workshop surface:** `/access-analysis` (both components target the Projects tab per `21-CONTEXT.md`; mounting happens in plan 21-04).
- **Workshop impact:** once mounted, the presenter can show the full issue picture — volume over time and current status mix — directly beneath the existing `IssueFetchCoverageDonut`, with the same trust-precedes-metric framing. Not yet visible on the page (unmounted by design this plan).
- **UI guardrails:** zinc dark theme via `useTheme`/`resolvedTheme` dark branching (matches sibling charts); ECharts colors are theme-resolved hex constants, not tokens-via-inline-CSS-vars, consistent with the existing `ActivityTimelineChart`/`IssueFetchCoverageDonut` convention; honest empty states with the unavailable-vs-genuinely-zero distinction; no new WebGL; restrained motion (existing EChart animation durations, ≤800ms initial mount, matching the donut precedent — no new custom transitions added).
- **Scope guardrails:** `/users/spatial-graph` untouched; no changes to `mainCharts.tsx`, `AccessAnalysisCharts.tsx`, or `ProjectsTabPanel.tsx` (reserved for plan 21-04 per the plan's explicit boundary).

## Data Truthfulness
- **Data sources:** `IssueTimelineChart` consumes a `TimelineSummary` (shape from `lib/acc/timelineCounts.ts`, computed by the future shell via `summarizeActivityTimeline` over `monthRows`) plus selection-filtered `IssueCoverageInputRow[]`. `IssueStatusChart` consumes selection-filtered `IssueStatusInputRow[]` (summarized internally via `summarizeIssueStatus`) plus the same coverage rows. Both are Wave-1 (21-01/21-02) exports, unmodified this plan.
- **Coverage limits:** both charts render a live "Issue data covers N of M fetched projects — X forbidden/error" caption computed by `deriveIssueCoverageCaption` — zero hardcoded coverage figures anywhere in either component.
- **No fake data:** no invented fixtures, routes, env vars, or data authority; test fixtures are local literal arrays matching the verified `IssueStatusInputRow`/`IssueCoverageInputRow`/`TimelineSummary` shapes.

## Decisions Made
- Amber (`#f59e0b`) accent for `IssueTimelineChart` vs the existing timeline's sky (`#38bdf8`) — avoids visual confusion between the two timeline charts once both are visible on `/access-analysis`.
- `IssueStatusChart` status color assignment: closed=`#10b981` (green), completed=`#34d399` (emerald) read "settled"; open=`#38bdf8` (sky), in_progress=`#f59e0b` (amber), in_review=`#a78bfa` (violet), pending=`#fbbf24` (yellow), not_approved=`#fb7185` (rose) read "active"; draft=`#71717a` (zinc) reads neutral/not-yet-active; overflow=`#e879f9` (fuchsia) for any unexpected status string — all Claude's discretion per the plan, matching the "semantic honesty" instruction.
- Reused the wording template `"Issue data covers {fetched} of {total} fetched projects{unavailable}"` verbatim across both components (small local helper duplicated per-file, not extracted to a new shared UI module — per the plan's explicit "don't invent a new shared module for two call sites" instruction).

## Deviations from Plan

None - plan executed exactly as written. Both components match the locked prop contracts (`{ summary, coverageProjects }` / `{ rows, coverageProjects }`) verbatim from the plan's `<interfaces>` block; test case counts meet or exceed the plan's specified minimums (5/5 and 7/6 — one additional light regression-style case added to IssueStatusChart, not required but harmless).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (zinc theme, resolved ECharts colors, honest coverage labels, no new WebGL, `/users/spatial-graph` untouched)
- [x] Data coverage is truthful and labeled (live caption via `deriveIssueCoverageCaption`, no hardcoded figures)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked
- [x] Claims backed by command output (vitest/tsc/grep runs above) or marked `VERIFY:` (none needed this plan)

## Next Phase Readiness
- Both components are ready to be mounted by plan 21-04 into `ProjectsTabPanel.tsx`, directly below `IssueFetchCoverageDonut`, consuming `loadIssueFunnel()`'s `monthRows`/`statusRows` (21-01) filtered by the existing `filterRowsBySelection` picker pattern.
- No blockers. `mainCharts.tsx`'s `Promise.all` fan-out and `ProjectsTabPanel.tsx`/`AccessAnalysisCharts.tsx` remain untouched, ready for 21-04's wiring task.

---
*Phase: 21-issue-funnel-status-time*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 4 created files and both task commit hashes (`fc9a008c`, `23191885`) verified present via `[ -f ... ]` and `git log --oneline --all | grep`.
