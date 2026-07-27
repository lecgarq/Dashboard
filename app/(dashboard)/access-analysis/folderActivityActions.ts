"use server";
import { auth } from "@/server/auth";
import {
  loadFolderRanking,
  loadFolderDetail,
  loadFolderActionMatrix,
  type FolderRankTotal,
} from "@/lib/server/folderActivityView";
import type { FolderProjectRow } from "./folderActivityCounts";
import type { FolderActionCell } from "./folderActionTypes";

/** Auth-gated: folder ranking across the selected projects (level 1 of the
 *  folder-first drill: Folders → Projects → Roles → People). */
export async function loadFolderRankingAction(projectIds: string[]): Promise<FolderRankTotal[]> {
  const session = await auth();
  if (!session || projectIds.length === 0) return [];
  return loadFolderRanking(projectIds);
}

/** Auth-gated: one folder name's (project, actor) activity rows. */
export async function loadFolderDetailAction(
  folderName: string,
  projectIds: string[],
): Promise<FolderProjectRow[]> {
  const session = await auth();
  if (!session || !folderName || projectIds.length === 0) return [];
  return loadFolderDetail(folderName, projectIds);
}

/** Auth-gated: (folder, verb) counts for the "Activity types by folder" heatmap.
 *  `limit` bounds the folder rows (server clamps to FOLDER_RANK_LIMIT). */
export async function loadFolderActionMatrixAction(
  projectIds: string[],
  limit?: number,
): Promise<FolderActionCell[]> {
  const session = await auth();
  if (!session || projectIds.length === 0) return [];
  return loadFolderActionMatrix(projectIds, limit);
}
