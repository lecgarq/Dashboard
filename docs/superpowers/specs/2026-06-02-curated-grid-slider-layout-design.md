# Curated Cross-Tab Slider Graph — Design

**Date:** 2026-06-02
**Branch:** feat/access-analysis-redesign
**Surface:** `app/(dashboard)/users/access-analysis/` (the cosmos.gl graph served at `/users/spatial-graph` via `AccessAnalysisShellClient`)
**Supersedes (for the slider-layout behavior):** the discrete-packed direction in `add0df8` and the k-means similarity path in `2026-06-02-live-similarity-layout-design.md` §Part 3. Keeps that spec's lag diagnosis (it was correct) but resolves it while **preserving clean, separated clusters** rather than emergent hulls.

## Problem (owner-reported, 2026-06-02)

1. **Lag when dragging a slider.** Now that labels render correctly, dragging is laggy again.
2. **Two sliders behave weirdly + no coherent way to read them.** Engaging a second slider produces an opaque result.
3. **The organic initial form (0 sliders) was never fixed.** At rest the cloud looks artificial.
4. **Too many sliders to reason about.** Owner wants to pare down to **Project + Role** to test, plus a new **User name** slider, and keep the remaining dimensions defined but inactive ("safe").

## Root cause

Two layout engines exist and the **CPU packed engine** is currently authoritative for the slider view:

- `AccessAnalysisShell.tsx` computes `clusterPackedPositions` via `packMemberPositions` (`clusterPacking.ts`) gated on `[clustering, footprints, tightness]`. `tightness = max(active slider)/100` recomputes on **every value tick**, so every drag frame: (a) re-packs all ~16,942 nodes into a fresh `Float32Array`, (b) re-renders `ShellBody` (and recomputes `clusterCloudCorners`), (c) eases + re-uploads to cosmos. That per-frame chain is the lag. (`GraphCanvas.tsx` even documents this: the slider tick "burning a full physics pass on every node … the dominant source of the slider-drag lag.")
- Two active sliders run `buildSimilarityClusters` (`dominantClusters.ts`): **k-means** collapsing thousands of project·role signatures into ≤8 buckets labelled by their largest member. The 8 buckets map to nothing interpretable → "weird."
- 0 sliders: `GraphCanvas2D.tsx` GPU branch seeds a **uniform random disc** (`sqrt(random)*800`) → not organic.

**Mathematical observation that unlocks the fix:** a blob's "tightness" is only a *radial scale* around a fixed center; a grid band's separation is only a *scalar pitch* on a fixed lattice. Neither requires re-packing nodes. So slider **structure** (which value → which cell, each node's offset, labels) can be computed **once per grouping change**, and the slider **value** applied as a cheap per-frame scalar — never through React, never a re-pack.

## Goals

- **G1 — No perceptible drag lag.** Heavy work happens once when a slider is toggled on/off, not per drag frame. No `ShellBody` re-render on a value drag; no per-frame re-pack/realloc.
- **G2 — Coherent two-dimension view.** Two active sliders render a **cross-tab grid** (axis × axis) with header labels; never k-means buckets.
- **G3 — Clean separated clusters preserved.** Separation stays structural (packed inside non-overlapping cells/footprints), not force-discovered.
- **G4 — Organic rest form.** 0 sliders → a static, data-defined "gentle real grouping" cloud (soft shared-project clumps, density-varied, no fixed circle, no labels).
- **G5 — Pared-down, safe slider set.** Only Project / Role / User name are active and visible; all other catalog dims remain defined but filtered out, re-enableable by editing one array.

## Non-goals

- 3D mode layout is unchanged except where it shares the physics path.
- No data-ingestion, taxonomy, or `/access-analysis` (ECharts dashboard) changes.
- We do not delete `buildSimilarityClusters` / the packed-override props; we stop **invoking** them for the slider layout (dead-but-safe), to keep the diff reversible.

## Design

### Part 1 — Curated slider set (G5)

- Add one source-of-truth constant, e.g. `curatedSliders.ts`:
  ```ts
  export const CURATED_SLIDER_IDS = ["project", "role", "user"] as const;
  export function curatedSliderDimensions(catalog): CatalogDimension[] {
    return sliderDimensions(catalog).filter((d) => CURATED_SLIDER_IDS.includes(d.id));
  }
  ```
- Use `curatedSliderDimensions` in **both** the shell (physics targets/weights, `activeCatalogDims`) and the sidebar so UI ↔ physics stay in lockstep. `sliderDimensions` stays intact for tests and future re-expansion.
- **User name dimension** — add to `dimensionCatalog.structural.ts`:
  ```ts
  { id: "user", label: "User name", family: "affiliation", kind: "categorical",
    source: "AccDcProjectUser.user_id ⋈ name", confidence: "high", available: true,
    surfaces: ["slider", "color"], colorScale: "categorical",
    extract: (f) => f.userName ?? null }   // group key = userId, label = display name
  ```
  - `featureSnapshot.ts` already selects `full_name`; carry a cased `userName` (full name, fallback email, fallback userId) onto `NodeFeatureSnapshot` (today only `nameLower` is stored). Grouping key must be stable per user (userId, parsed from `nodeId` `userId::projectId`) while the **label** is the display name.
  - Document the consequence: ~3,367 distinct users → many small groups; only the largest get labels (handled by the existing label LOD).

### Part 2 — Layout escalation by active-slider count (G2, G3)

`activeCatalogDims(curated, sliderValues)` (strongest-first) selects the engine:

| # active | Engine | Notes |
|---|---|---|
| 0 | **Rest layout** (Part 4) | static organic cloud |
| 1 | **Blob layout** (existing) | one packed blob per value via `buildDominantClusters` + `layoutClusterFootprintsOrganic`; labels per blob |
| 2 | **Grid layout** (new, Part 3) | stronger = columns (X), weaker = rows (Y) |
| 3 | **Grid by the 2 strongest** + 3rd dim → node **color** | reuses `nodeColors` color modes |

`buildSimilarityClusters` (k-means) is **no longer called** for layout.

### Part 3 — Cross-tab grid (new pure module `gridLayout.ts`)

Split **structure** (per-regroup) from **scalar** (per-frame):

**Structure — `buildGridStructure(features, dimX, dimY, { maxCols, maxRows })`** (pure, deterministic), recomputed only when the active **set** or axis assignment changes:
- For each axis, rank distinct values by node count; keep top-N (`maxCols`/`maxRows`, e.g. 12 × 8), fold the remainder into a trailing **"Other"** band. Record `foldedCols` / `foldedRows` counts for the caption.
- Assign each node a `(col, row)` cell index.
- For each node, precompute a **unit offset** within its cell: sunflower direction + normalized radius `sqrt((j+0.5)/m)` (reuses the `clusterPacking` sunflower math), independent of pitch/tightness.
- Emit column labels (+ their col index) and row labels (+ row index) for header rendering.

**Scalar — `gridPositions(structure, { colPitch, rowPitch, cellFill }, outBuffer)`** (pure, allocation-free; writes into a reused `Float32Array`):
- `cellCenterX = (col - (cols-1)/2) * colPitch`, `cellCenterY = (row - (rows-1)/2) * rowPitch` (centered lattice).
- `pos = cellCenter + unitOffset * cellRadius * cellFill`.
- `colPitch`/`rowPitch` come from the **axis slider value** (0 → bands blended toward center; 1 → fully separated grid); `cellFill` from `fillFactor(max axis value)` (reuse `clusterPacking.fillFactor`). Cell radius is bounded to < half the min pitch so cells never overlap (preserves G3).

### Part 4 — Organic rest layout (new pure module `restLayout.ts`) (G4)

- `buildRestLayout(features)` → static stride-3 positions, computed **once on load**, deterministic (no RNG/clock):
  - Seed nodes grouped by **project** (shared-project neighbors start near each other) on a phyllotaxis spiral.
  - A light `forceCollide` + weak charge settle (fixed tick count, like `clusterForceLayout`) for soft, non-circular clumps; **no rescale to a fixed circle**; density denser toward the center, thinning at the edges.
- Used as the 0-slider state: cosmos seeds with it at load and eases back to it when all sliders return to 0. No live force at rest → zero runtime cost, no jitter.

### Part 5 — Lag fix wiring (G1)

- **Move the slider value out of React.** `ShellBody` computes only **structure** (`useMemo` gated on `activeKey`/axis assignment + the rest layout). It no longer computes `clusterPackedPositions`/`tightness` from `sliderValues`.
- Pass a **layout descriptor** to `GraphCanvas` (structure arrays + which engine). The per-frame **target** is computed inside the rAF path (`getPositionsOverride` / `clusterTransitionLayer`) from the descriptor + the **live slider scalar read from a ref** (extend `SliderContext` to expose a `valuesRef`/scalar channel; it already rAF-coalesces). The transition layer eases toward this target so toggles glide, not teleport.
- Keep the byte-identical dirty-check in `GraphCanvas2D.pushPositions`; **add an epsilon-settle skip** (stop uploading once max per-frame delta < ε) so a settled layout idles at full fps.
- GPU sim stays **paused** in blob/grid mode (positions are CPU-authoritative → guaranteed separation); the GPU-off e2e path stays coherent because the same CPU positions drive both.

### Part 6 — Labels (track centers)

- Grid: column headers along the top, row labels down the side, positioned from the grid lattice (`worldToScreen` of cell centers) — recomputed with structure, repositioned per-frame cheaply via `spaceToScreen`.
- 1-slider blobs: per-blob labels at footprint centers (existing `ClusterLabels` tracking), LOD-filtered so only the largest show.
- A small caption notes folded "Other" counts per axis (no silent truncation).

## Data flow (target)

```
toggle a slider on/off  → activeKey changes → ShellBody useMemo:
     buildGridStructure / blob footprints / restLayout   (ONCE)  → descriptor prop

drag a slider value     → SliderContext rAF-coalesced ref (NO ShellBody re-render)
     └─ rAF: gridPositions(descriptor, scalar-from-ref, reusedBuffer)
          └─ clusterTransitionLayer.setTarget → ease → pushPositions (epsilon-skip) → cosmos
               └─ labels reposition via spaceToScreen (cheap)
```

## Edge cases

- **All-same value on an axis** (e.g. every node one role) → 1 band on that axis; grid degenerates to a 1×N strip; no divide-by-zero in cell radius.
- **Top-N fold** → "Other" band always present when values exceed the cap; caption shows folded count.
- **3 active** → 2 strongest define axes; if the 3rd's slider is later dragged past one of the axis sliders, the active-set/axis assignment recomputes (a deliberate regroup, not a per-tick event).
- **Rapid drag then release** → transient value commits via the existing rAF coalesce; ease absorbs it smoothly.
- **GPU-off (e2e) mode** → same CPU positions; assertions target structure (cell assignment, band counts), not GPU state.

## Testing

- **Unit (pure):**
  - `gridLayout`: deterministic; top-N + "Other" fold; cell assignment correct; `gridPositions` is allocation-free and cells never overlap (radius < half min pitch); monotonic separation (higher value ⇒ larger pitch).
  - `restLayout`: deterministic; not rescaled to a constant extent; bbox varies with input; soft clumping (same-project nodes nearer than random).
  - `curatedSliderDimensions`: returns exactly Project/Role/User; `user` dim extract groups by userId, labels by display name.
- **e2e (`npm run test:e2e`, :3100, `NEXT_PUBLIC_ACC_GRAPH_TEST=1` → GPU off):**
  - drag a slider → no long-frame jank (perf probe) and no single-frame teleport beyond a delta bound.
  - two sliders → grid header labels render; node count per cell sums to total.
  - shell renders; load + cross-filter + export still pass.
- **Gates:** full unit suite green, `tsc` 0 errors, e2e green (lasso load-flake is a known machine-load artifact, not a regression).

## Rollout / risk

- Net **reduction** in per-frame work (structure-once + scalar-per-frame) — strictly less than today's re-pack path.
- Risk: tests asserting the old packed/k-means behavior will fail and must be updated/retired (they encode superseded behavior).
- Constraints: stage commits by **explicit path** (branch has large unrelated WIP — verify `git diff --cached --name-only` before each commit; `GraphCanvas2D.tsx` is already pre-staged in the index); do **not** `npm run build` while the :3000 app is running (it 500s the live app). Implement incrementally with verification after each part.
