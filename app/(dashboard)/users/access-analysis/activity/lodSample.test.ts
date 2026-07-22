import { describe, expect, it } from "vitest";
import {
  LOD_CAP,
  gather,
  lodLabel,
  sampleStride,
  uniformSampleIndices,
  viewportIndices,
} from "./lodSample";

describe("lodSample (ACT-01 rung L2, owner decision 4)", () => {
  it("samples the real corpus size under the cap with a deterministic stride", () => {
    const total = 4_904_886;
    const stride = sampleStride(total);
    expect(stride).toBe(10); // ceil(4,904,886 / 500,000)
    const idx = uniformSampleIndices(total);
    expect(idx.length).toBe(Math.ceil(total / stride)); // 490,489
    expect(idx.length).toBeLessThanOrEqual(LOD_CAP);
    expect(idx[0]).toBe(0);
    expect(idx[1]).toBe(10);
    expect(idx[idx.length - 1]).toBe((idx.length - 1) * 10);
    // Deterministic: same inputs, identical output.
    expect(uniformSampleIndices(total)).toEqual(idx);
  });

  it("renders everything when total fits the cap (stride 1)", () => {
    const idx = uniformSampleIndices(1234);
    expect(idx.length).toBe(1234);
    expect(idx[5]).toBe(5);
  });

  it("viewportIndices returns exact members, or null past the cap", () => {
    // 4 points: two inside the box, two outside.
    const positions = new Float32Array([0, 0, 5, 5, 100, 100, -50, 3]);
    const inside = viewportIndices(positions, { minX: -1, maxX: 10, minY: -1, maxY: 10 });
    expect(Array.from(inside!)).toEqual([0, 1]);
    const overCap = viewportIndices(positions, { minX: -200, maxX: 200, minY: -200, maxY: 200 }, 3);
    expect(overCap).toBeNull();
    expect(
      Array.from(
        viewportIndices(
          positions,
          { minX: -200, maxX: 200, minY: -200, maxY: 200 },
          3,
          Uint32Array.from([1, 3]),
        )!,
      ),
    ).toEqual([1, 3]);
  });

  it("gather round-trips positions, colors, and scalars through the index mapping", () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    const colors = new Float32Array([0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 1, 0.7, 0.8, 0.9, 1]);
    const sizes = new Float32Array([9, 8, 7]);
    const idx = new Uint32Array([2, 0]);
    expect(Array.from(gather(positions, idx, 2))).toEqual([5, 6, 1, 2]);
    expect(gather(colors, idx, 4)).toEqual(
      new Float32Array([0.7, 0.8, 0.9, 1, 0.1, 0.2, 0.3, 1]),
    );
    expect(Array.from(gather(sizes, idx, 1))).toEqual([7, 9]);
  });

  it("labels are honest for both modes", () => {
    expect(lodLabel("sample", 490_489, 4_904_886)).toBe(
      "rendering ~490,489 of 4,904,886 — zoom for detail",
    );
    expect(lodLabel("region", 12_345, 4_904_886)).toBe("full detail — 12,345 events in view");
  });
});
