/** Curated primary layout choices for the workshop-facing Group into menu. Pure. */
import type { CatalogDimension } from "./dimensionCatalog.types";

export const GENERAL_GROUP_ID = "general";

export const PRIMARY_GROUP_OPTIONS = [
  { id: "role", label: "Role" },
  { id: "company", label: "Company" },
  { id: "user", label: "Users" },
  { id: "project", label: "Project name" },
  { id: "activityRecency", label: "Last activity" },
  { id: "activityVolume", label: "Activity volume" },
  { id: "permissionTier", label: "Folder permission type" },
  { id: "folderBreadth", label: "Folder access" },
  { id: "typeOfActivity", label: "Activity type" },
  { id: "moduleAccess", label: "Modules" },
] as const;

export const PRIMARY_GROUP_DIMENSION_IDS: readonly string[] = PRIMARY_GROUP_OPTIONS.map(
  (option) => option.id,
);

const PRIMARY_GROUP_SET = new Set(PRIMARY_GROUP_DIMENSION_IDS);
const PRIMARY_LABELS = new Map<string, string>(
  PRIMARY_GROUP_OPTIONS.map((option) => [option.id, option.label]),
);

export function primaryGroupLabel(id: string, fallback = id): string {
  if (id === GENERAL_GROUP_ID) return "General";
  return PRIMARY_LABELS.get(id) ?? fallback;
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const byId = new Map(
    catalog.filter((dimension) => dimension.available && PRIMARY_GROUP_SET.has(dimension.id))
      .map((dimension) => [dimension.id, dimension]),
  );
  return PRIMARY_GROUP_DIMENSION_IDS.flatMap((id) => {
    const dimension = byId.get(id);
    return dimension ? [dimension] : [];
  });
}

export function defaultGroupBy(_catalog: readonly CatalogDimension[]): string {
  return GENERAL_GROUP_ID;
}
