import { describe, expect, it } from "vitest";
import { assemblePermissionLevel } from "@/lib/server/permissionLevelView";

function aggRow(over: Partial<{ projectId: string; roleId: string; permType: string; folderCount: number }>) {
  return {
    projectId: "p1",
    roleId: "r1",
    permType: "View Only",
    folderCount: 10,
    ...over,
  };
}

describe("assemblePermissionLevel", () => {
  it("is bounded — one output row per input aggregate row, never raw-permission scale", () => {
    const aggRows = [
      aggRow({ projectId: "p1", roleId: "r1", permType: "View Only" }),
      aggRow({ projectId: "p1", roleId: "r2", permType: "Full Controller" }),
      aggRow({ projectId: "p2", roleId: "r1", permType: "View+Download" }),
    ];
    const projects = [{ id: "p1", name: "Alpha" }, { id: "p2", name: "Beta" }];
    const roles = [{ id: "r1", name: "Project Admin" }, { id: "r2", name: "Viewer" }];
    const rows = assemblePermissionLevel(aggRows, projects, [], roles);
    expect(rows).toHaveLength(aggRows.length);
  });

  it("passes permType through verbatim, including an unexpected/unknown value — kept, never remapped or dropped", () => {
    const aggRows = [
      aggRow({ permType: "Full Controller" }),
      aggRow({ permType: "Some Future Tier" }),
    ];
    const projects = [{ id: "p1", name: "Alpha" }];
    const roles = [{ id: "r1", name: "Project Admin" }];
    const rows = assemblePermissionLevel(aggRows, projects, [], roles);
    expect(rows.map((r) => r.permType)).toEqual(["Full Controller", "Some Future Tier"]);
  });

  it("falls back to 'Unknown role' and 'Unknown project' for ids absent from the lookup sets — never a raw GUID", () => {
    const rawRoleGuid = "role-guid-not-in-accrole";
    const rawProjectGuid = "proj-guid-not-in-either-source";
    const aggRows = [aggRow({ projectId: rawProjectGuid, roleId: rawRoleGuid })];
    const rows = assemblePermissionLevel(aggRows, [], [], []);
    expect(rows[0].roleName).toBe("Unknown role");
    expect(rows[0].projectName).toBe("Unknown project");
    expect(rows[0].roleName).not.toBe(rawRoleGuid);
    expect(rows[0].projectName).not.toBe(rawProjectGuid);
  });

  it("prefers the AccProject name over AccDcProject when the same project id appears in both sources", () => {
    const aggRows = [aggRow({ projectId: "shared-id" })];
    const projects = [{ id: "shared-id", name: "Live ACC Name" }];
    const dcProjects = [{ id: "shared-id", name: "DC Stale Name" }];
    const roles = [{ id: "r1", name: "Project Admin" }];
    const rows = assemblePermissionLevel(aggRows, projects, dcProjects, roles);
    expect(rows[0].projectName).toBe("Live ACC Name");
  });

  it("carries folderCount through unchanged (plain number, no BigInt boundary)", () => {
    const aggRows = [aggRow({ folderCount: 42 })];
    const rows = assemblePermissionLevel(aggRows, [{ id: "p1", name: "Alpha" }], [], [{ id: "r1", name: "Project Admin" }]);
    expect(rows[0].folderCount).toBe(42);
    expect(typeof rows[0].folderCount).toBe("number");
  });
});
