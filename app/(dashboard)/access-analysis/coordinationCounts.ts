/**
 * Pure aggregation for the Model-Coordination companion widget. Each input row is
 * a (project, status) count of clash-VALIDATED coordination issues. The client
 * filters rows by the shared project picker, then calls this to render the
 * headline total, the per-project ranking, and the status breakdown. No React/IO.
 */
export interface CoordinationRow {
  projectId: string;
  projectName: string;
  status: string; // ACC issue status: open / closed / answered / ...
  count: number; // validated coordination issues in this (project, status)
}

export interface CoordinationSummary {
  total: number;
  byProject: { projectId: string; projectName: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export function summarizeCoordination(rows: ReadonlyArray<CoordinationRow>): CoordinationSummary {
  let total = 0;
  const proj = new Map<string, { projectId: string; projectName: string; count: number }>();
  const stat = new Map<string, number>();

  for (const r of rows) {
    total += r.count;
    const p = proj.get(r.projectId);
    if (p) p.count += r.count;
    else proj.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, count: r.count });
    stat.set(r.status, (stat.get(r.status) ?? 0) + r.count);
  }

  const byProject = [...proj.values()].sort(
    (a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName),
  );
  const byStatus = [...stat.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  return { total, byProject, byStatus };
}
