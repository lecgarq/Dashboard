# Deterministic cluster blobs + smooth labels — design

**Date:** 2026-05-29
**Branch:** `feat/access-analysis-redesign`
**Status:** design, pending implementation plan

## Problem

On the 2D access-analysis graph, raising a single dimension slider (e.g. `Role = 100`,
everything else 0) does **not** produce clean, separated, single-attribute blobs. Observed
(screenshot, light mode): a diffuse cloud with role-colors intermixed across the whole
canvas, faint same-user edges threading between differently-colored nodes, and **zero**
cluster labels visible.

Three distinct defects, in two layers:

1. **Separation (physics/force layer).** Blobs are separated by *balancing forces*
   (`mapDominantForceConfig`: cluster pull `0.8` vs repulsion `0.5` on a fixed-radius
   `1700` disc). With a few large roles (thousands of nodes each), a blob's natural radius
   exceeds the spacing between sunflower anchors, so neighboring blobs overlap into one
   cloud. Same failure family as the earlier "centermass piled together" UAT.
2. **Labels (overlay layer, `ClusterLabels.tsx`).** Two stacked filters hide nearly all
   labels: an arbitrary `MAX_LABELS = 60` cap, then a per-frame greedy declutter
   (`SEP_X=132`, `SEP_Y=24`) that `display:none`s any label colliding with one already
   placed. At default zoom almost everything collides → nothing shows. Pills are heavy,
   opaque, bordered, bold — they read as UI chrome, not map labels. Labels are pinned to
   the *fixed anchor*, which in a loose layout does not coincide with the visible node
   mass, so they feel "floating/fixed."
3. **Correctness (data layer).** Two independent grouping/encoding paths can disagree:
   clustering extracts each attribute via the **new** `dimensionCatalog`
   (`dominantClusters.ts`), while node color extracts via the **legacy**
   `dimensionRegistry` (`nodeColors.ts`). Divergent extractors make a *correct* single-
   attribute blob look mixed when colored. Color is also a hash→hue
   (`hash32(category) % 360`), so many categories produce near-duplicate hues.

## Goals

- `Role = 100` (everything else 0) renders clean, **separated**, single-role blobs — and
  the same holds for **every** dimension.
- Labels **follow the blob center**, are **not overwhelming or overlapping**, and feel
  **smooth and professional**.
- A clear, non-confusing model for what **multiple sliders** do.
- Verify clustering correctness **per dimension**, not just role.

## Non-goals

- No change to the ingestion pipeline or feature snapshot shape.
- No redesign of the 3D view (labels render in 2D only, as today).
- No new dimensions; this is about *how existing dims cluster and are labeled*.

## Decisions (locked with the user)

- **Separation:** deterministic packing (chosen over force-tuning and hybrid).
- **Multi-slider model:** "strongest slider wins" — one attribute groups at a time
  (user delegated the choice: "make it intelligently to don't be confusing").
- **Labels:** live-center-following + zoom-adaptive density + lightweight styling.

---

## Design

### 1. Multi-slider model: "strongest wins, one attribute at a time"

The grouping attribute is the single highest slider (`dominantCatalogDim`, unchanged). Its
**value is the tightness** of the resulting blobs. Other raised sliders do not co-group;
pushing a different slider above the current strongest **regroups** by that attribute.

To remove the confusion that this rule is invisible today, add an always-visible
**"Grouping by: <Dimension>"** indicator near the graph that updates the instant the
strongest slider changes. No silent no-ops, no surprising auto-coloring. This is the entire
multi-slider story — deliberately simple.

### 2. Separation: deterministic packing (new pure module)

Replace force-based separation with computed positions. New pure, deterministic module
(`clusterPacking.ts`, sibling to `dominantClusters.ts`; no React/DOM/IO, no random/clock):

- **`packClusterFootprints(counts: number[], opts): { cx: Float32Array; cy: Float32Array; r: Float32Array }`**
  - Footprint radius per cluster `r_c = clamp(BASE * sqrt(count_c), R_MIN, R_MAX)` so blob
    *area* scales with membership (a 3,000-node and a 12-node blob look proportionate).
  - Circle-pack the footprints with a gap factor (`r_pack = r_c * (1 + GAP)`): place largest
    first at origin, then each next circle along a deterministic spiral at the first angle
    where it collides with none already placed. O(k²) collision checks, run **once per
    re-group** (not per frame); acceptable for k up to a few thousand. For very large k,
    fall back to a pure Vogel-spiral placement sized to the max footprint (guaranteed
    non-overlap without collision search).
  - **Invariant (unit-tested):** for all i≠j, `dist(center_i, center_j) ≥ r_i + r_j`.
- **`packMemberPositions(clusterIds, centers, radii, tightness): Float32Array`** (stride-2)
  - Each node placed on an inner Vogel sunflower inside its footprint, at fill radius
    `r_fill = r_c * fill(tightness)`, where `fill` goes from ~`1.0` (loose; fills footprint)
    at low tightness to ~`0.45` (tight core) at high tightness. Because `r_fill ≤ r_c` for
    all tightness, members never escape the footprint → **blobs cannot overlap at any
    slider value.** Deterministic member ordering (by node index within cluster).

The slider's tightness only varies fill **inside** the fixed footprint — exposing the
control without ever breaking the separation invariant.

### 3. Rendering integration

When a dominant dim is active, the labeled-cluster view uses the **packed positions
directly** and the cluster force is **disabled** — separation is structural, not emergent,
so there is no repulsion-vs-pull drift. Mechanism:

- Shell computes packed per-node positions (pure) whenever clustering or tightness changes.
- Those positions become authoritative for the 2D view (written through the physics buffer
  / pushed to cosmos with the cluster sim off). Tightness changes **animate** by
  interpolating to the new packed positions (reuse the existing preview-interpolation/lerp
  path so it stays smooth, not a snap).
- When **no** dominant dim is active (all sliders 0), behavior is unchanged: calm scatter /
  GPU free-explore. The deterministic path is scoped to the labeled-cluster view only.

*Implementation latitude:* the exact cosmos wiring (frozen `pushPositions` + `enableSimulation:false`
for cluster mode vs. per-node pinning) is for the plan to finalize, under the hard constraint
that **separation must not depend on force balance.** This also makes the cluster view fully
deterministic, which the frozen-positions lasso/selection e2e suite prefers.

**Transition animation — handle the `0↔1` boundary with care.** This is a first-class
requirement, not a polish afterthought. The boundary at slider `0` is where the view
*switches regimes* — true scatter / GPU free-explore at exactly 0 ↔ deterministic packed
blobs at >0 — so a naive swap teleports nodes across that line. Rules:

- **Never hard-swap positions.** Every layout change (engage, disengage, regroup, tightness)
  animates by **interpolating current → target** node positions over a capped, eased
  (ease-in-out) duration. The renderer always tweens; it never assigns a new buffer outright.
- **Re-seed from the visible state on every change.** Reuse the existing preview-interpolation
  pattern (`seedFrom(current positions)` / `syncPositions`) so a continuous slider drag
  re-targets from where the nodes *currently are*, not from a stale base — no restart, no
  stutter mid-drag.
- **`0 → engaged` (scatter → blobs):** tween from the current scatter buffer to the packed
  buffer. The GPU sim and the tween must not both write positions in the same frames.
- **`engaged → 0` (blobs → scatter):** tween from packed back to a calm, deterministic
  scatter target; hand control to the GPU free-explore sim (if used) **only after** the tween
  settles, seeded from the tweened positions so it cannot jump.
- **Boundary continuity:** prefer making the `t→0` limit of the packed layout visually close
  to the scatter state (fill radius grows as tightness drops) so the cross-0 tween distance is
  small and the handoff is nearly invisible.
- **Regroup (dominant dim switch):** the largest jump; animate the reflow (optionally a brief
  cross-fade) so blobs visibly migrate to the new grouping rather than teleport.
- **Robustness:** cap per-frame `dt` (as the existing preview layer already does at ~50ms) so
  resuming from a backgrounded tab doesn't lurch; and guard against NaN/empty-target flashes
  when `clustering` becomes null (hold the last frame, then tween).

### 4. Labels (rewrite `ClusterLabels.tsx`)

- **Center-following, no per-frame centroid math.** With deterministic packing the blob's
  center *is* its packed center; project that through `spaceToScreen` each frame so labels
  ride pan/zoom and sit exactly on the blob. (If the plan keeps any residual motion, fall
  back to averaging `getPointPositions()` per cluster — but deterministic centers make this
  unnecessary and perfectly stable.)
- **Zoom-adaptive density (removes overwhelm).** Drop `MAX_LABELS=60`. A label shows only
  when its blob's **on-screen radius** clears a pixel threshold (derive on-screen radius
  from the packed footprint radius × current `getZoomLevel()` / spaceToScreen scale). Zoomed
  out → only the big blobs are labeled; zoom in → smaller ones reveal. Keep the greedy
  declutter as a safety net for the rare residual overlap.
- **Lightweight, professional styling.** Replace the heavy opaque pill with: a small
  color-matched dot + label text on a subtle translucent backdrop (light blur, no hard
  border, reduced weight). **Opacity fade-in/out** (CSS transition) as labels cross the
  zoom threshold so nothing pops.

### 5. Per-dimension correctness audit

Keying is shared by dimension *kind*, so audit by kind + representative spot-checks rather
than 204 dims by hand:

- **Unify extraction.** Clustering and coloring for the same dimension must read through a
  single source of truth (the `dimensionCatalog`), eliminating the catalog-vs-legacy-registry
  divergence in `nodeColors.ts`. This is the most likely real contributor to "different roles
  in one cluster."
- **Verify keying per kind:** `categorical`/`binary` group by exact value; `multiHot`
  (moduleAccess) by sorted set; `ordinal` (permission/tenure/activity) by bucket. Confirm
  null/`(none)` handling collapses to one explicit bucket, not silently into a neighbor.
- **Guard test per family:** every dimension that has distinct values in the data produces
  `>1` cluster and never collapses everything into a single blob (the degenerate behind the
  complaint). Assert against the real feature set (n≈16,942).
- **Palette check:** confirm how many distinct categories the dominant dims actually have
  (role/company/project) and whether hash→hue produces indistinguishable hues; decide
  whether to widen to a curated categorical palette or rely on labels to disambiguate.

## Affected code

- New: `clusterPacking.ts` (+ `clusterPacking.test.ts`) — pure packing math.
- `dominantClusters.ts` — `clusterPositions2D` superseded by footprint packing; keep
  cluster assignment (`buildDominantClusters`) as the keying source of truth.
- `AccessAnalysisShell.tsx` — compute packed positions; feed cluster view; "Grouping by"
  indicator; unify color extraction with cluster extraction.
- `GraphCanvas.tsx` / `GraphCanvas2D.tsx` — render packed positions with cluster force off
  for the labeled view; animate tightness transitions.
- `ClusterLabels.tsx` — rewrite per §4.
- `nodeColors.ts` — extract via catalog; palette decision.

## Risks / open questions

- **Packing performance at high k** (≈1,000+ project blobs): mitigated by the Vogel-spiral
  fallback; the plan should pick the k threshold empirically.
- **Transition smoothness**, especially the `0↔1` regime boundary and full regroups — see
  the transition rules in §3. This is a known trap (interpolate-don't-swap, re-seed from
  visible state, defer GPU handoff); the plan must treat it as a tested requirement, not
  polish.
- **Scope of the rendering change:** moving the labeled view off the GPU force path is the
  largest change; the plan must confirm the GPU free-explore path is untouched and the
  frozen e2e suite still passes.

## Success criteria

- `Role = 100` shows visibly separated, single-role blobs with no cross-role bleed;
  spot-checked across `company`, `project`, `permission`, `moduleAccess`, `tenure`.
- Labels track blob centers under pan/zoom, are readable, never a wall of boxes, and fade
  smoothly with zoom.
- **Slider transitions are smooth in both directions** — `0→1` (scatter forms blobs) and
  `1→0` (blobs release to scatter) interpolate with no teleport, no stutter on continuous
  drag, and no jump when GPU free-explore resumes. Regrouping reflows rather than snaps.
- "Grouping by: <X>" reflects the strongest slider live.
- Full repo suite green (unit + tsc); frozen lasso/selection e2e unaffected.
