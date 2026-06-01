# Organic Composite Clusters — Design

> Date: 2026-06-01 · Branch: `feat/access-analysis-redesign` · Surface: `/users/access-analysis` 2D cluster view

## Goal

Three changes to the 2D dominant-attribute cluster view, from live UAT feedback:

1. **Composite clustering** — when more than one slider is engaged, blobs group by the *combination* of the active attributes (not a single "dominant" winner).
2. **Organic general placement** — blobs stay circular, but the global arrangement is an irregular, breathing, force-relaxed scatter instead of a rigid packed circle. The all-0 state is organic noise, not a tidy disc.
3. **Perf + framing** — remove the lag introduced by the new cluster path, and fix the camera-framing defect (blobs rendering off-screen, see `tests/e2e/acc-cluster-blobs.spec.ts` fixme).

## Library / model decision

**No new dependency.** Use `d3-force` (already installed: `^3.0.0`) for a **force-directed circle-packing** model: `forceCollide(footprintRadius)` enforces the non-overlap invariant while `forceManyBody` + a weak center gravity (`forceX`/`forceY` toward origin) produce the organic outer shape. This replaces the deterministic `d3-hierarchy` `packSiblings`→`packEnclose`→fixed-circle path. Rejected alternatives (no added dep justified): webcola (constraint overlap-removal, heavier), d3-delaunay Lloyd relaxation (even but not more organic), poisson-disk-sampling (only helps the scatter; jitter/collide suffices). Adding deps is also undesirable while `package.json`/`package-lock.json` carry unrelated WIP.

## 1. Composite clustering

- Replace the single `dominantCatalogDim(sliderDims, sliderValues)` selection with `activeSliderDims` = all slider dims whose value > 0 (order stable by registry order).
- Grouping key per node = the **tuple** of those dims' extracted values (e.g. `role="Architect"|company="Acme"`). `buildDominantClusters` generalizes to `buildCompositeClusters(features, activeDims)`: it keys by the joined tuple, materializes only **non-empty** tuples, and returns `{ ids, labels, counts }` exactly as today (so the renderer/labels are unchanged).
  - Single active slider → identical to today's behavior (tuple of one).
  - Empty combinations never appear, so blob count is bounded by real co-occurrence, not `|Role|×|Company|`.
- **Label:** the joined value (e.g. `Architect · Acme`). The "Grouping by:" chip joins active dim labels: `Grouping by: Role + Company`.
- **Tightness:** `max` of the active sliders' normalized values (unchanged mapping; one knob for fill).
- **Tiny-blob guard:** tuples with `count < max(1, floor(0.001 × N))` are folded into a single faint `"Other"` blob so 2+ broad attributes can't shatter the view into hundreds of specks. Configurable threshold; logged count of merged groups. (Owner approved a guard; surface the merged count in the indicator, e.g. `Grouping by: Role + Company (+38 small → Other)`.)

## 2. Organic non-overlapping placement

New pure module `clusterForceLayout.ts` (sits beside `clusterPacking.ts`; the sunflower member placement in `clusterPacking.ts` is reused unchanged):

- Input: per-cluster `counts` → footprint radius `BASE·sqrt(count)` (same sizing as today, clamped min/max).
- Run a **deterministic, headless** `d3-force` simulation of `k` circle nodes:
  - `forceCollide(r_i + padding)` — guarantees non-overlap (the plan's hard invariant) with breathing room.
  - `forceManyBody` (mild negative) + `forceX(0)`/`forceY(0)` weak gravity — organic clumping toward center without a hard circular boundary.
  - Seed positions **deterministically** (hashed by cluster label → stable angle/radius) and use a **fixed iteration count** with no `Math.random()` (purity + stable across renders; same input → same layout, no per-frame jitter). `tick()` N times synchronously, then read `x,y`.
- Output: the same `{ cx, cy, r }` `ClusterFootprints` shape `packClusterFootprints` returns today → drop-in for `packMemberPositions`, `ClusterLabels`, and the transition layer. **No renderer change.**
- **Scatter (all-0):** replace the GPU random-disc seed and any disc fallback with organic noise — a deterministic jittered distribution (hashed per node) with a gentle collide pass, so "nothing selected" reads as an organic cloud, not a circle.
- Footprints are recomputed **only when the active-slider set or the grouping changes**, never per frame.

## 3. Perf + framing

- **Recompute gating:** memoize footprints/clusters on `(activeSliderSet, features)` only; tightness changes feed the transition layer without re-packing. (Today a `useMemo` already exists; verify deps exclude per-frame values.)
- **Label projection throttle:** `ClusterLabels` projects every footprint center each rAF; throttle to ~20–30 Hz and skip when unchanged. Cheap win for the lag.
- **Camera framing fix:** rewrite the deferred-`fitView` so it frames the *actual* settled footprint bbox. Because the force layout has a known bbox (we computed `cx,cy,r`), pass that extent to a single, correct fit instead of relying on cosmos's stale committed bbox under `dontRescale=true`. Re-tune the label-LOD threshold against the fitted zoom so labels stay visible (the earlier naive fix dropped them). Verified via the `acc-cluster-blobs.spec.ts` `LABEL_DIAG` (`withinCanvas ≈ total`, `revealedAndInside` high) — un-skip the fixme.

## Unchanged

Circular blobs + sunflower members, cluster-id color (`clusterColors`), smooth 0↔1 exp-smoothing transition (`clusterTransitionLayer`), the catalog slider sidebar, the two-bus mask model, the 3D path.

## Testing

- Unit: `clusterForceLayout.test.ts` (non-overlap invariant after relaxation; deterministic same-input→same-output; bbox finite; k=0/1 edge cases). `buildCompositeClusters` tests (single=identity; tuple keying; non-empty only; tiny-blob merge). Reuse `clusterPacking` member tests.
- e2e: extend `acc-cluster-blobs.spec.ts` — composite test (Role+Company → more blobs than Role alone, indicator shows both, no NaN), and un-skip the framing `fixme` once the camera fit lands.
- Gates: `npm test`, `tsc --noEmit`, `npm run lint`, `npm run build`.

## Risks

- **Determinism:** force layouts can be sensitive to seed; fixed seed + fixed iterations + no RNG keeps it stable. Guard with the same-input→same-output test.
- **Blob-count blow-up** with 3+ broad attributes — mitigated by the tiny-blob `Other` merge; revisit cap if needed.
- **GPU-on vs e2e (GPU-off):** framing must be verified on the live `:3000` (GPU-on) build, which the e2e can't exercise — owner eyeball + `LABEL_DIAG` numbers together.
