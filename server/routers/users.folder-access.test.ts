import { describe, expect, it, vi } from "vitest";
import { usersRouter } from "./users";

function makeCaller(db: unknown) {
  return usersRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("usersRouter.getAccUserFolderAccess", () => {
  it("prefers exact DC project-role assignments over stale AccMemberCache roles", async () => {
    const db = {
      accDcUser: {
        findFirst: vi.fn(async () => ({ id: "u1" })),
      },
      accDcProjectUser: {
        findMany: vi.fn(async () => [{ projectId: "p1" }]),
      },
      accDcProjectUserRole: {
        findMany: vi.fn(async () => [{ projectId: "p1", roleId: "r1" }]),
      },
      accProject: {
        count: vi.fn(async ({ where }) => where.id.in.length),
      },
      accFolderPermission: {
        findMany: vi.fn(async () => [
          {
            id: "perm-1",
            roleId: "r1",
            actions: ["VIEW"],
            permType: "View Only",
            folder: {
              id: "f1",
              name: "Project Files",
              fullPath: "/Project Files",
              projectId: "p1",
              project: { id: "p1", name: "Current Project" },
            },
          },
          {
            id: "perm-2",
            roleId: "r2",
            actions: ["VIEW"],
            permType: "View Only",
            folder: {
              id: "f2",
              name: "Stale Project Files",
              fullPath: "/Project Files",
              projectId: "p2",
              project: { id: "p2", name: "Stale Project" },
            },
          },
        ]),
      },
      accRole: {
        findMany: vi.fn(async () => [{ id: "r1", name: "Architect" }]),
      },
      accMemberCache: {
        findUnique: vi.fn(async () => ({
          data: {
            projects: [
              { id: "p1", name: "Current Project", roles: ["Architect"] },
              { id: "p2", name: "Stale Project", roles: ["Architect"] },
            ],
          },
        })),
      },
      accProjectRole: {
        findMany: vi.fn(async () => [
          { projectId: "p1", roleId: "r1", role: { id: "r1", name: "Architect" } },
          { projectId: "p2", roleId: "r2", role: { id: "r2", name: "Architect" } },
        ]),
      },
    };

    const result = await makeCaller(db).getAccUserFolderAccess({ email: "user@lecg.com" });

    expect(result.coverage).toEqual({ totalProjects: 1, crawledProjects: 1 });
    expect(result.folders).toEqual([
      {
        folderId: "f1",
        folderName: "Project Files",
        folderPath: "/Project Files",
        projectId: "p1",
        projectName: "Current Project",
        roleId: "r1",
        roleName: "Architect",
        permType: "View Only",
        actions: ["VIEW"],
      },
    ]);
  });
});

describe("usersRouter.getHubRoles", () => {
  it("uses DC role assignment counts when legacy project-role links are empty", async () => {
    const syncedAt = new Date("2026-05-20T00:00:00.000Z");
    const db = {
      accRole: {
        findMany: vi.fn(async () => [
          { id: "r1", name: "Architect", syncedAt },
          { id: "r2", name: "Engineer", syncedAt },
        ]),
      },
      accProjectRole: {
        groupBy: vi.fn(async () => []),
      },
      accDcProjectUserRole: {
        groupBy: vi.fn(async () => [
          { roleId: "r1", _count: { userId: 3 } },
          { roleId: "r2", _count: { userId: 1 } },
        ]),
      },
    };

    const result = await makeCaller(db).getHubRoles();

    expect(result.roles).toEqual([
      { id: "r1", name: "Architect", memberCount: 3 },
      { id: "r2", name: "Engineer", memberCount: 1 },
    ]);
    expect(result.syncedAt).toEqual(syncedAt);
    expect(db.accDcProjectUserRole.groupBy).toHaveBeenCalled();
  });
});
