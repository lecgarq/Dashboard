"use server";
import { auth } from "@/server/auth";
import { loadFolderPermissionTerrain, loadFolderPermissionOverview } from "@/lib/server/folderPermissionTerrainView";
import type { FolderTerrainData } from "./folderTerrain";

/**
 * Lazy-load one project's folder-permission terrain when the picker changes.
 * The page ships the terrain for the default (richest) project; switching to any
 * other project fetches it on demand. Gated by the dashboard session.
 */
export async function loadTerrainForProject(projectId: string): Promise<FolderTerrainData | null> {
  const session = await auth();
  if (!session || !projectId) return null;
  return loadFolderPermissionTerrain(projectId);
}

/**
 * Lazy-load the account-wide overview terrain (heavy GROUP BY over all
 * projects), fetched only when the user opens the Overview mode.
 */
export async function loadOverviewTerrain(): Promise<FolderTerrainData | null> {
  const session = await auth();
  if (!session) return null;
  return loadFolderPermissionOverview();
}
