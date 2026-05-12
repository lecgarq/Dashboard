"use client";

import type { GraphRenderNode } from "./graphRenderers";
import { resolveRenderNodeColor } from "./graphRenderers";

/**
 * Convert a hex color string (#RRGGBB) to normalized [r, g, b] floats (0.0–1.0).
 * Handles both 6-digit and shorthand formats. Falls back to gray on parse error.
 */
export function hexToRGBNorm(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    const g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    const b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16) / 255;
    const g = parseInt(cleaned.slice(2, 4), 16) / 255;
    const b = parseInt(cleaned.slice(4, 6), 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  }
  return [0.612, 0.639, 0.686]; // #9CA3AF fallback (gray-400)
}

/**
 * WebGL2 availability check — runs synchronously, returns false on server.
 * Call once at component mount and cache the result.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/**
 * Build a Float32Array of per-node RGBA values for Cosmos setPointColors().
 * Format: [r0, g0, b0, a0, r1, g1, b1, a1, ...] — normalized 0.0–1.0.
 * Uses node.color (pre-computed hex by kind: user/project/role/module) so 4 distinct
 * node type colors are preserved — matches Canvas 2D renderer exactly.
 * REND-03 node visual distinction: all 4 node types render with distinct colors.
 */
export function buildNodeColorBuffer(nodes: readonly GraphRenderNode[]): Float32Array {
  const buf = new Float32Array(nodes.length * 4);
  for (let i = 0; i < nodes.length; i++) {
    // Phase 7 Pitfall 4: folder kind overrides node.color with neutral teal.
    const [r, g, b] = hexToRGBNorm(resolveRenderNodeColor(nodes[i]));
    buf[i * 4 + 0] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 1.0;
  }
  return buf;
}

/**
 * Build a per-node RGBA buffer with same-username peers overwritten by the selected
 * node's color. Returns a copy of `baseColors` when `sameUserSet` is empty or
 * `selectedColor` is null — so callers can use the result unconditionally.
 *
 * Pure for unit testing — no DOM access, no module-level state.
 */
export function buildNodeHighlightColorBuffer(
  nodes: readonly GraphRenderNode[],
  baseColors: Float32Array,
  sameUserSet: ReadonlySet<number>,
  selectedColor: string | null,
): Float32Array {
  if (!selectedColor || sameUserSet.size === 0) {
    return new Float32Array(baseColors);
  }
  const out = new Float32Array(baseColors);
  const [r, g, b] = hexToRGBNorm(selectedColor);
  for (const idx of sameUserSet) {
    if (idx < 0 || idx >= nodes.length) continue;
    const off = idx * 4;
    out[off + 0] = r;
    out[off + 1] = g;
    out[off + 2] = b;
    out[off + 3] = 1.0;
  }
  return out;
}

/**
 * Build a Float32Array of per-node sizes for Cosmos setPointSizes().
 * Scales node size by connection count (degree): base size 4, max 12.
 * connections parameter: sparse array indexed by node index → connection count.
 * If connections is null/empty, all nodes use base size.
 */
export function buildNodeSizeBuffer(
  nodeCount: number,
  connections: Float32Array | null,
): Float32Array {
  const buf = new Float32Array(nodeCount);
  const BASE_SIZE = 4;
  const MAX_SIZE = 12;
  for (let i = 0; i < nodeCount; i++) {
    const degree = connections ? (connections[i] ?? 0) : 0;
    // Square-root scaling prevents high-degree nodes from overwhelming layout
    buf[i] = Math.min(MAX_SIZE, BASE_SIZE + Math.sqrt(degree) * 1.5);
  }
  return buf;
}

/**
 * Convert existing Int32Array link sources/targets to Cosmos Float32Array format.
 * Cosmos expects: [sourceIdx0, targetIdx0, sourceIdx1, targetIdx1, ...]
 */
export function buildLinkBuffer(links: {
  sources: Int32Array;
  targets: Int32Array;
}): Float32Array {
  const count = links.sources.length;
  const buf = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    buf[i * 2 + 0] = links.sources[i];
    buf[i * 2 + 1] = links.targets[i];
  }
  return buf;
}

/**
 * Map the existing 0..100 layout sliders (separation, clusterStrength) to the
 * Cosmos simulation parameters. Pure for unit testing.
 *
 * Tuned for the 25k-node ACC hub. The cosmos.gl position-clamp shader patch
 * removes the simulation boundary, so values can go more aggressive at sep=100
 * without crushing nodes against an invisible wall.
 *
 * - separation: 0 = tight blob, 100 = wide organic spread.
 *   - simulationRepulsion ∈ [0.1, 50.0]   — extreme ceiling at sep=100 leverages
 *     the no-clamp patch — nodes fan out across unbounded space.
 *   - simulationLinkDistance ∈ [4, 500]   — chains relax to ~3× the previous
 *     ceiling, matching the higher repulsion so connected pairs aren't yanked
 *     back toward each other before repulsion can spread them.
 *   - simulationLinkSpring ∈ [0.7, 0.005] — effectively off at sep=100. Springs
 *     are what pull connected nodes into the linear "worm" shape; killing them
 *     at high sep lets repulsion dominate → organic blob.
 *   - simulationGravity ∈ [0.25, 0.0]     — gravity off entirely at sep=100;
 *     nothing pulls nodes back toward center, repulsion governs alone.
 * - clusterStrength: 0 = organic, 100 = fully clustered (simulationCluster ∈ [0,1]).
 */
export interface SliderControls {
  spacing: number;          // 0..100 (separation slider)
  clusterStrength: number;  // 0..100
}

export interface SimulationConfigPartial {
  simulationRepulsion: number;
  simulationLinkDistance: number;
  simulationLinkSpring: number;
  simulationCluster: number;
  simulationGravity: number;
  simulationCenter: number;
}

export function controlsToSimulationConfig(
  controls: SliderControls,
): SimulationConfigPartial {
  const sep = Math.max(0, Math.min(100, controls.spacing)) / 100;
  const cluster = Math.max(0, Math.min(100, controls.clusterStrength)) / 100;
  return {
    // TD-006 fix (2nd pass): the first-pass tuning lowered repulsion ceiling
    // and added a gravity floor, but at 25k+ nodes hub nodes still drifted to
    // the spaceSize=16384 wall. Cosmos's `simulationCenter` is a separate
    // force whose pull GROWS with distance from world center — exactly what
    // prevents escape. Combined with reduced repulsion this keeps the cluster
    // self-contained at every slider value.
    simulationRepulsion: 0.1 + Math.pow(sep, 1.4) * 9.9,        // 0.1..10.0
    simulationLinkDistance: 4 + Math.pow(sep, 1.6) * 196,       // 4..200
    simulationLinkSpring: 0.7 - Math.pow(sep, 1.1) * 0.6,       // 0.7..0.1
    simulationGravity: 0.3 - Math.pow(sep, 1.0) * 0.2,          // 0.3..0.1
    simulationCenter: 0.4 + sep * 0.4,                          // 0.4..0.8 — outliers always pulled back
    simulationCluster: cluster,                                  // 0..1
  };
}

/**
 * Minimal node shape consumed by `buildClusterIdsFromNodes`. We avoid importing
 * the full `SimNode` type so this helper stays pure and unit-testable in Node.
 */
export interface ClusterableNode {
  roles?: readonly string[];
  modules?: readonly string[];
}

/**
 * Build dense integer cluster ids (0..N-1) from a per-node attribute. Nodes that
 * lack the chosen key map to `undefined` so Cosmos treats them as unclustered.
 *
 * - `clusterKey: "role"` uses the first entry of `node.roles` (matches the
 *   primary-role coloring used in AccUsersGraph).
 * - `clusterKey: "module"` uses the first entry of `node.modules`.
 *
 * Pure for unit testing — no DOM access, no module-level state, deterministic
 * ordering (assignment order = first-seen).
 */
export function buildClusterIdsFromNodes(
  nodes: readonly ClusterableNode[],
  clusterKey: "role" | "module",
): (number | undefined)[] {
  const lookup = new Map<string, number>();
  let nextId = 0;
  const ids: (number | undefined)[] = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const candidates = clusterKey === "role" ? node.roles : node.modules;
    const key = candidates && candidates.length > 0 ? candidates[0] : undefined;
    if (!key) {
      ids[i] = undefined;
      continue;
    }
    let id = lookup.get(key);
    if (id === undefined) {
      id = nextId++;
      lookup.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

/**
 * Convert "#RRGGBB" (or "#RRGGBBAA") to normalized [r, g, b, a] in 0..1.
 * Falls back to the muted halftone gray (#9CA3AF @ 25%) on parse error.
 * Used by `buildLinkColorBuffer` to support per-edge color overrides.
 */
export function hexToRgba01(hex: string): [number, number, number, number] {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 6 || cleaned.length === 8) {
    const r = parseInt(cleaned.slice(0, 2), 16) / 255;
    const g = parseInt(cleaned.slice(2, 4), 16) / 255;
    const b = parseInt(cleaned.slice(4, 6), 16) / 255;
    const a = cleaned.length === 8 ? parseInt(cleaned.slice(6, 8), 16) / 255 : 0.25;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b) && !isNaN(a)) return [r, g, b, a];
  }
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
    const g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
    const b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
    return [r, g, b, 0.25];
  }
  return [0.612, 0.639, 0.686, 0.25];
}

/**
 * Build a Float32Array of per-link RGBA values for Cosmos setLinkColors().
 *
 * - No options / `perEdgeColors` omitted → uniform gray (legacy behavior;
 *   Phase 2 default, untouched for back-compat with existing call sites).
 * - `defaultColor` provided → uniform fill from that color.
 * - `perEdgeColors` provided → one color per edge. Length MUST equal `count`;
 *   shorter arrays leave the tail at the default gray, longer arrays are
 *   silently truncated. Phase 7 Plan 07-06 uses this to drive edge color by
 *   permTier or similarity dimension at render time.
 */
export function buildLinkColorBuffer(
  count: number,
  options?: { defaultColor?: string; perEdgeColors?: ReadonlyArray<string> },
): Float32Array {
  const buf = new Float32Array(count * 4);

  // Default = muted halftone gray (#9CA3AF @ 25% opacity).
  const [dr, dg, db, da] = options?.defaultColor
    ? hexToRgba01(options.defaultColor)
    : [0.612, 0.639, 0.686, 0.25];

  for (let i = 0; i < count; i++) {
    buf[i * 4 + 0] = dr;
    buf[i * 4 + 1] = dg;
    buf[i * 4 + 2] = db;
    buf[i * 4 + 3] = da;
  }

  if (options?.perEdgeColors && options.perEdgeColors.length > 0) {
    const overrides = options.perEdgeColors;
    const lim = Math.min(count, overrides.length);
    for (let i = 0; i < lim; i++) {
      const [r, g, b, a] = hexToRgba01(overrides[i]);
      buf[i * 4 + 0] = r;
      buf[i * 4 + 1] = g;
      buf[i * 4 + 2] = b;
      buf[i * 4 + 3] = a;
    }
  }

  return buf;
}

/**
 * Project ACC hub→spoke topology links into a renderer-friendly source/target
 * spoke-to-spoke chain. Mirrors the worker's `buildProjectedLinks` logic so the
 * GPU-physics path (which doesn't run the worker) still gets a non-empty link
 * buffer. Without this projection Cosmos receives 0 springs, the simulation
 * settles instantly, and the canvas renders empty (TD-005 follow-up bug).
 *
 * For each hub (`link.target`), gather the visible-node indices that point at
 * it, sort them, and emit one source→next pair per consecutive pair so the
 * spokes form a stable ring/chain. This matches the worker's projection so the
 * Canvas2D fallback and GPU-physics paths produce visually consistent layouts.
 *
 * Pure for unit testing — no DOM access, deterministic ordering.
 */
export interface ProjectedLinks {
  sources: Int32Array;
  targets: Int32Array;
  /**
   * Optional parallel array of hex color strings, length === sources.length.
   * Phase 7 Plan 07-06: present when the caller supplies `options.linkColor`
   * — drives Cosmos `setLinkColors` via `buildLinkColorBuffer({ perEdgeColors })`.
   */
  colors?: string[];
}

export function projectTopologyLinksToIndexPairs<
  L extends { source: string; target: string }
>(
  topologyLinks: readonly L[],
  nodeIndexById: ReadonlyMap<string, number>,
  options?: { linkColor?: (link: L) => string | undefined },
): ProjectedLinks {
  // Map hub → ordered (sourceIndex, originating-link). Capturing the
  // originating link lets us derive a per-projected-pair color downstream.
  const entriesByHub = new Map<string, Array<{ idx: number; link: L }>>();
  for (const link of topologyLinks) {
    const idx = nodeIndexById.get(link.source) ?? -1;
    if (idx < 0) continue;
    const list = entriesByHub.get(link.target) ?? [];
    list.push({ idx, link });
    entriesByHub.set(link.target, list);
  }

  const seen = new Set<string>();
  const sources: number[] = [];
  const targets: number[] = [];
  const wantColors = !!options?.linkColor;
  const colors: string[] = [];
  const fallbackColor = "#9CA3AF"; // matches buildLinkColorBuffer default
  for (const entries of entriesByHub.values()) {
    // De-dupe by sourceIndex while keeping the originating link reference.
    const seenIdx = new Set<number>();
    const ordered: Array<{ idx: number; link: L }> = [];
    for (const e of entries) {
      if (seenIdx.has(e.idx)) continue;
      seenIdx.add(e.idx);
      ordered.push(e);
    }
    ordered.sort((a, b) => a.idx - b.idx);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1];
      const b = ordered[i];
      const key = `${a.idx}:${b.idx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(a.idx);
      targets.push(b.idx);
      if (wantColors) {
        // Use the link feeding the "right" endpoint of this projected pair so
        // adjacent chain links can carry different colors (e.g. mixed permTiers
        // around the same hub).
        const c = options?.linkColor?.(b.link) ?? options?.linkColor?.(a.link) ?? fallbackColor;
        colors.push(c);
      }
    }
  }

  const out: ProjectedLinks = {
    sources: new Int32Array(sources),
    targets: new Int32Array(targets),
  };
  if (wantColors) out.colors = colors;
  return out;
}

/**
 * Test whether a 2D point (px, py) lies inside a polygon defined as a flat
 * Float32Array `[x0, y0, x1, y1, ...]`. Closure is implied — the algorithm
 * wraps the last vertex back to the first.
 *
 * Implementation: classic ray-casting (Jordan curve theorem). Cast a horizontal
 * ray from the point to +∞ and count how many polygon edges it crosses; an odd
 * count means the point is inside.
 *
 * Properties:
 * - Pure (no DOM, no module state, deterministic).
 * - Returns `false` for degenerate polygons (< 3 vertices, < 6 floats).
 * - Winding-direction independent — clockwise and counter-clockwise polygons
 *   yield the same containment result.
 * - Edge/vertex behavior is consistent (the strict `<` comparison classifies
 *   the upper endpoint of each edge as "outside") — used by 02-04 lasso so
 *   borderline points just outside the trace are not selected.
 *
 * O(n) per test where n = vertex count. For >5k nodes a quadtree spatial
 * index would be a future optimization; current ACC hub (~2k visible) is well
 * within the acceptable budget for a one-shot per-pointerup polygon close.
 */
export function pointInPolygon(
  px: number,
  py: number,
  poly: Float32Array,
): boolean {
  const len = poly.length;
  if (len < 6) return false; // need at least 3 vertices (6 floats)
  const n = len >> 1; // vertex count (integer divide by 2)
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    // Edge straddles the horizontal ray from (px, py) →
    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

