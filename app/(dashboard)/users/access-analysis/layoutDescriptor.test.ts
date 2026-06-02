import { describe, it, expect } from "vitest";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildGridStructure } from "./gridLayout";
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";
import { descriptorTarget, descriptorNodeCount, type LayoutDescriptor } from "./layoutDescriptor";

const dim = (id: string, get: (f: NodeFeatureSnapshot) => string): CatalogDimension =>
  ({
    id, label: id, family: "structure", kind: "categorical", source: "", confidence: "high",
    available: true, surfaces: ["slider"], extract: (f: NodeFeatureSnapshot) => get(f),
  } as unknown as CatalogDimension);

function feat(project: string, role: string): NodeFeatureSnapshot {
  return { nodeId: `${project}:${role}`, project, role } as unknown as NodeFeatureSnapshot;
}

describe("descriptorTarget", () => {
  it("rest returns its static buffer verbatim", () => {
    const xyz = new Float32Array([1, 2, 0, 3, 4, 0]);
    const desc: LayoutDescriptor = { kind: "rest", xyz };
    expect(descriptorNodeCount(desc)).toBe(2);
    const out = new Float32Array(6);
    expect(descriptorTarget(desc, {}, out)).toBe(xyz);
  });

  it("blob writes stride-3 into the buffer; tightness shrinks the spread", () => {
    const features = Array.from({ length: 40 }, (_, i) => feat("A", i % 2 ? "X" : "Y"));
    const clustering = buildDominantClusters(features, dim("role", (f) => f.role));
    const footprints = layoutClusterFootprintsOrganic(clustering.counts);
    const desc: LayoutDescriptor = { kind: "blob", dimId: "role", clustering, footprints };
    const n = descriptorNodeCount(desc);
    const loose = new Float32Array(n * 3);
    descriptorTarget(desc, { role: 5 }, loose);
    const tight = new Float32Array(n * 3);
    descriptorTarget(desc, { role: 100 }, tight);
    const spread = (b: Float32Array) => {
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(b[i * 3], b[i * 3 + 1]));
      return r;
    };
    expect(tight[2]).toBe(0); // z=0
    expect(spread(tight)).toBeLessThanOrEqual(spread(loose));
  });

  it("grid delegates to gridPositions (writes into buffer, z=0)", () => {
    const features = [feat("A", "X"), feat("B", "Y")];
    const structure = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
    const desc: LayoutDescriptor = { kind: "grid", xId: "project", yId: "role", structure };
    const out = new Float32Array(features.length * 3);
    const ref = descriptorTarget(desc, { project: 100, role: 100 }, out);
    expect(ref).toBe(out);
    expect(out[2]).toBe(0);
  });
});
