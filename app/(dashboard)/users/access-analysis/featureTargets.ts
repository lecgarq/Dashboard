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
 * The anchoring concept is ported (not copied) from the donor blob layout in
 * `accGraphOrganicLayout.ts` (`computeBlobSeedPositions`). Instead of hashing each
 * value to an arbitrary point, distinct values for a dimension are spread evenly
 * around a ring — this guarantees deterministic output AND visible separation
 * between categories regardless of how the source strings happen to hash.
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
 * Ring radius for anchor placement. The absolute scale is irrelevant — the
 * physics layer normalizes the settled spread into a fixed cube
 * (`LAYOUT_HALF_EXTENT`). What matters is the RELATIVE separation between
 * category anchors, so a unit ring is sufficient.
 */
const RING_RADIUS = 1;

/** Mild out-of-plane tilt so the layout reads as 3D (not a flat disc) in 3D mode. */
const Z_TILT = 0.3;

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
 * Compute stride-3 [x,y,z,...] target positions for ONE dimension.
 *
 * Distinct category values are spread evenly around a ring; every node is placed
 * at its category's anchor. Same category → identical anchor; different
 * categories → angularly separated anchors. Output length is `features.length * 3`.
 */
export function computeDimensionTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: TargetDimensionId,
  radius: number = RING_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;

  const categories = distinctSortedCategories(features, dim);
  const count = categories.length;
  const indexOf = new Map<string, number>();
  for (let i = 0; i < count; i++) indexOf.set(categories[i], i);

  // Precompute one anchor per category (avoids recomputing trig per node).
  const anchorX = new Float32Array(count);
  const anchorY = new Float32Array(count);
  const anchorZ = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = count <= 1 ? 0 : (i / count) * Math.PI * 2;
    anchorX[i] = Math.cos(angle) * radius;
    anchorY[i] = Math.sin(angle) * radius;
    // Deterministic, value-stable tilt derived from the same angle.
    anchorZ[i] = count <= 1 ? 0 : Math.cos(angle * 2) * radius * Z_TILT;
  }

  for (let n = 0; n < features.length; n++) {
    const idx = indexOf.get(categoryValue(features[n], dim)) ?? 0;
    out[n * 3] = anchorX[idx];
    out[n * 3 + 1] = anchorY[idx];
    out[n * 3 + 2] = anchorZ[idx];
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
  radius: number = RING_RADIUS,
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
