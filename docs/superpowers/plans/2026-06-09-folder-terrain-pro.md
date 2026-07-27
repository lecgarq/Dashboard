# Folder Permission Terrain — Professional Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/access-analysis` Folder Permission Terrain professional — fixed-pivot 3D orbit (spin+tilt), Revit-style middle-mouse pan / Shift+middle orbit, click-a-square to see rich details and re-pivot, and a multi-select slab stack that compares any number of projects.

**Architecture:** A single orthographic axonometric **camera** (pivot + yaw + pitch + scale + screen anchor) replaces the per-frame bbox-autofit iso projection in `folderTerrain.ts`. Because all geometry is expressed relative to the pivot, the pivot cell always lands on the fixed screen anchor → zero drift on orbit. The React panel swaps `useRotation` for a `useCamera` hook (wheel zoom, middle-drag pan, shift+middle orbit, click-select+repivot), enriches the detail card, and turns Compare into a virtualized multi-select slab stack.

**Tech Stack:** Next.js (App Router) client component, SVG render, pure TS geometry with Vitest unit tests, next-themes, Tailwind.

---

## File Structure

- **Modify** `app/(dashboard)/access-analysis/folderTerrain.ts` — add `Camera`, `projectCamera`, `depthCamera`, camera-based `barScene`/`buildScene`; retire `ViewParams`/`projectIso`/`isoDepth` and the `theta`-based scene. Keep tier/colour/ordering/shared-axes helpers untouched.
- **Modify** `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` — replace `useRotation` with `useCamera`; new pointer/wheel handlers; pivot marker; mode buttons; enriched `DetailPanel`; multi-select Compare; slab virtualization.
- **Modify** `app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts` — camera unit tests.
- **Modify** `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` — interaction/detail/compare tests.

Constants (in `folderTerrain.ts`):
```ts
export const STEP = 22;                 // world px per grid cell (ground)
export const HOME_YAW = Math.PI / 4;    // 45° — folders fall down-left, roles down-right
export const HOME_PITCH = 0.5236;       // 30° → today's 2:1 iso look
export const MIN_PITCH = 0.14;          // ~8°  (near side-on)
export const MAX_PITCH = 1.48;          // ~85° (near top-down)
```

---

## Phase A — Camera core (pure geometry + tests)

### Task A1: Camera type + `projectCamera` / `depthCamera`

**Files:**
- Modify: `app/(dashboard)/access-analysis/folderTerrain.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { projectCamera, depthCamera, HOME_YAW, HOME_PITCH, STEP, type Camera } from "../folderTerrain";

const cam = (over: Partial<Camera> = {}): Camera => ({
  pivotCol: 2, pivotRow: 3, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 400, anchorY: 200, ...over,
});

describe("camera projection", () => {
  it("pins the pivot cell to the anchor at every yaw and pitch", () => {
    for (const yaw of [0, 0.5, 1, 2, 3, 5, 6]) {
      for (const pitch of [0.14, 0.3, 0.5236, 1, 1.48]) {
        const p = projectCamera(2, 3, 0, cam({ yaw, pitch }));
        expect(p.x).toBeCloseTo(400, 6);
        expect(p.y).toBeCloseTo(200, 6);
      }
    }
  });

  it("flattens height at top-down pitch (≈90°)", () => {
    const c = cam({ pitch: Math.PI / 2 });
    const ground = projectCamera(5, 1, 0, c);
    const raised = projectCamera(5, 1, 60, c);
    expect(raised.y).toBeCloseTo(ground.y, 6); // cos(90°)=0 → z contributes nothing
  });

  it("raises bars upward (smaller screen-y) at iso pitch", () => {
    const c = cam();
    const ground = projectCamera(4, 4, 0, c);
    const raised = projectCamera(4, 4, 50, c);
    expect(raised.y).toBeLessThan(ground.y);
  });

  it("home orientation: roles (col+) go right, folders (row+) go left", () => {
    const c = cam({ pivotCol: 0, pivotRow: 0 });
    expect(projectCamera(1, 0, 0, c).x).toBeGreaterThan(c.anchorX); // role+ → right
    expect(projectCamera(0, 1, 0, c).x).toBeLessThan(c.anchorX);    // folder+ → left
    expect(projectCamera(1, 0, 0, c).y).toBeGreaterThan(c.anchorY); // and downward
    expect(projectCamera(0, 1, 0, c).y).toBeGreaterThan(c.anchorY);
  });

  it("scale zooms distances from the anchor", () => {
    const a = projectCamera(5, 5, 0, cam({ scale: 1 }));
    const b = projectCamera(5, 5, 0, cam({ scale: 2 }));
    expect(b.x - 400).toBeCloseTo((a.x - 400) * 2, 6);
  });

  it("depth increases toward the viewer (down/front)", () => {
    const c = cam({ pivotCol: 0, pivotRow: 0 });
    expect(depthCamera(2, 2, 0, c)).toBeGreaterThan(depthCamera(-2, -2, 0, c));
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts` → fails (`projectCamera` not exported).

- [ ] **Step 3: Implement** in `folderTerrain.ts` (after the `Pt` interface / iso section):

```ts
export interface Camera {
  pivotCol: number; pivotRow: number;
  yaw: number;   // radians (ground spin)
  pitch: number; // radians elevation, 0=side-on … π/2=top-down
  scale: number; // zoom
  anchorX: number; anchorY: number; // screen px the pivot cell maps to
}

export const STEP = 22;
export const HOME_YAW = Math.PI / 4;
export const HOME_PITCH = 0.5236;
export const MIN_PITCH = 0.14;
export const MAX_PITCH = 1.48;

/** Project grid (col,row) at height z(px) to screen, relative to the pivot. */
export function projectCamera(col: number, row: number, z: number, c: Camera): Pt {
  const X = col - c.pivotCol;
  const Y = row - c.pivotRow;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  const gx = X * sy - Y * cy;          // screen-x ground basis (role→right, folder→left at home)
  const gd = X * cy + Y * sy;          // depth/down basis
  const sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
  return {
    x: c.anchorX + gx * STEP * c.scale,
    y: c.anchorY + (gd * sp * STEP - z * cp) * c.scale,
  };
}

/** Into-screen depth (larger = nearer the viewer) for painter ordering. */
export function depthCamera(col: number, row: number, z: number, c: Camera): number {
  const X = col - c.pivotCol;
  const Y = row - c.pivotRow;
  const gd = X * Math.cos(c.yaw) + Y * Math.sin(c.yaw);
  return gd * Math.cos(c.pitch) + z * Math.sin(c.pitch);
}
```

- [ ] **Step 4: Run to verify PASS** — same command → all green.
- [ ] **Step 5: Commit** — `git add app/(dashboard)/access-analysis/folderTerrain.ts app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts` then `git commit -m "feat(terrain): orthographic camera projection (fixed-pivot, yaw+pitch)"`.

### Task A2: Camera-based `barScene` (cull + light + grid coords)

**Files:** Modify `folderTerrain.ts`; Test `__tests__/folderTerrain.test.ts`.

- [ ] **Step 1: Write failing test**

```ts
import { barSceneCam, DEFAULT_LIGHT } from "../folderTerrain";
it("culls back faces and tags a top face + grid coords", () => {
  const c = cam();
  const r = barSceneCam(3, 2, 40, c, "#d6456b", DEFAULT_LIGHT);
  expect(r.faces.some((f) => f.kind === "top")).toBe(true);
  expect(r.faces.filter((f) => f.kind === "side").length).toBeLessThanOrEqual(2); // ≤2 visible sides
  expect(r.col).toBe(3); expect(r.row).toBe(2);
  expect(r.top.length).toBe(4);
});
```

- [ ] **Step 2: Run → FAIL** (`barSceneCam` undefined).

- [ ] **Step 3: Implement** `barSceneCam` mirroring the existing `barScene` but using `projectCamera`/`depthCamera`, reusing `CELL_CORNERS`, `SIDE_NORMAL`, `signedArea`, `ptsStr`, `tint`, `sideBrightness`. The side normal's screen direction is `projectCamera(col+nx*0.5,row+ny*0.5,0,c) − projectCamera(col,row,0,c)` normalised, dotted with the light. Return `{ faces, top, depth, col, row, cx, cy }` where `cx,cy` is the top-face centroid:

```ts
export function barSceneCam(
  col: number, row: number, h: number, c: Camera, color: string, L: Light,
): { faces: SceneFace[]; top: Pt[]; depth: number; col: number; row: number; cx: number; cy: number } {
  const base = CELL_CORNERS.map(([dc, dr]) => projectCamera(col + dc, row + dr, 0, c));
  const top  = CELL_CORNERS.map(([dc, dr]) => projectCamera(col + dc, row + dr, h, c));
  const depth = depthCamera(col, row, h, c);
  const centre = projectCamera(col, row, 0, c);
  const faces: SceneFace[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad = [base[i], base[j], top[j], top[i]];
    if (signedArea(quad) <= 0) continue; // back-facing → cull
    const [nx, ny] = SIDE_NORMAL[i];
    const tip = projectCamera(col + nx * 0.5, row + ny * 0.5, 0, c);
    let sx = tip.x - centre.x, sy = tip.y - centre.y;
    const d = Math.hypot(sx, sy) || 1; sx /= d; sy /= d;
    faces.push({ points: ptsStr(quad), fill: tint(color, sideBrightness(sx, sy, L)), depth, kind: "side" });
  }
  faces.push({ points: ptsStr(top), fill: tint(color, L.topBright), depth: depth + 0.001, kind: "top" });
  const cx = (top[0].x + top[2].x) / 2, cy = (top[0].y + top[2].y) / 2;
  return { faces, top, depth, col, row, cx, cy };
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): camera-based bar scene with cull+lighting+grid coords"`.

### Task A3: Camera `buildScene` (replaces theta scene) + `SceneBar.col/row`

**Files:** Modify `folderTerrain.ts`; Test `__tests__/folderTerrain.test.ts`.

- [ ] **Step 1: Write failing test**

```ts
import { buildScene, type Camera as Cam } from "../folderTerrain";
const data = {
  projectId: "p1", projectName: "P1", office: "MTY",
  folders: [{ id: "f1", name: "Design" }, { id: "f2", name: "Models" }],
  roles: [{ id: "r1", name: "PM" }, { id: "r2", name: "Architect" }],
  cells: [{ folderId: "f1", folderName: "Design", roleId: "r1", roleName: "PM", tier: "Full Controller", rank: 5, userCount: 3 }],
  usersByRole: { r1: [{ name: "A", email: "a@x" }] }, maxUserCount: 3, generatedAt: "t",
};
it("buildScene centres pivot on anchor and tags bars with grid coords", () => {
  const camera: Cam = { pivotCol: 0.5, pivotRow: 0.5, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 300, anchorY: 180 };
  const scene = buildScene(data, { camera });
  expect(scene.bars).toHaveLength(1);
  expect(scene.bars[0]).toHaveProperty("col");
  expect(scene.bars[0]).toHaveProperty("row");
  expect(scene.width).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run → FAIL** (new `buildScene` signature / `SceneOpts` shape).

- [ ] **Step 3: Implement** — change `SceneOpts` to `{ camera: Camera; maxBar?: number; light?: Light }`; rebuild `buildScene` to: compute `cx=(R-1)/2`, `cy=(Cf-1)/2` (default pivot if camera pivot is the sentinel `NaN`), iterate cells through `barSceneCam`, sort by depth asc, build rotated lattice/shadows/folderLabels/roleLabels/compass via `projectCamera`, and add `col,row` to each `SceneBar`. `width/height` come from the SVG viewport (passed in) — buildScene no longer auto-fits; instead it returns geometry in absolute screen coords using the camera's anchor. Width/height are supplied by the caller's viewport, so set `scene.width/height` from `opts.viewport` (add `viewport:{w,h}` to `SceneOpts`). Folder-label gutter list keeps its fixed left-column layout, leader line drawn to the projected row anchor.

  Update `SceneBar` interface to include `col: number; row: number;`. Update `TerrainScene` compass to also carry `pitch` for the gizmo tilt read-out.

- [ ] **Step 4: Run → PASS** + run the whole terrain test file green.
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): camera buildScene, fixed viewport, per-bar grid coords"`.

---

## Phase B — Navigation (`useCamera` + SceneStage)

### Task B1: `useCamera` hook

**Files:** Modify `components/FolderPermissionTerrain.tsx`.

- [ ] **Step 1** Write a component test (`FolderPermissionTerrain.test.tsx`) asserting: wheel changes scale; middle-drag changes anchor (pan); shift+middle-drag changes yaw & pitch but NOT anchor; pitch stays within [MIN_PITCH, MAX_PITCH].
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement `useCamera(viewport)` returning `{ camera, setCamera, handlers, setPivotCell, frame, reset, dragMode, setDragMode }`. State: `pivotCol/Row`, `yaw`, `pitch`, `scale`, `anchorX/Y`, rAF-coalesced like the old hook. Pointer logic:
  - `onPointerDown`: record button + shiftKey; `preventDefault` for `button===1`; pointer capture; reset `dragged`.
  - `onPointerMove`: if dragging — `button===1 && !shift` (or `dragMode==='pan'`) → `anchorX+=dx; anchorY+=dy`. `button===1 && shift` (or `dragMode==='orbit'`) → `yaw+=dx*0.009; pitch=clamp(pitch - dy*0.006, MIN_PITCH, MAX_PITCH)`.
  - `onWheel`: `scale=clamp(scale*(1-Δ*0.0012),0.35,3)`, zoom toward cursor by adjusting anchor so the cursor-world point stays put.
  - `setPivotCell(col,row, currentScreenPt)`: set pivot to (col,row) and set anchor = currentScreenPt so nothing jumps.
  - `frame()`: ease anchor → viewport centre; `reset()`: home yaw/pitch/scale, pivot to grid centre, anchor to viewport centre.
- [ ] **Step 4** Run → PASS.
- [ ] **Step 5** Commit `feat(terrain): useCamera — wheel zoom, middle-pan, shift+middle orbit`.

### Task B2: SceneStage wiring + pivot marker + mode buttons + compass tilt

**Files:** Modify `components/FolderPermissionTerrain.tsx`.

- [ ] **Step 1** Test: clicking a bar (no drag) calls `setPivotCell` with that bar's `col,row` and opens details; pivot marker renders at the pivot cell.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement: fixed-size SVG viewport (no `overflow-x-auto` scroll); render `view.scenes` via camera; per-bar `onClick` guarded by `draggedRef` calls `setPivotCell(b.col,b.row,{x:b.cx,y:b.cy})` + `setPicked`. Draw a pivot marker (small ⌖) at `projectCamera(pivotCol,pivotRow,0,camera)`. Replace the rotate-only control cluster with **Orbit / Pan / Frame / Reset** buttons (active `dragMode` highlighted) so trackpad users without a middle button can left-drag in the chosen mode. Update `Compass` to also show the tilt angle. Update the hint text to "Scroll-drag to pan · Shift+scroll-drag to orbit · Click a square to focus".
- [ ] **Step 4** Run → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5** Commit `feat(terrain): fixed-viewport stage, click-to-pivot, nav buttons, tilt compass`.

---

## Phase C — Richer click details

### Task C1: Enriched, selection-linked DetailPanel

**Files:** Modify `components/FolderPermissionTerrain.tsx`.

- [ ] **Step 1** Test: after selecting a cell, the detail card shows the exact `permType`, the role, the folder, the user count, and renders each member name; selected bar shows a highlight ring.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement: pass the raw `cell.tier` (exact permType) through; add a tier-coloured header bar; show user count + member list with emails (title attr); keep the Overview tier-breakdown. Add a highlight ring (stroke) to the picked bar's top face. Carry `permType` already exists on `TerrainCell.tier` — surface it verbatim rather than only the bucket label.
- [ ] **Step 4** Run → PASS.
- [ ] **Step 5** Commit `feat(terrain): richer click details + selection ring`.

---

## Phase D — Compare = multi-select slab stack (virtualized)

### Task D1: Multi-select control

**Files:** Modify `components/FolderPermissionTerrain.tsx`.

- [ ] **Step 1** Test: the Compare control lists projects grouped by office, supports search, toggles selection, shows a running count, and defaults to the top-staffed handful.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement a `ProjectMultiSelect` (searchable popover; office optgroups with "select all in office"; chips for chosen; count). Replace `slots:[string,string,string]` with `selected: string[]` (default top-6 staffed). Reuse the existing per-id `loadTerrain` + `cache`; batch-load missing ids; per-slab skeleton while pending.
- [ ] **Step 4** Run → PASS.
- [ ] **Step 5** Commit `feat(terrain): multi-select Compare (any N projects)`.

### Task D2: Virtualized slab stack under one camera

**Files:** Modify `components/FolderPermissionTerrain.tsx`, `folderTerrain.ts` (shared-axes already exist).

- [ ] **Step 1** Test: with N selected projects, only slabs whose projected vertical band intersects the viewport (+margin) are built; panning reveals later slabs; the stack orbits/pans/zooms as one camera.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement: lay slabs along an originY offset per index (as today) but project each through the shared camera; compute each slab's projected mid-Y and skip building slabs outside `[−margin, viewport.h+margin]`. Connectors between consecutive visible slabs. Project label per slab.
- [ ] **Step 4** Run → PASS; `tsc` clean.
- [ ] **Step 5** Commit `feat(terrain): virtualized compare slab stack`.

---

## Phase E — Professional polish + live rebuild

### Task E1: Chrome, states, theme, perf, rebuild

**Files:** Modify `components/FolderPermissionTerrain.tsx`.

- [ ] **Step 1** Refine: typography/spacing of header + legend; clear empty/loading states per mode; theme-correct (zinc, not slate) colours via existing tokens; ensure 60fps on a large stack (memoise scenes per camera key; rAF coalescing already in `useCamera`).
- [ ] **Step 2** Run full unit suite + `tsc --noEmit` → green.
- [ ] **Step 3** Live rebuild per the project's safe recipe: `NEXT_DIST_DIR=.next-new npm run build` (Bash bg) → swap → `npm start`; never `npm run build` against the running :3000.
- [ ] **Step 4** Manual: drag-pan, shift-drag orbit (verify pivot is nailed), wheel zoom, click-to-pivot+details, multi-select compare. Screenshot.
- [ ] **Step 5** Commit `feat(terrain): professional polish pass`.

---

## Self-Review

- **Spec coverage:** fixed-pivot orbit → A1 (pivot invariance test) + B1; spin+tilt → A1/B1 (yaw+pitch); pan=middle, orbit=shift+middle → B1; click details → C1; click re-pivot → B2; pivot starts centre → A3/B1 reset; compare all → D1/D2; polish → E1. No gaps.
- **Placeholder scan:** none — every code step carries real code; UI phases name exact handlers/props.
- **Type consistency:** `Camera`, `projectCamera`, `depthCamera`, `barSceneCam`, `buildScene({camera,viewport})`, `SceneBar.col/row`, `setPivotCell`, `dragMode` used consistently across tasks.

## Execution

Inline execution in this session (per the owner's WIP-in-working-tree constraint — worktrees from HEAD are hollow here; subagents have overreached scope before). TDD per task, commit by explicit path only, verify `git diff --cached --name-only` before each commit.
