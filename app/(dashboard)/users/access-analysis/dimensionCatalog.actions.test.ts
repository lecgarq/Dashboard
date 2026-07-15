import { describe, it, expect } from "vitest";
import { buildActionDimensions, buildActionAvailability } from "./dimensionCatalog.actions";
import { getActions } from "./accTaxonomy";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(actionCounts: Record<string, number>): NodeFeatureSnapshot {
  return { nodeId: "u::p", actionCounts } as NodeFeatureSnapshot;
}

describe("buildActionDimensions", () => {
  it("generates one ordinal dim per taxonomy action", () => {
    const dims = buildActionDimensions();
    expect(dims.length).toBe(getActions().length);
    for (const d of dims) {
      expect(d.kind).toBe("ordinal");
      expect(d.family).toBe("activity");
      expect(d.moduleId).toBeTruthy();
      expect(d.groupId).toBeTruthy();
    }
  });
  it("extract returns the node's raw count for that action (0 when absent)", () => {
    const byId = Object.fromEntries(buildActionDimensions().map((d) => [d.id, d]));
    const f = node({ "issue-create": 7 });
    expect(byId["issue-create"].extract(f)).toBe(7);
    expect(byId["view-entity"].extract(f)).toBe(0);
  });
  it("marks availability from the supplied set (greyed when absent)", () => {
    const dims = buildActionDimensions(new Set(["issue-create"]));
    const byId = Object.fromEntries(dims.map((d) => [d.id, d]));
    expect(byId["issue-create"].available).toBe(true);
    expect(byId["view-entity"].available).toBe(false);
    expect(byId["issue-create"].note).toBeUndefined();
    expect(byId["view-entity"].note).toBe("No matching activity in the loaded graph.");
  });
  it("defaults available=true when no set is supplied", () => {
    expect(buildActionDimensions().every((d) => d.available)).toBe(true);
    expect(buildActionDimensions().every((d) => d.note == null)).toBe(true);
  });
});

describe("buildActionAvailability", () => {
  it("collects action ids with a positive count across all nodes", () => {
    const live = buildActionAvailability([
      node({ "issue-create": 2, "view-entity": 0 }),
      node({ "rfi-view": 5 }),
    ]);
    expect(live.has("issue-create")).toBe(true);
    expect(live.has("rfi-view")).toBe(true);
    expect(live.has("view-entity")).toBe(false);
  });
});
