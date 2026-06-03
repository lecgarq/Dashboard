# Access graph LOD (level-of-detail) — design

**Goal:** hold a 60fps slider-drag on the single User-name graph. The drag cost is cosmos.gl
re-prepping + re-uploading **16,942 points every frame**. LOD draws far fewer points when detail
isn't needed.

## Triggers
- Luis chose "both" (zoom + drag). SHIPPED: **drag-only** — aggregate ONLY while the slider is
  being dragged; settled → full detail. **Why drag-only:** cosmos hit-testing (lasso/click/hover)
  returns its CURRENT point indices — in aggregate mode those are cluster reps, so a lasso would
  select the wrong things. Keeping settled = full means every interaction runs on real nodes.
  The zoom-OUT→aggregate trigger is DEFERRED until interactions are made LOD-aware (force full
  during a lasso/hover, or remap aggregate hits → cluster). getZoomLevel handle + the infra remain.
- **VERIFIED: slider drag = ~115fps on real GPU** (headed Playwright). Headless = software-GL bound
  (~13fps) and can't represent real hardware; the profile confirmed LOD halves the CPU upload cost.

## Aggregate set
One dot per **user-cluster** (~3,367, vs 16,942 instances → ~5× fewer points). Critically, each
aggregate dot **morphs**: its position is `lerp(cluster rest centroid → cluster clump center,
easeMorph(slider))` — the exact path the labels follow — so the gathering stays visible at the
cluster level. Size = √(member count); color = cluster color. (Future: coarser binning to reach
"hundreds" if 3,367 still isn't enough on real hardware.)

## Build order (each step independently verifiable)
1. **`lodState.ts`** (PURE) — `resolveLodMode({zoom, dragging, zoomThreshold})` → "aggregate" | "full".
   Unit-tested truth table for the both-triggers logic. ✅ this commit.
2. **`lodAggregate.ts`** (PURE) — `buildClusterAggregates(...)` (per-cluster rest/clump/size/color,
   built once per regroup) + `aggregatePositions(agg, easedProgress, out)` (allocation-free per-frame
   stride-2). Unit-tested. ✅ this commit.
3. **Renderer integration** (NEXT — edits GraphCanvas2D per Luis's OK).
   ✅ **SPIKE DONE (2026-06-02): approach (a) is viable.** Pushed 120 points to a cosmos graph
   initialized with 16,942 → it reported 120, no error. So cosmos accepts a variable point count via
   `setPointPositions`/`setPointColors`. No second WebGL context or overlay renderer needed.
   Concrete plan:
   - GraphCanvas2D: add `setPointSet(xy2, colors, sizes?)` — ATOMIC switch to a new point count (called
     on LOD mode change); per-frame within a mode, keep using position-only `setPointPositions`.
   - rAF loop / GraphCanvas: each frame read zoom (`handle.getZoomLevel()`) + dragging
     (SliderContext `subscribePreviewActive`), `resolveLodMode(...)`, and on a mode change call
     `setPointSet`; within aggregate mode push `aggregatePositions(...)` (K pts), within full mode push
     the full eased target. On settle/zoom-in, switch back to full + push final full positions once.
   - Shell: pass the aggregate data (`buildClusterAggregates` from clustering + blobRestCenters +
     footprints) + aggregate colors (one per cluster) + sizes into the canvas.
   - Verify: fps on continuous drag (target 60), and NO regression to full-detail hover/click/lasso.
   - Rejected (spike made them unnecessary): (b) `<canvas>` overlay, (c) second cosmos instance.

## Invariants
- Never break the working full-detail graph (currently freeze-fixed, all tests green).
- Interaction (hover/click/lasso) stays on real nodes in full mode; aggregate dots are display-only.
- Organic, never a grid (carries over).
