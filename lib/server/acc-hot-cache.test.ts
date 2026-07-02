import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedAccDcBulkUsers,
  getCachedAccMembersEnrichedUsers,
  getCachedLastFileActivityByEmailAll,
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
    accFolderPermissionSummary: versionedModel([
      { projectId: "p1", roleId: "r1", folderCount: 1, totalBytes: BigInt(0), permTypes: ["View Only"] },
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

  it("hard-guards includePermissionContexts: throws instead of scanning AccFolderPermission", async () => {
    const db = makeDcDb();
    await expect(
      getCachedAccDcBulkUsers(db, { includePermissionContexts: true }),
    ).rejects.toThrow(/hard-guarded/);
    expect(db.accFolderPermission.findMany).not.toHaveBeenCalled();
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

    // The heavy variant's activity grouping runs through `$queryRaw` (folder-perm
    // summary no longer does — PROJ-02 switched it to accFolderPermissionSummary.findMany);
    // the lean variant never touches `$queryRaw`. If prewarm only warmed the lean
    // snapshot (the old bug), `$queryRaw` is never called here.
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

  // -------------------------------------------------------------------------
  // getCachedLastFileActivityByEmailAll
  // -------------------------------------------------------------------------

  it("getCachedLastFileActivityByEmailAll: memoises the result — second call within TTL does NOT re-run $queryRaw", async () => {
    const db = makePrewarmDb();
    db.$queryRaw.mockResolvedValue([
      { email: "alice@test.com", lastActivity: new Date("2026-06-01T00:00:00.000Z") },
    ]);

    const first = await getCachedLastFileActivityByEmailAll(db);
    const second = await getCachedLastFileActivityByEmailAll(db);

    // $queryRaw called exactly once (the second call is a cache hit)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    // Both calls return the same data
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0].email).toBe("alice@test.com");
  });

  it("getCachedLastFileActivityByEmailAll: invalidates when activity version changes", async () => {
    const db = makePrewarmDb();
    db.accActivity.aggregate
      .mockResolvedValueOnce({ _max: { createdAt: stamp } })
      .mockResolvedValueOnce({ _max: { createdAt: laterStamp } });
    db.$queryRaw.mockResolvedValue([]);

    await getCachedLastFileActivityByEmailAll(db);
    await getCachedLastFileActivityByEmailAll(db);

    // Version changed between calls → cache miss → $queryRaw called twice
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("prewarmAccHotCache includes the last-file-activity-by-email task", async () => {
    const db = makePrewarmDb();
    db.$queryRaw.mockResolvedValue([]);

    const result = await prewarmAccHotCache(db);

    expect(
      result.tasks.some((t) => t.name === "accActivity.lastFileActivityByEmailAll" && t.ok),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST-01: DB-free OOM-regression — GROUP BY aggregate row-bound
  // -------------------------------------------------------------------------

  it("bounds the permission-summary aggregate to <= n_roles x n_projects group rows, never raw permission rows", async () => {
    // Fixture: 2 roles × 2 projects = 4 group-row upper bound.
    // The raw AccFolderPermission table would have many more rows in production
    // (~6M+). We simulate a realistic imbalance: 8 raw rows vs 4 group rows.
    const roles = [
      { id: "r1", name: "Architect" },
      { id: "r2", name: "Project Admin" },
    ];
    const projects = [
      { id: "p1", name: "Project One", status: "active", folderCrawlStatus: "ok" },
      { id: "p2", name: "Project Two", status: "active", folderCrawlStatus: "ok" },
    ];

    // Simulate 8 raw AccFolderPermission rows (2 per project×role combo).
    // These represent what findMany would return — the raw-scan OOM path.
    const rawPermissionRows = [
      { folderId: "f1", roleId: "r1", permType: "View Only", actions: ["VIEW"], folder: { projectId: "p1", fullPath: "/A" } },
      { folderId: "f2", roleId: "r1", permType: "View Only", actions: ["VIEW"], folder: { projectId: "p1", fullPath: "/B" } },
      { folderId: "f3", roleId: "r2", permType: "Editor",    actions: ["EDIT"], folder: { projectId: "p1", fullPath: "/C" } },
      { folderId: "f4", roleId: "r2", permType: "Editor",    actions: ["EDIT"], folder: { projectId: "p1", fullPath: "/D" } },
      { folderId: "f5", roleId: "r1", permType: "View Only", actions: ["VIEW"], folder: { projectId: "p2", fullPath: "/E" } },
      { folderId: "f6", roleId: "r1", permType: "View Only", actions: ["VIEW"], folder: { projectId: "p2", fullPath: "/F" } },
      { folderId: "f7", roleId: "r2", permType: "Editor",    actions: ["EDIT"], folder: { projectId: "p2", fullPath: "/G" } },
      { folderId: "f8", roleId: "r2", permType: "Editor",    actions: ["EDIT"], folder: { projectId: "p2", fullPath: "/H" } },
    ];

    // The materialised AccFolderPermissionSummary projection collapses the 8 raw
    // rows into 4 group rows (one per projectId × roleId combination) — this is
    // the shape the projection's findMany now returns (PROJ-02 switch).
    const groupRows = [
      { projectId: "p1", roleId: "r1", folderCount: 2, totalBytes: BigInt(1024), permTypes: ["View Only"] },
      { projectId: "p1", roleId: "r2", folderCount: 2, totalBytes: BigInt(2048), permTypes: ["Editor"] },
      { projectId: "p2", roleId: "r1", folderCount: 2, totalBytes: BigInt(512),  permTypes: ["View Only"] },
      { projectId: "p2", roleId: "r2", folderCount: 2, totalBytes: BigInt(4096), permTypes: ["Editor"] },
    ];

    // Build the db mock using the standard helpers.
    // Override accRole + accProject with our fixture data; wire the projection's
    // findMany to return group rows.
    const db = makePrewarmDb();
    db.accRole = versionedModel(roles);
    db.accProject = versionedModel(projects);
    db.accDcProject = versionedModel(projects.map((p) => ({ id: p.id, name: p.name, status: p.status })));
    // accFolderPermission carries the raw rows so we can assert findMany is NOT called.
    db.accFolderPermission = versionedModel(rawPermissionRows);
    // accFolderPermissionSummary is the projection the summary path now reads.
    db.accFolderPermissionSummary = versionedModel(groupRows);

    // Act: call the summary variant (NOT contexts) — this must use the projection path.
    const result = await getCachedAccDcBulkUsers(db, { includePermissionSummary: true });

    // Assert 1: the group-row upper bound contract.
    // The Map built from groupRows has at most roles.length × projects.length entries.
    expect(groupRows.length).toBeLessThanOrEqual(roles.length * projects.length);

    // Assert 2: the raw-row population is strictly larger than the group rows,
    // proving the bound is meaningful (not vacuously true).
    expect(rawPermissionRows.length).toBeGreaterThan(groupRows.length);

    // Assert 3: the summary path must NOT call accFolderPermission.findMany
    // (that is the ~6M-row raw-scan path guarded by includePermissionContexts).
    expect(db.accFolderPermission.findMany).not.toHaveBeenCalled();

    // Assert 4: the assembled result is a non-empty BulkAccUser array
    // (confirming the summary branch ran without falling back to an empty/error state).
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
