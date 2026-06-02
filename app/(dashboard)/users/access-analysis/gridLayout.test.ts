import { describe, it, expect } from "vitest";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildGridStructure } from "./gridLayout";

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
