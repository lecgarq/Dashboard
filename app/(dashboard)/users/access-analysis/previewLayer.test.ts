// previewLayer.test.ts
import { describe, it, expect } from "vitest";
import { createPreviewLayer } from "./previewLayer";

const targets = {
  d1: { x: new Float32Array([1, 2]), y: new Float32Array([3, 4]), z: new Float32Array([5, 6]) },
};
const dimWeights = { d1: new Float32Array([1, 1]) };

describe("previewLayer — construction & seed", () => {
  it("allocates an n*3 displayed buffer of zeros", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    expect(p.displayed).toBeInstanceOf(Float32Array);
    expect(p.displayed.length).toBe(6);
    expect(Array.from(p.displayed)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("seedFrom copies the provided xyz verbatim", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const seed = new Float32Array([10, 11, 12, 20, 21, 22]);
    p.seedFrom(seed);
    expect(Array.from(p.displayed)).toEqual([10, 11, 12, 20, 21, 22]);
  });

  it("seedFrom returns the same buffer reference each call (no realloc)", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const before = p.displayed;
    p.seedFrom(new Float32Array(6));
    expect(p.displayed).toBe(before);
  });
});

describe("previewLayer — step", () => {
  const targets = {
    d1: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
    d2: { x: new Float32Array([0, 0]), y: new Float32Array([100, 100]), z: new Float32Array([0, 0]) },
  };
  const dimWeights = { d1: new Float32Array([1, 1]), d2: new Float32Array([1, 1]) };

  it("returns false when all sliders are zero", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([50, 50, 0, 50, 50, 0]));
    const moved = p.step({ d1: 0, d2: 0 }, 16);
    expect(moved).toBe(false);
    expect(Array.from(p.displayed)).toEqual([50, 50, 0, 50, 50, 0]);
  });

  it("moves toward the d1 target when only d1 is active", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([0, 0, 0, 0, 0, 0]));
    const moved = p.step({ d1: 1, d2: 0 }, 16);
    expect(moved).toBe(true);
    expect(p.displayed[0]).toBeGreaterThan(20);
    expect(p.displayed[0]).toBeLessThan(45);
    expect(p.displayed[1]).toBe(0);
  });

  it("blends targets proportionally to slider values", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([0, 0, 0, 0, 0, 0]));
    for (let i = 0; i < 200; i++) p.step({ d1: 1, d2: 1 }, 16);
    expect(p.displayed[0]).toBeCloseTo(50, 0);
    expect(p.displayed[1]).toBeCloseTo(50, 0);
  });

  it("holds position when a node has zero dimWeight on every active dim", () => {
    const zeroW = { d1: new Float32Array([0, 1]), d2: new Float32Array([0, 1]) };
    const p = createPreviewLayer({ targets, dimWeights: zeroW, nodeCount: 2 });
    p.seedFrom(new Float32Array([7, 7, 7, 0, 0, 0]));
    p.step({ d1: 1, d2: 1 }, 16);
    expect(p.displayed[0]).toBe(7);
    expect(p.displayed[1]).toBe(7);
    expect(p.displayed[2]).toBe(7);
    expect(p.displayed[3]).toBeGreaterThan(0);
  });

  it("does not allocate per-frame (buffer reference stable across many steps)", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const ref = p.displayed;
    for (let i = 0; i < 100; i++) p.step({ d1: 1, d2: 0 }, 16);
    expect(p.snapshot()).toBe(ref);
  });
});
