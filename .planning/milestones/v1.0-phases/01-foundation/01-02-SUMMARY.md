---
phase: 01-foundation
plan: "02"
subsystem: graph-renderer
tags: [renderer-lifecycle, cache-corruption, ui-banner, localStorage]
dependency_graph:
  requires: []
  provides: [renderer-destroy-lifecycle-documented, cache-corruption-banner]
  affects: [AccUsersGraph.tsx]
tech_stack:
  added: []
  patterns: [useState-lazy-initializer, localStorage-persistence, absolute-positioned-banner]
key_files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
decisions:
  - "Null activeRendererRef before destroy() — order confirmed correct, comment added to document intent"
  - "positionCacheCorrupt state initialized from localStorage so banner survives page reload"
  - "Detection block placed after readPrecomputedPositions call, not in onSuccess callback, so re-detection runs on refetch"
  - "Banner uses position:absolute z-40 so graph still renders beneath it during corrupt state"
metrics:
  duration_minutes: 1
  completed_date: "2026-04-28"
  tasks_completed: 2
  files_modified: 1
---

# Phase 1 Plan 02: Renderer Destroy Lifecycle + Cache Corruption Banner Summary

Renderer cleanup order confirmed correct with explanatory comment (FOUND-02); localStorage-backed cache corruption banner wired to readPrecomputedPositions null return with Rebuild Cache button (FOUND-04).

## What Was Built

### Task 1: Renderer Destroy Lifecycle Audit (FOUND-02)

Verified the existing renderer `useEffect` cleanup already has the correct null-guard order:
- `activeRendererRef.current = null` is set BEFORE `canvasRendererRef.current?.destroy()`
- RAF loop already has `if (!renderer) return` null-guard at top
- `cancelAnimationFrame(rafId.current)` is in the RAF useEffect cleanup

Added an explanatory comment documenting the intentional ordering so future developers understand why null is assigned before destroy is called — this is the critical defense against the race condition where a RAF frame fires between `cancelAnimationFrame` and `destroy()` completing.

The `refreshKey` state (line 219) already correctly handles graph re-initialization: it starts at 0 each mount, and the existing "Rebuild Graph Cache" button increments it via `setRefreshKey((value) => value + 1)` when needed.

### Task 2: Cache Corruption Banner State and UI (FOUND-04)

Added `positionCacheCorrupt` state with a lazy initializer that reads from `localStorage` on first render — this ensures the banner persists across page reloads without requiring a round-trip to the server.

Detection block was added immediately after the `readPrecomputedPositions` call in the graph data `useEffect`. Logic:
- `hasCachedPositions`: positions array is non-empty (cache was stored)
- `cacheIsCorrupt`: positions existed but `readPrecomputedPositions` returned null (NaN/Infinity detected)
- Sets/removes `"acc-graph-cache-corrupt"` in localStorage and syncs state

Banner JSX is rendered as `position: absolute` at the top of the canvas container (z-40), allowing the graph to render beneath it while the banner is visible. The Rebuild Cache button:
- Is disabled while `rebuildGraph.isPending`
- Calls `rebuildGraph.mutate(undefined, { onSuccess: () => graphQuery.refetch() })`
- Clearing the corrupt flag is handled by re-detection in the data useEffect after refetch resolves

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f933aa7 | fix(01-02): document renderer destroy lifecycle order (FOUND-02) |
| 2 | 1f47f12 | feat(01-02): wire cache corruption banner state and UI (FOUND-04) |

## Deviations from Plan

None - plan executed exactly as written. The null-guard order was already correct (as the plan anticipated), so only the explanatory comment was added.

## Success Criteria Verification

- [x] FOUND-02: Renderer cleanup order confirmed correct with explanatory comment (line 490-493)
- [x] FOUND-04: Cache corruption detected from readPrecomputedPositions null return (lines 595-603), persisted in localStorage, banner shown with Rebuild Cache button (lines 923-944)
- [x] Banner persists across page reloads (localStorage-backed via lazy initializer at line 219-222)
- [x] Rebuild Cache button is disabled during mutation (rebuildGraph.isPending) and triggers refetch on success
- [x] TypeScript compiles cleanly (only pre-existing vitest.setup.ts error unrelated to this file)

## Self-Check: PASSED

- app/(dashboard)/users/AccUsersGraph.tsx: FOUND
- Commit f933aa7: FOUND
- Commit 1f47f12: FOUND
