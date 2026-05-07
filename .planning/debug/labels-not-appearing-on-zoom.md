# Debug: Labels not appearing on zoom (/users graph)

**Date:** 2026-05-07
**Reporter:** UAT — "The labels arent visible neither when zooming or when zooming out"
**Branch:** deploy @ 06489c0
**Plan/commits:** 03-01 (5036ab7, 2805e94, 496fc96)

## Symptom

At /users (production: dashboard-production-42cf.up.railway.app, and `npm run dev`), wheel-zooming in or out never produces node labels at any scale. No console errors.

## Required-reading findings

- 03-01-SUMMARY.md, line 16: "affects: Canvas2D fallback rendering path (Cosmos GPU path untouched)"
- 03-01-SUMMARY.md, lines 82-83: "The Canvas2D label pass is gated to the Canvas2D renderer (the new code lives in `CanvasGraphRenderer.draw`, not `CosmosGraphRenderer.draw`)."
- The summary explicitly defers Cosmos labels as "Open Question 1".

## Code evidence

### 1. Default renderer at runtime is Cosmos (GPU)

`app/(dashboard)/users/AccUsersGraph.tsx:345-347`:

```ts
const [renderBackend, setRenderBackend] = useState<"canvas2d" | "cosmos">(() =>
  isWebGL2Available() ? "cosmos" : "canvas2d"
);
```

Any user on a modern browser (Chrome/Edge/Firefox/Safari with WebGL2 — i.e. essentially everyone, including the Railway-hosted production user) initializes `renderBackend = "cosmos"`. The Canvas2D pipeline is only used as a WebGL2 fallback.

### 2. Label rendering code lives only in `CanvasGraphRenderer`

`app/(dashboard)/users/graphRenderers.ts:281-291` — late-zoom label pass:

```ts
// Late-zoom label pass (UI-01)
const fadeStart = frame.labelFadeStartScale;
const fadeEnd = frame.labelFadeEndScale;
const overrideIndices = frame.labelOverrideIndices;
if (fadeStart != null && fadeEnd != null && fadeEnd > fadeStart) {
  ...
```

This block sits inside `CanvasGraphRenderer.draw()`. `CosmosGraphRenderer` begins at line 472 and contains **no** references to `label`, `labelFade*`, or `labelOverrideIndices` (verified via grep). It also has no `setPointLabels` API call into the Cosmos library.

### 3. The frame builder does populate the label fields correctly

`AccUsersGraph.tsx:1454-1487`:

```ts
const fitScale = lastFitScaleRef.current || 600;
const labelFadeStartScale = fitScale * 2.0;
const labelFadeEndScale = fitScale * 3.5;
...
labelFadeStartScale,
labelFadeEndScale,
labelOverrideIndices: overrides,
```

Frame fields are populated, but the active renderer (Cosmos) ignores them. So even when zoom > 2× fit, no draw call ever consults `frame.labelFadeStartScale`.

### 4. Canvas overlay is hidden when Cosmos is active

`AccUsersGraph.tsx:2213, 2238`:

```tsx
className={cn(renderCanvasClass, renderBackend === "canvas2d" ? "opacity-100" : "opacity-0 pointer-events-none")}
...
renderBackend === "cosmos" ? "opacity-100" : "opacity-0 pointer-events-none"
```

Even if `CanvasGraphRenderer.draw()` were somehow ticking in parallel (it isn't — see effect at line 877), its canvas is set to `opacity-0` whenever Cosmos is active, so any labels it drew would be invisible anyway.

## Conclusion

The UI-01 label feature was implemented exclusively in the Canvas2D fallback renderer. Production runs the Cosmos (WebGL2) renderer by default, which has no label-rendering code. The user therefore never sees labels at any zoom level.

This was a known-deferred gap (Open Question 1 in 03-01-PLAN/SUMMARY) — it was shipped as "done for UI-01" but UI-01 in practice is invisible to ~100% of users.

## Files involved

- `app/(dashboard)/users/AccUsersGraph.tsx` (lines 345-347 backend selection; 1454-1487 frame fields; 2213/2238 canvas opacity)
- `app/(dashboard)/users/graphRenderers.ts` (lines 281-420 Canvas2D label pass; line 472+ Cosmos class with no label code)
- `.planning/phases/03-graph-ui-completion/03-01-SUMMARY.md` (lines 16, 82-83 documenting the Cosmos gap)

## Suggested fix direction (NOT implemented)

Either:
1. Implement labels in `CosmosGraphRenderer` — overlay a transparent 2D canvas above the Cosmos WebGL canvas and run the same screen-space label pass against `frame` data on each rAF tick (Cosmos exposes camera state needed for world→screen).
2. Or use the Cosmos library's native `setPointLabels` / equivalent v3 API if available.

Option 1 is lower-risk and reuses existing label-pass logic — it just needs a separate overlay canvas + a tick hook in the Cosmos branch of the render effect.

## ROOT CAUSE FOUND

- **Debug Session:** `C:\LECG\Dashboard\.planning\debug\labels-not-appearing-on-zoom.md`
- **Root Cause:** The UI-01 zoom-threshold label pass was implemented only in `CanvasGraphRenderer.draw()` (`graphRenderers.ts:281`). The default runtime renderer is Cosmos GPU (`AccUsersGraph.tsx:345-347` selects `"cosmos"` whenever WebGL2 is available, which is ~always in production), and `CosmosGraphRenderer` contains no label-rendering code. The frame builder sets `labelFadeStartScale/EndScale/labelOverrideIndices` correctly, but the active renderer ignores them.
- **Evidence Summary:**
  - `AccUsersGraph.tsx:345-347` defaults backend to Cosmos when WebGL2 is available.
  - `graphRenderers.ts` label pass lives inside `CanvasGraphRenderer.draw()` (lines 281-420); `CosmosGraphRenderer` (line 472+) has zero references to `label`/`labelFade`/`labelOverride` (grep confirmed).
  - 03-01-SUMMARY.md lines 82-83 explicitly state Cosmos labels were deferred as "Open Question 1".
- **Files Involved:**
  - `app/(dashboard)/users/AccUsersGraph.tsx`
  - `app/(dashboard)/users/graphRenderers.ts`
  - `.planning/phases/03-graph-ui-completion/03-01-SUMMARY.md`
- **Suggested Fix Direction:** Add a screen-space label pass to the Cosmos render path — either via a transparent 2D overlay canvas tied to the Cosmos rAF tick (reusing existing `frame.label*` data and label-pass logic) or via the Cosmos library's native point-label API. The `lastFitScaleRef * 2.0`/`* 3.5` fade band and the override/AABB logic can be lifted as-is.

---

## Re-investigation after 03-04 ship

**Status:** investigating → fixed
**Date:** 2026-05-07

### New Symptom

03-04 shipped a Cosmos label overlay. After deploy, UAT still shows zero labels at any zoom. No console errors.

### Hypotheses Formed

1. `instanceof CosmosGraphRenderer` gate fails (dual module instance) — ELIMINATED: gate is at line 1523, rAF effect captures `cosmosLabelOverlayRef` by ref (not value), overlay ref and renderer class come from same module file. No dynamic imports, no barrel re-export splitting.
2. Overlay canvas visibility/z-order issue — ELIMINATED: JSX at line 2313 has `absolute inset-0 w-full h-full pointer-events-none opacity-100` (when cosmos backend). CSS is fine.
3. `drawLabelOverlay` early-returns — PARTIALLY: the opacity formula is correct for fade band. But the real issue is upstream.
4. **`frame.positions` contains stale seed positions in GPU-physics mode** — CONFIRMED (root cause).
5. Wheel listener not firing markGraphDirty — ELIMINATED: effect at line 1713 attaches passive wheel listener on `cosmosContainerRef`, calls `markGraphDirty()`. Correct.

### Root Cause (Post-03-04)

`drawLabelOverlay` (graphRenderers.ts line 952) reads world coordinates from `frame.positions`, which is `posRef.current`. A comment already in the codebase (AccUsersGraph.tsx line 673) states:

> "`posRef.current` holds only seed positions in Cosmos GPU-physics mode (Cosmos has since moved the points on the GPU)"

Cosmos runs force-directed layout on the GPU; node positions migrate from the seed layout but are never written back to `posRef.current`. So `frame.positions[i*2] / [i*2+1]` contains the initial arranged positions, not the current GPU positions. `spaceToScreenPosition` correctly projects the given world point — but the input world points are wrong. Every label projects to the wrong screen location (off-screen or wrong node), none are visible.

`CosmosGraphRenderer.getPointPositionsArray()` already existed (graphRenderers.ts line 1040) and calls `this.graph.getPointPositions()` to retrieve live GPU positions. 03-04 did not use it in `drawLabelOverlay`.

### Fix Applied

`graphRenderers.ts` — before the node loop in `drawLabelOverlay`, fetch live positions:

```ts
const livePositions = this.getPointPositionsArray();
const positions = livePositions ?? frame.positions;
```

Use `positions[i*2]` / `positions[i*2+1]` in the loop instead of `frame.positions[...]`. Falls back to `frame.positions` when `getPointPositionsArray()` returns null (worker-physics mode, where `posRef` IS live).

TypeScript: `npx tsc --noEmit` — clean.

### Evidence

- AccUsersGraph.tsx line 673 comment explicitly documents the stale-seed problem for `posRef.current` on Cosmos GPU-physics path.
- `getPointPositionsArray()` already present on `CosmosGraphRenderer` (graphRenderers.ts:1040) for exactly this purpose (it exists because lasso polygon-select hit the same problem in 02-04).
- Fix is one variable substitution; all other overlay logic (fade band, AABB, override channel, spaceToScreen projection) is correct.

### Files Changed

- `app/(dashboard)/users/graphRenderers.ts` — `drawLabelOverlay`: use `getPointPositionsArray()` for live GPU positions.
