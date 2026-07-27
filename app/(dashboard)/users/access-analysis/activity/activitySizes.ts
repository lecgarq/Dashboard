/**
 * activitySizes.ts — v2.7 Phase 39 (ACT-01).
 *
 * Per-node world-unit radius from real event data: a subtle recency ramp on
 * monthId (months since the corpus floor). Recent events read slightly larger;
 * the range stays tight so density — not size — carries the far-zoom picture.
 * Pure — no React/DOM/IO.
 */

const MIN_R = 1.5;
const MAX_R = 3.5;

/** Float32Array(n) of radii in [MIN_R, MAX_R], linear in monthId/(monthCount-1). */
export function buildActivitySizes(monthId: Uint16Array, monthCount: number): Float32Array {
  const out = new Float32Array(monthId.length);
  const denom = Math.max(1, monthCount - 1);
  for (let i = 0; i < monthId.length; i++) {
    const t = Math.min(1, monthId[i] / denom);
    out[i] = MIN_R + (MAX_R - MIN_R) * t;
  }
  return out;
}
