import { describe, expect, it } from "vitest";
import { indicesForMonth, sampleFullIndices } from "./activityTime";

describe("activityTime", () => {
  const months = Uint16Array.from([0, 2, 1, 2, 0, 2, 1]);

  it("selects one exact month in stable full-index order", () => {
    expect(Array.from(indicesForMonth(months, 0))).toEqual([0, 4]);
    expect(Array.from(indicesForMonth(months, 1))).toEqual([2, 6]);
    expect(Array.from(indicesForMonth(months, 2))).toEqual([1, 3, 5]);
    expect(indicesForMonth(months, 9)).toHaveLength(0);
  });

  it("uniformly caps an active full-index set without inventing indices", () => {
    const active = Uint32Array.from([1, 3, 5, 7, 9, 11, 13]);
    expect(sampleFullIndices(active, 3)).toEqual(Uint32Array.from([1, 7, 13]));
    expect(sampleFullIndices(active, 20)).toBe(active);
    expect(sampleFullIndices(new Uint32Array(0), 3)).toHaveLength(0);
  });
});
