---
phase: "04"
plan: "G6"
subsystem: users-directory
tags: [perf, ux, caching, virtualization]
status: complete

dependency_graph:
  requires: []
  provides: [all-rows-visible, activity-cache]
  affects: [UsersDirectoryClient, useDirectoryRows, acc-hot-cache, acc-activity-router]

tech_stack:
  added: []
  patterns: [module-private-cached-helper, prewarm-task-list]

key_files:
  created: []
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/useDirectoryRows.ts
    - lib/server/acc-hot-cache.ts
    - lib/server/acc-hot-cache.test.ts
    - server/routers/acc-activity.ts

decisions:
  - Remove shell-level windowing because DataTable already virtualizes via @tanstack/react-virtual; no visible DOM overhead from full row list
  - Cache key uses ACTIVITY_VERSION_SPECS (accActivity + accActivityAccds maxCreatedAt) to invalidate on new ingest without a hard-coded TTL floor
  - FILE_RAW_ACTIONS defined locally in acc-hot-cache.ts as HOT_CACHE_FILE_RAW_ACTIONS (same derivation from CATEGORY_TO_RAW_ACTIONS) to avoid circular dependency on the tRPC router

metrics:
  duration: "~20 min"
  completed: "2026-06-18"
  tasks_completed: 2
  files_changed: 5
---

# Phase 04 Plan G6: Remove /users windowing + cache activity aggregate Summary

Two targeted /users improvements shipped on feat/access-analysis-redesign after live UAT.

## Fix A — Show all rows (no "Show more" button)

**Root cause:** UsersDirectoryClient held a `directoryRenderLimit` state (batch 160) feeding `visibleFiltered` into `useDirectoryRows`, then rendered a "Show N more" button to page through. DataTable already virtualizes with `@tanstack/react-virtual` — the shell window was redundant friction.

**Changes:**
- Removed `DIRECTORY_RENDER_BATCH`, `directoryRenderLimit` state, its reset `useEffect`, and the "Show N more" button from `UsersDirectoryClient.tsx`
- Removed `Button` import (sole consumer was the Show-more button)
- `useDirectoryRows` signature: removed `directoryRenderLimit` param; return value: removed `visibleFiltered`, `visibleGroups`, `renderedDirectoryCount`, `hasMoreDirectoryRows`
- Removed unused `countGroupedItems`/`limitGroupedItems` import from `directoryRenderWindow`
- `rows` useMemo now uses `displayRows` (full filtered+sorted list); DataTable virtualizer handles DOM-level paging transparently
- Perf-logging effect switched to `filtered.length` (not the now-deleted `renderedDirectoryCount`)

## Fix B — Cache activity aggregate for load speed

**Root cause:** `lastFileActivityByEmailAll` ran a raw `GROUP BY` over the ~623k-row `unified_activity` CTE on every SSR prefetch (every /users page load), with no caching. The heavy query blocked the server render.

**Changes:**
- `lib/server/acc-hot-cache.ts`: added `getCachedLastFileActivityByEmailAll(db)` using the module-private `cached<T>()` helper with `ACTIVITY_VERSION_SPECS` as the version fingerprint; added `HOT_CACHE_FILE_RAW_ACTIONS` constant (same derivation as router's `FILE_RAW_ACTIONS`); added task to `prewarmAccHotCache` so cache stays warm between user visits
- `server/routers/acc-activity.ts`: `lastFileActivityByEmailAll` procedure now calls `getCachedLastFileActivityByEmailAll(ctx.db)` instead of the raw `getAllLastUnifiedActivityByEmail`; output shape (`Record<email_lowercase, ISO>`) unchanged
- `lib/server/acc-hot-cache.test.ts`: 3 new tests covering memoisation within TTL, cache invalidation on version change, and prewarm task inclusion

## Deviations from Plan

None — both fixes executed exactly as specified.

## Test Results

- tsc: 0 errors (whole-tree clean)
- Unit suite: 2119 passed (baseline was 2115 + 3 new cache tests + 1 integration test already existed)
- Known pre-existing failures: 2 FolderPermissionTerrain + 7 Playwright e2e under vitest (unchanged)
- repo-map:check: passed (quality gate green)

## Commits

- `bf2af96b` fix(04-G6): remove /users shell windowing — show all rows via DataTable virtualizer
- `5dd53c14` perf(04-G6): cache lastFileActivityByEmailAll to eliminate heavy GROUP BY on every /users load

## Self-Check: PASSED

Files created/modified exist and both commits are present in git log.
