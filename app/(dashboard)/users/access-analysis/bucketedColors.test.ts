import { describe, it, expect } from "vitest";
import { buildBucketedColors, CATEGORICAL_PALETTE, OTHER_GREY } from "./bucketedColors";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function f(role: string): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "", project: "", role,
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active",
  };
}

describe("buildBucketedColors", () => {
  it("colors all distinct values when count <= maxColors and emits no Other row", () => {
    const feats = [f("A"), f("A"), f("B"), f("C")];
    const { colors, legend } = buildBucketedColors(feats, "role", 12);
    expect(colors.length).toBe(feats.length * 4);
    expect(legend.some((l) => l.isOther)).toBe(false);
    expect(legend.find((l) => l.label === "A")?.count).toBe(2);
    expect(legend.reduce((s, l) => s + l.count, 0)).toBe(feats.length);
  });

  it("ranks by count desc, keeps top-N, folds the rest into one grey Other", () => {
    const feats = [
      f("big"), f("big"), f("big"),
      f("s1"), f("s2"), f("s3"), f("s4"),
    ];
    const { legend } = buildBucketedColors(feats, "role", 2);
    expect(legend[0].label).toBe("big");
    expect(legend[0].count).toBe(3);
    const other = legend.find((l) => l.isOther);
    expect(other).toBeTruthy();
    expect(other!.color).toEqual(OTHER_GREY);
    expect(legend.filter((l) => !l.isOther).length).toBe(2);
    expect(legend.reduce((s, l) => s + l.count, 0)).toBe(feats.length);
  });

  it("assigns palette colors to colored rows and grey to Other members in the buffer", () => {
    const feats = [f("big"), f("big"), f("small")];
    const { colors } = buildBucketedColors(feats, "role", 1);
    expect([colors[0], colors[1], colors[2]]).toEqual(CATEGORICAL_PALETTE[0]);
    expect([colors[8], colors[9], colors[10]]).toEqual(OTHER_GREY);
    expect(colors[3]).toBe(1); // alpha
  });

  it("ordered dimensions return a ramp buffer and an empty discrete legend", () => {
    const feats = [f("A"), f("B")];
    const { legend } = buildBucketedColors(feats, "riskScore", 12); // riskScore has colorScale: "ordered"
    expect(Array.isArray(legend)).toBe(true);
    expect(legend.length).toBe(0);
  });
});
