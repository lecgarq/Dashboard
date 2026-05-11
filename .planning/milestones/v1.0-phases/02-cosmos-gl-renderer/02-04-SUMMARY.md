---
phase: 02-cosmos-gl-renderer
plan: "04"
subsystem: ui
tags: [lasso, polygon-selection, multi-select, cosmos-gl, canvas2d, ray-casting, svg-overlay]

# Dependency graph
requires:
  - phase: 02-cosmos-gl-renderer
    provides: "frame.highlightSet dim/bright pipeline (02-03), Cosmos GPU physics path with getPointPositions/spaceToScreenPosition (02-05)"
provides:
  - "Renderer-agnostic freeform polygon multi-select tool (Lasso toolbar toggle, SVG drag overlay, ray-cast hit-test, multi-select side panel summarizing role/module composition)"
  - "pointInPolygon(px, py, poly) ray-casting helper in cosmosUtils.ts"
  - "spaceToScreen / getPointPositionsArray proxies on CosmosGraphRenderer for forward-projection hit-tests"
affects: [03-graph-ui-completion, 04-access-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-project nodes to screen-space for hit-testing (replaces inverse-view-transform-on-polygon pattern) — robust across Canvas2D and Cosmos GPU-physics renderers"
    - "Renderer-agnostic selection: keep polygon in screen space, project each node's world position forward, then ray-cast — avoids per-renderer inverse-transform pitfalls"

key-files:
  created:
    - "app/(dashboard)/users/cosmosUtils.test.ts (vitest for pointInPolygon)"
  modified:
    - "app/(dashboard)/users/cosmosUtils.ts (pointInPolygon export)"
    - "app/(dashboard)/users/AccUsersGraph.tsx (Lasso toolbar toggle, SVG overlay, polygon selection state, multi-select side panel, forward-project hit-test)"
    - "app/(dashboard)/users/graphRenderers.ts (spaceToScreen + getPointPositionsArray proxies on CosmosGraphRenderer)"

key-decisions:
  - "Keep polygon in SCREEN space and forward-project each node's world position — replaces brittle inverse-view-transform pattern; works identically in Canvas2D and Cosmos GPU-physics modes"
  - "Selection stays renderer-agnostic — explicitly NOT using Cosmos's built-in selectPointsInRange so Canvas2D path behaves identically"
  - "Polygon hit-test reuses existing frame.highlightSet pipeline from 02-03 — no new render path"

patterns-established:
  - "Forward-project for hit-test: query renderer for current point positions (posRef in Canvas2D, getPointPositions() in Cosmos), then map through screen transform — single code path for both renderers"

requirements-completed: []

# Metrics
duration: ~2h (across two sessions; tasks 1-3 + fix 1f47874 + human-verify checkpoint)
completed: 2026-04-29
---

# Phase 2 Plan 04: Lasso/Polygon Multi-Select Summary

**Renderer-agnostic freeform lasso multi-select with screen-space ray-cast hit-testing and a role/module composition side panel — works identically in Canvas2D and Cosmos GPU-physics modes.**

## Performance

- **Duration:** ~2h (tasks 1-3 + 1 forward-project fix + human-verify gate)
- **Started:** 2026-04-29 (Tasks 1-3 session)
- **Completed:** 2026-04-29T22:53:43Z
- **Tasks:** 4 (3 implementation + 1 human-verify checkpoint)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Lasso toolbar toggle with cursor crosshair and pan/zoom suspension during draw
- SVG overlay live-traces freeform polygon during pointer drag
- Polygon-close fires renderer-agnostic node selection via screen-space ray-cast
- Multi-select side panel summarizes selection: count, top 5 roles, top 10 modules, sample 10 user ids
- "Clear selection" button cleanly resets state and re-arms tool
- Selected nodes emphasized in both renderers via existing `frame.highlightSet` pipeline (no new render path)
- Forward-project hit-test pattern works across Canvas2D (`posRef.current` + `view.current`) and Cosmos GPU-physics (`getPointPositions()` + `spaceToScreenPosition()`)

## Task Commits

1. **Task 1: pointInPolygon helper + unit test** — `ea705da` (feat) — 7 vitest cases pass
2. **Task 2: Lasso toolbar toggle + SVG overlay** — `b5f52b2` (feat)
3. **Task 3: Polygon-close → selection → side panel** — `830ad08` (feat)
4. **Mid-checkpoint fix: forward-project nodes to screen for polygon test** — `1f47874` (fix) — see Deviations
5. **Task 4: Human verification — lasso end-to-end** — User signed off "approved" after all 6 manual checks pass on 500+ node hub

**Plan metadata:** `<this commit>` (docs: close lasso plan, log Canvas2D-removal debt)

## Files Created/Modified

- `app/(dashboard)/users/cosmosUtils.ts` — added `pointInPolygon(px, py, poly)` ray-cast helper
- `app/(dashboard)/users/cosmosUtils.test.ts` (NEW) — 7 vitest cases (containment, edges, degenerate, winding-independence)
- `app/(dashboard)/users/AccUsersGraph.tsx` — Lasso state + toolbar button + SVG overlay + polygon selection + multi-select side panel + Clear button + forward-project hit-test
- `app/(dashboard)/users/graphRenderers.ts` — `spaceToScreen` + `getPointPositionsArray` proxies on CosmosGraphRenderer (enables forward-project on GPU-physics path)

## Decisions Made

- **Screen-space polygon + forward-project nodes** instead of world-space polygon + inverse-transform — robust to the dual-renderer state mismatch (Canvas2D's `view.current` vs Cosmos's internal camera; `posRef` seed-only in GPU mode vs Cosmos's GPU-side positions)
- **Renderer-agnostic selection** — explicitly NOT using Cosmos's `selectPointsInRange` so Canvas2D fallback behaves identically
- **Reuse `frame.highlightSet` pipeline** from 02-03 — no new render path needed; dim/bright batching emphasizes selected nodes in both renderers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inverse-view-transform of polygon failed in Cosmos GPU-physics mode (panel never opened)**
- **Found during:** Task 4 (human verification — first run revealed panel never appeared)
- **Issue:** Plan said "translate each polygon screen-space point to world coords (mirror existing inverse-view transform near line 920)" and test against `posRef.current`. Two stacking failures in Cosmos GPU-physics mode:
  1. `view.current` is the Canvas2D camera, stale relative to Cosmos's own camera — polygon vertices landed in the wrong region
  2. `posRef.current` holds only seed positions in GPU-physics mode (Cosmos moved the points on the GPU after `start()`); world-space hit-test against stale positions returned zero matches → `matchedIndices.length === 0` → side panel never opened
- **Fix:** Inverted the strategy. Keep polygon in SCREEN space; forward-project each node to screen, then ray-cast.
  - Canvas2D path: forward-project `posRef` using `view.current`
  - Cosmos path: query Cosmos's own `getPointPositions()` and map each through `spaceToScreenPosition()` via two new proxies (`spaceToScreen`, `getPointPositionsArray`) on `CosmosGraphRenderer`
- **Files modified:** `app/(dashboard)/users/AccUsersGraph.tsx`, `app/(dashboard)/users/graphRenderers.ts`
- **Verification:** All 6 manual checks pass after fix on 500+ node hub; user approved.
- **Committed in:** `1f47874`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug surfaced only in Cosmos GPU-physics mode after 02-05 changed the source-of-truth for node positions from worker-thread `posRef` to GPU-side `getPointPositions()`. Fix is renderer-agnostic and is now the cleaner pattern (no inverse-transform pitfall). No scope creep.

## Issues Encountered

- See deviation #1 above (panel never opened on first run; resolved by forward-project pattern). No other issues.

## TECHNICAL_DEBT

### TD-007: Remove vestigial Canvas2D renderer branch
- **Location:** `app/(dashboard)/users/AccUsersGraph.tsx` (Canvas2D rendering branch, `renderBackend` auto-detect, `view.current` Canvas2D camera, `posRef.current` seed-only fallback paths); `app/(dashboard)/users/graphRenderers.ts` (CanvasGraphRenderer class); the dual-path forward-projection scaffolding I added in `1f47874`.
- **Surfaced:** 02-04 Task 4 human-verify checkpoint (2026-04-29) — user explicitly noted "there's no Canvas 2D anymore, only GPU."
- **What's vestigial:**
  1. The `CanvasGraphRenderer` class and its render loop
  2. The `renderBackend` auto-detect that picks Canvas2D when WebGL2 is unavailable (REND-04 fallback was a Phase 2 plan-level requirement, but production target is dedicated-GPU-only per user)
  3. The Canvas2D branch of the forward-projection hit-test (`posRef.current` + `view.current` path) — once Canvas2D is gone, only the Cosmos `getPointPositions() + spaceToScreenPosition()` path remains
  4. The `view.current` Canvas2D camera state and its sync logic
  5. Pointer/drag handlers' Canvas2D-specific code paths
  6. Worker spawn gate logic (currently spawns d3-force worker only on Canvas2D path) becomes unconditional-skip
- **Why kept now:** Phase 2 success criteria #4 still references Canvas2D fallback (REND-04). Removal is a meaningful surface area cut and warrants its own plan with explicit decision to deprecate REND-04. Recording as debt now so it's not forgotten.
- **Resolution path:** Standalone phase or plan that (a) updates ROADMAP.md / REQUIREMENTS.md to deprecate REND-04, (b) deletes `CanvasGraphRenderer`, (c) collapses the dual forward-projection branch in AccUsersGraph.tsx to the Cosmos-only path, (d) rips `renderBackend` auto-detect and toolbar toggle, (e) removes worker spawn gate (worker becomes dead code unless retained for a different purpose).
- **Tracking:** Non-blocking; does not gate Phase 2 sign-off. Logged identically in `.gsd/TECHNICAL_DEBT.md` per project standing rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 complete (5/5 plans). Ready for milestone sign-off / Phase 2.5 planning.
- TD-006 (slider feel refinement) and TD-007 (Canvas2D removal) are both non-blocking carry-overs.
- All 02-04 success criteria met; 6/6 manual lasso checks passed on 500+ node hub.

---
*Phase: 02-cosmos-gl-renderer*
*Completed: 2026-04-29*
