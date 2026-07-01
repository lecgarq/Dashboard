/**
 * folderTerrainScene.ts — REF-01 SPLIT-01
 *
 * Rotatable axonometric scene (buildScene) + shared scene primitives
 * (culling / lighting / SceneFace / SceneBar / TerrainScene).
 *
 * Extracted from folderTerrain.ts (was lines ~532-771).
 * No I/O, no React, no DB — pure computation.
 */

import {
  type FolderTerrainData,
  type TerrainCell,
  type Pt,
  TERRAIN,
  colorForRank,
  barHeight,
} from "./folderTerrainModel";

// ===========================================================================
// Rotatable axonometric scene — a yaw-orbitable view with per-bar back-face
// culling + directional lighting. The home view (theta=0) matches the fixed
// isometric above; dragging changes theta to orbit the terrain.
// ===========================================================================

export interface ViewParams {
  theta: number; // yaw radians (0 = home)
  tileW: number;
  tileH: number; // ground squash (2:1 iso ≈ tileW/2)
  originX: number;
  originY: number;
  cx: number; // grid centre col (rotation pivot)
  cy: number; // grid centre row
}

/** Project a grid point (col,row) at height z (px) to screen, yaw-rotated. */
export function projectIso(col: number, row: number, z: number, V: ViewParams): Pt {
  const u = col - V.cx;
  const v = row - V.cy;
  const ct = Math.cos(V.theta);
  const st = Math.sin(V.theta);
  const a = u * ct - v * st;
  const b = u * st + v * ct;
  return { x: V.originX + (a - b) * (V.tileW / 2), y: V.originY + (a + b) * (V.tileH / 2) - z };
}

/** Into-screen depth of a cell (larger = nearer the viewer). */
function isoDepth(col: number, row: number, V: ViewParams): number {
  const u = col - V.cx;
  const v = row - V.cy;
  const ct = Math.cos(V.theta);
  const st = Math.sin(V.theta);
  return u * ct - v * st + (u * st + v * ct);
}

// Unit-cell corners (CCW) and the outward world normal of side i (corner i→i+1).
// Exported so folderTerrainCamera can use them without re-importing via folderTerrain.
export const CELL_CORNERS: ReadonlyArray<[number, number]> = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
export const SIDE_NORMAL: ReadonlyArray<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const SHADOW_CORNERS: ReadonlyArray<[number, number]> = [[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]];

export function signedArea(pts: ReadonlyArray<Pt>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return s / 2;
}

export const ptsStr = (pts: ReadonlyArray<Pt>) => pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
const round = (n: number) => Math.round(n * 100) / 100;

/** Multiply a #rrggbb by brightness (0..1+), clamped — darkens/lightens for lighting. */
export function tint(hex: string, b: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * b)));
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

export interface Light {
  /** Light vector dotted with each rotated outward normal (headlight-ish: front
   *  faces lit). Tuned so the two visible sides read distinctly, both below the top. */
  dx: number;
  dy: number;
  ambient: number;
  diffuse: number;
  topBright: number;
  /** Max brightness a lit side reaches (kept < top so the cap reads as the lid). */
  sideMax: number;
}

export const DEFAULT_LIGHT: Light = { dx: 0.32, dy: 0.95, ambient: 0.28, diffuse: 0.74, topBright: 1.12, sideMax: 0.9 };

/** Brightness of a side whose rotated outward normal is (nx,ny). */
export function sideBrightness(nx: number, ny: number, L: Light): number {
  const dot = Math.max(0, nx * L.dx + ny * L.dy);
  return Math.min(L.sideMax, L.ambient + L.diffuse * dot);
}

export interface SceneFace {
  points: string;
  fill: string;
  depth: number;
  kind: "top" | "side";
}

/** A bar's visible faces (culled + lit), its top polygon (for hit-testing) and depth. */
export function barScene(
  col: number, row: number, h: number, V: ViewParams, color: string, L: Light,
): { faces: SceneFace[]; top: Pt[]; depth: number } {
  const base = CELL_CORNERS.map(([dc, dr]) => projectIso(col + dc, row + dr, 0, V));
  const top = CELL_CORNERS.map(([dc, dr]) => projectIso(col + dc, row + dr, h, V));
  const ct = Math.cos(V.theta);
  const st = Math.sin(V.theta);
  const depth = isoDepth(col, row, V);
  const faces: SceneFace[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad = [base[i], base[j], top[j], top[i]];
    if (signedArea(quad) <= 0) continue; // back-facing → cull (screen y-down: front is CW, area>0)
    const [nx, ny] = SIDE_NORMAL[i];
    const rnx = nx * ct - ny * st;
    const rny = nx * st + ny * ct;
    faces.push({ points: ptsStr(quad), fill: tint(color, sideBrightness(rnx, rny, L)), depth, kind: "side" });
  }
  faces.push({ points: ptsStr(top), fill: tint(color, L.topBright), depth: depth + 0.001, kind: "top" });
  return { faces, top, depth };
}

export interface SceneBar {
  cell: TerrainCell;
  faces: SceneFace[];
  /** Top-face screen polygon for hover/click hit-testing. */
  top: Pt[];
  cx: number; // top-face centroid (for highlight ring / tooltip anchor)
  cy: number;
  depth: number; // painter order key
  /** Mirrors cell.inherited — lets the renderer mute pure inheritors. */
  inherited?: boolean;
  /** Grid coords of this bar (col = role index, row = folder index). Set by the
   *  camera scene so a click can re-pivot to the picked cell. */
  col?: number;
  row?: number;
}

export interface TerrainScene {
  width: number;
  height: number;
  /** Painter-ordered bars (far → near). */
  bars: SceneBar[];
  /** Faint ground footprints under each bar (contact shading). */
  shadows: { points: string }[];
  lattice: { x1: number; y1: number; x2: number; y2: number }[];
  folderLabels: { id: string; name: string; textX: number; textY: number; ax: number; ay: number; depth?: number; inherited?: boolean }[];
  roleLabels: { id: string; name: string; x: number; y: number; angle: number }[];
  extraRoles: number;
  /** Folder rows whose labels were pruned to avoid overlap (zoom in to reveal). */
  hiddenFolders?: number;
  compass: { folder: { x: number; y: number }; role: { x: number; y: number }; origin: { x: number; y: number }; pitch?: number };
  groundCorners: { back: Pt; right: Pt; front: Pt; left: Pt };
}

export interface SceneOpts {
  theta: number;
  maxBar?: number;
  originYOffset?: number;
  light?: Light;
}

/** Build a fully rotatable scene for one terrain. Auto-fits at any angle. */
export function buildScene(data: FolderTerrainData | null, opts: SceneOpts): TerrainScene {
  const { tileW, tileH, minBar, margin, gutter, topPad, maxRoleLabels } = TERRAIN;
  const maxBar = opts.maxBar ?? TERRAIN.maxBar;
  const L = opts.light ?? DEFAULT_LIGHT;
  const empty: TerrainScene = {
    width: 600, height: 360, bars: [], shadows: [], lattice: [], folderLabels: [], roleLabels: [],
    extraRoles: 0, compass: { folder: { x: 0, y: 0 }, role: { x: 0, y: 0 }, origin: { x: 0, y: 0 } },
    groundCorners: { back: { x: 0, y: 0 }, right: { x: 0, y: 0 }, front: { x: 0, y: 0 }, left: { x: 0, y: 0 } },
  };
  if (!data) return empty;

  const folders = data.folders;
  const roles = data.roles;
  const Cf = folders.length;
  const R = roles.length;
  const folderIdx = new Map(folders.map((f, i) => [f.id, i]));
  const roleIdx = new Map(roles.map((r, i) => [r.id, i]));
  const cx = (R - 1) / 2; // col axis = roles
  const cy = (Cf - 1) / 2; // row axis = folders

  const heightByUsers = data.maxUserCount > 0;
  const maxMetric = heightByUsers ? data.maxUserCount : 5;
  const cellHeight = (c: TerrainCell) => barHeight(heightByUsers ? c.userCount : c.rank, maxMetric, minBar, maxBar);

  // First pass with origin 0 to measure the bbox at this angle, then re-centre.
  const probe: ViewParams = { theta: opts.theta, tileW, tileH, originX: 0, originY: 0, cx, cy };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (p: Pt) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; };
  // Extent corners (ground + tallest bar top) — enough to bound the scene.
  for (const cc of [-0.5, R - 0.5]) for (const rr of [-0.5, Cf - 0.5]) { grow(projectIso(cc, rr, 0, probe)); grow(projectIso(cc, rr, maxBar, probe)); }
  // Role labels sit behind the grid; include their row so they aren't clipped.
  for (const cc of [-0.5, R - 0.5]) grow(projectIso(cc, TERRAIN.roleLabelRow, 0, probe));

  const originX = margin + gutter - minX;
  const originY = margin + topPad - minY;
  const V: ViewParams = { theta: opts.theta, tileW, tileH, originX, originY: originY + (opts.originYOffset ?? 0), cx, cy };

  // Bars
  const bars: SceneBar[] = [];
  const shadows: { points: string }[] = [];
  for (const cell of data.cells) {
    const ci = roleIdx.get(cell.roleId) ?? 0;
    const ri = folderIdx.get(cell.folderId) ?? 0;
    const h = cellHeight(cell);
    const { faces, top, depth } = barScene(ci, ri, h, V, colorForRank(cell.rank), L);
    const cxp = (top[0].x + top[2].x) / 2;
    const cyp = (top[0].y + top[2].y) / 2;
    bars.push({ cell, faces, top, cx: cxp, cy: cyp, depth });
    // Contact shadow: footprint expanded a touch and dropped a few px so a soft
    // halo peeks out from under the bar, grounding it.
    const ground = SHADOW_CORNERS.map(([dc, dr]) => { const p = projectIso(ci + dc, ri + dr, 0, V); return { x: p.x, y: p.y + 3 }; });
    shadows.push({ points: ptsStr(ground) });
  }
  bars.sort((a, b) => a.depth - b.depth);

  // Ground lattice (rotated)
  const lattice: TerrainScene["lattice"] = [];
  for (let c = 0; c <= R; c++) { const a = projectIso(c - 0.5, -0.5, 0, V); const b = projectIso(c - 0.5, Cf - 0.5, 0, V); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  for (let r = 0; r <= Cf; r++) { const a = projectIso(-0.5, r - 0.5, 0, V); const b = projectIso(R - 0.5, r - 0.5, 0, V); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }

  // Folder labels: fixed left gutter list, leader to the (rotated) row anchor.
  const listTop = margin + topPad + (opts.originYOffset ?? 0);
  const listGap = Cf > 1 ? Math.min(26, ((Cf - 1) * (tileH / 2) + 40) / (Cf - 1)) : 22;
  const folderLabels = folders.map((f, i) => {
    const anchor = projectIso(-0.5, i, 0, V);
    return { id: f.id, name: f.name.length > 26 ? f.name.slice(0, 25) + "…" : f.name, textX: margin + gutter - 14, textY: listTop + i * listGap, ax: anchor.x, ay: anchor.y };
  });

  // Role labels: rotated anchors along the back of the role axis, angled to it.
  const labelCount = Math.min(maxRoleLabels, R);
  const axisDir = (() => { const a = projectIso(0, TERRAIN.roleLabelRow, 0, V); const b = projectIso(1, TERRAIN.roleLabelRow, 0, V); return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; })();
  const roleLabels = roles.slice(0, labelCount).map((r, i) => {
    const p = projectIso(i, TERRAIN.roleLabelRow, 0, V);
    return { id: r.id, name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, x: p.x, y: p.y, angle: axisDir };
  });

  // Compass gizmo origin lives top-right; vectors show the two ground axes.
  const gOrigin = projectIso(0, 0, 0, { ...V, originX: 0, originY: 0 });
  const fTip = projectIso(0, 1, 0, { ...V, originX: 0, originY: 0 });
  const rTip = projectIso(1, 0, 0, { ...V, originX: 0, originY: 0 });
  const norm = (p: Pt) => { const d = Math.hypot(p.x - gOrigin.x, p.y - gOrigin.y) || 1; return { x: (p.x - gOrigin.x) / d, y: (p.y - gOrigin.y) / d }; };

  const groundCorners = { back: projectIso(-0.5, -0.5, 0, V), right: projectIso(R - 0.5, -0.5, 0, V), front: projectIso(R - 0.5, Cf - 0.5, 0, V), left: projectIso(-0.5, Cf - 0.5, 0, V) };

  const width = Math.ceil(maxX - minX + gutter + margin * 2 + 130);
  const height = Math.ceil(maxY - minY + topPad + margin * 2 + (opts.originYOffset ?? 0));

  return { width, height, bars, shadows, lattice, folderLabels, roleLabels, extraRoles: R - labelCount, compass: { folder: norm(fTip), role: norm(rTip), origin: { x: 0, y: 0 } }, groundCorners };
}
