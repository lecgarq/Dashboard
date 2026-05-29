/**
 * clusterPacking.ts — Deterministic, non-overlapping blob layout for the 2D
 * dominant-attribute cluster view. Pure: the only import is d3-hierarchy's
 * geometric circle-packing (no React/DOM/IO, no random, no clock).
 *
 * Separation is STRUCTURAL: footprints are circle-packed so they cannot overlap,
 * and members are placed on a sunflower whose radius never exceeds the footprint.
 * The slider's tightness only varies fill INSIDE the fixed footprint, so it can
 * never break the non-overlap invariant.
 */

/** Footprint fill radius as a fraction of the packed footprint, by tightness 0..1. */
const FILL_LOOSE = 1.0;
const FILL_TIGHT = 0.45;

/** Tightness (0..1) → fill fraction. Low = fills footprint; high = tight core. */
export function fillFactor(tightness: number): number {
  const t = Math.min(1, Math.max(0, tightness));
  return FILL_LOOSE + (FILL_TIGHT - FILL_LOOSE) * t;
}
