/**
 * usePredicateEngine.ts — Phase 4-01 Task 3.
 *
 * Single predicate engine — collapses filter chips, search prefix, lasso selection,
 * drill-down, and click-isolate into ONE call to physics.setMask. RESEARCH Pattern 1.
 *
 * PHYS-04 invariant enforcement: this module references NO simulation symbols.
 *   No simulation symbols (read or write) appear anywhere in this file.
 *   The filter/search/lasso path is structurally walled off from physics ticks.
 *
 * Behavior contract:
 *   - isolatedNodeIndex !== null    → that index + supplied similarity matches return 1.0; all others 0.15.
 *   - global filters (categorical + numeric buckets) → AND across dimensions.
 *   - searchQuery (already lowercased upstream) → prefix match on name OR email.
 *   - lassoSelection !== null       → only members lit; drillDown filters WITHIN the lasso.
 */

import { useEffect } from "react";
import type { NodeFeatureSnapshot, PredicateInputs } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { isFacetKey, nodeMatchesFacet } from "./accessFacets";
import { valueKeyLabel } from "./dominantClusters";
import { computeActionThresholds, type ActionThresholds } from "./actionBuckets";
import { PRESET_DIMENSION_IDS } from "./dimensionIdSpace";

/** dimId → banded-label fn over the aperture (see buildApertureValueResolvers). */
export type ApertureValueResolvers = Readonly<
  Record<string, (f: NodeFeatureSnapshot) => string>
>;

/**
 * One banded-label resolver per aperture dimension (Phase 25 DIM-04): each dim
 * resolves a node to the SAME valueKeyLabel label Group-by clusters into and
 * Color-by swatches, so a filter tier always matches its blob/swatch. Build
 * once per (catalog, features) load and thread through PredicateInputs.
 */
export function buildApertureValueResolvers(
  catalog: readonly CatalogDimension[],
  features: ReadonlyArray<NodeFeatureSnapshot>,
): ApertureValueResolvers {
  const out: Record<string, (f: NodeFeatureSnapshot) => string> = {};
  // Full "+ Filter" aperture (PRESET_DIMENSION_IDS), NOT the narrower curated
  // Group-into list: every dim the aperture can put into activeFilters needs a
  // resolver, or its filter values never match and the whole graph dims.
  const apertureIds = new Set<string>(PRESET_DIMENSION_IDS);
  const apertureDims = catalog.filter((d) => d.available && apertureIds.has(d.id));
  for (const dim of apertureDims) {
    // Mirrors buildDominantClusters: activity-family ordinals need per-action
    // quantile thresholds; every other kind ignores the map.
    const thresholds =
      dim.family === "activity"
        ? computeActionThresholds(features, [dim.id])
        : new Map<string, ActionThresholds>();
    out[dim.id] = (f) => valueKeyLabel(f, dim, thresholds).label;
  }
  return out;
}

/**
 * Map a filter dimension id to the feature value compared against the allowed set.
 *
 * Aperture dims (present in `resolvers`) return their banded valueKeyLabel label;
 * everything else falls back to the legacy 6-id switch below, so pre-aperture
 * consumers (drill-down pies, older persisted filters) behave unchanged.
 *
 * Exported so chrome (04-02 Toolbar / SliderSidebar) can stay consistent.
 */
export function featureValueForDim(
  f: NodeFeatureSnapshot,
  dim: string,
  resolvers?: ApertureValueResolvers,
): string {
  const resolve = resolvers?.[dim];
  if (resolve) return resolve(f);
  switch (dim) {
    case "role":
      return f.role;
    case "tier":
      return f.permTier ?? "(none)";
    case "project":
      return f.project;
    case "internalExternal":
      return f.isExternal ? "external" : "internal";
    case "activity":
      return f.activityBucket;
    case "signin":
      return f.signinBucket;
    default:
      return "";
  }
}

/**
 * Pure variant of the predicate logic used by usePredicateEngine. Exported so
 * the chrome (04-02 AccessAnalysisShell) can compute the still-visible subset
 * of a lasso selection without mutating any mask. This MUST stay in sync with
 * the predicate body inside usePredicateEngine below.
 *
 * Returns the subset of `lassoSelection` whose nodes pass the current
 * filter + search gates. `isolatedNodeIndex` and `drillDown` deliberately do
 * NOT participate here — visibility is driven by global gates only; drill-down
 * narrows the pie post-hoc.
 */
export function filterSelectionByPredicate(
  lassoSelection: ReadonlySet<number> | null,
  features: ReadonlyArray<NodeFeatureSnapshot>,
  activeFilters: Readonly<Record<string, ReadonlySet<string>>>,
  searchQuery: string,
  valueResolvers?: ApertureValueResolvers,
): ReadonlySet<number> | null {
  if (!lassoSelection) return null;
  const q = searchQuery.toLowerCase();
  const next = new Set<number>();
  for (const i of lassoSelection) {
    const f = features[i];
    if (!f) continue;
    let ok = true;
    for (const [dim, allowed] of Object.entries(activeFilters)) {
      if (allowed.size === 0) continue;
      if (isFacetKey(dim)) {
        if (!nodeMatchesFacet(f, dim, allowed)) {
          ok = false;
          break;
        }
        continue;
      }
      const v = featureValueForDim(f, dim, valueResolvers);
      if (!allowed.has(v)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (q) {
      const hitsName = f.nameLower.startsWith(q);
      const hitsEmail = f.emailLower.startsWith(q);
      if (!hitsName && !hitsEmail) continue;
    }
    next.add(i);
  }
  return next;
}

/**
 * Pure alpha-mask predicate — exported so it is unit-testable and reused by the
 * hook. The mask is overwrite semantics: one predicate replaces all prior masks
 * (Phase 2 PHYS-04 contract). MASK-bus only — references NO simulation symbols.
 */
export function buildMaskPredicate(
  inputs: Omit<PredicateInputs, "physics">,
): (i: number) => number {
  const { features, activeFilters, searchQuery, lassoSelection, drillDown, isolatedNodeIndex, neighborIndices, valueResolvers } = inputs;

  return (i: number): number => {
    const f = features[i];
    if (!f) return 0.15;

    // 1) Click-isolate wins outright — light exactly the clicked node and its
    //    supplied distinct similarity matches.
    if (isolatedNodeIndex !== null) {
      if (i === isolatedNodeIndex) return 1.0;
      if (neighborIndices && neighborIndices.has(i)) return 1.0;
      return 0.15;
    }

    // 2) Global filter chips + P7 facets — AND across all keys with non-empty sets.
    for (const [dim, allowed] of Object.entries(activeFilters)) {
      if (allowed.size === 0) continue;
      if (isFacetKey(dim)) {
        if (!nodeMatchesFacet(f, dim, allowed)) return 0.15;
        continue;
      }
      const v = featureValueForDim(f, dim, valueResolvers);
      if (!allowed.has(v)) return 0.15;
    }

    // 3) Search prefix match on name OR email (already lowercased upstream).
    if (searchQuery) {
      const hitsName = f.nameLower.startsWith(searchQuery);
      const hitsEmail = f.emailLower.startsWith(searchQuery);
      if (!hitsName && !hitsEmail) return 0.15;
    }

    // 4) Lasso selection (with optional pie-slice drill-down INSIDE the lasso).
    if (lassoSelection) {
      if (!lassoSelection.has(i)) return 0.15;
      if (drillDown) {
        // Deliberately legacy (no resolvers): SelectionPanel's pie slices are
        // built from raw snapshot values, not banded aperture labels.
        for (const [dim, value] of Object.entries(drillDown)) {
          if (featureValueForDim(f, dim) !== value) return 0.15;
        }
      }
    }

    return 1.0;
  };
}

/**
 * Recompute the alpha-mask predicate whenever any input changes and push it via
 * physics.setMask. The mask is overwrite semantics — one predicate replaces all
 * prior masks (Phase 2 PHYS-04 contract).
 */
export function usePredicateEngine(inputs: PredicateInputs): void {
  useEffect(() => {
    const { physics, ...rest } = inputs;
    physics.setMask(buildMaskPredicate(rest));
  }, [
    inputs.physics,
    inputs.features,
    inputs.activeFilters,
    inputs.searchQuery,
    inputs.lassoSelection,
    inputs.drillDown,
    inputs.isolatedNodeIndex,
    inputs.neighborIndices,
    inputs.valueResolvers,
  ]);
}
