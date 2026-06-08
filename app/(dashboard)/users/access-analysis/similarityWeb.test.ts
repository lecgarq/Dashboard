import { describe, expect, it } from "vitest";
import { mapEdgesToIndices, computeEdgeColors } from "./similarityWeb";

const idx = new Map<string, number>([
  ["a", 0],
  ["b", 1],
  ["c", 2],
]);

describe("mapEdgesToIndices", () => {
  it("maps nodeId pairs to index pairs and drops unknown/self edges", () => {
    const web = mapEdgesToIndices(
      [
        { a: "a", b: "b", score: 0.5 },
        { a: "a", b: "ZZZ", score: 0.9 }, // unknown endpoint -> dropped
        { a: "c", b: "c", score: 0.9 }, // self -> dropped
      ],
      idx,
    );
    expect(Array.from(web.src)).toEqual([0]);
    expect(Array.from(web.dst)).toEqual([1]);
    expect(web.dropped).toBe(2);
  });

  it("min-max normalizes strength to [0,1]", () => {
    const web = mapEdgesToIndices(
      [
        { a: "a", b: "b", score: 0.2 },
        { a: "a", b: "c", score: 0.7 },
      ],
      idx,
    );
    expect(web.strength[0]).toBeCloseTo(0); // weakest -> 0
    expect(web.strength[1]).toBeCloseTo(1); // strongest -> 1
  });

  it("assigns strength 1 when all scores are equal (no divide-by-zero)", () => {
    const web = mapEdgesToIndices(
      [
        { a: "a", b: "b", score: 0.5 },
        { a: "a", b: "c", score: 0.5 },
      ],
      idx,
    );
    expect(Array.from(web.strength)).toEqual([1, 1]);
  });
});

describe("computeEdgeColors", () => {
  // 3 nodes: red, green, blue (RGBA, alpha 1)
  const nodeColors = new Float32Array([
    1, 0, 0, 1,
    0, 1, 0, 1,
    0, 0, 1, 1,
  ]);

  it("tints each edge by the average of its endpoints' node colors", () => {
    const web = {
      src: Int32Array.from([0]), // red
      dst: Int32Array.from([1]), // green
      strength: Float32Array.from([1]),
      dropped: 0,
    };
    const { bucket, palette } = computeEdgeColors(web, nodeColors, "dark");
    const b = bucket[0];
    // average of red+green = (0.5, 0.5, 0) before any per-channel quantization
    expect(palette[b * 4 + 0]).toBeGreaterThan(0.3); // has red
    expect(palette[b * 4 + 1]).toBeGreaterThan(0.3); // has green
    expect(palette[b * 4 + 2]).toBeLessThan(0.2); // ~no blue
  });

  it("stronger edges get higher alpha than weaker ones of the same hue", () => {
    const web = {
      src: Int32Array.from([0, 0]),
      dst: Int32Array.from([1, 1]),
      strength: Float32Array.from([1, 0]), // strong, weak
      dropped: 0,
    };
    const { bucket, palette } = computeEdgeColors(web, nodeColors, "dark");
    const aStrong = palette[bucket[0] * 4 + 3];
    const aWeak = palette[bucket[1] * 4 + 3];
    expect(aStrong).toBeGreaterThan(aWeak);
  });

  it("reuses one palette bucket for identical edge colors", () => {
    const web = {
      src: Int32Array.from([0, 0]),
      dst: Int32Array.from([1, 1]),
      strength: Float32Array.from([1, 1]),
      dropped: 0,
    };
    const { bucket, palette } = computeEdgeColors(web, nodeColors, "dark");
    expect(bucket[0]).toBe(bucket[1]);
    expect(palette.length).toBe(4); // exactly one bucket
  });
});
