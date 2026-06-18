import type { ProjectCoverage } from "@/lib/server/projectCoverageView";

export interface ActivityCoverage {
  covered: number;
  total: number;
}

/**
 * Account-wide activity coverage from the per-project coverage rows.
 * covered = projects with recorded activity; total = all coverage rows
 * (≈ the full project universe, since loadProjectCoverage unions accProject).
 * Pure — no query. Returns { covered: 0, total: 0 } for empty/undefined input.
 */
export function activityCoverageCounts(
  coverage?: ReadonlyArray<ProjectCoverage>,
): ActivityCoverage {
  const rows = coverage ?? [];
  return { total: rows.length, covered: rows.filter((c) => c.hasActivity).length };
}
