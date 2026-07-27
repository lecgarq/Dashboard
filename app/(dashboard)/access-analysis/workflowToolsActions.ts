"use server";
import { auth } from "@/server/auth";
import { loadWorkflowTools } from "@/lib/server/workflowToolsView";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

/**
 * Lazy per-tab fetch for the Reviews/RFIs/Submittals workflow-tool donuts.
 * Gated by the dashboard session, mirroring issueFunnelActions.ts's shape.
 * Fired at most once per page load on first Projects-tab activation (20.1-06
 * ref-flag pattern).
 */
export async function loadWorkflowToolsAction(): Promise<ModuleActivityRow[] | null> {
  const session = await auth();
  if (!session) return null;
  return loadWorkflowTools();
}
