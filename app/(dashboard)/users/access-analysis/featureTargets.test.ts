import { describe, it, expect } from "vitest";
import {
  TARGET_DIMENSIONS,
  categoryValue,
  computeDimensionTarget,
  buildFeatureTargets,
  type TargetDimensionId,
} from "./featureTargets";
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
    expect(categoryValue(f, "isExternal")).toBe("external");
    expect(categoryValue(f, "activity")).toBe("High");
    expect(categoryValue(f, "signin")).toBe("<7d");
  });

  it("represents a null permission tier as a stable category", () => {
    expect(categoryValue(feature({ permTier: null }), "tier")).toBe("(none)");
  });

  it("represents internal users distinctly from external", () => {
    expect(categoryValue(feature({ isExternal: false }), "isExternal")).toBe("internal");
    expect(categoryValue(feature({ isExternal: true }), "isExternal")).toBe("external");
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
