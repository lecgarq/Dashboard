"use server";
import { type ClashIssue } from "./coordinationClash";
import { loadProjectClashes as _loadProjectClashes } from "@/lib/server/projectClashView";

/**
 * Thin Server Action wrapper for the clash drill-down (BND-01 boundary fix).
 *
 * The actual query lives in lib/server/projectClashView.ts. This file keeps
 * the "use server" directive and the exact export name + signature so the
 * call site in mainCharts.tsx (which passes loadProjectClashes as the
 * loadClashes prop) is unchanged.
 *
 * NOTE: this file intentionally does NOT import @/server/db or @prisma/client.
 * Prisma access belongs in lib/server/ or server/routers/, not a route
 * Server Action.
 */
export async function loadProjectClashes(projectId: string): Promise<ClashIssue[]> {
  return _loadProjectClashes(projectId);
}
