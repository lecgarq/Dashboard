import "server-only";
import { db } from "@/server/db";
import type { ModuleActivityRow } from "@/app/(dashboard)/access-analysis/moduleCounts";

/** Label for the synthetic project that holds account-level (admin) activity. */
const ACCOUNT_LEVEL = "Account-level";

let cache: { at: number; rows: ModuleActivityRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Compact per-(project, rawAction) activity counts for the modules donut. One
 * grouped query over ~990k AccActivity rows collapses to ~2.8k rows (~200 KB),
 * which the client re-buckets into modules — the same ship-and-rebucket shape as
 * the roles view. Includes unattributed rows (this is activity volume, not user
 * counts); admin rows (empty/null projectId) fold into an "Account-level" project.
 */
export async function loadModuleActivity(force = false): Promise<ModuleActivityRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects] = await Promise.all([
    db.accActivity.groupBy({ by: ["projectId", "rawAction"], _count: { id: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ModuleActivityRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : nameById.get(projectId) ?? projectId;
    return { projectId, projectName, rawAction: p.rawAction, count: p._count.id };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
