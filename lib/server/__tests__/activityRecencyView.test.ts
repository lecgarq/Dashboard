import { describe, it, expect } from "vitest";
import { assembleActivityRecency } from "../activityRecencyView";

const projectUsers = [
  { projectId: "p1", userId: "u1" },
  { projectId: "p1", userId: "u2" },
  { projectId: "p1", userId: "u3" }, // no matching AccDcUser
  { projectId: "p2", userId: "u1" },
];

const users = [
  { id: "u1", name: "Ana", email: "ANA@hermosillo.com", companyId: "c1" },
  { id: "u2", name: "Bob", email: "bob@acme.com", companyId: null },
];

const companies = [{ id: "c1", name: "Hermosillo" }];

const userRoles = [
  { projectId: "p1", userId: "u1", roleId: "r1" },
  { projectId: "p1", userId: "u1", roleId: "r2" }, // 2 roles
  { projectId: "p1", userId: "u2", roleId: "r-missing" }, // unresolved -> dropped
];

const roleNames = [
  { id: "r1", name: "Project Admin" },
  { id: "r2", name: "BIM Manager" },
];

describe("assembleActivityRecency", () => {
  it("output is bounded to projectUsers.length, never activity-row scale", () => {
    const lastActivityByKey = new Map([
      ["p1::ana@hermosillo.com", "2026-06-01T00:00:00.000Z"],
      ["p1::ana@hermosillo.com::extra-noise", "2020-01-01T00:00:00.000Z"], // ignored key shape
    ]);
    const rows = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, lastActivityByKey);
    expect(rows).toHaveLength(projectUsers.length);
  });

  it("falls back to Unknown user / Unknown company when AccDcUser is missing", () => {
    const rows = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, new Map());
    const u3 = rows.find((r) => r.projectId === "p1" && r.email === "")!;
    expect(u3.name).toBe("Unknown user");
    expect(u3.company).toBe("Unknown company");

    const bob = rows.find((r) => r.email === "bob@acme.com")!;
    expect(bob.company).toBe("Unknown company"); // companyId null
  });

  it("lastActivityAt is null when the membership has no activity-map entry", () => {
    const rows = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, new Map());
    expect(rows.every((r) => r.lastActivityAt === null)).toBe(true);
  });

  it("resolves role names via the merged map; missing roleId drops from roles[]", () => {
    const rows = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, new Map());
    const ana = rows.find((r) => r.projectId === "p1" && r.email === "ANA@hermosillo.com")!;
    expect(ana.roles.sort()).toEqual(["BIM Manager", "Project Admin"]);

    const bob = rows.find((r) => r.projectId === "p1" && r.email === "bob@acme.com")!;
    expect(bob.roles).toEqual([]); // r-missing unresolved -> empty array is legitimate

    const anaP2 = rows.find((r) => r.projectId === "p2" && r.email === "ANA@hermosillo.com")!;
    expect(anaP2.roles).toEqual([]); // no userRoles entry for p2
  });

  it("joins activity by email case-insensitively", () => {
    const lastActivityByKey = new Map([["p1::ana@hermosillo.com", "2026-06-01T00:00:00.000Z"]]);
    const rows = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, lastActivityByKey);
    const ana = rows.find((r) => r.projectId === "p1" && r.email === "ANA@hermosillo.com")!;
    // users[].email is stored as ANA@hermosillo.com (mixed case); row.email exposes user.email as-is
    expect(ana.email).toBe("ANA@hermosillo.com");
    expect(ana.lastActivityAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
