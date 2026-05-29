/**
 * Folder-attribute dimensions from acc.xlsx — carried as ALWAYS-DISABLED entries so the
 * full excel structure is visible, greyed. These live per-folder, not per-(user,project),
 * so there is no node value (extract → null). Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const FOLDER_ATTRIBUTE_LABELS: readonly string[] = [
  "Folder ID", "Folder Description", "Folder Indicators", "Folder Issues", "Folder Markups",
  "Folder Name", "Folder Path", "Folder Size", "Folder Version", "Last Updated", "Review Status",
  "Revision", "Updated By", "Version Added By", "Folder Roles", "Inherit Permissions?",
  "Folder Roles Users by Name", "Folder Roles Name", "Folder Role Permissions",
];

const slug = (s: string): string =>
  "folder:" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildFolderAttributeDimensions(): CatalogDimension[] {
  return FOLDER_ATTRIBUTE_LABELS.map((label) => ({
    id: slug(label),
    label,
    family: "folder" as const,
    kind: "categorical" as const,
    source: "AccFolder / AccFolderPermission (per-folder; no per-node value)",
    confidence: "low" as const,
    available: false,
    surfaces: [] as ("slider" | "color")[],
    extract: () => null,
  }));
}
