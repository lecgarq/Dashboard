import { describe, it, expect } from "vitest";
import { buildCatalogWeights } from "./catalogWeights";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const node = (p: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot => p as unknown as NodeFeatureSnapshot;
const dim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x", label: "X", family: "structure", kind: "categorical", source: "t",
  confidence: "high", available: true, surfaces: ["slider"], extract: () => null, ...over,
});

describe("catalogWeights", () => {
  it("confidence scales weight: high=1, medium=0.7, low=0.4", () => {
    const features = [node({ project: "A" })];
    const hi = buildCatalogWeights(features, [dim({ id: "h", confidence: "high", extract: () => "A" })]);
    const me = buildCatalogWeights(features, [dim({ id: "m", confidence: "medium", extract: () => "A" })]);
    const lo = buildCatalogWeights(features, [dim({ id: "l", confidence: "low", extract: () => "A" })]);
    expect(hi["h"][0]).toBeCloseTo(1, 6);
    expect(me["m"][0]).toBeCloseTo(0.7, 6);
    expect(lo["l"][0]).toBeCloseTo(0.4, 6);
  });

  it("ordinal: availability is 1 for ALL nodes (count 0 is a real 'none')", () => {
    const d = dim({ id: "view", kind: "ordinal", family: "activity", confidence: "medium", extract: (f) => f.actionCounts?.["view"] ?? 0 });
    const features = [node({ actionCounts: {} }), node({ actionCounts: { view: 9 } })];
    const w = buildCatalogWeights(features, [d])["view"];
    expect(w[0]).toBeCloseTo(0.7, 6);
    expect(w[1]).toBeCloseTo(0.7, 6);
  });

  it("categorical: a node with no value (null) gets weight 0 (availability gate)", () => {
    const d = dim({ id: "project", kind: "categorical", confidence: "high", extract: (f) => f.project ?? null });
    const features = [node({ project: "A" }), node({})];
    const w = buildCatalogWeights(features, [d])["project"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBe(0);
  });

  it("multiHot: empty signature → weight 0 (matches the centroid origin gate)", () => {
    const d = dim({ id: "moduleAccess", kind: "multiHot", confidence: "high", extract: (f) => (f.moduleSignature ?? []) as string[] });
    const features = [node({ moduleSignature: ["build"] }), node({ moduleSignature: [] })];
    const w = buildCatalogWeights(features, [d])["moduleAccess"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBe(0);
  });

  it("binary: always weighted (admin/member are both real poles)", () => {
    const d = dim({ id: "admin", kind: "binary", confidence: "high", extract: (f) => (f.isAdmin ? "admin" : "member") });
    const features = [node({ isAdmin: true }), node({ isAdmin: false })];
    const w = buildCatalogWeights(features, [d])["admin"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBeCloseTo(1, 6);
  });

  it("categorical extract returning a number gets weight 1 (number is a valid non-null value)", () => {
    const d = dim({ id: "score", kind: "categorical", confidence: "high", extract: () => 42 });
    const w = buildCatalogWeights([node({})], [d])["score"];
    expect(w[0]).toBeCloseTo(1, 6);
  });
});
