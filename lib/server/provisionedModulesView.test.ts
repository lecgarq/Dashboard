import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findMembers: vi.fn(),
  findProjects: vi.fn(),
  findDcProjects: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    accProjectMember: { findMany: mocks.findMembers },
    accProject: { findMany: mocks.findProjects },
    accDcProject: { findMany: mocks.findDcProjects },
  },
}));

import { loadProvisionedModules } from "./provisionedModulesView";

describe("loadProvisionedModules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMembers.mockResolvedValue([]);
    mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Project One" }]);
    mocks.findDcProjects.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // (a) Aggregate-bound assertion (VALIDATION.md requirement) -- output rows
  // must be <= P x 10 and (projectId, moduleId)-unique, never one row per member.
  // -------------------------------------------------------------------------
  it("bounds output to P x 10 and never emits a duplicate (projectId, moduleId) row", async () => {
    mocks.findProjects.mockResolvedValue([
      { id: "p1", name: "Project One" },
      { id: "p2", name: "Project Two" },
    ]);
    // 5 members across p1/p2, each granted docs -- should collapse to at most
    // 2 (project, module) rows, never 5.
    mocks.findMembers.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        projectId: i % 2 === 0 ? "p1" : "p2",
        products: { docs: "member" },
      })),
    );

    const rows = await loadProvisionedModules(true);
    expect(rows.length).toBeLessThanOrEqual(2 * 10);
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.projectId}::${r.moduleId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(rows.length).toBe(2); // p1/docs, p2/docs
  });

  // -------------------------------------------------------------------------
  // (b) Grant counting: two members in the same project both granted docs
  // accumulate into one row with count 2; "none"/"" access excluded.
  // -------------------------------------------------------------------------
  it("counts multiple member grants for the same (project, module) and excludes none/empty access", async () => {
    mocks.findMembers.mockResolvedValue([
      { projectId: "p1", products: { docs: "member" } },
      { projectId: "p1", products: { docs: "administrator" } },
      { projectId: "p1", products: { docs: "none" } }, // excluded by reduceModules
      { projectId: "p1", products: { build: "" } }, // excluded by reduceModules
    ]);

    const rows = await loadProvisionedModules(true);
    expect(rows).toEqual([{ projectId: "p1", projectName: "Project One", moduleId: "dataManagement", count: 2 }]);
  });

  // -------------------------------------------------------------------------
  // (c) Null/malformed products tolerated -- undercounts, never throws.
  // -------------------------------------------------------------------------
  it("tolerates null and non-string-valued products blobs without throwing", async () => {
    mocks.findMembers.mockResolvedValue([
      { projectId: "p1", products: null },
      { projectId: "p1", products: { docs: 42 } }, // non-string value, filtered out
      { projectId: "p1", products: "not-an-object" },
      { projectId: "p1", products: { docs: "member" } }, // the only real grant
    ]);

    await expect(loadProvisionedModules(true)).resolves.not.toThrow();
    const result = await loadProvisionedModules(true);
    expect(result).toEqual([{ projectId: "p1", projectName: "Project One", moduleId: "dataManagement", count: 1 }]);
  });

  // -------------------------------------------------------------------------
  // (d) Name resolution: AccProject wins; id in neither table -> "Unknown project".
  // -------------------------------------------------------------------------
  describe("project name resolution (never a raw GUID)", () => {
    it("resolves a DC-only project id via AccDcProject", async () => {
      mocks.findProjects.mockResolvedValue([]);
      mocks.findDcProjects.mockResolvedValue([{ id: "dc-only", name: "DC Only Project" }]);
      mocks.findMembers.mockResolvedValue([{ projectId: "dc-only", products: { docs: "member" } }]);

      const rows = await loadProvisionedModules(true);
      expect(rows[0].projectName).toBe("DC Only Project");
    });

    it("falls back to 'Unknown project' -- never the raw GUID -- when no source has the id", async () => {
      mocks.findProjects.mockResolvedValue([]);
      mocks.findDcProjects.mockResolvedValue([]);
      mocks.findMembers.mockResolvedValue([{ projectId: "nameless-id", products: { docs: "member" } }]);

      const rows = await loadProvisionedModules(true);
      expect(rows[0].projectName).toBe("Unknown project");
      expect(rows[0].projectName).not.toBe("nameless-id");
    });

    it("prefers AccProject over AccDcProject when both have the same id", async () => {
      mocks.findProjects.mockResolvedValue([{ id: "p1", name: "Live Name" }]);
      mocks.findDcProjects.mockResolvedValue([{ id: "p1", name: "Stale DC Name" }]);
      mocks.findMembers.mockResolvedValue([{ projectId: "p1", products: { docs: "member" } }]);

      const rows = await loadProvisionedModules(true);
      expect(rows[0].projectName).toBe("Live Name");
    });
  });

  // -------------------------------------------------------------------------
  // (e) Cache: second call without `force` does not re-query.
  // -------------------------------------------------------------------------
  it("caches results and does not re-query without force", async () => {
    mocks.findMembers.mockResolvedValue([{ projectId: "p1", products: { docs: "member" } }]);

    await loadProvisionedModules(true);
    expect(mocks.findMembers).toHaveBeenCalledTimes(1);

    await loadProvisionedModules();
    expect(mocks.findMembers).toHaveBeenCalledTimes(1); // no re-query

    await loadProvisionedModules(true);
    expect(mocks.findMembers).toHaveBeenCalledTimes(2); // force re-queries
  });
});
