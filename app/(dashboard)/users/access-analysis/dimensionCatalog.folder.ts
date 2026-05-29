/**
 * Folder-attribute dimensions from acc.xlsx — carried as ALWAYS-DISABLED placeholders so the
 * full excel structure stays visible, greyed. Two reasons (shown as tooltip via `note`):
 *  - "drill-down": data exists per-folder (AccFolder/AccFolderPermission) but is a folder
 *    identity, not a per-person value — see the folder drill-down view, not a node slider.
 *  - "not collected yet": not captured in Prisma today (Slice D ingestion milestone).
 * Live per-person folder AGGREGATES live in dimensionCatalog.folderLive.ts.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const DRILL_DOWN = "Per-folder identity (we have this data) — see the folder drill-down, not a per-person slider.";
const NOT_COLLECTED = "Not collected yet — needs the folder-attribute ingestion milestone (Slice D).";

/** label -> note bucket. All 19 acc.xlsx folder attributes (set is identical to the excel). */
const FOLDER_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ["Folder ID", DRILL_DOWN],
  ["Folder Name", DRILL_DOWN],
  ["Folder Path", DRILL_DOWN],
  ["Folder Roles", DRILL_DOWN],
  ["Folder Roles Name", DRILL_DOWN],
  ["Folder Role Permissions", DRILL_DOWN],
  ["Folder Roles Users by Name", DRILL_DOWN],
  ["Folder Description", NOT_COLLECTED],
  ["Folder Indicators", NOT_COLLECTED],
  ["Folder Issues", NOT_COLLECTED],
  ["Folder Markups", NOT_COLLECTED],
  ["Folder Size", NOT_COLLECTED],
  ["Folder Version", NOT_COLLECTED],
  ["Last Updated", NOT_COLLECTED],
  ["Review Status", NOT_COLLECTED],
  ["Revision", NOT_COLLECTED],
  ["Updated By", NOT_COLLECTED],
  ["Version Added By", NOT_COLLECTED],
  ["Inherit Permissions?", NOT_COLLECTED],
];

const slug = (s: string): string =>
  "folder:" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildFolderAttributeDimensions(): CatalogDimension[] {
  return FOLDER_ATTRIBUTES.map(([label, note]) => ({
    id: slug(label),
    label,
    family: "folder" as const,
    kind: "categorical" as const,
    source: "AccFolder / AccFolderPermission (per-folder; no per-node value)",
    note,
    confidence: "low" as const,
    available: false,
    surfaces: [] as ("slider" | "color")[],
    extract: () => null,
  }));
}
