---
phase: 03-graph-ui-completion
plan: 04
subsystem: graph-ui
tags: [ui-01, cosmos, label-overlay, gap-closure]
requires:
  - 03-01 (Canvas2D late-zoom label pass — fade band, AABB, 200-cap, override channel)
  - 03-05 (cosmosReady state + setCosmosReady call sites in renderer-init effect)
provides:
  - CosmosGraphRenderer.drawLabelOverlay(ctx, frame, dpr) screen-space label pass
  - cosmosLabelOverlayRef <canvas> sibling of cosmosContainerRef, driven each rAF tick
  - GraphRenderFrame.cosmosLabelFadeStartZoom / cosmosLabelFadeEndZoom optional fields
  - Cosmos hover labels via labelOverrideIndices channel (replaces legacy DOM hoverLabelRef)
affects:
  - app/(dashboard)/users/graphRenderers.ts
  - app/(dashboard)/users/AccUsersGraph.tsx
tech-stack:
  added: []
  patterns:
    - "Sibling 2D overlay canvas above a GL canvas with pointer-events-none for screen-space annotation"
    - "World->screen via cosmos.gl Graph.spaceToScreenPosition (public API) + Graph.getZoomLevel for zoom-band semantics"
    - "Renderer-class instanceof gate inside rAF closure to fork render path without reading React state"
key-files:
  created:
    - .planning/phases/03-graph-ui-completion/03-04-SUMMARY.md
  modified:
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/AccUsersGraph.tsx
decisions:
  - "Cosmos fade band fixed at 2.0..3.5 zoom-level units (1.0 = fit) on first ship — pre-validated by plan, can be tuned empirically during UAT without code changes to the overlay logic"
  - "Used public Graph.getZoomLevel() per index.d.ts:343 (no _zoomTransform.k fallback); wrapped in try/catch with cosmosZoom=1 default — degraded path renders only override labels, which is acceptable"
  - "Legacy hoverLabelRef DOM element removed entirely (ref + JSX + cleanup site + setStyle handlers) — overlay subsumes via labelOverrideIndices, no parallel system retained"
  - "Cosmos wheel redraw wired via passive wheel listener on cosmosContainerRef calling markGraphDirty (NOT a reheat — pure redraw signal; UI-02 zoom-no-reheat contract preserved)"
  - "Backend-switch overlay clear is its own useEffect rather than inlined in the renderer-init effect — keeps that effect's diff small and survives renderBackend changes that don't tear down the renderer (currently none, but defensive)"
  - "Overlay canvas backing-store sizing lives inside drawLabelOverlay (matches the canvas2d delegate-to-renderer pattern at graphRenderers.ts:135-142); no JSX-side ResizeObserver added"
metrics:
  duration: "~4 min"
  completed: "2026-05-07"
  tasks_completed: 3
  files_modified: 2
requirements: [UI-01]
---

# Phase 03 Plan 04: Cosmos Label Overlay Summary

UAT gaps 1, 2, 3 closed by adding a transparent 2D overlay canvas above the Cosmos GL canvas and driving it from the existing rAF tick. The 03-01 Canvas2D label pass shipped only on the canvas2d backend (production runs Cosmos for ~100% of users), so the late-zoom labels, hover labels, and selected-node persistent labels were invisible to nearly everyone in production. This plan ports that same fade-band + AABB + override + 200-cap pipeline to a Cosmos-aware screen-space pass while leaving the canvas2d code path byte-identical.

## Changes

### Task 1: CosmosGraphRenderer.drawLabelOverlay

- **Method:** `drawLabelOverlay(ctx, frame, dpr)` added between `spaceToScreen` and `getPointPositionsArray` on the CosmosGraphRenderer class.
- **Algorithm:** Mirrors the Canvas2D label pass at `graphRenderers.ts:281-419` exactly — same opacity calc, same override-first / normal-second draw order, same AABB collision skip on normal labels (overrides bypass collision but register AABBs), same 200-label hard cap, same 11px ui-sans-serif font, same `#111827` fill.
- **Differences from Canvas2D:**
  1. World->screen projection uses `this.spaceToScreen(wx, wy)` (Cosmos's `spaceToScreenPosition`) instead of `halfW + (wx - view.x) * view.scale`.
  2. Zoom-band semantics: reads `this.graph.getZoomLevel()` (public API per `node_modules/@cosmos.gl/graph/dist/index.d.ts:343`) and the new `cosmosLabelFadeStartZoom` / `cosmosLabelFadeEndZoom` frame fields. Falls back to `labelFadeStartScale` / `EndScale` only as a degraded last resort (units differ).
  3. Lazy-resizes the backing store at top of method (`canvas.width = floor(cssWidth*dpr)` etc.) — matches the canvas2d pattern at lines 135-142.
- **Frame interface:** `GraphRenderFrame` extended with `cosmosLabelFadeStartZoom?: number` and `cosmosLabelFadeEndZoom?: number` (both optional; ignored by CanvasGraphRenderer).
- **CanvasGraphRenderer untouched** — back-compat for the canvas2d fallback.

Commit: `70d9d04`

### Task 2: Overlay <canvas> + rAF wiring + hover replacement

- **`cosmosLabelOverlayRef`** declared near `cosmosContainerRef` (line ~285).
- **Overlay JSX** added immediately after the cosmos container `<div>` inside the same fade-wrapper (line ~2255). `pointer-events-none` so wheel/click pass through to the Cosmos GL canvas. CSS-gated visibility mirrors the cosmos container (`opacity-100` when active, `opacity-0` otherwise).
- **rAF tick wiring** at the end of the existing render loop: after `renderer.draw(frame)`, check `renderer instanceof CosmosGraphRenderer` and call `renderer.drawLabelOverlay(ctx2d, frame, dpr)`. The `instanceof` gate avoids a React state read inside the rAF closure.
- **Frame builder** populates `cosmosLabelFadeStartZoom = 2.0` and `cosmosLabelFadeEndZoom = 3.5` alongside the existing Canvas2D fade fields.
- **Hover handlers rewritten:** `onPointMouseOver` / `onPointMouseOut` (registered via `cosmosGraph.setConfigPartial(...)`) now update `hoveredNodeRef.current`, call `setHoveredNode`, and `markGraphDirty()`. The frame builder's existing `overrides` set already adds `hoveredNodeRef.current`'s mapped index to `labelOverrideIndices`, so the overlay paints the hovered label automatically.
- **Legacy DOM hover label removed entirely:**
  - `hoverLabelRef = useRef<HTMLDivElement>(null)` declaration deleted.
  - `<div ref={hoverLabelRef} ... />` JSX deleted.
  - Cleanup line `if (hoverLabelRef.current) hoverLabelRef.current.style.display = "none"` deleted.
  - `style.left/top/display/textContent` mutations inside the old hover handlers deleted (replaced by the markGraphDirty pattern above).

Commit: `956a31c`

### Task 3: Backend-switch handoff + Cosmos wheel redraw

- **Cosmos wheel listener:** New `useEffect` that, when `renderBackend === "cosmos"`, attaches a passive wheel listener to `cosmosContainerRef` that just calls `markGraphDirty()`. Cosmos handles its own zoom math; we only need to wake the rAF tick so the overlay redraws at the new zoom level. This is NOT a reheat — UI-02 zoom-no-reheat contract is preserved (no `resetStability()` call).
- **Backend-switch clear:** New `useEffect` that, when `renderBackend !== "cosmos"`, clears the overlay canvas backing store. CSS `opacity-0` already hides it, but clearing the pixels is defensive against future code paths that might toggle opacity back.

Commit: `9d1f6c0`

## Verification

- `npx tsc --noEmit` — clean (run after each task).
- `npm run lint -- "app/(dashboard)/users/graphRenderers.ts" "app/(dashboard)/users/AccUsersGraph.tsx"` — 0 errors. 2 warnings, both the pre-existing project-wide "File ignored because no matching configuration was supplied" from the empty `eslint.config.mjs` (already documented as a deferred issue in 03-05 SUMMARY).

## UAT Re-Test Status

Manual smoke (per plan verification block) is post-execute and requires user action on a WebGL2 browser. Expected outcomes for the gaps closed by this plan:

- **Gap 1 (Late-zoom labels on Cosmos):** Expected PASS. At fit (`getZoomLevel()` ≈ 1) opacity is `(1 - 2) / (3.5 - 2) = -0.67` → clamped to 0 → no normal labels drawn. Wheel-zoom past `getZoomLevel() = 2.0` starts fading labels in, fully opaque at 3.5.
- **Gap 2 (Hover labels on Cosmos):** Expected PASS. `onPointMouseOver` writes to `hoveredNodeRef.current` + calls `markGraphDirty()`; the rAF tick rebuilds the frame and adds the hovered index to `labelOverrideIndices`; `drawLabelOverlay` paints it at full opacity bypassing the fade band.
- **Gap 3 (Selected-node persistent label on Cosmos):** Expected PASS. Same mechanism as hover but via `selectedNodeRef.current` → `selectedIndex` → `overrides.add(selectedIndex)`. Label persists at any zoom until deselection.

The Canvas2D fallback path is byte-identical to its 03-01 shape (no edits to `CanvasGraphRenderer.draw()`); regression risk on that path is zero.

## Deviations from Plan

**Two minor deviations, both within Rule 3 (defensive correctness, no architectural change):**

1. **`drawLabelOverlay` always clears its canvas at frame start, even on the early-return paths.** The plan's skeleton put the `clearRect` inside the `if (fadeStart == null...)` branch only. As written, that meant a stable Cosmos session that lost its fade fields mid-flight would keep stale pixels. Moved the `setTransform` + `clearRect` above all early returns so every overlay-pass invocation produces a clean frame. Risk-free; the cost is a single transparent fill.

2. **`getZoomLevel()` wrapped in try/catch with a `cosmosZoom = 1` default.** The plan asserts the public API is always present in v3. That's true — but the surrounding `setConfigPartial` / `start` / `render` pattern in CosmosGraphRenderer wraps Cosmos calls in try/catch defensively. Followed that local convention. On the unlikely degraded path (older Cosmos build, throw), `cosmosZoom = 1` falls below typical fade bands → only override labels render → graceful degradation.

Both deviations preserve the documented behavior on the happy path; they only harden the failure modes.

## Deferred Issues

- **Pre-existing lint config gap:** `eslint.config.mjs` is empty; lint emits a "File ignored because no matching configuration was supplied" warning for any file in this project. Already flagged in 03-05 SUMMARY for a future tooling-cleanup plan. Not introduced here.

## Self-Check: PASSED

- File `app/(dashboard)/users/graphRenderers.ts` — modified, contains `drawLabelOverlay`.
- File `app/(dashboard)/users/AccUsersGraph.tsx` — modified, contains `cosmosLabelOverlayRef`.
- Commit `70d9d04` (Task 1) — present in `git log`.
- Commit `956a31c` (Task 2) — present in `git log`.
- Commit `9d1f6c0` (Task 3) — present in `git log`.
- SUMMARY.md — this file.
