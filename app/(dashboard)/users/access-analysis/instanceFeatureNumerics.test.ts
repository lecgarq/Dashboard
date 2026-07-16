import { describe, it, expect } from "vitest";
import { instanceFeatureNumerics } from "./instanceFeatureNumerics";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function fixture(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u1::p1", nameLower: "ann", emailLower: "ann@hermosillo.com",
    project: "Tower A", role: "Project Manager", permTier: "edit", isExternal: false,
    activityBucket: "Med", signinBucket: "<30d", activityCountRaw: 42, lastSignInRel: "3d ago",
    permissionCoverage: "known", firmName: "Hermosillo", accountStatus: "active",
    ...over,
  } as NodeFeatureSnapshot;
}

describe("instanceFeatureNumerics", () => {
  it("passes raw values through untouched", () => {
    const n = instanceFeatureNumerics(fixture({
      permissionTypeSummary: { folderBreadth: 17, coverage: "known", mixedProfile: false, fullController: false },
      accessibleDataBytes: 123456789,
      activityTotal: 42,
      membershipAgeDays: 365,
      permissionStrength: 5,
      riskScore: 2,
    }));
    expect(n).toEqual({
      folderBreadth: 17,
      accessibleDataBytes: 123456789,
      activityTotal: 42,
      membershipAgeDays: 365,
      permissionStrength: 5,
      riskScore: 2,
    });
  });

  it("encodes missing as explicit null, never 0", () => {
    const n = instanceFeatureNumerics(fixture({
      permissionTypeSummary: undefined,
      accessibleDataBytes: undefined,
      activityTotal: undefined,
      membershipAgeDays: null,
      permissionStrength: undefined,
      riskScore: undefined,
    }));
    expect(n).toEqual({
      folderBreadth: null,
      accessibleDataBytes: null,
      activityTotal: null,
      membershipAgeDays: null,
      permissionStrength: null,
      riskScore: null,
    });
  });

  it("keeps legitimate zeros as 0 (falsy-zero trap)", () => {
    const n = instanceFeatureNumerics(fixture({
      permissionTypeSummary: { folderBreadth: 0, coverage: "known", mixedProfile: false, fullController: false },
      accessibleDataBytes: 0,
      activityTotal: 0,
      membershipAgeDays: 0,
      permissionStrength: 0,
      riskScore: 0,
    }));
    expect(n).toEqual({
      folderBreadth: 0,
      accessibleDataBytes: 0,
      activityTotal: 0,
      membershipAgeDays: 0,
      permissionStrength: 0,
      riskScore: 0,
    });
  });
});
