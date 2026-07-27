# Folder Permission Terrain — Professional Redesign

**Date:** 2026-06-09
**Branch:** feat/access-analysis-redesign
**Surface:** `/access-analysis` → Folder Permission Terrain panel
**Status:** Design approved (two design forks chosen by owner via Q&A); minor defaults adopted.

## Problem

The terrain is an isometric folder×role bar field that already ships (live on :3000). The
owner wants it to feel professional and has redefined several interactions:

1. **Orbit drifts.** Dragging to rotate makes the whole scene slide because the projection
   auto-fits its bounding box every frame and re-anchors the origin. The pivot must stay
   nailed to the screen during orbit.
2. **Click shows nothing useful.** Clicking a square should clearly reveal richer detail
   *and* make that square the orbit pivot.
3. **Compare is capped at 3 projects.** The owner wants to compare the whole portfolio.
4. **Navigation must follow BIM (Revit/Navisworks) conventions:** pan = middle-mouse
   (scroll-wheel) drag; orbit = Shift + middle-mouse drag.
5. **Pivot** starts at the grid center and is reassigned to any clicked square.

## Owner decisions

- **Compare-all representation:** searchable **multi-select slab stack** (not a consensus
  aggregate, not small-multiples). Pick any N projects; stack them on shared axes.
- **Orbit type:** **full 3D — spin + tilt** (yaw + pitch), always around a fixed pivot.
- Adopted defaults (owner did not object): keep **Overview** (account-wide consensus) as a
  third mode; large Compare selections are **virtualized** (scroll/pan the tower) rather
  than count-capped.

## Architecture

Four units, each independently testable. The camera is the foundation everything else
depends on.

### Unit 1 — Camera core (pure, `folderTerrain.ts`)

Replace the iso-diamond projection with an **orthographic axonometric camera** parameterised
by a pivot, yaw, pitch, scale and a fixed screen anchor.

```
Camera = { pivot:{col,row}, yaw, pitch, scale, anchor:{x,y} }

X = col - pivot.col,  Y = row - pivot.row,  Z = barHeight   // all relative to pivot
screenX = (-X·sin(yaw) + Y·cos(yaw))·step·scale                + anchor.x
screenY = ((X·cos(yaw) + Y·sin(yaw))·sin(pitch) - Z·cos(pitch))·scale + anchor.y
depth   =  (X·cos(yaw) + Y·sin(yaw))·cos(pitch) + Z·sin(pitch)   // painter order, larger = nearer
```

- **Pivot invariance:** because every point is relative to the pivot, the pivot cell
  (X=Y=Z=0) always projects to `anchor` for *any* yaw/pitch/scale → no drift.
- `pitch = 90°` → top-down plan (height flattens); `pitch ≈ 30°` → today's 2:1 iso.
- **Home view** calibrated (yaw 45°, pitch ≈ 32°) to visually match the current panel so
  first paint does not jump.
- **Back-face culling** uses the screen-space signed area of each side quad (as today);
  **side lighting** uses the yaw-rotated outward normal; **depth sort** uses `depth` above.
- `step` = world spacing per cell (derived from current `tileW`).
- `buildScene(data, { camera, maxBar, originYOffset, light })` returns the same
  `TerrainScene` shape (bars/faces/top/lattice/labels/groundCorners/compass) plus, per bar,
  its grid coords `{ col, row }` so a click can set the pivot. Compass gizmo gains a tilt
  read-out.

Legacy `projectIso/isoDepth/buildScene({theta})` are replaced; callers move to the camera.
`buildTerrainLayout` (the non-rotatable layout) may stay for any static consumer but the
panel uses `buildScene`.

**Tests (`folderTerrain.test.ts`):**
- pivot cell projects to `anchor` exactly, swept across yaw ∈ {0..2π} and pitch ∈ {8°..85°};
- pitch=90° drops all height contribution (screenY independent of Z);
- home camera reproduces the legacy relative bar ordering / left-down-folders,
  right-down-roles arrangement within tolerance;
- depth ordering is monotonic along the view direction;
- back-face culling drops exactly the away-facing sides at representative angles.

### Unit 2 — Navigation (`useCamera` hook + `SceneStage`, `FolderPermissionTerrain.tsx`)

Replace `useRotation` with `useCamera` returning `{ camera, handlers, setPivot, frame, reset, mode, setMode }`, rAF-coalesced.

| Input | Action |
|---|---|
| Wheel | Zoom `scale` toward cursor |
| Middle-mouse drag (`button===1`) | **Pan** — translate `anchor` by (dx,dy) |
| Shift + middle-mouse drag | **Orbit** — dx→yaw, dy→pitch (clamp 8°–85°); anchor fixed |
| Left-click a square (no drag) | **Select** → open details + set pivot to that cell |
| Buttons: Orbit / Pan / Frame / Reset | Discoverable fallback; left-drag follows the active button mode for trackpads / no-middle-button mice |

- `preventDefault` on middle-button `pointerdown` (suppress browser autoscroll); pointer
  capture; 4px drag threshold preserves click-vs-drag.
- **Set pivot on click without a jump:** the new pivot's *current* screen position becomes
  the new `anchor`, so orbit then spins around it in place. **Frame** eases the pivot to the
  viewport centre.
- Pivot marker drawn on the active cell; compass shows yaw + tilt.
- Drift removed: the SVG is a fixed viewport; pan/zoom/orbit move content within it (no
  per-frame bbox re-fit).

### Unit 3 — Details on click (`DetailPanel` + selection visuals)

- Selected bar gets a highlight ring + pivot marker (unmistakable).
- Docked card with tier-coloured header: folder name, role, **exact `permType`** (raw, not
  just the 5-bucket label), tier swatch, user count, full member list (name · email).
- **Overview:** keeps the cross-project tier-distribution bar.
- **Compare:** adds a "this cell across your selected projects" mini-row (per-project tier
  chips) so divergence is visible at a glance.

### Unit 4 — Compare multi-select slab stack (`FolderPermissionTerrain.tsx`)

- Replace the three fixed `<ProjectSelect>` slots with a grouped, searchable
  **multi-select**: office optgroups, per-office "select all", running count; default ~6
  top-staffed projects so it opens calm.
- Selected projects → slabs on shared axes (`buildSharedAxes`/`projectOntoAxes`), one camera
  for the whole tower (orbit/pan/zoom together).
- **Virtualization:** only slabs whose pivot-projected vertical band intersects the viewport
  (+ generous margin) are built/drawn — large selections stay smooth. Windowing is
  approximate under tilt; the margin absorbs it.
- Per-slab lazy load via existing `loadTerrain(projectId)` + cache; per-slab skeleton while
  pending; batched fetches.

**Tests (`FolderPermissionTerrain.test.tsx`):** click selects + repivots; middle-drag pans
and shift+middle orbits (pivot screen-stable); multi-select adds/removes slabs;
virtualization renders only in-view slabs; details card shows enriched fields.

## Build order

A. Camera core (pure + tests) → B. Navigation → C. Details → D. Compare multi-select →
E. Professional polish (chrome/typography/legend/empty+loading/theme/perf) + live rebuild.

Each phase ships green (`tsc` 0, unit suite green) before the next.

## Non-goals / deferred

- Touch gestures beyond a single-finger orbit (desktop dashboard; note as deferred).
- Consensus-aggregate "compare" (the rejected option); Overview already covers account-wide.
- New data/ingestion: all four units run on the existing terrain/overview server views.

## Data caveats (unchanged, carried from current panel)

- Folder permissions are live-sync only (≈6M rows, ~950 projects); `permType` is the tier.
- Users per role = union of `AccDcProjectUserRole` + `AccProjectRole` (memberId sparse).
- Bar height = users-in-role (single/compare) or projects-configuring (overview).
