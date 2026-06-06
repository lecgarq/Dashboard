// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { clusterCentroids } from "./MapClusterLabels";

describe("clusterCentroids", () => {
  it("averages member x/y per cluster id and counts members", () => {
    // 4 nodes, stride-3 positions; clusterIds: [0,0,1,1]
    const pos = new Float32Array([
      0, 0, 0,   2, 4, 0,   10, 10, 0,   12, 14, 0,
    ]);
    const ids = new Int32Array([0, 0, 1, 1]);
    const { cx, cy, counts } = clusterCentroids(pos, ids, 2);
    expect(cx[0]).toBeCloseTo(1);   // (0+2)/2
    expect(cy[0]).toBeCloseTo(2);   // (0+4)/2
    expect(cx[1]).toBeCloseTo(11);  // (10+12)/2
    expect(cy[1]).toBeCloseTo(12);  // (10+14)/2
    expect(Array.from(counts)).toEqual([2, 2]);
  });

  it("returns count 0 (NaN-free) for an empty cluster id", () => {
    const pos = new Float32Array([0, 0, 0]);
    const ids = new Int32Array([0]);
    const { cx, cy, counts } = clusterCentroids(pos, ids, 2);
    expect(counts[1]).toBe(0);
    expect(cx[1]).toBe(0);
    expect(cy[1]).toBe(0);
  });
});
