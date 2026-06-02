# Live Similarity Layout — Design

**Date:** 2026-06-02
**Branch:** feat/access-analysis-redesign
**Surface:** `app/(dashboard)/users/access-analysis/` (the cosmos.gl GPU graph at `/users/access-analysis`)
**Supersedes:** `2026-06-01-organic-composite-clusters-design.md` and the discrete cluster-blobs direction (`2026-05-29-cluster-blobs-and-labels-design.md`) for the *multi-slider live* behavior.

## Problem

Three coupled defects in the slider-driven graph:

1. **Lag when moving sliders.** Dragging a slider re-packs all ~16,942 nodes every tick, re-renders ~200 sidebar sliders synchronously, discretely re-groups (causing assignment "pops"), and re-uploads the eased position buffer to the GPU every frame.
2. **Multi-slider clustering is confusing.** `buildCompositeClusters` groups nodes by the **tuple** of every active slider's value (a Cartesian product), producing dozens of blobs with unreadable compound labels (`Admin·recent·p2`).
3. **Fixed-circle "center of gravity."** `clusterForceLayout.ts` pulls all cluster centers toward the origin (`forceX(0)/forceY(0)`) and then **rescales the whole layout to a constant `TARGET_EXTENT = 1700`** circle, so the silhouette never reflects the data.

## Root cause

Two competing layout engines exist; the wrong one is authoritative for the slider view:

- **Engine A — continuous similarity physics** (`physicsLayer.ts` in a Web Worker). Each active dimension applies `forceX/Y/Z` pulling each node toward that dimension's per-node *target* (`featureTargets.ts`). Nodes sharing attribute values share a target → similar nodes converge. Slider value scales the **force strength** (`applySliderForces`, `physicsLayer.ts:342`); `manyBody` repulsion scales with the strongest slider. There is **no centering force** (`physicsLayer.ts:399`), so the emergent shape is organic. This is smooth, continuous, runs off the main thread.
- **Engine B — discrete tuple-blob packer** (`dominantClusters.buildCompositeClusters` → `clusterForceLayout.layoutClusterFootprintsOrganic` → `clusterPacking.packMemberPositions`). Produces footprints, packs members on a Vogel sunflower, **rescales to the fixed 1700 circle**, then *overrides* Engine A by pushing those positions to the canvas (`AccessAnalysisShell.tsx:141`, consumed at `GraphCanvas2D.tsx:405` where "these eased packed positions ARE the source of truth").

Engine B is the source of all three defects. Engine A already implements the behavior the user asked for ("the similarity logic defines how close or far the cluster accommodates").

## Goals

- **G1 — Zero perceptible lag while dragging.** Frames stay responsive throughout a continuous drag; no main-thread stalls, no per-tick full re-pack, no all-slider re-render.
- **G2 — Live, smooth re-clustering.** Dragging continuously and smoothly changes how tightly similar nodes group; nodes **flow** (never teleport/pop).
- **G3 — Similarity grouping for 2+ sliders.** Multiple active sliders define a combined *similarity*; alike nodes (across the weighted active dimensions) settle together as emergent blobs — not one blob per value-combination.
- **G4 — Slider = closeness/separation.** Higher slider value ⇒ similar nodes pull tighter and dissimilar nodes spread further; lower ⇒ looser/blended.
- **G5 — Data-defined organic shape.** The overall silhouette emerges from the similarity layout; no fixed circle, no forced center-of-gravity. Camera auto-fits whatever shape results.

## Non-goals

- 3D mode behavior is unchanged except where it shares the physics path.
- No changes to data ingestion, the dimension catalog/taxonomy, or the ECharts dashboard at `/access-analysis`.
- We do not remove the discrete-packing source files in this pass unless trivially dead; we make Engine A authoritative and stop invoking Engine B for the live layout. (Cleanup can follow once verified.)

## Core principle

**Continuous similarity physics is the single source of truth for node positions.** Blobs are *derived* (hulls + labels) from where similar nodes emergently settle, and merged by spatial proximity so the labels reflect similarity rather than every value-tuple. The slider value drives force strength, which is "how close/far," continuously.

## Design

### Part 1 — Make Engine A authoritative for the live layout

- In `AccessAnalysisShell.tsx`: stop computing/passing `clusterPackedPositions` / `clusterCorners` as the layout source. The canvas takes positions from `physics.getPositions()` (the worker) via the existing frozen-mode `pushPositions` path.
- In `GraphCanvas2D.tsx`: the cluster-packed override gate (`clusterPushActive` / `clusterModeRef`, `:405`) is no longer driven for the slider view; the physics path drives positions. Camera auto-fit continues to frame the physics-frozen-and-normalized layout (the existing `physics.frozen` + spread-change refit path).
- `physicsLayer.normalizeNodePositions` (uniform scale to ≈±350) is **kept** — it is a uniform scale that *preserves* shape (fits the data into view), unlike the 1700 circle rescale which *imposes* a shape. This satisfies G5 (organic) while keeping framing sane.

### Part 2 — Slider → similarity strength ("close vs far")

- Reuse `applySliderForces` (`physicsLayer.ts:342`): slider value → target-pull strength. Audit/tune the constants `STRENGTH_AT_ONE`, `REPULSION_ZERO/ONE`, `DECAY_ZERO/ONE` so the perceived effect is: low slider = loose/overlapping; high slider = tight, well-separated groups. The strongest active slider continues to scale repulsion (separation between dissimilar nodes).
- Multi-slider blending is automatic: simultaneous per-dimension pulls settle each node at the weighted blend of its dimensions' targets → similar-across-active-dims nodes co-locate (G3). No tuple grouping is computed for positions.
- **Closeness semantics check:** confirm that increasing a slider visibly tightens its grouping and increases separation from unlike nodes; adjust `featureTargets` spacing if pull alone is insufficient.

### Part 3 — Emergent, similarity-merged blobs (hulls + labels)

- New pure module `emergentBlobs.ts`: given live node positions (stride-3) + each node's active-dimension signature + counts, compute:
  - per-signature **live centroid** and a soft radius (member spread percentile),
  - **merge** signature groups whose centroids are within a proximity threshold (they settled together ⇒ similar) into a single labeled blob,
  - keep the **top-N** blobs by membership; fold the remainder into a quiet residual (no loud "Other" label),
  - produce a human label per blob from its dominant active-dim values (e.g. "Admins · recently active"), not a `¦`-joined code.
- `ClusterLabels.tsx` / hull overlay consume these emergent centers. Because positions are continuous, centroids **glide**; label/hull recompute is **debounced/throttled** (≈8–12 Hz or on motion-settle) and visually eased so labels never strobe. Debouncing labels is acceptable because the *dots never jump* (Engine A is continuous) — only the text/hull settles.

### Part 4 — Remove the lag (G1, G2)

- **Transient slider state:** dragging a slider must not synchronously re-render the ~200-slider sidebar each tick. Split the slider store so the dragged slider's value updates locally/transiently and is pushed to physics via the existing rAF coalesce (`SliderContext.schedulePush`), while non-dragged sliders don't re-render. (e.g. `useTransition`/uncontrolled-during-drag/committed-on-release, or a ref-backed transient channel feeding physics.)
- **No per-tick re-pack:** Engine B's `packMemberPositions`/footprint recompute is off the hot path entirely (positions come from the worker).
- **GPU upload throttle:** keep the byte-identical dirty-check; additionally skip re-upload when the per-frame max position delta is below a small epsilon, so a nearly-settled ease stops uploading. Upload at most once per frame (already rAF-driven).
- **Worker sync:** verify positions sync from worker uses transferable/typed copy without extra allocation per frame (existing `getPositions` reuses a buffer — keep that).

## Data flow (target)

```
slider drag
  └─ DimensionSlider.onChange
       └─ SliderContext: transient value (no full sidebar re-render)
            └─ schedulePush (rAF coalesce) ─→ physics.updateSliders(normalized)   [worker]
                 └─ applySliderForces: per-dim pull strength + repulsion
                      └─ d3 sim ticks (worker) → positions  [continuous, organic, no centering]
                           └─ getPositions() → pushPositions() → cosmos.gl upload (throttled)
                                └─ (debounced) emergentBlobs() → hulls + merged labels (eased)
                                     └─ camera auto-fit on settle / spread change
```

## Edge cases

- **0 sliders active:** calm scatter (repulsion only); no blobs/labels. (Existing behavior.)
- **1 slider active:** groups by that single attribute's targets — emergent per-value blobs, labeled. ("not only by role": whichever single slider is engaged.)
- **All-same value across nodes for an active dim:** that dim contributes a single target ⇒ no separation; layout driven by the other active dims (or pure scatter). Must not divide-by-zero in blob radius.
- **Very large k of emergent groups:** top-N cap + proximity merge keeps the label count legible.
- **Rapid drag then release:** transient value commits on release; physics reheats smoothly via the existing accumulator/skip-gate (`physicsLayer.ts:495`) so a slow drag still animates and a fast drag doesn't thrash.

## Testing

- **Unit (pure):**
  - `emergentBlobs.ts`: deterministic given fixed positions+signatures; proximity merge collapses co-located signatures; top-N + residual; labels are human strings; no NaN on degenerate spread.
  - slider→strength mapping monotonic (higher slider ⇒ higher pull strength ⇒ tighter; assert via `applySliderForces` return/inspection).
  - organic shape: assert layout is **not** rescaled to a constant extent (no `TARGET_EXTENT` dependency in the live path); bbox varies with input distribution.
- **e2e (`npm run test:e2e`, :3100, `NEXT_PUBLIC_ACC_GRAPH_TEST`):**
  - drag a slider → no long-frame jank (perf probe over the drag) and positions change continuously (no single-frame teleport beyond a delta bound).
  - two sliders → emergent blob count is far below the tuple-product count for the same dims.
  - shell renders, load + cross-filter + export still pass.
- **Gates:** full unit suite green, `tsc` 0 errors, e2e green (lasso load-flake is a known machine-load artifact, not a regression).

## Rollout / risk

- Engine A is already proven in production paths; this change makes it authoritative and *removes* the override — net reduction in moving parts.
- Risk: tests asserting discrete tuple blobs / fixed footprints will fail and must be updated or retired (they encode the superseded behavior).
- Implement incrementally with verification after each part; do not `npm run build` while the :3000 app is running (it 500s the live app — known trap). Stage commits by explicit path (branch has large unrelated WIP).
