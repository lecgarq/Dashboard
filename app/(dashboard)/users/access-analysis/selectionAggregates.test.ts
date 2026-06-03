import { describe, it, expect } from "vitest";
import {
  aggregateSelectionByRole,
  aggregateSelectionByTier,
  colorForIndex,
  UNKNOWN_LABEL,
} from "./selectionAggregates";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function feature(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "",
    emailLower: "",
    project: "P",
    role: "Architect",
    permTier: "view",
    isExternal: false,
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "active",
    ...over,
  };
}

// A small fixture with known role / tier distributions.
const FEATURES: NodeFeatureSnapshot[] = [
  feature({ role: "Architect", permTier: "view" }), // 0
  feature({ role: "Engineer", permTier: "edit" }), //  1
  feature({ role: "Architect", permTier: "edit" }), // 2
  feature({ role: "Architect", permTier: null }), //   3 (tier → Unknown)
  feature({ role: "", permTier: "view" }), //          4 (role → Unknown)
];

describe("selectionAggregates", () => {
  it("returns empty aggregates for an empty selection", () => {
    expect(aggregateSelectionByRole(FEATURES, new Set())).toEqual([]);
    expect(aggregateSelectionByTier(FEATURES, [])).toEqual([]);
  });

  it("counts roles over the selected subset", () => {
    // Select 0,1,2 → Architect×2, Engineer×1.
    const slices = aggregateSelectionByRole(FEATURES, [0, 1, 2]);
    expect(slices.map((s) => [s.label, s.value])).toEqual([
      ["Architect", 2],
      ["Engineer", 1],
    ]);
  });

  it("counts permission tiers over the selected subset", () => {
    // Select 0,1,2 → view×1, edit×2.
    const slices = aggregateSelectionByTier(FEATURES, [0, 1, 2]);
    expect(slices.map((s) => [s.label, s.value])).toEqual([
      ["edit", 2],
      ["view", 1],
    ]);
  });

  it("buckets missing/null role and tier as Unknown", () => {
    // index 4 → role "" ; index 3 → permTier null.
    const roles = aggregateSelectionByRole(FEATURES, [3, 4]);
    expect(roles.find((s) => s.label === UNKNOWN_LABEL)?.value).toBe(1); // index 4
    const tiers = aggregateSelectionByTier(FEATURES, [3, 4]);
    expect(tiers.find((s) => s.label === UNKNOWN_LABEL)?.value).toBe(1); // index 3
  });

  it("orders deterministically by count desc then label asc", () => {
    // All five: Architect×3, Engineer×1, Unknown×1 (role "").
    // Engineer and Unknown tie at 1 → label asc puts Engineer before Unknown.
    const slices = aggregateSelectionByRole(FEATURES, [0, 1, 2, 3, 4]);
    expect(slices.map((s) => s.label)).toEqual(["Architect", "Engineer", UNKNOWN_LABEL]);
    expect(slices.map((s) => s.value)).toEqual([3, 1, 1]);
  });

  it("assigns palette colors by rank", () => {
    const slices = aggregateSelectionByRole(FEATURES, [0, 1, 2, 3, 4]);
    expect(slices[0].color).toBe(colorForIndex(0));
    expect(slices[1].color).toBe(colorForIndex(1));
    expect(slices[2].color).toBe(colorForIndex(2));
  });

  it("ignores out-of-range indices defensively", () => {
    const slices = aggregateSelectionByRole(FEATURES, [0, 999]);
    expect(slices).toEqual([{ label: "Architect", value: 1, color: colorForIndex(0) }]);
  });
});
