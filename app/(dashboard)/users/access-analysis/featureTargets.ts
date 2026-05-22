/**
 * featureTargets.ts — Pure feature-anchored layout targets for the Access Analysis graph.
 *
 * No React, no DOM, no rendering, no I/O. Mirrors the purity discipline of
 * mathLayer.ts / physicsLayer.ts so it is trivially unit-testable.
 *
 * WHY THIS EXISTS
 * ===============
 * `AccessAnalysisShell` currently seeds the physics layer with all-zero targets
 * (`makeEmptyTargets`). With identical targets every per-dimension forceX/Y/Z aims
 * at the origin, so the only spreading force is many-body repulsion → a featureless
 * sphere/globe. This module produces *meaningful* per-dimension target positions so
 * nodes that share a categorical value (same role, same project, …) converge to a
 * shared anchor and form real clusters.
 *
 * ANCHOR DISTRIBUTION — VOLUMETRIC, NOT A RING
 * ============================================
 * Distinct category values for a dimension are placed using a **spherical Fibonacci
 * (sunflower-on-sphere) distribution** combined with a deterministic **layered
 * radius**, so anchors fill a 3D volume rather than lying on a flat XY ring or a
 * thin spherical shell. This gives the layout visible depth on all three axes — the
 * "organic neuronal network" target — instead of a disc/ring viewed in 3D. The z
 * component is structurally meaningful (derived from the same even angular sweep),
 * never random jitter.
 *
 * The anchoring concept is ported (not copied) from the donor blob layout in
 * `accGraphOrganicLayout.ts` (`computeBlobSeedPositions`); the donor anchors in 2D,
 * this module lifts the idea into 3D volume. Even, sorted assignment guarantees
 * deterministic output AND visible separation between categories regardless of how
 * the source strings happen to hash.
 *
 * NOTE: this module is additive and intentionally UNWIRED. P1 will replace
 * `makeEmptyTargets` in the shell with `buildFeatureTargets`.
 */

import type { TargetArrays } from "./physicsLayer";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getDimension, MULTI_HOT_DIMENSION_IDS, type DimensionId } from "./dimensionRegistry";

// ---------------------------------------------------------------------------
// Dimensions — mirror the SliderContext DIMENSIONS ids so P1 wiring is 1:1.
// ---------------------------------------------------------------------------

// Runtime layout dims are the registry runtime view — single source of truth.
export type TargetDimensionId = DimensionId;

export const TARGET_DIMENSIONS: readonly TargetDimensionId[] = [
  "project",
  "role",
  "tier",
  "internalExternal",
  "activity",
  "signin",
];

/**
 * Outer anchor radius. The absolute scale is irrelevant to the FINAL view — the
 * physics layer normalizes the settled spread into a fixed cube
 * (`LAYOUT_HALF_EXTENT`). What matters is the anchor separation RELATIVE to the
 * many-body repulsion cloud: anchors must sit far enough apart that same-category
 * nodes actually converge instead of being smeared across the repulsion-driven
 * spread. At radius 1 the repulsion cloud (~10³ units for ~10⁴ nodes) completely
 * swamps the anchors → no clustering (a globe). 16000 is empirically large enough
 * for same-category convergence to win (see physicsClustering.test.ts), while the
 * post-settle normalization keeps the rendered/edge coordinates bounded.
 */
const ANCHOR_RADIUS = 16000;

/** Golden angle (radians) — the spacing that makes a spherical Fibonacci set even. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996323

/** Fractional part of the golden ratio — drives deterministic radial layering. */
const INV_GOLDEN = 0.6180339887498949;

/** Innermost radial layer as a fraction of ANCHOR_RADIUS (fills volume, not a shell). */
const LAYER_MIN = 0.55;
/** Radial layer span (max layer = LAYER_MIN + LAYER_SPAN). */
const LAYER_SPAN = 0.45;

// ---------------------------------------------------------------------------
// Categorical extraction — maps a snapshot to the string value for a dimension.
// ---------------------------------------------------------------------------

/** The categorical value a node carries for the given target dimension. */
export function categoryValue(
  f: NodeFeatureSnapshot,
  dim: TargetDimensionId,
): string {
  const d = getDimension(dim);
  const v = d ? d.extract(f) : null;
  // Coerce the registry's DimensionValue (string | string[] | number | null) to a
  // stable categorical bucket string. Arrays/null map to a single neutral bucket so
  // single-category dims keep one anchor; multi-hot dims use computeMultiHotTarget.
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("|") : "(none)";
  return "(none)";
}

// ---------------------------------------------------------------------------
// Anchor computation
// ---------------------------------------------------------------------------

/**
 * Stable, sorted list of distinct category values for a dimension. Sorting makes
 * the anchor assignment independent of feature input order (determinism).
 */
function distinctSortedCategories(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: TargetDimensionId,
): string[] {
  const set = new Set<string>();
  for (const f of features) set.add(categoryValue(f, dim));
  return Array.from(set).sort();
}

/**
 * Volumetric anchor for the i-th of `count` categories.
 *
 * Direction: spherical Fibonacci (even coverage of the sphere of directions).
 * Magnitude: deterministic layered radius in [LAYER_MIN, LAYER_MIN+LAYER_SPAN]
 *            so anchors occupy a 3D volume rather than a single shell.
 */
function volumetricAnchor(
  i: number,
  count: number,
  radius: number,
): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  // Even latitude sweep in (-1, 1): structurally meaningful y (not jitter).
  const yUnit = 1 - (2 * (i + 0.5)) / count;
  const rxy = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
  const theta = GOLDEN_ANGLE * i;
  // Layered radius — value-stable, irrational step spreads layers without bias.
  const layer = LAYER_MIN + LAYER_SPAN * ((i * INV_GOLDEN) % 1);
  const r = radius * layer;
  return [
    Math.cos(theta) * rxy * r,
    yUnit * r,
    Math.sin(theta) * rxy * r,
  ];
}

/**
 * Compute stride-3 [x,y,z,...] target positions for ONE dimension.
 *
 * Distinct category values are placed on a volumetric spherical-Fibonacci set;
 * every node is placed at its category's anchor. Same category → identical anchor;
 * different categories → separated in 3D distance. Output length is
 * `features.length * 3`.
 */
export function computeDimensionTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: TargetDimensionId,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;

  const categories = distinctSortedCategories(features, dim);
  const count = categories.length;
  const indexOf = new Map<string, number>();
  for (let i = 0; i < count; i++) indexOf.set(categories[i], i);

  // Precompute one anchor per category (avoids recomputing trig per node).
  const anchors: Array<[number, number, number]> = new Array(count);
  for (let i = 0; i < count; i++) anchors[i] = volumetricAnchor(i, count, radius);

  for (let n = 0; n < features.length; n++) {
    const idx = indexOf.get(categoryValue(features[n], dim)) ?? 0;
    const a = anchors[idx];
    out[n * 3] = a[0];
    out[n * 3 + 1] = a[1];
    out[n * 3 + 2] = a[2];
  }
  return out;
}

/**
 * Multi-hot target: a node's anchor is the CENTROID of the per-key anchors for each
 * active key in its signature. Same signature → same centroid (convergence); empty
 * signature → origin (no pull, matching the availability gate). Keys are anchored on
 * the same volumetric spherical-Fibonacci set as categories, so depth is preserved.
 */
export function computeMultiHotTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: TargetDimensionId,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;

  const d = getDimension(dim);
  const keySet = new Set<string>();
  const sigs: string[][] = features.map((f) => {
    const v = d ? d.extract(f) : null;
    const keys = Array.isArray(v) ? [...v].sort() : [];
    for (const k of keys) keySet.add(k);
    return keys;
  });

  const keys = Array.from(keySet).sort();
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => keyIndex.set(k, i));
  const keyAnchors: Array<[number, number, number]> = keys.map((_, i) =>
    volumetricAnchor(i, keys.length, radius),
  );

  for (let n = 0; n < features.length; n++) {
    const sig = sigs[n];
    if (sig.length === 0) continue; // origin → no pull (availability gate)
    let x = 0, y = 0, z = 0;
    for (const k of sig) {
      const a = keyAnchors[keyIndex.get(k)!];
      x += a[0]; y += a[1]; z += a[2];
    }
    out[n * 3] = x / sig.length;
    out[n * 3 + 1] = y / sig.length;
    out[n * 3 + 2] = z / sig.length;
  }
  return out;
}

/**
 * Build the per-dimension `TargetArrays` consumed by `createPhysicsLayer`.
 * Each dimension's stride-3 anchors are split into separate x/y/z Float32Arrays.
 */
export function buildFeatureTargets(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: readonly TargetDimensionId[] = TARGET_DIMENSIONS,
  radius: number = ANCHOR_RADIUS,
): TargetArrays {
  const out: TargetArrays = {};
  const n = features.length;
  for (const dim of dims) {
    const xyz = (MULTI_HOT_DIMENSION_IDS as readonly string[]).includes(dim)
      ? computeMultiHotTarget(features, dim, radius)
      : computeDimensionTarget(features, dim, radius);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = xyz[i * 3];
      y[i] = xyz[i * 3 + 1];
      z[i] = xyz[i * 3 + 2];
    }
    out[dim] = { x, y, z };
  }
  return out;
}
