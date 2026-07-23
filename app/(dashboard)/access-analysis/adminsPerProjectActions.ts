"use server";
import { auth } from "@/server/auth";
import { loadAdminsPerProject } from "@/lib/server/adminsPerProjectView";
import type { AdminsPerProjectData } from "@/lib/server/adminsPerProjectView";

/**
 * Auth-gated lazy fetch for the admins-per-project panel (owner ask
 * 2026-07-23), mirroring `permissionLevelActions.ts`'s per-tab lazy-load
 * pattern — fetched once on first Projects-tab activation.
 */
export async function loadAdminsPerProjectAction(): Promise<AdminsPerProjectData | null> {
  const session = await auth();
  if (!session) return null;
  return loadAdminsPerProject();
}
