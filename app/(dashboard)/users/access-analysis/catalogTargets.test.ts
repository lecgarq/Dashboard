import { describe, it, expect } from "vitest";
import {
  buildCatalogTargets,
  computeOrdinalRampTarget,
} from "./catalogTargets";
import { ANCHOR_RADIUS } from "./featureTargets";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(partial: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return partial as unknown as NodeFeatureSnapshot;
}

const catDim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x",
  label: "X",
  family: "structure",
  kind: "categorical",
  source: "test",
  confidence: "high",
  available: true,
  surfaces: ["slider"],
  extract: () => null,
  ...over,
});

describe("catalogTargets", () => {
  it("categorical: same value → identical anchor; different values → separated", () => {
    const dim = catDim({ id: "project", kind: "categorical", extract: (f) => f.project ?? null });
    const features = [node({ project: "A" }), node({ project: "B" }), node({ project: "A" })];
    const t = buildCatalogTargets(features, [dim])["project"];
    expect(t.x[0]).toBeCloseTo(t.x[2], 6);
    expect(t.y[0]).toBeCloseTo(t.y[2], 6);
    const d = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z![0] - t.z![1]);
    expect(d).toBeGreaterThan(0);
  });

  it("ordinal ramp: none and high sit at opposite ends of one axis (gradient)", () => {
    const dim = catDim({ id: "permission", kind: "ordinal", family: "access" });
    const features = [node({ permissionStrength: 0 }), node({ permissionStrength: 5 })];
    const t = buildCatalogTargets(features, [dim])["permission"];
    const sep = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z![0] - t.z![1]);
    expect(sep).toBeGreaterThan(ANCHOR_RADIUS);
    expect(Math.sign(t.x[0])).not.toBe(Math.sign(t.x[1]));
  });

  it("ordinal ramp: monotonic position along the axis (low between none and high)", () => {
    const dim = catDim({ id: "permission", kind: "ordinal", family: "access" });
    const features = [
      node({ permissionStrength: 0 }),
      node({ permissionStrength: 2 }),
      node({ permissionStrength: 5 }),
    ];
    const t = buildCatalogTargets(features, [dim])["permission"];
    const lo = t.x[0], mid = t.x[1], hi = t.x[2];
    expect((mid - lo) * (hi - mid)).toBeGreaterThan(0);
  });

  it("ordinal action ramp: count buckets via per-action quantiles", () => {
    const dim = catDim({
      id: "view-entity",
      kind: "ordinal",
      family: "activity",
      extract: (f) => f.actionCounts?.["view-entity"] ?? 0,
    });
    const features = [
      node({ actionCounts: {} }),
      node({ actionCounts: { "view-entity": 1 } }),
      node({ actionCounts: { "view-entity": 100 } }),
    ];
    const t = buildCatalogTargets(features, [dim])["view-entity"];
    const sep = Math.hypot(t.x[0] - t.x[2], t.y[0] - t.y[2], t.z![0] - t.z![2]);
    expect(sep).toBeGreaterThan(0);
    expect(Number.isFinite(t.x[1])).toBe(true);
  });

  it("multiHot: empty signature → origin (no pull); shared signature → shared centroid", () => {
    const dim = catDim({
      id: "moduleAccess",
      kind: "multiHot",
      family: "access",
      extract: (f) => (f.moduleSignature ?? []) as string[],
    });
    const features = [
      node({ moduleSignature: [] }),
      node({ moduleSignature: ["build", "docs"] }),
      node({ moduleSignature: ["build", "docs"] }),
    ];
    const t = buildCatalogTargets(features, [dim])["moduleAccess"];
    expect(t.x[0]).toBe(0);
    expect(t.y[0]).toBe(0);
    expect(t.x[1]).toBeCloseTo(t.x[2], 6);
  });

  it("computeOrdinalRampTarget is deterministic & length-correct", () => {
    const dim = catDim({ id: "permission", kind: "ordinal" });
    const features = [node({ permissionStrength: 3 }), node({ permissionStrength: 3 })];
    const a = computeOrdinalRampTarget(features, dim, () => ({ index: 3, bucketCount: 6 }));
    const b = computeOrdinalRampTarget(features, dim, () => ({ index: 3, bucketCount: 6 }));
    expect(a.length).toBe(6);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[0]).toBeCloseTo(a[3], 6);
  });
});
