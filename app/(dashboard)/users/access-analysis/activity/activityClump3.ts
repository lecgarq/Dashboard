/**
 * activityClump3.ts — 3D group-by morph targets for the activity universe.
 *
 * Pulls each point toward its category centroid, keeping a fraction of its
 * offset so clusters stay organic clouds instead of collapsing into dots.
 * The 3D view uploads these once per group-by change as a vertex attribute;
 * the strength slider only moves a GPU mix uniform. Pure — no React/DOM/IO.
 */

/** How far a point travels toward its category centroid at full strength. */
export const CLUMP_PULL = 0.78;

/** No categories (or misaligned input) → targets = base (mix becomes a no-op). */
export function buildClumpTargets(
  base3: Float32Array,
  catIds: Uint16Array | null,
): Float32Array {
  if (!catIds || catIds.length * 3 !== base3.length) return base3;
  let maxCat = 0;
  for (let i = 0; i < catIds.length; i++) if (catIds[i] > maxCat) maxCat = catIds[i];
  const sums = new Float64Array((maxCat + 1) * 3);
  const counts = new Uint32Array(maxCat + 1);
  for (let i = 0; i < catIds.length; i++) {
    const c = catIds[i];
    sums[c * 3] += base3[i * 3];
    sums[c * 3 + 1] += base3[i * 3 + 1];
    sums[c * 3 + 2] += base3[i * 3 + 2];
    counts[c] += 1;
  }
  const out = new Float32Array(base3.length);
  for (let i = 0; i < catIds.length; i++) {
    const c = catIds[i];
    const cnt = counts[c] || 1;
    for (let k = 0; k < 3; k++) {
      const centroid = sums[c * 3 + k] / cnt;
      const p = base3[i * 3 + k];
      out[i * 3 + k] = p + (centroid - p) * CLUMP_PULL;
    }
  }
  return out;
}
