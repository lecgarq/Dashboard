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
 *   - isolatedNodeIndex !== null    → only that index returns 1.0; all others 0.15.
 *   - global filters (categorical + numeric buckets) → AND across dimensions.
 *   - searchQuery (already lowercased upstream) → prefix match on name OR email.
 *   - lassoSelection !== null       → only members lit; drillDown filters WITHIN the lasso.
 */

import { useEffect } from "react";
import type { NodeFeatureSnapshot, PredicateInputs } from "./interactionTypes";

/**
 * Map a filter dimension id to the feature value compared against the allowed set.
 *
 * Exported so chrome (04-02 Toolbar / SliderSidebar) can stay consistent.
 */
export function featureValueForDim(
  f: NodeFeatureSnapshot,
  dim: string,
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
    default:
      return "";
  }
}

/**
 * Recompute the alpha-mask predicate whenever any input changes and push it via
 * physics.setMask. The mask is overwrite semantics — one predicate replaces all
 * prior masks (Phase 2 PHYS-04 contract).
 */
export function usePredicateEngine(inputs: PredicateInputs): void {
  useEffect(() => {
    const {
      physics,
      features,
      activeFilters,
      searchQuery,
      lassoSelection,
      drillDown,
      isolatedNodeIndex,
    } = inputs;

    physics.setMask((i: number): number => {
      const f = features[i];
      if (!f) return 0.15;

      // 1) Click-isolate wins outright.
      if (isolatedNodeIndex !== null) {
        return i === isolatedNodeIndex ? 1.0 : 0.15;
      }

      // 2) Global filter chips — AND across all dims with non-empty allowed sets.
      for (const [dim, allowed] of Object.entries(activeFilters)) {
        if (allowed.size === 0) continue;
        const v = featureValueForDim(f, dim);
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
          for (const [dim, value] of Object.entries(drillDown)) {
            if (featureValueForDim(f, dim) !== value) return 0.15;
          }
        }
      }

      return 1.0;
    });
  }, [
    inputs.physics,
    inputs.features,
    inputs.activeFilters,
    inputs.searchQuery,
    inputs.lassoSelection,
    inputs.drillDown,
    inputs.isolatedNodeIndex,
  ]);
}
