import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedAccDcBulkUsers,
  getCachedAccMembersEnrichedUsers,
  invalidateAccHotCache,
  prewarmAccHotCache,
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

// Superset mock that also supports the heavy bulkUsers variant (folder-perm SQL
// aggregate + activity grouping go through `$queryRaw`) and the other prewarm
// targets (`user`, embedding, activity version probes).
function makePrewarmDb(): any {
  const db: any = makeDcDb();
  db.user = versionedModel([{ email: "user@lecg.com", name: "User" }]);
  db.accActivity = versionedModel([]);
  db.accActivityAccds = versionedModel([]);
  db.accInstanceEmbedding = { findMany: vi.fn(async () => []) };
  db.$queryRaw = vi.fn(async () => []);
  return db;
}

describe("ACC hot cache", () => {
  beforeEach(() => {
    invalidateAccHotCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("leanProjects variant empties per-project roles[]/modules[] but keeps name/status and a separate cache key", async () => {
    const db = makeDcDb();

    const full = await getCachedAccDcBulkUsers(db, {});
    const lean = await getCachedAccDcBulkUsers(db, { leanProjects: true });

    const fullUser = full.find((u) => u.projects.length > 0)!;
    const leanUser = lean.find((u) => u.email === fullUser.email)!;

    // Sanity: the full variant carries per-project roles (the heavy payload).
    expect(fullUser.projects[0].roles.length).toBeGreaterThan(0);
    // Lean-projects keeps project identity (name/status/id) for the /users
    // directory filter + status fallback, but drops the heavy roles/modules.
    expect(leanUser.projects).toHaveLength(fullUser.projects.length);
    expect(leanUser.projects[0].name).toBe(fullUser.projects[0].name);
    expect(leanUser.projects[0].status).toBe(fullUser.projects[0].status);
    expect(leanUser.projects[0].roles).toEqual([]);
    expect(leanUser.projects[0].modules).toEqual([]);
    // Top-level aggregates are untouched — the role/module filters rely on these.
    expect(leanUser.allRoles).toEqual(fullUser.allRoles);
    expect(leanUser.allModules).toEqual(fullUser.allModules);
    // Separate cache key: the lean-projects compute runs its own assembly.
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

  it("prewarms the heavy permission-summary + activity bulkUsers variant, not just the lean one", async () => {
    const db = makePrewarmDb();

    const result = await prewarmAccHotCache(db);

    // The heavy variant's folder-perm aggregate + activity grouping run through
    // `$queryRaw`; the lean variant never touches it. If prewarm only warmed the
    // lean snapshot (the old bug), `$queryRaw` is never called here.
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(
      result.tasks.some((task) => /summary|activity/i.test(task.name) && task.ok),
    ).toBe(true);

    // And /users/spatial-graph's exact query must now be a warm cache hit.
    const queryRawCallsAfterPrewarm = db.$queryRaw.mock.calls.length;
    await getCachedAccDcBulkUsers(db, {
      includePermissionSummary: true,
      includeActivityMix: true,
    });
    expect(db.$queryRaw.mock.calls.length).toBe(queryRawCallsAfterPrewarm);
  });

  it("slides the TTL on cache hits so a regularly-prewarmed snapshot never goes cold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
    const db = makeDcDb();

    await getCachedAccDcBulkUsers(db); // miss → compute, base expiry +10min
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);

    // A prewarm hit at +8min (under the 10-min TTL) must push the expiry forward.
    vi.setSystemTime(new Date("2026-06-16T00:08:00.000Z"));
    await getCachedAccDcBulkUsers(db);
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);

    // +16min: under a fixed 10-min TTL the original entry (expiry +10) would have
    // been evicted → recompute. With sliding TTL the +8 hit pushed expiry to +18,
    // so this is still a warm hit.
    vi.setSystemTime(new Date("2026-06-16T00:16:00.000Z"));
    await getCachedAccDcBulkUsers(db);
    expect(db.accDcUser.findMany).toHaveBeenCalledTimes(1);
  });
});
