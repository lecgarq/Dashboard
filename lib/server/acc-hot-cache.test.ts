import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedAccDcBulkUsers,
  getCachedAccMembersEnrichedUsers,
  invalidateAccHotCache,
} from "./acc-hot-cache";

const stamp = new Date("2026-05-21T12:00:00.000Z");
const laterStamp = new Date("2026-05-21T12:05:00.000Z");

function versionedModel(findManyRows: unknown[] = []) {
  // `_max` fields are typed optional (as Prisma returns them) so individual
  // tests can override with a partial `_max` via `mockResolvedValueOnce`.
  type MaxAgg = { _max: { ingestedAt?: Date; updatedAt?: Date; syncedAt?: Date } };
  return {
    count: vi.fn(async () => findManyRows.length),
    aggregate: vi.fn(async (): Promise<MaxAgg> => ({
      _max: { ingestedAt: stamp, updatedAt: stamp, syncedAt: stamp },
    })),
    findMany: vi.fn(async () => findManyRows),
  };
}

function makeDcDb() {
  return {
    accDcUser: versionedModel([
      {
        id: "u1",
        email: "user@lecg.com",
        name: "User",
        status: "active",
        companyId: "c1",
        lastSignIn: null,
      },
    ]),
    accDcProjectUser: versionedModel([{ projectId: "p1", userId: "u1" }]),
    accDcProjectUserRole: versionedModel([{ projectId: "p1", userId: "u1", roleId: "r1" }]),
    accDcProjectUserProduct: versionedModel([
      { projectId: "p1", userId: "u1", productKey: "docs", accessLevel: "project_admin" },
    ]),
    accDcProjectUserCompany: versionedModel([{ projectId: "p1", userId: "u1", companyId: "c1" }]),
    accDcCompany: versionedModel([{ id: "c1", name: "LECG" }]),
    accRole: versionedModel([{ id: "r1", name: "Architect" }]),
    accProject: versionedModel([{ id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" }]),
    accDcProject: versionedModel([{ id: "p1", name: "Project One", status: "active" }]),
    accProjectMember: versionedModel([]),
    accMemberCache: versionedModel([]),
    accFolder: versionedModel([]),
    accFolderPermission: versionedModel([
      {
        folderId: "f1",
        roleId: "r1",
        permType: "View Only",
        actions: ["VIEW"],
        folder: { projectId: "p1", fullPath: "/Project Files" },
      },
    ]),
  };
}

describe("ACC hot cache", () => {
  beforeEach(() => {
    invalidateAccHotCache();
    vi.restoreAllMocks();
  });

  it("reuses cached DC bulk users while the DB version signature is unchanged", async () => {
    const db = makeDcDb();

    await getCachedAccDcBulkUsers(db);
    await getCachedAccDcBulkUsers(db);

    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);
    expect(db.accDcProjectUser.findMany).toHaveBeenCalledTimes(1);
  });

  it("refreshes cached DC bulk users when the DB version signature changes", async () => {
    const db = makeDcDb();
    db.accDcUser.aggregate
      .mockResolvedValueOnce({ _max: { ingestedAt: stamp } })
      .mockResolvedValueOnce({ _max: { ingestedAt: laterStamp } });

    await getCachedAccDcBulkUsers(db);
    await getCachedAccDcBulkUsers(db);

    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(2);
  });

  it("keeps permission-context snapshots separate from the lean DC bulk-users snapshot", async () => {
    const db = makeDcDb();

    const lean = await getCachedAccDcBulkUsers(db);
    const withContexts = await getCachedAccDcBulkUsers(db, { includePermissionContexts: true });

    expect(lean[0].permissionContexts).toEqual([]);
    expect(withContexts[0].permissionContexts).toHaveLength(1);
    expect(db.accFolderPermission.findMany).toHaveBeenCalledTimes(1);
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not poison the cache when DC bulk-user assembly fails", async () => {
    const db = makeDcDb();
    db.accDcProjectUser.findMany.mockRejectedValueOnce(new Error("temporary read failure"));

    await expect(getCachedAccDcBulkUsers(db)).rejects.toThrow("temporary read failure");
    await expect(getCachedAccDcBulkUsers(db)).resolves.toHaveLength(1);

    expect(db.accDcProjectUser.findMany).toHaveBeenCalledTimes(2);
  });

  it("reuses cached enriched users while the DB version signature is unchanged", async () => {
    const db = makeDcDb();

    await getCachedAccMembersEnrichedUsers(db);
    await getCachedAccMembersEnrichedUsers(db);

    expect(db.accProjectMember.findMany).toHaveBeenCalledTimes(1);
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);
  });
});
