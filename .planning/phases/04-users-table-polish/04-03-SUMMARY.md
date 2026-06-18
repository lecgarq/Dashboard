---
phase: 04-users-table-polish
plan: "03"
subsystem: /users directory shell
tags: [datatable, drillsheet, skeleton, motion, integration-tests, circular-import-fix]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [DataTable-driven /users shell, DrillSheet integration, entrance fade, table skeleton]
  affects: [loading.tsx, UsersDirectoryClient.tsx, UsersTableSkeleton.tsx, PersonAvatar.tsx]
tech_stack:
  added: [DrillSheet, DataTable<DirectoryRow>, motion.div fadeIn facade, UsersTableSkeleton]
  patterns: [virtualized table with count-aware jsdom mock, motion entrance once on mount, single-export avatar component]
key_files:
  created:
    - app/(dashboard)/users/UsersTableSkeleton.tsx
    - app/(dashboard)/users/PersonAvatar.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/loading.tsx
    - app/(dashboard)/users/PersonDetailModal.tsx
    - app/(dashboard)/users/UserProfilePanel.tsx
    - app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx
decisions:
  - DataTable replaces card-grid/list rendering in UsersDirectoryClient; viewMode toggle buttons removed, store field inert (Open Q2 resolved)
  - PersonAvatar extracted to PersonAvatar.tsx to break PersonDetailModal<->UserProfilePanel circular import (repo-map quality gate)
  - "@tanstack/react-virtual mock must be count-aware in jsdom integration tests — dynamic count from opts.count, not static 5"
  - DrillSheet replaces PersonDetailModal without two-panel overlap (RESEARCH Pitfall 5)
  - Pre-sort seam preserved: DataTable receives visibleFiltered from useDirectoryRows; DataTable column sort operates on top (Open Q3 resolved)
metrics:
  duration: 15min
  completed: 2026-06-18
  tasks_completed: 3
  files_changed: 7
status: complete
---

# Phase 04 Plan 03: DataTable Shell + DrillSheet + Integration Tests Summary

DataTable<DirectoryRow> wired into UsersDirectoryClient with row-click→DrillSheet (slide-in panel carrying UserProfilePanel), row-expand→PeekPanel, table-shaped skeleton, calm entrance fade, inline error+retry, filtered-empty state, and 10 integration tests green.

## What Was Built

### Task 1 — UsersTableSkeleton + DataTable wiring (Tasks 1+2 in same shell file)

**`UsersTableSkeleton.tsx`** (new): 5-column header bar + 8 shimmer data rows matching DataTable column widths (Name/Role/Office/Last Active/Projects). Used by both `loading.tsx` (route boundary) and `UsersDirectoryClient.tsx` (inline isLoading fallback).

**`loading.tsx`**: Route-boundary skeleton swapped from card-grid shape to `UsersTableSkeleton` so the ~200ms Suspense fallback matches the real DataTable layout (PERF-01).

**`UsersDirectoryClient.tsx`**: Major refactor:
- `DataTable<DirectoryRow>` replaces `renderPeople`/`PersonCard`/`PersonRowList`/`CollapsibleGroup` card grid and list rendering paths
- `buildDirectoryRows(visibleFiltered, accSummaryMap)` feeds the DataTable (pre-sort seam preserved — Open Q3)
- `USERS_COLUMNS` + `pinnedColumn="name"` + `defaultSort=[{id:"name", desc:false}]`
- `renderExpanded` slot: `<PeekPanel row={r.original} onOpenProfile={() => setSelectedEmail(r.original.email)} />`
- `onRowClick={(r) => setSelectedEmail(r.original.email)}`
- `hasActiveFilter={hasActiveFilters || !!search}` + `onClearFilters={clearAllFilters}`
- `filteredEmptyMessage="No one matches those filters"` / `emptyMessage="No people found..."`
- viewMode toggle buttons removed (LayoutGrid/List icons gone); `viewMode` store field stays inert (Open Q2)
- `groupBy` Select kept (it was already present and the store field is used)

### Task 2 — DrillSheet + motion fade + error/retry

Still in `UsersDirectoryClient.tsx`:
- `motion.div` with `fadeIn`/`useSafeVariants` wraps the outer container (replaces `animate-fade-up` CSS class); fires once on mount only (VIS-03)
- `DrillSheet open={!!selectedEmail} onClose={() => setSelectedEmail(null)}` replaces `PersonDetailModal` — no two-panel overlap (RESEARCH Pitfall 5)
- `UserProfilePanel` dynamically imported via `next/dynamic` ssr:false
- Error state: `!!error &&` guard with heading "Couldn't load the directory" + Retry button calling `utils.users.getOrgDirectory.invalidate()` and `utils.accDcGraph.bulkUsers.invalidate()`

### Task 3 — Integration test update (10 cases)

`UsersDirectoryClient.integration.test.tsx` overhauled:
- **New**: `@tanstack/react-virtual` mock — count-aware (derives virtual items from `opts.count`), avoids `rows[index].getIsExpanded()` on undefined rows when data.length < 5
- **Case 3** (was viewMode toggle): verifies viewMode buttons are gone from DOM
- **Case 5**: row data-cell click → `selectedEmail` set + DrillSheet panel in DOM
- **Case 6**: expand button → PeekPanel renders "See full profile →" inline
- **Case 7** (PERF-04): `bulkUsersQuerySpy` called exactly once with `BULK_USERS_LEAN_INPUT`
- **Case 8**: LastActiveCell renders relative time (Alice, has `lastActivity`) vs "No data" (Bob, null)
- **Case 9**: filter-empty state shows `data-testid="empty-state"` + clear-filters button → clearAllFilters
- Added `lastActivity: "2026-05-01T00:00:00.000Z"` to Alice's project fixture; `lastActivity: null` on Bob's
- All text assertions switched from `screen.getBy*` button lookups to `container.textContent` checks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PersonDetailModal ↔ UserProfilePanel circular import**
- **Found during:** Task 1 shell wiring (exposed when running `npm run repo-map:check`)
- **Issue:** `UserProfilePanel.tsx` imported `PersonAvatar` from `PersonDetailModal.tsx`; `PersonDetailModal.tsx` dynamically imported `UserProfilePanel.tsx` — circular. This was introduced in Plan 02 and broke the repo-map quality gate hard check (`circularImportCount > 0`).
- **Fix:** Created `PersonAvatar.tsx` (standalone). Updated `PersonDetailModal.tsx` to import from `PersonAvatar.tsx` and re-export it for backward compat. Updated `UserProfilePanel.tsx` to import from `PersonAvatar.tsx` directly.
- **Files modified:** `PersonAvatar.tsx` (new), `PersonDetailModal.tsx`, `UserProfilePanel.tsx`
- **Commits:** `27bdd4ee`

**2. [Rule 1 - Bug] @tanstack/react-virtual static mock caused rows[index].getIsExpanded() crash in jsdom**
- **Found during:** Task 3 integration test update
- **Issue:** The static 5-item virtualizer mock returned items for indices 0..4 but the directory fixture only has 2 people — `rows[2]` was `undefined`, causing a crash.
- **Fix:** Made the mock count-aware: `opts.count` drives the number of virtual items returned, so virtual indices never exceed `data.length`.
- **Files modified:** `UsersDirectoryClient.integration.test.tsx`

**3. [Rule 3 - Blocking] `ColumnDef<DirectoryRow, string>[]` not assignable to `ColumnDef<DirectoryRow>[]`**
- **Found during:** TypeScript check after wiring DataTable
- **Issue:** `DataTableProps<T>` declares `columns: ColumnDef<T>[]` (= `ColumnDef<T, unknown>[]`), but `USERS_COLUMNS` is typed `ColumnDef<DirectoryRow, string>[]` — narrower value type is not assignable.
- **Fix:** Cast at the call site: `USERS_COLUMNS as ColumnDef<DirectoryRow>[]`. Standard TanStack Table v8 pattern (known from Phase 03 decision).
- **Files modified:** `UsersDirectoryClient.tsx`

**4. [Rule 3 - Blocking] `error` typed as `unknown` not assignable to `ReactNode`**
- **Found during:** TypeScript check
- **Issue:** `{error && (<div>...)}` — `error: unknown` from the hook causes tsc to complain.
- **Fix:** Changed to `{!!error && ...}` — double-negation coerces to boolean, valid as JSX conditional guard.
- **Files modified:** `UsersDirectoryClient.tsx`

## Known Stubs

None — DataTable is fed from `buildDirectoryRows(visibleFiltered, accSummaryMap)` using real in-memory data; no hardcoded empty values in the rendering path.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Verification Results

- `npx tsc --noEmit` — exits 0 (whole-tree including test files)
- `npx vitest run --exclude "tests/e2e/**"` — 2094 passed / 1 skipped / 2 pre-existing FolderPermissionTerrain failures (above 2015 baseline)
- `npx vitest run "app/(dashboard)/users/__tests__/UsersDirectoryClient.integration"` — 10/10 passed
- `npm run repo-map:check` — "Repo-map quality gate passed" (circular import resolved)
- Scope boundary: `git diff --name-only HEAD~3 HEAD -- "app/(dashboard)/users/access-analysis/" "users/spatial-graph"` returns empty
- No PersonDetailModal import in UsersDirectoryClient: `grep PersonDetailModal` returns only the comment
- No direct framer-motion import: `grep "from \"framer-motion\""` returns nothing

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `UsersTableSkeleton.tsx` exists | FOUND |
| `PersonAvatar.tsx` exists | FOUND |
| `UsersDirectoryClient.tsx` exists | FOUND |
| Commit `65587095` (feat DataTable shell) | FOUND |
| Commit `27bdd4ee` (fix circular import) | FOUND |
| Commit `3a569018` (test 10 cases) | FOUND |
| tsc --noEmit exits 0 | PASS |
| 2094 unit tests pass (≥2015 baseline) | PASS |
| repo-map:check passes | PASS |
