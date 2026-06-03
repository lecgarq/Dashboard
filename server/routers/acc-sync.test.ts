import { afterEach, describe, expect, it, vi } from "vitest";
import { accSyncRouter } from "./acc-sync";

function makeCaller(db: unknown) {
  return accSyncRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accSyncRouter DC coverage rollups", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses successful activity jobs as DC freshness and quota evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T15:00:00.000Z"));

    const activitySuccessAt = new Date("2026-05-21T14:55:01.000Z");
    const db = {
      accDcIngestRun: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            startedAt: new Date("2026-05-20T18:00:00.000Z"),
            status: "quota-paused",
            errorMessage: "Daily safe quota reached",
          })
          .mockResolvedValueOnce(null),
        findMany: vi.fn(async () => []),
      },
      accDataConnectorJob: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            status: "success",
            startedAt: new Date("2026-05-21T14:52:22.000Z"),
            completedAt: activitySuccessAt,
            errorMessage: null,
          })
          .mockResolvedValueOnce({
            status: "success",
            startedAt: new Date("2026-05-21T14:52:22.000Z"),
            completedAt: activitySuccessAt,
            errorMessage: null,
          }),
        findMany: vi.fn(async () =>
          Array.from({ length: 9 }, (_, i) => ({
            startedAt: new Date(`2026-05-21T12:${String(i).padStart(2, "0")}:00.000Z`),
          })),
        ),
      },
    };

    const result = await makeCaller(db).getDcIngestStatus();

    expect(result.dcStatus).toBe("green");
    expect(result.lastRunStatus).toBe("success");
    expect(result.lastSuccessAt?.toISOString()).toBe(activitySuccessAt.toISOString());
    expect(result.quotaUsedToday).toBe(9);
  });

  it("uses activity job quota in Sync Center planning", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T15:00:00.000Z"));

    const activitySuccessAt = new Date("2026-05-21T14:55:01.000Z");
    const db = {
      accDcIngestRun: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "run-old",
            status: "quota-paused",
            startedAt: new Date("2026-05-20T18:00:00.000Z"),
            endedAt: new Date("2026-05-20T18:10:00.000Z"),
            projectsProcessed: 250,
            quotaUsed: 5,
            errorMessage: "Daily safe quota reached",
            unknownModulesSeen: [],
          })
          .mockResolvedValueOnce(null),
        findMany: vi.fn(async () => []),
      },
      accDataConnectorJob: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            requestId: "req-success",
            status: "success",
            startedAt: new Date("2026-05-21T14:52:22.000Z"),
            completedAt: activitySuccessAt,
            errorMessage: null,
          })
          .mockResolvedValueOnce({
            requestId: "req-success",
            status: "success",
            startedAt: new Date("2026-05-21T14:52:22.000Z"),
            completedAt: activitySuccessAt,
            errorMessage: null,
          }),
        findMany: vi.fn(async () =>
          Array.from({ length: 9 }, (_, i) => ({
            startedAt: new Date(`2026-05-21T12:${String(i).padStart(2, "0")}:00.000Z`),
          })),
        ),
      },
      accDcBackfillProgress: {
        findMany: vi.fn(async () => [
          {
            projectId: "p1",
            earliestCovered: null,
            latestCovered: null,
            projectCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
            newProjectFlag: true,
          },
        ]),
      },
      accActivity: {
        count: vi.fn(async () => 26_579),
        groupBy: vi.fn(async () => [{ projectId: "p1", _count: { _all: 10 } }]),
      },
      $queryRawUnsafe: vi.fn(async () => [
        {
          min: new Date("2026-04-14T04:46:52.969Z"),
          max: new Date("2026-05-21T05:59:57.840Z"),
          days: 24,
        },
      ]),
    };

    const result = await makeCaller(db).getSyncCenterStatus();

    expect(result.status).toBe("complete");
    expect(result.quotaUsedToday).toBe(9);
    expect(result.quotaRemainingToday).toBe(11);
    expect(result.runnableRequestsToday).toBe(1);
    expect(result.lastSuccessAt?.toISOString()).toBe(activitySuccessAt.toISOString());
    expect(result.activityCoverage).toMatchObject({
      rows: 26_579,
      projectsWithActivity: 1,
      daysWithActivity: 24,
    });
  });

  it("adds observed activity coverage without overstating formal backfill progress", async () => {
    const db = {
      accDcBackfillProgress: {
        findMany: vi.fn(async () => [
          {
            earliestCovered: null,
            latestCovered: null,
            projectCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
      },
      accActivity: {
        count: vi.fn(async () => 26_579),
        groupBy: vi.fn(async () => [
          { projectId: "p1", _count: { _all: 10 } },
          { projectId: "p2", _count: { _all: 8 } },
        ]),
      },
      $queryRawUnsafe: vi.fn(async () => [
        {
          min: new Date("2026-04-14T04:46:52.969Z"),
          max: new Date("2026-05-21T05:59:57.840Z"),
          days: 24,
        },
      ]),
    };

    const result = await makeCaller(db).getBackfillProgress();

    expect(result.monthsCovered).toBe(0);
    expect(result.backfillPct).toBe(0);
    expect(result.activityCoverage).toMatchObject({
      rows: 26_579,
      projectsWithActivity: 2,
      daysWithActivity: 24,
      earliestAt: new Date("2026-04-14T04:46:52.969Z"),
      latestAt: new Date("2026-05-21T05:59:57.840Z"),
    });
  });
});
