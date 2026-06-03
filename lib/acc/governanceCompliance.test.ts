import { describe, expect, it } from "vitest";
import { analyzeGovernanceCompliance } from "./governanceCompliance";

// Mock Database Adapter
function mockDb(overrides: {
  dcUsers?: any[];
  dcProjectUsers?: any[];
  dcProjectUserProducts?: any[];
  dcProjects?: any[];
  folderPermissions?: any[];
  activities?: any[];
} = {}) {
  return {
    accDcUser: {
      findMany: async () => overrides.dcUsers ?? [],
    },
    accDcProjectUser: {
      findMany: async () => overrides.dcProjectUsers ?? [],
    },
    accDcProjectUserProduct: {
      findMany: async () => overrides.dcProjectUserProducts ?? [],
    },
    accDcProject: {
      findMany: async () => overrides.dcProjects ?? [],
    },
    accFolderPermission: {
      findMany: async () => overrides.folderPermissions ?? [],
    },
    accActivity: {
      findMany: async () => overrides.activities ?? [],
    },
  };
}

describe("analyzeGovernanceCompliance", () => {
  it("computes a perfect 100 score for a clean environment", async () => {
    const db = mockDb({
      dcUsers: [
        { id: "u1", email: "alice@lecg.com", name: "Alice", status: "active", companyId: "c1" },
      ],
      dcProjectUsers: [
        { projectId: "p1", userId: "u1", status: "active" },
      ],
      dcProjectUserProducts: [
        { projectId: "p1", userId: "u1", productKey: "docs", accessLevel: "project_user" },
      ],
      dcProjects: [
        { id: "p1", name: "Project Alpha", status: "active" },
      ],
    });

    const summary = await analyzeGovernanceCompliance(db);
    expect(summary.score).toBe(100);
    expect(summary.violations).toHaveLength(0);
    expect(summary.metrics.criticalCount).toBe(0);
    expect(summary.metrics.warningCount).toBe(0);
  });

  it("detects dormant administrative access as critical violation", async () => {
    const db = mockDb({
      dcUsers: [
        { id: "u1", email: "bob@lecg.com", name: "Bob", status: "deleted", companyId: "c1" },
      ],
      dcProjectUsers: [
        { projectId: "p1", userId: "u1", status: "active" },
      ],
      dcProjectUserProducts: [
        { projectId: "p1", userId: "u1", productKey: "docs", accessLevel: "project_admin" },
      ],
      dcProjects: [
        { id: "p1", name: "Project Alpha", status: "active" },
      ],
    });

    const summary = await analyzeGovernanceCompliance(db);
    expect(summary.score).toBeLessThan(100);
    expect(summary.metrics.criticalCount).toBe(1);
    expect(summary.violations[0].ruleId).toBe("external-admin");
    expect(summary.violations[0].severity).toBe("critical");
  });

  it("detects stale admin accounts as warning", async () => {
    const now = Date.now();
    const db = mockDb({
      dcUsers: [
        { id: "u1", email: "charlie@lecg.com", name: "Charlie", status: "active", companyId: "c1" },
      ],
      dcProjectUserProducts: [
        { projectId: "p1", userId: "u1", productKey: "docs", accessLevel: "project_admin" },
      ],
      activities: [
        // Charlie's last active was 95 days ago -> stale!
        {
          id: "a1",
          userEmail: "charlie@lecg.com",
          userName: "Charlie",
          rawAction: "File Viewed",
          createdAt: new Date(now - 95 * 24 * 3600 * 1000).toISOString(),
        },
      ],
    });

    const summary = await analyzeGovernanceCompliance(db, now);
    expect(summary.metrics.warningCount).toBe(1);
    expect(summary.violations[0].ruleId).toBe("stale-admin");
    expect(summary.violations[0].severity).toBe("warning");
  });

  it("detects out-of-hours high-impact delete actions as warnings", async () => {
    const db = mockDb({
      activities: [
        {
          id: "a1",
          userEmail: "hacker@lecg.com",
          userName: "Hacker",
          rawAction: "File Deleted",
          createdAt: "2026-05-17T23:30:00.000Z", // Sunday 11:30 PM -> Night & Weekend!
        },
      ],
    });

    const summary = await analyzeGovernanceCompliance(db);
    expect(summary.metrics.warningCount).toBe(1);
    expect(summary.violations[0].ruleId).toBe("time-anomaly");
    expect(summary.violations[0].severity).toBe("warning");
  });
});
