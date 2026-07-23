import { describe, expect, it } from "vitest";
import { assembleAdminsPerProject } from "./adminsPerProjectView";

const NAMES = new Map([
  ["p1", "Alpha"],
  ["p2", "Beta"],
  ["p3", "Gamma"],
]);

describe("assembleAdminsPerProject", () => {
  it("groups admin pairs per project, sorted by admin count desc", () => {
    const data = assembleAdminsPerProject({
      pairs: [
        { projectId: "p1", email: "a@x.com", name: "A", fromMember: true, fromDc: false },
        { projectId: "p2", email: "a@x.com", name: "A", fromMember: true, fromDc: true },
        { projectId: "p2", email: "b@x.com", name: "B", fromMember: false, fromDc: true },
      ],
      unresolved: [],
      memberCoveredIds: ["p1", "p2"],
      dcCoveredIds: ["p2"],
      totalProjects: 3,
      projectNames: NAMES,
    });
    expect(data.rows.map((r) => [r.projectId, r.adminCount])).toEqual([
      ["p2", 2],
      ["p1", 1],
    ]);
    expect(data.rows[0].projectName).toBe("Beta");
    expect(data.coveredProjects).toBe(2);
    expect(data.totalProjects).toBe(3);
  });

  it("keeps unresolved DC admins visible, including unresolved-only projects", () => {
    const data = assembleAdminsPerProject({
      pairs: [],
      unresolved: [{ projectId: "p3", missing: 2 }],
      memberCoveredIds: [],
      dcCoveredIds: ["p3"],
      totalProjects: 3,
      projectNames: NAMES,
    });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      projectId: "p3",
      adminCount: 0,
      unresolvedDcAdmins: 2,
    });
    // Unresolved-only projects are NOT zero-admin red flags — admins exist,
    // their emails don't resolve.
    expect(data.zeroAdminProjects).toEqual([]);
  });

  it("flags covered projects with no admins at all", () => {
    const data = assembleAdminsPerProject({
      pairs: [
        { projectId: "p1", email: "a@x.com", name: "A", fromMember: true, fromDc: false },
      ],
      unresolved: [],
      memberCoveredIds: ["p1", "p2"],
      dcCoveredIds: [],
      totalProjects: 3,
      projectNames: NAMES,
    });
    expect(data.zeroAdminProjects).toEqual([{ projectId: "p2", projectName: "Beta" }]);
  });
});
