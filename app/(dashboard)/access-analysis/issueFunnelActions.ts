"use server";
import { auth } from "@/server/auth";
import { loadIssueFunnel, type IssueFunnelData } from "@/lib/server/issueFunnelView";

/**
 * Lazy per-tab fetch for the Phase 21 issue-funnel charts (ISSUE-02/03).
 * Gated by the dashboard session, mirroring activityRecencyActions.ts's shape.
 * Fired at most once per page load on first Projects-tab activation (20.1-06
 * ref-flag pattern — wired in plan 21-04).
 */
export async function loadIssueFunnelAction(): Promise<IssueFunnelData | null> {
  const session = await auth();
  if (!session) return null;
  return loadIssueFunnel();
}
