import { describe, expect, it } from "vitest";
import { computeUserEngagement } from "./userEngagement";

describe("computeUserEngagement", () => {
  const now = new Date("2026-05-20T12:00:00Z");

  it("handles a completely dormant user with 0 signals", () => {
    const breakdown = computeUserEngagement({
      lastSignIn: null,
      activityCount: 0,
      distinctActionCount: 0,
      projectCount: 0,
      distinctModuleCount: 0,
      permissionCount: 0,
    }, now);

    expect(breakdown).toEqual({
      score: 0,
      recency: 0,
      volume: 0,
      diversity: 0,
      breadth: 0,
      modules: 0,
      permissions: 0,
      tier: "Dormant",
    });
  });

  it("calculates correct recency decay score", () => {
    // 0 days ago -> 100% recency
    const res0 = computeUserEngagement({
      lastSignIn: new Date("2026-05-20T12:00:00Z"),
      activityCount: 0,
      distinctActionCount: 0,
      projectCount: 0,
      distinctModuleCount: 0,
      permissionCount: 0,
    }, now);
    expect(res0.recency).toBe(100);
    expect(res0.score).toBe(30); // 100 * 0.30

    // 45 days ago -> 50% recency
    const res45 = computeUserEngagement({
      lastSignIn: new Date("2026-04-05T12:00:00Z"),
      activityCount: 0,
      distinctActionCount: 0,
      projectCount: 0,
      distinctModuleCount: 0,
      permissionCount: 0,
    }, now);
    expect(res45.recency).toBe(50);
    expect(res45.score).toBe(15); // 50 * 0.30

    // 90+ days ago -> 0% recency
    const res90 = computeUserEngagement({
      lastSignIn: new Date("2026-02-01T12:00:00Z"),
      activityCount: 0,
      distinctActionCount: 0,
      projectCount: 0,
      distinctModuleCount: 0,
      permissionCount: 0,
    }, now);
    expect(res90.recency).toBe(0);
    expect(res90.score).toBe(0);
  });

  it("calculates log-scaled volume and permission scores correctly", () => {
    // 1023 rows -> ~100% volume
    const res = computeUserEngagement({
      lastSignIn: null,
      activityCount: 1023,
      distinctActionCount: 0,
      projectCount: 0,
      distinctModuleCount: 0,
      permissionCount: 1023,
    }, now);
    expect(res.volume).toBe(100);
    expect(res.permissions).toBe(100);
    expect(res.score).toBe(30); // 100 * 0.25 + 100 * 0.05
  });

  it("scores an active power user correctly", () => {
    const res = computeUserEngagement({
      lastSignIn: new Date("2026-05-19T12:00:00Z"), // 1 day ago (99% recency)
      activityCount: 1500, // ~100% volume
      distinctActionCount: 20, // 100% diversity (maxed at 15)
      projectCount: 8, // 100% breadth (maxed at 5)
      distinctModuleCount: 5, // 100% modules (maxed at 4)
      permissionCount: 2000, // 100% permissions
    }, now);

    expect(res.score).toBeGreaterThanOrEqual(95);
    expect(res.tier).toBe("Power");
  });

  it("handles moderate user engagement profile", () => {
    const res = computeUserEngagement({
      lastSignIn: new Date("2026-05-10T12:00:00Z"), // 10 days ago (89% recency)
      activityCount: 50, // log2(51)*10 = 57% volume
      distinctActionCount: 5, // 5/15 = 33% diversity
      projectCount: 2, // 2/5 = 40% breadth
      distinctModuleCount: 2, // 2/4 = 50% modules
      permissionCount: 100, // log2(101)*10 = 67% permissions
    }, now);

    expect(res.score).toBe(60);
    expect(res.tier).toBe("High");
  });
});
