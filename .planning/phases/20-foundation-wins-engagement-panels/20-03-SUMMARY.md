---
phase: 20-foundation-wins-engagement-panels
plan: 03
subsystem: ui
tags: [prisma, echarts, react, access-analysis, coordination]

requires: []
provides:
  - "Additive issueCoverage field on CoordinationByProjectData (lib/server/coordinationByProjectView.ts)"
  - "summarizeIssueCoverage pure transform — 4 fixed honest buckets from selection-filtered rows"
  - "IssueFetchCoverageDonut client component — 4-bucket honest donut with per-bucket project drill"
affects: [20-05]

tech-stack:
  added: []
  patterns:
    - "Server loader consolidation: extend an existing loader in place (coordinationByProjectView.ts) instead of adding a parallel loader, when it already fetches the same underlying run row"
    - "Raw-rows-to-client transform: server ships raw per-project rows; a pure client-side transform (summarizeIssueCoverage) buckets them so the UI can obey the FilterBanner project-selection cross-filter without a re-fetch"
    - "Unexpected-status overflow bucket: string-typed status columns get an honest extra bucket for any value outside the known set, never silently dropped"

key-files:
  created:
    - "app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts"
    - "app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts"
    - "app/(dashboard)/access-analysis/components/IssueFetchCoverageDonut.tsx"
    - "app/(dashboard)/access-analysis/__tests__/IssueFetchCoverageDonut.test.tsx"
  modified:
    - "lib/server/coordinationByProjectView.ts"
    - "lib/server/coordinationByProjectView.test.ts"

key-decisions:
  - "Extended lib/server/coordinationByProjectView.ts in place (per orchestrator + 20-RESEARCH.md Open Question 2) rather than adding a new standalone loader, keeping mainCharts.tsx's Promise.all fan-out unchanged for ISSUE-01"
  - "Donut accepts coverage (run metadata: runStatus/runStartedAt/runFinishedAt, or null) + projects (pre-filtered rows) as two separate props instead of the raw CoordinationByProjectData['issueCoverage'] shape, so the parent (plan 20-05) can pass filterRowsBySelection output directly without the component re-deriving selection state"
  - "Bucket 'count' in summarizeIssueCoverage is a project count (matches the CONTEXT.md live figures error=596/zero_issues=437/ok=119 of projectsTotal=1152), not a summed issueCount"

requirements-completed: [ISSUE-01]

duration: ~35min
completed: 2026-07-03
---

# Phase 20 Plan 03: Issue-Fetch Coverage Donut (ISSUE-01) Summary

**Additive `issueCoverage` on `coordinationByProjectView.ts` + a pure 4-bucket transform + a standalone `IssueFetchCoverageDonut` client component (ok/zero_issues/forbidden/error, all always shown, drillable per bucket) — not yet mounted; plan 20-05 places it above Model Coordination.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 6 (2 modified, 4 created)

## Accomplishments

- `loadCoordinationByProject` now also returns `issueCoverage` (raw per-project rows for the latest `AccIssueFetchRun`) — additive only, existing fields/query shapes/`CoordinationRow` mapping unchanged, `CoordinationByProject.tsx` consumer untouched.
- `summarizeIssueCoverage` pure transform guarantees all 4 honest buckets (`ok`/`zero_issues`/`forbidden`/`error`) are always present, in fixed order, zeros kept — plus an honest overflow bucket for any unexpected raw status value instead of silently dropping it.
- `IssueFetchCoverageDonut` renders the 4-bucket donut with click-to-drill on every bucket (including `ok`/`zero_issues`), an in-progress caption when the latest run is `running`/unfinished, a freshness chip, and both required empty states.

## Task Commits

1. **Task 1: extend coordinationByProjectView with additive issueCoverage + tests** - `a966c610` (feat)
2. **Task 2: summarizeIssueCoverage pure transform + test** - `550d66a1` (feat)
3. **Task 3: IssueFetchCoverageDonut client component + test** - `de4a0bf1` (feat)

**Plan metadata:** captured in this SUMMARY commit (docs).

## Files Created/Modified

- `lib/server/coordinationByProjectView.ts` - added `IssueCoverage`/`IssueCoverageProjectRow` types and the additive `issueCoverage` field; `accIssueFetchRun.findFirst` select extended with `id`/`status`/`finishedAt`; new `accIssueProjectFetchResult.findMany({ where: { runId } })` call scoped to the latest run, only when a run exists.
- `lib/server/coordinationByProjectView.test.ts` - added the `accIssueProjectFetchResult.findMany` mock + 3 new tests (populates from mocked rows with null-name fallback, scoped-by-run-id call assertion, null-run skip); 2 pre-existing tests kept byte-unchanged.
- `app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts` - `COVERAGE_BUCKETS`, `COVERAGE_BUCKET_LABELS`, `summarizeIssueCoverage(projects)` → `{ slices, projectsByStatus }`.
- `app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts` - 7 tests covering fixed-bucket presence, zero-kept, label copy, drill inclusion of ok/zero_issues, overflow-bucket honesty, sort order, and aggregate-shape bound.
- `app/(dashboard)/access-analysis/components/IssueFetchCoverageDonut.tsx` - `"use client"` donut following the `RolesPieChart`/`ModulesPieChart` click-to-drill legend pattern; `@/components/ui/EChart` wrapper; resolved-theme colors; in-progress caption; freshness chip via `../relativeTime`; two distinct empty states.
- `app/(dashboard)/access-analysis/__tests__/IssueFetchCoverageDonut.test.tsx` - 8 tests: both empty states, all-4-buckets legend, drill on `ok` and on `zero_issues` (proves every bucket is clickable), in-progress caption shown/hidden, freshness chip text.

## Verification Evidence

- **Commands run:** `npx vitest run lib/server/coordinationByProjectView.test.ts "app/(dashboard)/access-analysis/__tests__/issueFetchCoverageCounts.test.ts" "app/(dashboard)/access-analysis/__tests__/IssueFetchCoverageDonut.test.tsx" "app/(dashboard)/access-analysis/__tests__/CoordinationByProject.test.tsx"` -> 4 test files, 28 tests, all passed.
- **Type/build gate:** `npx tsc --noEmit` -> repo-wide run showed 5 pre-existing `TS2737` errors in `lib/server/permissionFootprintView.test.ts` (owned by sibling plan 20-01/PERM-01, not this plan's `files_modified`; a concurrently-running 20-01 executor fixed these in commit `f9736a4a` during this session). Filtered for this plan's 3 changed/created files (`coordinationByProjectView`, `issueFetchCoverageCounts`, `IssueFetchCoverageDonut`): **zero errors**.
- **Targeted tests/source checks:** grep for the live-verified figures `596|437|119|1152` across all 6 changed/created files -> no matches (no hardcoded coverage numbers).
- **Repo-map check:** not run — no import-graph/data-flow/boundary change (additive field + 2 new standalone files not yet imported by any consumer; plan 20-05 wires the mount).

## Dashboard Evidence

- **Workshop surface:** `/access-analysis` (component built but not yet mounted — plan 20-05 places it directly above Model Coordination per this plan's objective).
- **Workshop impact:** once mounted (20-05), gives Luis's live demo an honest "which projects can't we see into?" trust panel ahead of every issue-based metric — CONTEXT.md flags `error` (596) as currently the *largest* bucket, an expected and deliberately surfaced demo moment, not hidden.
- **UI guardrails:** zinc dark theme via `@/components/ui/EChart` (`useTheme`/`resolvedTheme`); donut center-label/tooltip colors reuse the exact `cTitle`/`cSub` hex tokens already verified in `chartContrast.test.ts` (`#fafafa`/`#111827`, `#a1a1aa`/`#52525b`) rather than introducing new untested color tokens; both empty states implemented (`coverage === null` and `projects.length === 0`, distinct copy); no new WebGL — pure ECharts canvas donut, same as the 5 sibling pie charts.
- **Scope guardrails:** `/users/spatial-graph` untouched; `mainCharts.tsx` untouched (verified — no edits to that file in this plan, per its own success criterion).

## Data Truthfulness

- **Data sources:** `AccIssueFetchRun` (latest row by `startedAt` desc) + `AccIssueProjectFetchResult` (`findMany` scoped to `runId`, index-covered by `@@index([runId, status])`) — both verified in `prisma/schema.prisma` (lines 871-902 per the plan's `<interfaces>` block) before use.
- **Coverage limits:** all 4 statuses always rendered even at 0 (no merging of `zero_issues` into `ok`, no hiding `forbidden`/`error`); a `running`/unfinished latest run is explicitly labeled "counts are partial" rather than presented as final; `projectName` never falls back to a raw GUID (falls back to the literal string `"Unknown project"`).
- **No fake data:** no fixtures, routes, tRPC procedures, or Prisma models invented; grep-verified no hardcoded coverage figures anywhere in the new/changed files.

## Decisions Made

- Extended `coordinationByProjectView.ts` in place rather than adding a parallel loader (matches the plan's explicit consolidation decision and 20-RESEARCH.md Open Question 2 resolution).
- Donut's prop shape splits run-metadata (`coverage`) from selection-filtered rows (`projects`) rather than passing the full `CoordinationByProjectData['issueCoverage']` object plus a `selectedProjectIds` set — keeps the component pure/presentational and lets the future mount point (20-05) own all selection-filtering logic via the existing `filterRowsBySelection` helper.
- Bucket colors reused directly from the existing amber/rose precedent in `roleColors.ts` (forbidden=amber, error=rose) plus emerald/zinc for ok/zero_issues, avoiding new unverified color tokens.

## Deviations from Plan

None - plan executed exactly as written. All 3 tasks' `<done>` criteria met without needing Rule 1-4 auto-fixes to this plan's own files.

## Issues Encountered

- **Staging-index hazard (documented, not a code issue):** this phase's wave-1 plans (20-01, 20-02, 20-04) are executing concurrently in the same working directory (no worktree isolation). Before every commit in this plan, `git diff --cached --name-only` after `git add` showed sibling-plan files (`lib/server/permissionFootprintView.ts`/`.test.ts`, owned by 20-01) pre-staged in the shared index. Unstaged them explicitly via `git restore --staged` before each of this plan's 3 commits — confirmed via `git log` that none of the 3 task commits (`a966c610`, `550d66a1`, `de4a0bf1`) include any file outside this plan's `files_modified` list. Also appended a note to the phase's existing `deferred-items.md` recording this and correcting a stale attribution in that file (it had said the pre-existing `permissionFootprintView.test.ts` BigInt `tsc` errors were "likely plan 20-03's" — current frontmatter confirms that file belongs to plan 20-01/PERM-01). That doc edit itself got swept into a sibling commit (`f9736a4a`, a 20-01 `git commit -a`) rather than a commit of this plan's own — content is preserved in git history either way, just not attributed to a 20-03 commit hash.

## User Setup Required

None - no external service configuration required.

## Dashboard Self-Check

- [x] Exact repo paths used; no invented `src/...` paths (`lib/server/`, `app/(dashboard)/access-analysis/`, `app/(dashboard)/access-analysis/components/` — all verified existing roots).
- [x] Relevant Dashboard skill/project instructions followed (zinc theme via `@/components/ui/EChart`, explicit-path commits, `npx tsc --noEmit` gate run).
- [x] Data coverage is truthful and labeled (all 4 buckets always shown; in-progress run explicitly labeled partial; GUID-as-name guardrail applied).
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (canvas-only ECharts donut; spatial-graph and `mainCharts.tsx` untouched).
- [x] Claims backed by command output, source evidence, or marked `VERIFY:` (test run output, grep output, and `tsc --noEmit` output all captured above; no `VERIFY:` items remain for this plan's own scope).

## Next Phase Readiness

- ISSUE-01 vertical slice is complete and independently tested (loader + pure transform + component, 3 separate test files, 28 tests total across the touched surface). Ready for plan 20-05 to mount `IssueFetchCoverageDonut` directly above `CoordinationByProject` in the access-analysis page, wiring `filterRowsBySelection` over `data.issueCoverage.projects` and passing `data.issueCoverage` (or `null`) as the `coverage` prop.
- No blockers. The only open item is the pre-existing, out-of-scope `permissionFootprintView.test.ts` `tsc` errors, which a sibling 20-01 executor already resolved mid-session (commit `f9736a4a`) — confirmed not a 20-03 concern.

## Self-Check: PASSED

All 6 created/modified source files + this SUMMARY.md confirmed present on disk;
all 3 task commits (`a966c610`, `550d66a1`, `de4a0bf1`) confirmed in `git log`.

---
*Phase: 20-foundation-wins-engagement-panels*
*Completed: 2026-07-03*
