/**
 * lodSample.ts — v2.7 Phase 39 (ACT-01, owner decision 4).
 *
 * Rung-L2 level-of-detail over the resident activity set. Pure — no React/
 * DOM/IO. Far zoom renders a DETERMINISTIC uniform sample (stride on row
 * index — stable across sessions, statistically density-preserving); zooming
 * in flips to exact viewport membership when the visible region fits the cap.
 * Every rendered-subset builder returns the renderedIndex → fullIndex mapping
 * so hover/click/lasso resolve honestly against the full corpus.
 */

export const LOD_CAP = 500_000;

export type LodMode = "sample" | "region";

/** Deterministic uniform sample: every `stride`-th row index. */
export function uniformSampleIndices(total: number, cap: number = LOD_CAP): Uint32Array {
  if (total <= 0) return new Uint32Array(0);
  const stride = Math.max(1, Math.ceil(total / cap));
  const n = Math.ceil(total / stride);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i * stride;
  return out;
}

export function sampleStride(total: number, cap: number = LOD_CAP): number {
  return Math.max(1, Math.ceil(total / cap));
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Exact indices of full-set points inside the viewport bounds, or null when
 * the region holds more than `cap` points (caller keeps the uniform sample —
 * the honest "zoom further for detail" state).
 */
export function viewportIndices(
  positions: Float32Array,
  bounds: ViewportBounds,
  cap: number = LOD_CAP,
): Uint32Array | null {
  const total = positions.length / 2;
  // First pass counts so we allocate once and can bail early past the cap.
  let count = 0;
  for (let i = 0; i < total; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      count += 1;
      if (count > cap) return null;
    }
  }
  const out = new Uint32Array(count);
  let j = 0;
  for (let i = 0; i < total; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      out[j++] = i;
    }
  }
  return out;
}

/** Gather stride-2 positions for the given full-set indices. */
export function gatherPositions(positions: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(indices.length * 2);
  for (let i = 0; i < indices.length; i++) {
    out[i * 2] = positions[indices[i] * 2];
    out[i * 2 + 1] = positions[indices[i] * 2 + 1];
  }
  return out;
}

/** Gather RGBA colors (n*4) for the given full-set indices. */
export function gatherRgba(colors: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const s = indices[i] * 4;
    const d = i * 4;
    out[d] = colors[s];
    out[d + 1] = colors[s + 1];
    out[d + 2] = colors[s + 2];
    out[d + 3] = colors[s + 3];
  }
  return out;
}

/** Gather scalar per-node values (sizes) for the given full-set indices. */
export function gatherScalar(values: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = values[indices[i]];
  return out;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

/** Muted honest LOD caption for the current mode. */
export function lodLabel(mode: LodMode, renderedCount: number, totalCount: number): string {
  if (mode === "sample") {
    return `rendering ~${fmt(renderedCount)} of ${fmt(totalCount)} — zoom for detail`;
  }
  return `full detail — ${fmt(renderedCount)} events in view`;
}
