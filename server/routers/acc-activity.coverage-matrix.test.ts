import { describe, expect, it, vi } from "vitest";
import { accActivityRouter } from "./acc-activity";

function makeCaller(db: unknown) {
  return accActivityRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accActivityRouter coverage matrix", () => {
  it("returns a project/day/service matrix from aggregated unified activity rows", async () => {
    const latest = new Date("2026-05-21T11:00:00.000Z");
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ createdAt: latest }])
        .mockResolvedValueOnce([
          {
            projectId: "p-1",
            projectName: "Active Project",
            service: "docs",
            day: new Date("2026-05-21T00:00:00.000Z"),
            rows: 7,
            actors: 2,
            attributedRows: 6,
            lastActivityAt: latest,
          },
        ]),
      accDcProject: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p-1", name: "Active Project", status: "active" },
          { id: "p-2", name: "Missing Project", status: "active" },
        ]),
      },
    };

    const result = await makeCaller(db).getCoverageMatrix({
      windowDays: 1,
      projectLimit: 5,
      missingProjectLimit: 5,
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result.range.to).toBe("2026-05-21T23:59:59.999Z");
    expect(result.totals).toMatchObject({
      rows: 7,
      attributedRows: 6,
      projectsInInventory: 2,
      projectsWithActivity: 1,
      projectsWithoutActivity: 1,
      servicesWithActivity: 1,
    });
    expect(result.cells).toEqual([
      {
        projectId: "p-1",
        projectName: "Active Project",
        service: "docs",
        day: "2026-05-21",
        rows: 7,
        actors: 2,
        attributedRows: 6,
        lastActivityAt: "2026-05-21T11:00:00.000Z",
      },
    ]);
    expect(result.missingProjects).toEqual([
      { projectId: "p-2", projectName: "Missing Project", status: "active" },
    ]);
  });
});
