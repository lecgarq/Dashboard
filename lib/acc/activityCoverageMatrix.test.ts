import { describe, expect, it } from "vitest";
import { buildActivityCoverageMatrix } from "./activityCoverageMatrix";

describe("buildActivityCoverageMatrix", () => {
  it("summarizes project/day/service coverage and keeps missing projects visible", () => {
    const result = buildActivityCoverageMatrix({
      from: new Date("2026-05-19T00:00:00.000Z"),
      to: new Date("2026-05-21T23:59:59.999Z"),
      projects: [
        { id: "p-1", name: "Active Project", status: "active" },
        { id: "p-2", name: "Missing Project", status: "active" },
      ],
      cells: [
        {
          projectId: "p-1",
          projectName: "Active Project",
          service: "docs",
          day: new Date("2026-05-20T00:00:00.000Z"),
          rows: 10,
          actors: 3,
          attributedRows: 9,
          lastActivityAt: new Date("2026-05-20T18:00:00.000Z"),
        },
        {
          projectId: "p-1",
          projectName: "Active Project",
          service: "issues",
          day: new Date("2026-05-21T00:00:00.000Z"),
          rows: 2,
          actors: 1,
          attributedRows: 2,
          lastActivityAt: new Date("2026-05-21T10:00:00.000Z"),
        },
      ],
      projectLimit: 10,
      missingProjectLimit: 10,
    });

    expect(result.days).toEqual(["2026-05-19", "2026-05-20", "2026-05-21"]);
    expect(result.totals).toMatchObject({
      rows: 12,
      attributedRows: 11,
      activeCells: 2,
      daysWithActivity: 2,
      servicesWithActivity: 2,
      projectsInInventory: 2,
      projectsWithActivity: 1,
      projectsWithoutActivity: 1,
    });
    expect(result.services).toEqual([
      {
        service: "docs",
        rows: 10,
        attributedRows: 9,
        projects: 1,
        days: 1,
        lastActivityAt: "2026-05-20T18:00:00.000Z",
      },
      {
        service: "issues",
        rows: 2,
        attributedRows: 2,
        projects: 1,
        days: 1,
        lastActivityAt: "2026-05-21T10:00:00.000Z",
      },
    ]);
    expect(result.projects).toEqual([
      {
        projectId: "p-1",
        projectName: "Active Project",
        status: "active",
        rows: 12,
        attributedRows: 11,
        activeDays: 2,
        activeServices: 2,
        activeCells: 2,
        coverageRatio: 2 / 3,
        coverageBand: "partial",
        firstActivityAt: "2026-05-20T18:00:00.000Z",
        lastActivityAt: "2026-05-21T10:00:00.000Z",
      },
    ]);
    expect(result.missingProjects).toEqual([
      { projectId: "p-2", projectName: "Missing Project", status: "active" },
    ]);
  });

  it("normalizes admin and blank service cells without dropping them", () => {
    const result = buildActivityCoverageMatrix({
      from: new Date("2026-05-21T00:00:00.000Z"),
      to: new Date("2026-05-21T23:59:59.999Z"),
      projects: [],
      cells: [
        {
          projectId: "",
          projectName: null,
          service: "",
          day: "2026-05-21",
          rows: BigInt(4),
          actors: BigInt(1),
          attributedRows: BigInt(0),
          lastActivityAt: new Date("2026-05-21T05:00:00.000Z"),
        },
      ],
    });

    expect(result.totals.projectsWithActivity).toBe(0);
    expect(result.totals.activityScopesWithActivity).toBe(1);
    expect(result.totals.nonInventoryActivityScopes).toBe(1);
    expect(result.cells).toEqual([
      {
        projectId: "(admin)",
        projectName: "Admin / Account Activity",
        service: "unknown",
        day: "2026-05-21",
        rows: 4,
        actors: 1,
        attributedRows: 0,
        lastActivityAt: "2026-05-21T05:00:00.000Z",
      },
    ]);
  });
});
