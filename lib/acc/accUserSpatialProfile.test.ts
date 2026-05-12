import { describe, expect, it } from "vitest";

import {
  buildAccUserSpatialProfile,
  inferUserFolderPermissions,
  type SpatialBulkAccUser,
  type SpatialFolderPermissionRow,
} from "./accUserSpatialProfile";

const user: SpatialBulkAccUser = {
  email: "alex@example.com",
  name: "Alex Example",
  found: true,
  projectCount: 2,
  activeCount: 2,
  adminCount: 1,
  hasNoProjects: false,
  syncedAt: "2026-05-01T00:00:00.000Z",
  allRoles: ["Architect", "Reviewer"],
  allModules: ["documentManagement", "build"],
  projects: [
    {
      id: "project-a",
      name: "Project A",
      status: "active",
      isAdmin: true,
      roles: ["Architect"],
      modules: ["documentManagement"],
    },
    {
      id: "project-b",
      name: "Project B",
      status: "active",
      isAdmin: false,
      roles: ["Reviewer"],
      modules: ["build"],
    },
  ],
  companyRole: "Design Lead",
  companyName: "LECG",
  lastSignIn: "2026-04-20T12:00:00.000Z",
  isAccountAdmin: false,
  addedOn: "2026-03-10T09:00:00.000Z",
  projectAdmin: true,
  executive: false,
  aggregatedStatus: "active",
  perProjectRoleNames: ["Architect", "Reviewer"],
};

const folderRows: SpatialFolderPermissionRow[] = [
  {
    folderId: "folder-1",
    folderPath: "/Project Files/Architecture",
    projectId: "project-a",
    projectName: "Project A",
    roleId: "role-architect",
    roleName: "Architect",
    permType: "View+Download+Upload+Edit",
    actions: ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT"],
    orphanReasons: [],
  },
  {
    folderId: "folder-2",
    folderPath: "/Project Files/Review",
    projectId: "project-b",
    projectName: "Project B",
    roleId: "Reviewer",
    roleName: "Reviewers",
    permType: "Full Controller",
    actions: ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT", "CONTROL"],
    orphanReasons: ["role_zero_members"],
  },
  {
    folderId: "folder-3",
    folderPath: "/Project Files/Unrelated",
    projectId: "project-a",
    projectName: "Project A",
    roleId: "role-cost",
    roleName: "Cost Manager",
    permType: "View Only",
    actions: ["VIEW", "COLLABORATE"],
    orphanReasons: [],
  },
];

describe("inferUserFolderPermissions", () => {
  it("infers folder permissions from project role names and role-id fallbacks", () => {
    const inferred = inferUserFolderPermissions(user, folderRows);

    expect(inferred.map((row) => row.folderId)).toEqual(["folder-1", "folder-2"]);
    expect(inferred[0]).toMatchObject({
      projectId: "project-a",
      roleName: "Architect",
      permissionKey: "edit",
    });
    expect(inferred[1]).toMatchObject({
      projectId: "project-b",
      roleId: "Reviewer",
      permissionKey: "control",
      orphanReasons: ["role_zero_members"],
    });
  });

  it("does not infer permissions across projects even when role names match", () => {
    const inferred = inferUserFolderPermissions(
      { ...user, projects: [{ ...user.projects[0], roles: ["Reviewer"] }] },
      folderRows,
    );

    expect(inferred.map((row) => row.folderId)).not.toContain("folder-2");
  });
});

describe("buildAccUserSpatialProfile", () => {
  it("turns extracted ACC fields into stable spatial dimensions and weights", () => {
    const profile = buildAccUserSpatialProfile(
      user,
      folderRows,
      new Date("2026-05-12T00:00:00.000Z"),
    );

    expect(profile.dimensions.roles).toEqual(["Architect", "Reviewer"]);
    expect(profile.dimensions.projects).toEqual(["project-a", "project-b"]);
    expect(profile.dimensions.modules).toEqual(["build", "documentManagement"]);
    expect(profile.dimensions.adminTier).toBe("project");
    expect(profile.dimensions.company).toBe("LECG");
    expect(profile.dimensions.companyRole).toBe("Design Lead");
    expect(profile.dimensions.addedBucket).toBe("2026-03");
    expect(profile.dimensions.activityBucket).toBe("active-30d");
    expect(profile.dimensions.folderIds).toEqual(["folder-1", "folder-2"]);
    expect(profile.dimensions.permissionKeys).toEqual(["control", "edit"]);
    expect(profile.weights.permission).toBeGreaterThan(profile.weights.activityRecency);
    expect(profile.clusterKey).toContain("project");
    expect(profile.clusterKey).toContain("control");
  });
});
