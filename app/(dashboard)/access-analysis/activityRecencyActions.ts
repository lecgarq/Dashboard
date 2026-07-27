"use server";
import { auth } from "@/server/auth";
import { loadActivityRecency, type ActivityRecencyRow } from "@/lib/server/activityRecencyView";

/**
 * Lazy per-tab fetch for the ENG-01 activity-recency panel (20.1-01). Gated by
 * the dashboard session, mirroring `folderTerrainActions.ts`'s auth-gate shape.
 */
export async function loadActivityRecencyAction(): Promise<ActivityRecencyRow[] | null> {
  const session = await auth();
  if (!session) return null;
  return loadActivityRecency();
}
