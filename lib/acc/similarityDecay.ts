/**
 * Exponential decay for temporal similarity dimensions.
 *
 * sim(a, b) = exp( -|t_a - t_b| / tau )
 *
 * Same-day → 1.0. tau days apart → 1/e (~0.37). 3*tau apart → ~0.05.
 * Null timestamps contribute 0 (no signal).
 */

export const DEFAULT_DECAY_TAU_DAYS = 30;
const DAY_MS = 86_400_000;

export function temporalDecay(
  a: number | null,
  b: number | null,
  tauDays: number = DEFAULT_DECAY_TAU_DAYS,
): number {
  if (a == null || b == null) return 0;
  const dtDays = Math.abs(a - b) / DAY_MS;
  return Math.exp(-dtDays / tauDays);
}
