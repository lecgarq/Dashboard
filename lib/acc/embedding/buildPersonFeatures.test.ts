import { describe, expect, it } from "vitest";
import { quantileBucket, quantileEdges } from "./buildPersonFeatures";

describe("quantile bucketing", () => {
  it("returns -1 for non-positive values", () => {
    expect(quantileBucket(0, [1, 2, 3])).toBe(-1);
  });
  it("buckets a value by quantile edges", () => {
    const edges = quantileEdges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5); // 4 internal edges
    expect(edges).toHaveLength(4);
    expect(quantileBucket(1, edges)).toBe(0);
    expect(quantileBucket(10, edges)).toBe(4);
  });
});
