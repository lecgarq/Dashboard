import { describe, expect, it } from "vitest";
import { computeProjectHealth } from "./projectHealth";

describe("projectHealth", () => {
  it("scores an excellent, pristine project perfectly", () => {
    const res = computeProjectHealth({
      projectId: "p1",
      projectName: "Pristine Tower",
      crawlStatus: "ok",
      totalMembers: 10,
      activeMembers: 10,
      orphanCount: 0,
      roleDiscrepancyCount: 0,
    });

    expect(res).toEqual({
      score: 100,
      crawlScore: 100,
      activityScore: 100,
      orphanScore: 100,
      roleScore: 100,
      status: "Excellent",
    });
  });

  it("handles a critical project with crawl failure, inactive users, and orphans", () => {
    const res = computeProjectHealth({
      projectId: "p2",
      projectName: "Abandoned Mall",
      crawlStatus: "failed",
      totalMembers: 20,
      activeMembers: 2, // 10% active
      orphanCount: 8, // penalty = 80 -> orphanScore = 20
      roleDiscrepancyCount: 5, // penalty = 50 -> roleScore = 50
    });

    // 20*0.25 + 10*0.25 + 20*0.25 + 50*0.25 = 5 + 2.5 + 5 + 12.5 = 25
    expect(res.score).toBe(25);
    expect(res.status).toBe("Critical");
  });

  it("handles a partially crawled, moderate health project", () => {
    const res = computeProjectHealth({
      projectId: "p3",
      projectName: "Halfway Center",
      crawlStatus: "partial", // crawlScore = 70
      totalMembers: 10,
      activeMembers: 7, // activityScore = 70
      orphanCount: 2, // orphanScore = 80
      roleDiscrepancyCount: 1, // roleScore = 90
    });

    // 70*0.25 + 70*0.25 + 80*0.25 + 90*0.25 = 17.5 + 17.5 + 20 + 22.5 = 77.5 -> rounds to 78
    expect(res.score).toBe(78);
    expect(res.status).toBe("Healthy");
  });
});
