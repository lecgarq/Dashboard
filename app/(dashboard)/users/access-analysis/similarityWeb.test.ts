import { describe, expect, it } from "vitest";
import {
  mapEdgesToIndices,
  computeEdgeColors,
  resolveFocusEdges,
  solveAffine,
  project,
  quadControl,
  stepOpacity,
  strengthBand,
  linkBandStyle,
  morphOpacityTarget,
} from "./similarityWeb";

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

  it("assigns exact weak, medium, and strong boundaries with ordered styles", () => {
    expect([0, 1 / 3 - 1e-6, 1 / 3, 2 / 3 - 1e-6, 2 / 3, 1].map(strengthBand)).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(linkBandStyle(0).width).toBeLessThan(linkBandStyle(1).width);
    expect(linkBandStyle(1).width).toBeLessThan(linkBandStyle(2).width);
    expect(linkBandStyle(0).alpha).toBeLessThan(linkBandStyle(1).alpha);
    expect(linkBandStyle(1).alpha).toBeLessThan(linkBandStyle(2).alpha);
  });

  it("stronger edges get higher alpha than weaker ones of the same hue", () => {
    const web = {
      src: Int32Array.from([0, 0]),
      dst: Int32Array.from([1, 1]),
      strength: Float32Array.from([1, 0]), // strong, weak
      dropped: 0,
    };
    const { bucket, band, palette } = computeEdgeColors(web, nodeColors, "dark");
    const aStrong = palette[bucket[0] * 4 + 3];
    const aWeak = palette[bucket[1] * 4 + 3];
    expect(aStrong).toBeGreaterThan(aWeak);
    expect(Array.from(band)).toEqual([2, 0]);
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

describe("resolveFocusEdges", () => {
  it("uses all selected matches, synthesizes omitted pairs, and keeps hover fetch-free", () => {
    const web = {
      src: Int32Array.from([0, 1]),
      dst: Int32Array.from([1, 2]),
      strength: Float32Array.from([0.8, 0.6]),
      dropped: 0,
    };
    const focus = resolveFocusEdges(
      web,
      0,
      [
        { index: 1, score: 0.91 },
        { index: 3, score: 0.87 },
        { index: 3, score: 0.87 },
      ],
      1,
    );

    expect(focus.selected).toEqual([
      { src: 0, dst: 1, score: 0.91, webIndex: 0 },
      { src: 0, dst: 3, score: 0.87, webIndex: null },
    ]);
    expect(focus.hovered.map((edge) => edge.webIndex)).toEqual([0, 1]);
  });
});

describe("geometry + opacity helpers", () => {
  it("solveAffine recovers an axis-aligned scale+translate from spaceToScreen", () => {
    // pretend the camera maps screen = space*2 + [10, 20]
    const s2s = (p: [number, number]): [number, number] => [p[0] * 2 + 10, p[1] * 2 + 20];
    const aff = solveAffine(s2s);
    expect(aff.sx).toBeCloseTo(2);
    expect(aff.sy).toBeCloseTo(2);
    expect(aff.ox).toBeCloseTo(10);
    expect(aff.oy).toBeCloseTo(20);
    expect(project(aff, 5, 7)).toEqual([5 * 2 + 10, 7 * 2 + 20]);
  });

  it("quadControl bows perpendicular to the segment, consistently signed", () => {
    // A(0,0) -> B(10,0), k=0.1: midpoint (5,0), perpendicular offset = (-dy, dx)*k = (0, 1)
    expect(quadControl(0, 0, 10, 0, 0.1)).toEqual([5, 1]);
  });

  it("keeps a 25% morph floor and settles opacity over about 180ms", () => {
    expect(morphOpacityTarget(0.8, true)).toBeCloseTo(0.2);
    expect(morphOpacityTarget(0.8, false)).toBeCloseTo(0.8);
    let opacity = 0;
    for (let elapsed = 0; elapsed < 198; elapsed += 33) opacity = stepOpacity(opacity, 1, 33);
    expect(opacity).toBeGreaterThan(0.99);
    expect(stepOpacity(0.999, 1, 33)).toBe(1);
  });
});
