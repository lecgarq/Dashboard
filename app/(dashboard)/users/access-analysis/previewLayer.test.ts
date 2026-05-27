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
