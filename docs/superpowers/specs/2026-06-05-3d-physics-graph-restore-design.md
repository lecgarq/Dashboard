# Design — Restore the 2D-era physics graph as a 3D-only experience at `/users/spatial-graph`

**Date:** 2026-06-05
**Status:** Approved (owner), pending spec review
**Branch:** `feat/access-analysis-redesign`

## Problem

The owner rejected the current default at `/users/spatial-graph` — the 3D
embedding-projector (the ~12 `acc-embed` commits). The projector packs people
into preset-colored clusters, exposes only a "number of clusters" slider, hides
the individual ~17k nodes, and removed per-node click. The owner wants the
**earlier physics graph** back: per-dimension sliders that drive an organic
force layout, color-by-dimension, lasso, click-a-node-for-profile, and every
node visible — but rendered **in 3D only** (no 2D mode, no toggle).

The features were not lost in one redesign. They eroded across a chain of pivots
(dimension catalog → cluster blobs → curated grid → single-user slider →
similarity embedding → 3D projector). The underlying physics graph
(`AccessAnalysisShell`) still exists behind the `NEXT_PUBLIC_ACC_PERSON_GRAPH=0`
escape hatch, with most of the wanted machinery intact but buried under later
additions.

## Goal

`/users/spatial-graph` loads a **3D-only physics graph** with:

- **Per-dimension physics sliders** driving a 3D force layout (a dimension's
  slider raises the attraction pulling same-value people together — organic, not
  packed discs; no cluster-count concept).
- **Color-by-dimension** via the toolbar color picker (not locked to cluster-id).
- **Click a node → profile panel.**
- **3D lasso** — drag-to-select a group, projected at the current camera angle.
- **All ~17k nodes** rendered.

## Non-goals

- Deleting the 2D renderer or the embedding-projector code (both stay in the
  repo; the projector behind its flag, the 2D path dormant — reversible).
- The separate analytics dashboard at `/access-analysis`.
- Any brand-new analytics, dimensions, or layout concepts.

## Approach — Path B ("peel back"), 3D-only

Keep the existing physics shell (`AccessAnalysisShell`, which already runs on
today's data plumbing and keeps every recent speed/data fix) and remove the
three later layers that diverge from the target, force the renderer to 3D, and
add a 3D lasso. This is the smallest change that runs on current data and
restores the named features, because the physics layer, the slider sidebar,
node-click, and all-node rendering are all still wired — only visually
overridden.

### What is already intact (verified by reading the code)

- `GraphCanvas3D` (three.js InstancedMesh + OrbitControls) renders node positions
  straight from `physics.getPositions()` (stride-3 xyz) via `pushPositions()` —
  so the **physics layer already drives 3D positions**; sliders flow through.
- `GraphCanvas3D` already wires **click/hover via a raycaster**
  (`intersectObject(mesh)` → instanceId → `onIsolate`) — **click-to-profile works
  in 3D**.
- `RightPanelStack` already mounts `CatalogSliderSidebar` (per-dimension
  sliders), `SelectionPanel` (lasso breakdown), and `UserProfilePanel`
  (node-click profile).
- The physics layer (`createPhysicsLayerWorker`) is created from
  catalog-derived targets + weights + slider values, over **all** node ids.

### What changes

1. **Route default → 3D physics shell.**
   `AccessAnalysisShellClient` renders the physics shell by default and the
   projector only when opted-in (`NEXT_PUBLIC_ACC_PERSON_GRAPH=1`). The projector
   is no longer the default but is not deleted.

2. **Force the shell to 3D only.**
   `AccessAnalysisShell` hard-sets render mode to `"3d"` and removes the 2D/3D
   toggle (both the floating overlay button and the Toolbar mode control). The
   2D renderer (`GraphCanvas2D`, cosmos.gl/GPU sim) stays in the repo but is no
   longer mounted.

3. **Remove the forced "user-blob" clustering.**
   `ShellBody` stops building `buildUserBlobDescriptor` and stops feeding
   `layoutTarget` / `aggregateTarget` / blob-derived `colorIds` to the renderer.
   With the overlay gone, `GraphCanvas3D` renders the **slider-driven physics
   positions** directly, and `nodeColors` falls back to
   `buildNodeColors(features, colorMode)` — i.e. **color-by-dimension**.

4. **Un-pare the sliders to a meaningful grouped set.**
   Replace `curatedSliderDimensions(catalog)` with a selector that surfaces the
   structural dimensions — **Project, Role, User, Permission, Folder, Activity,
   Module** — and routes the long tail of micro-dimensions into a collapsed
   "Advanced" group. Physics targets/weights (`buildCatalogTargets`,
   `buildCatalogWeights`) are built for **every surfaced slider** so each one
   actually moves the layout. Structural dims already exist via
   `buildStructuralDimensions()` in `dimensionCatalog.structural.ts` (no new
   API; fed by `bulkUsers`), so "un-pare" is a surface/selector change, not a
   data change. (Exact member ids pinned during planning from the live
   `buildDimensionCatalog` output.) **Validate** that collapsed/inactive
   Advanced sliders pass **weight 0** to `physicsWorkerScript.ts` so they add no
   noise to the force simulation.

5. **Build the 3D lasso.**
   A bounded new unit. Reuse the existing `LassoOverlay` drag-polygon UI, but:
   - **Projection (pure helper):**
     `findPointsIn3DLasso(positions, camera, polygon, width, height) → Set<index>`
     — world `(x,y,z)` → `vector.project(camera)` (NDC `[-1,1]`) → viewport scale
     to screen `(px,py)` against the overlay canvas's CSS width/height (which
     already matches the viewport exactly, per `LassoOverlay.tsx`) → existing
     point-in-polygon test. No DOM/three.js scene needed → fully unit-testable.
   - **Orbit suppression:** disable OrbitControls rotation/zoom while a lasso
     drag is active so the gesture selects instead of rotating; re-enable on
     drag end. Register the `pointerup` finalizer on **`window`** (not just the
     canvas) so dragging off-screen still cleanly ends the gesture and never
     leaves OrbitControls locked.
   - **Wiring:** `GraphInteractions` stops gating the lasso on `mode === "2d"`;
     `lassoActive` enables the 3D lasso overlay. The completed selection flows
     into the existing `SelectionContext` / `SelectionPanel` exactly as the 2D
     lasso did.

## Components / units

- **Route gate** (`AccessAnalysisShellClient`) — picks physics shell (default) vs
  projector (opt-in flag). One trivial conditional.
- **Physics shell** (`AccessAnalysisShell` / `ShellBody`) — composition: mode
  hard-3D, no blob descriptor, semantic color, meaningful sliders. Owns the
  load/provider wiring (unchanged) and the per-frame physics → renderer hand-off.
- **Slider surface selector** (replacement for `curatedSliderDimensions`) — pure:
  `(catalog) → { primary: dims[], advanced: dims[] }`. Testable in isolation.
- **3D lasso projection** (new pure helper) —
  `(xyz: Float32Array, camera matrices, polygon: pts) → Set<index>`. No DOM, no
  three.js scene; fully unit-testable.
- **3D lasso interaction** (in `GraphInteractions` + `GraphCanvas3D`) — overlay
  render, OrbitControls suppression, selection dispatch into `SelectionContext`.

## Data flow

```
bulkUsers (tRPC, current data)
  → buildGraphNodesFromUsers → features (all node ids)
  → buildDimensionCatalog → meaningful slider surface
  → buildCatalogTargets / buildCatalogWeights (per surfaced slider)
  → createPhysicsLayerWorker(targets, weights, sliderValues)
  → physics.getPositions() (stride-3 xyz)            ── per frame ──►
  → GraphCanvas3D.pushPositions()  (three.js InstancedMesh)
        ▲                                   │
        │ slider drag (SliderContext)        ├─ click (raycaster) → onIsolate → UserProfilePanel
        └────────────────────────────────────┤
                                             └─ lasso drag → project(xyz,camera,polygon)
                                                  → Set<index> → SelectionContext → SelectionPanel
Color: buildNodeColors(features, colorMode)  → GraphCanvas3D instance colors
```

## Confirmed by code review (2026-06-05)

- **Physics:** the worker (`physicsWorkerScript.ts`) runs `d3-force-3d` natively
  off the main thread (`forceSimulation(nodes, 3)`, `forceX/Y/Z`,
  `forceManyBody`). At all-0 sliders, `REPULSION_ZERO = -10` spreads nodes into
  an organic sphere — **no origin collapse** (resolves the prior top risk).
- **Lasso overlay:** `LassoOverlay.tsx` is a full-viewport transparent 2D
  `<canvas>` over the WebGL container, recording pixel coords on pointer events —
  so screen-space projection maps 1:1.
- **Structural dims:** `buildStructuralDimensions()` in
  `dimensionCatalog.structural.ts`, fed by `bulkUsers` — already present.

## Risks / verify first in planning

1. **Physics-at-rest behavior — RESOLVED by review above.** Still confirm in the
   running build that raising a slider visibly groups same-value nodes (the
   forces are slider-weighted), but no origin-collapse risk remains.
2. **3D lasso correctness.** Projection math (world → NDC → screen) must match the
   on-screen node positions, and OrbitControls must be cleanly suppressed/restored
   around a drag without leaving the camera in a bad state.
3. **Renderer purity after overlay removal.** Confirm `GraphCanvas3D` renders
   correctly when no `layoutTarget`/aggregate props are supplied (the
   cluster-mode branches must no-op, not break).

## Testing

- **Unit:** slider-surface selector (primary/advanced split); 3D lasso projection
  helper (points inside/outside polygon at a known camera); `buildNodeColors`
  semantic path remains the active color source when no blob ids.
- **e2e:** flip the flag-guards — the physics-shell specs (`acc-positioning`,
  `acc-dc-graph`) run by default; the projector spec runs only under
  `NEXT_PUBLIC_ACC_PERSON_GRAPH=1`. Add a 3D-lasso smoke (enter lasso mode, drag,
  assert a non-empty selection flows into the SelectionPanel). Machine-load flake
  on lasso e2e is documented; run on an idle machine.
- **Gates:** full unit suite + `tsc` clean before any rebuild; visual UAT by the
  owner after a rebuild (3D scatter, slider grouping, color-by-dimension, click,
  lasso).

## Rollout

- Behind the existing build-time flag inversion (default = physics shell). A
  rebuild (`npm run build` + restart) ships it via the existing deploy mechanism;
  do not rebuild under the running `:3000` instance.
