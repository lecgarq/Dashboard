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
  candidates?: Uint32Array,
): Uint32Array | null {
  const total = candidates?.length ?? positions.length / 2;
  // First pass counts so we allocate once and can bail early past the cap.
  let count = 0;
  for (let i = 0; i < total; i++) {
    const full = candidates?.[i] ?? i;
    const x = positions[full * 2];
    const y = positions[full * 2 + 1];
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      count += 1;
      if (count > cap) return null;
    }
  }
  const out = new Uint32Array(count);
  let j = 0;
  for (let i = 0; i < total; i++) {
    const full = candidates?.[i] ?? i;
    const x = positions[full * 2];
    const y = positions[full * 2 + 1];
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      out[j++] = full;
    }
  }
  return out;
}

/** Gather per-node values at the given stride (positions 2, RGBA 4, scalars 1) for full-set indices. */
export function gather(values: Float32Array, indices: Uint32Array, stride: number): Float32Array {
  const out = new Float32Array(indices.length * stride);
  for (let i = 0; i < indices.length; i++) {
    const s = indices[i] * stride;
    const d = i * stride;
    for (let k = 0; k < stride; k++) out[d + k] = values[s + k];
  }
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
