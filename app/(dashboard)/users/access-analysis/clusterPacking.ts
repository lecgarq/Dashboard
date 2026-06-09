/**
 * clusterPacking.ts — Deterministic, non-overlapping blob layout for the 2D
 * dominant-attribute cluster view. Pure: the only import is d3-hierarchy's
 * geometric circle-packing (no React/DOM/IO, no random, no clock).
 *
 * Footprints are circle-packed so their CENTERS stay separated. Members are placed
 * on a sunflower around each footprint center; the slider (cluster strength) scales
 * the sunflower radius from loose (spills past the footprint, blobs blend) at low
 * strength to a tight dense core at high strength — see fillFactor.
 */

import { packSiblings, packEnclose } from "d3-hierarchy";

// The slider is CLUSTER STRENGTH. Member spread = footprint.r * fillFactor(strength).
// Members NEVER spill past their footprint — footprints are non-overlapping, so a
// fill of <=1 GUARANTEES blobs never overlap ("very clear clusters", no cluster-in-
// a-cluster). At low strength members fill the footprint (a full, clean blob); at
// high strength they pack into a tight dense core. The ramp is GEOMETRIC (perceptual)
// and front-loaded so the change reads across the whole 1..100 range.
const FILL_LOOSE = 0.95; // strength→0: members fill (just inside) the footprint — clean, never spilling
const FILL_TIGHT = 0.22; // strength→1: tight dense core, well inside the footprint
const RAMP_EXP = 0.7; // <1 front-loads the change so low strengths read distinctly looser

/** Cluster strength (0..1) → member-fill multiple of the footprint radius. */
export function fillFactor(tightness: number): number {
  const t = Math.min(1, Math.max(0, tightness));
  // Geometric interpolation FILL_LOOSE → FILL_TIGHT on a front-loaded curve.
  return FILL_LOOSE * Math.pow(FILL_TIGHT / FILL_LOOSE, Math.pow(t, RAMP_EXP));
}

/**
 * Morph loose-endpoint tightness (slider = 0). 0 → fillFactor 0.95 = members fill
 * their footprint (clean, organic, just-touching blobs). Visual-UAT tunable: a value
 * >0 starts the load already tighter. (Going beyond the loosest fill — overlapping/
 * blended blobs — would require relaxing the fill<=1 non-overlap clamp; out of scope.)
 */
export const LOOSE_TIGHTNESS = 0;

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

/** Footprint radius for a cluster of `count` members (clamped). Shared by the
 *  deterministic packer and the organic force layout so both size blobs identically. */
export function footprintRadius(count: number): number {
  return clamp(BASE * Math.sqrt(Math.max(0, count)), R_MIN, R_MAX);
}

export function packClusterFootprints(counts: ReadonlyArray<number>): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };

  const padded = counts.map((c) => footprintRadius(c) * (1 + GAP));

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

/**
 * Per-cluster centroid (stride-1 parallel arrays) of stride-2 member `positions`,
 * grouped by `clusterIds` (id < 0 = unclustered, ignored). A cluster with no members
 * falls back to its footprint center so a label anchored to it never collapses to the
 * origin. Centroid is linear, so for a morph that lerps each member loose→packed, the
 * centroid of the lerped cloud equals the lerp of these endpoint centroids — letting a
 * label ride its cluster by lerping restCentroid → footprintCenter on the same slider.
 */
export function clusterMemberCentroids(
  clusterIds: Int32Array | ReadonlyArray<number>,
  positions: Float32Array,
  footprints: ClusterFootprints,
): { cx: Float32Array; cy: Float32Array } {
  const k = footprints.r.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const cnt = new Int32Array(k);
  const n = positions.length / 2;
  for (let i = 0; i < n; i++) {
    const c = clusterIds[i];
    if (c < 0 || c >= k) continue;
    cx[c] += positions[i * 2];
    cy[c] += positions[i * 2 + 1];
    cnt[c] += 1;
  }
  for (let c = 0; c < k; c++) {
    if (cnt[c] > 0) {
      cx[c] /= cnt[c];
      cy[c] /= cnt[c];
    } else {
      cx[c] = footprints.cx[c];
      cy[c] = footprints.cy[c];
    }
  }
  return { cx, cy };
}

/** Golden angle — even Vogel sunflower spacing. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Per-node 2D position (stride-2) on a sunflower around its cluster's footprint
 * center. Fill radius = footprint.r * fillFactor(tightness): at high strength a tight
 * core (well inside the footprint), at low strength a loose spill past it. Node ids
 * < 0 (unclustered) collapse to the origin.
 */
export function packMemberPositions(
  clusterIds: Int32Array | ReadonlyArray<number>,
  footprints: ClusterFootprints,
  tightness: number,
  nodeCount: number,
): Float32Array {
  const out = new Float32Array(nodeCount * 2);
  const fill = fillFactor(tightness);
  const k = footprints.r.length;
  const seen = new Int32Array(k);
  const total = new Int32Array(k);
  for (let n = 0; n < nodeCount; n++) {
    const c = clusterIds[n];
    if (c >= 0 && c < k) total[c] += 1;
  }
  for (let n = 0; n < nodeCount; n++) {
    const c = clusterIds[n];
    if (c < 0 || c >= k) continue; // leave at origin
    const j = seen[c]++;
    const m = total[c];
    const rFill = footprints.r[c] * fill;
    const rr = m <= 1 ? 0 : rFill * Math.sqrt((j + 0.5) / m);
    const th = j * GOLDEN_ANGLE;
    out[n * 2] = footprints.cx[c] + Math.cos(th) * rr;
    out[n * 2 + 1] = footprints.cy[c] + Math.sin(th) * rr;
  }
  return out;
}
