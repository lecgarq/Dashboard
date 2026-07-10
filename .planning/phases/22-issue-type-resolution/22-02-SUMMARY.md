---
phase: 22-issue-type-resolution
plan: 02
subsystem: api
tags: [prisma, groupBy, vitest, issue-funnel, access-analysis]

# Dependency graph
requires:
  - phase: 22-issue-type-resolution (plan 01)
    provides: AccIssueType Prisma lookup table (kind='type'/'subtype' rows), populated via scripts/acc-issue-types-backfill.cjs, 298/316 issueTypeId GUIDs resolved
provides:
  - loadIssueFunnel() typeRows cut (IssueFunnelTypeRow[]) inside the existing Promise.all/5-min-TTL cache
  - summarizeIssueType() pure top-N + Other transform with distinct honest Unknown/No-type buckets
affects: [22-03 (ISSUE-05 chart component + mounting on Projects tab)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "issueFunnelView.ts typeRows: second db.accIssue.groupBy joined in JS against db.accIssueType.findMany() — never a second $queryRaw call, preserves the single-queryRaw test pin"
    - "issueTypeCounts.ts groups resolved rows by typeName (not GUID) since APS issue types are project-scoped; caption stats (resolvedTypeGuids/totalTypeGuids) stay GUID-level"

key-files:
  created:
    - app/(dashboard)/access-analysis/issueTypeCounts.ts
    - app/(dashboard)/access-analysis/__tests__/issueTypeCounts.test.ts
  modified:
    - lib/server/issueFunnelView.ts
    - lib/server/issueFunnelView.test.ts
    - app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx

key-decisions:
  - "Type cut rides the existing loadIssueFunnel() Promise.all (2 new entries: accIssue.groupBy on issueTypeId + accIssueType.findMany) — zero new loader/action/fetch branch, per 22-CONTEXT.md locked decision"
  - "summarizeIssueType groups by typeName not GUID — collapses per-project GUID duplication of the same logical type name into one account-wide bucket"

patterns-established:
  - "Three-state issue-type row: resolved name / non-null-GUID-unresolved (Unknown type) / null-id (No type set) — kept distinct through the loader, labeled only at the transform layer"

requirements-completed: []  # ISSUE-05 not marked complete here — same precedent as 21-02/20.1-02: requirement completes at the wiring plan (22-03), not the data-layer/transform-build plan

# Metrics
duration: ~35min
completed: 2026-07-10
---

# Phase 22 Plan 02: ISSUE-05 Data Layer Summary

**`loadIssueFunnel()` gains a third `typeRows` cut (per-project issue counts by resolved type name) and a new `summarizeIssueType()` pure transform folds them into top-N + honest "Unknown type"/"No type set" buckets — both unmounted, ready for the 22-03 chart.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 modified as planned + 1 Rule-3 blocking fix), 2 created

## Accomplishments
- `IssueFunnelData.typeRows: IssueFunnelTypeRow[]` extends the existing 5-min-TTL cache/`Promise.all` with exactly two new entries (a second `groupBy` + a bounded `findMany` on `AccIssueType`, ≤831 rows) — the pre-existing `$queryRaw` month-cut call stays the only raw-SQL call site (grep-verified: 1)
- `summarizeIssueType()` (`app/(dashboard)/access-analysis/issueTypeCounts.ts`) clones `permissionLevelCounts.ts`'s sort/slice/fold/drill-map shape, grouping resolved rows by `typeName` (not GUID) per the 22-CONTEXT.md locked rationale, with distinct "Unknown type"/"No type set" buckets that rank by count and a lossless `total`
- 4 new Vitest cases in `issueFunnelView.test.ts` (bounded aggregate, resolved GUID, unresolved GUID, null id) + 9 new cases in `issueTypeCounts.test.ts` (fold arithmetic, unknown-outranks-named, distinct buckets, losslessness with/without fold, expand-in-place, GUID-vs-row-count caption math, drill sort, defensive per-project merge, empty input)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend loadIssueFunnel() with the typeRows cut and update its tests** - `012fce35` (feat)
2. **Task 2: Build summarizeIssueType (top-N + Other, distinct honest buckets) with tests** - `a9a325e6` (feat)

_No TDD tasks in this plan (type="auto" throughout)._

## Files Created/Modified
- `lib/server/issueFunnelView.ts` - added `IssueFunnelTypeRow` + `typeRows` cut (2 new `Promise.all` entries, JS-joined name resolution)
- `lib/server/issueFunnelView.test.ts` - shared `groupBy` mock now dispatches on `args.by`; `accIssueType.findMany` mock added; 4 new type-cut cases
- `app/(dashboard)/access-analysis/issueTypeCounts.ts` - new `summarizeIssueType()` top-N + Other transform (created)
- `app/(dashboard)/access-analysis/__tests__/issueTypeCounts.test.ts` - 9 new Vitest cases (created)
- `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx` - 3 `IssueFunnelData` test fixtures updated to include the now-required `typeRows: []` field (Rule 3 blocking fix, see Deviations)

## Verification Evidence
- **Commands run:** `npx vitest run lib/server/issueFunnelView.test.ts "app/(dashboard)/access-analysis/__tests__/issueTypeCounts.test.ts"` -> 20 passed (11 + 9)
- **Type/build gate:** `npx tsc --noEmit` -> exit 0, clean
- **Targeted tests/source checks:** `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"` -> 44 passed (post Rule-3 fix); `grep -c '\$queryRaw' lib/server/issueFunnelView.ts` -> `1` (pin holds)
- **Full suite:** `npm test` -> 2507 passed / 1 failed / 1 skipped (2509 total). The 1 failure (`physicsLayer.test.ts`, `/users` spatial-graph-adjacent physics module) is an out-of-scope, pre-existing test-isolation flake — reproduces only under full-suite run ordering, passes cleanly in isolation (`npx vitest run ... -t "normalizes the settled spread"` -> 1 passed). Logged to `.planning/phases/22-issue-type-resolution/deferred-items.md`, not fixed (Scope Boundary rule — file untouched by this plan, `/users/spatial-graph`-adjacent, out of bounds per Dashboard constraints).
- **Repo-map check:** not run — no import/boundary/data-flow structural changes (additive field + additive `Promise.all` entries + one new pure-transform file, no new cross-module edges beyond the already-verified `@/lib/server/issueFunnelView` import)

## Dashboard Evidence
- **Workshop surface:** repo-only this plan — `/access-analysis` Projects tab is unaffected until 22-03 mounts the chart. `typeRows`/`summarizeIssueType` are built and tested but not wired into any component.
- **Workshop impact:** none yet (data-layer plan); unblocks 22-03's "what kinds of issues do we actually have?" panel.
- **UI guardrails:** n/a this plan (no UI touched).
- **Scope guardrails:** `/users/spatial-graph` untouched (confirmed via `git diff --name-only` on both commits — only the 5 files listed above).

## Data Truthfulness
- **Data sources:** `AccIssue` full set (no `isCoordination`/`deleted` filter — same population as the Phase 21 month/status cuts, per 22-CONTEXT.md's "match the funnel exactly" decision) + `AccIssueType` lookup table (Phase 22-01, live-populated).
- **Coverage limits:** three-state resolution kept honest through both the loader and transform — a non-null `issueTypeId` absent from the lookup never silently becomes "No type set" or gets dropped; `resolvedTypeGuids`/`totalTypeGuids` are GUID-distinct counts computed live from the row set, never hardcoded (no "316"/"298" literal anywhere in the new code).
- **No fake data:** no fixtures, env vars, or route/API claims invented; all Prisma calls (`accIssue.groupBy`, `accIssueType.findMany`) verified against `prisma/schema.prisma`'s `AccIssueType` model (confirmed present, applied via 22-01's raw-SQL migration).

## Decisions Made
- Type cut extends the existing `Promise.all` (2 new entries) inside `loadIssueFunnel()` rather than a new loader/action — matches 22-CONTEXT.md's locked "zero new fetch branch" decision and the STATE.md fan-out-consolidation guardrail.
- `summarizeIssueType` aggregates by `typeName`, not `issueTypeId` GUID — the 22-CONTEXT.md-documented rationale (APS issue types are project/container-scoped, so grouping by GUID would fragment ~10-25 real per-project type names into up to 316 duplicate-name rows). Caption-level GUID stats (`resolvedTypeGuids`/`totalTypeGuids`) stay GUID-scoped so the "N of M GUIDs resolved" coverage line (planned for 22-03) is still accurate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 3 `IssueFunnelData` test fixtures missing the new required `typeRows` field**
- **Found during:** Task 1 (post-edit `npx tsc --noEmit` gate)
- **Issue:** Adding `typeRows: IssueFunnelTypeRow[]` as a required field to the exported `IssueFunnelData` interface broke 3 pre-existing object-literal fixtures in `AccessAnalysisCharts.test.tsx` (`{ monthRows: [], statusRows: [] }`) with TS2322 — a compile-blocking regression caused directly by this plan's interface extension, not a pre-existing issue.
- **Fix:** Added `typeRows: []` to all 3 fixtures (`sed` on the exact literal `monthRows: [], statusRows: []` -> `monthRows: [], statusRows: [], typeRows: []`), matching the existing empty-array fixture convention.
- **Files modified:** `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`
- **Verification:** `npx tsc --noEmit` -> clean; `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"` -> 44/44 passed.
- **Committed in:** `012fce35` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the plan's own `npx tsc --noEmit` gate green after the additive interface change. No scope creep — the file diff is a single-line-per-fixture addition, no behavioral change to the tests themselves.

## Issues Encountered
- Full-suite `npm test` surfaced 1 pre-existing, out-of-scope test-isolation flake (`physicsLayer.test.ts`) unrelated to this plan's files — see Verification Evidence and `deferred-items.md`. Not an issue with this plan's changes; confirmed by passing in isolation.

## User Setup Required
None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (server-side `groupBy`/`findMany`, never a raw scan at `AccIssue` scale; project names resolved via `buildProjectNameMap`/`resolveProjectName`, never a raw GUID)
- [x] Data coverage is truthful and labeled (three-state type resolution, GUID-distinct coverage stats, no hardcoded counts)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (no UI touched this plan; `/users/spatial-graph`-adjacent test file flake logged but not touched)
- [x] Claims backed by command output, source evidence, or marked `VERIFY:` (all commands run and output captured above; zero `VERIFY:` items remain)

## Next Phase Readiness
- `IssueFunnelTypeRow[]` (via `typeRows`) and `summarizeIssueType()` are both built, tested, and ready for 22-03 to consume — no further data-layer work needed.
- 22-03 must import `IssueFunnelTypeRow` from `@/lib/server/issueFunnelView` and `summarizeIssueType`/`DEFAULT_TOP_N`/`IssueTypeSummary`/`IssueTypeBucket` from `./issueTypeCounts` (both already exported with the exact names 22-CONTEXT.md/22-02-PLAN.md's interfaces specify).
- No blockers. The one open item (`physicsLayer.test.ts` flake) is unrelated and already flagged for a future infra-focused pass, matching the existing `UsersDirectoryClient.integration.test.tsx` precedent in STATE.md.

---
*Phase: 22-issue-type-resolution*
*Completed: 2026-07-10*

## Self-Check: PASSED

All 7 claimed files found on disk; both task commits (`012fce35`, `a9a325e6`) verified in
`git log --oneline --all`.
