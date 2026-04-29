"use client";

import type { GraphRenderNode } from "./graphRenderers";

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
    const [r, g, b] = hexToRGBNorm(nodes[i].color);
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
 * - separation: 0 = nodes pack tight, 100 = nodes fan out wide.
 *   - simulationRepulsion ∈ [0.1, 2.0]   (pow 1.4 — slight ease-in)
 *   - simulationLinkDistance ∈ [4, 40]   (pow 1.6 — stronger ease-in)
 *   - simulationLinkSpring ∈ [1.5, 0.5]  (loosens at high separation)
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
}

export function controlsToSimulationConfig(
  controls: SliderControls,
): SimulationConfigPartial {
  const sep = Math.max(0, Math.min(100, controls.spacing)) / 100;
  const cluster = Math.max(0, Math.min(100, controls.clusterStrength)) / 100;
  return {
    simulationRepulsion: 0.1 + Math.pow(sep, 1.4) * 1.9,        // 0.1..2.0
    simulationLinkDistance: 4 + Math.pow(sep, 1.6) * 36,        // 4..40
    simulationLinkSpring: 1.5 - Math.pow(sep, 1.3) * 1.0,       // 1.5..0.5
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
 * Build a Float32Array of per-link RGBA values for Cosmos setLinkColors().
 * Phase 2 scope: uniform gray for all edges (single edge type in current data).
 * Multi-type edge color variation per REND-03 is deferred to a future phase when
 * the data model supports multiple relationship types.
 */
export function buildLinkColorBuffer(linkCount: number): Float32Array {
  const buf = new Float32Array(linkCount * 4);
  // Subtle warm gray — #9CA3AF at 25% opacity for a halftone feel matching Canvas 2D
  const r = 0.612, g = 0.639, b = 0.686, a = 0.25;
  for (let i = 0; i < linkCount; i++) {
    buf[i * 4 + 0] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}
