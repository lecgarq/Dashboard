---
phase: 8
plan: 02
subsystem: ui
tags: [canvas, animation, particles, react, typescript]

requires:
  - phase: 8
    plan: 01
    provides: AccUsersGraph canvas rewrite — world-space camera + all users rendered

provides:
  - Particle flow animation along graph edges (2-3 per edge, capped at 1000)
  - Animated pulse rings via performance.now() (no setInterval)
  - Dot grid background rendered per-viewport
  - Selection glow behind selected node
  - 500ms fade-in on canvas container load

affects: [phase-8]

tech-stack:
  added: []
  patterns:
    - "performance.now() for animation timing in RAF loops — no setInterval/setState per frame"
    - "nodeIndexMapRef for O(1) edge-to-node lookups during particle rendering"
    - "Particle system initialized post-simulation, capped at 1000 total across all edges"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx

key-decisions:
  - "Particle color fixed at rgba(139,92,246,0.6) — violet matching edge color, consistently visible"
  - "nodeIndexMapRef built from settled nodes (not rawNodes) — positions match posRef exactly"
  - "isReady state drives opacity transition; set after zoomToFit so graph appears already fitted"

requirements-completed: []

duration: ~20min
completed: 2026-04-23
---

# Phase 8 Plan 02: Particle Animation + Visual Polish Summary

**Canvas particle flow (2-3/edge, capped at 1000), dot grid background, performance.now() pulse rings, selection glow, and 500ms fade-in transition added to AccUsersGraph**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-23T17:30:00Z
- **Completed:** 2026-04-23T17:50:00Z
- **Tasks:** 1/2 complete (Task 2 awaiting human visual verification)
- **Files modified:** 1

## Accomplishments
- Particle interface + `particles` ref initialized post-simulation with 2-3 particles per edge (capped at 1000)
- Each RAF frame advances particles along edges and renders them as violet circles at interpolated world-space positions
- Dot grid background drawn per-viewport (gridSpacing=0.05, dotRadius=0.5/scale)
- Pulse rings for outlier/no-project nodes use `(Math.sin(performance.now() * 0.004) + 1) * 0.5` — no state, no setInterval
- Selection glow: soft fill + white outline ring drawn behind selected node before sprite
- Canvas container `transition-opacity duration-500` with `isReady` flag set after first zoomToFit

## Task Commits

1. **Task 1: Add particle system to canvas render loop** - `0871430` (feat)
2. **Task 2: Visual verification of the complete graph** - PENDING (checkpoint:human-verify)

## Files Created/Modified
- `app/(dashboard)/users/AccUsersGraph.tsx` - Particle system, dot grid, animated pulse rings, selection glow, fade-in

## Decisions Made
- Particle color fixed at `rgba(139,92,246,0.6)` (violet matching edge color) for consistent visibility
- `nodeIndexMapRef` built from post-simulation `settled` nodes so indices align with `posRef` exactly
- `isReady` set after `zoomToFit` completes so graph appears already centered when it fades in

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Awaiting human visual verification (Task 2 checkpoint)
- All canvas animation features implemented and TypeScript compiles clean

---
*Phase: 8*
*Completed: 2026-04-23 (partial — checkpoint pending)*
