import type { SimilarityDim } from "@/lib/acc/userSimilarity";

export interface GraphAnalyticsSelection {
  userIds?: readonly string[];
  projectIds?: readonly string[];
  roleIds?: readonly string[];
  folderIds?: readonly string[];
  similarityDims?: readonly SimilarityDim[];
}

export interface AnalyticsSelectableNode {
  id: string;
  userId?: string;
  email?: string;
  projectId?: string;
  roles?: readonly string[];
}

const FACET_TO_SELECTION_FIELD = {
  user_id: "userIds",
  email: "userIds",
  project_id: "projectIds",
  role_id: "roleIds",
  folder_id: "folderIds",
  dimension: "similarityDims",
} as const;

function uniqueValues<T extends string>(values: readonly T[] | undefined): T[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[]));
}

function hasValues(values: readonly string[] | undefined): boolean {
  return !!values && values.length > 0;
}

function intersects(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((value) => set.has(value));
}

export function isAnalyticsSelectionEmpty(selection: GraphAnalyticsSelection | null | undefined): boolean {
  if (!selection) return true;
  return !(
    hasValues(selection.userIds) ||
    hasValues(selection.projectIds) ||
    hasValues(selection.roleIds) ||
    hasValues(selection.folderIds) ||
    hasValues(selection.similarityDims)
  );
}

export function selectionFromFacet(field: string, values: readonly string[]): GraphAnalyticsSelection {
  const selectionField = FACET_TO_SELECTION_FIELD[field as keyof typeof FACET_TO_SELECTION_FIELD];
  if (!selectionField) return {};
  return { [selectionField]: uniqueValues(values) };
}

export function mergeGraphAnalyticsSelections(
  ...selections: readonly (GraphAnalyticsSelection | null | undefined)[]
): GraphAnalyticsSelection {
  const merged: GraphAnalyticsSelection = {};
  for (const selection of selections) {
    if (!selection) continue;
    if (selection.userIds?.length) merged.userIds = uniqueValues([...(merged.userIds ?? []), ...selection.userIds]);
    if (selection.projectIds?.length) merged.projectIds = uniqueValues([...(merged.projectIds ?? []), ...selection.projectIds]);
    if (selection.roleIds?.length) merged.roleIds = uniqueValues([...(merged.roleIds ?? []), ...selection.roleIds]);
    if (selection.folderIds?.length) merged.folderIds = uniqueValues([...(merged.folderIds ?? []), ...selection.folderIds]);
    if (selection.similarityDims?.length) {
      merged.similarityDims = uniqueValues([...(merged.similarityDims ?? []), ...selection.similarityDims] as SimilarityDim[]) as SimilarityDim[];
    }
  }
  return merged;
}

export function nodeMatchesAnalyticsSelection(
  node: AnalyticsSelectableNode,
  selection: GraphAnalyticsSelection | null | undefined,
): boolean {
  if (isAnalyticsSelectionEmpty(selection)) return true;
  const userKeys = uniqueValues([node.userId ?? "", node.email ?? "", node.id]);
  if (selection?.userIds?.length && !intersects(selection.userIds, userKeys)) return false;
  if (selection?.projectIds?.length && (!node.projectId || !selection.projectIds.includes(node.projectId))) return false;
  if (selection?.roleIds?.length && !intersects(selection.roleIds, node.roles)) return false;
  return true;
}

