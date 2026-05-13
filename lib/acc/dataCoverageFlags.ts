/**
 * Pure derivation of a user's data-presence "flag set".
 *
 * Used as the categorical attribute for the Data Coverage similarity dimension.
 * Two users are similar on this dim if they share many of the same flags
 * (i.e., we know the same KINDS of things about them).
 */

export type DataCoverageFlag =
  | "has-signin"
  | "has-activity"
  | "has-folders"
  | "has-projects"
  | "has-roles"
  | "has-added-at";

export interface DataCoverageInput {
  lastSignIn: number | null;
  activityCount: number;
  folderIds: readonly string[];
  projectIds: readonly string[];
  roleIds: readonly string[];
  addedAt: number | null;
}

export function dataCoverageFlags(u: DataCoverageInput): DataCoverageFlag[] {
  const flags: DataCoverageFlag[] = [];
  if (u.lastSignIn != null) flags.push("has-signin");
  if (u.activityCount > 0) flags.push("has-activity");
  if (u.folderIds.length > 0) flags.push("has-folders");
  if (u.projectIds.length > 0) flags.push("has-projects");
  if (u.roleIds.length > 0) flags.push("has-roles");
  if (u.addedAt != null) flags.push("has-added-at");
  return flags;
}
