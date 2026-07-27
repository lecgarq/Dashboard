/**
 * Pure transforms for the issues-by-status donut (ISSUE-03) and the shared
 * coverage-caption/empty-state math both new issue-funnel charts use.
 *
 * `summarizeIssueStatus` mirrors `summarizeIssueCoverage`'s fixed-bucket +
 * honest-overflow pattern from `./issueFetchCoverageCounts.ts` (see that
 * module's header for the original honesty guarantee), but over the 8
 * verified live `AccIssue.status` values instead of 4 fetch-coverage buckets.
 *
 * Honesty guarantee: all 8 known statuses are always present in the output,
 * in a fixed order, even at count 0 — nothing is hidden or merged. A row
 * carrying a status outside the known set is NOT dropped; it surfaces as its
 * own labeled bucket using the raw status string (the status column is a
 * plain string on AccIssue, not an enum) — CONTEXT.md locked: statuses are
 * plain strings shown verbatim, no prettifying, no open/closed grouping.
 *
 * `deriveIssueCoverageCaption` computes fetched/total/unavailable numbers
 * from the already-threaded Phase 20 `IssueCoverageInputRow[]` coverage
 * rows — never hardcoded. This is the single source for both charts'
 * subtitle numbers and their empty-state distinction (plan 21-03).
 */

import type { IssueCoverageInputRow } from "./issueFetchCoverageCounts";

/** The 8 verified live statuses (REQUIREMENTS.md ISSUE-03, verified 2026-07-02). */
export const ISSUE_STATUSES = [
  "open",
  "closed",
  "completed",
  "in_review",
  "draft",
  "pending",
  "not_approved",
  "in_progress",
] as const;

export interface IssueStatusInputRow {
  projectId: string;
  projectName: string;
  status: string;
  count: number;
}

interface IssueStatusSlice {
  /** The bucket key — one of ISSUE_STATUSES, or the raw status for an unexpected value. */
  status: string;
  /** Raw status string verbatim — no prettifying, no grouping. */
  label: string;
  count: number;
}

export interface IssueStatusSummary {
  /** All 8 known statuses in fixed order, plus any unexpected-status buckets appended after. */
  slices: IssueStatusSlice[];
  /** Sum of every input row's count. */
  total: number;
  /** Per-status drill rows, sorted count desc then project name. */
  projectsByStatus: Map<string, IssueStatusInputRow[]>;
}

function sortDrillRows(rows: IssueStatusInputRow[]): IssueStatusInputRow[] {
  return [...rows].sort((a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName));
}

/** Merge rows sharing the same (projectId, status) by summing counts (defensive). */
function mergeByProject(rows: IssueStatusInputRow[]): IssueStatusInputRow[] {
  const byProject = new Map<string, IssueStatusInputRow>();
  for (const row of rows) {
    const existing = byProject.get(row.projectId);
    if (existing) existing.count += row.count;
    else byProject.set(row.projectId, { ...row });
  }
  return [...byProject.values()];
}

/**
 * Summarize per-project issue-status rows into the 8 fixed honest statuses
 * (+ any unexpected-status overflow bucket), each with its drillable project
 * list sorted by count desc then name.
 */
export function summarizeIssueStatus(
  rows: ReadonlyArray<IssueStatusInputRow>,
): IssueStatusSummary {
  const byStatus = new Map<string, IssueStatusInputRow[]>();
  let total = 0;
  for (const row of rows) {
    total += row.count;
    const list = byStatus.get(row.status);
    if (list) list.push(row);
    else byStatus.set(row.status, [row]);
  }

  const projectsByStatus = new Map<string, IssueStatusInputRow[]>();
  const slices: IssueStatusSlice[] = [];

  for (const status of ISSUE_STATUSES) {
    const merged = mergeByProject(byStatus.get(status) ?? []);
    const drillRows = sortDrillRows(merged);
    const count = drillRows.reduce((sum, r) => sum + r.count, 0);
    projectsByStatus.set(status, drillRows);
    slices.push({ status, label: status, count });
    byStatus.delete(status);
  }

  // Any remaining keys are unexpected statuses — surface honestly, don't drop.
  const extraStatuses = [...byStatus.keys()].sort();
  for (const status of extraStatuses) {
    const merged = mergeByProject(byStatus.get(status)!);
    const drillRows = sortDrillRows(merged);
    const count = drillRows.reduce((sum, r) => sum + r.count, 0);
    projectsByStatus.set(status, drillRows);
    slices.push({ status, label: status, count });
  }

  return { slices, total, projectsByStatus };
}

export interface IssueCoverageCaption {
  fetched: number;
  total: number;
  unavailable: number;
}

/**
 * Derive the fetched/total/unavailable caption numbers from live coverage
 * rows. `fetched` counts "ok" and "zero_issues" statuses — a fetch that
 * found zero issues is still an honest, completed fetch, not a gap.
 * `unavailable` = total - fetched, which covers "forbidden", "error", AND
 * any unexpected status string: an unconfirmed fetch is never claimed as
 * covered just because its status wasn't recognized.
 */
export function deriveIssueCoverageCaption(
  projects: ReadonlyArray<IssueCoverageInputRow>,
): IssueCoverageCaption {
  const total = projects.length;
  const fetched = projects.filter((p) => p.status === "ok" || p.status === "zero_issues").length;
  const unavailable = total - fetched;
  return { fetched, total, unavailable };
}
