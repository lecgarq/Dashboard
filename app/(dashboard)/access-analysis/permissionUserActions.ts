"use server";
import { auth } from "@/server/auth";
import { loadPermissionUserCounts } from "@/lib/server/permissionUserView";
import type { PermissionUserCounts } from "@/lib/server/permissionUserView";

/**
 * Auth-gated lazy fetch for the users-by-permission-level donut (Users tab),
 * mirroring `permissionLevelActions.ts`'s per-tab lazy-load pattern.
 */
export async function loadPermissionUsersAction(): Promise<PermissionUserCounts | null> {
  const session = await auth();
  if (!session) return null;
  return loadPermissionUserCounts();
}
