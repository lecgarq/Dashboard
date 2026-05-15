---
phase: 08-dc-per-module-ingest-permission-csvs
plan: "09"
subsystem: dc-pipeline
tags:
  - dc-ingest
  - cold-start
  - project-discovery
  - gap-closure
dependency_graph:
  requires:
    - 08-06 (dcIngest orchestrator)
    - 08-03 (dcProgressiveBackfill / planDailySlice)
  provides:
    - DC8-GAP-01 closure (cold-start seeding)
    - DC8-13 incremental discovery on every run
  affects:
    - lib/acc/dcIngest.ts (orchestrator now runs discovery before planDailySlice)
    - RUNBOOK.md (env-var requirements documented)
tech_stack:
  added:
    - lib/acc/dcProjectDiscovery.ts (new pure module)
    - scripts/dev/verify-08-09-discovery.cjs (static assertion harness)
  patterns:
    - TDD RED → GREEN (test-first, then implement)
    - I/O injection (fetchImpl parameter for testability)
    - Fail-fast env-var guard before any APS call
    - Local filter after server fetch (server filter is misleading)
key_files:
  created:
    - lib/acc/dcProjectDiscovery.ts
    - lib/acc/dcProjectDiscovery.test.ts
    - scripts/dev/verify-08-09-discovery.cjs
  modified:
    - lib/acc/dcIngest.ts (discovery wired before planDailySlice)
    - lib/acc/dcIngest.test.ts (vi.mock discovery + env vars in beforeEach)
    - .planning/phases/08-dc-per-module-ingest-permission-csvs/RUNBOOK.md
decisions:
  - "Separate module for discovery: legacy script listProjectAdminProjects was a
     standalone 20-line function with no test coverage. Extracting to its own file
     (dcProjectDiscovery.ts) enables isolated Vitest coverage via fetchImpl injection
     and gives the orchestrator a clean import boundary."
  - "Local filter (not server filter): APS Admin v1 filter[accessLevel]=projectAdmin
     returns projectAdmin OR projectMember. Filtering locally on
     accessLevels.projectAdmin === true (ported faithfully from legacy script comment)
     ensures only genuinely admin projects are seeded — prevents submitting DC
     requests that would 403 with 'Invalid user access level'."
  - "Fail-fast vs silent-skip for missing env vars: plan spec required explicit
     AccDcIngestRun row with status='failed' and errorMessage listing the missing
     vars. Silent skip would leave status='success' with 0 slices — same symptom
     as the original cold-start bug, harder to diagnose."
  - "Discovery on every run (not just cold start): DC8-13 requires detecting
     newly-added admin projects. Running discoverAdminProjects on every call is
     1-2 HTTP requests (cheap) and upsert({ update:{} }) is a safe no-op for
     already-known projects."
  - "get2LegToken in dcProjectDiscovery.ts (not aps-oauth.ts): aps-oauth.ts is
     3-leg only (memory note: 2-leg permanently blocked for DC submission). The
     discovery token scope (account:read data:read) is different from DC scopes.
     Keeping it co-located with discoverAdminProjects makes the dependency explicit."
  - "dcIngest.test.ts update (minimal): vi.mock('./dcProjectDiscovery') at module
     scope + upsert mock on PrismaMock + env vars in beforeEach/afterEach. No test
     logic was changed — the existing 6 tests still cover exactly the same branches."
metrics:
  duration: "~12 minutes"
  completed_date: "2026-05-15"
  tasks_completed: 3
  files_changed: 6
---

# Phase 8 Plan 09: DC8-GAP-01 Cold-Start Discovery Closure Summary

DC8-GAP-01 closed: pure `discoverAdminProjects` module (APS Admin v1, pagination, local projectAdmin filter, I/O-injected) + orchestrator integration seeding `AccDcBackfillProgress` on cold start and every subsequent run.

## Why Discovery Had to Be Its Own Module

The legacy script (`scripts/dc-ingest-where-i-admin.cjs:128-147`) had `listProjectAdminProjects` as an inline async function — untestable, no mocking seam. The orchestrator (`dcIngest.ts`) is already 620 lines; adding a second embedded discovery function would have made unit testing impossible without a real APS endpoint.

Extracting to `lib/acc/dcProjectDiscovery.ts` (pure, I/O-injected via `fetchImpl`) gives us 6 Vitest cases covering pagination, local filter, and all error paths in ~50ms. The orchestrator's import line is the clean integration point.

## The Local-Filter Decision

APS Admin v1 has a `filter[accessLevel]=projectAdmin` query parameter. Based on the legacy script's comment (which was battle-tested against real production data): this server-side filter returns projects where the user has **projectAdmin OR projectMember** access. Trusting it would seed 100+ projects into `AccDcBackfillProgress` only to receive APS 403 "Invalid user access level" on DC submission for every non-admin project.

The fix: collect ALL pages, then filter locally on `p?.accessLevels?.projectAdmin === true`. This matches exactly what the legacy script did in production.

## Fail-Fast vs Silent-Skip

The plan required fail-fast with a persisted error row (not a silent return). The original DC8-GAP-01 bug _was_ a silent success — `planDailySlice([])` returned 0 slices and the orchestrator wrote `status='success'` with `projectsProcessed=0`. The same symptom would appear if missing env vars caused a silent return. The fix writes a real `status='failed'` row with an actionable `errorMessage` so the `SyncFreshnessPill` turns red and the operator has a clear diagnostic.

## dcIngest.test.ts Updates

The existing 6 dcIngest tests exercised: kill-switch, concurrent-run skip, stale-lock reclaim, and empty-plan success. After the orchestrator change, all four paths pass through the discovery section. Updates were minimal:

1. `vi.mock('./dcProjectDiscovery')` at module top — mocks `get2LegToken` and `discoverAdminProjects` to return `('mock-2leg-token', [])`.
2. `upsert: vi.fn()` added to `PrismaMock.accDcBackfillProgress` (+ interface update for TypeScript).
3. `beforeEach` / `afterEach` set/restore the 4 required discovery env vars.

Zero test logic changed. All 12 tests (6 discovery + 6 orchestrator) pass green.

## DC8-GAP-01 Closure Confirmation

Verification report's `fix_direction` specified: port `listProjectAdminProjects` into a testable pure module and wire it into the orchestrator before `planDailySlice`. This plan delivers exactly that:

- Cold start (empty `AccDcBackfillProgress`) → discovery runs → upserts rows with `newProjectFlag=true` → `planDailySlice` sees non-zero progress → real slices returned → `executePlan` runs.
- Missing env vars → explicit `status='failed'` row (not silent 0-slice success).
- Incremental runs → discovery detects newly-added admin projects → upserted with `newProjectFlag=true` (DC8-13 reinforced).
- Unit verification: 6/6 dcProjectDiscovery tests + 6/6 dcIngest tests + tsc clean + 8/8 static assertions.

Manual cold-start simulation (DELETE all `AccDcBackfillProgress` rows → run `node scripts/dc-daily-ingest.cjs`) is deferred to Luis per the plan's UAT.md follow-up.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: lib/acc/dcProjectDiscovery.ts
- FOUND: lib/acc/dcProjectDiscovery.test.ts
- FOUND: scripts/dev/verify-08-09-discovery.cjs
- FOUND commit 4a9edc0: test(08-09): RED — discovery module test scaffold
- FOUND commit 8511d8e: feat(08-09): GREEN — implement dcProjectDiscovery and wire cold-start seeding into dcIngest
- FOUND commit a6db8fa: fix(08-09): add verifier + RUNBOOK env-var docs for cold-start discovery
