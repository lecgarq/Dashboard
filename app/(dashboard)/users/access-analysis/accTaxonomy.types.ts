// accTaxonomy.types.ts
/** The excel's group-activity level (middle of module -> group -> action). */
export type GroupId =
  | "contentChange"
  | "delete"
  | "read"
  | "workflowChange"
  | "accessChange"
  | "unknown";

/** Where the action's data comes from. "admin" = account-level, actor-attributed. */
type ActivitySource = "project" | "admin";

export interface TaxonomyModule {
  id: string;
  label: string;     // excel display name (canonical)
  observed: boolean; // has observed activities in the excel
}

export interface TaxonomyGroup {
  id: GroupId;
  label: string;
}

export interface TaxonomyAction {
  id: string;            // canonical kebab id (matches DB rawAction)
  label: string;         // excel display label
  moduleId: string;      // -> TaxonomyModule.id
  groupId: GroupId;
  source: ActivitySource;
}

export interface AccessLevel {
  id: string;
  label: string;
  strength: 0 | 1 | 2 | 3 | 4 | 5;
  permType: string | null; // AccFolderPermission.permType, or null for "none"
}

type StructuralKind = "categorical" | "ordinal" | "binary";

export interface StructuralDim {
  id: string;
  label: string;
  kind: StructuralKind;
}
