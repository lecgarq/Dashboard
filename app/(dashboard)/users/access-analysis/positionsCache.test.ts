import { describe, expect, it } from "vitest";
import { hashNodeSet, packPositions, unpackPositions } from "./positionsCache";

describe("hashNodeSet", () => {
  it("is order-independent", () => {
    expect(hashNodeSet(["a", "b", "c"])).toEqual(hashNodeSet(["c", "a", "b"]));
  });
  it("differs when the set differs by one element", () => {
    expect(hashNodeSet(["a", "b", "c"])).not.toEqual(hashNodeSet(["a", "b", "d"]));
  });
  it("is stable across calls (deterministic)", () => {
    const h1 = hashNodeSet(["foo", "bar"]);
    const h2 = hashNodeSet(["foo", "bar"]);
    expect(h1).toBe(h2);
  });
});

describe("packPositions / unpackPositions", () => {
  it("round-trips a Float32Array of (x, y) pairs", () => {
    const ids = ["a", "b", "c"];
    const xy = new Float32Array([1, 2, 3, 4, 5, 6]);
    const rows = packPositions(ids, xy);
    expect(rows).toEqual([
      { node_id: "a", x: 1, y: 2 },
      { node_id: "b", x: 3, y: 4 },
      { node_id: "c", x: 5, y: 6 },
    ]);

    const back = unpackPositions(rows, ids);
    expect(back).not.toBeNull();
    expect(Array.from(back!)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("handles rows in a different order than ids", () => {
    const rows = [
      { node_id: "b", x: 3, y: 4 },
      { node_id: "a", x: 1, y: 2 },
    ];
    const xy = unpackPositions(rows, ["a", "b"]);
    expect(xy).not.toBeNull();
    expect(Array.from(xy!)).toEqual([1, 2, 3, 4]);
  });

  it("returns null when a required id is missing from rows", () => {
    const rows = [{ node_id: "a", x: 1, y: 2 }];
    expect(unpackPositions(rows, ["a", "b"])).toBeNull();
  });
});
