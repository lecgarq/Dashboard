import { describe, expect, it } from "vitest";
import { assemblePermissionFootprint } from "./permissionFootprintView";

describe("assemblePermissionFootprint", () => {
  const projects = [{ id: "p1", name: "Project One" }];
  const dcProjects = [{ id: "p2", name: "DC Project Two" }];
  const roles = [{ id: "r1", name: "Project Admin" }];

  it("converts totalBytes from BigInt to a plain number and stays JSON-serializable", () => {
    const rows = assemblePermissionFootprint(
      [{ projectId: "p1", roleId: "r1", folderCount: 12, totalBytes: 2_963_471_918_056n }],
      projects,
      dcProjects,
      roles,
    );
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].totalBytes).toBe("number");
    expect(rows[0].totalBytes).toBe(2_963_471_918_056);
    expect(() => JSON.stringify(rows)).not.toThrow();
  });

  it("falls back to 'Unknown role' for a roleId absent from AccRole", () => {
    const rows = assemblePermissionFootprint(
      [{ projectId: "p1", roleId: "missing-role", folderCount: 3, totalBytes: 1024n }],
      projects,
      dcProjects,
      roles,
    );
    expect(rows[0].roleName).toBe("Unknown role");
  });

  it("resolves project names via AccProject-over-AccDcProject precedence, falling back to 'Unknown project'", () => {
    const rows = assemblePermissionFootprint(
      [
        { projectId: "p1", roleId: "r1", folderCount: 1, totalBytes: 1n },
        { projectId: "p2", roleId: "r1", folderCount: 1, totalBytes: 1n },
        { projectId: "missing-project", roleId: "r1", folderCount: 1, totalBytes: 1n },
      ],
      projects,
      dcProjects,
      roles,
    );
    const byProjectId = new Map(rows.map((r) => [r.projectId, r.projectName]));
    expect(byProjectId.get("p1")).toBe("Project One");
    expect(byProjectId.get("p2")).toBe("DC Project Two");
    expect(byProjectId.get("missing-project")).toBe("Unknown project");
  });
});
