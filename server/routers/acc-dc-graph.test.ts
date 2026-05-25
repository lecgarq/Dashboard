import { describe, expect, it, vi } from "vitest";
import { accDcGraphRouter } from "./acc-dc-graph";
import { invalidateAccHotCache } from "@/lib/server/acc-hot-cache";

function makeCaller(db: unknown) {
  return accDcGraphRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accDcGraphRouter.bulkUsers", () => {
  it("serves repeated calls from the hot cache when the DC DB version is unchanged", async () => {
    invalidateAccHotCache();
    const stamp = new Date("2026-05-21T12:00:00.000Z");
    const versioned = (rows: unknown[]) => ({
      count: vi.fn(async () => rows.length),
      aggregate: vi.fn(async () => ({ _max: { ingestedAt: stamp, updatedAt: stamp, syncedAt: stamp } })),
      findMany: vi.fn(async () => rows),
    });
    const db = {
      accDcUser: versioned([
        { id: "u1", email: "user@lecg.com", name: "User", status: "active", companyId: null, lastSignIn: null },
      ]),
      accDcProjectUser: versioned([{ projectId: "p1", userId: "u1" }]),
      accDcProjectUserRole: versioned([]),
      accDcProjectUserProduct: versioned([]),
      accDcProjectUserCompany: versioned([]),
      accDcCompany: versioned([]),
      accRole: versioned([]),
      accProject: versioned([{ id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" }]),
      accDcProject: versioned([{ id: "p1", name: "Project One", status: "active" }]),
      accProjectMember: versioned([]),
      accMemberCache: versioned([]),
      accFolder: versioned([]),
      accFolderPermission: versioned([]),
    };

    await makeCaller(db).bulkUsers();
    await makeCaller(db).bulkUsers();

    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);
    expect(db.accDcProjectUser.findMany).toHaveBeenCalledTimes(1);
  });

  it("passes project-user company joins into the DC user assembly", async () => {
    const db = {
      accDcUser: {
        findMany: vi.fn(async () => [
          { id: "u1", email: "user@lecg.com", name: "User", status: "active", companyId: null, lastSignIn: null },
        ]),
      },
      accDcProjectUser: {
        findMany: vi.fn(async () => [{ projectId: "p1", userId: "u1" }]),
      },
      accDcProjectUserRole: {
        findMany: vi.fn(async () => []),
      },
      accDcProjectUserProduct: {
        findMany: vi.fn(async () => []),
      },
      accDcProjectUserCompany: {
        findMany: vi.fn(async () => [{ projectId: "p1", userId: "u1", companyId: "c1" }]),
      },
      accDcCompany: {
        findMany: vi.fn(async () => [{ id: "c1", name: "LECG" }]),
      },
      accRole: {
        findMany: vi.fn(async () => []),
      },
      accProject: {
        findMany: vi.fn(async () => [{ id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" }]),
      },
      accFolderPermission: {
        findMany: vi.fn(async () => []),
      },
    };

    const rows = await makeCaller(db).bulkUsers();

    expect(rows[0]).toMatchObject({
      email: "user@lecg.com",
      firmId: "c1",
      firmName: "LECG",
    });
    expect(db.accDcProjectUserCompany.findMany).toHaveBeenCalled();
  });

  it("threads AccDcProjectUser.addedOn/lastSignIn to the assembled project", async () => {
    const db = {
      accDcUser: {
        findMany: vi.fn(async () => [
          { id: "u1", email: "user@lecg.com", name: "User", status: "active", companyId: null, lastSignIn: null },
        ]),
      },
      accDcProjectUser: {
        findMany: vi.fn(async () => [
          { projectId: "p1", userId: "u1", addedOn: new Date("2025-01-01T00:00:00.000Z"), lastSignIn: new Date("2026-05-01T00:00:00.000Z") },
        ]),
      },
      accDcProjectUserRole: { findMany: vi.fn(async () => []) },
      accDcProjectUserProduct: { findMany: vi.fn(async () => []) },
      accDcProjectUserCompany: { findMany: vi.fn(async () => []) },
      accDcCompany: { findMany: vi.fn(async () => []) },
      accRole: { findMany: vi.fn(async () => []) },
      accProject: {
        findMany: vi.fn(async () => [{ id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" }]),
      },
      accFolderPermission: { findMany: vi.fn(async () => []) },
    };

    const rows = await makeCaller(db).bulkUsers();
    const proj = rows.find((r) => r.email === "user@lecg.com")?.projects[0];
    expect(proj?.addedOn).toBe("2025-01-01T00:00:00.000Z");
    expect(proj?.lastSignIn).toBe("2026-05-01T00:00:00.000Z");
  });

  it("includePermissionSummary populates per-project strength without raw contexts", async () => {
    const db = {
      accDcUser: {
        findMany: vi.fn(async () => [
          { id: "u1", email: "user@lecg.com", name: "User", status: "active", companyId: null, lastSignIn: null },
        ]),
      },
      accDcProjectUser: { findMany: vi.fn(async () => [{ projectId: "p1", userId: "u1" }]) },
      accDcProjectUserRole: { findMany: vi.fn(async () => [{ projectId: "p1", userId: "u1", roleId: "r1" }]) },
      accDcProjectUserProduct: { findMany: vi.fn(async () => []) },
      accDcProjectUserCompany: { findMany: vi.fn(async () => []) },
      accDcCompany: { findMany: vi.fn(async () => []) },
      accRole: { findMany: vi.fn(async () => []) },
      accProject: {
        findMany: vi.fn(async () => [{ id: "p1", name: "P1", status: "active", folderCrawlStatus: "ok" }]),
      },
      accFolderPermission: {
        findMany: vi.fn(async () => [
          { folderId: "f1", roleId: "r1", permType: "Full Controller", actions: [], folder: { projectId: "p1", fullPath: "/A" } },
        ]),
      },
    };

    const rows = await makeCaller(db).bulkUsers({ includePermissionSummary: true });
    const proj = rows[0].projects[0];
    expect(proj.permissionStrength).toBeGreaterThan(0);
    expect(proj.fullController).toBe(true);
    expect(rows[0].permissionContexts).toEqual([]);
    expect(db.accFolderPermission.findMany).toHaveBeenCalled();
  });
});
