import { describe, it, expect } from "vitest";
import {
  aggregateSelectionByRole,
  aggregateSelectionByTier,
  aggregateSelectionByProject,
  selectionKpis,
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

// A small fixture with known role / tier / project distributions.
const FEATURES: NodeFeatureSnapshot[] = [
  feature({ role: "Architect", permTier: "view", project: "Alpha", isExternal: false, isAdmin: true }), //  0
  feature({ role: "Engineer", permTier: "edit", project: "Alpha", isExternal: true, isAdmin: false }), //   1
  feature({ role: "Architect", permTier: "edit", project: "Beta", isExternal: false, isAdmin: false }), //  2
  feature({ role: "Architect", permTier: null, project: "Beta", isExternal: true, isAdmin: true }), //      3 (tier → Unknown)
  feature({ role: "", permTier: "view", project: "", isExternal: false, isAdmin: false }), //               4 (role/project → Unknown)
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

  it("counts projects over the selected subset", () => {
    // Select 0,1,2,3 → Alpha×2, Beta×2 (tie → label asc).
    const slices = aggregateSelectionByProject(FEATURES, [0, 1, 2, 3]);
    expect(slices.map((s) => [s.label, s.value])).toEqual([
      ["Alpha", 2],
      ["Beta", 2],
    ]);
  });

  it("buckets missing project as Unknown", () => {
    const slices = aggregateSelectionByProject(FEATURES, [4]);
    expect(slices).toEqual([{ label: UNKNOWN_LABEL, value: 1, color: colorForIndex(0) }]);
  });

  it("summarizes KPI counts over the selected subset", () => {
    // Select 0,1,2,3 → total 4, external 2 (1,3), admins 2 (0,3), projects 2 (Alpha,Beta).
    expect(selectionKpis(FEATURES, [0, 1, 2, 3])).toEqual({
      total: 4,
      external: 2,
      admins: 2,
      projects: 2,
    });
  });

  it("returns zeroed KPIs for an empty selection", () => {
    expect(selectionKpis(FEATURES, [])).toEqual({
      total: 0,
      external: 0,
      admins: 0,
      projects: 0,
    });
  });
});
