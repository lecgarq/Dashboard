import { describe, expect, it, vi } from "vitest";
import { accSyncRouter } from "./acc-sync";

function makeCaller(db: unknown) {
  return accSyncRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accSyncRouter extraction priority plan", () => {
  it("returns a no-quota project ranking from local coverage tables", async () => {
    const db = {
      accDcProject: {
        findMany: vi.fn(async () => [
          {
            id: "p-gap",
            name: "Priority Build",
            status: "active",
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
          {
            id: "p-demo",
            name: "ACC Demo",
            status: "archived",
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
        ]),
      },
      accProject: {
        findMany: vi.fn(async () => [
          { id: "p-gap", folderCrawlStatus: "never" },
          { id: "p-demo", folderCrawlStatus: "never" },
        ]),
      },
      accDcBackfillProgress: {
        findMany: vi.fn(async () => []),
      },
      accDcProjectUser: {
        groupBy: vi.fn(async () => [
          { projectId: "p-gap", _count: { userId: 33 } },
          { projectId: "p-demo", _count: { userId: 2 } },
        ]),
      },
      $queryRaw: vi.fn(async () => []),
    };

    const result = await makeCaller(db).getExtractionPriorityPlan({
      windowDays: 30,
      limit: 10,
      quotaLimit: 1,
    });

    expect(result.summary.totalProjects).toBe(2);
    expect(result.rankedProjects[0]).toMatchObject({
      projectId: "p-gap",
      lane: "use_quota_first",
      memberCount: 33,
    });
    expect(result.rankedProjects[1]).toMatchObject({
      projectId: "p-demo",
      lane: "skip_archived_or_demo",
    });
    expect(result.quotaPlan.batches[0].projectIds).toEqual(["p-gap"]);
  });
});
