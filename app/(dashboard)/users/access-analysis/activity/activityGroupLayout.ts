/**
 * activityGroupLayout.ts — v2.7 Phase 40 (DIM-07, owner decision 4).
 *
 * Organic group-by layout over the rendered activity subset: EVERY category
 * gets its own centroid (957 project blobs read as an archipelago — no "Other"
 * position-bucketing), placed on a size-aware golden-angle spiral with seeded
 * per-category jitter so the field never reads as a grid or rings. Per-node
 * targets preserve each category's organic rest texture: the node's offset
 * from its category's rest centroid is RMS-normalized into the category's
 * footprint, so a clump is a shrunken constellation, not a point-pile.
 *
 * Deterministic (seeded hash jitter, no Math.random) and pure — no React/DOM/
 * IO. Outputs are MapClusterLabels-shaped (centers, restCenters, radii,
 * counts) so the label overlay mounts without adaptation.
 */

/** Golden angle (radians) — the phyllotaxis step that never stripes. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Established cosmos layout half-extent (PaCMAP normalization ≈ ±350). */
export const LAYOUT_RADIUS = 350;

/** Deterministic per-category hash → [0,1). (mulberry-style avalanche) */
function hash01(seed: number): number {
  let h = (seed + 0x6d2b79f5) | 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

export interface GroupLayout {
  /** Per-node stride-2 target positions, aligned to the input subset. */
  targets: Float32Array;
  /** Per-category clump centroids (stride-1 each, length = cardinality). */
  centersX: Float32Array;
  centersY: Float32Array;
  /** Per-category REST centroids (mean rest position of members). */
  restCentersX: Float32Array;
  restCentersY: Float32Array;
  /** Per-category footprint radius (cosmos space). */
  radii: Float32Array;
  /** Per-category member count over the subset. */
  counts: Uint32Array;
}

/**
 * Organic centroid placement for K categories: categories sorted by count
 * descending walk out a golden-angle spiral whose radial coordinate tracks
 * CUMULATIVE membership (big categories claim proportionally wide bands near
 * the center), plus seeded jitter in angle and radius. Empty categories still
 * get positions (harmless — no members target them).
 */
export function categoryCentroids(
  counts: ArrayLike<number>,
  spaceRadius: number = LAYOUT_RADIUS,
): { centersX: Float32Array; centersY: Float32Array; radii: Float32Array } {
  const k = counts.length;
  const centersX = new Float32Array(k);
  const centersY = new Float32Array(k);
  const radii = new Float32Array(k);
  let total = 0;
  for (let c = 0; c < k; c++) total += counts[c];
  const order = Array.from({ length: k }, (_, c) => c).sort(
    (a, b) => counts[b] - counts[a] || a - b,
  );
  let cumBefore = 0;
  for (let rank = 0; rank < k; rank++) {
    const c = order[rank];
    const n = counts[c];
    const share = total > 0 ? n / total : 0;
    // Radial band center from cumulative share; jitter keeps rings organic.
    const frac = total > 0 ? (cumBefore + n / 2) / total : (rank + 0.5) / k;
    const rJitter = (hash01(c * 2 + 1) - 0.5) * 0.18;
    // Reflect overflow instead of clamping: a hard min(1, …) piles every
    // overflowing tail category onto the exact r = spaceRadius rim, where
    // near-Fibonacci rank pairs land sub-pixel apart. Reflection keeps each
    // category's jittered radius distinct.
    let f = frac + rJitter;
    if (f > 1) f = 2 - f;
    if (f < 0) f = -f;
    const r = spaceRadius * Math.sqrt(Math.min(1, f));
    const angle = rank * GOLDEN_ANGLE + (hash01(c * 2) - 0.5) * 0.9;
    centersX[c] = r * Math.cos(angle);
    centersY[c] = r * Math.sin(angle);
    // Footprint ~ sqrt(share) of the space, floored so tiny blobs stay visible.
    radii[c] = Math.max(spaceRadius * 0.012, spaceRadius * Math.sqrt(share) * 0.55);
    cumBefore += n;
  }
  return { centersX, centersY, radii };
}

/**
 * Full group layout for one dimension over the rendered subset.
 *
 * @param rest2  stride-2 rest positions (the PaCMAP layout of the subset)
 * @param catIds per-node category id, aligned to rest2 (gathered subset values)
 * @param cardinality dimension category count (dict length)
 */
export function buildGroupLayout(
  rest2: Float32Array,
  catIds: ArrayLike<number>,
  cardinality: number,
  spaceRadius: number = LAYOUT_RADIUS,
): GroupLayout {
  const n = catIds.length;
  const k = Math.max(1, cardinality);
  const counts = new Uint32Array(k);
  const restCentersX = new Float32Array(k);
  const restCentersY = new Float32Array(k);
  for (let i = 0; i < n; i++) {
    const c = catIds[i] < k ? catIds[i] : 0;
    counts[c] += 1;
    restCentersX[c] += rest2[i * 2];
    restCentersY[c] += rest2[i * 2 + 1];
  }
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      restCentersX[c] /= counts[c];
      restCentersY[c] /= counts[c];
    }
  }
  // Per-category RMS spread of rest offsets — the texture normalizer.
  const rms = new Float32Array(k);
  for (let i = 0; i < n; i++) {
    const c = catIds[i] < k ? catIds[i] : 0;
    const dx = rest2[i * 2] - restCentersX[c];
    const dy = rest2[i * 2 + 1] - restCentersY[c];
    rms[c] += dx * dx + dy * dy;
  }
  for (let c = 0; c < k; c++) {
    rms[c] = counts[c] > 0 ? Math.sqrt(rms[c] / counts[c]) : 0;
  }

  const { centersX, centersY, radii } = categoryCentroids(counts, spaceRadius);

  const targets = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const c = catIds[i] < k ? catIds[i] : 0;
    // Scale the node's rest offset so the category's RMS spread maps to ~60%
    // of its footprint radius (most members inside, organic tails allowed).
    const s = rms[c] > 1e-6 ? (radii[c] * 0.6) / rms[c] : 0;
    targets[i * 2] = centersX[c] + (rest2[i * 2] - restCentersX[c]) * s;
    targets[i * 2 + 1] = centersY[c] + (rest2[i * 2 + 1] - restCentersY[c]) * s;
  }
  return { targets, centersX, centersY, restCentersX, restCentersY, radii, counts };
}

/**
 * Strength blend: out = rest*(1-s) + clump*s into a caller-owned buffer
 * (reused across drags — zero per-call allocation).
 */
export function mixPositions(
  out: Float32Array,
  rest2: Float32Array,
  targets2: Float32Array,
  s: number,
): Float32Array {
  const t = Math.max(0, Math.min(1, s));
  for (let i = 0; i < rest2.length; i++) {
    out[i] = rest2[i] + (targets2[i] - rest2[i]) * t;
  }
  return out;
}
