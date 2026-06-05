import { describe, it, expect } from "vitest";
import { buildNodeSizes, ACCESS_WEIGHT } from "./nodeSizes";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function f(p: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "", project: "", role: "",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active", ...p,
  };
}

describe("buildNodeSizes", () => {
  it("returns one radius per feature, all within [MIN,MAX]", () => {
    const feats = [f({}), f({ permissionStrength: 5, isAdmin: true, projectCount: 30 })];
    const sizes = buildNodeSizes(feats);
    expect(sizes).toBeInstanceOf(Float32Array);
    expect(sizes.length).toBe(2);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(2);
      expect(s).toBeLessThanOrEqual(5.5);
    }
  });

  it("is monotonic: more access => larger-or-equal radius", () => {
    const low = f({ permissionStrength: 0, isAdmin: false, projectCount: 1 });
    const high = f({ permissionStrength: 5, isAdmin: true, projectCount: 20 });
    const [sLow, sHigh] = buildNodeSizes([low, high]);
    expect(sHigh).toBeGreaterThan(sLow);
  });

  it("admin outranks a non-admin of equal permission strength", () => {
    const plain = f({ permissionStrength: 3, isAdmin: false, projectCount: 2 });
    const admin = f({ permissionStrength: 3, isAdmin: true, projectCount: 2 });
    const [sPlain, sAdmin] = buildNodeSizes([plain, admin]);
    expect(sAdmin).toBeGreaterThan(sPlain);
  });

  it("ACCESS_WEIGHT is pure and handles missing optionals as zero", () => {
    expect(ACCESS_WEIGHT(f({}))).toBe(0 + 0 + Math.log2(1 + 1));
  });

  it("degenerate all-equal input returns all MIN (no NaN from /0)", () => {
    const sizes = buildNodeSizes([f({}), f({}), f({})]);
    for (const s of sizes) expect(s).toBe(2);
  });
});
