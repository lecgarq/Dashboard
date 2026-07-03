"use server";
import { auth } from "@/server/auth";
import {
  loadFolderScopedActivity,
  loadCompanyFolderBreakdown,
  type FolderActivityActorRow,
  type CompanyFolderSlice,
} from "@/lib/server/folderActivityByCompanyView";

/**
 * Headline: folder-scoped activity per (project, actor) for the "Folder
 * activity by company" panel (UAT-6). Gated by the dashboard session, same
 * pattern as `folderTerrainActions.ts`.
 */
export async function loadFolderScopedActivityAction(): Promise<FolderActivityActorRow[] | null> {
  const session = await auth();
  if (!session) return null;
  return loadFolderScopedActivity();
}

/**
 * Lazy per-company drill: folder breakdown for exactly the clicked company's
 * member emails, scoped to the caller's selected project ids — bounded by
 * construction (never the account-wide company x folder cross product).
 */
export async function loadCompanyFolderBreakdownAction(
  emails: string[],
  projectIds: string[],
): Promise<CompanyFolderSlice[] | null> {
  const session = await auth();
  if (!session) return null;
  return loadCompanyFolderBreakdown(emails, projectIds);
}
