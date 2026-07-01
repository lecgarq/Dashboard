/**
 * folderTerrainLayout.ts — REF-01 SPLIT-01
 *
 * Fixed 2:1 iso layout (buildTerrainLayout) + compare shared-axes/stacked
 * layout (buildSharedAxes / projectOntoAxes / buildStackedTerrain).
 *
 * Extracted from folderTerrain.ts (was lines ~258-530).
 * No I/O, no React, no DB — pure computation.
 */

import {
  type FolderTerrainData,
  type TerrainCell,
  type Pt,
  type BarFaces,
  TERRAIN,
  isoBase,
  barFaces,
  barHeight,
  depthOrder,
  compareFolderNames,
} from "./folderTerrainModel";

// ---------------------------------------------------------------------------
// Layout — turns a FolderTerrainData into ready-to-draw screen geometry. Pure
// so the panel and a static preview generator share one source of truth.
// ---------------------------------------------------------------------------

interface TerrainBar {
  cell: TerrainCell;
  folderIdx: number;
  roleIdx: number;
  sx: number;
  sy: number;
  h: number;
  faces: BarFaces;
}

export interface TerrainLayout {
  width: number;
  height: number;
  bars: TerrainBar[];
  order: number[];
  lattice: { x1: number; y1: number; x2: number; y2: number }[];
  folderLabels: { id: string; name: string; textX: number; textY: number; lineX1: number; lineY1: number; lineX2: number; lineY2: number }[];
  roleLabels: { id: string; name: string; x: number; y: number }[];
  extraRoles: number;
  roleAxisEndX: number;
  roleAxisEndY: number;
  /** Four ground-plane corners of the footprint (for stacking connectors). */
  groundCorners: { back: Pt; right: Pt; front: Pt; left: Pt };
}

export interface TerrainLayoutOpts {
  /** Vertical offset added to the origin — used to stack slabs. */
  originYOffset?: number;
  /** Override the tallest-bar height (compact slabs in compare mode). */
  maxBar?: number;
}

export function buildTerrainLayout(data: FolderTerrainData | null, opts: TerrainLayoutOpts = {}): TerrainLayout {
  const zero = { x: 0, y: 0 };
  const empty: TerrainLayout = { width: 600, height: 360, bars: [], order: [], lattice: [], folderLabels: [], roleLabels: [], extraRoles: 0, roleAxisEndX: 0, roleAxisEndY: 0, groundCorners: { back: zero, right: zero, front: zero, left: zero } };
  if (!data) return empty;

  const { tileW, tileH, minBar, margin, gutter, topPad, maxRoleLabels } = TERRAIN;
  const maxBar = opts.maxBar ?? TERRAIN.maxBar;
  const folders = data.folders;
  const roles = data.roles;
  const Cf = folders.length; // rows (left axis)
  const R = roles.length; // cols (right axis)
  const folderIdx = new Map(folders.map((f, i) => [f.id, i]));
  const roleIdx = new Map(roles.map((r, i) => [r.id, i]));

  const hw = tileW / 2;
  const hh = tileH / 2;
  const originX = margin + gutter + (Cf - 1) * hw; // leftmost point is row=Cf-1, col=0
  const originY = margin + topPad + (opts.originYOffset ?? 0);
  const iso = { tileW, tileH, originX, originY };

  const heightByUsers = data.maxUserCount > 0;
  const maxMetric = heightByUsers ? data.maxUserCount : 5;

  const bars: TerrainBar[] = data.cells.map((cell) => {
    const ci = roleIdx.get(cell.roleId) ?? 0;
    const ri = folderIdx.get(cell.folderId) ?? 0;
    const { x, y } = isoBase(ci, ri, iso);
    const metric = heightByUsers ? cell.userCount : cell.rank;
    const h = barHeight(metric, maxMetric, minBar, maxBar);
    return { cell, folderIdx: ri, roleIdx: ci, sx: x, sy: y, h, faces: barFaces(x, y, h, tileW, tileH) };
  });
  const order = depthOrder(bars.map((b) => ({ folderIdx: b.folderIdx, roleIdx: b.roleIdx })));

  const lattice: TerrainLayout["lattice"] = [];
  for (let c = 0; c <= R; c++) {
    const a = isoBase(c - 0.5, -0.5, iso);
    const b = isoBase(c - 0.5, Cf - 0.5, iso);
    lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  for (let r = 0; r <= Cf; r++) {
    const a = isoBase(-0.5, r - 0.5, iso);
    const b = isoBase(R - 0.5, r - 0.5, iso);
    lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  const listTop = originY;
  const listGap = Cf > 1 ? Math.min(26, ((Cf - 1) * hh + 40) / (Cf - 1)) : 22;
  const folderLabels = folders.map((f, i) => {
    const anchor = isoBase(-0.5, i, iso);
    const textY = listTop + i * listGap;
    const textX = margin + gutter - 14;
    return { id: f.id, name: f.name.length > 26 ? f.name.slice(0, 25) + "…" : f.name, textX, textY, lineX1: textX + 4, lineY1: textY, lineX2: anchor.x, lineY2: anchor.y };
  });

  const labelCount = Math.min(maxRoleLabels, R);
  const roleLabels = roles.slice(0, labelCount).map((r, i) => {
    const p = isoBase(i, TERRAIN.roleLabelRow, iso);
    return { id: r.id, name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, x: p.x, y: p.y };
  });
  const axisEnd = isoBase(labelCount, TERRAIN.roleLabelRow, iso);

  const rightX = isoBase(R - 0.5, 0, iso).x;
  const bottomY = isoBase(R - 0.5, Cf - 0.5, iso).y;
  const width = Math.ceil(Math.max(rightX, originX) + 120 + margin);
  const listBottom = listTop + (Cf - 1) * listGap;
  const height = Math.ceil(Math.max(bottomY, listBottom) + margin + 20);
  const groundCorners = {
    back: isoBase(-0.5, -0.5, iso),
    right: isoBase(R - 0.5, -0.5, iso),
    front: isoBase(R - 0.5, Cf - 0.5, iso),
    left: isoBase(-0.5, Cf - 0.5, iso),
  };

  return { width, height, bars, order, lattice, folderLabels, roleLabels, extraRoles: R - labelCount, roleAxisEndX: axisEnd.x, roleAxisEndY: axisEnd.y, groundCorners };
}

// ---------------------------------------------------------------------------
// Compare mode — stack several projects on SHARED axes so the same folder/role
// cell sits at the same grid position in every slab (the layered-inspiration
// look). Folder names are normalised so "01_Client Documents" ≡ "Client
// Documents" across projects.
// ---------------------------------------------------------------------------

/** Drop a leading "NN_" / "NN " ordering prefix and trim, for cross-project keys. */
export function normalizeFolderName(name: string): string {
  return name.replace(/^\s*\d+\s*[_\-.)]?\s*/, "").trim() || name.trim();
}

export interface SharedAxes {
  /** Folder rows keyed by normalised name, in display order. */
  folders: { key: string; name: string }[];
  /** Role columns (by AccRole id), in display order. */
  roles: { id: string; name: string }[];
}

/**
 * Union of folders (by normalised name) and roles across the given projects.
 * Folders are ranked by how many projects contain them (then name); roles by
 * total users across the projects (then name). Both are capped for legibility.
 */
export function buildSharedAxes(
  datas: ReadonlyArray<FolderTerrainData>,
  maxFolders = 12,
  maxRoles = 12,
): SharedAxes {
  const folderProjects = new Map<string, { name: string; projects: Set<string> }>();
  const roleUsers = new Map<string, { name: string; users: number }>();

  for (const d of datas) {
    for (const f of d.folders) {
      const key = normalizeFolderName(f.name);
      const e = folderProjects.get(key) ?? { name: key, projects: new Set<string>() };
      e.projects.add(d.projectId);
      folderProjects.set(key, e);
    }
    for (const r of d.roles) {
      const users = d.usersByRole[r.id]?.length ?? 0;
      const e = roleUsers.get(r.id) ?? { name: r.name, users: 0 };
      e.users += users;
      roleUsers.set(r.id, e);
    }
  }

  const folders = [...folderProjects.entries()]
    .sort((a, b) => b[1].projects.size - a[1].projects.size || compareFolderNames(a[1].name, b[1].name))
    .slice(0, maxFolders)
    .map(([key, v]) => ({ key, name: v.name }))
    .sort((a, b) => compareFolderNames(a.name, b.name));

  const roles = [...roleUsers.entries()]
    .sort((a, b) => b[1].users - a[1].users || a[1].name.localeCompare(b[1].name))
    .slice(0, maxRoles)
    .map(([id, v]) => ({ id, name: v.name }));

  return { folders, roles };
}

/**
 * Re-key one project's data onto shared axes: folders/roles become the shared
 * lists, and only cells whose (normalised folder, role) fall on those axes are
 * kept. The result feeds straight into buildTerrainLayout for one slab.
 */
export function projectOntoAxes(data: FolderTerrainData, axes: SharedAxes): FolderTerrainData {
  const folderKeys = new Set(axes.folders.map((f) => f.key));
  const roleIds = new Set(axes.roles.map((r) => r.id));
  // Map this project's folder id → shared key, keeping the first folder per key.
  const idToKey = new Map<string, string>();
  for (const f of data.folders) {
    const key = normalizeFolderName(f.name);
    if (folderKeys.has(key)) idToKey.set(f.id, key);
  }

  const cells: TerrainCell[] = data.cells
    .filter((c) => idToKey.has(c.folderId) && roleIds.has(c.roleId))
    .map((c) => {
      const key = idToKey.get(c.folderId)!;
      return { ...c, folderId: key, folderName: key };
    });

  return {
    ...data,
    folders: axes.folders.map((f) => ({ id: f.key, name: f.name })),
    roles: axes.roles.map((r) => ({ id: r.id, name: r.name })),
    cells,
  };
}

interface StackedSlab {
  projectId: string;
  projectName: string;
  layout: TerrainLayout;
  /** Vertical centre of this slab's ground, for the left-side project label. */
  labelY: number;
}

export interface StackedTerrain {
  slabs: StackedSlab[];
  connectors: { x1: number; y1: number; x2: number; y2: number }[];
  width: number;
  height: number;
}

/**
 * Stack each project as a slab on shared axes, offset vertically, with dotted
 * connectors between consecutive ground corners (the layered-column device).
 */
export function buildStackedTerrain(
  datas: ReadonlyArray<FolderTerrainData>,
  axes: SharedAxes,
  opts: { slabMaxBar?: number; gap?: number } = {},
): StackedTerrain {
  const maxBar = opts.slabMaxBar ?? 44;
  const gap = opts.gap ?? 40;
  const Cf = axes.folders.length;
  const R = axes.roles.length;
  // Footprint diagonal height + bar headroom + gap = vertical pitch per slab.
  const pitch = (Cf - 1 + (R - 1)) * (TERRAIN.tileH / 2) + maxBar + gap;

  const slabs: StackedSlab[] = datas.map((d, i) => {
    const projected = projectOntoAxes(d, axes);
    const layout = buildTerrainLayout(projected, { originYOffset: i * pitch, maxBar });
    const c = layout.groundCorners;
    return { projectId: d.projectId, projectName: d.projectName, layout, labelY: (c.back.y + c.front.y) / 2 };
  });

  const connectors: StackedTerrain["connectors"] = [];
  for (let i = 0; i < slabs.length - 1; i++) {
    const a = slabs[i].layout.groundCorners;
    const b = slabs[i + 1].layout.groundCorners;
    for (const k of ["back", "right", "front", "left"] as const) {
      connectors.push({ x1: a[k].x, y1: a[k].y, x2: b[k].x, y2: b[k].y });
    }
  }

  const width = slabs[0]?.layout.width ?? 600;
  const last = slabs[slabs.length - 1]?.layout;
  const height = last ? last.height : 360;
  return { slabs, connectors, width, height };
}
