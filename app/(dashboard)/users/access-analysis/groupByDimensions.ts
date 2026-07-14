/**
 * groupByDimensions.ts — The projector map's "Group by" picker offers exactly three
 * presets: Role (default), Project, User name. Everything else in the catalog is
 * intentionally not offered here. The list itself now lives in dimensionIdSpace.ts
 * (Phase 24 unification) — this module only ranks/filters against it.
 * Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { PRESET_DIMENSION_IDS } from "./dimensionIdSpace";

const PRESET_SET = new Set(PRESET_DIMENSION_IDS);

function isGroupable(d: CatalogDimension): boolean {
  return d.available && PRESET_SET.has(d.id);
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const rank = (id: string): number => {
    const i = PRESET_DIMENSION_IDS.indexOf(id);
    return i < 0 ? PRESET_DIMENSION_IDS.length : i;
  };
  return catalog.filter(isGroupable).sort((a, b) => rank(a.id) - rank(b.id));
}

export function defaultGroupBy(catalog: readonly CatalogDimension[]): string {
  return groupByDimensions(catalog)[0]?.id ?? "role";
}
