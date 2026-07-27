---
phase: 21-issue-funnel-status-time
plan: 02
subsystem: analytics
tags: [transforms, vitest, access-analysis, issue-funnel]

requires:
  - phase: 21-issue-funnel-status-time (plan 01)
    provides: "IssueFunnelStatusRow shape (server data layer) — structurally
      compatible with this plan's local IssueStatusInputRow, no import
      dependency by design (wave-1 parallelism)"
  - phase: 20-foundation-wins-engagement-panels (plan 03)
    provides: "IssueCoverageInputRow type + summarizeIssueCoverage fixed-bucket
      pattern this plan clones"
provides:
  - "summarizeIssueStatus: pure fixed-order-status + honest-overflow transform"
  - "deriveIssueCoverageCaption: shared fetched/total/unavailable caption math"
affects: [21-03-chart-components, 21-04-client-wiring]

tech-stack:
  added: []
  patterns:
    - "Fixed-bucket + honest-overflow transform pattern (cloned from
      issueFetchCoverageCounts.ts) applied to a second, larger fixed set
      (8 statuses vs 4 coverage buckets)"

key-files:
  created:
    - "app/(dashboard)/access-analysis/issueFunnelCounts.ts"
    - "app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts"
  modified: []

key-decisions:
  - "Used a local structural IssueStatusInputRow type (not an import from
    lib/server/issueFunnelView.ts) per the plan's wave-1 parallelism note —
    TypeScript structural typing makes IssueFunnelStatusRow[] assignable to it
    with zero cross-plan file dependency."
  - "Added a defensive mergeByProject step (sum counts when the same
    (projectId, status) appears in multiple input rows) before sorting drill
    rows, matching the plan's explicit defensive-merge instruction."

patterns-established:
  - "Second application of the fixed-bucket + honest-overflow pattern
    confirms it generalizes cleanly to larger fixed sets — future funnel-style
    breakdowns (e.g. ISSUE-04 issue-type) can clone the same shape."

requirements-completed: [ISSUE-03]

duration: 8min
completed: 2026-07-06
---

# Phase 21 Plan 02: Issue Funnel Status Transforms Summary

**Pure `summarizeIssueStatus`/`deriveIssueCoverageCaption` transforms cloning the
Phase 20 fixed-bucket + honest-overflow pattern over the 8 verified live
`AccIssue.status` values, plus 7 Vitest cases covering fixed order, overflow,
aggregation, drill sort, and empty input.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-06T14:54:45Z
- **Completed:** 2026-07-06T14:56:30Z (approx, tests green)
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `issueFunnelCounts.ts`: `ISSUE_STATUSES` (8 entries), `summarizeIssueStatus`
  (fixed order + zeros kept + honest overflow + per-project drill sort +
  total), `deriveIssueCoverageCaption` (fetched/total/unavailable derived from
  live `IssueCoverageInputRow[]`).
- `__tests__/issueFunnelCounts.test.ts`: 7 cases, all green, covering both
  exported functions per the plan's exact test list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create issueFunnelCounts pure transforms** - `c0b599cd` (feat)
2. **Task 2: Unit-test the transforms** - `a705e4bb` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `app/(dashboard)/access-analysis/issueFunnelCounts.ts` - Pure transforms:
  `ISSUE_STATUSES`, `IssueStatusInputRow`, `IssueStatusSlice`,
  `IssueStatusSummary`, `summarizeIssueStatus`, `IssueCoverageCaption`,
  `deriveIssueCoverageCaption`. No React/DOM/IO imports; only type import is
  `IssueCoverageInputRow` from `./issueFetchCoverageCounts` (per the plan's
  `key_links` contract).
- `app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` -
  7 Vitest cases (5 for `summarizeIssueStatus`, 2 for
  `deriveIssueCoverageCaption`), following the existing
  `issueFetchCoverageCounts.test.ts` structure.

## Verification Evidence
- **Commands run:** `npx tsc --noEmit` -> exit 0, no errors.
- **Type/build gate:** `npx tsc --noEmit` -> clean.
- **Targeted tests/source checks:** `npx vitest run "app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts"` -> 1 file, 7/7 tests passed.
- **Repo-map check:** not needed - no import/data-flow/boundary changes; new
  file only imports one existing sibling type, no new external dependency.

## Dashboard Evidence
- **Workshop surface:** `/access-analysis` (transform layer only — not yet
  mounted; plan 21-03 builds the chart component consuming this module, plan
  21-04 wires it into the page).
- **Workshop impact:** No visible change yet. This plan lays the pure-logic
  foundation (bucket math, drill sort, coverage caption) that plan 21-03's
  issues-by-status donut will render.
- **UI guardrails:** N/A — module is React-free, no UI surface introduced.
- **Scope guardrails:** `/users/spatial-graph` untouched; only files touched
  are the two named in the plan's `files_modified` frontmatter.

## Data Truthfulness
- **Data sources:** No live data touched — pure functions operating on
  caller-supplied rows (`IssueStatusInputRow[]`/`IssueCoverageInputRow[]`).
  The actual `AccIssue`/coverage rows are sourced upstream by plan 21-01's
  `loadIssueFunnel()` and Phase 20's coordination-by-project loader.
- **Coverage limits:** `deriveIssueCoverageCaption` explicitly treats any
  status other than `ok`/`zero_issues` (including unrecognized future status
  strings) as `unavailable` — never silently counted as fetched.
- **No fake data:** No hardcoded coverage figures anywhere in the module;
  all counts are derived from the input rows passed by the caller.

## Decisions Made
- Local structural `IssueStatusInputRow` type instead of importing
  `IssueFunnelStatusRow` from `lib/server/issueFunnelView.ts`, per the plan's
  explicit wave-1-parallelism instruction (avoids a cross-plan file
  dependency; TypeScript structural typing covers the assignability).
- Added a defensive per-(projectId,status) count merge before sorting drill
  rows (plan explicitly calls for this edge case), implemented as a small
  `mergeByProject` helper reused by both the fixed-status loop and the
  overflow-bucket loop.

## Deviations from Plan

None - plan executed exactly as written. Both exports match the interfaces
block verbatim; test file covers exactly the 7 cases the plan enumerated.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed
- [x] Data coverage is truthful and labeled (unavailable = total - fetched,
      documented in-code)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (N/A —
      no UI touched this plan)
- [x] Claims backed by command output (`tsc`/`vitest` output above) or marked
      `VERIFY:` (none needed)

## Next Phase Readiness
- Plan 21-03 (chart components) can now build `IssuesByStatusDonut` (or
  equivalent) directly against `summarizeIssueStatus`/`deriveIssueCoverageCaption`
  with zero further transform work.
- Plan 21-04 (client wiring) will thread live `AccIssue`/coverage rows from
  `loadIssueFunnel()` (21-01) and the existing coordination-by-project loader
  (Phase 20) into these transforms — no blockers.

## Self-Check: PASSED

- FOUND: app/(dashboard)/access-analysis/issueFunnelCounts.ts
- FOUND: app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts
- FOUND: commit c0b599cd (feat: create issueFunnelCounts pure transforms)
- FOUND: commit a705e4bb (test: unit-test issueFunnelCounts transforms)

---
*Phase: 21-issue-funnel-status-time*
*Completed: 2026-07-06*
