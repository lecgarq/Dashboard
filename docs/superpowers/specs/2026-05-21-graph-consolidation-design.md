# Spatial Graph Consolidation — Design & Plan

**Date:** 2026-05-21
**Status:** Approved direction (Option A) — research/spec/plan only; **no implementation in this doc**
**Branch:** `feat/access-analysis-redesign`
**Decision owner:** Luis
**Related (separate track, do NOT merge in):** [`2026-05-21-ws2-3d-same-user-edges-design.md`](./2026-05-21-ws2-3d-same-user-edges-design.md)

> **Decision (locked):**
> **WINNER = `AccessAnalysisShell`** (the new engine at `/users/access-analysis`).
> **DONOR = `AccUsersGraph`** (the old engine behind `/users/spatial-graph`) — reference only.
> **DEPRECATED ROUTE = `/users/spatial-graph`**, removed only after automated parity tests pass.
> WS2 3D edges stay an independent track and are not mixed into this plan.

---

## 1. Current-state audit

### 1.1 Routing reality (corrected)

There are **three** surfaces, and the nav label "Access Analysis" currently points at the *non-graph* one.

| Route | Nav label | Entry file | Renders | Nature |
|---|---|---|---|---|
| `/access-analysis` | **Access Analysis** | `app/(dashboard)/access-analysis/page.tsx` | `AccessAnalysisPage` | Old **Mosaic charts/KPI** dashboard (not a graph) |
| `/users/spatial-graph` | **Spatial Graph** | `app/(dashboard)/users/spatial-graph/page.tsx` → `SpatialGraphOnly.tsx` | `AccUsersGraph` (`layoutMode="blob"`) | **Old, mature** graph engine (DONOR) |
| `/users/access-analysis` | *(not in nav)* | `app/(dashboard)/users/access-analysis/page.tsx` → `AccessAnalysisShell.tsx` | `AccessAnalysisShell` | **New, clean** graph engine (WINNER) |

`components/layout/navigation.ts:30-31` links only the first two. The consolidation must also resolve this **naming collision**: the eventual single graph should own the "Access Analysis" (or a renamed "Spatial Graph") nav slot, and the legacy `/users/spatial-graph` link is removed at the end.

### 1.2 File map

**WINNER — `AccessAnalysisShell` (`app/(dashboard)/users/access-analysis/`)**

- Shell / composition: `AccessAnalysisShell.tsx`, `page.tsx`
- Renderer dispatch: `GraphCanvas.tsx` → `GraphCanvas2D.tsx` (cosmos.gl v3 frozen) + `GraphCanvas3D.tsx` (three.js r184 InstancedMesh + OrbitControls)
- Physics (pure): `physicsLayer.ts` (d3-force-3d, two-bus), `mathLayer.ts` (semantic seed targets), `positionsCache.ts` (DuckDB cache), `useGraphRafLoop.ts`
- Data: `featureSnapshot.ts`, `dataLayer.ts`, `graphTables.ts`, `graphSql.ts`, `duckdbClient.ts`
- Interaction: `GraphInteractions.tsx`, `usePredicateEngine.ts`, `LassoOverlay.tsx`, `NodeTooltip.tsx`, `interactionTypes.ts`, `SelectionContext.tsx`
- Chrome: `Toolbar.tsx`, `SliderContext.tsx`, `SliderSidebar.tsx`, `DimensionSlider.tsx`, `FilterContext.tsx`, `DimensionFilterPopover.tsx`, `RightPanelStack.tsx`, `SelectionPanel.tsx`, `UserDetailPanel.tsx`
- Edges (WS2): `sameUserEdges.ts`, `linkEmphasis.ts`
- Test harness: `graphTestBridge.ts`, `*.test.ts(x)`, `tests/e2e/acc-dc-graph.spec.ts`

**DONOR — `AccUsersGraph` (`app/(dashboard)/users/`)**

- `AccUsersGraph.tsx` (4,095 lines — monolith), `accGraphOrganicLayout.ts` + `.worker.ts` (anchors + d3 worker), `graphRenderers.ts` (Cosmos + Canvas2D), `threeGraphRenderer.ts`, `cosmosUtils.ts`, `accGraphFilters.ts`, `accGraphParts.tsx`, `accGraphTypes.ts`, `accGraph3d.ts`, `accGraphModes.ts`, `adminTierShape.ts`

### 1.3 Data flow (text)

**WINNER:** `trpc.accDcGraph.bulkUsers` → `buildGraphArrowTables` → `registerGraphArrowTables` (DuckDB) → `loadNodeIds` (`user_id::project_id`) → `buildFeatureSnapshot` (one-shot, ref-held) → `createPhysicsLayer(nodeIds, nodes, targets, dims, sliders)` → rAF loop reads `physics.getPositions()`/`alphaMask` → `GraphCanvas2D/3D`. Interactions (filter/search/lasso/isolate/drill) all collapse into **one** `physics.setMask()` call via `usePredicateEngine`. Sliders → `physics.updateSliders()` (rAF-coalesced). Edges derived once (`deriveSameUserEdges`) → cosmos link buffers + `computeLinkEmphasisColors`.

**DONOR:** `bulkAccSummary`/`accDcGraph.bulkUsers` (+ `accFolders.getMatrix`) → `accUserToInstanceNodes` (one node per user×project) → seed via `computeBlobSeedPositions`/`computeTopologySeedPositions` (real anchors) → d3-force **web worker** ticks → renderer (Cosmos/Canvas2D/Three) → DuckDB positions cache. Filters via URL params; lasso via Mosaic `clausePoints`.

### 1.4 Two-bus invariant (WINNER's load-bearing strength)

`physicsLayer.ts` enforces a **physics bus** (only `updateSliders` + the `"end"` handler touch `sim`) vs a **mask bus** (only `setMask` writes `_alphaMask`/`_maskVersion`). Filter/search/lasso **never** restart the simulation. This is the single best reason the new engine is the right long-term base, and it must be preserved through every consolidation step.

### 1.5 Dead / legacy / duplication candidates

- **Duplicate position cache logic**: `positionsCache.ts` is shared, but `AccUsersGraph.tsx:203-264 loadOrComputePositions` reimplements warmup+freeze around it. Dies with the donor.
- **Duplicate "same person" highlight**: donor `buildHighlightSet` (`AccUsersGraph.tsx:531`) vs WINNER `sameUserEdges.ts` + `linkEmphasis.ts`. WINNER's wins.
- **Three renderers in donor** (Cosmos/Canvas2D/Three) vs WINNER's two (cosmos.gl 2D / three.js 3D). Canvas2D fallback is donor-only; not carried forward unless WebGL-absent support is a hard requirement (it is not today).
- **Naming collision** `/access-analysis` (Mosaic) vs `/users/access-analysis` (graph) — resolve in Phase 8.
- After parity: entire donor tree in §1.2 becomes deletable (guarded by the test gate in §11/§12).

---

## 2. Comparison matrix (access-analysis vs spatial-graph)

Status legend: ✅ strong · 🟡 partial/works-but-weak · ❌ missing/broken.

| Capability | access-analysis (WINNER) | spatial-graph (DONOR) | Winner | Action | Risk |
|---|---|---|---|---|---|
| Initial load | 🟡 DuckDB+cosmos init, single snapshot | 🟡 worker + multi-query | A-A | keep; profile | L |
| 2D performance | ✅ cosmos.gl frozen, dontRescale ticks | ✅ cosmos path | A-A | keep | L |
| 3D orbit smoothness | ✅ three.js OrbitControls, eased tilt | 🟡 three renderer w/ y-flip quirks | A-A | keep | L |
| Physics animation | ✅ two-bus, gentle reheat | 🟡 worker, heavier | A-A | keep | L |
| **Dimension sliders** | ❌ wired but inert (empty targets) | ✅ real anchors | **port from donor** | **§5** | **H** |
| **Node coloring** | ❌ hardcoded near-white | ✅ role/external/admin-tier | **port from donor** | **§6** | M |
| Edge coloring | ✅ same-user emphasis (3 tiers) | 🟡 sim-only/transparent | A-A | keep | L |
| **Organic clustering** | ❌ spherical ball | ✅ blob/topology anchors | **port from donor** | **§4–5** | **H** |
| Lasso accuracy | 🟡 mechanism present, unverified | ✅ Mosaic clause + polygon | A-A (fix) | **§7** | M |
| Search behavior | 🟡 debounced mask, no autocomplete | ✅ autocomplete (top-8) | A-A (+donor idea) | port idea | L |
| Hover behavior | ✅ rAF-coalesced, portal tooltip | ✅ DOM tooltip | A-A | keep | L |
| Click/select | ✅ click-isolate → mask | ✅ select → side panel | A-A | keep | L |
| Selection panel (lasso) | 🟡 pie breakdown | ✅ role/module summary | A-A (+donor) | port summary | L |
| **User-detail panel** | 🟡 4 fields, lowercased text bug | ✅ richer side panel | A-A (expand) | **§9** | L |
| Resizable sidebars | ❌ fixed, swap-resizes canvas | 🟡 collapsible rail | A-A (rebuild) | **§10** | M |
| **Camera stability on select** | ❌ panel swap → refit jump | 🟡 select collapses rail | A-A (fix) | **§8** | M |
| Aesthetics (organic) | ❌ rigid ball | ✅ communities visible | A-A (via §4–6) | — | H |
| Testability | ✅ unit + e2e bridge | ❌ none | A-A | keep/extend | L |
| Maintainability | ✅ layered, pure cores | ❌ 4,095-line monolith | A-A | keep | L |

**Read:** WINNER leads on architecture, rendering, edges, tests. DONOR leads on the four data→visual features that make a graph *look like a graph*: **anchors, clustering, color, slider effect.** Those four are the heart of this plan.

---

## 3. Final route / component architecture

- **Final route:** `/users/access-analysis` (`AccessAnalysisShell`). Nav: rename/repoint the "Access Analysis" entry here (or introduce a single "Spatial Graph" entry pointing here) in Phase 8.
- **Deprecated route:** `/users/spatial-graph` — kept temporarily as a side-by-side comparison reference, deleted after parity (§11/§12).
- **Untouched:** `/access-analysis` Mosaic dashboard stays for now (separate concern); only the *nav naming* is reconciled so it stops competing with the graph for the "Access Analysis" name.
- **Component shape (target):**
  ```
  AccessAnalysisShell
   ├─ SliderProvider (physics) ─ FilterProvider ─ SelectionProvider
   ├─ Toolbar (mode, lasso, color-mode selector [new], search)
   ├─ <ResizableLayout>
   │    ├─ LeftRail   : filters · sliders · color mode · legend   [new resizable]
   │    ├─ GraphInteractions(GraphCanvas 2D|3D) + LassoOverlay
   │    └─ RightRail  : SelectionPanel | UserDetailPanel | (home) [fixed-width, no swap-resize]
  ```
- **Preserve as-is:** `physicsLayer` two-bus, `mathLayer` purity, `usePredicateEngine` single-mask channel, `graphTestBridge` + e2e, WS2 edge files.

---

## 4. Layout / physics diagnosis (the "globe")

**Root cause (confirmed):** `AccessAnalysisShell.tsx:64-76` `makeEmptyTargets()` builds **all-zero** per-dimension target arrays, and line 281 feeds those into `createPhysicsLayer`. The real semantic-seed math — `mathLayer.ts:83 computeTargetPositions()` — **is never called by the live shell.**

Consequence chain:
1. Every `forceX/Y/Z` accessor (`physicsLayer.ts:200-213`) returns `t.x[i] = 0` → all dimension forces pull toward the **origin** for every node.
2. The only spatial differentiator left is `forceManyBody` repulsion, which ramps `REPULSION_ZERO -10 → REPULSION_ONE -60` with max slider (`physicsLayer.ts:118-119, 294`).
3. Uniform repulsion around a single attractor = an isotropic cloud → **a ball.** Normalization (`normalizeNodePositions`, `LAYOUT_HALF_EXTENT 350`) then frames that ball into the viewport, reinforcing the "decorative globe" look.

So the spherical feel is **not** a forceCenter problem, not a normalization problem, and not an architecture failure — it is one placeholder function. `mathLayer`'s zero-state (all sliders 0 → `(0,0,0)`) is also correct-by-design; it just means **at rest the graph should be deliberately seeded**, not left to repulsion.

**Why the donor looks organic:** `accGraphOrganicLayout.ts` computes **real anchors** — `computeBlobSeedPositions` / `computeTopologySeedPositions` (Fibonacci-sunflower of project centroids) + `precomputeBlobAnchorBuffer` / `applyBlobAnchorBuffer` over `BLOB_AXIS_COUNT` axes — so seed positions already encode structure (project / role / folder-team), and forces refine rather than invent it.

**Proposed layout model (WINNER):**
- Replace `makeEmptyTargets` with the documented **per-dim derivation (option-a)**: for each dim `d`, call `computeTargetPositions(features, dims, {[d]:1})`, split `Float32Array(n*3)` into `{x,y,z}` → `TargetArrays`. (`STATE.md` "Per-dim target derivation uses option-a".)
- For **categorical** dims (project/role/tier), upgrade `mathLayer` from one-axis-per-dimension to **per-category cluster anchors** (donor's blob model), so "Project" slider pulls each node toward *its* project's anchor — producing visible communities, not a single ring.
- Keep a small non-zero **rest seed** (e.g. low-weight default on one structural dim, or a gentle jitter) so the at-rest view already shows clusters instead of a ball.
- Keep `manyBody` for intra-cluster spacing only; consider mild containment so spread stays legible without forcing symmetry.

---

## 5. Slider / clustering diagnosis

**Sliders are wired but inert for clustering.** The plumbing is correct: `SliderContext.tsx:114-123 flushToPhysics` → `physics.updateSliders` (rAF-coalesced), and `physicsLayer.ts:287-325` mutates each `${dim}-x/y/z` force strength + `manyBody` + `alphaDecay` and reheats with `alpha(target).restart()` (PHYS-02). The blend is additive (`STATE.md`: `Σ(u_d·f_d·s_d)/Σ(s_d)`, no fixed budget → no slider-stealing).

**But** because §4's targets are empty, raising a slider raises the strength of a force aimed at the origin — pure center-pull + repulsion ramp. Hence "sliders are decorative": they change *tightness*, never *grouping*.

**Dimensions today** (`SliderContext.tsx:29-36`): `role, tier, project, isExternal, activity, signin`. `featureSnapshot.ts` already supplies the raw signal for all six (role, permTier, project, isExternal, activityBucket, signinBucket) — **no backend change needed.**

**Proposal:**
- **Target generation:** boolean/scalar dims (isExternal, activity, signin) → existing axis model. Categorical dims (role, tier, project) → per-category anchors (donor blob), each category a point on a ring/sphere; node target = its category's anchor.
- **Force blend:** keep the normalized additive formula; verify two engaged sliders **blend** (node sits between both anchor fields) rather than one dominating.
- **Smoothing:** keep rAF coalescing + gentle `alpha(maxSlider)` reheat; keep the `SKIP_THRESHOLD 0.02` no-reheat guard against scroll thrash.
- **Stability:** slider changes must **not** reset camera (see §8) — reheat moves nodes, not the view.
- **Acceptance/observability test:** monotonicity sweep already proven in `mathLayer` tests; add an integration assertion that with `project=1` the mean within-project pairwise distance is materially smaller than the cross-project distance (clusters actually form).

---

## 6. Color system proposal

Today the shell paints near-white nodes (`AccessAnalysisShell.tsx:141-150`) and only edges carry meaning. All data for real color modes is **already in the snapshot** — purely a front-end add.

**Default mode:** **Internal vs External** (`isExternal`) — the highest-signal, lowest-cardinality split for this org (donor uses `EXTERNAL_NODE_COLOR` gray-400 for externals).

**Secondary modes (Toolbar selector):**
- Company / firm (`firmName`)
- Role tier (`permTier`: view/upload/edit/control — donor LUT `PERM_TIER_COLOR`)
- Project (`project`) — categorical palette
- Activity level (`activityBucket`)
- Account status (`accountStatus`)

**Edge color (unchanged from WS2):** same-user footprint with three brightness tiers (bright/base/dim) from `linkEmphasis.ts`; focused footprint bright, unrelated dimmed. No new edge types (constraint).

**State rules (override category color):**
- Selected/isolated: full-strength accent, larger size — must read **stronger** than any category hue.
- Hover: subtle ring/lift, no recolor.
- Dimmed (mask < 0.99): cosmos `pointGreyoutOpacity 0.15` (already wired in `applyAlphaMask`) — stays readable.
- 2D and 3D must use **identical** color semantics (3D premultiplies alpha into RGB per WS2 §5).

**UI:** color-mode is **explicit** in the Toolbar; a legend lives in the LeftRail and updates with the mode. Colors are deterministic LUTs (no random hashing for low-cardinality dims; donor's `roleColor` hash is acceptable only for high-cardinality fallback).

---

## 7. Lasso bug diagnosis

**Mechanism (sound):** `LassoOverlay.tsx` captures `offsetX/offsetY` (CSS px, overlay-local) → on pointerup maps each point through `graphHandle.screenToSpace` (`GraphCanvas2D.tsx:343 screenToSpacePosition`) → `findPointsInPolygon`. Path is held in a `useRef` (never state); `setPointerCapture` keeps `pointerup` firing outside the canvas. Lasso is **2D-only** by design (`GraphInteractions.tsx:201`).

**Suspected root cause (needs runtime repro):** coordinate-origin / DPR mismatch between the **overlay canvas** and the **cosmos canvas**:
- The overlay sits in the `GraphInteractions` wrapper (`position:relative; 100%×100%`), while cosmos owns its own canvas inside `GraphCanvas`'s container. If the two rects don't share an exact origin (padding/border) or if `screenToSpacePosition` expects coords relative to the **cosmos canvas bounding rect** (not the overlay's `offsetX/Y`), the polygon is offset.
- `STATE.md` explicitly flags this as the one MEDIUM-confidence item: *"Lasso canvas-to-graph-space coordinate transform under pan/zoom is MEDIUM confidence … Validate immediately."*

**Fix plan:**
1. Reproduce with a known box at a known zoom/pan; log overlay rect vs cosmos canvas rect vs `screenToSpace` output.
2. Convert pointer coords using the **cosmos canvas** `getBoundingClientRect()` (`clientX - rect.left`, `clientY - rect.top`) rather than overlay `offsetX/Y`, or guarantee pixel-perfect overlay alignment with the cosmos canvas.
3. Confirm `screenToSpacePosition` is fed CSS px (cosmos handles DPR internally); do **not** pre-multiply by `devicePixelRatio`.
4. Validate after pan and after zoom, and after layout freeze.

**e2e plan:** drive a deterministic rectangular lasso over a seeded cluster via the test bridge; assert the matched index set equals the known enclosed set, repeated at default view, after pan, and after zoom. 3D lasso remains deferred (different projection model).

---

## 8. Camera-stability diagnosis

**Symptom:** selecting a node disorients the view.

**Root cause (WINNER, strong candidate):** `RightPanelStack.tsx:60` uses `<AnimatePresence mode="wait">`. On select, the top layer switches `sliders → user-detail`. `mode="wait"` **unmounts the old panel before mounting the new one**, so the graph's `flex-1` container (`AccessAnalysisShell.tsx:161-192`) momentarily widens (panel gone) then shrinks (panel back). cosmos.gl resizes to its container and re-applies `fitViewOnInit`/auto-fit → the camera lurches. The `fittedRef` one-shot (`GraphCanvas2D.tsx:251`) re-arms on reheat, compounding refits.

Selection itself is **not** the culprit at the data layer — click-isolate routes through `usePredicateEngine` → `physics.setMask` only (mask bus; no sim, no camera). So the fix is **layout**, not interaction.

**Donor parallel:** `AccUsersGraph.tsx:1028-1036` auto-collapses the filter rail on select at ≤1280px → also a resize-driven jump. Same lesson.

**Recommended behavior:** selecting opens the detail panel **without moving the graph.** Camera moves only on an **explicit** "focus/zoom to node" action, animated.

**Implementation plan:**
1. Give the right rail a **reserved fixed width** that does not change between sliders/selection/detail (no `mode="wait"` gap; cross-fade in place, or always-mounted layers).
2. Suppress cosmos auto-refit on container resize after the first fit: preserve camera (don't re-`fitView` on resize); only `fitView` on explicit user action or initial settle.
3. Make `fittedRef` fire **once** on first freeze and not re-arm on mask/selection changes (only on a real new-layout reheat).

**Regression test:** snapshot camera transform (center/zoom) before vs after a node click; assert equal. Repeat for lasso completion and filter change.

---

## 9. Selected-user detail panel proposal

**Current state:** `UserDetailPanel.tsx` shows only `External / Last sign-in / Activity / Sign-in bucket` plus a projects list — and renders **`nameLower` / `emailLower`** (the lowercased search fields) as the display name/email (`:103-108`). The snapshot **already loads** far more: `firmName`, `accountStatus`, `permTier`, `permissionCoverage`, `isExternal`, `activityBucket`, `signinBucket`, `role`, `project`, `activityCountRaw`, `lastSignInRel`.

So the upgrade is **mostly display**, not new queries.

**Proposed schema (★ = already in snapshot, 0 cost):**

| Field | Source | Cost |
|---|---|---|
| Name (proper case) | needs raw `name` (snapshot only keeps lowercase) | small: add `name`/`email` raw to snapshot |
| Email (proper case) | as above | small |
| ★ Firm / company | `firmName` | 0 |
| ★ Internal/External | `isExternal` | 0 |
| ★ Account status | `accountStatus` | 0 |
| ★ Permission tier | `permTier` | 0 |
| ★ Permission coverage | `permissionCoverage` | 0 |
| ★ Activity (raw + bucket) | `activityCountRaw`/`activityBucket` | 0 |
| ★ Last sign-in (+ stale warn) | `lastSignInRel`/`signinBucket` | 0 |
| Projects & roles (all) | `loadUserProjects` (already queries) | 0 |
| **Same-user footprint count / other projects** | `deriveSameUserEdges` already computes the chain; surface count + project list | small: pass edge map in |
| Risk indicators (external+control, stale+admin) | derived from above | small |

**Plan:** (a) add raw `name`/`email` to `NodeFeatureSnapshot` + `featureSnapshot.ts` SELECT and fix the lowercased-heading bug; (b) expand the panel grid to all ★ fields with a stale/inactive badge; (c) wire the same-user footprint count from existing edge data; (d) align the visual density with the donor side panel / Users Directory. **No new backend procedures required.**

---

## 10. UI / panels

Preferred UI is the WINNER's, but it must become resizable so the graph stays usable.

- **LeftRail (resizable, collapsible):** filters · dimension sliders · **color-mode selector + legend** · graph controls (mode 2D/3D, lasso).
- **RightRail (fixed-reserved width, no swap-resize):** selection summary (lasso) / user-detail (click) / home (sliders). Always-mounted layers or in-place cross-fade — **never** an `AnimatePresence mode="wait"` gap (§8).
- **Canvas:** consumes remaining space; **no aggressive refit** when panels open/close (§8).
- **Defaults:** LeftRail open at ≥1280px; collapsible to an icon rail below; **no resize-driven camera fights.**
- **Risks:** resizable panels + cosmos resize handling interact with the camera fix — land §8 first.

---

## 11. Consolidation implementation plan (atomic phases)

> Sequenced so the **highest-value, lowest-risk** win (kill the globe) ships first, and the donor route is deleted **only** behind a passing parity gate. Each task lists files · goal · test · commit · rollback.

### Phase 1 — Audit & decision  ✅ (this document)

### Phase 2 — Shared foundation (no behavior change)
- **2.1** Extract donor anchor math into a **pure, importable** module reusable by `mathLayer`/shell (port `computeBlobSeedPositions` / anchor-buffer logic; keep it pure, purity-tested).
  - Files: new `app/(dashboard)/users/access-analysis/anchors.ts` (ported), `anchors.test.ts`
  - Test: unit (determinism + cluster separation); no UI change
  - Commit: `feat(acc-graph): pure cluster-anchor module ported from spatial-graph`
  - Rollback risk: **L** (additive, unused until Phase 3)

### Phase 3 — Layout & sliders (kills the globe) — **first user-visible win**
- **3.1** Replace `makeEmptyTargets` with real per-dim `computeTargetPositions` derivation (option-a).
  - Files: `AccessAnalysisShell.tsx` (remove `makeEmptyTargets`, build `TargetArrays`), `mathLayer.ts` (categorical per-category anchors via Phase 2 module)
  - Test: integration — `project=1` ⇒ within-project distance ≪ cross-project; monotonicity sweep stays green; e2e non-regression
  - Commit: `fix(acc-graph): drive layout from real dimension targets (remove placeholder)`
  - Rollback risk: **M** (core layout; revert restores globe)
- **3.2** Rest-seed so the at-rest view shows clusters, not a ball; verify slider blending.
  - Commit: `feat(acc-graph): organic rest seed + verified slider blend`
  - Risk: **M**

### Phase 4 — Color system
- **4.1** Node color modes (default Internal/External) from snapshot fields + Toolbar selector + LeftRail legend; selected/hover/dim override rules; 2D/3D parity.
  - Files: `AccessAnalysisShell.tsx` (replace white buffer), new `nodeColors.ts` + test, `Toolbar.tsx`, legend in `SliderSidebar`/LeftRail
  - Commit: `feat(acc-graph): node color modes with explicit selector + legend`
  - Risk: **L–M**

### Phase 5 — Lasso correctness
- **5.1** Fix coordinate mapping (§7) + add e2e accuracy tests (default/pan/zoom).
  - Files: `LassoOverlay.tsx`, `GraphCanvas2D.tsx` (if rect helper needed), `tests/e2e/acc-dc-graph.spec.ts`
  - Commit: `fix(acc-graph): lasso selects exactly the enclosed region`
  - Risk: **M**

### Phase 6 — Selection & camera stability
- **6.1** Reserved-width right rail (no swap-resize) + suppress resize-refit + one-shot fit (§8).
  - Files: `RightPanelStack.tsx`, `AccessAnalysisShell.tsx`, `GraphCanvas2D.tsx`
  - Test: camera-transform-equal-before/after regression (click, lasso, filter)
  - Commit: `fix(acc-graph): stable camera on select; explicit focus only`
  - Risk: **M**

### Phase 7 — User detail panel
- **7.1** Add raw `name`/`email` to snapshot; fix lowercased heading; expand fields; same-user footprint count (§9).
  - Files: `interactionTypes.ts`, `featureSnapshot.ts`, `UserDetailPanel.tsx`
  - Commit: `feat(acc-graph): rich selected-user detail panel`
  - Risk: **L**

### Phase 8 — UI consolidation + route deprecation
- **8.1** Resizable/collapsible LeftRail; simplify controls (§10).
  - Commit: `feat(acc-graph): resizable sidebars + control cleanup`
  - Risk: **M**
- **8.2** Nav: point the single graph entry at `/users/access-analysis`; resolve the "Access Analysis" naming collision.
  - Files: `components/layout/navigation.ts`, `navigation.test.ts`
  - Commit: `feat(nav): unify graph entry on access-analysis`
  - Risk: **L**
- **8.3** **Only after the parity gate (§12) passes:** delete `/users/spatial-graph` + donor tree (§1.5).
  - Commit: `chore(acc-graph): remove legacy spatial-graph after parity`
  - Risk: **M** (deletion) — gated + revertable

---

## 12. Test plan, risks & rollback

### Test plan
- **Unit:** keep all `access-analysis/*.test.ts(x)` green; add `anchors.test.ts`, `nodeColors.test.ts`, cluster-separation + camera-stability assertions.
- **e2e (`npm run test:e2e`, `tests/e2e/acc-dc-graph.spec.ts`):** preserve the harness/`graphTestBridge`; add lasso-accuracy (default/pan/zoom), color-mode, camera-stability, and **parity** checks.
- **Parity gate (precondition for §8.3 deletion):** node count, cluster formation, lasso accuracy, color semantics, detail-panel completeness, edge emphasis, and 2D+3D non-regression all pass on the WINNER. WS2 2D **and** 3D edge checks stay green.
- **No manual-only verification** — every fix lands with an automated assertion (hard constraint).

### Risks
| Risk | Sev | Mitigation |
|---|---|---|
| Categorical anchor model is harder than scalar axes | H | Phase 2 ports proven donor math; isolate + unit-test before wiring |
| Globe fix regresses cache keys (targets change hash) | M | `hashNodeSetAndSliders` already keys on sliders; verify cache invalidates cleanly |
| Camera fix vs resizable panels interact | M | Land Phase 6 before Phase 8; camera-equality regression test |
| Donor deletion removes a still-used util | M | Parity gate + grep for cross-imports before §8.3; deletion is its own revertable commit |
| Scope creep into new edge types / DuckDB edge table | H | Explicitly out of scope; WS2 stays separate |

### Rollback strategy
- Each phase is atomic, independently revertable; no phase deletes donor code until §8.3.
- `/users/spatial-graph` stays live as the comparison route through Phases 2–7, so the donor is always one nav click away if the WINNER regresses.
- Phase 3 (globe) is the only change that alters core layout; its revert is a single commit restoring `makeEmptyTargets`.
- Final deletion (§8.3) is gated, isolated, and revertable.

### Hard constraints honored
No implementation before this spec · one final surface (no permanent duplicates) · 2D **and** 3D edges preserved · e2e harness preserved · no new edge types · no DuckDB edge table · lasso made accurate · no auto-camera-move on select · sliders made functional · no manual-only verification · **WS2 3D edges remain a separate track.**
```
