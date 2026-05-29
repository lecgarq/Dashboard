import { describe, it, expect } from "vitest";
import { fillFactor } from "./clusterPacking";

describe("fillFactor", () => {
  it("is loose (fills footprint) at low tightness and tight at high tightness", () => {
    expect(fillFactor(0)).toBeCloseTo(1.0, 5);
    expect(fillFactor(1)).toBeCloseTo(0.45, 5);
  });
  it("is monotonically non-increasing in tightness", () => {
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const f = fillFactor(t);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      prev = f;
    }
  });
  it("clamps out-of-range tightness", () => {
    expect(fillFactor(-1)).toBeCloseTo(1.0, 5);
    expect(fillFactor(2)).toBeCloseTo(0.45, 5);
  });
});
