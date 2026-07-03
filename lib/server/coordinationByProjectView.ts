import "server-only";
import { db } from "@/server/db";
import type { CoordinationRow } from "@/lib/acc/coordinationCounts";

/** Raw per-project issue-fetch coverage row for the latest AccIssueFetchRun. */
export interface IssueCoverageProjectRow {
  projectId: string;
  projectName: string;
  status: string; // ok | zero_issues | forbidden | error (string, not an enum — see AccIssueProjectFetchResult)
  issueCount: number;
}

/** Latest run's issue-fetch coverage — raw per-project rows; bucket counting is client-side (ISSUE-01). */
export interface IssueCoverage {
  runStatus: string; // running | done | failed
  runStartedAt: string | null;
  runFinishedAt: string | null;
  projects: IssueCoverageProjectRow[];
}

export interface CoordinationByProjectData {
  rows: CoordinationRow[]; // per-(project, status) validated-coordination counts
  accessibleProjects: number; // latest run's projectsOk — for the coverage footnote
  forbiddenProjects: number; // latest run's projectsForbidden
  latestRunAt: string | null; // ISO start of the latest issue extraction — proves freshness
  coordinationCount: number; // run-reported coordination total (sanity vs the summed rows)
  /** Additive (ISSUE-01): null when no AccIssueFetchRun exists yet. */
  issueCoverage: IssueCoverage | null;
}

// "Model Coordination issue" = every issue classified as coordination by the
// backfill classifier or the clash validation pass. This is the coordination
// subset of all stored ACC issues, not the full issue table.
const CORE = { isCoordination: true };

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
      select: {
        id: true,
        status: true,
        projectsOk: true,
        projectsForbidden: true,
        startedAt: true,
        finishedAt: true,
        coordinationCount: true,
      },
    }),
  ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const rows: CoordinationRow[] = groups.map((g) => ({
    projectId: g.projectId,
    projectName: nameById.get(g.projectId) ?? g.projectId,
    status: g.status ?? "unknown",
    count: g._count.id,
  }));

  // ISSUE-01: per-project issue-fetch coverage for the latest run — raw rows only,
  // bucket counting happens client-side so the donut can obey the FilterBanner
  // project selection. Never falls back to the raw GUID as a display name.
  let issueCoverage: IssueCoverage | null = null;
  if (run) {
    const results = await db.accIssueProjectFetchResult.findMany({
      where: { runId: run.id },
      select: { projectId: true, projectName: true, status: true, issueCount: true },
    });
    issueCoverage = {
      runStatus: run.status,
      runStartedAt: run.startedAt?.toISOString() ?? null,
      runFinishedAt: run.finishedAt?.toISOString() ?? null,
      projects: results.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName ?? "Unknown project",
        status: r.status,
        issueCount: r.issueCount,
      })),
    };
  }

  const data: CoordinationByProjectData = {
    rows,
    accessibleProjects: run?.projectsOk ?? 0,
    forbiddenProjects: run?.projectsForbidden ?? 0,
    latestRunAt: run?.startedAt?.toISOString() ?? null,
    coordinationCount: run?.coordinationCount ?? 0,
    issueCoverage,
  };
  cache = { at: Date.now(), data };
  return data;
}
