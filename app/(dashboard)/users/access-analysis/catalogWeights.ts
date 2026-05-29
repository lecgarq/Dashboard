/**
 * catalogWeights.ts — Catalog-driven, slider-independent per-node force weights.
 *
 *   weight(d,n) = confidence(d) × availability(d,n)
 *
 * `sliderNorm` is applied live in the physics layer (not here). Spec §10: for an
 * enabled ORDINAL dim, availability is 1 for ALL nodes (count 0 = exact "none", a
 * real pole) so confidence only scales influence and never removes a node.
 * Categorical/multiHot keep the availability gate so a node with no value is never
 * dragged to a pole it has no value for.
 *
 * Pure: no React/DOM/IO. UNWIRED in Phase D (Phase E swaps it into the shell).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension, DimConfidence } from "./dimensionCatalog.types";

const CONFIDENCE_FACTOR: Record<DimConfidence, number> = { high: 1, medium: 0.7, low: 0.4 };

function availability(dim: CatalogDimension, f: NodeFeatureSnapshot): 0 | 1 {
  // Ordinal & binary dims position every node (none/false are real poles).
  if (dim.kind === "ordinal" || dim.kind === "binary") return 1;
  const v = dim.extract(f);
  if (v == null) return 0;
  if (Array.isArray(v)) return v.length ? 1 : 0;
  if (typeof v === "string") return v === "(none)" ? 0 : 1;
  return 1;
}

export function buildCatalogWeights(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const dim of dims) {
    const conf = CONFIDENCE_FACTOR[dim.confidence];
    const arr = new Float32Array(features.length);
    for (let i = 0; i < features.length; i++) arr[i] = conf * availability(dim, features[i]);
    out[dim.id] = arr;
  }
  return out;
}
