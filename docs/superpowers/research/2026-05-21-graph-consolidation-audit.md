# Graph Consolidation Audit — `/users/access-analysis` vs `/users/spatial-graph`

**Date:** 2026-05-21
**Author:** Terminal 2 (read-only research; no implementation)
**Status:** Draft for review. WS2 3D same-user edges are being implemented concurrently in Terminal 1 — this document does NOT touch any active WS2 file.

> **Goal:** Converge two graph pages into ONE organic, force-directed analytical
> network — clusters, subtle edges, meaningful colors, stable interaction — that
> does *not* feel like a globe/sphere.

---

## 0. TL;DR

There are two **entirely separate** graph stacks in `app/(dashboard)/users/`:

| | Route | Renderer stack | Layout | Maturity |
|---|---|---|---|---|
| **NEW** | `/users/access-analysis` | `AccessAnalysisShell` → `GraphCanvas` (2D cosmos.gl + 3D three.js) | `physicsLayer.ts` (d3-force-3d) | Clean layered architecture, e2e harness, ~30 test files |
| **LEGACY** | `/users/spatial-graph` | `AccUsersGraph.tsx` (71k-token monolith) → 3 renderers (`graphRenderers.ts` canvas/cosmos + `threeGraphRenderer.ts`) | `accGraphOrganicLayout.ts` blob/topology seed positions | Mature, feature-rich, hard to maintain |

`spatial-graph` is a 2-file thin wrapper (`page.tsx` + `SpatialGraphOnly.tsx`) over the legacy `AccUsersGraph` with `layoutMode="blob"`. `/users` (the directory page) does **not** render either graph today — it uses `UsersDirectoryClient`.

**Recommendation:** Keep `/users/access-analysis` as the surviving route and architecture. **Port two things** from the legacy stack: (1) the feature-anchored seed layout (`computeBlobSeedPositions`) to replace the all-zero physics targets that currently produce a sphere, and (2) the meaningful node-color system (`buildNodeColorBuffer` / `roleColor` / admin tiers). Then retire `spatial-graph` and the `AccUsersGraph` monolith.

The single most important finding: **the "globe/sphere" feel is a direct, fixable consequence of `AccessAnalysisShell` seeding the physics layer with empty targets** (see §6).

---

## 1. Current-state audit

### 1.1 NEW stack — `/users/access-analysis`

Composition (`AccessAnalysisShell.tsx`):

```
SliderProvider(physics)
 └ FilterProvider
    └ SelectionProvider
       └ ShellBody
          ├ Toolbar
          ├ GraphInteractions(physics, features, edges)
          │   └ GraphCanvas (forwardRef handle)
          │       ├ GraphCanvas2D  (cosmos.gl v3, frozen mode)
          │       └ GraphCanvas3D  (three.js r184 InstancedMesh + OrbitControls)
          └ RightPanelStack (SliderSidebar | SelectionPanel | UserDetailPanel)
```

- **Data flow:** `accDcGraph.bulkUsers` (tRPC) → `buildGraphArrowTables` → DuckDB-WASM (`graph_*` tables) → `loadNodeIds` (one node per `user_id::project_id`) → `buildFeatureSnapshot` → `NodeFeatureSnapshot[]`. Positions live in `physicsLayer` (d3-force-3d), cached in a DuckDB positions table keyed by `hashNodeSetAndSliders`.
- **Renderer purity contract (REND-04):** `GraphCanvas*` import nothing from math/data/dimension layers. All visual encoding arrives as precomputed typed arrays. Positions + alpha mask come only from the physics handle. This is a genuinely good separation.
- **Two-bus physics invariant (`physicsLayer.ts`):** PHYSICS bus (`updateSliders`, sim "end") is fully decoupled from MASK bus (`setMask`). Filter/search/lasso never trigger a sim tick. Strong design.
- **Mode swap (Pattern 6):** both 2D and 3D canvases are always mounted; switching uses CSS `visibility` to avoid WebGL context loss. 2D→3D = 600ms tilt; 3D→2D = 400ms z-flatten (`GraphCanvas.tsx:155-226`).
- **Edges (WS2, in progress):** `sameUserEdges.ts` + `linkEmphasis.ts`; 2D via `cosmos.setLinks/setLinkColors`, 3D via `THREE.LineSegments` with alpha baked into vertex RGB (`GraphCanvas3D.tsx:223-290`).
- **Test surface:** `graphTestBridge.ts` observation bridge + `tests/e2e/acc-dc-graph.spec.ts` (12 specs, runs on :3100 under `NEXT_PUBLIC_ACC_GRAPH_TEST`, minted NextAuth cookie) + ~25 unit/component tests (physicsLayer, mathLayer purity, sameUserEdges, linkEmphasis, LassoOverlay, SelectionPanel, GraphInteractions, etc.).

**Known gaps in the NEW stack (today):**
1. `nodeColors` is a **constant** light-blue for every node (`AccessAnalysisShell.tsx:141-150`). No semantic encoding.
2. Physics `targets` are **all zeros** (`makeEmptyTargets`, `AccessAnalysisShell.tsx:66-76, 281`). Forces pull every node toward the origin → uniform ball.
3. Lasso is 2D-only (`GraphInteractions.tsx:201`); 3D has no selection-by-region.
4. No camera focus-on-selection (selection only dims via mask).

### 1.2 LEGACY stack — `/users/spatial-graph`

- `page.tsx` → dynamic `SpatialGraphOnly` (ssr:false).
- `SpatialGraphOnly.tsx` pulls `accDcGraph.bulkUsers` (falls back to `users.bulkAccSummary`) **directly** (deliberately bypassing the Google-Workspace-intersecting merge hook so external collaborators are kept), plus `accFolders.getMatrix` for the "functional team" axis, then renders `<AccUsersGraph layoutMode="blob" folderRows=… />`.
- `AccUsersGraph.tsx` is a single ~2.5k-line component holding: 3 renderer refs (canvas 2D / cosmos.gl / three.js), a d3-force web-worker, blob + topology layouts, organic physics config, cluster annotations, admin-tier shapes, URL-synced filters, search, its own lasso with Mosaic crossfilter wiring, saved-view persistence, perf HUD, and stable-diagnostics.

**Legacy strengths (what users perceive as "better"):**
- **Layout** (`computeBlobSeedPositions`, `accGraphOrganicLayout.ts:708`): seeds each node from real feature anchors (role, modules, access, project, company, folders, external, activity, identity…) with **per-axis weights** that sliders drive. Produces organic clusters, not a ball.
- **Color** (`cosmosUtils.ts:54 buildNodeColorBuffer`, `roleColor` in `AccUsersGraph.tsx:378`, admin-tier shapes): semantic, meaningful node coloring.
- **Sliders**: each slider maps to a layout *weight* (`BlobWeightOverrides`), so dragging visibly re-clusters the graph along a meaningful axis.

**Legacy weaknesses:**
- Monolithic, low testability, three parallel renderers to keep in sync.
- Lasso has a known coordinate-space hazard in non-physics mode (see §9).
- Heavy view-fit / saved-view machinery (`loadSavedView`, `lastAutoFitHashRef`, `lastFitScaleRef`) → camera can jump.

---

## 2. Feature matrix — access-analysis vs spatial-graph

| Dimension | access-analysis (NEW) | spatial-graph (LEGACY) | Winner |
|---|---|---|---|
| Performance (frozen render) | cosmos.gl frozen + rAF push, zero-alloc stride buffer | cosmos/canvas/worker, heavier | NEW |
| 2D rendering | cosmos.gl v3 frozen, clean handle | cosmos.gl via `graphRenderers` | NEW (cleaner) |
| 3D rendering | three.js InstancedMesh + OrbitControls damping, unconstrained orbit | `threeGraphRenderer.ts` | **NEW** |
| Orbit smoothness | `enableDamping`, `dampingFactor 0.08` | n/a-ish | **NEW** |
| Initial load | DuckDB tables + feature snapshot + physics seed | direct query + blob seed | LEGACY (perceived; structure appears instantly) |
| Sliders | 6 fixed dims → force *strength* toward origin (no structure) | per-axis layout *weights* → real reclustering | **LEGACY** |
| Clustering | none today (ball) | feature-anchored blobs + cluster annotations | **LEGACY** |
| Organic feel | sphere/globe (empty targets) | organic | **LEGACY** |
| Node coloring | constant blue | semantic (role/tier/admin) | **LEGACY** |
| Edge coloring | `linkEmphasis` precomputed RGBA, focus-driven | `colorForTopologyLink` + highlight buffers | NEW (cleaner model) |
| Lasso accuracy | screen→space per point at pointerup (2D) | dual-path; non-physics path risky | NEW |
| Selection behavior | mask dim + right-panel pie + detail | side panel + Mosaic crossfilter | NEW (clearer) |
| Camera stability | one-shot fit on freeze + resize | saved-view + auto-fit-hash (jumpy) | **NEW** |
| User details | `UserDetailPanel` (DuckDB per-user projects/roles) | `SidePanel`/`AccUserSidePanel` | NEW |
| UI / panels | `RightPanelStack` z-stack, framer-motion | inline filter rail + side panel | NEW |
| Maintainability | layered, ~90 small files | one 71k-token monolith | **NEW** |
| Testability | bridge + e2e + unit suites | minimal | **NEW** |

**Score:** NEW wins architecture, rendering, interaction, testability. LEGACY wins layout, clustering, color, slider semantics — i.e. exactly the "feel" pillars the product cares about.

---

## 3. Recommended final route

**Keep `/users/access-analysis`.** It is the better foundation on every structural axis and already owns the e2e harness and WS2 edge work.

- Survivor route: `app/(dashboard)/users/access-analysis/` (`AccessAnalysisShell`).
- Retire: `app/(dashboard)/users/spatial-graph/` and the `AccUsersGraph` monolith family — **after** porting layout + color (§4–§5) and a deprecation window.
- Optional: add a redirect from `/users/spatial-graph` → `/users/access-analysis` so existing bookmarks survive.

---

## 4. What to PRESERVE from access-analysis

1. **Layered architecture & REND-04 purity contract** — renderers consume typed arrays only.
2. **Two-bus `physicsLayer.ts`** — PHYSICS vs MASK separation; the no-tick-on-mask invariant.
3. **`GraphCanvas` CSS-visibility mode swap** — never remount; both canvases mounted.
4. **`GraphCanvas3D` OrbitControls** — damping, unconstrained orbit, one-shot `fitView` on freeze.
5. **`useGraphRafLoop`** single loop driving the active renderer + mask fan-out.
6. **DuckDB feature snapshot + positions cache** (`buildFeatureSnapshot`, `positionsCache`, `hashNodeSetAndSliders`).
7. **WS2 edge model** (`sameUserEdges`, `linkEmphasis`) and the per-link RGBA contract shared by both renderers.
8. **`graphTestBridge` + e2e suite** — the regression safety net for the whole migration.
9. **`RightPanelStack` + `UserDetailPanel` + `SelectionPanel`** UI.

## 5. What to PORT from spatial-graph

| Port | Source | Target |
|---|---|---|
| Feature-anchored seed layout | `computeBlobSeedPositions` / `accGraphOrganicLayout.ts` + `BlobWeightOverrides` | Replace `makeEmptyTargets` → real `TargetArrays` per dimension (§6) |
| Semantic node colors | `buildNodeColorBuffer`, `roleColor`, `resolveRenderNodeColor`, admin-tier palette (`adminTierShape`) | Replace constant `nodeColors` in Shell (§8) |
| Slider→axis-weight semantics | `BlobWeightOverrides` weight model | Make each `DIMENSIONS` slider a clustering weight, not just a force strength (§7) |
| Folder "functional team" axis | `accFolders.getMatrix` → `folderRows` | Optional extra dimension/target in the snapshot |
| Keep-everyone data source | `bulkAccSummary`/`accDcGraph.bulkUsers` without merge-hook intersection | Already used by Shell; preserve the "no Google-Workspace filter" rule |

> **Note:** port the *algorithms/values*, not the monolith. Extract `computeBlobSeedPositions`'s anchoring math into a pure function the NEW `mathLayer`/Shell can call to produce `TargetArrays`. Do **not** import `AccUsersGraph` into the new stack.

---

## 6. Layout / physics diagnosis — *why it looks like a globe*

**Root cause (high confidence):**

- `AccessAnalysisShell.tsx:281` builds targets via `makeEmptyTargets(n, dimNames)` → **every** per-dimension `forceX/Y/Z` target is `0`.
- `physicsLayer.ts:196-213` registers those forces; `updateSliders` (`:297-303`) sets their strength from the slider. So when any slider > 0, the force pulls all nodes toward `(0,0,0)`.
- The only opposing force is `forceManyBody` repulsion (`REPULSION_ZERO -10` … `REPULSION_ONE -60`, `:118-120`).
- Pull-to-single-point + uniform repulsion = **a uniform sphere** (in 3D) / disc (in 2D). There is no inter-cluster structure because all targets are identical.

**Fix:** produce *non-trivial* per-dimension targets. For dimension `d`, the target for node `i` should be the layout position node `i` would occupy if only `d` were active — i.e. the feature-anchor coordinates from the blob algorithm (`computeBlobSeedPositions` anchors each feature value to a stable point on a ring/grid). Then:
- sliders blend dimensions (force strengths already do this);
- nodes sharing a feature value converge to a shared anchor → real clusters;
- repulsion only separates *within* clusters → organic, not spherical.

Secondary: seed initial positions from the *combined* anchored layout (not `Math.random()` in `[-1,1]^3`, `physicsLayer.ts:259-264`) so the first frame already shows structure (this is what makes legacy feel "less rigid / instant").

`normalizeNodePositions` → `LAYOUT_HALF_EXTENT 350` (`:143-158`) is fine and worth keeping.

---

## 7. Slider / clustering diagnosis

- NEW sliders (`SliderContext.tsx`): 6 fixed dims (role/tier/project/external/activity/signin), value 0–100, rAF-coalesced → `physics.updateSliders(value/100)`. Mechanically sound (debounce, persistence, reset-one/all). **But** because targets are empty (§6), every slider does the same thing: tighten/loosen the ball. There is no per-axis *meaning*.
- LEGACY sliders map to `BlobWeightOverrides` axis weights (`computeBlobSeedPositions:719-738`) with tuned defaults (role 1.0, modules 1.0, folders 0.9, etc.), so each slider visibly re-pulls along a real feature axis.

**Proposal:** keep the NEW slider UX/plumbing; give each slider a *meaningful target set*. Two viable models:
- **(A) Force-strength blend (minimal):** keep `updateSliders` strengths, but feed real per-dim targets (§6). Slider = "how much does this axis shape the layout."
- **(B) Weighted re-seed (legacy parity):** recompute a blended anchor layout from slider weights and feed as a single combined target, reheating gently. Closer to legacy feel; more compute per change (mitigated by the existing `SKIP_THRESHOLD` + rAF coalescing).

Recommend **(A)** first (smallest change, preserves two-bus design), evaluate feel, escalate to (B) only if needed.

---

## 8. Color-system proposal

Replace the constant buffer in `AccessAnalysisShell.tsx:141-150` with a precomputed semantic RGBA buffer (still honoring REND-04 — Shell computes, renderer consumes):

1. **Color-by selector** in `Toolbar` (role | tier | external | activity | project). Default: **role**.
2. Reuse legacy palettes: `roleColor`, `resolveRenderNodeColor`, admin-tier palette (`adminTierShape`). Port as a pure `buildNodeColorsFromFeatures(features, colorBy)` → `Float32Array(n*4)`.
3. Keep alpha at 1.0 in the base buffer — dimming stays a *mask* concern (`pointGreyoutOpacity 0.15` 2D / `DIM 0.15` 3D), so color and focus stay orthogonal (consistent with the two-bus philosophy).
4. Dark-mode: palettes must read against `#09090B` zinc bg (per `feedback_dark_palette_neutral`); verify contrast, avoid blue-cast neutrals.
5. Edge colors already handled by `linkEmphasis`; ensure node `colorBy` and edge emphasis don't fight (edges are subtle/grey by default, brighten on focus — keep that).

---

## 9. Lasso bug diagnosis

**NEW lasso (`LassoOverlay.tsx` + `GraphCanvas2D.findPointsInPolygon`):** structurally correct — path captured in a ref (not state), `screenToSpace` per point at pointerup, polygon test on frozen positions, `setPointerCapture` so pointerup outside the canvas still fires, bail to `[]` before ready. **Watch items, not confirmed bugs:**
- Coordinate units: overlay uses `e.offsetX/offsetY` (CSS px relative to overlay), cosmos `screenToSpacePosition` expects CSS px relative to its canvas. Overlay and cosmos canvas are both `inset:0` over the same container → should align. If a wrapping pad/border is ever introduced, this breaks. Add an e2e assertion that a known-rect lasso selects a known node id.
- `findPointsInPolygon` runs against current positions; only valid in frozen 2D (it is gated to 2D). Fine today.

**LEGACY lasso (`AccUsersGraph.tsx:1647` `handleLassoPointerUp`):** has two paths. The physics path (`:1668`) converts each node via `cosmosRenderer.spaceToScreen` then point-in-polygon in screen space — correct. The **non-physics path** uses `posRef.current` (normalized positions) and, per the inline comment (`:1655`), "does NOT track Cosmos's internal camera" — so after pan/zoom the lasso compares the screen-space path against untransformed coordinates → **mis-selection**. This is the most likely "lasso bug." It does **not** exist in the NEW stack (which always converts via the live cosmos handle), which is another reason to standardize on NEW.

**Action:** adopt the NEW lasso wholesale; add a regression e2e for the screen↔space conversion; do **not** port the legacy dual-path.

---

## 10. Camera-stability diagnosis

**NEW:**
- 2D: one-shot fit when `physics.frozen` flips true (`GraphCanvas2D.tsx:246-258`), re-armed on reheat. No per-frame rescale (`dontRescale=true` on ticks) → no jitter.
- 3D: one-shot `fitView` on freeze (`GraphCanvas3D.tsx:203-210`) + on resize (`:395-404`) + OrbitControls damping. Stable.
- Mode transitions are explicit tweens (`GraphCanvas.tsx`), animation frames cancelled on rapid toggle.

**Risks to verify (NEW):**
- `fitView` on **every** resize re-aims the camera and discards the user's manual orbit — a ResizeObserver firing during layout (sidebar open/close, panel slide) will yank the view. Recommend: fit-on-resize only while not yet user-interacted, or debounce + preserve orbit angle.
- Re-freeze after a slider reheat re-fits and can pull the camera back mid-exploration. Consider "fit once per node-set, not per freeze."

**LEGACY:** `loadSavedView` + `lastAutoFitHashRef` + `lastFitScaleRef` + saved-view timer interact in ways that can cause visible jumps; do not port.

**Action:** keep NEW camera model; make resize-fit conditional on "no manual camera interaction yet."

---

## 11. Selected-user detail panel proposal

NEW `UserDetailPanel` is already the right shape (node click → isolate → DuckDB query for that user's projects/roles, filter-independent per the investigative-action rule). Enhancements:

1. Add: company / company-role, admin tier (with the §8 color swatch), folder-hub reachability count, similarity peers (same-user instances across projects — ties into WS2 edges).
2. "Focus camera on user" button → smoothly frame the node's instances (3D: tween OrbitControls target; 2D: cosmos `fitView` to subset). Keep it opt-in so it never auto-yanks the camera.
3. From a same-user edge, allow "show all N projects for this person" → multi-select the instances.
4. Keep `RightPanelStack` precedence (user-detail > lasso-pie > sliders).

---

## 12. UI / sidebar consolidation proposal

- **Single right rail** = `RightPanelStack` (already built): Sliders (home) / Selection pie / User detail.
- **Top toolbar** (`Toolbar`): mode 2D/3D, lasso toggle, **color-by selector (new, §8)**, search, filter popover, reset.
- **Drop** the legacy inline filter rail, perf HUD, stable-diagnostics, and graph-mode switcher from the surviving UI (or move diagnostics behind a dev flag).
- Filters: keep `FilterContext` (DuckDB-predicate driven) over legacy URL-synced filters; optionally add URL sync later if deep-linking is required.
- Honor `feedback_no_manual_sync_ui`: no Sync/Refresh/stale-cache UI.

---

## 13. Migration plan (phased, test-gated, no big-bang)

> Sequenced so each step is shippable and guarded by the e2e suite. **Do not start until WS2 3D edges land** (avoids the active-file conflict set).

1. **P0 — Extract pure layout/color helpers.** New files (no edits to active WS2 files): `featureTargets.ts` (port `computeBlobSeedPositions` anchoring → `TargetArrays` + combined seed) and `nodeColors.ts` (port `roleColor`/`buildNodeColorBuffer` → `buildNodeColorsFromFeatures`). Unit-test in isolation.
2. **P1 — Wire real targets.** Replace `makeEmptyTargets`/random seed in `AccessAnalysisShell` with `featureTargets` output. Verify graph shows clusters, not a ball. (Fixes §6.)
3. **P2 — Wire semantic colors + color-by selector.** Replace constant `nodeColors`; add Toolbar control. (Fixes §8.)
4. **P3 — Slider semantics.** Map `DIMENSIONS` sliders to per-axis weights feeding `featureTargets`. (Fixes §7.)
5. **P4 — Camera polish.** Conditional resize-fit; fit-once-per-node-set. (Fixes §10.)
6. **P5 — Detail panel enrichment + focus-on-user.** (§11.)
7. **P6 — Deprecate spatial-graph.** Redirect `/users/spatial-graph` → `/users/access-analysis`; announce window.
8. **P7 — Delete legacy.** Remove `spatial-graph/`, `AccUsersGraph.tsx`, and now-unreferenced legacy modules (verify no other importers — `MosaicCoordinatorContext`, `folderCluster`, etc. currently reference it).

---

## 14. Test plan

- **Unit (new pure helpers):** `featureTargets` (same feature value → same anchor; different values → separated; deterministic), `nodeColors` (role→color mapping, dark-mode contrast, length = n*4, alpha = 1).
- **Physics:** extend `physicsLayer.test.ts` — with non-trivial targets, settled layout variance is non-zero and clustered (assert nearest-neighbor of same-feature nodes < cross-feature).
- **Regression:** keep `mathLayer.purity` / `physicsLayer.purity` guards.
- **Lasso e2e:** add a deterministic screen-rect → expected-node-id assertion (guards §9 conversion).
- **Color-by e2e:** toggling color-by changes the point color buffer (via `graphTestBridge`).
- **Camera e2e:** resize does not reset a user-rotated 3D camera once interacted.
- **Edges:** preserve WS2 specs in `acc-dc-graph.spec.ts` (do not modify during this work).
- **Run:** `npm run test:e2e` on :3100 with `NEXT_PUBLIC_ACC_GRAPH_TEST`; unit via existing vitest config. If screenshots needed during research, use port **3101** (never 3000/3100).

---

## 15. Risks & rollback

| Risk | Likelihood | Mitigation / Rollback |
|---|---|---|
| Porting layout reintroduces monolith coupling | Med | Port as pure functions only; lint-ban importing `AccUsersGraph` from the new stack |
| Real targets change positions cache hash → cold first load | High (expected) | `hashNodeSetAndSliders` already keys on sliders; bump a layout-version constant so stale globe positions are invalidated cleanly |
| Resize-fit change regresses framing | Low | Feature-flag the conditional fit; revert one function |
| Slider-weight model too heavy at 17k nodes | Med | Start with force-strength model (§7-A); rAF coalescing + SKIP_THRESHOLD already in place |
| Deleting legacy breaks a hidden importer | Med | `AccUsersGraph` is imported by `graphRenderers`, `accGraphParts`, `accGraphOrganicLayout`, `accGraphFilters`, `accGraphTypes`, `cosmosUtils`, `MosaicCoordinatorContext`, `folderCluster` — audit/remove these together in P7, not piecemeal |
| Color palette fails dark-mode contrast | Low | Validate against `#09090B`; reuse approved zinc palette |
| Concurrent WS2 edge work conflict | Avoided | This plan starts after WS2 lands; P0–P2 only add files |

**Rollback posture:** every phase is independently revertable; the `spatial-graph` route stays live until P6, so the legacy graph remains a fallback throughout P0–P5.

---

### Appendix — key file references

- NEW shell: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (empty targets `:66-76,281`; constant colors `:141-150`)
- NEW physics: `…/access-analysis/physicsLayer.ts` (forces `:196-213`; updateSliders `:287-325`; random seed `:259-264`)
- NEW renderers: `…/GraphCanvas.tsx`, `…/GraphCanvas2D.tsx`, `…/GraphCanvas3D.tsx`
- NEW interaction/lasso: `…/GraphInteractions.tsx`, `…/LassoOverlay.tsx`
- NEW sliders/panels: `…/SliderContext.tsx`, `…/RightPanelStack.tsx`, `…/UserDetailPanel.tsx`
- LEGACY route: `app/(dashboard)/users/spatial-graph/{page,SpatialGraphOnly}.tsx`
- LEGACY monolith: `app/(dashboard)/users/AccUsersGraph.tsx` (lasso `:1606-1760`; roleColor `:378`)
- LEGACY layout: `app/(dashboard)/users/accGraphOrganicLayout.ts` (`computeBlobSeedPositions:708`)
- LEGACY color: `app/(dashboard)/users/cosmosUtils.ts` (`buildNodeColorBuffer:54`)
- Tests: `tests/e2e/acc-dc-graph.spec.ts`, `…/access-analysis/graphTestBridge.ts`
</content>
</invoke>
