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

// ---------------------------------------------------------------------------
// Dimensions — mirror the SliderContext DIMENSIONS ids so P1 wiring is 1:1.
// ---------------------------------------------------------------------------

export type TargetDimensionId =
  | "role"
  | "tier"
  | "project"
  | "isExternal"
  | "activity"
  | "signin";

export const TARGET_DIMENSIONS: readonly TargetDimensionId[] = [
  "role",
  "tier",
  "project",
  "isExternal",
  "activity",
  "signin",
];

/**
 * Outer anchor radius. The absolute scale is irrelevant — the physics layer
 * normalizes the settled spread into a fixed cube (`LAYOUT_HALF_EXTENT`). What
 * matters is the RELATIVE separation between category anchors.
 */
const ANCHOR_RADIUS = 1;

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
  switch (dim) {
    case "role":
      return f.role;
    case "tier":
      return f.permTier ?? "(none)";
    case "project":
      return f.project;
    case "isExternal":
      return f.isExternal ? "external" : "internal";
    case "activity":
      return f.activityBucket;
    case "signin":
      return f.signinBucket;
  }
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
    const xyz = computeDimensionTarget(features, dim, radius);
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
