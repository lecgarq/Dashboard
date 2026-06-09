/**
 * folderTerrain.ts
 *
 * Pure data contract + geometry for the "Folder Permission Terrain" panel — an
 * isometric 3D bar field where:
 *   X (columns) = Level-2 folders under "Project Files"
 *   Y (rows)    = roles that hold a permission on those folders
 *   bar color   = permission tier (View Only … Full Control)
 *   bar height  = number of users holding that role on the project
 *
 * No I/O, no React, no DB — so the server view and the client panel share the
 * same types, and the isometric projection / colour ramp stay unit-testable.
 */

// ---------------------------------------------------------------------------
// Data contract (shared by lib/server/folderPermissionTerrainView.ts + panel)
// ---------------------------------------------------------------------------

export interface TerrainUser {
  name: string;
  email: string;
}

/** One (folder, role) cell that carries a permission. Empty cells are omitted. */
export interface TerrainCell {
  folderId: string;
  folderName: string;
  roleId: string;
  roleName: string;
  /** Raw permType from the DB ("View Only" … "Full Controller"). In overview
   *  mode this is the MODAL (most common) tier across projects. */
  tier: string;
  /** 1..5 ordinal rank of the tier (low access → high access). */
  rank: number;
  /** Height metric: users in role (single/compare) OR projects configuring this
   *  folder×role (overview). Interpreted via FolderTerrainData.heightMetric. */
  userCount: number;
  /** Overview only: rank → project count, for the tier-distribution drill. */
  tierBreakdown?: Record<number, number>;
}

export interface FolderTerrainData {
  projectId: string;
  projectName: string;
  office: string;
  /** L2 folders present, already in display order. */
  folders: ReadonlyArray<{ id: string; name: string }>;
  /** Roles present on ≥1 folder, already in display order (most-staffed first). */
  roles: ReadonlyArray<{ id: string; name: string }>;
  /** Sparse set of populated (folder, role) cells. */
  cells: ReadonlyArray<TerrainCell>;
  /** roleId → project members holding that role (shipped once, not per cell). */
  usersByRole: Record<string, TerrainUser[]>;
  /** Largest per-cell height metric, for scaling. 0 when membership unknown. */
  maxUserCount: number;
  /** What the bar height encodes — "users" (default) or "projects" (overview). */
  heightMetric?: "users" | "projects";
  generatedAt: string;
}

/** A pickable project in the terrain selector. */
export interface TerrainProjectOption {
  id: string;
  name: string;
  office: string;
  folderCount: number;
  permCount: number;
  /** Distinct users holding any role on the project (max of DC / live sources). */
  userRoleCount: number;
}

// ---------------------------------------------------------------------------
// Permission tier ↔ rank ↔ colour
// ---------------------------------------------------------------------------

/**
 * Maps the DB permType string to a 1..5 ordinal. "Upload Only" is rare and sits
 * alongside View+Download at rank 2 (both are limited, non-edit access).
 */
export const TIER_RANK: Readonly<Record<string, number>> = {
  "View Only": 1,
  "View+Download": 2,
  "Upload Only": 2,
  "View+Download+Upload": 3,
  "View+Download+Upload+Edit": 4,
  "Full Controller": 5,
};

export function rankForTier(tier: string): number {
  return TIER_RANK[tier] ?? 1;
}

/**
 * Cool-professional sequential ramp (low access = cool slate-teal … full control
 * = warm gold). Indexed by rank 1..5. Tuned to read on both the dark zinc and the
 * light theme; the cyan→amber break at 3→4 also marks the read/upload vs edit/control
 * divide.
 */
export const TIER_COLORS: Readonly<Record<number, string>> = {
  1: "#1e3a4c", // deep slate-teal — View Only
  2: "#2a7d8c", // teal — View+Download / Upload Only
  3: "#46b8c4", // cyan — +Upload
  4: "#f0a830", // amber — +Edit
  5: "#f8d348", // gold — Full Control
};

export function colorForRank(rank: number): string {
  return TIER_COLORS[rank] ?? TIER_COLORS[1];
}

/** Legible foreground colour for text drawn ON a tier swatch (ranks 4–5 are light). */
export function tierTextColor(rank: number): string {
  return rank >= 4 ? "#0b1620" : "#ffffff";
}

/** Lighten/darken a #rrggbb by a factor (1 = unchanged) for gradient stops. */
function mix(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/** Stable SVG gradient id for a rank's top face. */
export function topGradientId(rank: number): string {
  return `terrainTop-${rank}`;
}

/** Per-rank top-face gradient descriptors (bright far edge → slightly deeper). */
export const TIER_GRADIENTS: ReadonlyArray<{ rank: number; id: string; from: string; to: string }> =
  [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    id: topGradientId(rank),
    from: mix(TIER_COLORS[rank], 1.14),
    to: mix(TIER_COLORS[rank], 0.92),
  }));

/** Legend rows, in ascending-access order. */
export const TIER_LEGEND: ReadonlyArray<{ rank: number; label: string }> = [
  { rank: 1, label: "View only" },
  { rank: 2, label: "View / download" },
  { rank: 3, label: "+ Upload" },
  { rank: 4, label: "+ Edit" },
  { rank: 5, label: "Full control" },
];

// ---------------------------------------------------------------------------
// Ordering helpers
// ---------------------------------------------------------------------------

/** Leading integer of a folder name ("03_Design" → 3, "Design" → null). */
function leadingNum(name: string): number | null {
  const m = /^(\d+)/.exec(name.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Folder display order: numbered folders first by their number, then unnumbered
 * folders alphabetically. Keeps "01_…/02_…" sequences intact while still sorting
 * projects whose folders carry no prefix.
 */
export function compareFolderNames(a: string, b: string): number {
  const na = leadingNum(a);
  const nb = leadingNum(b);
  if (na != null && nb != null) return na - nb || a.localeCompare(b);
  if (na != null) return -1;
  if (nb != null) return 1;
  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Isometric projection (2:1) — pure geometry
// ---------------------------------------------------------------------------

export interface IsoParams {
  tileW: number; // full width of a tile diamond
  tileH: number; // full height of a tile diamond (≈ tileW/2 for 2:1 iso)
  originX: number;
  originY: number;
}

/** Screen position of the base centre of grid cell (col, row). */
export function isoBase(col: number, row: number, p: IsoParams): { x: number; y: number } {
  return {
    x: p.originX + (col - row) * (p.tileW / 2),
    y: p.originY + (col + row) * (p.tileH / 2),
  };
}

export interface BarFaces {
  top: string; // SVG points for the top diamond
  left: string; // down-left face (toward viewer-left)
  right: string; // down-right face (toward viewer-right)
}

/**
 * The three visible faces of an iso bar rising `h` px from base centre (sx, sy).
 * Points are "x,y x,y …" strings ready for <polygon points=…>.
 */
export function barFaces(sx: number, sy: number, h: number, tileW: number, tileH: number): BarFaces {
  const hw = tileW / 2;
  const hh = tileH / 2;
  const ty = sy - h; // top-face centre y
  return {
    top: `${sx},${ty - hh} ${sx + hw},${ty} ${sx},${ty + hh} ${sx - hw},${ty}`,
    left: `${sx - hw},${ty} ${sx},${ty + hh} ${sx},${sy + hh} ${sx - hw},${sy}`,
    right: `${sx},${ty + hh} ${sx + hw},${ty} ${sx + hw},${sy} ${sx},${sy + hh}`,
  };
}

/** Map a value to a bar height in px, clamped to [minPx, maxPx]. */
export function barHeight(value: number, maxValue: number, minPx: number, maxPx: number): number {
  if (maxValue <= 0) return minPx;
  const t = Math.max(0, Math.min(1, value / maxValue));
  return minPx + t * (maxPx - minPx);
}

/**
 * Painter's-algorithm order: draw back-to-front so nearer bars overlap farther
 * ones. Depth increases with (col + row); ties keep input order (same diagonal
 * never self-overlaps). Returns a new sorted array of indices into `cells`.
 */
export function depthOrder(
  cells: ReadonlyArray<{ folderIdx: number; roleIdx: number }>,
): number[] {
  return cells
    .map((c, i) => ({ i, d: c.folderIdx + c.roleIdx }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.i);
}

/** Darken a #rrggbb hex by `amt` (0..1) for the shaded side faces of a bar. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ---------------------------------------------------------------------------
// Layout — turns a FolderTerrainData into ready-to-draw screen geometry. Pure
// so the panel and a static preview generator share one source of truth.
// ---------------------------------------------------------------------------

export const TERRAIN = {
  tileW: 28,
  tileH: 14, // 2:1 iso
  maxBar: 72, // px for the tallest bar
  minBar: 7, // px floor so every permission shows
  margin: 16,
  gutter: 188, // left gutter for folder labels
  topPad: 96, // headroom for role labels + tallest bar
  maxRoleLabels: 12,
  roleLabelRow: -1.7, // how far behind the grid the role axis labels sit
} as const;

export interface TerrainBar {
  cell: TerrainCell;
  folderIdx: number;
  roleIdx: number;
  sx: number;
  sy: number;
  h: number;
  faces: BarFaces;
}

export interface Pt {
  x: number;
  y: number;
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

export interface StackedSlab {
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
export function isoDepth(col: number, row: number, V: ViewParams): number {
  const u = col - V.cx;
  const v = row - V.cy;
  const ct = Math.cos(V.theta);
  const st = Math.sin(V.theta);
  return u * ct - v * st + (u * st + v * ct);
}

// Unit-cell corners (CCW) and the outward world normal of side i (corner i→i+1).
const CELL_CORNERS: ReadonlyArray<[number, number]> = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const SIDE_NORMAL: ReadonlyArray<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SHADOW_CORNERS: ReadonlyArray<[number, number]> = [[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]];

function signedArea(pts: ReadonlyArray<Pt>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return s / 2;
}

const ptsStr = (pts: ReadonlyArray<Pt>) => pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
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

export const DEFAULT_LIGHT: Light = { dx: 0.32, dy: 0.95, ambient: 0.34, diffuse: 0.66, topBright: 1.06, sideMax: 0.86 };

/** Brightness of a side whose rotated outward normal is (nx,ny). */
function sideBrightness(nx: number, ny: number, L: Light): number {
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
  folderLabels: { id: string; name: string; textX: number; textY: number; ax: number; ay: number }[];
  roleLabels: { id: string; name: string; x: number; y: number; angle: number }[];
  extraRoles: number;
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
  const cellHeight = (cell: TerrainCell) => barHeight(heightByUsers ? cell.userCount : cell.rank, maxMetric, minBar, maxBar);

  // Bars + contact shadows.
  const bars: SceneBar[] = [];
  const shadows: { points: string }[] = [];
  for (const cell of data.cells) {
    const ci = roleIdx.get(cell.roleId) ?? 0;
    const ri = (folderIdx.get(cell.folderId) ?? 0) + rOff;
    const h = cellHeight(cell);
    const b = barSceneCam(ci, ri, h, c, colorForRank(cell.rank), L);
    bars.push({ cell, faces: b.faces, top: b.top, cx: b.cx, cy: b.cy, depth: b.depth, col: ci, row: ri });
    const ground = SHADOW_CORNERS.map(([dc, dr]) => { const p = projectCamera(ci + dc, ri + dr, 0, c); return { x: p.x, y: p.y + 3 }; });
    shadows.push({ points: ptsStr(ground) });
  }
  bars.sort((a, b2) => a.depth - b2.depth);

  // Ground lattice (rotated by the camera).
  const lattice: TerrainScene["lattice"] = [];
  for (let col = 0; col <= R; col++) { const a = projectCamera(col - 0.5, -0.5 + rOff, 0, c); const b = projectCamera(col - 0.5, Cf - 0.5 + rOff, 0, c); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  for (let row = 0; row <= Cf; row++) { const a = projectCamera(-0.5, row - 0.5 + rOff, 0, c); const b = projectCamera(R - 0.5, row - 0.5 + rOff, 0, c); lattice.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }

  // Folder labels: ride the terrain at each row's left edge, leader to that corner.
  const folderLabels = folders.map((f, i) => {
    const anchor = projectCamera(-0.5, i + rOff, 0, c);
    return { id: f.id, name: f.name.length > 26 ? f.name.slice(0, 25) + "…" : f.name, textX: anchor.x - 10, textY: anchor.y, ax: anchor.x, ay: anchor.y };
  });

  // Role labels: along the back of the role axis, angled to it.
  const labelCount = Math.min(maxRoleLabels, R);
  const aDir = projectCamera(0, TERRAIN.roleLabelRow + rOff, 0, c);
  const bDir = projectCamera(1, TERRAIN.roleLabelRow + rOff, 0, c);
  const axisDir = Math.atan2(bDir.y - aDir.y, bDir.x - aDir.x) * 180 / Math.PI;
  const roleLabels = roles.slice(0, labelCount).map((r, i) => {
    const p = projectCamera(i, TERRAIN.roleLabelRow + rOff, 0, c);
    return { id: r.id, name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, x: p.x, y: p.y, angle: axisDir };
  });

  // Compass: pure ground-axis directions (anchor/pivot removed) + the tilt read-out.
  const dirCam: Camera = { ...c, pivotCol: 0, pivotRow: 0, anchorX: 0, anchorY: 0, scale: 1 };
  const gO = projectCamera(0, 0, 0, dirCam);
  const norm = (p: Pt) => { const d = Math.hypot(p.x - gO.x, p.y - gO.y) || 1; return { x: (p.x - gO.x) / d, y: (p.y - gO.y) / d }; };
  const compass = { folder: norm(projectCamera(0, 1, 0, dirCam)), role: norm(projectCamera(1, 0, 0, dirCam)), origin: { x: 0, y: 0 }, pitch: c.pitch };

  const groundCorners = {
    back: projectCamera(-0.5, -0.5 + rOff, 0, c), right: projectCamera(R - 0.5, -0.5 + rOff, 0, c),
    front: projectCamera(R - 0.5, Cf - 0.5 + rOff, 0, c), left: projectCamera(-0.5, Cf - 0.5 + rOff, 0, c),
  };

  return { width: W, height: H, bars, shadows, lattice, folderLabels, roleLabels, extraRoles: R - labelCount, compass, groundCorners };
}

// ===========================================================================
// Compare — separated floating planes. Compose one camera scene per project,
// each on the SAME camera (yaw/pitch/scale/pivot) but anchored at a different
// SCREEN Y, so the planes are parallel, fully separated isometric islands (the
// BOT-OR-NOT exploded stack) rather than a cascading single-grid tower.
// ===========================================================================

export interface StackedPlane {
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
    const scene = buildCameraScene(projected, { camera: cam, viewport, maxBar });
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
