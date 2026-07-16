import { describe, it, expect } from "vitest";
import { buildMaskPredicate } from "./usePredicateEngine";

const features = [
  { nodeId: "u1::p1" }, { nodeId: "u1::p2" }, { nodeId: "u3::p3" }, { nodeId: "u4::p4" },
] as any;

describe("neighbor highlight", () => {
  it("lights the clicked node + its neighbor indices, dims the rest", () => {
    const pred = buildMaskPredicate({
      features, activeFilters: [], searchQuery: "", lassoSelection: null,
      drillDown: null, isolatedNodeIndex: 0, neighborIndices: new Set([2]),
    } as any);
    expect(pred(0)).toBe(1.0); // clicked
    expect(pred(2)).toBe(1.0); // neighbor
    expect(pred(1)).toBe(0.15); // same user, different project: deliberately dim
    expect(pred(3)).toBe(0.15);
  });
});
