---
phase: 8
plan: 1
subsystem: ui
tags: [canvas, requestAnimationFrame, world-space-camera, force-directed-graph, spatial-grid]

requires:
  - phase: 7
    provides: AccUsersGraph SVG implementation + BulkAccUser type + buildGraph/runSimulation helpers

provides:
  - Canvas-based AccUsersGraph with world-space camera, lerped pan/zoom, all users rendered
  - createCircleSprite pattern for pre-rendered node sprites
  - Spatial grid hit-testing for O(1) pointer hit detection
  - zoomToFit() fitting all [0,1] normalized positions to viewport with 75% padding

affects: [users-tab, acc-analysis, acc-users-graph-tab]

tech-stack:
  added: []
  patterns:
    - "World-space [0,1] normalization after force simulation — positions independent of canvas pixel size"
    - "Lerped view/targetView refs — smooth camera without React state re-renders"
    - "createCircleSprite — pre-rendered off-screen canvas per color, drawn with drawImage"
    - "Spatial grid keyed by floor(pos/cellSize) — O(1) hit testing at any zoom level"
    - "Controls backed by useRef + setState — render loop reads refs, buttons toggle both"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx

key-decisions:
  - "Canvas chosen over SVG for graph — eliminates viewport clipping, enables requestAnimationFrame animation loop"
  - "4000x4000 virtual simulation space — no bounds clamping, nodes spread freely; normalized to [0,1] after"
  - "ALL users rendered including found===false — grey '?' nodes prevent missing-user bug"
  - "Controls stored in useRef — render loop reads without React re-renders; useState only for button highlight"
  - "Edge batching by color with viewport culling — single beginPath per color group for 60fps at 150+ nodes"

requirements-completed: []

duration: 3min
completed: 2026-04-23
---

# Phase 8 Plan 1: Canvas Rendering Engine + World-Space Camera Summary

**Full canvas rewrite of AccUsersGraph: requestAnimationFrame render loop with world-space [0,1] camera, pre-rendered sprites, spatial grid hit-testing, and all users rendered including uncached (found===false) grey nodes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-23T17:43:07Z
- **Completed:** 2026-04-23T17:46:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced 890-line SVG graph with ~680-line canvas renderer modeled on LodGraphCanvas
- Eliminated all three critical bugs: missing users (filter), viewport clipping (SVG transform), no animation loop (SVG static)
- Implemented world-space camera with lerped view/targetView refs — smooth pan/zoom at 60fps
- ALL users render as nodes: found===false users appear as grey "?" circles instead of being filtered out
- Zero new npm dependencies — pure Canvas2D API

## Task Commits

1. **Task 1: Canvas rewrite AccUsersGraph** - `6e61b8c` (feat)

## Files Created/Modified

- `app/(dashboard)/users/AccUsersGraph.tsx` - Full canvas rewrite (SVG removed, ~680 lines)

## Decisions Made

- Used 4000x4000 virtual simulation space then normalized positions to [0,1] — this ensures the camera system (not pixel bounds) controls all layout, eliminating the Math.max/Math.min clamp bug that crushed nodes to edges
- Controls state split: `useRef` for values the render loop reads every frame, `useState` only for button active-highlight in React — avoids triggering re-renders from the animation loop
- Edge batching with `beginPath` per color group instead of per-edge — key for 60fps with 150+ user nodes and 20+ role nodes
- Tooltip uses absolute `<div>` overlay with `tooltipRef.current.style.transform` for position updates — same pattern as LodGraphCanvas, avoids React re-renders on every pointer move

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

The plan specified all architectural decisions explicitly. The only additional implementation detail was adding `USER_COLOR_NOT_FOUND = "#6b7280"` as a named constant (plan described grey but didn't give the hex) and adding a "Not Cached" legend entry for the grey nodes.

---

**Total deviations:** 0
**Impact on plan:** Plan executed as specified.

## Issues Encountered

None — TypeScript compiled clean on first attempt (zero errors).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Canvas renderer complete and committed on `deploy` branch
- Ready for Plan 8.2 (next plan in phase 8)
- The BulkAccUser interface and AccUsersGraphProps are unchanged — no consumer changes needed

## Self-Check

- [x] `app/(dashboard)/users/AccUsersGraph.tsx` exists — FOUND
- [x] Commit `6e61b8c` exists — FOUND
- [x] TypeScript: `npx tsc --noEmit` returned zero errors
- [x] No `filter(u => u.found)` on user node creation — confirmed removed
- [x] No `Math.max/Math.min` bounds clamping in `runSimulation` — confirmed removed
- [x] `view` and `targetView` refs present with lerp in render loop — confirmed
- [x] `zoomToFit()` implemented using canvas clientWidth/clientHeight and 0.75 padding factor
- [x] `requestAnimationFrame` loop in `useEffect` with cleanup `cancelAnimationFrame`

## Self-Check: PASSED

---
*Phase: 8*
*Completed: 2026-04-23*
