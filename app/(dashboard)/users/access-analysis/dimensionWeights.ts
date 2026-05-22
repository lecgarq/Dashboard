/**
 * dimensionWeights.ts — Pure per-node, slider-INDEPENDENT force weights.
 *
 * No React, no DOM, no I/O. Implements the slider-independent half of the taxonomy
 * §14 universal weighting model:
 *
 *   effectiveWeight(d,n) = sliderNorm(d) × confidence(d) × availability(d,n) × transformer(d,n)
 *
 * `sliderNorm` is applied live in the physics layer. `baseWeight` is already spent as the
 * default slider position (DEFAULT_VALUES === defaultWeight×100), so it is NOT folded
 * in here (no double-count). This module produces the remaining per-node factor:
 *
 *   weight(d,n) = confidence(d) × availability(d,n) × transformer(d,n)
 *
 * transformer is 1 for the categorical/binary/temporal runtime dims (scalar/temporal
 * value-normalization is a later phase). availability(d,n) ∈ {0,1} is the per-node
 * gate from descriptor.isAvailable, so sparse/unknown nodes never get dragged to a
 * dimension's pole.
 */

import {
  CONFIDENCE_FACTOR,
  getDimension,
  type DimensionId,
} from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildDimensionWeights(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: readonly DimensionId[],
): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const dim of dims) {
    const d = getDimension(dim);
    const arr = new Float32Array(features.length);
    if (d) {
      const conf = CONFIDENCE_FACTOR[d.confidence];
      for (let i = 0; i < features.length; i++) {
        arr[i] = d.isAvailable(features[i]) ? conf : 0;
      }
    }
    out[dim] = arr;
  }
  return out;
}
