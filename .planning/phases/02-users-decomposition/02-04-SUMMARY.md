---
phase: 02-users-decomposition
plan: "04"
subsystem: users-directory
tags: [zustand, state-management, decomposition, USR-01]
status: complete

dependency_graph:
  requires:
    - 02-03  # PersonRow + PersonRowList extraction
  provides:
    - useUsersDirectoryStore (Zustand store for all UI state)
  affects:
    - UsersDirectoryClient.tsx (wired to store, removes ~15 useState calls)

tech_stack:
  added:
    - zustand create<T> (store pattern, already installed in 02-01)
  patterns:
    - Individual selector per field: useUsersDirectoryStore(s => s.filterDept)
    - selectedEmail string key (not OrgPerson object) — store stays serializable
    - Store reset in beforeEach for integration tests (singleton state isolation)

key_files:
  created:
    - app/(dashboard)/users/useUsersDirectoryStore.ts  # 194 lines
    - app/(dashboard)/users/useUsersDirectoryStore.test.ts  # 281 lines
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx  # 1634 lines (was ~1620)
    - app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx

decisions:
  - "selectedEmail is string|null in the store (not OrgPerson); shell resolves via people.find() before passing to PersonDetailModal — keeps store serializable and setter stable"
  - "directoryRenderLimit + perfLoggingEnabled stay as useState in shell (perf flag read once at mount; render limit is purely local render windowing)"
  - "Store reset added to integration test beforeEach — Zustand store is a singleton; without reset, filter state from one test bleeds into the next"
  - "activateEmail in shell is a useCallback wrapper over storeActivateEmail to maintain referential stability for hoverTimers pattern"
  - "setFilterNoProjects call site updated from functional updater to direct value since store setter only accepts boolean"

metrics:
  duration_minutes: 7
  completed_date: "2026-06-17"
  tasks_total: 3
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 02 Plan 04: Zustand Store for /users Directory UI State Summary

Move all filter / search / sort / viewMode / selection state out of ~15 `useState` calls in `UsersDirectoryClient.tsx` into `useUsersDirectoryStore` (Zustand), replacing `selectedPerson: OrgPerson` with a stable `selectedEmail: string` key.

## What Was Built

**useUsersDirectoryStore.ts** (194 lines) — Zustand store created with `create<UsersDirectoryState>`:
- All UI state: search/debouncedSearch/viewMode/groupBy/10 dropdown filters/statusFilter/projectAdminFilter/activitySort/selectedEmail/activityEmail/activatedEmails
- Composite actions: `clearAllFilters` (resets all 10 filters + search/debouncedSearch), `cycleActivitySort` (off→desc→asc→off), `activateEmail` (idempotent), `applyModuleFilterFromSidePanel`
- No refs, trpc.useUtils, or debounce timers — those stay in the shell

**useUsersDirectoryStore.test.ts** (281 lines) — 18 unit tests covering:
- Initial state matches monolith defaults
- All individual setters
- `clearAllFilters` resets all 10 filters + search + debouncedSearch
- `cycleActivitySort` three-state cycle
- `activateEmail` idempotency (same Set reference on no-op)
- `applyModuleFilterFromSidePanel` including empty-tier→null coercion

**UsersDirectoryClient.tsx wired to store**:
- ~15 useState declarations replaced with individual Zustand selectors
- `selectedPerson: OrgPerson` replaced with `selectedEmail: string | null`; object resolved in shell via `people.find()` before PersonDetailModal
- `PersonCard onClick` and `PersonRowList onPersonClick` call `setSelectedEmail(person.email)`
- `clearAllFilters`, `cycleActivitySort`, `applyModuleFilterFromSidePanel` delegate to store actions
- `handleSearchChange` stays in shell (owns `debounceTimer` ref); calls `setSearch`/`setDebouncedSearch` store actions
- `trpc.useUtils`, `hoverTimers` ref, `handleRowHoverEnter/Leave`, `openActivitySheet` remain in shell
- `directoryRenderLimit` and `perfLoggingEnabled` remain as `useState` (not store state)
- `selectedEmail` is **absent** from the `directoryRenderLimit` reset effect deps (Pitfall 2 compliance)

## Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASSED (exit 0) |
| Store unit test (18 cases) | PASSED |
| Golden-path integration test (7 cases) | PASSED |
| Full suite | 2030 pass / 2 pre-existing fail / 1 skip (baseline was 2012 pass) |
| Scope guard (plan commits) | CLEAN — no users/access-analysis or users/spatial-graph files touched |

Shell line count: 1634 lines (after wiring)
Full suite test count: 2030 (+ 18 from new store tests vs 2012 baseline)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zustand store state bleeding between tests**
- **Found during:** Task 2 verification
- **Issue:** Zustand store is a module-level singleton. State set in one test (e.g., `debouncedSearch = "Alice"`) persisted into the next test, causing "1 of 2 people" (filtered) at test start instead of both people visible.
- **Fix:** Added `useUsersDirectoryStore.setState({...defaults})` call in `beforeEach` of the integration test. This mirrors what `useState` gave for free (each component mount had fresh state).
- **Files modified:** `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
- **Commit:** `7dd694d`

**2. [Rule 1 - Bug] setFilterNoProjects functional updater incompatible with store type**
- **Found during:** Task 2 tsc gate
- **Issue:** One usage `setFilterNoProjects((prev) => !prev)` expected a functional updater; the store setter accepts `boolean` only.
- **Fix:** Changed call to `setFilterNoProjects(!filterNoProjects)` — the current value is already available in the closure via the selector, so functional updater is not needed.
- **Files modified:** `app/(dashboard)/users/UsersDirectoryClient.tsx`
- **Commit:** `7dd694d`

## Known Stubs

None — all state is wired from the store to the same rendering logic.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| app/(dashboard)/users/useUsersDirectoryStore.ts | FOUND |
| app/(dashboard)/users/useUsersDirectoryStore.test.ts | FOUND |
| .planning/phases/02-users-decomposition/02-04-SUMMARY.md | FOUND |
| Commit ace90c1 (store + unit test) | FOUND |
| Commit 7dd694d (shell wiring + test fix) | FOUND |
