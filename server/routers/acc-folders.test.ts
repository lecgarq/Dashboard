import { describe, expect, it, vi } from "vitest";
import { accFoldersRouter } from "./acc-folders";

function makeCaller(db: unknown) {
  return accFoldersRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

function makeDb() {
  return {
    accFolder: {
      count: vi.fn(),
      findMany: vi.fn(async () => [
        { id: "f1", projectId: "p1", parentId: null, fullPath: "/Project Files", name: "Project Files" },
      ]),
    },
    accFolderPermission: {
      count: vi.fn(),
      findMany: vi.fn(async () => [
        {
          folderId: "f1",
          roleId: "r1",
          actions: ["VIEW"],
          permType: "View Only",
          folder: { projectId: "p1" },
        },
      ]),
    },
    accProjectRole: {
      groupBy: vi.fn(async () => []),
    },
    accProjectMember: {
      groupBy: vi.fn(async () => []),
    },
    accDcProjectUserRole: {
      groupBy: vi.fn(async () => [{ projectId: "p1", roleId: "r1", _count: { userId: 2 } }]),
    },
    accDcProjectUser: {
      groupBy: vi.fn(async () => [{ projectId: "p1", _count: { userId: 5 } }]),
    },
    accProject: {
      groupBy: vi.fn(),
      findMany: vi.fn(async () => [
        { id: "p1", name: "Project One", folderCrawlStatus: "ok" },
      ]),
    },
    accRole: {
      findMany: vi.fn(async () => [{ id: "r1", name: "Architect" }]),
    },
  };
}

describe("accFoldersRouter", () => {
  it("uses DC role and project member counts when legacy member counts are empty", async () => {
    const db = makeDb();

    const result = await makeCaller(db).getMatrix();

    expect(result.rows[0]).toMatchObject({
      folderId: "f1",
      roleId: "r1",
      roleName: "Architect",
      orphanReasons: [],
    });
    expect(db.accDcProjectUserRole.groupBy).toHaveBeenCalled();
    expect(db.accDcProjectUser.groupBy).toHaveBeenCalled();
  });
});
