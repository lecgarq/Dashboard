# Real-time "Group by + Strength" grouping on the projector map

- **Date:** 2026-06-08
- **Status:** Approved (design) — pending implementation plan
- **Surface:** `/users/spatial-graph` (and `/users/access-analysis`) → `AccessAnalysisShell`
- **Branch:** `feat/access-analysis-redesign`

## Problem

The spatial graph's default view is the static t-SNE/UMAP **"projector" scatter** (the look the
owner approved). Its sidebar shows ~14 per-attribute sliders (Project, Role, User name, Company,
Status, and a permission ladder from "View Only" to "Full Controller"). **Dragging any of them does
nothing.**

Evidence (frames extracted from `PROBLEM 2.mov`, recorded 11:51, against the 11:39 build = latest code):
at 0:03 the **Project slider reads 100**; at 0:22 it reads **46** — yet the galaxy's shape is
**identical**. Confirmed in code: the default map runs `createStaticLayer`, whose
`updateSliders()` is `{/* inert */}` (`staticLayer.ts:26`), and the shell passes
`layoutTarget={ACC_3D_GRAPH_ENABLED ? layoutTarget : undefined}` (`AccessAnalysisShell.tsx:323`) —
so on the default map there is no layout target and the sliders are wired to nothing.

This is the trade-off the recent projector pivot created:

| | Old physics graph (flag-ON, parked) | New projector map (flag-OFF, live default) |
|---|---|---|
| Sliders | Worked (drove a live GPU force layout) | Dead (no-op) |
| Motion | Laggy + jumpy (`problem.mov`) | Smooth, but frozen |

## Goal

Make the map's controls **re-group the dots in real time and seamlessly** — no lag, no jumping —
while keeping the projector scatter as the resting look.

### Decisions (confirmed with the owner)

1. **Slider behavior:** sliders should **re-group the map by an attribute** (0 = free scatter; raise
   = same-attribute dots glide together).
2. **Slider model:** **simplify** the wall of ~14 sliders to **one "Group by" picker + one
   "Grouping strength" slider** (one clean lens at a time; no muddy multi-blends).
3. **Approach:** **wire up the morph engine that already exists** (reject: recompute a supervised
   projection per change; reject: revive + optimize the old GPU physics graph).

### Non-goals

- The parked flag-ON physics graph (`NEXT_PUBLIC_ACC_3D_GRAPH=1`) stays as-is (fallback).
- Filters / search / lasso / click→profile/neighbors / edges / zoom-pan are unchanged (they never
  move dots; they ride the MASK bus, which is independent of layout).
- No multi-attribute blended grouping; no cross-tab grid (repo rule: layouts are always organic,
  never a fixed grid).

## Approach: connect the existing morph engine

The grouping morph is already built and proven smooth (~107 fps on 16,942 nodes per the last perf
pass). It is simply gated off on the default map.

Reused, unchanged:
- **`clusterTransitionLayer.ts`** — exp-smoothing of the *displayed* positions toward a settable
  target; re-targeting mid-flight never restarts or teleports (`setTarget`/`step`/`seedFrom`).
- **`layoutDescriptor.ts` → `descriptorTarget(... "blob" ...)`** — per-frame, allocation-free morph
  of each node from a `loose` endpoint (s=0) to a `packed` endpoint (s=1), smoothstep-eased
  (`easeMorph`).
- **`GraphCanvas.tsx`** — `getPositionsOverride` steps the transition layer toward `layoutTarget()`
  each frame with the GPU sim paused; the rAF pump runs while `clusterActive` and parks (dirty-check)
  when settled. Per `GraphCanvas.tsx:391-393`: *"positions are now always descriptor-driven with the
  GPU sim paused."* This path needs **no physics** — exactly what we want.
- **`MapClusterLabels.tsx`** — renders labels at blob centers (`footprints.cx/cy`); currently gated
  to flag-ON.

The one mismatch: the existing `buildUserBlobDescriptor` uses `loose = packMemberPositions(...,
LOOSE_TIGHTNESS, ...)` as the s=0 endpoint — a loosely-grouped footprint, **not** the embedding
scatter. For this design the s=0 endpoint must be the **embedding coords** so strength-0 is the
projector look exactly.

## Architecture

### New (pure)
- **`buildEmbeddingBlobDescriptor(features, dim, embeddingXy)`** → `Extract<LayoutDescriptor,{kind:"blob"}>`
  - `clustering = buildDominantClusters(features, dim)`
  - `footprints = layoutClusterFootprints(clustering.counts)` — **normalized to the embedding's
    bounding box** (see Risk: scale match)
  - `loose = embeddingXy` (stride-2, node-index aligned — the s=0 scatter endpoint)
  - `packed = packMemberPositions(clustering.ids, footprints, 1, features.length)` (s=1 clump cores)
  - Returns `{ kind:"blob", dimId, clustering, footprints, loose, packed }`.
  - `descriptorTarget`'s `"blob"` branch is reused verbatim: it lerps `loose → packed` by
    `easeMorph(strength/100)`.

### New (UI)
- **`GroupByControls`** (replaces `CatalogSliderSidebar` on this view): a **Group by** select + a
  **Grouping strength** slider (0–100). Emits `{ groupBy: DimensionId, strength: number }`.

### Changed
- **`AccessAnalysisShell.tsx`**
  - Build the embedding-blob descriptor on the **default (flag-OFF)** map from the precomputed
    embedding coords (the same `xy` that seeds `createStaticLayer`) + the selected `groupBy` dim.
  - Pass `layoutTarget` on the default map (drop the `ACC_3D_GRAPH_ENABLED ? … : undefined` gate for
    this path) so `clusterActive` turns on; keep `gpuSimulation={false}` (no force solve).
  - Enable `MapClusterLabels` centers/labels on the default map, **opacity scaled by strength** (no
    labels at rest).
  - `autoColorMode` follows the `groupBy` dim (was hard-pinned to `"cluster"` when flag-OFF); keep
    the sticky Color override + Reset.
  - State: a single `groupBy` + `strength` replaces the per-dim slider map. `getLiveValues()` (read
    per-frame by `layoutTarget`) returns `{ [groupBy]: strength }` so `descriptorTarget` sees the
    live value with no React re-render on drag.

### Untouched
- Flag-ON physics graph; MASK bus; profile/neighbors panel; edges; theme follow.

## Data flow

```
Group by select / Strength slider  (GroupByControls)
        │
        ├─ groupBy change → rebuild descriptor (packed endpoint for new dim; loose stays = embedding)
        │                    → clusterTransitionLayer re-targets, eases over (no teleport)
        │
        └─ strength change → valuesRef = { [groupBy]: strength }  (synchronous; rAF-coalesced React state)
                              │
                  per frame: layoutTarget() = descriptorTarget(desc, getLiveValues(), out)   // alloc-free
                              │
                  getPositionsOverride(): layer.setTarget(target); layer.step(dt); return snapshot()
                              │
                  pushPositions(eased)  // dirty-checked; parks when settled
```

- **strength 0:** target == embedding == seed → settled → projector scatter, zero cost.
- **raise strength:** target morphs toward clumps; displayed eases in; labels fade in.
- **change Group by mid-raise:** packed endpoint swaps; layer eases to the new target.
- **strength → 0:** target returns to embedding; displayed eases back to scatter.

## Motion model

- Smoothstep (`easeMorph`) endpoints exact at 0 and 1; slope 0 at both ends → a small nudge off 0
  moves only a little (no 0→1 jump).
- `clusterTransitionLayer` TAU≈35 ms, settle EPSILON 0.75 (sub-pixel in cosmos's ≈±350 space) →
  ~1 s settle, then the pump parks.
- No GPU physics anywhere on this path → nothing to reheat, overshoot, or stutter.

## Group-by picker & color

- Picker offers **categorical** dims that form sensible blobs: Company, Role, Project, Permission
  tier, Internal/External, Admin/Member, Account status, Dominant activity. Numeric dims (Activity
  volume, Membership tenure, Activity recency, Risk score, Permission strength) are **bucketed**
  before grouping, or excluded from the picker — decided in planning.
- **Color auto-follows `groupBy`** once grouping (strength > 0) so blobs are color-coded; the
  existing Color dropdown overrides (sticky) and Reset returns to auto. Two open planning details:
  the default group-by value, and whether the **resting state (strength 0)** keeps today's
  color-by-spatial-cluster galaxy or already colors by the group-by attribute. Safe default: keep
  the approved cluster galaxy at rest, transition color toward the group-by attribute as strength
  rises.

## Edge cases & risks

1. **Scale match (primary risk).** Embedding coords (cosmos space ≈±350) and clump footprints
   (`layoutClusterFootprints`) must share one coordinate scale; otherwise the whole cloud rescales
   during the morph and reads as a jump. **Mitigation:** normalize footprint layout to the
   embedding's bounding box; add a unit test asserting the bounding box is stable across strength
   0→100.
2. **Many-valued attributes:** top-N groups + grey "Other" (mirror the existing 12-bucket color
   model) to avoid hundreds of tiny blobs.
3. **Re-group mid-drag:** handled by the easing layer (re-target, no restart).
4. **Label clutter at 17k nodes:** labels only for real blobs; fade with strength; reuse
   MapClusterLabels zoom-LOD.
5. **Node-index alignment:** `loose`/`packed`/`embeddingXy` must all be indexed by feature index;
   assert lengths == `features.length * 2`.

## Testing

- **Unit** — `buildEmbeddingBlobDescriptor`: s=0 endpoint equals embedding exactly; s=1 equals clump
  cores; alignment by node index; footprint normalization keeps the bounding box within tolerance of
  the embedding across strength 0→100.
- **Component** — `GroupByControls` drives `{groupBy, strength}`; color follows group-by; Reset
  restores auto.
- **E2E** (existing graph harness, `NEXT_PUBLIC_ACC_GRAPH_TEST`) — strength 0 = scatter (positions
  == embedding); raise strength → positions approach the target monotonically with **no
  single-frame delta above a jump threshold**; change Group by → re-target; strength back to 0 =
  scatter.
- **Visual UAT** — owner, after a rebuild (deploy = `npm run build` + restart; do not build under a
  running :3000).

## Open items for the planning phase

- Footprint→embedding scale normalization implementation + tolerance.
- Group-by picker exact list; numeric-dim bucketing vs exclusion.
- Default group-by value; rest-state color (group-by vs spatial cluster).
- Whether to keep `SliderContext` (feed a single synthetic dim) or introduce a small dedicated
  `groupBy/strength` store.
- Whether to render this in place on the flag-OFF path or behind a short-lived rollout flag.
