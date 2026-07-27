// lib/forma/tiers.ts
// Forma permission tiers — aligned to ACC's actual folder-permission picker:
// the six real levels grouped View / Create / Edit / Manage, plus a UI-only
// "No access" sentinel for an unassigned cell. Pure data — no React, no I/O.
//
// NOTE: this is the Forma planning taxonomy. The app-wide mapping of ingested
// ACC `actions[]` lives separately in lib/acc/permissionMapping.ts.

export const NO_ACCESS = "No access" as const;

export type FormaTier =
  | typeof NO_ACCESS
  | "View Only"
  | "View+Download"
  | "View+Download+Publish markups"
  | "View+Download+Publish markups+Upload"
  | "View+Download+Publish markups+Upload+Edit"
  | "Full administrative controls";

/** UI order, lowest → highest access. */
export const FORMA_TIERS: readonly FormaTier[] = [
  NO_ACCESS,
  "View Only",
  "View+Download",
  "View+Download+Publish markups",
  "View+Download+Publish markups+Upload",
  "View+Download+Publish markups+Upload+Edit",
  "Full administrative controls",
];

/** ACC's grouping headers for the levels (matches the ACC picker UI). */
export const TIER_GROUP: Record<FormaTier, string> = {
  "No access": "None",
  "View Only": "View",
  "View+Download": "View",
  "View+Download+Publish markups": "Create",
  "View+Download+Publish markups+Upload": "Create",
  "View+Download+Publish markups+Upload+Edit": "Edit",
  "Full administrative controls": "Manage",
};

/** Group order for menus (No access handled separately). */
export const TIER_GROUP_ORDER = ["View", "Create", "Edit", "Manage"] as const;

export const TIER_SHORT: Record<FormaTier, string> = {
  "No access": "—",
  "View Only": "View",
  "View+Download": "View+DL",
  "View+Download+Publish markups": "+Markups",
  "View+Download+Publish markups+Upload": "+Upload",
  "View+Download+Publish markups+Upload+Edit": "Edit",
  "Full administrative controls": "Manage",
};

export const TIER_COLOR: Record<FormaTier, string> = {
  "No access": "#52525b", // zinc-600
  "View Only": "#0e7490", // cyan-700
  "View+Download": "#0891b2", // cyan-600
  "View+Download+Publish markups": "#2563eb", // blue-600
  "View+Download+Publish markups+Upload": "#7c3aed", // violet-600
  "View+Download+Publish markups+Upload+Edit": "#d97706", // amber-600
  "Full administrative controls": "#dc2626", // red-600
};

/** Real ACC `actions[]` per level — so an export is actionable in ACC. */
export const TIER_ACTIONS: Record<FormaTier, readonly string[]> = {
  "No access": [],
  "View Only": ["VIEW", "COLLABORATE"],
  "View+Download": ["VIEW", "DOWNLOAD", "COLLABORATE"],
  "View+Download+Publish markups": ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP"],
  "View+Download+Publish markups+Upload": ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP", "PUBLISH"],
  "View+Download+Publish markups+Upload+Edit": ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP", "PUBLISH", "EDIT"],
  "Full administrative controls": ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP", "PUBLISH", "EDIT", "CONTROL"],
};

/** Pre-alignment tier strings → nearest current level (migrates saved drafts). */
const LEGACY_TIER_MAP: Record<string, FormaTier> = {
  "View Only": "View Only",
  "View+Download": "View+Download",
  "Upload Only": "View+Download+Publish markups+Upload",
  "View+Download+Upload": "View+Download+Publish markups+Upload",
  "View+Download+Upload+Edit": "View+Download+Publish markups+Upload+Edit",
  "Full Controller": "Full administrative controls",
};

/** Coerce any stored tier string to a current FormaTier. */
export function migrateTier(t: string): FormaTier {
  if ((FORMA_TIERS as readonly string[]).includes(t)) return t as FormaTier;
  return LEGACY_TIER_MAP[t] ?? NO_ACCESS;
}
