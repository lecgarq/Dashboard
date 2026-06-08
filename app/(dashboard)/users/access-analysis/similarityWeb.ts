/**
 * similarityWeb.ts — PURE client model for the Force-Atlas similarity web.
 *
 * REND-04 purity: no React, no DOM, no data/math-layer imports. Turns the
 * server's nodeId edge set into index buffers, community×strength colors, and the
 * projection/curve geometry the Canvas2D overlay draws. Fully unit-testable.
 */

export interface SimEdgeIds {
  a: string;
  b: string;
  score: number;
}

export interface IndexedWeb {
  /** Source cosmos index per edge. */
  src: Int32Array;
  /** Target cosmos index per edge. */
  dst: Int32Array;
  /** Per-edge similarity strength, min-max normalized to [0,1]. */
  strength: Float32Array;
  /** How many input edges were dropped (unknown endpoint or self-edge). */
  dropped: number;
}

export function mapEdgesToIndices(
  edges: readonly SimEdgeIds[],
  indexByNodeId: ReadonlyMap<string, number>,
): IndexedWeb {
  const src: number[] = [];
  const dst: number[] = [];
  const raw: number[] = [];
  let dropped = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const e of edges) {
    const ia = indexByNodeId.get(e.a);
    const ib = indexByNodeId.get(e.b);
    if (ia === undefined || ib === undefined || ia === ib) {
      dropped++;
      continue;
    }
    src.push(ia);
    dst.push(ib);
    raw.push(e.score);
    if (e.score < min) min = e.score;
    if (e.score > max) max = e.score;
  }

  const n = src.length;
  const strength = new Float32Array(n);
  const span = max - min;
  for (let i = 0; i < n; i++) {
    strength[i] = span > 1e-9 ? (raw[i] - min) / span : 1;
  }

  return { src: Int32Array.from(src), dst: Int32Array.from(dst), strength, dropped };
}

export interface EdgePaint {
  /** Per-edge palette index (Uint16: distinct community-blend × alpha combos). */
  bucket: Uint16Array;
  /** Flat RGBA palette (length = bucketCount * 4), values in [0,1]. */
  palette: Float32Array;
}

/** Faint base-alpha ceiling per theme — keeps the web gossamer, never solid. */
function baseAlpha(theme: "light" | "dark"): number {
  return theme === "dark" ? 0.16 : 0.12;
}

/**
 * Per-edge color = blend of the two endpoints' community colors (so within-cluster
 * edges take the cluster hue), with alpha scaled by similarity strength. Colors are
 * quantized so identical edges share one palette bucket → the overlay batch-strokes
 * one Path2D per bucket.
 */
export function computeEdgeColors(
  web: IndexedWeb,
  nodeColors: Float32Array,
  theme: "light" | "dark",
): EdgePaint {
  const n = web.src.length;
  const bucket = new Uint16Array(n);
  const a0 = baseAlpha(theme);
  const keyToBucket = new Map<number, number>();
  const palette: number[] = [];

  for (let i = 0; i < n; i++) {
    const s = web.src[i] * 4;
    const d = web.dst[i] * 4;
    let r = (nodeColors[s] + nodeColors[d]) * 0.5;
    let g = (nodeColors[s + 1] + nodeColors[d + 1]) * 0.5;
    let b = (nodeColors[s + 2] + nodeColors[d + 2]) * 0.5;
    // On light backgrounds, darken the tint a touch so faint threads read on white.
    if (theme === "light") {
      r *= 0.85;
      g *= 0.85;
      b *= 0.85;
    }
    // Alpha rises with similarity strength: weak ~0.35 of ceiling, strong = ceiling.
    const aFrac = 0.35 + 0.65 * web.strength[i];

    // Quantize: 5-bit RGB + 3-bit alpha. Safe for up to ~127 distinct community hues
    // (cosmos.gl caps at ~12, giving <=624 buckets — well within Uint16).
    const rq = Math.min(31, Math.round(r * 31));
    const gq = Math.min(31, Math.round(g * 31));
    const bq = Math.min(31, Math.round(b * 31));
    const aq = Math.min(7, Math.round(aFrac * 7));
    const key = ((rq * 32 + gq) * 32 + bq) * 8 + aq;

    let bi = keyToBucket.get(key);
    if (bi === undefined) {
      bi = palette.length / 4;
      keyToBucket.set(key, bi);
      palette.push(rq / 31, gq / 31, bq / 31, a0 * (aq / 7));
    }
    bucket[i] = bi;
  }

  return { bucket, palette: Float32Array.from(palette) };
}

export interface Affine {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/**
 * Recover the space→screen affine from the renderer's `spaceToScreen` by probing
 * three reference points. cosmos.gl 2D is pan+zoom only (axis-aligned, no rotation/
 * skew), so a scale+translate is exact — and one solve per redraw replaces N
 * per-node spaceToScreen calls (the hot-loop optimization).
 */
export function solveAffine(
  spaceToScreen: (p: [number, number]) => [number, number],
): Affine {
  const A = spaceToScreen([0, 0]);
  const B = spaceToScreen([1000, 0]);
  const C = spaceToScreen([0, 1000]);
  return {
    sx: (B[0] - A[0]) / 1000,
    sy: (C[1] - A[1]) / 1000,
    ox: A[0],
    oy: A[1],
  };
}

export function project(aff: Affine, x: number, y: number): [number, number] {
  return [x * aff.sx + aff.ox, y * aff.sy + aff.oy];
}

/**
 * Control point for a gentle, uniformly-signed bow: the segment midpoint offset
 * along the perpendicular by `k * |segment-as-vector|` (here `k` multiplies the raw
 * delta, giving a curve proportional to segment length). Consistent sign → all arcs
 * bow the same way, reading as flow rather than noise.
 */
export function quadControl(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  k: number,
): [number, number] {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  return [mx - dy * k, my + dx * k];
}

/** Ease `cur` toward `target` by `rate`; snap when within epsilon. */
export function stepOpacity(cur: number, target: number, rate: number): number {
  const next = cur + (target - cur) * rate;
  return Math.abs(target - next) < 0.005 ? target : next;
}
