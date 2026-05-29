/**
 * Hand-curated taxonomy constants — the parts of acc.xlsx that are NOT the long
 * action list (which is generated). Values verified against the live DB (spec §4).
 * Pure: no React/DOM/IO, no import of the generated actions (avoids a cycle).
 */
import type { AccessLevel, StructuralDim, TaxonomyGroup, TaxonomyModule } from "./accTaxonomy.types";

/** The 9 excel modules (canonical names). `observed` = has activity rows in the excel. */
export const MODULES: readonly TaxonomyModule[] = [
  { id: "autospecs", label: "AutoSpecs", observed: false },
  { id: "build", label: "Build", observed: true },
  { id: "dataManagement", label: "Data Management", observed: true },
  { id: "datum", label: "Datum", observed: true },
  { id: "design", label: "Design", observed: false },
  { id: "designCollaboration", label: "Design Collaboration", observed: true },
  { id: "insight", label: "Insight", observed: false },
  { id: "modelCoordination", label: "Model Coordination", observed: true },
  { id: "preconstruction", label: "Preconstruction", observed: true },
];

/** DB productKey -> excel module id. `cost` folds into Build (spec decision 8). */
export const ENTITLEMENT_TO_MODULE: Readonly<Record<string, string>> = {
  build: "build",
  cost: "build",
  docs: "dataManagement",
  designCollaboration: "designCollaboration",
  modelCoordination: "modelCoordination",
  insight: "insight",
  autoSpecs: "autospecs",
  takeoff: "preconstruction",
  forma: "design",
};

/** Excel group-activity headers. */
export const GROUPS: readonly TaxonomyGroup[] = [
  { id: "accessChange", label: "ACCess Change" },
  { id: "contentChange", label: "Content Change" },
  { id: "delete", label: "Delete" },
  { id: "read", label: "Read" },
  { id: "workflowChange", label: "Workflow Change" },
  { id: "unknown", label: "Unknown" },
];

/** Real access ladder (AccFolderPermission.permType) -> perm_strength 0..5 (spec §4). */
export const ACCESS_LEVELS: readonly AccessLevel[] = [
  { id: "none", label: "None", strength: 0, permType: null },
  { id: "viewOnly", label: "View Only", strength: 1, permType: "View Only" },
  { id: "viewDownload", label: "View + Download", strength: 2, permType: "View+Download" },
  { id: "viewDownloadUpload", label: "View + Download + Upload", strength: 3, permType: "View+Download+Upload" },
  { id: "viewDownloadUploadEdit", label: "View + Download + Upload + Edit", strength: 4, permType: "View+Download+Upload+Edit" },
  { id: "fullController", label: "Full Controller", strength: 5, permType: "Full Controller" },
];

/** Structural / access dimensions (non-activity). */
export const STRUCTURAL_DIMS: readonly StructuralDim[] = [
  { id: "project", label: "Project", kind: "categorical" },
  { id: "role", label: "Role", kind: "categorical" },
  { id: "company", label: "Company", kind: "categorical" },
  { id: "status", label: "Status", kind: "categorical" },
  { id: "permission", label: "Permission level", kind: "ordinal" },
  { id: "tenure", label: "Membership tenure", kind: "ordinal" },
  { id: "moduleAccess", label: "Module access", kind: "categorical" },
  { id: "admin", label: "Admin / member", kind: "binary" },
  { id: "internalExternal", label: "Internal / external", kind: "categorical" },
];

/**
 * Alias table: normalized DB rawAction -> canonical taxonomy action id, for the
 * handful that don't kebab-match the excel label exactly. Keep tiny + commented.
 */
export const ACTION_ALIASES: Readonly<Record<string, string>> = {
  // DB stores "namingstandard" (no hyphen); excel label is "Naming Standard".
  "add-attribute-to-namingstandard": "add-attribute-to-naming-standard",
};

/**
 * Actions whose data is account-level (sourceFile='admin', projectId=''). These are
 * attributed to the ACTOR (spec decision 9). The excel files them under Preconstruction.
 */
export const ADMIN_SOURCE_ACTION_IDS: ReadonlySet<string> = new Set([
  "assign-member",
  "assign-admin",
  "remove-member",
  "remove-admin",
  "edit-project",
]);

/** Excel module/group display label -> id (used by the generator; kept here as source of truth). */
export const MODULE_LABEL_TO_ID: Readonly<Record<string, string>> = {
  AutoSpecs: "autospecs",
  Build: "build",
  "Data Management": "dataManagement",
  Datum: "datum",
  Design: "design",
  "Design Collaboration": "designCollaboration",
  Insight: "insight",
  "Model Coordination": "modelCoordination",
  Preconstruction: "preconstruction",
};

export const GROUP_LABEL_TO_ID: Readonly<Record<string, string>> = {
  "Content Change": "contentChange",
  Delete: "delete",
  Read: "read",
  "Workflow Change": "workflowChange",
  "ACCess Change": "accessChange",
  Unknown: "unknown",
};
