/**
 * folderTerrainCamera.ts — REF-01 SPLIT-01
 *
 * Orthographic camera (buildCameraScene) + floating-plane compare
 * (buildStackedScenes) + Camera helpers (easeCamera, projectCamera, depthCamera,
 * barSceneCam, STEP, HOME_YAW, HOME_PITCH, MIN_PITCH, MAX_PITCH).
 *
 * Extracted from folderTerrain.ts (was lines ~773-1096).
 * No I/O, no React, no DB — pure computation.
 */

import {
  type FolderTerrainData,
  type TerrainCell,
  type Pt,
  TERRAIN,
  colorForRank,
} from "./folderTerrainModel";

import {
  type SharedAxes,
  projectOntoAxes,
} from "./folderTerrainLayout";

import {
  type SceneFace,
  type SceneBar,
  type TerrainScene,
  type Light,
  DEFAULT_LIGHT,
  sideBrightness,
  CELL_CORNERS,
  SIDE_NORMAL,
  SHADOW_CORNERS,
  signedArea,
  ptsStr,
  tint,
} from "./folderTerrainScene";

// ===========================================================================
// Orthographic axonometric camera — the professional redesign.
//
// One camera (pivot + yaw + pitch + scale + screen anchor) replaces the
// per-frame bbox-autofit iso scene above. Every grid point is expressed
// RELATIVE TO THE PIVOT, so the pivot cell (X=Y=Z=0) always lands exactly on
// the anchor for any yaw/pitch/scale → the pivot never drifts while orbiting.
// Spin (yaw) + tilt (pitch) give a true 3D orbit; pitch=π/2 is top-down.
// ===========================================================================

export interface Camera {
  pivotCol: number; // grid col the view orbits around (col = role index)
  pivotRow: number; // grid row the view orbits around (row = folder index)
  yaw: number; // radians — ground spin
  pitch: number; // radians — elevation, ~0 = side-on … π/2 = top-down
  scale: number; // zoom multiplier
  anchorX: number; // screen px the pivot cell maps to
  anchorY: number;
}

/** World px between adjacent grid cells on the ground (before scale). */
export const STEP = 22;
/** Home view: 45° yaw + ~30° pitch ≈ the 2:1 iso the panel shipped with. */
export const HOME_YAW = Math.PI / 4;
export const HOME_PITCH = 0.5236; // ~30°
export const MIN_PITCH = 0.14; // ~8°  (near side-on)
export const MAX_PITCH = 1.48; // ~85° (near top-down)

/** Cubic-eased interpolation between two cameras (t in 0..1) — for tweened moves. */
export function easeCamera(a: Camera, b: Camera, t: number): Camera {
  const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
  const lerp = (x: number, y: number) => x + (y - x) * e;
  return {
    pivotCol: lerp(a.pivotCol, b.pivotCol), pivotRow: lerp(a.pivotRow, b.pivotRow),
    yaw: lerp(a.yaw, b.yaw), pitch: lerp(a.pitch, b.pitch), scale: lerp(a.scale, b.scale),
    anchorX: lerp(a.anchorX, b.anchorX), anchorY: lerp(a.anchorY, b.anchorY),
  };
}

/** Project grid (col,row) at height z (px) to screen, relative to the pivot. */
export function projectCamera(col: number, row: number, z: number, c: Camera): Pt {
  const X = col - c.pivotCol;
  const Y = row - c.pivotRow;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  const gx = X * sy - Y * cy; // screen-x ground basis (role→right, folder→left at home)
  const gd = X * cy + Y * sy; // depth / down basis
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

/** A camera-projected bar: visible (culled + lit) faces, top polygon, depth, grid coords. */
export function barSceneCam(
  col: number, row: number, h: number, c: Camera, color: string, L: Light,
): { faces: SceneFace[]; top: Pt[]; depth: number; col: number; row: number; cx: number; cy: number } {
  const base = CELL_CORNERS.map(([dc, dr]) => projectCamera(col + dc, row + dr, 0, c));
  const top = CELL_CORNERS.map(([dc, dr]) => projectCamera(col + dc, row + dr, h, c));
  const depth = depthCamera(col, row, h, c);
  const centre = projectCamera(col, row, 0, c);
  const faces: SceneFace[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad = [base[i], base[j], top[j], top[i]];
    if (signedArea(quad) <= 0) continue; // back-facing → cull (screen y-down: front is CW)
    const [nx, ny] = SIDE_NORMAL[i];
    // Screen direction of this side's outward normal (project the normal tip).
    const tip = projectCamera(col + nx * 0.5, row + ny * 0.5, 0, c);
    let sx = tip.x - centre.x, sy = tip.y - centre.y;
    const d = Math.hypot(sx, sy) || 1; sx /= d; sy /= d;
    faces.push({ points: ptsStr(quad), fill: tint(color, sideBrightness(sx, sy, L)), depth, kind: "side" });
  }
  faces.push({ points: ptsStr(top), fill: tint(color, L.topBright), depth: depth + 0.001, kind: "top" });
  const cx = (top[0].x + top[2].x) / 2, cy = (top[0].y + top[2].y) / 2;
  return { faces, top, depth, col, row, cx, cy };
}

export interface CameraSceneOpts {
  camera: Camera;
  viewport: { w: number; h: number };
  maxBar?: number;
  light?: Light;
  /** Shift every cell down by this many grid rows — stacks compare slabs in one
   *  camera world so the whole tower orbits/pans as a unit. */
  rowOffset?: number;
  /** 0..1 height multiplier for grow-in animation (default 1). */
  growth?: number;
  /** Compact stacked-plane labelling (compare): keep folder labels on their rows
   *  and collision-prune, instead of the roomy evenly-spaced leader list. */
  compactLabels?: boolean;
}

/**
 * Build a camera scene at a fixed viewport. Unlike buildScene, this does NOT
 * auto-fit — the SVG viewport is fixed and the camera (anchor/scale/yaw/pitch)
 * moves content within it. Bars carry their grid coords so a click re-pivots.
 */
export function buildCameraScene(data: FolderTerrainData | null, opts: CameraSceneOpts): TerrainScene {
  const { minBar, maxRoleLabels } = TERRAIN;
  const maxBar = opts.maxBar ?? TERRAIN.maxBar;
  const L = opts.light ?? DEFAULT_LIGHT;
  const W = opts.viewport.w, H = opts.viewport.h;
  const c = opts.camera;
  const rOff = opts.rowOffset ?? 0;
  const empty: TerrainScene = {
    width: W, height: H, bars: [], shadows: [], lattice: [], folderLabels: [], roleLabels: [],
    extraRoles: 0, compass: { folder: { x: 0, y: 0 }, role: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, pitch: c.pitch },
    groundCorners: { back: { x: 0, y: 0 }, right: { x: 0, y: 0 }, front: { x: 0, y: 0 }, left: { x: 0, y: 0 } },
  };
  if (!data) return empty;

  const folders = data.folders;
  const roles = data.roles;
  const Cf = folders.length;
  const R = roles.length;
  const folderIdx = new Map(folders.map((f, i) => [f.id, i]));
  const roleIdx = new Map(roles.map((r, i) => [r.id, i]));

  const heightByUsers = data.maxUserCount > 0;
  const maxMetric = heightByUsers ? data.maxUserCount : 5;
  // Perceptual height curve: a sqrt ramp lifts low-count cells off the floor so a
  // sparse field still reads as a lit terrain (skyline) rather than a flat plane,
  // while the tallest bars stay distinct.
  const cellHeight = (cell: TerrainCell) => {
    const t = maxMetric > 0 ? Math.min(1, (heightByUsers ? cell.userCount : cell.rank) / maxMetric) : 0;
    return minBar + Math.sqrt(t) * (maxBar - minBar);
  };

  // Bars + contact shadows.
  const bars: SceneBar[] = [];
  const shadows: { points: string }[] = [];
  const growth = opts.growth ?? 1;
  for (const cell of data.cells) {
    const ci = roleIdx.get(cell.roleId) ?? 0;
    const ri = (folderIdx.get(cell.folderId) ?? 0) + rOff;
    const h = cellHeight(cell) * growth;
    const b = barSceneCam(ci, ri, h, c, colorForRank(cell.rank), L);
    bars.push({ cell, faces: b.faces, top: b.top, cx: b.cx, cy: b.cy, depth: b.depth, col: ci, row: ri, inherited: cell.inherited });
    // Every bar casts a tight contact shadow so it visibly sits ON the ground
    // plane — a key depth cue for reading what's in front of what.
    const ground = SHADOW_CORNERS.map(([dc, dr]) => { const p = projectCamera(ci + dc, ri + dr, 0, c); return { x: p.x, y: p.y + 2 }; });
    shadows.push({ points: ptsStr(ground) });
  }
  bars.sort((a, b2) => a.depth - b2.depth);

  // Ground lattice (rotated by the camera).
  const lattice: TerrainScene["lattice"] = [];
  for (let col = 0; col <= R; col++) { const a = projectCamera(col - 0.5, -0.5 + rOff, 0, c); const b = projectCamera(col - 0.5, Cf - 0.5 + rOff, 0, c); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  for (let row = 0; row <= Cf; row++) { const a = projectCamera(-0.5, row - 0.5 + rOff, 0, c); const b = projectCamera(R - 0.5, row - 0.5 + rOff, 0, c); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }

  // Folder labels. Rows project very close together at the home angle (adjacent
  // rows land only a few px apart on screen), so a naive per-row list overlaps.
  // Roomy single/overview planes (compactLabels falsy — small folder counts, see
  // the MANY_FOLDERS threshold in FolderPermissionTerrain.tsx) get an
  // evenly-spaced left list across the actual row span so EVERY folder keeps a
  // label, with a thin leader back to its true row. Deep/compact planes (compare,
  // or a project past the MANY_FOLDERS threshold) instead keep labels on their
  // TRUE row and greedily prune by PRIORITY — explicitly-changed folders first,
  // then shallower ones — dropping the rest by 2-D screen distance. Zooming
  // spreads the rows apart and reveals more (a free level-of-detail); the hovered
  // bar always names its folder via the tooltip, so pruned rows stay identifiable.
  const truncF = (s: string) => (s.length > 30 ? s.slice(0, 29) + "…" : s);
  let folderLabels: TerrainScene["folderLabels"];
  let hiddenFolders: number;
  if (opts.compactLabels) {
    // Labels are right-anchored and all extend LEFT, so two at a similar height
    // overlap regardless of their anchor x — collision must be a VERTICAL gap, sized
    // to clear the font + halo. Keep the highest-priority label per slot.
    const FGAP = 20; // min vertical px between two kept folder labels
    const FMAXLABELS = 70; // cap drawn labels (perf when zoomed right in)
    type FLab = TerrainScene["folderLabels"][number] & { priority: number };
    const fCandidates: FLab[] = folders.map((f, i) => {
      const a = projectCamera(-0.5, i + rOff, 0, c);
      const depth = f.depth ?? 0;
      const inherited = !!f.inherited;
      // Smaller priority value = filled first. Changed beats inherited; shallower
      // beats deeper; ties keep top-down row order.
      const priority = (inherited ? 100000 : 0) + depth * 1000 + i;
      return { id: f.id, name: truncF(f.name), textX: a.x - 9, textY: a.y, ax: a.x, ay: a.y, depth, inherited, priority };
    });
    const fKept: FLab[] = [];
    for (const lab of [...fCandidates].sort((a, b) => a.priority - b.priority)) {
      if (fKept.length >= FMAXLABELS) break;
      if (fKept.every((k) => Math.abs(k.textY - lab.textY) >= FGAP)) fKept.push(lab);
    }
    fKept.sort((a, b) => a.textY - b.textY);
    folderLabels = fKept.map(({ priority: _p, ...rest }) => rest);
    hiddenFolders = Cf - folderLabels.length;
  } else {
    // Roomy: evenly spread every folder across the actual row span (a leader
    // line still points back to its true ground row) so small/typical folder
    // counts always keep every label — the caller only reaches this branch
    // below the MANY_FOLDERS threshold, so the span comfortably fits them.
    const FGAP = 16;
    const topA = projectCamera(-0.5, -0.5 + rOff, 0, c);
    const botA = projectCamera(-0.5, Cf - 0.5 + rOff, 0, c);
    const leftX = Math.min(topA.x, botA.x) - 9;
    const span = Math.max(botA.y - topA.y, (Cf - 1) * FGAP);
    const start = (topA.y + botA.y) / 2 - span / 2;
    folderLabels = folders.map((f, i) => {
      const a = projectCamera(-0.5, i + rOff, 0, c);
      const textY = Cf > 1 ? start + (i / (Cf - 1)) * span : a.y;
      return { id: f.id, name: truncF(f.name), textX: leftX, textY, ax: a.x, ay: a.y, depth: f.depth ?? 0, inherited: !!f.inherited };
    });
    hiddenFolders = 0;
  }

  // Role labels run along the back of the role axis, angled to it. Drop any that
  // crowd the previous kept label (by on-screen distance) so they never overlap.
  const labelCount = Math.min(maxRoleLabels, R);
  const aDir = projectCamera(0, TERRAIN.roleLabelRow + rOff, 0, c);
  const bDir = projectCamera(1, TERRAIN.roleLabelRow + rOff, 0, c);
  const axisDir = Math.atan2(bDir.y - aDir.y, bDir.x - aDir.x) * 180 / Math.PI;
  const RGAP = 84; // min on-screen px between two kept role labels (must exceed text width)
  const roleLabels = roles.slice(0, labelCount)
    .map((r, i) => { const p = projectCamera(i, TERRAIN.roleLabelRow + rOff, 0, c); return { id: r.id, name: r.name.length > 13 ? r.name.slice(0, 12) + "…" : r.name, x: p.x, y: p.y, angle: axisDir }; })
    .reduce<TerrainScene["roleLabels"]>((kept, lab) => {
      // Greedy by staffing priority (roles arrive most-staffed first); keep a label
      // only if it clears EVERY already-kept one (not just the previous), so the
      // wide angled text never piles up. Zooming spreads the axis → more appear.
      if (kept.every((k) => Math.hypot(lab.x - k.x, lab.y - k.y) >= RGAP)) kept.push(lab);
      return kept;
    }, []);

  // Compass: pure ground-axis directions (anchor/pivot removed) + the tilt read-out.
  const dirCam: Camera = { ...c, pivotCol: 0, pivotRow: 0, anchorX: 0, anchorY: 0, scale: 1 };
  const gO = projectCamera(0, 0, 0, dirCam);
  const norm = (p: Pt) => { const d = Math.hypot(p.x - gO.x, p.y - gO.y) || 1; return { x: (p.x - gO.x) / d, y: (p.y - gO.y) / d }; };
  const compass = { folder: norm(projectCamera(0, 1, 0, dirCam)), role: norm(projectCamera(1, 0, 0, dirCam)), origin: { x: 0, y: 0 }, pitch: c.pitch };

  const groundCorners = {
    back: projectCamera(-0.5, -0.5 + rOff, 0, c), right: projectCamera(R - 0.5, -0.5 + rOff, 0, c),
    front: projectCamera(R - 0.5, Cf - 0.5 + rOff, 0, c), left: projectCamera(-0.5, Cf - 0.5 + rOff, 0, c),
  };

  return { width: W, height: H, bars, shadows, lattice, folderLabels, roleLabels, extraRoles: R - roleLabels.length, compass, groundCorners, hiddenFolders };
}

// ===========================================================================
// Compare — separated floating planes. Compose one camera scene per project,
// each on the SAME camera (yaw/pitch/scale/pivot) but anchored at a different
// SCREEN Y, so the planes are parallel, fully separated isometric islands (the
// BOT-OR-NOT exploded stack) rather than a cascading single-grid tower.
// ===========================================================================

interface StackedPlane {
  scene: TerrainScene;
  source: FolderTerrainData;
  label: string;
  /** Screen anchor for this plane's project header (its back-left, lifted). */
  headerX: number;
  headerY: number;
  index: number;
}

export interface StackedScenes {
  planes: StackedPlane[];
  connectors: { x1: number; y1: number; x2: number; y2: number }[];
  /** Vertical screen distance between consecutive plane anchors. */
  planePitch: number;
}

export interface StackedScenesOpts {
  /** Tallest bar per plane (shorter than single mode so stacked planes stay calm). */
  maxBar?: number;
  /** Airy gap (screen px, pre-scale) between a plane's footprint and the next. */
  gap?: number;
  /** Virtualization slack (screen px) around the viewport. */
  margin?: number;
  /** 0..1 bar grow-in multiplier forwarded to each plane (default 1). */
  growth?: number;
}

/**
 * Compose one camera scene per project at a fixed screen-pixel vertical pitch.
 * Connectors join matching ground corners of consecutive planes. Off-viewport
 * planes are virtualized out; connectors are computed for all pairs (cheap) so
 * the stack reads continuously while panning.
 */
export function buildStackedScenes(
  datas: ReadonlyArray<FolderTerrainData>,
  axes: SharedAxes,
  camera: Camera,
  viewport: { w: number; h: number },
  opts: StackedScenesOpts = {},
): StackedScenes {
  const maxBar = opts.maxBar ?? 44;
  const gap = opts.gap ?? 60;
  const margin = opts.margin ?? 240;
  const Cf = axes.folders.length;
  const R = axes.roles.length;

  // Footprint vertical screen span of the shared-axes grid (anchor-independent,
  // so we can compute it once on the real camera; affine translation cancels).
  const backY = projectCamera(-0.5, -0.5, 0, camera).y;
  const frontY = projectCamera(R - 0.5, Cf - 0.5, 0, camera).y;
  const footprintSpanY = Math.abs(frontY - backY);
  const planePitch = footprintSpanY + (maxBar + gap) * camera.scale;

  // Corner sets for ALL planes (cheap) → connectors decoupled from virtualization.
  const corner = (i: number) => {
    const cam: Camera = { ...camera, anchorY: camera.anchorY + i * planePitch };
    return {
      back: projectCamera(-0.5, -0.5, 0, cam),
      right: projectCamera(R - 0.5, -0.5, 0, cam),
      front: projectCamera(R - 0.5, Cf - 0.5, 0, cam),
      left: projectCamera(-0.5, Cf - 0.5, 0, cam),
    };
  };

  const connectors: StackedScenes["connectors"] = [];
  for (let i = 0; i < datas.length - 1; i++) {
    const x = corner(i), y = corner(i + 1);
    for (const k of ["back", "right", "front", "left"] as const) {
      connectors.push({ x1: x[k].x, y1: x[k].y, x2: y[k].x, y2: y[k].y });
    }
  }

  const planes: StackedPlane[] = [];
  for (let i = 0; i < datas.length; i++) {
    const cam: Camera = { ...camera, anchorY: camera.anchorY + i * planePitch };
    const cs = corner(i);
    const top = Math.min(cs.back.y, cs.right.y, cs.left.y) - maxBar * camera.scale;
    const bot = Math.max(cs.front.y, cs.left.y, cs.right.y);
    if (bot < -margin || top > viewport.h + margin) continue; // virtualized out
    const projected = projectOntoAxes(datas[i], axes);
    const scene = buildCameraScene(projected, { camera: cam, viewport, maxBar, growth: opts.growth ?? 1, compactLabels: true });
    planes.push({
      scene,
      source: datas[i],
      label: datas[i].projectName,
      headerX: cs.left.x,
      headerY: cs.left.y - maxBar * camera.scale - 10,
      index: i,
    });
  }

  return { planes, connectors, planePitch };
}
