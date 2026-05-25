import { describe, expect, it } from "vitest";
import { buildExtractionPriorityPlan } from "./extractionPriorityPlanner";

describe("buildExtractionPriorityPlan", () => {
  it("prioritizes active projects with no activity or formal backfill", () => {
    const plan = buildExtractionPriorityPlan({
      generatedAt: new Date("2026-05-21T16:00:00.000Z"),
      windowDays: 30,
      quotaLimit: 1,
      projects: [
        {
          id: "active-gap",
          name: "Hospital Expansion",
          status: "active",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          folderCrawlStatus: "never",
          memberCount: 42,
        },
        {
          id: "covered",
          name: "Covered Build",
          status: "active",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          folderCrawlStatus: "ok",
          memberCount: 12,
        },
        {
          id: "demo",
          name: "ACC Demo Project",
          status: "archived",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          folderCrawlStatus: "never",
          memberCount: 3,
        },
      ],
      activity: [
        {
          projectId: "covered",
          rows: 120,
          activeDays: 26,
          services: ["docs", "issues", "rfis"],
          lastActivityAt: new Date("2026-05-21T05:00:00.000Z"),
        },
      ],
      backfillProgress: [
        {
          projectId: "covered",
          earliestCovered: new Date("2025-01-01T00:00:00.000Z"),
          latestCovered: new Date("2026-05-20T00:00:00.000Z"),
          projectCreatedAt: new Date("2025-01-01T00:00:00.000Z"),
          newProjectFlag: false,
        },
      ],
    });

    expect(plan.rankedProjects[0]).toMatchObject({
      projectId: "active-gap",
      lane: "use_quota_first",
      activityRows: 0,
      formalBackfillState: "uninitialized",
    });
    expect(plan.rankedProjects.find((p) => p.projectId === "covered")).toMatchObject({
      lane: "good_coverage",
      formalBackfillState: "current",
    });
    expect(plan.rankedProjects.find((p) => p.projectId === "demo")).toMatchObject({
      lane: "skip_archived_or_demo",
    });
    expect(plan.quotaPlan.estimatedRequests).toBe(1);
    expect(plan.quotaPlan.batches).toEqual([
      {
        requestNumber: 1,
        projectIds: ["active-gap"],
        reason: "highest-priority activity/backfill gaps",
      },
    ]);
  });

  it("separates permission crawl needs from Data Connector quota priority", () => {
    const plan = buildExtractionPriorityPlan({
      generatedAt: new Date("2026-05-21T16:00:00.000Z"),
      windowDays: 30,
      projects: [
        {
          id: "activity-covered-permission-gap",
          name: "Active With Permission Gap",
          status: "active",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          folderCrawlStatus: "failed",
          memberCount: 20,
        },
      ],
      activity: [
        {
          projectId: "activity-covered-permission-gap",
          rows: 500,
          activeDays: 18,
          services: ["docs", "issues", "sheets"],
          lastActivityAt: new Date("2026-05-21T05:00:00.000Z"),
        },
      ],
      backfillProgress: [
        {
          projectId: "activity-covered-permission-gap",
          earliestCovered: new Date("2026-01-01T00:00:00.000Z"),
          latestCovered: new Date("2026-05-20T00:00:00.000Z"),
          projectCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
          newProjectFlag: false,
        },
      ],
    });

    expect(plan.rankedProjects[0]).toMatchObject({
      lane: "needs_permissions_crawl",
      recommendedAction: "Run folder permissions crawl before spending Data Connector quota.",
    });
    expect(plan.quotaPlan.estimatedRequests).toBe(0);
  });
});
