"use server";
import { auth } from "@/server/auth";
import { loadPermissionLevel } from "@/lib/server/permissionLevelView";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";

/**
 * Auth-gated lazy fetch for the permission-volume-by-level panel (PERM-01
 * reframe), mirroring `folderTerrainActions.ts`'s per-tab lazy-load pattern.
 * Built unmounted here; plan 20.1-06 wires this action into the Roles tab.
 */
export async function loadPermissionLevelAction(): Promise<PermissionLevelRow[] | null> {
  const session = await auth();
  if (!session) return null;
  return loadPermissionLevel();
}
