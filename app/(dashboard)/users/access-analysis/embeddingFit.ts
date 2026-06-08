/**
 * embeddingFit.ts — Pure geometry helper for scale-normalizing the grouped-clump
 * layout onto the embedding scatter's footprint, so the cloud never rescales during
 * the Group-by morph (the coordinate-scale risk). No React/DOM/IO.
 */

export interface BBox2 {
  minX: number; minY: number; maxX: number; maxY: number;
  cx: number; cy: number;
  /** Larger of the two half-spans → the half-side of the bounding SQUARE. */
  halfExtent: number;
}

/** Bounding box of a stride-2 [x0,y0,x1,y1,...] buffer. */
export function computeBBoxStride2(xy: Float32Array): BBox2 {
  if (xy.length < 2) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0, halfExtent: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const n = xy.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfExtent = Math.max((maxX - minX) / 2, (maxY - minY) / 2);
  return { minX, minY, maxX, maxY, cx, cy, halfExtent };
}
