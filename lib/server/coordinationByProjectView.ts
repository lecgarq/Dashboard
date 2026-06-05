import "server-only";
import { db } from "@/server/db";
import type { CoordinationRow } from "@/app/(dashboard)/access-analysis/coordinationCounts";

export interface CoordinationByProjectData {
  rows: CoordinationRow[]; // per-(project, status) validated-coordination counts
  accessibleProjects: number; // latest run's projectsOk — for the coverage footnote
  forbiddenProjects: number; // latest run's projectsForbidden
}

// "Model Coordination issue" = a coordination issue that is clash-validated OR lives
// in a Model-Coordination-enabled project (matches the headline definition).
const CORE = { isCoordination: true, OR: [{ clashValidated: true }, { projectMcEnabled: true }] };

let cache: { at: number; data: CoordinationByProjectData } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadCoordinationByProject(
  force = false,
): Promise<CoordinationByProjectData> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [groups, projects, run] = await Promise.all([
    db.accIssue.groupBy({
      by: ["projectId", "status"],
      where: CORE,
      _count: { id: true },
    }),
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accIssueFetchRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { projectsOk: true, projectsForbidden: true },
    }),
  ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const rows: CoordinationRow[] = groups.map((g) => ({
    projectId: g.projectId,
    projectName: nameById.get(g.projectId) ?? g.projectId,
    status: g.status ?? "unknown",
    count: g._count.id,
  }));

  const data: CoordinationByProjectData = {
    rows,
    accessibleProjects: run?.projectsOk ?? 0,
    forbiddenProjects: run?.projectsForbidden ?? 0,
  };
  cache = { at: Date.now(), data };
  return data;
}
