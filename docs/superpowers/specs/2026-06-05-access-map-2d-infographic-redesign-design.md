# Access Map — 2D Infographic Redesign

**Date:** 2026-06-05
**Branch:** `feat/access-analysis-redesign`
**Route affected:** `/users/spatial-graph` (renders `AccessAnalysisShellClient` → `AccessAnalysisShell`)
**Status:** Approved design, ready for implementation plan

---

## 1. Problem

The spatial graph today loads as a **loose 3D cloud on a dark background**, default sliders all `0`, color by hashed hue per role, faint same-user edges. The owner wants it to read like the three reference images: a **clean, light, tightly-clustered, labeled infographic** with a legend (references 1 & 3) that still shows **live physics "settling" motion** when sliders move (reference 2).

This is a **visual/UX redesign on top of the existing engine** — not a rewrite. We reuse the cosmos.gl GPU layout, physics worker, lasso, hover, and selection that already exist.

## 2. Goals (the agreed look & feel)

1. **Loads already organized** — opens grouped into role clusters with a settle-on-load animation, not a loose cloud.
2. **2D flat map** as the primary view (labels/legend stay still and readable). 3D remains available behind the existing toolbar toggle as a "raw" view.
3. **Default grouping: Role** (fallback to Project if roles are too sparse to form clusters).
4. **One solid color per cluster.** Top 10–12 values of the active dimension get distinct colors; everything else collapses to a muted grey **"Other."**
5. **Cluster labels** for all colored clusters (the top 10–12); grey "Other" is unlabeled.
6. **Legend** overlay listing the colored clusters + counts.
7. **Sized dots** — node radius scales with access breadth (bigger = admin / access to many projects).
8. **Gossamer edges** — keep the same-user threads, restyled to 0.5px width and ~0.10 opacity ("neural constellation"), theme-aware.
9. **Color auto-follows grouping, with override** — when the dominant grouping dimension changes (drag a different slider), color + legend follow it; a dropdown overrides for cross-analysis (group by Project, color by Role).
10. **Theme-follow** — the graph + chrome follow the app's existing light/dark toggle. The "reference look" is the light variant; dark is a first-class variant.
11. **Live settling preserved** — dragging any slider re-settles the layout in real time (existing physics-worker rAF push-positions path).
12. **Sidebar stack preserved** — Catalog Sliders (left), Selection + User Profile (right) stay active.

## 3. Non-goals (explicit, to keep scope tight)

- **No callout annotations** (reference 3's pointed text notes). Deferred to a follow-up.
- **No new 3D infographic chrome.** Labels/legend are 2D-only by design; 3D stays as the raw toggle view.
- **No data-pipeline changes.** We work from the existing `bulkUsers` feature snapshot.
- **No edge-meaning change.** Edges remain "same user across projects"; only their styling changes.

## 4. Design

### 4.1 Default state & grouping
- `AccessAnalysisShell` currently hardcodes `const mode = "3d"`. Change to `useState<"2d"|"3d">("2d")` and wire `onModeChange` to the toolbar toggle (both canvases are already always-mounted and CSS-visibility-swapped, so no remount cost).
- `catalogDefaultSliders()` returns all-`0` today. Add a single non-zero default for the **Role** dimension (a "grouping strength", e.g. `60`) so the layout forms role clusters on load. All other sliders remain `0` → clean single-dimension clustering (no multi-dim blur).
- Fallback rule: if the Role dimension is unavailable/too sparse (fewer than a small threshold of non-empty role values), default the grouping to **Project** instead. Decided at load from the feature snapshot.
- The settle-on-load animation is emergent: the physics worker starts from fresh scattered positions (JS-snapshot path already skips the positions cache) and converges toward the role targets — the existing rAF `pushPositions` loop renders the motion.

### 4.2 Active dimension model
Introduce one derived concept in `ShellBody`: the **active grouping dimension** = the slider with the highest value (ties broken by catalog order; defaults to Role at load). This single value drives:
- **Clustering** (already true — it's the dominant force).
- **Cluster labels** (centroids of that dimension's top-N values).
- **Color**, *unless* the user has overridden it (see 4.3).

### 4.3 Color & legend (auto-follow + override + bucketing)
- **Auto-follow:** `colorMode` defaults to the active grouping dimension. When the active grouping dimension changes, `colorMode` follows it — *until* the user manually changes the color dropdown, which sets a `colorOverride` flag. A "Reset to auto" affordance clears the override.
- **Bucketing (new):** add a pure helper (e.g. `buildBucketedColors(features, dimensionId, maxColors = 12)`) that:
  - For **categorical** dimensions: ranks values by member count, assigns the top `maxColors` distinct palette colors, and maps the remaining values to a single muted grey (`#b4bcc8`). Returns the RGBA `Float32Array` **and** the legend model `{ label, color, count }[]` (top-N + an "Other" row with the residual count).
  - For **ordered/numeric** dimensions (e.g. riskScore, activity): keep the existing sequential blue→red ramp from `buildNodeColors`, and emit a gradient legend model instead of discrete rows.
  - This replaces the raw hashed-hue path for the colored dimension. `buildNodeColors`'s hashing stays as the fallback/implementation detail for ordered ramps.
- **Palette:** a fixed 12-color categorical palette chosen for distinguishability on both white and near-black backgrounds (blues, orange, green, purple, cyan, yellow, pink, teal, red, violet, indigo, lime), plus grey for Other.
- **Legend component (new):** a small overlay (corner of the canvas) rendering the legend model — color swatch + label + count, two rows if needed. Theme-aware via `resolvedTheme` (light: white card / slate text; dark: zinc card / light text). Reflects the **color** dimension.

### 4.4 Cluster labels
- Wire the existing, currently-unmounted `ClusterLabels` into `ShellBody` (renders only in 2D, projects centroids via `spaceToScreen` on a ~30Hz throttle, caps at top-N).
- Compute label anchors as the **centroid (mean live position) of each colored cluster** of the active grouping dimension's top-N values. Labels fade in as the settle completes (mirrors the mockup).
- Grey "Other" gets no label.

### 4.5 Node sizing (new)
- Add a pure helper `buildNodeSizes(features)` → `Float32Array` of per-node world radii, scaled by an **access-breadth** signal already present in the feature snapshot (e.g. number of projects / admin flag / permission tier). Map to a small radius range (e.g. ~2–5 world units) with a gentle curve so a few high-access nodes stand out without dwarfing the rest.
- Pass it to `GraphCanvas` via the existing `nodeSizes` prop (2D consumes it through `setPointSizes`). 3D ignores per-node radius today — acceptable, since 2D is the primary view.

### 4.6 Edges — gossamer styling
- Keep `deriveSameUserEdges` + `toCosmosLinks` unchanged.
- Replace the link-color source: pass **theme-specific `LinkColorOpts`** into `computeLinkEmphasisColors` from the shell, derived from `resolvedTheme`:
  - **Light:** base ≈ `[0.36, 0.39, 0.45, 0.10]` (cool dark-grey thread, 0.5px), bright/dim scaled proportionally for the same-user focus highlight.
  - **Dark:** base ≈ `[0.68, 0.71, 0.77, 0.13]` (light-grey thread) so threads stay visible on near-black.
- Line width set to 0.5px in the 2D renderer config.

### 4.7 Theme
- The canvas background already follows `resolvedTheme` (`#FFFFFF` / `#09090B`) in `GraphCanvas`. No change needed there.
- New overlays (Legend, and any new chrome) read `resolvedTheme` and style accordingly. Labels use a theme-appropriate text color with a subtle halo for legibility over dense dots.
- Gossamer link colors switch per theme (4.6).

### 4.8 Layout & sidebar (unchanged structure)
- Keep the existing `Toolbar` / `GraphInteractions(GraphCanvas)` / `RightPanelStack` composition and the `min-h-0` flex rules that keep the canvas filling the viewport.
- Toolbar additions: a **"Group by"** indicator/select (active grouping dimension) next to the existing **"Color"** select; show a small "auto" badge on Color when not overridden, with a reset control.

### 4.9 Interactions preserved
- Lasso, hover tooltip, node-click → User Profile, selection panel, isolate, and same-user edge emphasis all continue to work through the existing `GraphInteractions` + `GraphCanvasHandle` (2D handle already exposes `findPointsInPolygon`, `screenToSpace`, `spaceToScreen`, `setSelectedIndices`, `setHoveredIndex`).

## 5. Files to touch (concrete)

**Edit:**
- `AccessAnalysisShell.tsx` — `mode` → state default `"2d"`; wire `setMode`; derive active grouping dimension; auto-follow/override color state; build `nodeSizes`; build bucketed colors + legend model; pass theme-aware `LinkColorOpts`; mount `ClusterLabels` + new `Legend`.
- `catalogSliders.ts` — `catalogDefaultSliders()` defaults Role (or Project fallback) to a non-zero grouping value.
- `nodeColors.ts` — keep `buildNodeColors`; add categorical-vs-ordered awareness used by the new bucketing helper.
- `Toolbar.tsx` — add Group-by select + Color "auto/override + reset" affordance.
- `linkEmphasis.ts` — allow theme-driven `LinkColorOpts` (constants for light/dark) or accept them from the shell.
- `GraphCanvas2D.tsx` — set 0.5px link width; confirm `setPointSizes` path is exercised.

**Add:**
- `bucketedColors.ts` (+ test) — `buildBucketedColors(features, dimensionId, maxColors)` returning `{ colors: Float32Array, legend: LegendModel }`.
- `nodeSizes.ts` (+ test) — `buildNodeSizes(features)`.
- `Legend.tsx` (+ test) — theme-aware legend overlay consuming `LegendModel`.

**Wire (exists, unmounted):**
- `ClusterLabels.tsx` — mounted into `ShellBody` with computed centroids/labels/counts for the active grouping dimension.

## 6. Performance

- ~16,942 nodes. GPU 2D real-time sim is already proven (~107fps after the pushPositions dirty-check; flags `NEXT_PUBLIC_ACC_GPU_2D` / `ENABLE_GPU_2D_SIM` default on).
- `buildBucketedColors` / `buildNodeSizes` are O(n) and memoized; recompute only when the color/group dimension changes.
- Labels are throttled (~30Hz) and capped at top-N; Legend is static DOM. Gossamer edges already render on the GPU link layer.

## 7. Testing

- **Unit (pure):** `buildBucketedColors` (top-N selection, Other residual, count totals, categorical vs ordered), `buildNodeSizes` (range + monotonicity with access breadth), default-slider role/project fallback logic, active-grouping-dimension selection, color auto-follow/override state transitions.
- **Component:** Legend renders rows + Other in both themes; Toolbar group-by/override controls; ClusterLabels appears in 2D and not 3D.
- **E2E (smoke, existing harness on :3100):** page boots in 2D, clusters form (settle), legend present, labels present, theme toggle swaps canvas + legend, dragging a non-Role slider re-colors/re-labels, color override holds.
- **Gates:** full unit suite green, `tsc` 0 errors, e2e smoke green. Visual UAT (owner, GPU-on rebuild) for the final look in both themes.

## 8. Rollout

- All work on `feat/access-analysis-redesign` (already the active redesign branch).
- Deploy = `npm run build` + restart (no git deploy-branch merge). Do **not** `npm run build` while the :3000 server is running.
- Keep 3D reachable via the toolbar toggle so nothing is lost; 2D is the default.

## 9. Open questions / follow-ups (post-ship)

- Callout annotations (reference 3's pointed notes) — auto-generated from existing insight logic.
- Whether the Project-fallback threshold needs tuning against real role sparsity.
- Optional: a "color by" gradient legend polish for ordered dimensions.
