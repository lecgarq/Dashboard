import { describe, it, expect } from "vitest";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildGridStructure, gridPositions, gridCellRadius } from "./gridLayout";

const dim = (id: string, get: (f: NodeFeatureSnapshot) => string): CatalogDimension =>
  ({
    id, label: id, family: "structure", kind: "categorical", source: "", confidence: "high",
    available: true, surfaces: ["slider"], extract: (f: NodeFeatureSnapshot) => get(f),
  } as unknown as CatalogDimension);

function feat(project: string, role: string): NodeFeatureSnapshot {
  return { nodeId: `${project}:${role}`, project, role } as unknown as NodeFeatureSnapshot;
}

const projectDim = dim("project", (f) => f.project);
const roleDim = dim("role", (f) => f.role);

describe("buildGridStructure", () => {
  it("assigns each node to a (col,row) cell by the two dim values", () => {
    const features = [feat("A", "X"), feat("A", "Y"), feat("B", "X")];
    const s = buildGridStructure(features, projectDim, roleDim, { maxCols: 8, maxRows: 8 });
    expect(s.cols.map((c) => c.label).sort()).toEqual(["A", "B"]);
    expect(s.rows.map((r) => r.label).sort()).toEqual(["X", "Y"]);
    // node 0 (A,X) and node 2 (B,X) share a row; node 0 and node 1 (A,*) share a column
    expect(s.rowOf[0]).toBe(s.rowOf[2]);
    expect(s.colOf[0]).toBe(s.colOf[1]);
  });

  it("folds values beyond the cap into a trailing Other band", () => {
    const features = ["A", "B", "C", "D"].flatMap((p) => [feat(p, "X"), feat(p, "X")]);
    const s = buildGridStructure(features, projectDim, roleDim, { maxCols: 2, maxRows: 8 });
    expect(s.cols.length).toBe(3); // 2 kept + Other
    expect(s.cols[s.cols.length - 1].label).toBe("Other");
    expect(s.foldedCols).toBe(2); // C, D folded
  });

  it("unit offsets are bounded within the unit disc", () => {
    const features = Array.from({ length: 50 }, () => feat("A", "X"));
    const s = buildGridStructure(features, projectDim, roleDim, { maxCols: 8, maxRows: 8 });
    for (let i = 0; i < features.length; i++) {
      expect(Math.hypot(s.ux[i], s.uy[i])).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("gridPositions", () => {
  it("centers cells on a lattice and writes into the provided buffer (no alloc)", () => {
    const features = [feat("A", "X"), feat("B", "X")];
    const s = buildGridStructure(features, projectDim, roleDim, { maxCols: 8, maxRows: 8 });
    const out = new Float32Array(features.length * 3);
    const ref = gridPositions(s, { valueX: 1, valueY: 1 }, out);
    expect(ref).toBe(out);
    // Two single-member columns, centered → x of col0 = -x of col1
    expect(out[0]).toBeCloseTo(-out[3], 5);
    expect(out[2]).toBe(0); // z=0
  });

  it("higher slider value spreads bands further apart (monotonic pitch)", () => {
    const features = [feat("A", "X"), feat("B", "X")];
    const s = buildGridStructure(features, projectDim, roleDim, { maxCols: 8, maxRows: 8 });
    const lo = new Float32Array(6);
    gridPositions(s, { valueX: 0.1, valueY: 0.1 }, lo);
    const hi = new Float32Array(6);
    gridPositions(s, { valueX: 1, valueY: 1 }, hi);
    expect(Math.abs(hi[3] - hi[0])).toBeGreaterThan(Math.abs(lo[3] - lo[0]));
  });

  it("cells never overlap: cell radius < half the min pitch", () => {
    const colPitch = 100;
    const rowPitch = 100;
    expect(gridCellRadius(colPitch, rowPitch)).toBeLessThan(Math.min(colPitch, rowPitch) / 2);
  });
});
