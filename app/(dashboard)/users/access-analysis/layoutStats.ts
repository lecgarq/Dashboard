/**
 * layoutStats.ts — Pure layout-health metrics for the Access Analysis graph.
 *
 * No React, no DOM, no I/O. Consumed by the test bridge (graphTestBridge) so e2e
 * can assert the rendered layout is volumetric and structurally clustered — NOT a
 * collapsed point or a featureless sphere.
 *
 * `computeClusteringRatio` uses deterministic sampling (a fixed-seed LCG) so the
 * same positions + categories always yield the same score — required for stable
 * assertions at ~17k nodes where full O(n²) pairwise scoring is infeasible.
 */

// ---------------------------------------------------------------------------
// Axis ranges
// ---------------------------------------------------------------------------

export interface AxisRanges {
  nodeCount: number;
  xRange: number;
  yRange: number;
  zRange: number;
  anyNaN: boolean;
}

/** Per-axis (max-min) spread of a stride-3 [x,y,z,...] position buffer. */
export function computeAxisRanges(xyz: Float32Array): AxisRanges {
  const n = Math.floor(xyz.length / 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let anyNaN = false;
  let finiteCount = 0;
  for (let i = 0; i < n; i++) {
    const x = xyz[i * 3];
    const y = xyz[i * 3 + 1];
    const z = xyz[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      anyNaN = true;
      continue;
    }
    finiteCount++;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (finiteCount === 0) {
    return { nodeCount: n, xRange: 0, yRange: 0, zRange: 0, anyNaN };
  }
  return {
    nodeCount: n,
    xRange: maxX - minX,
    yRange: maxY - minY,
    zRange: maxZ - minZ,
    anyNaN,
  };
}

// ---------------------------------------------------------------------------
// Clustering ratio
// ---------------------------------------------------------------------------

export interface ClusteringScore {
  /** crossMean / sameMean. >1 ⇒ same-category nodes are closer (clustered). */
  ratio: number;
  /** Mean 3D distance between sampled same-category node pairs. */
  sameMean: number;
  /** Mean 3D distance between sampled different-category node pairs. */
  crossMean: number;
  /** Number of (same + cross) pairs sampled. */
  sampledPairs: number;
}

export interface ClusteringOptions {
  /** Max query nodes to sample (strided across the set). Default 200. */
  sampleNodes?: number;
  /** Partners sampled per query node, for each of same/cross. Default 6. */
  partnersPerNode?: number;
}

/** Deterministic 32-bit LCG (Numerical Recipes constants). */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function dist3(xyz: Float32Array, a: number, b: number): number {
  const dx = xyz[a * 3] - xyz[b * 3];
  const dy = xyz[a * 3 + 1] - xyz[b * 3 + 1];
  const dz = xyz[a * 3 + 2] - xyz[b * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Same-vs-cross category clustering ratio using deterministic sampling.
 *
 * Returns ratio = 1 (no measurable separation) when there is only one category
 * or insufficient pairs to sample. Never returns NaN/Infinity.
 */
export function computeClusteringRatio(
  xyz: Float32Array,
  categories: readonly string[],
  opts: ClusteringOptions = {},
): ClusteringScore {
  const n = Math.min(Math.floor(xyz.length / 3), categories.length);
  const sampleNodes = Math.max(1, Math.min(opts.sampleNodes ?? 200, n));
  const partners = Math.max(1, opts.partnersPerNode ?? 6);
  const NONE: ClusteringScore = { ratio: 1, sameMean: 0, crossMean: 0, sampledPairs: 0 };
  if (n < 2) return NONE;

  // Group node indices by category.
  const byCat = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const c = categories[i];
    const list = byCat.get(c);
    if (list) list.push(i);
    else byCat.set(c, [i]);
  }
  if (byCat.size < 2) return NONE; // single category → no cross pairs

  const rand = makeLcg(0x9e3779b1);
  const stride = Math.max(1, Math.floor(n / sampleNodes));

  let sameSum = 0;
  let sameCount = 0;
  let crossSum = 0;
  let crossCount = 0;

  for (let q = 0; q < n; q += stride) {
    const cat = categories[q];
    const sameList = byCat.get(cat)!;
    // Same-category partners (skip self).
    if (sameList.length > 1) {
      for (let p = 0; p < partners; p++) {
        const idx = sameList[rand() % sameList.length];
        if (idx === q) continue;
        sameSum += dist3(xyz, q, idx);
        sameCount++;
      }
    }
    // Cross-category partners: pick a random node, accept if different category.
    for (let p = 0; p < partners; p++) {
      const idx = rand() % n;
      if (categories[idx] === cat) continue;
      crossSum += dist3(xyz, q, idx);
      crossCount++;
    }
  }

  if (sameCount === 0 || crossCount === 0) return NONE;
  const sameMean = sameSum / sameCount;
  const crossMean = crossSum / crossCount;
  // Guard: if same-category nodes are exactly coincident, report a large finite ratio.
  const ratio = sameMean === 0 ? (crossMean > 0 ? 1e6 : 1) : crossMean / sameMean;
  return { ratio, sameMean, crossMean, sampledPairs: sameCount + crossCount };
}
