import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findProjects: vi.fn(),
  findDcProjects: vi.fn(),
  findRun: vi.fn(),
  findFetchResults: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    accIssue: { groupBy: mocks.groupBy },
    accProject: { findMany: mocks.findProjects },
    accDcProject: { findMany: mocks.findDcProjects },
    accIssueFetchRun: { findFirst: mocks.findRun },
    accIssueProjectFetchResult: { findMany: mocks.findFetchResults },
  },
}));

import { loadCoordinationByProject } from "./coordinationByProjectView";

describe("loadCoordinationByProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.groupBy.mockResolvedValue([
      { projectId: "p1", status: "open", _count: { id: 7 } },
    ]);
    mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Project One" }]);
    mocks.findDcProjects.mockResolvedValue([]);
    mocks.findRun.mockResolvedValue({
      id: "run1",
      status: "done",
      projectsOk: 554,
      projectsForbidden: 0,
      startedAt: new Date("2026-06-08T17:35:12.992Z"),
      finishedAt: new Date("2026-06-08T17:40:00.000Z"),
      coordinationCount: 1661,
    });
    mocks.findFetchResults.mockResolvedValue([
      { projectId: "p1", projectName: "Project One", status: "ok", issueCount: 12 },
      { projectId: "p2", projectName: null, status: "error", issueCount: 0 },
    ]);
  });

  it("loads all coordination-classified issues for the Model Coordination widget", async () => {
    await loadCoordinationByProject(true);

    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ["projectId", "status"],
      where: { isCoordination: true },
      _count: { id: true },
    });
  });

  it("surfaces the latest extraction timestamp and coordination count for freshness", async () => {
    const data = await loadCoordinationByProject(true);
    expect(data.latestRunAt).toBe("2026-06-08T17:35:12.992Z");
    expect(data.coordinationCount).toBe(1661);
  });

  describe("project name resolution (20-05 gap fix — no raw GUID leakage into the picker)", () => {
    it("falls back to AccDcProject when a coordination project has no AccProject name", async () => {
      mocks.groupBy.mockResolvedValue([
        { projectId: "p1", status: "open", _count: { id: 7 } },
        { projectId: "dc-only", status: "open", _count: { id: 3 } },
      ]);
      mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Project One" }]);
      mocks.findDcProjects.mockResolvedValue([{ id: "dc-only", name: "DC Only Project" }]);

      const data = await loadCoordinationByProject(true);
      const dcRow = data.rows.find((r) => r.projectId === "dc-only");
      expect(dcRow?.projectName).toBe("DC Only Project");
    });

    it("renders 'Unknown project' — never the raw GUID — when no name source has the id", async () => {
      mocks.groupBy.mockResolvedValue([
        { projectId: "nameless-id", status: "open", _count: { id: 1 } },
      ]);
      mocks.findProjects.mockResolvedValue([]);
      mocks.findDcProjects.mockResolvedValue([]);

      const data = await loadCoordinationByProject(true);
      expect(data.rows[0].projectName).toBe("Unknown project");
      expect(data.rows[0].projectName).not.toBe("nameless-id");
    });

    it("prefers AccProject over AccDcProject when both have the same id", async () => {
      mocks.groupBy.mockResolvedValue([
        { projectId: "p1", status: "open", _count: { id: 7 } },
      ]);
      mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Live Name" }]);
      mocks.findDcProjects.mockResolvedValue([{ id: "p1", name: "Stale DC Name" }]);

      const data = await loadCoordinationByProject(true);
      expect(data.rows[0].projectName).toBe("Live Name");
    });
  });

  describe("issueCoverage (ISSUE-01, additive)", () => {
    it("populates issueCoverage.projects from the latest run's fetch results, falling back to 'Unknown project' for a null name", async () => {
      const data = await loadCoordinationByProject(true);
      expect(data.issueCoverage).not.toBeNull();
      expect(data.issueCoverage?.runStatus).toBe("done");
      expect(data.issueCoverage?.runStartedAt).toBe("2026-06-08T17:35:12.992Z");
      expect(data.issueCoverage?.runFinishedAt).toBe("2026-06-08T17:40:00.000Z");
      expect(data.issueCoverage?.projects).toEqual([
        { projectId: "p1", projectName: "Project One", status: "ok", issueCount: 12 },
        { projectId: "p2", projectName: "Unknown project", status: "error", issueCount: 0 },
      ]);
    });

    it("scopes the fetch-result query to the latest run's id", async () => {
      await loadCoordinationByProject(true);
      expect(mocks.findFetchResults).toHaveBeenCalledWith({
        where: { runId: "run1" },
        select: { projectId: true, projectName: true, status: true, issueCount: true },
      });
    });

    it("returns issueCoverage null and skips the fetch-result query when no run exists", async () => {
      mocks.findRun.mockResolvedValue(null);
      const data = await loadCoordinationByProject(true);
      expect(data.issueCoverage).toBeNull();
      expect(mocks.findFetchResults).not.toHaveBeenCalled();
    });
  });
});
