---
phase: 05-access-analysis-depth
plan: "03"
subsystem: access-analysis
tags: [na-01, badge, coverage, pure-helper, tdd-green]
dependencies:
  requires:
    - 05-01 (ActivityCoverageBadge RED stub contract; ProjectCoverage interface)
  provides:
    - activityCoverageCounts(coverage) pure helper (NA-01 counting seam)
    - ActivityCoverageBadge component — inline "Activity: N / M projects" pill
  affects:
    - app/(dashboard)/access-analysis/coverageCounts.ts — new
    - app/(dashboard)/access-analysis/__tests__/coverageCounts.test.ts — new
    - app/(dashboard)/access-analysis/components/ActivityCoverageBadge.tsx — new
    - app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx — GREEN (was RED stub)
tech_stack:
  added: []
  patterns:
    - Pure counting helper (no React, importable from RSC or client)
    - RSC-safe presentational component (no "use client" required)
    - Neutral chrome pill (border-border bg-muted/60 text-[10px] uppercase tracking-wide)
    - data-testid stable selector surface
key_files:
  created:
    - app/(dashboard)/access-analysis/coverageCounts.ts
    - app/(dashboard)/access-analysis/__tests__/coverageCounts.test.ts
    - app/(dashboard)/access-analysis/components/ActivityCoverageBadge.tsx
  modified:
    - app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx
decisions:
  - "ActivityCoverageBadge is RSC-safe (no use client) — pure presentational; caller pre-computes counts via activityCoverageCounts()"
  - "success dot rendered when covered>0, omitted when covered=0 (honest zero state)"
  - "toLocaleString() used for both covered and total so '1152' renders as '1,152' matching existing test expectations"
  - "Styling matched to CoverageBadges.tsx OfficeBadge chrome for visual consistency"
metrics:
  duration: "2 minutes"
  completed: "2026-06-18"
  tasks: 2
  files_modified: 4
  files_created: 3
status: complete
---

# Phase 05 Plan 03: ActivityCoverageBadge + coverageCounts Helper Summary

**One-liner:** Pure activityCoverageCounts helper and RSC-safe ActivityCoverageBadge pill that turns the NA-01 RED stub GREEN — counts derived from existing coverage prop, no hardcoding, no new query.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | activityCoverageCounts pure helper + 5 tests | 1cf1f2e9 |
| 2 | ActivityCoverageBadge component + GREEN stub (remove @ts-expect-error) | bbef18d8 |

## What Was Built

### Task 1: activityCoverageCounts Pure Helper

- `coverageCounts.ts`: exports `ActivityCoverage` interface (`{ covered: number; total: number }`) and `activityCoverageCounts(coverage?: ReadonlyArray<ProjectCoverage>): ActivityCoverage`
- Derives `covered` = `rows.filter(c => c.hasActivity).length`, `total` = `rows.length`
- Returns `{ covered: 0, total: 0 }` for undefined or empty input (safe default)
- No React import — importable from both RSC and client components
- `coverageCounts.test.ts`: 5 tests covering undefined input, empty array, mixed (2/3 covered), all uncovered, all covered

### Task 2: ActivityCoverageBadge Component

- `ActivityCoverageBadge.tsx`: RSC-safe presentational pill matching `OfficeBadge` chrome from `CoverageBadges.tsx` (`inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground`)
- Renders `Activity: {covered.toLocaleString()} / {total.toLocaleString()} projects`
- Small success dot (`h-1.5 w-1.5 rounded-full bg-success`) when `covered > 0`; omitted at zero
- `title` attribute: "Activity data is available for N of M ACC projects."
- `data-testid="activity-coverage-badge"` stable selector
- `ActivityCoverageBadge.test.tsx`: removed `@ts-expect-error` suppression; both tests now GREEN (was intentional RED from 05-01)

## Verification

- `npx tsc --noEmit`: exit 0 (no TypeScript errors)
- `npx vitest run` on both test files: 7 tests pass (5 coverageCounts + 2 ActivityCoverageBadge)
- 05-01 RED ActivityCoverageBadge stub is now GREEN
- AccessAnalysisCharts.tsx untouched (Wave 3 places the badge)
- `/users/access-analysis/` and `/users/spatial-graph` untouched — scope boundary held
- `git diff --name-only HEAD~2 HEAD` shows exactly the 4 plan-declared files

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The ActivityCoverageBadge is a complete, tested component. Wave 3 (plan 05-04 or later) will place it in AccessAnalysisCharts.tsx.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `app/(dashboard)/access-analysis/coverageCounts.ts` — exists, exports `activityCoverageCounts`
- `app/(dashboard)/access-analysis/__tests__/coverageCounts.test.ts` — exists, 5 tests pass
- `app/(dashboard)/access-analysis/components/ActivityCoverageBadge.tsx` — exists, `data-testid="activity-coverage-badge"` present
- `app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx` — no `@ts-expect-error`; 2 tests GREEN
- Commits 1cf1f2e9 and bbef18d8 in git log
- `npx tsc --noEmit` exit 0
