import "server-only";
import { db } from "@/server/db";

export interface CoordinationSummary {
  totalIssues: number;
  coordinationCount: number; // validated ∪ heuristic-on-MC-project
  validatedCount: number;
  byStatus: { status: string; count: number }[];
  byProject: { projectId: string; projectName: string; count: number }[];
  auditCount: number;
}

let cache: { at: number; data: CoordinationSummary } | null = null;
const TTL_MS = 5 * 60 * 1000;
const CORE = { isCoordination: true, OR: [{ clashValidated: true }, { projectMcEnabled: true }] };

export async function loadCoordinationSummary(force = false): Promise<CoordinationSummary> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [totalIssues, coordinationCount, validatedCount, auditCount, statusGroups, projGroups, projects] =
    await Promise.all([
      db.accIssue.count(),
      db.accIssue.count({ where: CORE }),
      db.accIssue.count({ where: { isCoordination: true, clashValidated: true } }),
      db.accIssue.count({ where: { isCoordination: true, clashValidated: false, confidence: "low" } }),
      db.accIssue.groupBy({ by: ["status"], where: CORE, _count: { id: true } }),
      db.accIssue.groupBy({ by: ["projectId"], where: CORE, _count: { id: true } }),
      db.accProject.findMany({ select: { id: true, name: true } }),
    ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const byStatus = statusGroups
    .map((g) => ({ status: g.status ?? "unknown", count: g._count.id }))
    .sort((a, b) => b.count - a.count);
  const byProject = projGroups
    .map((g) => ({ projectId: g.projectId, projectName: nameById.get(g.projectId) ?? g.projectId, count: g._count.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const data: CoordinationSummary = { totalIssues, coordinationCount, validatedCount, byStatus, byProject, auditCount };
  cache = { at: Date.now(), data };
  return data;
}
