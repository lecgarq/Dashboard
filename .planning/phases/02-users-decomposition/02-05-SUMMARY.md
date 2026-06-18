---
phase: 02-users-decomposition
plan: "05"
subsystem: users-directory
tags: [usersDirectory, dataHook, PERF-03, USR-01, tRPC, hydration]
dependency_graph:
  requires:
    - "02-04"  # Zustand store (useUsersDirectoryStore)
    - "02-03"  # PersonRow/PersonRowList extraction
    - "02-02"  # Sub-components extraction
    - "02-01"  # Store primitives + golden-path test
  provides:
    - "useUsersDirectoryData hook"
    - "BULK_USERS_LEAN_INPUT shared constant"
    - "PERF-03 unit test with referential-identity assertion"
  affects:
    - "03-xx"  # DataTable phase will read from useUsersDirectoryData
    - "UsersDirectoryClient.tsx"  # Shell now consumes the hook
    - "acc-route-hydration.ts"  # Prefetch now imports shared constant
tech_stack:
  added:
    - "useUsersDirectoryData hook (new file)"
    - "useUsersDirectoryData.test.ts (new file)"
  patterns:
    - "Referentially-stable shared query-input constant (PERF-03 pattern)"
    - "Data-hook consolidation: 8 tRPC queries + all derivations in one hook"
    - "vi.hoisted() spy pattern for hook-level unit assertions"
key_files:
  created:
    - "app/(dashboard)/users/useUsersDirectoryData.ts"
    - "app/(dashboard)/users/useUsersDirectoryData.test.ts"
  modified:
    - "app/(dashboard)/users/UsersDirectoryClient.tsx"
    - "lib/server/acc-route-hydration.ts"
decisions:
  - "BULK_USERS_LEAN_INPUT exported at module scope; imported by both hook and prefetch — structural PERF-03 fix"
  - "listInvitations kept with enabled:false; bulkAccSummary dcEmpty gate preserved bug-for-bug"
  - "Activity-sort infinite query, auto-fetch effect, and filter memos remain in shell (depend on store state)"
  - "Scope guard: working-tree files under users/access-analysis are pre-existing uncommitted WIP, not regressions"
metrics:
  duration: "7m"
  completed: "2026-06-17"
  tasks_completed: 3
  files_changed: 4
status: complete
---

# Phase 02 Plan 05: useUsersDirectoryData + PERF-03 Fix Summary

## One-liner

Consolidated 8 tRPC queries + all derivations into `useUsersDirectoryData`; PERF-03 double-fetch eliminated by construction via shared `BULK_USERS_LEAN_INPUT` constant imported by both the client hook and the SSR prefetch in `acc-route-hydration.ts`.

## What Was Built

### Task 1: Create useUsersDirectoryData with BULK_USERS_LEAN_INPUT (commit e345838)

Created `app/(dashboard)/users/useUsersDirectoryData.ts` — a new `"use client"` hook that:

- Exports `BULK_USERS_LEAN_INPUT = { leanProjects: true } as const` at module scope
- Moves all 8 main-body tRPC queries from the shell: `bulkUsers`, `bulkAccSummary`, `enrichedUsers`, `listInvitations`, `accActivity.getCoverage`, `accFolders.getCoverage`, `getOrgDirectory`, `getDirectory`
- Preserves all query options verbatim: `enabled:false` on `listInvitations`, `dcEmpty` gate on `bulkAccSummary`
- Consolidates all derivations: `accSource`, `accSummary`, `people`, `isLoading`, `accSummaryMap`, `mergedAccUsers`, `noProjectsCount`, `usingFallbackDirectory`, `directoryBanner`, `error`, `enrichedLoading`, `coverage`, `invitationsQuery`, and option lists `departments`/`jobTitles`/`costCenters`/`accProjects`/`accRoles`/`accModules`
- tsc 0 after creation

### Task 2: Wire shell + prefetch to shared constant (commit 1dd6235)

Modified `UsersDirectoryClient.tsx`:
- Replaced 8 inline tRPC calls + derivation blocks (~228 lines) with a single `useUsersDirectoryData()` destructure
- Shell line count: 1,634 → 1,438 (196 lines removed)
- Activity-sort infinite query + auto-fetch effect + `orderedActivityEmails` kept in shell
- Filtering memos (`filtered`/`displayRows`/`groups`) kept in shell
- Removed now-unused imports: `ACC_SNAPSHOT_STALE_TIME_MS`, `mapFallbackDirectoryToOrgPeople`, `mergeAccSummaryWithEnrichment`, `mergePeopleWithAccSummary`, `selectAccSummarySource`, `uniqueSorted`, `LocalDirectoryUser`, `ViewMode`
- Added `useUsersDirectoryData` import

Modified `lib/server/acc-route-hydration.ts`:
- Imports `BULK_USERS_LEAN_INPUT` from the hook
- Passes it to `helpers.accDcGraph.bulkUsers.prefetch(BULK_USERS_LEAN_INPUT, snapshotOptions)`
- Golden-path 7/7 green; tsc 0

### Task 3: PERF-03 unit assertion + parity + repo-map ratchet (commit 65d40d8)

Created `app/(dashboard)/users/useUsersDirectoryData.test.ts` with 5 test cases:

| Case | Assertion |
|------|-----------|
| 1 | `bulkUsers.useQuery` called with `{ leanProjects: true }` (deep equal) |
| 2 | Argument `toBe(BULK_USERS_LEAN_INPUT)` — referential identity (PERF-03 core) |
| 3 | Exactly one `bulkUsers.useQuery` call per render |
| 4 | `listInvitations.useQuery` called with `enabled: false` |
| 5 | `bulkAccSummary.useQuery` called with `enabled: false` when DC data is present |

Case 2 is the PERF-03 gate: `toBe` checks referential identity, not deep equality, so a fresh inline literal `{ leanProjects: true }` fails the test — catching the exact regression that caused the hydration-cache miss.

Full suite results:
- **2035 pass / 1 skip / 2 pre-existing FolderPermissionTerrain failures** (NOT new)
- Baseline was 2030 pass; +5 new PERF-03 tests raised count to 2035
- tsc 0; `repo-map:check` PASSED (no re-introduced fetch surface)

## Scope Guard

`git diff --name-only HEAD~3 HEAD | grep "users/access-analysis"` → empty (commits scope clean).

Working-tree shows `users/access-analysis` modifications but these are **pre-existing uncommitted WIP** from a concurrent session (documented in MEMORY.md `project_acc_redesign_wip_in_working_tree.md`). Zero scope violations in our commits.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The hook wires real data from all 8 tRPC queries.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced.

## Metrics

- Shell line count: 1,634 → 1,438 (−196 lines)
- New hook: 417 lines (including all 8 queries + derivations + return shape)
- New test file: 206 lines (5 PERF-03 cases)
- Full suite: 2035 pass / 1 skip / 2 pre-existing fails
- repo-map:check: PASSED
- Duration: ~7m

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `app/(dashboard)/users/useUsersDirectoryData.ts` | FOUND |
| `app/(dashboard)/users/useUsersDirectoryData.test.ts` | FOUND |
| commit e345838 (Task 1) | FOUND |
| commit 1dd6235 (Task 2) | FOUND |
| commit 65d40d8 (Task 3) | FOUND |
