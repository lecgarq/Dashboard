import { describe, it, expect } from "vitest";
import {
  COVERAGE_BUCKETS,
  COVERAGE_BUCKET_LABELS,
  summarizeIssueCoverage,
  type IssueCoverageInputRow,
} from "../issueFetchCoverageCounts";

const row = (over: Partial<IssueCoverageInputRow> = {}): IssueCoverageInputRow => ({
  projectId: "p1",
  projectName: "Project One",
  status: "ok",
  issueCount: 5,
  ...over,
});

describe("summarizeIssueCoverage", () => {
  it("always includes all 4 known buckets in fixed order, even when one is absent from input", () => {
    const summary = summarizeIssueCoverage([
      row({ projectId: "p1", status: "ok", issueCount: 12 }),
      row({ projectId: "p2", status: "error", issueCount: 0 }),
    ]);
    expect(summary.slices.map((s) => s.status)).toEqual([...COVERAGE_BUCKETS]);
    const byStatus = new Map(summary.slices.map((s) => [s.status, s.count]));
    expect(byStatus.get("ok")).toBe(1);
    expect(byStatus.get("zero_issues")).toBe(0); // absent from input — zero kept, not dropped
    expect(byStatus.get("forbidden")).toBe(0);
    expect(byStatus.get("error")).toBe(1);
  });

  it("keeps zero counts for every bucket on an empty input", () => {
    const summary = summarizeIssueCoverage([]);
    expect(summary.slices).toHaveLength(4);
    expect(summary.slices.every((s) => s.count === 0)).toBe(true);
  });

  it("uses the honest, non-euphemistic label copy per bucket", () => {
    const summary = summarizeIssueCoverage([]);
    const labelByStatus = new Map(summary.slices.map((s) => [s.status, s.label]));
    expect(labelByStatus.get("ok")).toBe(COVERAGE_BUCKET_LABELS.ok);
    expect(labelByStatus.get("zero_issues")).toBe(COVERAGE_BUCKET_LABELS.zero_issues);
    expect(labelByStatus.get("forbidden")).toBe(COVERAGE_BUCKET_LABELS.forbidden);
    expect(labelByStatus.get("error")).toBe(COVERAGE_BUCKET_LABELS.error);
  });

  it("drill list includes ok and zero_issues rows (every bucket is drillable)", () => {
    const summary = summarizeIssueCoverage([
      row({ projectId: "p1", projectName: "Alpha", status: "ok", issueCount: 12 }),
      row({ projectId: "p2", projectName: "Beta", status: "zero_issues", issueCount: 0 }),
    ]);
    expect(summary.projectsByStatus.get("ok")?.map((r) => r.projectId)).toEqual(["p1"]);
    expect(summary.projectsByStatus.get("zero_issues")?.map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("surfaces an unexpected status value as its own labeled bucket rather than dropping it", () => {
    const summary = summarizeIssueCoverage([
      row({ projectId: "p1", status: "ok", issueCount: 1 }),
      row({ projectId: "p9", status: "weird_status", issueCount: 3 }),
    ]);
    const extra = summary.slices.find((s) => s.status === "weird_status");
    expect(extra).toBeDefined();
    expect(extra?.label).toBe("weird_status");
    expect(extra?.count).toBe(1);
    expect(summary.projectsByStatus.get("weird_status")?.[0]?.projectId).toBe("p9");
    // Still 4 known buckets + 1 overflow bucket — nothing silently dropped.
    expect(summary.slices).toHaveLength(5);
  });

  it("sorts drill rows within a bucket by issueCount desc then project name", () => {
    const summary = summarizeIssueCoverage([
      row({ projectId: "p1", projectName: "Zeta", status: "ok", issueCount: 5 }),
      row({ projectId: "p2", projectName: "Alpha", status: "ok", issueCount: 5 }),
      row({ projectId: "p3", projectName: "Beta", status: "ok", issueCount: 20 }),
    ]);
    expect(summary.projectsByStatus.get("ok")?.map((r) => r.projectId)).toEqual(["p3", "p2", "p1"]);
  });

  it("bounds bucket counts by the number of input rows (aggregate-shaped, no fabrication)", () => {
    const projects: IssueCoverageInputRow[] = [
      row({ projectId: "p1", status: "ok" }),
      row({ projectId: "p2", status: "error" }),
      row({ projectId: "p3", status: "error" }),
    ];
    const summary = summarizeIssueCoverage(projects);
    const total = summary.slices.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBe(projects.length);
  });
});
