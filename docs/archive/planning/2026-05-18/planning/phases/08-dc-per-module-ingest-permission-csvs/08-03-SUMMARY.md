---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 03
subsystem: ingest
tags: [data-connector, backfill, state-machine, pure-module, vitest, tdd, date-fns]

# Dependency graph
requires:
  - phase: 08-dc-per-module-ingest-permission-csvs
    provides: AccDcBackfillProgress schema (08-01) — runtime caller hydrates ProjectProgress rows from this table
provides:
  - Pure planDailySlice() state machine — emits Slices grouped into APS-50-cap batches
  - applySliceCompletion() — immutable progress advance per slice reason
  - PROJECT_BATCH_LIMIT (50), SLICE_DAYS (30), OVERLAP_DAYS (1) public constants
  - ProjectProgress / Slice / SliceReason / DailyPlan TypeScript surface
affects: [08-06 dcIngest orchestrator, 08-07 cron wiring, future quota-aware schedulers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure date-fns module (zero Prisma/fs/fetch); orchestration lives in 08-06 caller"
    - "Insertion-order Map<bucketKey, slices[]> for deterministic batching"
    - "Three-state SliceReason ('new-project' | 'backward' | 'forward') drives immutable state advance"

key-files:
  created:
    - lib/acc/dcProgressiveBackfill.ts
  modified:
    - lib/acc/dcProgressiveBackfill.test.ts (replaced placeholder from plan 08-01)

key-decisions:
  - "Forward slice emitted only when latestCovered < yesterday (strict). OVERLAP_DAYS rewinds the START to catch late-arriving events; gate uses pre-overlap latestCovered. Prevents fully-current projects from burning quota each day."
  - "Bucket key is `${start.toISOString()}|${end.toISOString()}|${reason}` — reason included so a backward slice and a forward slice that incidentally share start/end (impossible in practice but cheap to defend) cannot collide into one batch with mixed semantics."
  - "ProjectProgress.projectCreatedAt is non-nullable on the module surface. Per plan 08-01 SUMMARY: AccDcProject.createdAt is nullable in schema; CALLER (plan 08-06) must resolve null to earliest known activity timestamp BEFORE invoking planDailySlice. Module documents this contract in the JSDoc."
  - "applySliceCompletion uses ?? fallback (prev.latestCovered ?? slice.end) so a backward slice on a project that somehow has no latestCovered yet still produces a coherent state — defensive but never expected to fire."

patterns-established:
  - "Pure state-machine module preceding orchestrator (08-06) — same shape as Phase 4 folderHubCollapse / Phase 7 userSimilarity"
  - "Public-constant export of magic numbers (PROJECT_BATCH_LIMIT, SLICE_DAYS, OVERLAP_DAYS) so callers cannot drift"

requirements-completed: [DC8-07, DC8-11, DC8-13]

# Metrics
duration: 4min
completed: 2026-05-15
---

# Phase 8 Plan 03: Progressive Backfill State Machine Summary

**Pure planDailySlice() state machine that takes AccDcBackfillProgress rows + yesterday and emits APS-50-batched Slices implementing the Luis-originated breadth-first daily-30d strategy.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-15T18:16:00Z
- **Completed:** 2026-05-15T18:20:06Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- 15/15 Vitest cases GREEN covering empty / new-project / fully-backfilled / backward / floor-clamped / forward / combined / batching-50 / spill-51 / mixed-windows / applySliceCompletion-3-reasons
- Pure module — `grep "@prisma/client|node:fs|fetch("` returns 0 matches, 196 lines (<200 budget)
- Public surface stable for plan 08-06 dcIngest orchestrator: `planDailySlice`, `applySliceCompletion`, `PROJECT_BATCH_LIMIT`, `SLICE_DAYS`, `OVERLAP_DAYS`, `ProjectProgress`, `Slice`, `SliceReason`, `DailyPlan`

## Task Commits

1. **Task 1: RED — Vitest suite for dcProgressiveBackfill** - `5ba5989` (test)
2. **Task 2: GREEN — implement dcProgressiveBackfill.ts** - `68bd1ae` (feat)

## Files Created/Modified

- `lib/acc/dcProgressiveBackfill.ts` (created, 196 lines) — pure state machine
- `lib/acc/dcProgressiveBackfill.test.ts` (replaced 18-line placeholder with 248-line suite)

## Decisions Made

See key-decisions above. The single non-obvious one: **forward-slice gate uses pre-overlap `latestCovered < yesterday`**, not the post-overlap `forwardStart < yesterday` that the plan literally suggested. Reason: with OVERLAP_DAYS=1, a fully-current project (latestCovered === yesterday) would otherwise produce a forward slice [yesterday-1d, yesterday] every single day forever — wasted quota. Plan task 1 case 3 ("fully-backfilled → 0 slices") confirms the user-intended behavior; the algorithm spec text was loose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forward-slice gate condition tightened to use pre-overlap latestCovered**
- **Found during:** Task 2 (Vitest 5/15 failures after first GREEN attempt)
- **Issue:** Algorithm spec said `forwardStart = subDays(latestCovered, 1); if (forwardStart < yesterday) emit`. But when latestCovered === yesterday this is always true (forwardStart = yesterday-1d < yesterday) → fully-current projects burn 1 quota slot/day forever. Tests for "50 projects sharing backward window → 1 Slice" failed because each of the 50 projects also produced a redundant forward slice.
- **Fix:** Gate flipped to `if (isBefore(proj.latestCovered, yesterdayUtc))` then compute forwardStart = subDays(latestCovered, OVERLAP_DAYS) for the start. OVERLAP_DAYS still rewinds the start to catch late-arriving events when forward IS emitted.
- **Files modified:** lib/acc/dcProgressiveBackfill.ts
- **Verification:** 15/15 Vitest GREEN (was 10/15)
- **Committed in:** 68bd1ae (Task 2 commit — caught and fixed before commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in literal-spec interpretation; user-intended behavior recovered from plan task 1 case 3)
**Impact on plan:** No scope creep. Algorithm now matches the test contract the plan itself defined.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — pure module, no env vars, no external services.

## Next Phase Readiness

Plan 08-06 (dcIngest orchestrator) can now:

```ts
import { planDailySlice, applySliceCompletion, PROJECT_BATCH_LIMIT } from '@/lib/acc/dcProgressiveBackfill';

const progressRows = await prisma.accDcBackfillProgress.findMany();
const projects: ProjectProgress[] = progressRows.map(row => ({
  projectId: row.projectId,
  earliestCovered: row.earliestCovered,
  latestCovered: row.latestCovered,
  // CRITICAL: AccDcProject.createdAt is nullable per 08-01; callers MUST fall back
  // to "earliest known activity timestamp" before passing to planDailySlice.
  projectCreatedAt: row.projectCreatedAt ?? earliestActivityFor(row.projectId),
  newProjectFlag: row.newProjectFlag,
}));
const plan = planDailySlice(projects, yesterdayUtc);
for (const slice of plan.slices) {
  await dispatchAps({ projectIdList: slice.projectIds, dateRange: 'CUSTOM', startDate: slice.start, endDate: slice.end });
  for (const projectId of slice.projectIds) {
    const next = applySliceCompletion(prevById.get(projectId)!, slice);
    await prisma.accDcBackfillProgress.update({ where: { projectId }, data: next });
  }
}
```

**Blockers:** None for plan 08-06. Sibling plan 08-02 (Wave 2) is independent — touches different files.

## Self-Check: PASSED

- FOUND: lib/acc/dcProgressiveBackfill.ts
- FOUND: lib/acc/dcProgressiveBackfill.test.ts
- FOUND commit 5ba5989 (Task 1 RED)
- FOUND commit 68bd1ae (Task 2 GREEN)

---
*Phase: 08-dc-per-module-ingest-permission-csvs*
*Completed: 2026-05-15*
