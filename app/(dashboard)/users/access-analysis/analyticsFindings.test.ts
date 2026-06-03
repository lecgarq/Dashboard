import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { GraphFolderPermissionRow } from "./graphTables";
import {
  buildExecutiveFindings,
  computeAdminConcentrationFinding,
  computeFolderProjectCoverage,
  computeProjectBreadthFinding,
  computeSignInCoverage,
} from "./analyticsFindings";

function user(overrides: Partial<BulkAccUser>): BulkAccUser {
  return {
    email: "person@example.com",
    name: "Person",
    found: true,
    projectCount: 1,
    activeCount: 1,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-05-01T00:00:00.000Z",
    allRoles: [],
    allModules: [],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
    ...overrides,
  };
}

describe("analytics findings", () => {
  it("reports users with broad project access", () => {
    expect(
      computeProjectBreadthFinding([
        user({ email: "a@example.com", projectCount: 10 }),
        user({ email: "b@example.com", projectCount: 12 }),
        user({ email: "c@example.com", projectCount: 2 }),
      ]),
    ).toBe("2 users have 10+ projects.");
  });

  it("reports admin concentration by company", () => {
    expect(
      computeAdminConcentrationFinding([
        user({ email: "a@example.com", companyName: "LECG", adminCount: 1 }),
        user({ email: "b@example.com", companyName: "LECG", isAccountAdmin: true }),
        user({ email: "c@example.com", companyName: "Partner", adminCount: 2 }),
        user({ email: "d@example.com", companyName: "Consultant", adminCount: 1 }),
        user({ email: "e@example.com", companyName: "Viewer", adminCount: 0 }),
      ]),
    ).toBe("Admin access is concentrated in 3 companies.");
  });

  it("computes sign-in coverage (only a fraction of users have a recorded sign-in)", () => {
    const coverage = computeSignInCoverage([
      user({ email: "a@example.com", lastSignIn: "2026-04-25T00:00:00.000Z" }),
      user({ email: "b@example.com", lastSignIn: null }),
      user({ email: "c@example.com", lastSignIn: "not-a-date" }),
      user({ email: "d@example.com", lastSignIn: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(coverage).toEqual({ withSignIn: 2, total: 4, percent: 50 });
  });

  it("reports empty sign-in coverage without dividing by zero", () => {
    expect(computeSignInCoverage([])).toEqual({ withSignIn: 0, total: 0, percent: 0 });
  });

  it("computes folder-permission project coverage vs all known projects", () => {
    const users = [
      user({
        email: "a@example.com",
        projects: [
          { id: "p1", name: "P1", status: "active", isAdmin: false, roles: [], modules: [] },
          { id: "p2", name: "P2", status: "active", isAdmin: false, roles: [], modules: [] },
          { id: "p3", name: "P3", status: "active", isAdmin: false, roles: [], modules: [] },
        ],
      }),
    ];
    const folders: GraphFolderPermissionRow[] = [
      { folderId: "f1", folderPath: "/a", projectId: "p1", roleId: "R", permType: "View" },
      { folderId: "f2", folderPath: "/b", projectId: "p1", roleId: "R", permType: "View" },
      { folderId: "f3", folderPath: "/c", projectId: "p2", roleId: "R", permType: "View" },
    ];
    expect(computeFolderProjectCoverage(folders, users)).toEqual({
      projectsWithFolders: 2,
      totalProjects: 3,
    });
  });

  it("builds deterministic executive findings from users and folders", () => {
    const folders: GraphFolderPermissionRow[] = [
      { folderId: "f1", folderPath: "/Models", projectId: "p1", roleId: "Architect", permType: "View" },
      { folderId: "f2", folderPath: "/Plans", projectId: "p1", roleId: "Engineer", permType: "View" },
      { folderId: "f3", folderPath: "/Specs", projectId: "p2", roleId: "Manager", permType: "Control" },
    ];

    expect(
      buildExecutiveFindings({
        users: [
          user({
            email: "a@example.com",
            projectCount: 11,
            adminCount: 1,
            companyName: "LECG",
            lastSignIn: "2026-04-25T00:00:00.000Z",
          }),
          user({ email: "b@example.com", projectCount: 1, lastSignIn: "2026-01-01T00:00:00.000Z" }),
        ],
        folderRows: folders,
        now: Date.parse("2026-05-01T00:00:00.000Z"),
      }),
    ).toEqual(
      expect.objectContaining({
        projectBreadth: "1 user has 10+ projects.",
        staleMembers: "1 member is stale or has never signed in.",
        permissionTiers: "View is the top folder permission tier with 2 grants.",
      }),
    );
  });
});
