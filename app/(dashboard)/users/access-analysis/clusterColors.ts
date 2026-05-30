/**
 * clusterColors.ts — Pure cluster-id → RGBA buffer. While a dimension is grouping,
 * node color is derived from cluster id (one hue per blob), so color and cluster
 * cannot disagree. Curated palette for small counts; an evenly-spread interpolator
 * beyond palette size (better separation than the legacy FNV hash→hue).
 */
import { schemeTableau10 } from "d3-scale-chromatic";
import { interpolateSinebow } from "d3-scale-chromatic";

const GREY: [number, number, number] = [0.5, 0.5, 0.5];

/** "#rrggbb" → [r,g,b] in [0,1]. */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** "rgb(r, g, b)" (d3 interpolator output) → [r,g,b] in [0,1]. */
function rgbStrTo01(s: string): [number, number, number] {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return GREY;
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}

/** Deterministic color for a cluster index given the total cluster count. */
export function colorForCluster(idx: number, clusterCount: number): [number, number, number] {
  if (idx < 0) return GREY;
  if (clusterCount <= schemeTableau10.length) return hexToRgb01(schemeTableau10[idx % schemeTableau10.length]);
  return rgbStrTo01(interpolateSinebow((idx + 0.5) / clusterCount));
}

/** RGBA Float32Array(n*4), alpha=1, colored by cluster id. */
export function clusterColorBuffer(clusterIds: Int32Array | ReadonlyArray<number>, clusterCount: number): Float32Array {
  const n = clusterIds.length;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = colorForCluster(clusterIds[i], clusterCount);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 1;
  }
  return out;
}
