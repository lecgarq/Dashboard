import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findProjects: vi.fn(),
  findRun: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    accIssue: { groupBy: mocks.groupBy },
    accProject: { findMany: mocks.findProjects },
    accIssueFetchRun: { findFirst: mocks.findRun },
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
    mocks.findRun.mockResolvedValue({
      projectsOk: 554,
      projectsForbidden: 0,
      startedAt: new Date("2026-06-08T17:35:12.992Z"),
      coordinationCount: 1661,
    });
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
});
