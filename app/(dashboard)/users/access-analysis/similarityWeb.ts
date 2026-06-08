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
