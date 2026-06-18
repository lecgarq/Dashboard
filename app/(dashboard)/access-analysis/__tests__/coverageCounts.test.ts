// @vitest-environment node
/**
 * NA-01 — activityCoverageCounts pure helper tests.
 */
import { describe, it, expect } from "vitest";
import { activityCoverageCounts } from "../coverageCounts";

describe("activityCoverageCounts", () => {
  it("returns { covered: 0, total: 0 } for undefined input", () => {
    expect(activityCoverageCounts(undefined)).toEqual({ covered: 0, total: 0 });
  });

  it("returns { covered: 0, total: 0 } for empty array", () => {
    expect(activityCoverageCounts([])).toEqual({ covered: 0, total: 0 });
  });

  it("counts covered as projects with hasActivity=true, total as all rows", () => {
    const coverage = [
      { projectId: "a", hasActivity: true, folderCrawled: false, fileCrawled: false },
      { projectId: "b", hasActivity: true, folderCrawled: true, fileCrawled: true },
      { projectId: "c", hasActivity: false, folderCrawled: true, fileCrawled: false },
    ];
    expect(activityCoverageCounts(coverage)).toEqual({ covered: 2, total: 3 });
  });

  it("returns { covered: 0, total: N } when no project has activity", () => {
    const coverage = [
      { projectId: "x", hasActivity: false, folderCrawled: false, fileCrawled: false },
      { projectId: "y", hasActivity: false, folderCrawled: true, fileCrawled: false },
    ];
    expect(activityCoverageCounts(coverage)).toEqual({ covered: 0, total: 2 });
  });

  it("returns { covered: N, total: N } when all projects have activity", () => {
    const coverage = [
      { projectId: "p", hasActivity: true, folderCrawled: false, fileCrawled: false },
      { projectId: "q", hasActivity: true, folderCrawled: false, fileCrawled: false },
    ];
    expect(activityCoverageCounts(coverage)).toEqual({ covered: 2, total: 2 });
  });
});
