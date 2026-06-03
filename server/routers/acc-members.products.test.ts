import { describe, expect, it, vi } from "vitest";
import { accMembersRouter } from "./acc-members";
import { invalidateAccHotCache } from "@/lib/server/acc-hot-cache";

function makeCaller(db: unknown) {
  return accMembersRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accMembersRouter.enrichedUsers", () => {
  it("serves repeated enriched-user calls from the hot cache when the DB version is unchanged", async () => {
    invalidateAccHotCache();
    const stamp = new Date("2026-05-21T12:00:00.000Z");
    const versioned = (rows: unknown[]) => ({
      count: vi.fn(async () => rows.length),
      aggregate: vi.fn(async () => ({ _max: { ingestedAt: stamp, updatedAt: stamp, syncedAt: stamp } })),
      findMany: vi.fn(async () => rows),
    });
    const db = {
      accProjectMember: versioned([]),
      accDcUser: versioned([{ id: "u1", email: "user@lecg.com", status: "active", companyId: null }]),
      accDcProjectUser: versioned([{ projectId: "p1", userId: "u1", status: "active" }]),
      accDcProjectUserRole: versioned([]),
      accDcProjectUserProduct: versioned([]),
      accDcProjectUserCompany: versioned([]),
      accDcCompany: versioned([]),
      accRole: versioned([]),
      accProject: versioned([{ id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" }]),
      accDcProject: versioned([{ id: "p1", name: "Project One", status: "active" }]),
      accMemberCache: versioned([]),
      accFolder: versioned([]),
      accFolderPermission: versioned([]),
    };

    await makeCaller(db).enrichedUsers();
    await makeCaller(db).enrichedUsers();

    expect(db.accProjectMember.findMany).toHaveBeenCalledTimes(1);
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);
  });

  it("uses the legacy AccProjectMember roles relation when legacy rows exist", async () => {
    const db = {
      accProjectMember: {
        findMany: vi.fn(async (query) => {
          expect(query.select.roles).toBeDefined();
          expect(query.select.projectRoles).toBeUndefined();
          return [
            {
              email: "legacy@lecg.com",
              status: "active",
              projectAdmin: false,
              executive: false,
              companyName: "LECG",
              project: { id: "p1", name: "Legacy Project" },
              roles: [{ role: { name: "Architect" } }],
            },
          ];
        }),
      },
    };

    const rows = await makeCaller(db).enrichedUsers();

    expect(rows).toEqual([
      {
        email: "legacy@lecg.com",
        aggregatedStatus: "active",
        projectAdmin: false,
        executive: false,
        companyName: "LECG",
        perProjectRoleNames: ["Architect"],
        perProjectStatuses: [
          {
            projectId: "p1",
            projectName: "Legacy Project",
            status: "active",
            projectAdmin: false,
          },
        ],
      },
    ]);
  });

  it("falls back to Data Connector memberships when legacy project members are empty", async () => {
    const db = {
      accProjectMember: {
        findMany: vi.fn(async () => []),
      },
      accDcUser: {
        findMany: vi.fn(async () => [
          { id: "u1", email: "USER@LECG.COM", status: "active", companyId: null },
          { id: "u2", email: null, status: "active", companyId: null },
        ]),
      },
      accDcProjectUser: {
        findMany: vi.fn(async () => [
          { projectId: "p1", userId: "u1", status: "active" },
          { projectId: "p2", userId: "u1", status: "inactive" },
        ]),
      },
      accDcProjectUserRole: {
        findMany: vi.fn(async () => [
          { projectId: "p1", userId: "u1", roleId: "r1" },
          { projectId: "p2", userId: "u1", roleId: "r2" },
        ]),
      },
      accDcProjectUserProduct: {
        findMany: vi.fn(async () => [
          { projectId: "p1", userId: "u1", productKey: "docs", accessLevel: "project_admin" },
          { projectId: "p2", userId: "u1", productKey: "build", accessLevel: "project_user" },
        ]),
      },
      accDcProjectUserCompany: {
        findMany: vi.fn(async () => [
          { projectId: "p1", userId: "u1", companyId: "c1" },
          { projectId: "p2", userId: "u1", companyId: "c2" },
        ]),
      },
      accDcCompany: {
        findMany: vi.fn(async () => [
          { id: "c1", name: "LECG" },
          { id: "c2", name: "Inactive Company" },
        ]),
      },
      accRole: {
        findMany: vi.fn(async () => [
          { id: "r1", name: "BIM Manager" },
          { id: "r2", name: "Inactive Role" },
        ]),
      },
      accDcProject: {
        findMany: vi.fn(async () => [
          { id: "p1", name: "Active Project", status: "active" },
          { id: "p2", name: "Inactive Project", status: "inactive" },
        ]),
      },
    };

    const rows = await makeCaller(db).enrichedUsers();

    expect(rows).toEqual([
      {
        email: "user@lecg.com",
        aggregatedStatus: "active",
        projectAdmin: true,
        executive: false,
        companyName: "LECG",
        perProjectRoleNames: ["BIM Manager"],
        perProjectStatuses: [
          {
            projectId: "p1",
            projectName: "Active Project",
            status: "active",
            projectAdmin: true,
          },
        ],
      },
    ]);
  });
});

describe("accMembersRouter.getProductsForUser", () => {
  it("falls back to Data Connector project-user products when legacy project members are empty", async () => {
    const db = {
      accProjectMember: {
        findMany: vi.fn(async () => []),
      },
      accDcUser: {
        findFirst: vi.fn(async () => ({ id: "u1" })),
      },
      accDcProjectUserProduct: {
        findMany: vi.fn(async () => [
          { projectId: "p1", productKey: "docs", accessLevel: "project_user" },
          { projectId: "p1", productKey: "build", accessLevel: "project_admin" },
          { projectId: "p2", productKey: "takeoff", accessLevel: "project_user" },
        ]),
      },
      accDcProject: {
        findMany: vi.fn(async () => [
          { id: "p1", name: "Active Project", status: "active" },
          { id: "p2", name: "Inactive Project", status: "inactive" },
        ]),
      },
    };

    const rows = await makeCaller(db).getProductsForUser({ email: "USER@LECG.COM" });

    expect(rows).toEqual([
      {
        projectId: "p1",
        projectName: "Active Project",
        products: {
          docs: "member",
          build: "administrator",
        },
      },
    ]);
    expect(db.accDcUser.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "user@lecg.com", mode: "insensitive" } },
      select: { id: true },
    });
  });

  it("keeps using legacy project member products when legacy rows exist", async () => {
    const legacyRows = [
      {
        products: { docs: "member" },
        project: { id: "legacy-p1", name: "Legacy Project" },
      },
    ];
    const db = {
      accProjectMember: {
        findMany: vi.fn(async () => legacyRows),
      },
      accDcUser: {
        findFirst: vi.fn(),
      },
      accDcProjectUserProduct: {
        findMany: vi.fn(),
      },
      accDcProject: {
        findMany: vi.fn(),
      },
    };

    const rows = await makeCaller(db).getProductsForUser({ email: "user@lecg.com" });

    expect(rows).toEqual([
      {
        projectId: "legacy-p1",
        projectName: "Legacy Project",
        products: { docs: "member" },
      },
    ]);
    expect(db.accDcUser.findFirst).not.toHaveBeenCalled();
  });
});
