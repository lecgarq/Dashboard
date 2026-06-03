import { describe, expect, it } from "vitest";
import { countGroupedItems, limitGroupedItems } from "./directoryRenderWindow";

describe("directory render window helpers", () => {
  it("limits grouped members across group boundaries", () => {
    const groups: [string, number[]][] = [
      ["A", [1, 2, 3]],
      ["B", [4, 5]],
      ["C", [6]],
    ];

    expect(limitGroupedItems(groups, 4)).toEqual([
      ["A", [1, 2, 3]],
      ["B", [4]],
    ]);
  });

  it("drops empty groups created by the limit", () => {
    const groups: [string, number[]][] = [
      ["A", [1]],
      ["B", [2]],
    ];

    expect(limitGroupedItems(groups, 0)).toEqual([]);
  });

  it("counts grouped items without flattening", () => {
    expect(countGroupedItems([
      ["A", [1, 2]],
      ["B", [3]],
    ])).toBe(3);
  });
});
