# Folder Permission Terrain — Professional Pass 2

**Date:** 2026-06-09
**Branch:** feat/access-analysis-redesign
**Surface:** `/access-analysis` → Folder Permission Terrain panel
**Status:** Design approved by owner (2026-06-09). Supersedes the Compare-mode and
visual-finish portions of `2026-06-09-folder-terrain-pro-design.md`; that pass's camera
core, navigation, and detail panel remain in force.

## Problem

The terrain (live on :3000) ships an isometric folder×role bar field with three modes
(Single / Compare / Overview) on a pivot-stable orthographic axonometric camera. The owner
finds it unprofessional and confusing in three specific ways:

1. **Compare is an unreadable blob.** The compare branch stacks every selected project into
   **one shared camera world** with only a 2-grid-row gap (`SLAB_GAP = 2`). Because the
   terrain tilts diagonally, consecutive slabs cascade into and overlap each other and read
   as a single merged tower — you cannot tell where one project ends and the next begins.
   The owner wants the **isometric view *by project*** back: each project a clearly separated
   plane, "not layted like that."
2. **Colours/shaders feel lazy.** Faces are filled with a single flat `tint()` per side — no
   gradient, no soft shadow, no rim light — and low-access (rank-1) cells dominate as one
   dark `#3b1c6e` mass. Correct, but unlit and flat.
3. **Animations feel lazy.** There are essentially none: camera, mode, and data changes snap
   instantly; hover only toggles a stroke.

The owner's INSPIRATION images (BOT-OR-NOT; the tier-1/2/3 city infographic; Virtual/Mix/Real)
all show the same target: **separate isometric planes, one per category, stacked vertically
with airy gaps and faint connector drop-lines**, each independently legible.

## Owner decisions (chosen via Q&A, 2026-06-09)

- **Compare layout:** **stacked floating planes** (not side-by-side tiles). Each project is
  its own isometric island; planes stack top→bottom with generous gaps and faint connector
  lines; one shared camera tilts the whole exploded stack together.
- **Colour direction:** **cool professional teal→gold** sequential ramp (low access =
  slate-teal … full control = gold), with gradient-shaded faces, soft contact shadows, and
  crisp lit top edges.

## Scope boundary

- **In scope:** Compare-mode geometry/layout; the tier colour ramp; per-face shading;
  contact-shadow softening; animation layer; chrome/clarity polish. Single & Overview modes
  inherit the new colours/shading/animation but keep their existing single-plane layout.
- **Out of scope (non-goals):** WebGL/canvas rewrite (SVG gradients + filters deliver the
  "shader" feel at this data scale); any data/ingestion change (runs on the existing
  `folderPermissionTerrainView` / overview server views); touch gestures; the camera core,
  navigation model, pivot behaviour, and detail panel from pass 1 (unchanged).

## Architecture

Four units, each independently testable, built in order. Pure geometry/colour logic lives in
`folderTerrain.ts`; React/animation lives in `FolderPermissionTerrain.tsx`.

### Unit A — Colour ramp + lit shading (`folderTerrain.ts`)

- **Replace `TIER_COLORS`** with the cool-professional ramp (rank 1..5):
  `1` slate-teal, `2` teal, `3` cyan, `4` amber, `5` gold. Concrete hexes chosen to keep a
  monotonic, clearly-ordered low→high progression that reads on both the dark (`#09090B`
  zinc) and light themes. `colorForRank`, `TIER_LEGEND`, the detail-panel header, and the
  legend swatches all consume `TIER_COLORS`, so they update for free.
- **Gradient side faces.** Each visible side face is filled with a per-tier vertical
  `<linearGradient>` (lighter near the top edge → deeper toward the base) rather than a flat
  `tint()`. Five gradients (one per rank) are defined once in `<defs>` and referenced by
  `url(#…)`; the existing directional `sideBrightness` still selects *which* side is darker
  (it modulates the gradient stop offsets/opacity per face, not a flat colour). Geometry
  helpers emit, per side face, both its `fill` (gradient ref) and its brightness so the
  renderer can apply the directional term.
- **Soft contact shadow.** The shadow footprint polygons are rendered inside a group that
  uses an `feGaussianBlur` filter, turning today's hard polygon into a soft halo. Filter is
  defined once in `<defs>`.
- **Lit top edge / rim.** Keep the bright top-face stroke; add a faint rim highlight on the
  lit side's top corner.

**Tests (`folderTerrain.test.ts`):** ramp is monotonic and defined for ranks 1..5;
`colorForRank` falls back to rank 1; gradient ids are stable and one-per-rank; the scene
emits a gradient ref (not a flat hex) for side faces and a solid top fill.

### Unit B — Stacked floating planes for Compare (`folderTerrain.ts` + `FolderPermissionTerrain.tsx`)

The core fix. Replace the single-camera, grid-row-offset tower with **independent per-plane
scenes offset in screen pixels**.

- **New pure helper** `buildStackedScenes(datas, axes, camera, viewport, opts)` returns
  `{ planes: { scene, source, label, headerX, headerY }[], connectors }`:
  - Builds one `buildCameraScene` per project, all sharing the camera's `yaw`/`pitch`/`scale`
    and `pivotCol`/`pivotRow` (the shared-axes centre), but each anchored at a **different
    screen Y**: `anchorY_i = camera.anchorY + i * planePitch`, where
    `planePitch = footprintScreenHeight + maxBar + gap`, scaled by `camera.scale` so gaps
    track zoom. `anchorX` is shared. Because each plane is its own scene with its own
    anchor, planes stay parallel and clearly separated — no diagonal bleed.
  - **Connectors:** dotted segments join the four matching ground corners
    (`back/right/front/left`) of consecutive planes `i → i+1`.
  - **Virtualization:** a plane is built/returned only if its vertical band
    `[anchorY_i − maxBar, anchorY_i + footprintScreenHeight] + margin` intersects the
    viewport. The band is approximate under tilt; the margin absorbs it.
  - Each project's data is re-keyed onto the shared axes via existing
    `projectOntoAxes(data, axes)` before its scene is built.
- **Rewire `buildView`'s compare branch** in `FolderPermissionTerrain.tsx` to call
  `buildStackedScenes` and render: per-plane lattice/shadows/bars/labels, the dotted
  connectors, and a bold project header at `headerX/headerY`.
- **`defaultPivot` / framing** updated so a fresh compare set frames the top plane and the
  pivot starts at the shared-axes centre of plane 0; pan scrolls down the tower.
- Existing per-plane lazy load + cache (`loadTerrain`) and the multi-select control are kept.

**Tests (`folderTerrain.test.ts` + `FolderPermissionTerrain.test.tsx`):** N inputs → N planes
at strictly increasing `anchorY`; planes do not vertically overlap (gap between plane `i`'s
bottom band and plane `i+1`'s top band is ≥ 0 at home camera); connectors join matching
corner kinds of consecutive planes; off-viewport planes are virtualized out; switching the
compare set re-frames to the top plane; a header label is emitted per visible plane.

### Unit C — Animation layer (`FolderPermissionTerrain.tsx`)

- **Bar grow-in.** A scene-level height multiplier `g ∈ [0,1]` eases 0→1 (~450 ms,
  ease-out) on first paint, mode switch, and data-key change, with a slight front-to-back
  stagger derived from each bar's depth. Implemented by scaling each bar's `h` by `g`
  (recompute faces) in a rAF loop, or by an SVG transform on each bar group — chosen to keep
  hit-testing correct (prefer recomputing `h` so the top polygon used for hover matches).
- **Camera easing.** `Frame`, `Reset`, and click-to-repivot tween the camera
  (yaw/pitch/scale/anchor) over ~300 ms (ease-in-out) via the existing rAF commit loop.
  Orbit and pan remain 1:1 (no easing on direct drag).
- **Hover lift.** The hovered bar eases up a few px and brightens; leaving eases back.
- **Cross-fade.** Mode / compare-set changes fade the outgoing scene to 0 and the incoming
  to 1 (opacity), coordinated with grow-in.
- **Connector draw-in.** Compare connectors fade/extend in as planes mount.
- All animation is rAF-coalesced and respects `prefers-reduced-motion` (instant when set).

**Tests:** grow-in multiplier starts <1 and reaches 1 (timer-advanced); reduced-motion path
renders final state immediately; camera tween reaches its target; hover sets/clears the
lifted bar. (Animation timing tested via fake timers; visual smoothness is UAT.)

### Unit D — Chrome / clarity polish (`FolderPermissionTerrain.tsx`)

- Lighter lattice + smaller, calmer labels; restyled compass and tool palette to match.
- One clear "how to read this" caption per mode (Single / Compare / Overview).
- Per-plane loading skeleton and a clean empty state.
- Verify dark + light themes via `useTheme`.

## Data flow (unchanged)

`page.tsx` server-loads project options + an initial terrain; `loadTerrain(projectId)` and
`loadOverview()` lazy-load per selection into the client cache. `buildSharedAxes` +
`projectOntoAxes` normalise folders/roles across the compare set. Bar height = users-in-role
(single/compare) or projects-configuring (overview); colour = permission tier
(`permType` → rank → ramp). No server/SQL changes.

## Build order & gates

A (colour + shading) → B (stacked planes) → C (animation) → D (chrome). Each phase ships
with `tsc` 0 and the unit suite green before the next. Final step: safe live rebuild
(`NEXT_DIST_DIR=.next-new` build → swap → `npm start` via background Bash; **do not**
`npm run build` under the running :3000 server) and an owner visual check.

## Data caveats (unchanged, carried forward)

- Folder permissions are live-sync only (≈6M rows, ~950 projects); `permType` is the tier.
- Users per role = union of `AccDcProjectUserRole` + `AccProjectRole` (memberId sparse).
- Bar height = users-in-role (single/compare) or projects-configuring (overview).
- The shared-axes union caps folders and roles at 12 each for legibility.
