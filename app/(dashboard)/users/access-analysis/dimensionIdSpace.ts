/**
 * dimensionIdSpace.ts — THE single dimension id-space for the spatial-graph pickers.
 *
 * Catalog ids (dimensionCatalog.ts) are the id-space of record (Phase 24 decision).
 * Group-by AND Color-by resolve their option lists from PRESET_DIMENSION_IDS below —
 * the two previously-independent hardcoded arrays (groupByDimensions.PRESETS,
 * nodeColors.COLOR_MODES) are gone. Phase 25 widens THIS list.
 *
 * The registry (dimensionRegistry.ts) is a DIFFERENT id-space that happens to share
 * some names. REGISTRY_ID_BY_CATALOG_ID is the explicit bridge; ids without an entry
 * pass through unchanged (they are either shared names or nodeColors EXTRA modes).
 */
import type { DimensionId } from "./dimensionRegistry";

/** Picker option list, in display order, CATALOG id-space. Index 0 = default. */
export const PRESET_DIMENSION_IDS: readonly string[] = ["role", "project", "user"];

/**
 * Catalog id → registry id, for catalog dims whose registry descriptor uses a
 * different name. Only VERIFIED-equivalent pairs belong here; Phase 25 extends it
 * as it widens the aperture. Currently empty of renames: role/project/company share
 * names across both spaces, and "user" has no registry dim (nodeColors EXTRA mode).
 */
export const REGISTRY_ID_BY_CATALOG_ID: Readonly<Partial<Record<string, DimensionId>>> = {
  // e.g. moduleAccess: "module" — do NOT add until Phase 25 verifies semantic equivalence.
};

/** Resolve a catalog id to the id nodeColors consumes (registry id or extra-mode name). */
export function colorModeIdForCatalogId(catalogId: string): string {
  return REGISTRY_ID_BY_CATALOG_ID[catalogId] ?? catalogId;
}
