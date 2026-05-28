// gpuLayout2D.test.ts
import { describe, it, expect } from "vitest";
import { computeAnchors } from "./gpuLayout2D";

// Two dims whose single-dim targets sit on orthogonal axes (matches mathLayer:
// target[dim] already encodes R*u_d*f_d, so blending = weighted average).
const targets = {
  d1: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
  d2: { x: new Float32Array([0, 0]), y: new Float32Array([100, 100]), z: new Float32Array([0, 0]) },
};
const dimWeights = { d1: new Float32Array([1, 1]), d2: new Float32Array([1, 1]) };

describe("computeAnchors", () => {
  it("returns an n*2 buffer of zeros when all sliders are zero (origin collapse)", () => {
    const a = computeAnchors({ d1: 0, d2: 0 }, targets, dimWeights, 2);
    expect(a).toBeInstanceOf(Float32Array);
    expect(a.length).toBe(4);
    expect(Array.from(a)).toEqual([0, 0, 0, 0]);
  });

  it("places anchors at the d1 target when only d1 is active", () => {
    const a = computeAnchors({ d1: 1, d2: 0 }, targets, dimWeights, 2);
    // node 0 → (100, 0); node 1 → (100, 0)
    expect(a[0]).toBeCloseTo(100, 5);
    expect(a[1]).toBeCloseTo(0, 5);
    expect(a[2]).toBeCloseTo(100, 5);
    expect(a[3]).toBeCloseTo(0, 5);
  });

  it("blends targets proportionally (equal sliders → midpoint)", () => {
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, dimWeights, 2);
    expect(a[0]).toBeCloseTo(50, 5);
    expect(a[1]).toBeCloseTo(50, 5);
  });

  it("gates a node to the origin when its dimWeight is zero on every active dim", () => {
    const zeroW = { d1: new Float32Array([0, 1]), d2: new Float32Array([0, 1]) };
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, zeroW, 2);
    // node 0 has zero weight everywhere → stays at origin
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(0);
    // node 1 blends normally
    expect(a[2]).toBeCloseTo(50, 5);
    expect(a[3]).toBeCloseTo(50, 5);
  });

  it("throws on a node-count mismatch (dev guard)", () => {
    expect(() => computeAnchors({ d1: 1 }, targets, dimWeights, 3)).toThrow();
  });
});
