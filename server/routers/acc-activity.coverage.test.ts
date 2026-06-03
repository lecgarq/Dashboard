import { describe, expect, it, vi } from "vitest";
import { accActivityRouter } from "./acc-activity";

function makeCaller(db: unknown) {
  return accActivityRouter.createCaller({
    db,
    session: { user: { id: "tester", email: "tester@lecg.com", role: "ADMIN" } },
    projectId: "project-default",
  } as any);
}

describe("accActivityRouter coverage", () => {
  it("returns attribution coverage and unknown actor counts", async () => {
    const db = {
      accActivity: {
        count: vi
          .fn()
          .mockResolvedValueOnce(100)
          .mockResolvedValueOnce(95)
          .mockResolvedValueOnce(12),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { autodeskId: "N/A", _count: { _all: 3 } },
            { autodeskId: "unknown-b", _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([
            { autodeskId: "N/A", rawAction: "add-entity-by-automation", _count: { _all: 3 } },
            { autodeskId: "unknown-b", rawAction: "view-entity", _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([
            { service: "docs", _count: { _all: 4 } },
            { service: "issues", _count: { _all: 1 } },
          ])
          .mockResolvedValueOnce([
            { userEmail: "alice@example.com", _count: { _all: 60 } },
            { userEmail: "bob@example.com", _count: { _all: 35 } },
          ]),
      },
    };

    const result = await makeCaller(db).getCoverage();

    expect(result).toMatchObject({
      totalRows: 100,
      attributedRows: 95,
      unattributedRows: 5,
      attributionRate: 0.95,
      distinctUnknownActors: 2,
      invitationRows: 12,
    });
    expect(result.actorClassifications).toEqual([
      { classification: "resolved_user", rows: 95, actors: 2 },
      { classification: "automation/system", rows: 3, actors: 1 },
      { classification: "unmapped_external_user", rows: 2, actors: 1 },
      { classification: "invalid_actor_id", rows: 0, actors: 0 },
    ]);
    expect(result.unknownRowsByService).toEqual([
      { service: "docs", rows: 4 },
      { service: "issues", rows: 1 },
    ]);
    expect(result.topUnknownActors).toEqual([
      {
        autodeskId: "N/A",
        rows: 3,
        classification: "automation/system",
        rawActions: ["add-entity-by-automation"],
      },
      {
        autodeskId: "unknown-b",
        rows: 2,
        classification: "unmapped_external_user",
        rawActions: ["view-entity"],
      },
    ]);
  });
});
