import { describe, it, expect } from "vitest";
import { computeBBoxStride2 } from "./embeddingFit";

describe("computeBBoxStride2", () => {
  it("returns center + half-extent of the bounding square", () => {
    // points span x:[-10,30] (width 40), y:[0,10] (height 10)
    const xy = new Float32Array([-10, 0, 30, 10, 10, 5]);
    const b = computeBBoxStride2(xy);
    expect(b.minX).toBe(-10);
    expect(b.maxX).toBe(30);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(10);
    expect(b.cx).toBe(10);
    expect(b.cy).toBe(5);
    // half-extent is the LARGER half-span (so the fit is a square)
    expect(b.halfExtent).toBe(20);
  });

  it("is safe on an empty buffer", () => {
    const b = computeBBoxStride2(new Float32Array(0));
    expect(b.halfExtent).toBe(0);
    expect(b.cx).toBe(0);
    expect(b.cy).toBe(0);
  });
});
