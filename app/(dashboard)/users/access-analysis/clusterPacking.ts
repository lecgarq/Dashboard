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

import { packSiblings, packEnclose } from "d3-hierarchy";

/** Footprint fill radius as a fraction of the packed footprint, by tightness 0..1. */
const FILL_LOOSE = 1.0;
const FILL_TIGHT = 0.45;

/** Tightness (0..1) → fill fraction. Low = fills footprint; high = tight core. */
export function fillFactor(tightness: number): number {
  const t = Math.min(1, Math.max(0, tightness));
  return FILL_LOOSE + (FILL_TIGHT - FILL_LOOSE) * t;
}

/** Per-cluster footprint: center (cosmos space) + radius. Stride-1 parallel arrays. */
export interface ClusterFootprints {
  cx: Float32Array;
  cy: Float32Array;
  r: Float32Array;
}

/** Base radius scale (pre-fit); BASE * sqrt(count). Absolute value is irrelevant
 *  because the packed layout is uniformly scaled to TARGET_EXTENT afterward — only
 *  the RATIO between cluster radii matters here. */
const BASE = 6;
/** Min/max footprint radius (relative units) so a 1-member blob is still visible
 *  and a giant blob does not dominate the ratio absurdly. */
const R_MIN = 8;
const R_MAX = 600;
/** Gap added around each footprint before packing so neighbors never touch. */
const GAP = 0.18;
/** Final layout is scaled so the enclosing circle radius equals this (matches the
 *  prior DISC_RADIUS so camera framing is unchanged). */
const TARGET_EXTENT = 1700;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function packClusterFootprints(counts: ReadonlyArray<number>): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };

  const padded = counts.map((c) => clamp(BASE * Math.sqrt(Math.max(0, c)), R_MIN, R_MAX) * (1 + GAP));

  // Pack big-blobs-first so large footprints sit centrally; keep index mapping.
  const order = padded.map((_, i) => i).sort((a, b) => padded[b] - padded[a]);
  const circles = order.map((i) => ({ r: padded[i] })) as Array<{ r: number; x?: number; y?: number }>;
  packSiblings(circles);

  const enclose = packEnclose(circles as Array<{ r: number; x: number; y: number }>);
  const ex = enclose?.x ?? 0;
  const ey = enclose?.y ?? 0;
  const encR = enclose?.r ?? padded[order[0]];

  const scale = encR > 0 ? TARGET_EXTENT / encR : 1;

  for (let oi = 0; oi < k; oi++) {
    const i = order[oi];
    const c = circles[oi];
    cx[i] = ((c.x ?? 0) - ex) * scale;
    cy[i] = ((c.y ?? 0) - ey) * scale;
    r[i] = (padded[i] / (1 + GAP)) * scale;
  }
  return { cx, cy, r };
}
