import { describe, it, expect } from "vitest";
import { summarizeActivityTimeline } from "../timelineCounts";

const all = new Set<string>(["p1", "p2"]);

describe("summarizeActivityTimeline", () => {
  it("returns an empty summary when nothing is selected", () => {
    const rows = [{ projectId: "p1", month: "2024-01", count: 5 }];
    const s = summarizeActivityTimeline(rows, new Set());
    expect(s.points).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.peak).toBeNull();
    expect(s.busiestYear).toBeNull();
    expect(s.span).toBeNull();
  });

  it("sums multiple projects in the same month", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 5 },
      { projectId: "p2", month: "2024-01", count: 7 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points).toHaveLength(1);
    expect(s.points[0]).toMatchObject({ month: "2024-01", label: "Jan 2024", count: 12 });
    expect(s.total).toBe(12);
  });

  it("zero-fills missing months between the first and last", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 10 },
      { projectId: "p1", month: "2024-04", count: 4 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points.map((p) => p.month)).toEqual(["2024-01", "2024-02", "2024-03", "2024-04"]);
    expect(s.points.map((p) => p.count)).toEqual([10, 0, 0, 4]);
    expect(s.span).toEqual({ from: "2024-01", to: "2024-04" });
  });

  it("spans a year boundary", () => {
    const rows = [
      { projectId: "p1", month: "2023-11", count: 1 },
      { projectId: "p1", month: "2024-02", count: 2 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points.map((p) => p.month)).toEqual(["2023-11", "2023-12", "2024-01", "2024-02"]);
  });

  it("handles a single month (from == to)", () => {
    const rows = [{ projectId: "p1", month: "2024-06", count: 9 }];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.points).toHaveLength(1);
    expect(s.span).toEqual({ from: "2024-06", to: "2024-06" });
  });

  it("picks the earliest month on a peak tie", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 8 },
      { projectId: "p1", month: "2024-02", count: 8 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.peak).toMatchObject({ month: "2024-01", count: 8 });
  });

  it("reports the busiest year and a total equal to the sum of points", () => {
    const rows = [
      { projectId: "p1", month: "2023-01", count: 5 },
      { projectId: "p1", month: "2024-01", count: 30 },
      { projectId: "p1", month: "2024-07", count: 10 },
    ];
    const s = summarizeActivityTimeline(rows, all);
    expect(s.busiestYear).toEqual({ year: "2024", count: 40 });
    expect(s.total).toBe(s.points.reduce((a, p) => a + p.count, 0));
    expect(s.total).toBe(45);
  });

  it("excludes unselected projects", () => {
    const rows = [
      { projectId: "p1", month: "2024-01", count: 5 },
      { projectId: "p2", month: "2024-01", count: 7 },
    ];
    const s = summarizeActivityTimeline(rows, new Set(["p1"]));
    expect(s.total).toBe(5);
  });
});
