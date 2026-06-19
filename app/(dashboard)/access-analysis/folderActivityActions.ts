"use server";
import { auth } from "@/server/auth";
import {
  loadFolderActivityProjects,
  loadFolderActivityTree,
  type ProjectActivityTotal,
} from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "./folderActivityCounts";

/** Auth-gated: per-project folder-activity totals for the selected projects. */
export async function loadFolderActivityProjectsAction(projectIds: string[]): Promise<ProjectActivityTotal[]> {
  const session = await auth();
  if (!session || projectIds.length === 0) return [];
  return loadFolderActivityProjects(projectIds);
}

/** Auth-gated: one project's (folder, actor) activity rows. */
export async function loadFolderActivityTreeAction(projectId: string): Promise<FolderActivityRow[]> {
  const session = await auth();
  if (!session || !projectId) return [];
  return loadFolderActivityTree(projectId);
}
