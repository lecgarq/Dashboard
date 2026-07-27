---
phase: 21-issue-funnel-status-time
plan: 01
subsystem: api
tags: [prisma, trpc-adjacent-server-action, echarts-data-layer, groupby-aggregate]

# Dependency graph
requires:
  - phase: 20.1-access-analysis-ia-redesign
    provides: buildProjectNameMap/resolveProjectName (folderActivityView.ts), coordinationByProjectView.ts cache/groupBy conventions, activityRecencyActions.ts auth-gate shape
provides:
  - "lib/server/issueFunnelView.ts: loadIssueFunnel() server aggregate loader (IssueFunnelData/IssueFunnelMonthRow/IssueFunnelStatusRow)"
  - "lib/server/issueFunnelView.test.ts: aggregate-bound Vitest test (roadmap success criterion 4)"
  - "app/(dashboard)/access-analysis/issueFunnelActions.ts: lazy auth-gated loadIssueFunnelAction, unwired"
affects: [21-02, 21-03, 21-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AccIssue full-set aggregate loader (no isCoordination filter) mirroring coordinationByProjectView.ts's TTL-cache + Promise.all shape"
    - "date_trunc('month', ...) raw SQL cut alongside a Prisma groupBy cut in a single Promise.all, both resolved through the shared buildProjectNameMap/resolveProjectName project-name resolver"

key-files:
  created:
    - lib/server/issueFunnelView.ts
    - lib/server/issueFunnelView.test.ts
    - "app/(dashboard)/access-analysis/issueFunnelActions.ts"
  modified: []

key-decisions:
  - "issueFunnelActions.ts mirrors activityRecencyActions.ts verbatim (auth() gate returning null on no-session, otherwise delegates to the loader) -- no new action pattern introduced"
  - "Client wiring (mainCharts.tsx / ProjectsTabPanel.tsx) intentionally deferred to plan 21-04 per CONTEXT.md locked decision -- this plan's action export is unwired by design"

patterns-established:
  - "Aggregate-bound-output test pattern for a mixed raw-SQL + groupBy loader: assert output row count equals mocked aggregate row count (never expanded to raw-row count) AND assert the raw findMany-equivalent scan was never called"

requirements-completed: [ISSUE-02, ISSUE-03]

# Metrics
duration: ~10min (continuation session; prior session's Task 1 duration not recorded before it died)
completed: 2026-07-06
status: complete
---

# Phase 21 Plan 01: Issue Funnel Server Data Layer Summary

**Server-side `loadIssueFunnel()` aggregate loader over the full 17,360-row `AccIssue` set (monthly `date_trunc` timeline cut + status `groupBy` cut in one `Promise.all`), its aggregate-bound Vitest test, and an unwired lazy auth-gated server action mirroring the existing `activityRecencyActions.ts` shape.**

## Performance

- **Duration:** ~10 min for this continuation session (Task 2 + gates + docs). Task 1 was completed and committed in a prior session that died on an API error before finishing; its own duration was not recorded.
- **Started (this session):** 2026-07-06T14:43Z (verification of prior commit)
- **Completed:** 2026-07-06T14:47Z
- **Tasks:** 2/2 complete
- **Files modified:** 3 (2 from prior session's commit, 1 from this session's commit)

## Accomplishments
- Verified prior session's Task 1 commit (`fc66c90b`) is correct, complete, and matches the plan's interface contract exactly (types, TTL cache, `date_trunc` WHERE clause, null-status coalesce, project-name resolution).
- Added `app/(dashboard)/access-analysis/issueFunnelActions.ts` — the lazy, auth-gated `"use server"` action that plan 21-04 will wire into the Projects tab.
- Confirmed both `npx tsc --noEmit` and `npx vitest run lib/server/issueFunnelView.test.ts` are green against the completed plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create issueFunnelView loader + co-located aggregate-bound test** - `fc66c90b` (feat) — completed in a prior session; verified, not redone.
2. **Task 2: Create the lazy auth-gated issueFunnelActions server action** - `b2d39428` (feat)

**Plan metadata:** (this commit, see below)

## Files Created/Modified
- `lib/server/issueFunnelView.ts` - `loadIssueFunnel()` aggregate loader; exports `IssueFunnelData`/`IssueFunnelMonthRow`/`IssueFunnelStatusRow` (prior session, commit `fc66c90b`)
- `lib/server/issueFunnelView.test.ts` - Aggregate-bound Vitest test covering (a) output bounded by mocked aggregate row counts + raw-scan guard, (b) null-date WHERE-clause pin, (c) project-name resolution precedence incl. "Unknown project" fallback, (d) null-status → "unknown" passthrough (prior session, commit `fc66c90b`)
- `app/(dashboard)/access-analysis/issueFunnelActions.ts` - `loadIssueFunnelAction()`, auth-gated, delegates to `loadIssueFunnel()`; unwired (this session, commit `b2d39428`)

## Verification Evidence
- **Commands run:** `git show --stat fc66c90b` -> confirmed 2 files / 227 insertions matching plan scope; `git log --oneline -5` -> both task commits present in history.
- **Type/build gate:** `npx tsc --noEmit` -> exit 0, no output (clean across the whole tree, including the new action file's import of `IssueFunnelData`/`loadIssueFunnel`).
- **Targeted tests/source checks:** `npx vitest run lib/server/issueFunnelView.test.ts` -> `7 passed (7)`, all four required assertion groups (a)-(d) present in the test file (verified by Read).
- **Repo-map check:** Not run — this plan only adds new leaf files (no existing imports/boundaries changed); the new action file follows an already-verified sibling pattern (`activityRecencyActions.ts`) exactly.

## Dashboard Evidence
- **Workshop surface:** `/access-analysis` (Projects tab) — data layer only in this plan; no UI mounted yet (mounting is plan 21-04).
- **Workshop impact:** None yet visible to the presenter — this plan lays the server foundation the Projects tab's issue-funnel charts will read from in plan 21-04.
- **UI guardrails:** N/A — no UI changed in this plan.
- **Scope guardrails:** `/users/spatial-graph` untouched. No new WebGL. No new npm dependencies.

## Data Truthfulness
- **Data sources:** `AccIssue` (verified 17,360-row full set, no `isCoordination` filter — per plan and `.planning/STATE.md`/`REQUIREMENTS.md` ISSUE-02/03), `AccProject`/`AccDcProject` (project-name resolution only).
- **Coverage limits:** Loader itself carries no coverage caption (that's sourced live from the existing Phase 20 `coordinationByProjectView.ts` issue-coverage loader when the charts mount in plan 21-04, per `21-CONTEXT.md`). Null `createdAt` rows are excluded from the month cut (would otherwise corrupt the month key) but are still counted in the status cut — this is intentional and matches the plan's `must_haves.truths`.
- **No fake data:** No fixtures, mocked routes, or invented env vars. Both cuts are live server-side aggregates (`$queryRaw` `date_trunc` + Prisma `groupBy`), never `findMany` + JS reduce.

## Decisions Made
- Verified rather than re-executed Task 1 — the prior session's commit `fc66c90b` was read in full and matches every line of the plan's Task 1 `<action>` block (TTL cache shape, `WHERE "createdAt" IS NOT NULL`, `status ?? "unknown"` coalesce, `buildProjectNameMap`/`resolveProjectName` usage, no `deleted` filter). No changes made to it.
- Task 2's action file was written exactly as specified in the plan (verbatim mirror of `activityRecencyActions.ts`), with no deviation.

## Deviations from Plan

None - plan executed exactly as written (Task 1 verified from a prior session's commit; Task 2 executed fresh in this session).

**Process note (not a code deviation):** The prior executor session died on an API error after committing Task 1 but before starting Task 2. This continuation session began by verifying `fc66c90b`'s content and staged/committed history before proceeding, per the orchestrator's `<completed_state>` instructions. No rework was needed.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths (`lib/server/issueFunnelView.ts`, `app/(dashboard)/access-analysis/issueFunnelActions.ts` both verified via Read/Glob)
- [x] Relevant Dashboard skill/project instructions followed (mirrored existing `activityRecencyActions.ts` pattern verbatim per plan instruction; explicit-path staging verified via `git diff --cached --name-only` before commit)
- [x] Data coverage is truthful and labeled (null-createdAt/null-status handling matches plan `must_haves.truths`; no hardcoded coverage figures introduced)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (no UI touched this plan; guardrails N/A but confirmed untouched)
- [x] Claims backed by command output, source evidence, or marked `VERIFY:` (all claims above cite `git show`/`git log`/`npx tsc --noEmit`/`npx vitest run` output or direct file Reads)

## Next Phase Readiness
- `loadIssueFunnel()` and `loadIssueFunnelAction()` are ready for plan 21-04's client wiring into `ProjectsTabPanel.tsx` / `mainCharts.tsx`'s lazy-fetch-once-per-tab pattern (20.1-06 ref-flag convention) — per `21-CONTEXT.md`'s locked decision, plan 21-04 must NOT add this as a 10th eager `Promise.all` entry.
- No blockers. Plans 21-02/21-03 (chart/transform work presumably consuming `IssueFunnelMonthRow`/`IssueFunnelStatusRow`) can proceed against the exact types verified in this plan's interfaces.

**REQUIREMENTS.md note:** ISSUE-02/ISSUE-03 are intentionally left `Pending` in `.planning/REQUIREMENTS.md`, not marked complete. All 4 plans in this phase (`21-01` through `21-04`) share the same `requirements: [ISSUE-02, ISSUE-03]` frontmatter — the requirement is only genuinely delivered (chart visible, mounted, owner-verifiable) once plan 21-04 (client wiring) ships. Marking it complete after only the server data layer would misrepresent product state; this is a deliberate deviation from the generic "mark plan's requirements complete" instruction, applied per this repo's data-truthfulness/no-overclaiming contract.

---
*Phase: 21-issue-funnel-status-time*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created files verified present on disk (`lib/server/issueFunnelView.ts`,
`lib/server/issueFunnelView.test.ts`, `app/(dashboard)/access-analysis/issueFunnelActions.ts`,
this SUMMARY.md). Both commits (`fc66c90b`, `b2d39428`) verified present in `git log --oneline --all`.
