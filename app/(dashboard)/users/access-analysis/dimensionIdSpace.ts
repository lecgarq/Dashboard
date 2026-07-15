/**
 * dimensionIdSpace.ts — THE single dimension id-space for the spatial-graph pickers.
 *
 * Catalog ids (dimensionCatalog.ts) are the id-space of record (Phase 24 decision).
 * Group-by AND Color-by resolve their option lists from PRESET_DIMENSION_IDS below —
 * the two previously-independent hardcoded arrays (groupByDimensions.PRESETS,
 * nodeColors.COLOR_MODES) are gone. Phase 25 widened THIS list to the full
 * owner-chosen aperture (17 catalog dims), organized by theme for the optgroups.
 *
 * The registry (dimensionRegistry.ts) is a DIFFERENT id-space that happens to share
 * some names. REGISTRY_ID_BY_CATALOG_ID is the explicit bridge; ids without an entry
 * pass through unchanged (they are either shared names or nodeColors EXTRA modes).
 */
import type { DimensionId } from "./dimensionRegistry";

export interface ApertureThemeGroup {
  /** Optgroup label shown in both pickers. */
  label: string;
  /** Catalog ids in display order within the group. */
  ids: readonly string[];
}

/**
 * The owner-chosen aperture, by theme, in display order (Phase 25 decision).
 * Every id is a node-level CatalogDimension already computed in featureSnapshot —
 * no new data. This nested structure exists ONLY for optgroup rendering;
 * PRESET_DIMENSION_IDS below is its flattening, so there is still one list.
 */
export const APERTURE_THEME_GROUPS: readonly ApertureThemeGroup[] = [
  { label: "Baseline", ids: ["role", "project", "user"] },
  { label: "Identity", ids: ["company", "internalExternal", "adminMember"] },
  {
    label: "Activity",
    ids: ["activityVolume", "activityRecency", "signinRecency", "dominantActivity", "moduleAccess"],
  },
  { label: "Risk & tenure", ids: ["riskScore", "membershipTenure"] },
  {
    label: "Permission & reach",
    ids: ["permissionTier", "folderAccessPermissions", "folderBreadth", "accessibleDataTB"],
  },
];

/** Picker option list, in display order, CATALOG id-space. Index 0 = default (role). */
export const PRESET_DIMENSION_IDS: readonly string[] = APERTURE_THEME_GROUPS.flatMap(
  (g) => [...g.ids],
);

/**
 * Catalog id → registry id, for catalog dims whose registry descriptor uses a
 * different name. Only VERIFIED-equivalent pairs belong here. Phase 25 moved the
 * pickers' color path catalog-native (bucketedColorsFromClustering), so the bridge
 * is no longer on the picker path; it remains for the parked registry-color helpers.
 */
export const REGISTRY_ID_BY_CATALOG_ID: Readonly<Partial<Record<string, DimensionId>>> = {
  // e.g. moduleAccess: "module" — do NOT add until semantic equivalence is verified.
};

/** Resolve a catalog id to the id nodeColors consumes (registry id or extra-mode name). */
export function colorModeIdForCatalogId(catalogId: string): string {
  return REGISTRY_ID_BY_CATALOG_ID[catalogId] ?? catalogId;
}
