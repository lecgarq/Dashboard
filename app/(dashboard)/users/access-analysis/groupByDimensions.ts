/**
 * groupByDimensions.ts — Which catalog dims the projector map's "Group by" picker
 * offers, and the default. Categorical/binary dims (and the bucketed permission/tenure
 * ordinals) form sensible blobs; numeric activity-count ordinals are excluded for v1
 * (they'd shatter into specks or need bucketing). Curated priority order. Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const PRIORITY = [
  "company", "role", "project", "permission", "tenure",
  "internalExternal", "adminMember", "accountStatus", "dominantActivity",
];

const BUCKETED_ORDINALS = new Set(["permission", "tenure"]);

function isGroupable(d: CatalogDimension): boolean {
  if (!d.available) return false;
  if (d.kind === "categorical" || d.kind === "binary") return true;
  return BUCKETED_ORDINALS.has(d.id);
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const rank = (id: string): number => {
    const i = PRIORITY.indexOf(id);
    return i < 0 ? PRIORITY.length : i;
  };
  return catalog
    .filter(isGroupable)
    .sort((a, b) => rank(a.id) - rank(b.id) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export function defaultGroupBy(catalog: readonly CatalogDimension[]): string {
  return groupByDimensions(catalog)[0]?.id ?? "role";
}
