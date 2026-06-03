# Graph Physics / Camera / Highlight — Diagnosis (P0)

> **Status:** Diagnosis only. No code changed. Companion plan:
> [`../plans/2026-05-25-p0-graph-physics-camera-highlight-fix.md`](../plans/2026-05-25-p0-graph-physics-camera-highlight-fix.md).
> **Method:** `superpowers:systematic-debugging` Phase 1–2 (root-cause + pattern analysis). Evidence is
> cited as `file:line` against the live tree on `feat/access-analysis-redesign` (289 ahead of `deploy`).
> **Scope:** `/users/access-analysis` spatial graph. Two-bus model preserved: **sliders = PHYSICS bus**,
> **filters/search/selection/masks = MASK bus**. Node identity `UserProjectInstance = userId::projectId`.

---

## 0. TL;DR — three independent defects

| # | Symptom (user) | Root cause | Evidence |
|---|----------------|-----------|----------|
| **A** | Moving a slider doesn't move nodes; graph feels static/snapshotted | `updateSliders` reheats only when `max(allSliders)` changes; the organic preset makes that max **sticky**, so most slider moves hit the `skip` path and never restart the sim | `physicsLayer.ts:319-342` (`skip` at `:328`), `physicsLayer.ts:225-242` |
| **B** | Selecting a node changes fit/zoom/extents and disorients | Selection swaps the right panel via `AnimatePresence mode="wait"`, which collapses the panel column → resizes the graph → `GraphCanvas3D` `ResizeObserver` calls `fitView()` on every resize | `RightPanelStack.tsx:60`, `GraphCanvas3D.tsx:438-447` |
| **C** | Selected/related nodes not visually obvious | Highlight is subtractive only (dim others to 0.15); isolate even dims the selected node's own same-user footprint; only edges brighten | `usePredicateEngine.ts:116-154`, `GraphCanvas2D.tsx:314-328`, `GraphCanvas3D.tsx:178-186` |

The renderer stack (cosmos.gl 2D + three.js 3D) **can** animate — it pumps `physics.getPositions()` to the
active renderer every rAF frame (`GraphCanvas.tsx:124-138`, `useGraphRafLoop.ts:61-81`). The stack is not
the problem; the **physics never reheats** and the **camera refits on a layout side-effect**.

---

## 1. Architecture as-built (the live data path)

```
SliderSidebar/DimensionSlider
   └─ SliderContext.setSliderValue (0..100)         SliderContext.tsx:203-214
        └─ schedulePush (rAF-coalesced)             SliderContext.tsx:156-175
             └─ flushToPhysics → physics.updateSliders(values/100)   SliderContext.tsx:145-154
                  └─ physicsLayer.updateSliders      physicsLayer.ts:319-342   ← PHYSICS BUS
                       └─ applySliderForces + sim.alpha(a).restart()
GraphCanvas.useGraphRafLoop (enabled:true)           GraphCanvas.tsx:124-138
   └─ every frame: physics.getPositions()            useGraphRafLoop.ts:61-81
        ├─ onTick2D → handle2D.pushPositions(xyz)     GraphCanvas2D.tsx:257-312
        └─ onTick3D → handle3D.pushPositions(xyz)     GraphCanvas3D.tsx:201-221
   └─ onMaskChange (only when maskVersion bumps) → applyAlphaMask(both handles)
usePredicateEngine (filters/search/lasso/isolate)    usePredicateEngine.ts:104-164  ← MASK BUS
   └─ physics.setMask(predicate)                      physicsLayer.ts:344-351
```

The two buses are correctly separated: `setMask` never touches the sim (`physicsLayer.ts:344-351`),
`updateSliders` never touches the mask. **That invariant is healthy and must be preserved.**

---

## 2. Defect A — sliders don't visibly animate nodes (PHYSICS bus)

### 2.1 What state changes when a slider moves
`setSliderValue` updates React state + `valuesRef`, then `schedulePush` rAF-coalesces a call to
`flushToPhysics`, which calls `physics.updateSliders(normalized)` with the **full** slider vector
(`SliderContext.tsx:145-154`). So the change **does reach `physicsLayer`**, every time, with all dims.

### 2.2 Are force strengths updated? — Yes
`updateSliders` merges the new values and calls `applySliderForces` (`physicsLayer.ts:321-323`), which
re-installs `forceX/Y/Z.strength()` per dim and re-lerps `manyBody.strength` + `alphaDecay`
(`physicsLayer.ts:225-242`). The force field **is** reconfigured correctly.

### 2.3 Does the simulation reheat/restart? — **Usually NO. This is the root cause.**
```ts
// physicsLayer.ts:323-341
const maxSlider = applySliderForces(_sliders);          // max over ALL slider values
const newAlpha  = Math.min(maxSlider, ALPHA_MAX_REHEAT); // 0.3 cap
const skip = frozen && Math.abs(maxSlider - prevMax) < SKIP_THRESHOLD;   // 0.02
if (!skip) { frozen = false; /* unpin */ sim.alpha(newAlpha).restart(); }
prevMax = maxSlider;
```
The reheat is gated on the change in the **scalar maximum of all sliders**, not on whether the force field
changed. Consequences:

- The organic preset (`DEFAULT_VALUES = applyPreset("organic")`, `SliderContext.tsx:52-53`) seeds several
  non-zero sliders, so `max(allSliders)` is **pinned high** by the dominant dimension.
- Dragging any **non-dominant** slider — or dragging the dominant one while another stays near it — leaves
  `maxSlider` ≈ unchanged → `skip = true` → **the sim never restarts**. The force field changed, but alpha
  stays below `ALPHA_MIN` (0.001), so d3 does zero ticks. Nodes do not move.
- Even a slider that *does* move the max produces `newAlpha = min(maxSlider, 0.3)`; for low overall sliders
  the reheat alpha is tiny → near-imperceptible motion.

This is a wrong-invariant bug: `prevMax`/`maxSlider` is the wrong quantity for change-detection. The correct
signal is "did any individual dimension's strength change materially?"

### 2.4 Why the tests are green anyway
The e2e slider tests only ever **jump a slider to the extreme**: `keyboard.press("End")` → 100
(`acc-dc-graph.spec.ts:224`, `:836`) or the **Free preset** → all-zero (`:798`). Both reliably change the
global max, so the `skip` path is never exercised. The unit `physicsClustering.test.ts` sweeps strengths
through the pure layer and never goes through the `skip` gate. **No gate covers a mid-range adjustment of a
non-dominant slider — exactly the interaction that's dead.**

### 2.5 Are ticks running / positions frozen / cache overriding?
- After the first settle, `sim.on("end")` normalizes positions to ±`LAYOUT_HALF_EXTENT` (350), saves to the
  DuckDB positions cache, and calls `sim.stop()` (`physicsLayer.ts:254-271`). `frozen = true`. The rAF loop
  keeps calling `getPositions()` every frame but the values are static → the "snapshotted" feel **between**
  slider changes is expected.
- **Position cache amplifies the static feel on reload.** `createPhysicsLayer` checks
  `loadCachedPositions(hashNodeSetAndSliders(nodeIds, sliders))` and, on a hit, **pins** nodes via
  `fx/fy/fz` and sets `frozen = true` with no sim run (`physicsLayer.ts:273-301`, key
  `positionsCache.ts:79-109`). Because sliders are persisted to `localStorage` and re-seeded
  (`AccessAnalysisShell.tsx:254-279`), the **second** load of an unchanged view is an instant frozen, pinned
  snapshot. Combined with Defect A, fine-grained slider interaction then appears completely inert.
- Within a session `updateSliders` does **not** re-read the cache — it reheats live. So the cache is not what
  blocks intra-session animation; the `skip` gate is. The cache is a secondary contributor to the *initial*
  "snapshotted" impression.

### 2.6 Is 2D/3D receiving live vs static positions? — Live, when the sim runs
Both renderers receive the live `getPositions()` buffer every frame via `pushPositions`
(`GraphCanvas2D.tsx:257-312`, `GraphCanvas3D.tsx:201-221`). When the sim is stopped/frozen, the same static
buffer is re-pushed (no visible motion). So "static" is downstream of "sim not ticking", which is Defect A.

**Conclusion A:** Minimum-safe fix is to reheat on *any material change to the slider vector* (per-dimension
delta), not on the scalar max, and to use a reheat alpha that guarantees visible motion. This is a
`physicsLayer.ts` edit → requires the layout-math validation workflow (§4).

---

## 3. Defect B — selection moves the camera (should not)

### 3.1 What triggers fitView/refit/recenter
- **2D:** `Graph` is constructed with `fitViewOnInit:true` (`GraphCanvas2D.tsx:171-173`). After init, refit
  happens in `pushPositions` only when the measured spread changes materially (`scaleChanged`,
  `GraphCanvas2D.tsx:276-289`) or via the deferred `fitPendingRef` countdown. Selection does **not** change
  node positions, so `scaleChanged` is false → `pushPositions` does not refit on selection. ✔
- **3D:** `fitView()` is called (a) once on first freeze (`GraphCanvas3D.tsx:213-220`), (b) on mode
  transitions (`GraphCanvas.tsx:171-216`), and (c) **on every `ResizeObserver` callback**
  (`GraphCanvas3D.tsx:438-447`). (c) is the problem.

### 3.2 Does selection cause a layout resize? — **Yes**
Clicking a node sets `isolatedNodeIndex`; `RightPanelStack` then swaps its top layer from `"sliders"` to
`"user-detail"` (`RightPanelStack.tsx:31-38, 60-82`). The swap uses `AnimatePresence mode="wait"`
(`:60`): the outgoing panel **fully unmounts** (exits) before the incoming one mounts. During that gap the
panel column (`<div className="relative flex">`, `:54-59`) has no child → its width collapses → the sibling
graph area (`<div className="relative flex-1">`, `AccessAnalysisShell.tsx:156-157`) grows to fill, then
shrinks again when the new panel mounts. Two container resizes per selection.

- **3D:** each resize fires the `ResizeObserver` → `fitView()` → camera re-aimed to frame the whole cloud,
  **discarding the user's orbit/zoom**. This is the disorientation.
- **2D:** cosmos.gl reacts to its container resize (viewport/aspect change), so framing shifts even though
  `pushPositions` doesn't refit. Less violent than 3D but still a visible reframe.

### 3.3 Does click/select explicitly call focus/fit/zoom? — No
`GraphInteractions` routes click → `onIsolate` only (`GraphInteractions.tsx:113-120`); no camera API is
called on selection. The camera move is **entirely** the resize side-effect of §3.2.

**Conclusion B:** Two minimal, complementary fixes — (1) give the right-panel column a **stable width** so
panel swaps never resize the graph (kills the trigger for both 2D and 3D), and (2) make the 3D
`ResizeObserver` **resize without refitting** (preserve camera; defense-in-depth). Neither touches selection
logic or the mask bus.

---

## 4. Defect C — selected/related nodes not obvious enough (MASK bus / render)

### 4.1 What is currently highlighted on selection
- **Mask (alpha):** `usePredicateEngine` sets a per-node mask. On isolate: `i === isolatedNodeIndex ? 1.0 :
  0.15` (`usePredicateEngine.ts:121-122`) — i.e. **only the single clicked instance stays lit; everything
  else (including the same user's other project instances) dims to 0.15.**
- **Renderers consume the mask subtractively:** 2D uses `highlightedPointIndices` + `pointGreyoutOpacity:
  0.15` (`GraphCanvas2D.tsx:314-328`, ctor `:163`); 3D multiplies dimmed instance colors by `DIM=0.15`
  (`GraphCanvas3D.tsx:93-94, 178-186`).
- **Edges:** `GraphInteractions` recomputes `computeLinkEmphasisColors(edges, activeUserIds)` where
  `activeUserIds = hovered ∪ isolated ∪ lasso` and pushes via `handle.setLinkColors`
  (`GraphInteractions.tsx:168-193`, `linkEmphasis.ts:19-46`). So the same-user **edges** brighten correctly.

### 4.2 The gap
There is **no positive emphasis** on nodes — no size bump, outline, brighter color, or glow. The only signal
is "everyone else gets darker", and for isolate the related same-user **nodes** get darker too (only their
*edges* brighten). At ~16,942 nodes a single full-alpha dot among a 0.15 cloud is hard to find, and the
"related footprint" reads as edges into darkness.

### 4.3 Proposed highlight strategy (identity- and physics-preserving)
Both are reversible and live entirely on the MASK/render side — **no change to positions or node identity**:

1. **Light the footprint, not just the node (MASK bus).** Extend the isolate branch so the selected
   instance's **same-user footprint** (all `userId::*` instances) stays at `1.0`, others `0.15`. Related
   nodes stop disappearing. (Lasso/filter/search branches unchanged.)
2. **Add additive node emphasis (render only).** Feed a per-node **size** buffer where the focus set
   (isolated ∪ footprint ∪ lasso) is enlarged: 2D `setPointSizes`, 3D per-instance matrix scale. Optionally a
   brighter ring color for the single clicked node. This is positive, not subtractive, so selected/related
   nodes "pop" without changing the color/alpha contract the e2e color tests assert
   (`acc-dc-graph.spec.ts:240-332` rely on `allAlphaOne` + signature — size does not affect those).

The bridge counters `getDimmedNodeCount`/`getHighlightedNodeCount`/`getBrightEdgeCount` read the alpha mask
and edges; lighting the footprint shifts the isolate dimmed-count but **no existing test asserts an exact
isolate dimmed count** (the isolate test checks the panel + `isolatedNodeId`, `:403-429`; the bright-edge
tests check edges, `:634-687`). Size emphasis does not affect any counter.

---

## 5. Defect-5 — 3D "feels like a static 2D-derived snapshot"

### 5.1 Is 3D actually volumetric / live?
- **Volumetric data:** targets are genuinely 3D — `featureTargets.ts` uses a spherical-Fibonacci + layered
  radius anchor set with structurally meaningful z (`featureTargets.ts:16-34, 123-141`), and the e2e gate
  asserts `zRange > 0.2 * max(xRange,yRange)` (`acc-dc-graph.spec.ts:202-204`). So depth exists.
- **Live updates:** `GraphCanvas3D` self-drives a rAF (`controls.update()` + `render()` every frame,
  `:426-432`) and rewrites instance matrices from `pushPositions` (`:201-221`). When the sim ticks, 3D moves.
- **Stable orbit:** `OrbitControls` with damping (`:127-131`).

### 5.2 Why it nonetheless feels static
Two reasons, both already diagnosed: (A) the sim is almost never reheated, so 3D re-pushes identical matrices
every frame (Defect A); (B) every selection-induced resize snaps the camera back via `fitView` (Defect B), so
any orbit the user builds is repeatedly thrown away — the view never feels like a place you can move through.
Fixing A + B makes 3D feel volumetric and inhabited without a renderer rewrite. Optional polish (gentle
auto-spin until first interaction, depth fog) is **out of P0 scope**.

**Conclusion 5:** No renderer-stack replacement needed. The stack animates; A + B are the levers.

---

## 6. What must NOT change (verified constraints)

- **Two-bus separation is correct** — keep `setMask` sim-free and `updateSliders` mask-free
  (`physicsLayer.ts:319-351`).
- **Both canvases always mounted; CSS-visibility swap** — conditional render destroys the WebGL context
  (`GraphCanvas.tsx:232-285`, dependency-map "GraphCanvas mount model" seam).
- **`graphTestBridge` `GraphTestApi` is a tested contract** — e2e reads through it (`acc-dc-graph.spec.ts`
  whole file). Any new emphasis must keep `getDimmedNodeCount`/`getHighlightedNodeCount`/`getColorStats`/
  `getBrightEdgeCount` meaningful.
- **Node identity `userId::projectId`** — edges, selection, and `EXPECTED_NODE_COUNT = 16_942` key off it
  (`acc-dc-graph.spec.ts:7`, `sameUserEdges.ts`).
- **Forbidden-casual-edit files touched by the fix** (`physicsLayer.ts`, `GraphCanvas3D.tsx`,
  `GraphCanvas2D.tsx`) require the `access-analysis-graph-development` workflow §4 layout-math validation and
  must keep `physicsLayer.purity.test.ts` + `physicsClustering.test.ts` + `mathLayer.purity.test.ts` green.

---

## 7. Open question for the approver

The **position cache** (`positionsCache.ts`) makes the *second* load of an unchanged view an instant pinned
snapshot (§2.5). It is **not** the cause of dead intra-session sliders, but it contributes to the first-glance
"snapshotted" impression. The plan defaults to **leaving the cache intact** (it's a real perf win at 17k
nodes) and fixing only the reheat gate. If you'd prefer the graph to always do a brief visible settle on load,
that's a one-line change (skip the pin on cache hit, or run a short reheat after restore) — flagged as an
optional task in the plan, not a default.
