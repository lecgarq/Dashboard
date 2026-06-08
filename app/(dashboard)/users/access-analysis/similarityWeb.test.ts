import { describe, expect, it } from "vitest";
import { mapEdgesToIndices } from "./similarityWeb";

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
