import { describe, it, expect } from "vitest";
import { summarizeCoordination, type CoordinationRow } from "../coordinationCounts";

const rows: CoordinationRow[] = [
  { projectId: "a", projectName: "Alpha", status: "open", count: 10 },
  { projectId: "a", projectName: "Alpha", status: "closed", count: 5 },
  { projectId: "b", projectName: "Bravo", status: "open", count: 8 },
  { projectId: "c", projectName: "Charlie", status: "answered", count: 2 },
];

describe("summarizeCoordination", () => {
  it("totals all counts", () => {
    expect(summarizeCoordination(rows).total).toBe(25);
  });

  it("aggregates per project (merging statuses), sorted by count desc", () => {
    expect(summarizeCoordination(rows).byProject).toEqual([
      { projectId: "a", projectName: "Alpha", count: 15 },
      { projectId: "b", projectName: "Bravo", count: 8 },
      { projectId: "c", projectName: "Charlie", count: 2 },
    ]);
  });

  it("aggregates per status, sorted by count desc", () => {
    expect(summarizeCoordination(rows).byStatus).toEqual([
      { status: "open", count: 18 },
      { status: "closed", count: 5 },
      { status: "answered", count: 2 },
    ]);
  });

  it("is empty-safe", () => {
    expect(summarizeCoordination([])).toEqual({ total: 0, byProject: [], byStatus: [] });
  });

  it("breaks count ties by name (project) and status string alphabetically", () => {
    const tie: CoordinationRow[] = [
      { projectId: "y", projectName: "Yankee", status: "open", count: 3 },
      { projectId: "x", projectName: "X-ray", status: "closed", count: 3 },
    ];
    const s = summarizeCoordination(tie);
    expect(s.byProject.map((p) => p.projectName)).toEqual(["X-ray", "Yankee"]);
    expect(s.byStatus.map((x) => x.status)).toEqual(["closed", "open"]);
  });
});
