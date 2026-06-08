import { describe, it, expect } from "vitest";
import {
  buildBucketedColors,
  bucketedColorsFromClustering,
  CATEGORICAL_PALETTE,
  OTHER_GREY,
} from "./bucketedColors";
import type { DominantClustering } from "./dominantClusters";
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

  it("treats the non-dim 'status' mode as categorical", () => {
    const { legend } = buildBucketedColors([f("A"), f("B")], "status", 12);
    expect(legend.some((l) => l.isOther)).toBe(false);
    expect(legend.reduce((s, l) => s + l.count, 0)).toBe(2);
  });

  it("returns empty buffer and legend for zero features", () => {
    const { colors, legend } = buildBucketedColors([], "role", 12);
    expect(colors.length).toBe(0);
    expect(legend.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// company color mode
// ---------------------------------------------------------------------------

const fc = (firmName: string): NodeFeatureSnapshot => ({
  nodeId: "u::p", nameLower: "", emailLower: "", project: "", role: "r",
  permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
  activityCountRaw: 0, lastSignInRel: "Never", permissionCoverage: "unknown",
  firmName, accountStatus: "active",
} as NodeFeatureSnapshot);

describe("company color mode", () => {
  it("buckets by firmName and produces a legend", () => {
    const r = buildBucketedColors([fc("Acme"), fc("Acme"), fc("Globex")], "company", 12);
    const labels = r.legend.map((e) => e.label);
    expect(labels).toContain("Acme");
    expect(labels).toContain("Globex");
    expect(r.colors.length).toBe(3 * 4);
  });
});

// ---------------------------------------------------------------------------
// bucketedColorsFromClustering — color by an existing dominant clustering
// ---------------------------------------------------------------------------

describe("bucketedColorsFromClustering", () => {
  // clusters: 0="Big"(3), 1="Mid"(2), 2="Small"(1); nodes aligned to ids.
  const clustering: DominantClustering = {
    ids: Int32Array.from([0, 0, 0, 1, 1, 2]),
    labels: ["Big", "Mid", "Small"],
    counts: [3, 2, 1],
  };

  it("colors every node by its cluster and emits a legend matching the cluster labels", () => {
    const { colors, legend } = bucketedColorsFromClustering(clustering, 12);
    expect(colors.length).toBe(6 * 4);
    expect(legend.map((e) => e.label)).toEqual(["Big", "Mid", "Small"]);
    expect(legend.find((e) => e.label === "Big")?.count).toBe(3);
    expect(legend.some((e) => e.isOther)).toBe(false);
    // Top-ranked cluster (Big) gets palette[0]; its members share that color.
    expect([colors[0], colors[1], colors[2]]).toEqual(CATEGORICAL_PALETTE[0]);
    expect(colors[3]).toBe(1); // alpha
  });

  it("ranks clusters by count and folds the rest into one grey Other", () => {
    const { colors, legend } = bucketedColorsFromClustering(clustering, 2);
    expect(legend[0].label).toBe("Big");
    const other = legend.find((e) => e.isOther);
    expect(other).toBeTruthy();
    expect(other!.count).toBe(1); // the "Small" cluster folds into Other
    expect(legend.filter((e) => !e.isOther).length).toBe(2);
    // The folded cluster's member (node index 5) is grey.
    expect([colors[20], colors[21], colors[22]]).toEqual(OTHER_GREY);
  });
});
