import { describe, it, expect } from "vitest";
import { selectBackfillProjects } from "../selectBackfillProjects";

const FLOOR = new Date("2019-01-01T00:00:00.000Z");

function base() {
  return {
    // Eligible universe = active ∩ MTY-allowlist ∩ not-low-value (already filtered upstream).
    eligibleIds: new Set(["a", "b", "c"]),
    earliestCoveredById: new Map<string, Date | null>([
      ["a", new Date("2019-01-01T00:00:00.000Z")], // exactly at floor → done
      ["b", new Date("2026-02-22T00:00:00.000Z")], // only recent → still remaining
      // "c" has no progress row → never covered → remaining
    ]),
    activityCountById: new Map<string, number>([["b", 10], ["c", 99]]),
    floor: FLOOR,
  };
}

describe("selectBackfillProjects", () => {
  it("excludes projects already covered back to the floor", () => {
    expect(selectBackfillProjects(base())).not.toContain("a");
  });

  it("includes never-covered and partially-covered eligible projects", () => {
    const out = selectBackfillProjects(base());
    expect(out).toContain("b");
    expect(out).toContain("c");
  });

  it("excludes projects outside the eligible (MTY) set even with high activity", () => {
    const input = base();
    input.activityCountById = new Map([["b", 10], ["c", 99], ["locked", 500]]);
    expect(selectBackfillProjects(input)).not.toContain("locked");
  });

  it("orders remaining by activity count desc", () => {
    // c (99) before b (10)
    expect(selectBackfillProjects(base())).toEqual(["c", "b"]);
  });

  it("breaks ties on equal activity counts by id ascending (deterministic)", () => {
    const input = {
      eligibleIds: new Set(["y", "x"]),
      earliestCoveredById: new Map<string, Date | null>(),
      activityCountById: new Map<string, number>([["x", 5], ["y", 5]]),
      floor: FLOOR,
    };
    expect(selectBackfillProjects(input)).toEqual(["x", "y"]);
  });
});
