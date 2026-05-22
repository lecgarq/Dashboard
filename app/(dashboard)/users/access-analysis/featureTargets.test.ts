import { describe, it, expect } from "vitest";
import {
  TARGET_DIMENSIONS,
  categoryValue,
  computeDimensionTarget,
  computeMultiHotTarget,
  buildFeatureTargets,
  type TargetDimensionId,
} from "./featureTargets";
import { getDimension } from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function feature(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "",
    emailLower: "",
    project: "Project A",
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

function isFiniteArray(a: Float32Array): boolean {
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) return false;
  }
  return true;
}

function dist3(a: Float32Array, i: number, j: number): number {
  const dx = a[i * 3] - a[j * 3];
  const dy = a[i * 3 + 1] - a[j * 3 + 1];
  const dz = a[i * 3 + 2] - a[j * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// categoryValue
// ---------------------------------------------------------------------------

describe("categoryValue", () => {
  it("maps each dimension to its categorical feature field", () => {
    const f = feature({
      role: "Engineer",
      permTier: "edit",
      project: "Tower",
      isExternal: true,
      activityBucket: "High",
      signinBucket: "<7d",
    });
    expect(categoryValue(f, "role")).toBe("Engineer");
    expect(categoryValue(f, "tier")).toBe("edit");
    expect(categoryValue(f, "project")).toBe("Tower");
    expect(categoryValue(f, "internalExternal")).toBe("external");
    expect(categoryValue(f, "activity")).toBe("High");
    expect(categoryValue(f, "signin")).toBe("<7d");
  });

  it("represents a null permission tier as a stable category", () => {
    expect(categoryValue(feature({ permTier: null }), "tier")).toBe("(none)");
  });

  it("represents internal users distinctly from external", () => {
    expect(categoryValue(feature({ isExternal: false }), "internalExternal")).toBe("internal");
    expect(categoryValue(feature({ isExternal: true }), "internalExternal")).toBe("external");
  });
});

// ---------------------------------------------------------------------------
// computeDimensionTarget
// ---------------------------------------------------------------------------

describe("computeDimensionTarget", () => {
  const dim: TargetDimensionId = "role";

  it("returns a stride-3 array of length n*3", () => {
    const features = [feature(), feature({ role: "Engineer" }), feature({ role: "PM" })];
    const out = computeDimensionTarget(features, dim);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(features.length * 3);
  });

  it("produces no NaN or Infinity values", () => {
    const features = [
      feature({ role: "A" }),
      feature({ role: "B" }),
      feature({ role: "C" }),
      feature({ role: "A" }),
    ];
    expect(isFiniteArray(computeDimensionTarget(features, dim))).toBe(true);
  });

  it("is deterministic — identical input yields identical output", () => {
    const features = [feature({ role: "A" }), feature({ role: "B" }), feature({ role: "C" })];
    const a = computeDimensionTarget(features, dim);
    const b = computeDimensionTarget(features, dim);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("anchors nodes of the SAME category to the SAME point", () => {
    const features = [feature({ role: "A" }), feature({ role: "B" }), feature({ role: "A" })];
    const out = computeDimensionTarget(features, dim);
    // index 0 and index 2 share role "A" → identical anchor
    expect(dist3(out, 0, 2)).toBe(0);
  });

  it("separates DIFFERENT categories spatially", () => {
    const features = [feature({ role: "A" }), feature({ role: "B" })];
    const out = computeDimensionTarget(features, dim);
    expect(dist3(out, 0, 1)).toBeGreaterThan(0.1);
  });

  it("does not depend on input order for the anchor of a given category", () => {
    const f1 = [feature({ role: "A" }), feature({ role: "B" }), feature({ role: "C" })];
    const f2 = [feature({ role: "C" }), feature({ role: "B" }), feature({ role: "A" })];
    const a = computeDimensionTarget(f1, dim);
    const b = computeDimensionTarget(f2, dim);
    // "B" is at index 1 in both arrangements → same anchor regardless of order
    expect(a[1 * 3]).toBeCloseTo(b[1 * 3], 6);
    expect(a[1 * 3 + 1]).toBeCloseTo(b[1 * 3 + 1], 6);
    expect(a[1 * 3 + 2]).toBeCloseTo(b[1 * 3 + 2], 6);
  });

  it("handles a single distinct category without NaN", () => {
    const features = [feature({ role: "Solo" }), feature({ role: "Solo" })];
    const out = computeDimensionTarget(features, dim);
    expect(isFiniteArray(out)).toBe(true);
    expect(dist3(out, 0, 1)).toBe(0);
  });

  it("handles an empty feature list", () => {
    expect(computeDimensionTarget([], dim).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildFeatureTargets
// ---------------------------------------------------------------------------

describe("buildFeatureTargets", () => {
  const features = [
    feature({ role: "A", project: "P1", isExternal: false, activityBucket: "Low" }),
    feature({ role: "B", project: "P2", isExternal: true, activityBucket: "High" }),
    feature({ role: "A", project: "P1", isExternal: false, activityBucket: "Low" }),
  ];

  it("returns a {x,y,z} triple per default dimension, each length n", () => {
    const targets = buildFeatureTargets(features);
    for (const dim of TARGET_DIMENSIONS) {
      expect(targets[dim]).toBeDefined();
      expect(targets[dim].x.length).toBe(features.length);
      expect(targets[dim].y.length).toBe(features.length);
      expect(targets[dim].z.length).toBe(features.length);
    }
  });

  it("contains only finite values", () => {
    const targets = buildFeatureTargets(features);
    for (const dim of TARGET_DIMENSIONS) {
      expect(isFiniteArray(targets[dim].x)).toBe(true);
      expect(isFiniteArray(targets[dim].y)).toBe(true);
      expect(isFiniteArray(targets[dim].z)).toBe(true);
    }
  });

  it("is stable across runs", () => {
    const a = buildFeatureTargets(features);
    const b = buildFeatureTargets(features);
    for (const dim of TARGET_DIMENSIONS) {
      expect(Array.from(a[dim].x)).toEqual(Array.from(b[dim].x));
      expect(Array.from(a[dim].y)).toEqual(Array.from(b[dim].y));
      expect(Array.from(a[dim].z)).toEqual(Array.from(b[dim].z));
    }
  });

  it("respects an explicit dimension subset", () => {
    const targets = buildFeatureTargets(features, ["role"]);
    expect(Object.keys(targets)).toEqual(["role"]);
  });
});

// ---------------------------------------------------------------------------
// Volumetric distribution — anchors must occupy a 3D volume, not a flat ring.
// (Visual requirement: organic neuronal network, not a disc/ring seen in 3D.)
// ---------------------------------------------------------------------------

function axisStats(out: Float32Array, axis: 0 | 1 | 2) {
  const vals: number[] = [];
  for (let i = 0; i < out.length / 3; i++) vals.push(out[i * 3 + axis]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return { min, max, range: max - min, std: Math.sqrt(variance) };
}

describe("computeDimensionTarget volumetric distribution", () => {
  // 16 distinct categories → 16 anchors, one node each (anchor cloud == node cloud).
  const manyCategories = Array.from({ length: 16 }, (_, i) =>
    feature({ role: `R${i}` }),
  );
  const out = computeDimensionTarget(manyCategories, "role");

  it("uses all three axes (every axis has spread)", () => {
    expect(axisStats(out, 0).range).toBeGreaterThan(0.1);
    expect(axisStats(out, 1).range).toBeGreaterThan(0.1);
    expect(axisStats(out, 2).range).toBeGreaterThan(0.1);
  });

  it("has a non-trivial z range (zRange > 0)", () => {
    expect(axisStats(out, 2).range).toBeGreaterThan(0);
  });

  it("z spread is not negligible vs x/y spread (not a flat disc)", () => {
    const x = axisStats(out, 0).range;
    const y = axisStats(out, 1).range;
    const z = axisStats(out, 2).range;
    expect(z).toBeGreaterThanOrEqual(0.4 * Math.max(x, y));
  });

  it("is not effectively planar — smallest axial spread is a real fraction of the largest", () => {
    const sx = axisStats(out, 0).std;
    const sy = axisStats(out, 1).std;
    const sz = axisStats(out, 2).std;
    const minStd = Math.min(sx, sy, sz);
    const maxStd = Math.max(sx, sy, sz);
    expect(minStd / maxStd).toBeGreaterThan(0.3);
  });

  it("places two distinct categories at anchors differing in x, y AND z", () => {
    const eps = 1e-4;
    // R0 → sorted index 0; R8 → sorted index 8 (sort is lexicographic: R0,R1,...)
    const a0 = 0;
    const a8 = manyCategories.findIndex((f) => f.role === "R8");
    expect(Math.abs(out[a0 * 3] - out[a8 * 3])).toBeGreaterThan(eps);
    expect(Math.abs(out[a0 * 3 + 1] - out[a8 * 3 + 1])).toBeGreaterThan(eps);
    expect(Math.abs(out[a0 * 3 + 2] - out[a8 * 3 + 2])).toBeGreaterThan(eps);
  });

  it("clusters same-category nodes nearer than different-category nodes in 3D", () => {
    const features = [
      feature({ role: "A" }),
      feature({ role: "B" }),
      feature({ role: "A" }),
    ];
    const o = computeDimensionTarget(features, "role");
    const same = dist3(o, 0, 2); // both "A"
    const cross = dist3(o, 0, 1); // "A" vs "B"
    expect(same).toBeLessThan(cross);
    expect(same).toBe(0);
  });

  it("is deterministic and finite for the volumetric layout", () => {
    const again = computeDimensionTarget(manyCategories, "role");
    expect(Array.from(out)).toEqual(Array.from(again));
    expect(isFiniteArray(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registry-driven categoryValue
// ---------------------------------------------------------------------------

describe("featureTargets — registry-driven categoryValue", () => {
  it("TARGET_DIMENSIONS matches the registry runtime ids", () => {
    expect(TARGET_DIMENSIONS).toEqual([
      "project", "role", "tier", "internalExternal", "activity", "signin",
    ]);
  });

  it("categoryValue delegates to the registry descriptor.extract (coerced to string)", () => {
    const f = feature({ project: "Tower", role: "Engineer", permTier: "edit" });
    expect(categoryValue(f, "project")).toBe(getDimension("project")!.extract(f));
    expect(categoryValue(f, "role")).toBe(getDimension("role")!.extract(f));
    // null/absent coerces to a stable bucket string, never "null"
    expect(categoryValue(feature({ firmName: "" }), "internalExternal")).toBe("internal");
  });
});

// ---------------------------------------------------------------------------
// Multi-hot module anchors
// ---------------------------------------------------------------------------

describe("featureTargets — multi-hot module anchors", () => {
  it("a module-only node with shared modules converges near other same-module nodes", () => {
    const a = feature({ nodeId: "a", moduleSignature: ["build", "cost"] });
    const b = feature({ nodeId: "b", moduleSignature: ["build", "cost"] });
    const c = feature({ nodeId: "c", moduleSignature: ["takeoff"] });
    const xyz = computeMultiHotTarget([a, b, c], "module");
    // same signature → identical anchor; different signature → separated
    expect(dist3(xyz, 0, 1)).toBeCloseTo(0, 3);
    expect(dist3(xyz, 0, 2)).toBeGreaterThan(0);
  });

  it("an empty module signature anchors at the origin (no pull)", () => {
    const a = feature({ nodeId: "a", moduleSignature: [] });
    const xyz = computeMultiHotTarget([a], "module");
    expect(xyz[0]).toBe(0);
    expect(xyz[1]).toBe(0);
    expect(xyz[2]).toBe(0);
  });

  it("all anchor coordinates are finite", () => {
    const fs = [
      feature({ moduleSignature: ["build"] }),
      feature({ moduleSignature: ["build", "cost"] }),
      feature({ moduleSignature: [] }),
    ];
    expect(isFiniteArray(computeMultiHotTarget(fs, "module"))).toBe(true);
  });
});
