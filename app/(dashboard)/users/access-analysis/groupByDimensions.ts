/**
 * groupByDimensions.ts — The projector map's "Group by" picker offers exactly three
 * presets: Role (default), Project, User name. Everything else in the catalog is
 * intentionally not offered here (the controls were pared down to these three).
 * Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

/** The only dims the picker offers, in display order. Index 0 (role) is the default. */
const PRESETS = ["role", "project", "user"];
const PRESET_SET = new Set(PRESETS);

function isGroupable(d: CatalogDimension): boolean {
  return d.available && PRESET_SET.has(d.id);
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const rank = (id: string): number => {
    const i = PRESETS.indexOf(id);
    return i < 0 ? PRESETS.length : i;
  };
  return catalog.filter(isGroupable).sort((a, b) => rank(a.id) - rank(b.id));
}

export function defaultGroupBy(catalog: readonly CatalogDimension[]): string {
  return groupByDimensions(catalog)[0]?.id ?? "role";
}
