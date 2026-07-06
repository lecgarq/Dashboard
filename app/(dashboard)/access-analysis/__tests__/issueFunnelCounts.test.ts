import { describe, it, expect } from "vitest";
import {
  ISSUE_STATUSES,
  summarizeIssueStatus,
  deriveIssueCoverageCaption,
  type IssueStatusInputRow,
} from "../issueFunnelCounts";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

const statusRow = (over: Partial<IssueStatusInputRow> = {}): IssueStatusInputRow => ({
  projectId: "p1",
  projectName: "Project One",
  status: "open",
  count: 5,
  ...over,
});

const coverageRow = (over: Partial<IssueCoverageInputRow> = {}): IssueCoverageInputRow => ({
  projectId: "p1",
  projectName: "Project One",
  status: "ok",
  issueCount: 5,
  ...over,
});

describe("summarizeIssueStatus", () => {
  it("always emits all 8 known statuses in fixed order, even at count 0", () => {
    const summary = summarizeIssueStatus([
      statusRow({ projectId: "p1", status: "open", count: 12 }),
      statusRow({ projectId: "p2", status: "closed", count: 3 }),
    ]);
    expect(summary.slices.map((s) => s.status)).toEqual([...ISSUE_STATUSES]);
    const byStatus = new Map(summary.slices.map((s) => [s.status, s.count]));
    expect(byStatus.get("open")).toBe(12);
    expect(byStatus.get("closed")).toBe(3);
    for (const absent of ["completed", "in_review", "draft", "pending", "not_approved", "in_progress"]) {
      expect(byStatus.get(absent)).toBe(0);
      expect(summary.projectsByStatus.get(absent)).toEqual([]);
    }
  });

  it("surfaces an unexpected status string as its own appended bucket, never dropped or merged", () => {
    const summary = summarizeIssueStatus([
      statusRow({ projectId: "p1", status: "open", count: 1 }),
      statusRow({ projectId: "p9", status: "weird_new_status", count: 7 }),
    ]);
    expect(summary.slices).toHaveLength(9);
    expect(summary.slices.slice(0, 8).map((s) => s.status)).toEqual([...ISSUE_STATUSES]);
    const extra = summary.slices[8];
    expect(extra.status).toBe("weird_new_status");
    expect(extra.label).toBe("weird_new_status");
    expect(extra.count).toBe(7);
    expect(summary.projectsByStatus.get("weird_new_status")?.[0]?.projectId).toBe("p9");
  });

  it("aggregates counts across projects into one status slice; total sums all input counts", () => {
    const rows = [
      statusRow({ projectId: "p1", projectName: "Alpha", status: "open", count: 10 }),
      statusRow({ projectId: "p2", projectName: "Beta", status: "open", count: 4 }),
      statusRow({ projectId: "p3", projectName: "Gamma", status: "closed", count: 2 }),
    ];
    const summary = summarizeIssueStatus(rows);
    const byStatus = new Map(summary.slices.map((s) => [s.status, s.count]));
    expect(byStatus.get("open")).toBe(14);
    expect(byStatus.get("closed")).toBe(2);
    expect(summary.total).toBe(16);
  });

  it("sorts drill rows within a status by count desc then project name asc", () => {
    const summary = summarizeIssueStatus([
      statusRow({ projectId: "p1", projectName: "Zeta", status: "open", count: 5 }),
      statusRow({ projectId: "p2", projectName: "Alpha", status: "open", count: 5 }),
      statusRow({ projectId: "p3", projectName: "Beta", status: "open", count: 20 }),
    ]);
    expect(summary.projectsByStatus.get("open")?.map((r) => r.projectId)).toEqual(["p3", "p2", "p1"]);
  });

  it("handles empty input without throwing: 8 zero slices, total 0, all drill lists empty", () => {
    const summary = summarizeIssueStatus([]);
    expect(summary.slices).toHaveLength(8);
    expect(summary.slices.every((s) => s.count === 0)).toBe(true);
    expect(summary.total).toBe(0);
    for (const status of ISSUE_STATUSES) {
      expect(summary.projectsByStatus.get(status)).toEqual([]);
    }
  });
});

describe("deriveIssueCoverageCaption", () => {
  it("counts fetched as ok+zero_issues; unavailable = total - fetched (unexpected status included)", () => {
    const projects: IssueCoverageInputRow[] = [
      coverageRow({ projectId: "p1", status: "ok" }),
      coverageRow({ projectId: "p2", status: "zero_issues" }),
      coverageRow({ projectId: "p3", status: "forbidden" }),
      coverageRow({ projectId: "p4", status: "error" }),
      coverageRow({ projectId: "p5", status: "weird_status" }),
    ];
    const caption = deriveIssueCoverageCaption(projects);
    expect(caption.total).toBe(5);
    expect(caption.fetched).toBe(2);
    expect(caption.unavailable).toBe(3);
  });

  it("returns all zeros for empty input", () => {
    expect(deriveIssueCoverageCaption([])).toEqual({ fetched: 0, total: 0, unavailable: 0 });
  });
});
