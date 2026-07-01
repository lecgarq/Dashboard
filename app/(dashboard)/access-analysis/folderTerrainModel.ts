/**
 * folderTerrainModel.ts — REF-01 SPLIT-01
 *
 * Data contract types + tier/rank/colour system + folder ordering + shared
 * iso-geometry primitives + Pt interface + TERRAIN layout-config const.
 *
 * Extracted from folderTerrain.ts (was lines ~18-256 + TERRAIN + Pt).
 * No I/O, no React, no DB — pure computation, safe to import anywhere.
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
  /** True when this cell's folder merely inherits its parent's permission set
   *  (no explicit override). Inheritors render muted/passive so the deliberately
   *  changed folders stand out. Absent/false = an explicit access decision. */
  inherited?: boolean;
}

export interface FolderTerrainData {
  projectId: string;
  projectName: string;
  office: string;
  /** Folders present, already in display order (depth-first by path). `depth` is
   *  0 for top-level (level-2) folders and increases with nesting; `inherited`
   *  marks folders that copy their parent's permissions verbatim. */
  folders: ReadonlyArray<{ id: string; name: string; inherited?: boolean; depth?: number }>;
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
 * Maps the DB permType string to a 1..6 ordinal, aligned to ACC's real levels
 * (View / Create / Edit / Manage). Legacy strings kept so any not-yet-remigrated
 * row never falls back to rank 1 by surprise.
 */
const TIER_RANK: Readonly<Record<string, number>> = {
  "View Only": 1,
  "View+Download": 2,
  "View+Download+Publish markups": 3,
  "View+Download+Publish markups+Upload": 4,
  "View+Download+Publish markups+Upload+Edit": 5,
  "Full administrative controls": 6,
  // legacy aliases (pre-ACC-alignment)
  "Upload Only": 4,
  "View+Download+Upload": 4,
  "View+Download+Upload+Edit": 5,
  "Full Controller": 6,
};

export function rankForTier(tier: string): number {
  return TIER_RANK[tier] ?? 1;
}

/**
 * Cool-professional sequential ramp (low access = cool slate-teal … full control
 * = warm gold). Indexed by rank 1..6. The cyan→amber break at 3→4 marks the
 * read/markups vs upload/edit/control divide.
 */
export const TIER_COLORS: Readonly<Record<number, string>> = {
  1: "#1e3a4c", // deep slate-teal — View Only
  2: "#2a7d8c", // teal — View+Download
  3: "#46b8c4", // cyan — +Publish markups
  4: "#e8943a", // orange — +Upload
  5: "#f0b32f", // amber — +Edit
  6: "#f8d348", // gold — Full administrative controls
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

/** Per-rank top-face gradient descriptors (bright far edge → slightly deeper).
 *  Derived from TIER_COLORS keys so every defined rank (1..6) gets a top gradient —
 *  a missing one renders the bar's top face with no fill (see-through). */
export const TIER_GRADIENTS: ReadonlyArray<{ rank: number; id: string; from: string; to: string }> =
  Object.keys(TIER_COLORS).map(Number).map((rank) => ({
    rank,
    id: topGradientId(rank),
    from: mix(TIER_COLORS[rank], 1.32), // bright specular highlight edge
    to: mix(TIER_COLORS[rank], 0.80),   // deeper base — wider ramp reads as gloss
  }));

/** Legend rows, in ascending-access order. */
export const TIER_LEGEND: ReadonlyArray<{ rank: number; label: string }> = [
  { rank: 1, label: "View only" },
  { rank: 2, label: "View / download" },
  { rank: 3, label: "+ Publish markups" },
  { rank: 4, label: "+ Upload" },
  { rank: 5, label: "+ Edit" },
  { rank: 6, label: "Full control" },
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
// Shared layout types (Pt + TERRAIN) — consumed by Layout, Scene, and Camera
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

export const TERRAIN = {
  tileW: 28,
  tileH: 14, // 2:1 iso
  maxBar: 90, // px for the tallest bar
  minBar: 8, // px floor so every permission shows
  margin: 16,
  gutter: 188, // left gutter for folder labels
  topPad: 96, // headroom for role labels + tallest bar
  maxRoleLabels: 40, // candidate cap; collision-pruning + zoom reveal the rest
  roleLabelRow: -1.7, // how far behind the grid the role axis labels sit
} as const;
