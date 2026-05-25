import { describe, it, expect } from "vitest";
import {
  RISK_FLAG_IDS,
  PERM_PROFILE_IDS,
  FACET_KEY_RISK,
  FACET_KEY_PERM,
  FACET_KEY_MODULE,
  isFacetKey,
  nodeHasRiskFlag,
  nodeHasPermProfile,
  nodeInModule,
  nodeMatchesFacet,
  summarizeFacets,
} from "./accessFacets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(p: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "a", emailLower: "a@x.com", project: "P", role: "R",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: "<7d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active",
    ...p,
  } as NodeFeatureSnapshot;
}

describe("accessFacets — catalog", () => {
  it("exposes the five risk flag ids and the six perm profile ids", () => {
    expect([...RISK_FLAG_IDS]).toEqual([
      "externalHighPerm", "staleButActive", "externalProjectAdmin",
      "broadFolderAccess", "highActivityHighPerm",
    ]);
    expect([...PERM_PROFILE_IDS]).toEqual([
      "fullController", "mixedProfile", "broadFolders",
      "coverageKnown", "coveragePartial", "coverageUnknown",
    ]);
  });

  it("recognizes the three facet keys and rejects categorical dims", () => {
    expect(isFacetKey(FACET_KEY_RISK)).toBe(true);
    expect(isFacetKey(FACET_KEY_PERM)).toBe(true);
    expect(isFacetKey(FACET_KEY_MODULE)).toBe(true);
    expect(isFacetKey("role")).toBe(false);
  });
});

describe("accessFacets — per-node matchers", () => {
  it("nodeHasRiskFlag reads riskFlags safely", () => {
    const f = node({ riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } });
    expect(nodeHasRiskFlag(f, "externalHighPerm")).toBe(true);
    expect(nodeHasRiskFlag(f, "staleButActive")).toBe(false);
    expect(nodeHasRiskFlag(node(), "externalHighPerm")).toBe(false); // undefined riskFlags
  });

  it("nodeHasPermProfile covers booleans, breadth threshold, and coverage", () => {
    const f = node({ permissionTypeSummary: { folderBreadth: 30, coverage: "known", mixedProfile: true, fullController: false } });
    expect(nodeHasPermProfile(f, "mixedProfile")).toBe(true);
    expect(nodeHasPermProfile(f, "fullController")).toBe(false);
    expect(nodeHasPermProfile(f, "broadFolders")).toBe(true);   // 30 >= 25
    expect(nodeHasPermProfile(f, "coverageKnown")).toBe(true);
    expect(nodeHasPermProfile(f, "coveragePartial")).toBe(false);
    expect(nodeHasPermProfile(node(), "fullController")).toBe(false); // undefined summary
  });

  it("nodeInModule reads moduleFlags then falls back to moduleSignature", () => {
    expect(nodeInModule(node({ moduleFlags: { build: true } }), "build")).toBe(true);
    expect(nodeInModule(node({ moduleSignature: ["cost"] }), "cost")).toBe(true);
    expect(nodeInModule(node({ moduleSignature: ["cost"] }), "build")).toBe(false);
    expect(nodeInModule(node(), "build")).toBe(false);
  });
});

describe("accessFacets — nodeMatchesFacet (OR within a family)", () => {
  const risky = node({ riskFlags: { externalHighPerm: false, staleButActive: true, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } });

  it("empty set passes (no selection = any)", () => {
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set())).toBe(true);
  });
  it("matches if ANY selected risk flag is true", () => {
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["staleButActive"]))).toBe(true);
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["externalHighPerm", "staleButActive"]))).toBe(true);
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["externalHighPerm"]))).toBe(false);
  });
  it("module facet matches on membership (OR)", () => {
    const f = node({ moduleSignature: ["build", "cost"] });
    expect(nodeMatchesFacet(f, FACET_KEY_MODULE, new Set(["cost"]))).toBe(true);
    expect(nodeMatchesFacet(f, FACET_KEY_MODULE, new Set(["takeoff"]))).toBe(false);
  });
  it("returns true for an unknown (non-facet) key", () => {
    expect(nodeMatchesFacet(risky, "role", new Set(["x"]))).toBe(true);
  });
});

describe("accessFacets — summarizeFacets", () => {
  it("counts risk flags, perm profiles, and modules in one pass", () => {
    const features = [
      node({
        riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false },
        permissionTypeSummary: { folderBreadth: 30, coverage: "known", mixedProfile: true, fullController: false },
        moduleSignature: ["build", "cost"],
      }),
      node({
        riskFlags: { externalHighPerm: true, staleButActive: true, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false },
        permissionTypeSummary: { folderBreadth: 2, coverage: "partial", mixedProfile: false, fullController: true },
        moduleSignature: ["build"],
      }),
      node(), // no enrichment → contributes nothing
    ];
    const s = summarizeFacets(features);
    expect(s.risk.externalHighPerm).toBe(2);
    expect(s.risk.staleButActive).toBe(1);
    expect(s.risk.highActivityHighPerm).toBe(0);
    expect(s.perm.mixedProfile).toBe(1);
    expect(s.perm.fullController).toBe(1);
    expect(s.perm.broadFolders).toBe(1);   // only the breadth-30 node
    expect(s.perm.coverageKnown).toBe(1);
    expect(s.modules).toEqual([
      { key: "build", count: 2 },
      { key: "cost", count: 1 },
    ]); // sorted by count desc, then key asc
  });
});
