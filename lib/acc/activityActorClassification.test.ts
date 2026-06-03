import { describe, expect, it } from "vitest";
import {
  classifyActivityActor,
  summarizeActorClassifications,
} from "./activityActorClassification";

describe("activity actor classification", () => {
  it("classifies rows with a resolved email as resolved users", () => {
    expect(
      classifyActivityActor({
        autodeskId: "A1",
        userEmail: "alice@example.com",
        rawActions: ["view-entity"],
      }),
    ).toBe("resolved_user");
  });

  it("classifies N/A and automation actions as system activity", () => {
    expect(
      classifyActivityActor({
        autodeskId: "N/A",
        userEmail: null,
        rawActions: ["add-entity-by-automation"],
      }),
    ).toBe("automation/system");

    expect(
      classifyActivityActor({
        autodeskId: "SYSTEM",
        userEmail: null,
        rawActions: ["upload-entity"],
      }),
    ).toBe("automation/system");
  });

  it("classifies blank actor IDs as invalid and real unresolved IDs as unmapped external users", () => {
    expect(
      classifyActivityActor({
        autodeskId: " ",
        userEmail: null,
        rawActions: ["view-entity"],
      }),
    ).toBe("invalid_actor_id");

    expect(
      classifyActivityActor({
        autodeskId: "MZH2PECBPWPLUFYB",
        userEmail: null,
        rawActions: ["view-entity"],
      }),
    ).toBe("unmapped_external_user");
  });

  it("summarizes row and actor counts by classification", () => {
    const summary = summarizeActorClassifications([
      { classification: "resolved_user", rows: 10, actorKey: "alice@example.com" },
      { classification: "resolved_user", rows: 5, actorKey: "bob@example.com" },
      { classification: "automation/system", rows: 3, actorKey: "N/A" },
      { classification: "automation/system", rows: 2, actorKey: "N/A" },
    ]);

    expect(summary).toEqual([
      { classification: "resolved_user", rows: 15, actors: 2 },
      { classification: "automation/system", rows: 5, actors: 1 },
      { classification: "unmapped_external_user", rows: 0, actors: 0 },
      { classification: "invalid_actor_id", rows: 0, actors: 0 },
    ]);
  });
});
