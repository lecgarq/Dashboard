"use server";
import { auth } from "@/server/auth";
import { loadTemplateFolderTerrain } from "@/lib/server/templateFolderTerrain";
import type { FolderTerrainData } from "@/app/(dashboard)/access-analysis/folderTerrain";

/**
 * Lazy-load the Template MTY changed-folder terrain. The terrain component calls
 * this with a project id, but the template has exactly one "project" so the id is
 * ignored — we always return the template's terrain. Gated by the session.
 */
export async function loadTemplateTerrain(_projectId: string): Promise<FolderTerrainData | null> {
  const session = await auth();
  if (!session) return null;
  return loadTemplateFolderTerrain();
}
