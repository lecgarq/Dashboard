import { describe, expect, it } from "vitest";
import { CLUMP_PULL, buildClumpTargets } from "./activityClump3";

describe("buildClumpTargets", () => {
  it("pulls points toward their category centroid by CLUMP_PULL", () => {
    // Two cat-0 points at x=0 and x=10 → centroid x=5.
    const base = new Float32Array([0, 0, 0, 10, 0, 0]);
    const t = buildClumpTargets(base, new Uint16Array([0, 0]));
    expect(t[0]).toBeCloseTo(5 * CLUMP_PULL);
    expect(t[3]).toBeCloseTo(10 + (5 - 10) * CLUMP_PULL);
    // Symmetric: both end equidistant from the centroid.
    expect(5 - t[0]).toBeCloseTo(t[3] - 5);
  });

  it("keeps separate categories at their own centroids", () => {
    const base = new Float32Array([0, 0, 0, 100, 0, 0]);
    const t = buildClumpTargets(base, new Uint16Array([0, 1]));
    // Singleton categories: centroid = the point itself → no movement.
    expect(Array.from(t)).toEqual(Array.from(base));
  });

  it("returns the base buffer untouched when catIds are null or misaligned", () => {
    const base = new Float32Array([1, 2, 3]);
    expect(buildClumpTargets(base, null)).toBe(base);
    expect(buildClumpTargets(base, new Uint16Array([0, 0]))).toBe(base);
  });
});
