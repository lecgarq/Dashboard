/**
 * terrainViewModel.ts — SPLIT-02 (REF-01)
 *
 * Pure view-model transforms + shared types/consts for FolderPermissionTerrain.
 * Extracted verbatim from FolderPermissionTerrain.tsx — no React, no JSX, no I/O.
 */
import {
  buildCameraScene,
  buildSharedAxes,
  buildStackedScenes,
  HOME_PITCH,
  STEP,
  type Camera,
  type FolderTerrainData,
  type TerrainCell,
  type TerrainScene,
} from "../folderTerrain";

export type Mode = "single" | "compare" | "overview";
export type Metric = "users" | "projects";
export type Hover = { cell: TerrainCell; x: number; y: number } | null;
export type Picked = { cell: TerrainCell; source: FolderTerrainData } | null;

const PLANE_GAP = 64; // airy screen-px gap between stacked floating planes
const SLAB_MAXBAR = 44; // shorter bars so stacked planes stay legible
export const VIEW_H = 520; // fixed stage height (px)

/** Blend #rrggbb `hex` toward #rrggbb `target` by t (0 = hex, 1 = target).
 *  Used to desaturate inheritor bars toward neutral while keeping their tier hue. */
export function mixHex(hex: string, target: string, t: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
  const ch = (s: number) => { const ca = (a >> s) & 255, cb = (b >> s) & 255; return Math.round(ca + (cb - ca) * t); };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export interface Theme {
  ink: string; sub: string; grid: string; connector: string; hot: string; shadow: string; topEdge: string;
  /** Dark seam stroked around every bar face so overlapping bars stay distinct. */
  edge: string;
  /** Solid floor plane fill + outline, so "ground level" is unambiguous. */
  ground: string; groundEdge: string;
  /** Halo behind labels so they stay legible over the bars. */
  halo: string;
  dark: boolean;
}
export interface SceneEntry { scene: TerrainScene; source: FolderTerrainData; label?: string; labelX?: number; labelY?: number; }
export interface StageView { scenes: SceneEntry[]; connectors: { x1: number; y1: number; x2: number; y2: number }[]; metric: Metric; empty: string | null; }

// ---------------------------------------------------------------------------
// Pivot defaults + scene composition
// ---------------------------------------------------------------------------
const centerPivot = (R: number, Cf: number) => ({ col: (R - 1) / 2, row: (Cf - 1) / 2 });

/** Grid dimensions of the active view (role columns × folder rows). */
export function activeDims(mode: Mode, single: FolderTerrainData | null, overview: FolderTerrainData | null, compareDatas: FolderTerrainData[]): { R: number; Cf: number } {
  if (mode === "single" && single) return { R: single.roles.length, Cf: single.folders.length };
  if (mode === "overview" && overview) return { R: overview.roles.length, Cf: overview.folders.length };
  if (mode === "compare" && compareDatas.length >= 2) { const axes = buildSharedAxes(compareDatas); return { R: axes.roles.length, Cf: axes.folders.length }; }
  return { R: 1, Cf: 1 };
}

export function defaultPivot(mode: Mode, single: FolderTerrainData | null, overview: FolderTerrainData | null, compareDatas: FolderTerrainData[]) {
  const { R, Cf } = activeDims(mode, single, overview, compareDatas);
  return R > 0 && Cf > 0 ? centerPivot(R, Cf) : { col: 0, row: 0 };
}

/**
 * Default zoom that frames the whole footprint at the home angle. Only ever zooms
 * OUT (capped at 1), so small terrains keep their natural size while a deep field
 * (e.g. the template's 177 folders) loads fully visible — zoom in then reveals
 * more labels (level-of-detail).
 */
export function fitScale(R: number, Cf: number, vw: number, vh: number): number {
  const k = Math.SQRT1_2; // sin = cos at the 45° home yaw
  const sp = Math.sin(HOME_PITCH), cp = Math.cos(HOME_PITCH);
  const spanW = Math.max(1, (R + Cf) * k * STEP);
  const spanH = Math.max(1, (R + Cf) * k * sp * STEP + 90 * cp);
  return Math.max(0.16, Math.min((vw * 0.86) / spanW, (vh * 0.82) / spanH, 1));
}

// Many folders (e.g. the template's all-changed terrain) overflow the roomy
// evenly-spaced folder-label list, so fall back to compact, collision-pruned
// labels past this count; small terrains keep the spacious leader list.
const MANY_FOLDERS = 20;

export function buildView(mode: Mode, single: FolderTerrainData | null, overview: FolderTerrainData | null, compareDatas: FolderTerrainData[], cam: Camera, viewport: { w: number; h: number }, busy: boolean, growth: number): StageView {
  const blank = (empty: string): StageView => ({ scenes: [], connectors: [], metric: "users", empty });

  if (mode === "single") {
    if (!single) return blank(busy ? "Loading terrain…" : "No folder-permission data for this project.");
    const scene = buildCameraScene(single, { camera: cam, viewport, growth, compactLabels: single.folders.length > MANY_FOLDERS });
    return { scenes: [{ scene, source: single }], connectors: [], metric: "users", empty: null };
  }
  if (mode === "overview") {
    if (!overview) return blank(busy ? "Loading overview…" : "Overview unavailable.");
    const scene = buildCameraScene(overview, { camera: cam, viewport, growth, compactLabels: overview.folders.length > MANY_FOLDERS });
    return { scenes: [{ scene, source: overview }], connectors: [], metric: "projects", empty: null };
  }
  // compare — separated floating planes, one per project, on a shared camera.
  if (compareDatas.length < 2) return blank(busy ? "Loading projects…" : "Pick at least two projects to compare.");
  const axes = buildSharedAxes(compareDatas);
  const stacked = buildStackedScenes(compareDatas, axes, cam, viewport, { maxBar: SLAB_MAXBAR, gap: PLANE_GAP, growth });
  const scenes: SceneEntry[] = stacked.planes.map((p) => ({
    scene: p.scene,
    source: p.source,
    label: p.label,
    labelX: p.headerX,
    labelY: p.headerY,
  }));
  return { scenes, connectors: stacked.connectors, metric: "users", empty: null };
}

/** Per-project tier for one cell, across the compare set (for the detail card). */
export function crossProjectTiers(cell: TerrainCell, datas: FolderTerrainData[]): { project: string; tier: string; rank: number }[] {
  const out: { project: string; tier: string; rank: number }[] = [];
  for (const d of datas) {
    const hit = d.cells.find((c) => c.folderName === cell.folderName && c.roleId === cell.roleId);
    if (hit) out.push({ project: d.projectName, tier: hit.tier, rank: hit.rank });
  }
  return out;
}
