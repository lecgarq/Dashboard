# Debug: Hover label not appearing on /users graph

## ROOT CAUSE FOUND

### Debug Session
- Symptom: hovering nodes does not show a label.
- Goal: find_root_cause_only (no fix).

### Root Cause
**The user runs the Cosmos (WebGL2) backend, but plan 03-01's hover-label override pass only runs in the Canvas2D renderer. The Cosmos hover-label path (`onPointMouseOver`/`onPointMouseOut`) is wired but its DOM target is never visible.**

Two distinct render paths, two distinct bugs that combine into "no hover label ever":

1. **Canvas2D path is dormant in production.** `app/(dashboard)/users/AccUsersGraph.tsx:345-347` defaults `renderBackend` to `"cosmos"` whenever `isWebGL2Available()` is true. Plan 03-01's deviation #1/#2 (`hoveredNodeRef`, `markGraphDirty()` on hover-identity change, `frame.labelOverrideIndices`) only feeds `CanvasGraphRenderer.draw()` (`graphRenderers.ts:282-389`). On Cosmos, `renderer.draw(frame)` does not consume `labelOverrideIndices` at all — the override pass simply never runs.

2. **Cosmos hover label DOM is mis-positioned and likely invisible.** `AccUsersGraph.tsx:973-987` wires `onPointMouseOver` to set `hoverLabelRef.current.style.left/top` from Cosmos's `position` callback arg (which Cosmos delivers in **page/screen coordinates**, not container-relative). The `hoverLabelRef` div (`AccUsersGraph.tsx:2291-2295`) is `position: absolute` inside a relatively-positioned wrapper several layers deep, so page-pixel `left/top` values place the label far outside the visible area (or off-screen entirely on a non-fullscreen layout). Net effect: `display:block` flips on but the label is positioned outside the user's viewport.

The `handlePointerMove` Canvas2D-only tooltip (`tooltipRef`, line 1571-1574) does work, but it shows the rich `<UserTooltip>` card, not a node label, and its `pointer-events-none` Canvas2D-mode hover handler is bypassed when Cosmos owns pointer events (the canvas2d `<canvas>` has `pointer-events-none` at line 2213 when `renderBackend !== "canvas2d"`).

### Evidence (3 bullets)
- `AccUsersGraph.tsx:345-347`: `useState<"canvas2d" | "cosmos">(() => isWebGL2Available() ? "cosmos" : "canvas2d")` — default Cosmos for any modern browser.
- `graphRenderers.ts:282-389`: the entire override-label pass (which reads `frame.labelOverrideIndices`) is inside `CanvasGraphRenderer.draw()` only. `CosmosGraphRenderer.draw()` ignores those frame fields.
- `AccUsersGraph.tsx:977-978`: `hoverLabelRef.current.style.left = position[0] + 12 + "px"` — `position` from `cosmos.gl` `onPointMouseOver` is the page mouse position, not relative to the cosmos container, so the absolutely-positioned div renders off-canvas. Combined with the canvas2d `onPointerMove` handler being inert when Cosmos is active (canvas has `pointer-events-none`, line 2213), no working hover-label code path is reachable.

### Files Involved
- `app/(dashboard)/users/AccUsersGraph.tsx` (lines 345-347, 968-988, 1461-1488, 1530-1578, 2211-2233, 2280-2295)
- `app/(dashboard)/users/graphRenderers.ts` (lines 282-389 — Canvas2D-only override pass)

### Suggested Fix Direction (do not implement)
Either: (a) port the override-label pass to `CosmosGraphRenderer.draw()` so `labelOverrideIndices` works on the GPU path too, or (b) repair the Cosmos hover-label DOM: convert Cosmos's `position` arg to container-local coordinates (subtract `cosmosContainerRef.current.getBoundingClientRect()` left/top, or use the React `pointermove` event's `clientX/Y - rect.left/top` like the canvas2d path does) before applying `style.left/top`. Option (b) is the smaller change and matches the existing comment in `setSimulationConfig` that treats `onPointMouseOver` as the canonical Cosmos hover-label hook.
