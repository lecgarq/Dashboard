/**
 * Pure transform for the issue-fetch coverage donut (ISSUE-01).
 *
 * Input is the selection-filtered per-project rows from
 * `CoordinationByProjectData.issueCoverage.projects` (the parent applies
 * `filterRowsBySelection` from `./projectFilter` before calling this). This
 * module owns nothing about the FilterBanner cross-filter — it just turns raw
 * rows into 4 honest, fixed buckets plus per-bucket drill lists.
 *
 * Honesty guarantee: all 4 known buckets are always present in the output,
 * in a fixed order, even at count 0 — nothing is hidden or merged. A row
 * carrying a status outside the known set is NOT dropped; it surfaces as its
 * own labeled bucket using the raw status string (the status column is a
 * plain string on AccIssueProjectFetchResult, not an enum).
 */

export const COVERAGE_BUCKETS = ["ok", "zero_issues", "forbidden", "error"] as const;
export type CoverageBucket = (typeof COVERAGE_BUCKETS)[number];

/** Honest, non-euphemistic display copy per known bucket. */
export const COVERAGE_BUCKET_LABELS: Record<CoverageBucket, string> = {
  ok: "Issues fetched",
  zero_issues: "Zero issues",
  forbidden: "Forbidden",
  error: "Error",
};

export interface IssueCoverageInputRow {
  projectId: string;
  projectName: string;
  status: string;
  issueCount: number;
}

export interface IssueCoverageSlice {
  /** The bucket key — one of COVERAGE_BUCKETS, or the raw status for an unexpected value. */
  status: string;
  label: string;
  count: number;
}

export interface IssueCoverageSummary {
  /** All 4 known buckets in fixed order, plus any unexpected-status buckets appended after. */
  slices: IssueCoverageSlice[];
  projectsByStatus: Map<string, IssueCoverageInputRow[]>;
}

function sortDrillRows(rows: IssueCoverageInputRow[]): IssueCoverageInputRow[] {
  return [...rows].sort((a, b) => b.issueCount - a.issueCount || a.projectName.localeCompare(b.projectName));
}

/**
 * Summarize selection-filtered per-project issue-fetch coverage rows into the
 * 4 fixed honest buckets (+ any unexpected-status overflow bucket), each with
 * its drillable project list sorted by issueCount desc then name.
 */
export function summarizeIssueCoverage(
  projects: ReadonlyArray<IssueCoverageInputRow>,
): IssueCoverageSummary {
  const byStatus = new Map<string, IssueCoverageInputRow[]>();
  for (const row of projects) {
    const list = byStatus.get(row.status);
    if (list) list.push(row);
    else byStatus.set(row.status, [row]);
  }

  const projectsByStatus = new Map<string, IssueCoverageInputRow[]>();
  const slices: IssueCoverageSlice[] = [];

  for (const bucket of COVERAGE_BUCKETS) {
    const rows = sortDrillRows(byStatus.get(bucket) ?? []);
    projectsByStatus.set(bucket, rows);
    slices.push({ status: bucket, label: COVERAGE_BUCKET_LABELS[bucket], count: rows.length });
    byStatus.delete(bucket);
  }

  // Any remaining keys are unexpected statuses — surface honestly, don't drop.
  const extraStatuses = [...byStatus.keys()].sort();
  for (const status of extraStatuses) {
    const rows = sortDrillRows(byStatus.get(status)!);
    projectsByStatus.set(status, rows);
    slices.push({ status, label: status, count: rows.length });
  }

  return { slices, projectsByStatus };
}
