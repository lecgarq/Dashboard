import { describe, it, expect } from "vitest";
import { gridCells, pickDensestCell } from "../lassoProbe";

describe("gridCells", () => {
  it("produces an inclusive grid in row-major order", () => {
    const cells = gridCells(0, 0, 2, 2, 1);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells[1]).toEqual({ x: 1, y: 0 }); // x varies fastest
    expect(cells[3]).toEqual({ x: 0, y: 1 });
    expect(cells[8]).toEqual({ x: 2, y: 2 });
  });

  it("covers a realistic span at a coarse step without gaps past the end", () => {
    const cells = gridCells(28, 28, 600, 600, 90);
    // last row/col start <= 600; inclusive end means 28,118,...,568 (7 steps)
    expect(cells[0]).toEqual({ x: 28, y: 28 });
    expect(cells.every((c) => c.x <= 600 && c.y <= 600)).toBe(true);
  });

  it("guards a non-positive step", () => {
    const cells = gridCells(0, 0, 1, 1, 0);
    expect(cells.length).toBeGreaterThan(0);
  });
});

describe("pickDensestCell", () => {
  it("returns the cell with the highest count", () => {
    const cells = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 500, y: 500 },
    ];
    // Synthetic counter: density peaks at (100,100).
    const countAt = (cx: number, cy: number): number =>
      cx === 100 && cy === 100 ? 42 : cx === 0 && cy === 0 ? 5 : 1;
    const best = pickDensestCell(cells, countAt);
    expect(best).toEqual({ x: 100, y: 100, count: 42 });
  });

  it("resolves ties to the first cell in iteration order (deterministic)", () => {
    const cells = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const best = pickDensestCell(cells, () => 7);
    expect(best).toEqual({ x: 1, y: 1, count: 7 });
  });

  it("passes each cell's center to the counter", () => {
    const seen: Array<[number, number]> = [];
    pickDensestCell(
      [
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ],
      (cx, cy) => {
        seen.push([cx, cy]);
        return 0;
      },
    );
    expect(seen).toEqual([
      [3, 4],
      [5, 6],
    ]);
  });

  it("returns null for an empty cell list", () => {
    expect(pickDensestCell([], () => 1)).toBeNull();
  });
});
