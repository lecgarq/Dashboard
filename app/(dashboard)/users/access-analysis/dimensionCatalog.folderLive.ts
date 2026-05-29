/**
 * Live folder-derived dimensions — real per-(user,project) aggregates over the folders
 * a person can reach (via role → AccFolderPermission). Data already flows through
 * featureSnapshot.permissionTypeSummary (verified: 10,416 instances with non-zero reach),
 * so these need NO pipeline change. Distinct from the 19 greyed acc.xlsx folder identities.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

export function buildFolderReachDimensions(): CatalogDimension[] {
  return [
    {
      id: "folder:reach", label: "Folders they can open", family: "folder", kind: "ordinal",
      source: "permissionTypeSummary.folderBreadth (distinct folders reachable via role grants)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.permissionTypeSummary?.folderBreadth ?? 0,
    },
    {
      id: "folder:controller", label: "Folders they control", family: "folder", kind: "binary",
      source: "permissionTypeSummary.fullController (has a Full Controller grant)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.permissionTypeSummary?.fullController ? "controller" : "limited"),
    },
    {
      id: "folder:mixed", label: "Mixed folder permissions", family: "folder", kind: "binary",
      source: "permissionTypeSummary.mixedProfile (>1 distinct tier across reachable folders)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.permissionTypeSummary?.mixedProfile ? "mixed" : "uniform"),
    },
    {
      // [Slice D] real file data — sum of file bytes across reachable folders (0 until crawled).
      id: "folder:data-access", label: "Data they can access", family: "folder", kind: "ordinal",
      source: "SUM(AccFolder.totalSizeBytes) over reachable folders (Slice D file rollup)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.accessibleDataBytes ?? 0,
    },
  ];
}
