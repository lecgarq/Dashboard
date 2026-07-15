import { describe, it, expect } from "vitest";
import { dimensionCoverage, APERTURE_SOURCE_NOTES } from "./dimensionCoverage";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "n", emailLower: "e", project: "Proj A", role: "Architect",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
    activityCountRaw: 0, lastSignInRel: "Never", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active", ...over,
  } as NodeFeatureSnapshot;
}

describe("dimensionCoverage", () => {
  it("counts present values for a plain categorical dim (company)", () => {
    const feats = [node({ firmName: "Acme" }), node({ firmName: "Hermosillo" }), node({ firmName: "" })];
    expect(dimensionCoverage(feats, "company")).toEqual({ covered: 2, total: 3, note: "DC-sourced" });
  });

  it("reports partial coverage for a partially-missing ordinal dim (riskScore)", () => {
    const feats = [node({ riskScore: 0 }), node({ riskScore: 3 }), node({ riskScore: undefined })];
    // riskScore is computed for all nodes when present — 0 is a real value.
    expect(dimensionCoverage(feats, "riskScore")).toEqual({ covered: 2, total: 3 });
  });

  it("does not count a null tier under an uncrawled project as covered (permissionTier)", () => {
    const feats = [
      node({ permTier: "edit", permissionCoverage: "known" }),
      node({ permTier: "view", permissionCoverage: "unknown" }), // uncrawled → unknown, not covered
      node({ permTier: null, permissionCoverage: "known" }),
    ];
    expect(dimensionCoverage(feats, "permissionTier")).toEqual({
      covered: 1, total: 3, note: "folder-crawl",
    });
  });

  it("counts only observed activity for the DC-sourced activityVolume", () => {
    const feats = [node({ activityTotal: 12 }), node({ activityTotal: 0 }), node({})];
    expect(dimensionCoverage(feats, "activityVolume")).toEqual({
      covered: 1, total: 3, note: "DC-sourced",
    });
  });

  it("guards the empty snapshot ({0,0}, no divide-by-zero)", () => {
    expect(dimensionCoverage([], "company")).toEqual({ covered: 0, total: 0, note: "DC-sourced" });
  });

  it("reports zero covered for an unknown dim id instead of throwing", () => {
    expect(dimensionCoverage([node()], "not-a-dim")).toEqual({ covered: 0, total: 1 });
  });

  it("carries DC provenance notes for DC-sourced dims only", () => {
    expect(APERTURE_SOURCE_NOTES.company).toBe("DC-sourced");
    expect(APERTURE_SOURCE_NOTES.riskScore).toBeUndefined();
    expect(APERTURE_SOURCE_NOTES.internalExternal).toBeUndefined();
  });
});
