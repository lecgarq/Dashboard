import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  groupBy: vi.fn(),
  findProjects: vi.fn(),
  findDcProjects: vi.fn(),
  accIssueFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    accIssue: { groupBy: mocks.groupBy, findMany: mocks.accIssueFindMany },
    accProject: { findMany: mocks.findProjects },
    accDcProject: { findMany: mocks.findDcProjects },
  },
}));

import { loadIssueFunnel } from "./issueFunnelView";

describe("loadIssueFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([
      { projectId: "p1", month: "2026-05", count: 3 },
      { projectId: "p1", month: "2026-06", count: 5 },
    ]);
    mocks.groupBy.mockResolvedValue([
      { projectId: "p1", status: "open", _count: { id: 4 } },
      { projectId: "p1", status: "closed", _count: { id: 4 } },
    ]);
    mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Project One" }]);
    mocks.findDcProjects.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // (a) Aggregate-bound assertion — TEST-01-class OOM-guard rule (roadmap
  // success criterion 4). Output must be a 1:1 mapping of the aggregate rows,
  // never expanded, and must never fall back to a raw findMany scan.
  // -------------------------------------------------------------------------
  it("bounds monthRows/statusRows to the aggregate row count, never a raw AccIssue scan", async () => {
    mocks.queryRaw.mockResolvedValue([
      { projectId: "p1", month: "2026-05", count: 3 },
      { projectId: "p1", month: "2026-06", count: 5 },
      { projectId: "p2", month: "2026-06", count: 1 },
    ]);
    mocks.groupBy.mockResolvedValue([
      { projectId: "p1", status: "open", _count: { id: 4 } },
      { projectId: "p1", status: "closed", _count: { id: 4 } },
      { projectId: "p2", status: "in_review", _count: { id: 1 } },
    ]);

    const data = await loadIssueFunnel(true);

    expect(data.monthRows.length).toBe(3);
    expect(data.statusRows.length).toBe(3);
    expect(mocks.accIssueFindMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // (b) Null-date guard — pins the WHERE clause against regression.
  // -------------------------------------------------------------------------
  it("filters null createdAt out of the month cut via a date_trunc('month', ...) WHERE clause", async () => {
    await loadIssueFunnel(true);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = strings.join("");
    expect(sql).toContain("IS NOT NULL");
    expect(sql).toContain("date_trunc('month'");
  });

  // -------------------------------------------------------------------------
  // (c) Name resolution — AccProject over AccDcProject, "Unknown project" fallback.
  // -------------------------------------------------------------------------
  describe("project name resolution (never a raw GUID)", () => {
    it("resolves a DC-only project id via AccDcProject", async () => {
      mocks.queryRaw.mockResolvedValue([{ projectId: "dc-only", month: "2026-06", count: 2 }]);
      mocks.groupBy.mockResolvedValue([
        { projectId: "dc-only", status: "open", _count: { id: 2 } },
      ]);
      mocks.findProjects.mockResolvedValue([]);
      mocks.findDcProjects.mockResolvedValue([{ id: "dc-only", name: "DC Only Project" }]);

      const data = await loadIssueFunnel(true);
      expect(data.monthRows[0].projectName).toBe("DC Only Project");
      expect(data.statusRows[0].projectName).toBe("DC Only Project");
    });

    it("falls back to 'Unknown project' — never the raw GUID — when no source has the id", async () => {
      mocks.queryRaw.mockResolvedValue([{ projectId: "nameless-id", month: "2026-06", count: 1 }]);
      mocks.groupBy.mockResolvedValue([
        { projectId: "nameless-id", status: "open", _count: { id: 1 } },
      ]);
      mocks.findProjects.mockResolvedValue([]);
      mocks.findDcProjects.mockResolvedValue([]);

      const data = await loadIssueFunnel(true);
      expect(data.monthRows[0].projectName).toBe("Unknown project");
      expect(data.monthRows[0].projectName).not.toBe("nameless-id");
      expect(data.statusRows[0].projectName).toBe("Unknown project");
      expect(data.statusRows[0].projectName).not.toBe("nameless-id");
    });

    it("prefers AccProject over AccDcProject when both have the same id", async () => {
      mocks.queryRaw.mockResolvedValue([{ projectId: "p1", month: "2026-06", count: 1 }]);
      mocks.groupBy.mockResolvedValue([{ projectId: "p1", status: "open", _count: { id: 1 } }]);
      mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Live Name" }]);
      mocks.findDcProjects.mockResolvedValue([{ id: "p1", name: "Stale DC Name" }]);

      const data = await loadIssueFunnel(true);
      expect(data.monthRows[0].projectName).toBe("Live Name");
    });
  });

  // -------------------------------------------------------------------------
  // (d) Null-status passthrough — never dropped.
  // -------------------------------------------------------------------------
  it("coalesces a null status to 'unknown' with its count intact, never dropping the row", async () => {
    mocks.groupBy.mockResolvedValue([
      { projectId: "p1", status: null, _count: { id: 9 } },
    ]);

    const data = await loadIssueFunnel(true);
    expect(data.statusRows).toHaveLength(1);
    expect(data.statusRows[0].status).toBe("unknown");
    expect(data.statusRows[0].count).toBe(9);
  });

  it("does not filter on isCoordination (full AccIssue set, unlike coordinationByProjectView)", async () => {
    await loadIssueFunnel(true);
    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ["projectId", "status"],
      _count: { id: true },
    });
  });
});
