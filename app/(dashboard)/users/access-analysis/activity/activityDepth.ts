/**
 * activityDepth.ts — experimental 3D view depth axis.
 *
 * The 3D universe keeps the precomputed 2D embedding as x/y and derives z from
 * event time: month 0 sits at -span/2, the latest month at +span/2. A
 * space-time cube — the third axis is honest chronology, not a fake extrusion.
 * Pure — no React/DOM/IO.
 */

/** Per-point z for the sampled set: monthId (already gathered) → centered time axis. */
export function buildActivityDepth(
  sampledMonthIds: Uint16Array,
  monthCount: number,
  span: number,
): Float32Array {
  const z = new Float32Array(sampledMonthIds.length);
  if (monthCount <= 1 || span <= 0) return z;
  const denom = monthCount - 1;
  for (let i = 0; i < sampledMonthIds.length; i++) {
    const m = Math.min(sampledMonthIds[i], denom);
    z[i] = (m / denom - 0.5) * span;
  }
  return z;
}
