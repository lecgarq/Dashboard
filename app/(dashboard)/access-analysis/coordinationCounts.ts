/**
 * Pure aggregation for the Model-Coordination panel. Each input row is a
 * (project, status) count of coordination-classified issues. The client filters
 * rows by the shared project picker, then calls this to render the headline
 * total, the per-project ranking (with an open/closed split), and the status
 * breakdown. No React/IO.
 */
export interface CoordinationRow {
  projectId: string;
  projectName: string;
  status: string; // ACC issue status: open / closed / answered / ...
  count: number; // coordination-classified issues in this (project, status)
}

export interface CoordinationProject {
  projectId: string;
  projectName: string;
  count: number; // all coordination issues in the project
  open: number; // not-yet-resolved (open / in_review / draft / pending / answered / ...)
  closed: number; // resolved (closed / completed)
}

export interface CoordinationSummary {
  total: number;
  byProject: CoordinationProject[];
  byStatus: { status: string; count: number }[];
}

/** ACC statuses that mean the coordination issue is resolved. */
const CLOSED_STATUSES = new Set(["closed", "completed", "resolved", "void"]);

/** True when an ACC issue status represents a resolved/closed issue. */
export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status.trim().toLowerCase());
}

export function summarizeCoordination(rows: ReadonlyArray<CoordinationRow>): CoordinationSummary {
  let total = 0;
  const proj = new Map<string, CoordinationProject>();
  const stat = new Map<string, number>();

  for (const r of rows) {
    total += r.count;
    const closed = isClosedStatus(r.status);
    const p = proj.get(r.projectId);
    if (p) {
      p.count += r.count;
      if (closed) p.closed += r.count;
      else p.open += r.count;
    } else {
      proj.set(r.projectId, {
        projectId: r.projectId,
        projectName: r.projectName,
        count: r.count,
        open: closed ? 0 : r.count,
        closed: closed ? r.count : 0,
      });
    }
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
