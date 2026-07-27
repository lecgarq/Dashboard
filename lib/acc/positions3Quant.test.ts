import { describe, expect, it } from "vitest";
import {
  POSITIONS3_QMAX,
  dequantizePosition3,
  quantizePositions3,
} from "./positions3Quant";

describe("positions3 quantization", () => {
  it("round-trips within one quantization step", () => {
    const H = 1000;
    const xyz = new Float32Array([-1000, -333.33, 0, 0.015, 512.7, 1000]);
    const q = quantizePositions3(xyz, H);
    const step = (2 * H) / POSITIONS3_QMAX;
    for (let i = 0; i < xyz.length; i++) {
      expect(Math.abs(dequantizePosition3(q[i], H) - xyz[i])).toBeLessThanOrEqual(step);
    }
  });

  it("clamps out-of-range values to the extent", () => {
    const q = quantizePositions3(new Float32Array([-2000, 2000]), 1000);
    expect(q[0]).toBe(0);
    expect(q[1]).toBe(POSITIONS3_QMAX);
  });

  it("zero halfExtent degenerates safely to zeros", () => {
    expect(Array.from(quantizePositions3(new Float32Array([1, -1]), 0))).toEqual([0, 0]);
  });
});
