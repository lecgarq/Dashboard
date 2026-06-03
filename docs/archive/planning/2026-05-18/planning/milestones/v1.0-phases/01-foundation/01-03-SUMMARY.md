---
phase: 01-foundation
plan: "03"
subsystem: ui
tags: [react, localStorage, canvas, graph, state-persistence]

# Dependency graph
requires:
  - phase: 01-foundation plan 02
    provides: stable renderer lifecycle, WebGPU/Canvas2D renderer, cache corruption banner
provides:
  - localStorage persistence for zoom/pan state (acc-graph-view)
  - localStorage persistence for filter state (acc-graph-filters) with shape validation
  - Saved filter values validated against current data on load (stale values dropped)
  - 10-second loading timeout overlay with Reload button
  - API error recovery overlay with Try Again button
affects: [02-cosmos, 03-detail-panel, 04-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level helper loadSavedView() for useRef initialization from localStorage"
    - "Debounced localStorage write (300ms) via saveViewTimer ref for pan/zoom events"
    - "useState lazy initializer for filter persistence with shape validation"
    - "useEffect filter validation drops saved values not present in current graph data"
    - "Separate graphQuery.isError overlay rendered before the loading overlay for priority"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx

key-decisions:
  - "loadSavedView() placed at module scope (not inside component) because useRef does not support lazy initialization like useState"
  - "Filter validation useEffect uses eslint-disable-line comment for react-hooks/exhaustive-deps — filterOptions is intentionally omitted from deps since it is derived from graphQuery.data which IS a dep"
  - "API error overlay placed before loading overlay in JSX so z-50 stacking is correct when both conditions could theoretically coincide"
  - "Saved view discarded (localStorage.removeItem) when dataHash changes — user sees fresh auto-fit instead of stale pan/zoom on new data"

patterns-established:
  - "loadSavedView pattern: module-level helper reads/validates localStorage for useRef initial values"
  - "saveView debounce pattern: ref-based setTimeout (not state) for write-on-interaction without re-renders"

requirements-completed: [FOUND-02]

# Metrics
duration: 3min
completed: "2026-04-28"
---

# Phase 01 Plan 03: localStorage Persistence, Timeout & Error Recovery Summary

**localStorage zoom/pan and filter persistence with debounced writes, 10s loading timeout overlay, and API error recovery UI added to AccUsersGraph.tsx**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-28T17:44:45Z
- **Completed:** 2026-04-28T17:47:34Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- View (zoom/pan) persists to `acc-graph-view` in localStorage via debounced writes on pan and wheel events; restored on mount
- Filter state persists to `acc-graph-filters` via lazy useState initializer with shape validation; restored values validated against current graph data on load
- Saved view is discarded when `graph.dataHash` changes so auto-fit runs instead of restoring a stale position
- Loading spinner now shows "Loading graph..." with a 10-second timeout that transitions to "This is taking longer than expected. Try reloading." with a Reload button
- API error recovery shows "Could not load graph data." with a Try Again button that calls `graphQuery.refetch()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist zoom/pan and filter state to localStorage** - `97ea4be` (feat)
2. **Task 2: Add loading timeout overlay and API error recovery UI** - `07f0991` (feat)

**Plan metadata:** _(to be added after final commit)_

## Files Created/Modified
- `app/(dashboard)/users/AccUsersGraph.tsx` - Added loadSavedView helper, view/filter persistence, saveView debounced callback, timeout useEffect, updated spinner JSX, added error overlay

## Decisions Made
- `loadSavedView()` is a module-scope helper because `useRef` does not support lazy initialization — this is the idiomatic pattern for reading from localStorage into a ref
- Filter validation useEffect correctly omits `filterOptions` from deps (it is a derived value from `graphQuery.data` which is included); eslint-disable comment added for clarity
- API error overlay renders before `!isReady` overlay in JSX to establish correct layering priority

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `vitest.setup.ts` (NODE_ENV assignment to read-only property) causes `tsc --noEmit` to exit with code 1. This error predates this plan and is out of scope. All changes in `AccUsersGraph.tsx` compile cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation phase (01) now has: worker lifecycle fix, renderer lifecycle fix, cache corruption banner, position sanitization, b. prefix strip, localStorage persistence, loading timeout, and API error recovery
- Ready for Phase 2 (Cosmos.gl renderer integration) with stable base
- Phase 1 risk still open: production worker build failure (Pitfall 5) — must verify `npm run build && npm start` before merging Phase 1 work

---
*Phase: 01-foundation*
*Completed: 2026-04-28*
