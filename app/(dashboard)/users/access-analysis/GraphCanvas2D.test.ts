import { describe, expect, it } from "vitest";
import { indexLinksByPoint } from "./GraphCanvas2D";

describe("indexLinksByPoint", () => {
  it("indexes each link for both endpoint nodes", () => {
    const indexed = indexLinksByPoint(Float32Array.from([
      0, 2,
      2, 3,
      0, 3,
    ]));

    expect(indexed.get(0)).toEqual([0, 2]);
    expect(indexed.get(2)).toEqual([0, 1]);
    expect(indexed.get(3)).toEqual([1, 2]);
    expect(indexed.get(1)).toBeUndefined();
  });
});
