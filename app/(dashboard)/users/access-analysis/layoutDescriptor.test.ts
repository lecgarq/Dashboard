import { describe, it, expect } from "vitest";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildGridStructure } from "./gridLayout";
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";
import { descriptorTarget, descriptorNodeCount, easeMorph, type LayoutDescriptor } from "./layoutDescriptor";

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

  it("blob morphs loose→packed progressively by slider value (lerp, z=0)", () => {
    const features = Array.from({ length: 4 }, (_, i) => feat("A", i % 2 ? "X" : "Y"));
    const clustering = buildDominantClusters(features, dim("role", (f) => f.role));
    const footprints = layoutClusterFootprintsOrganic(clustering.counts);
    const n = features.length;
    // Known endpoints: loose spreads the nodes wide (stride-2); packed gathers them to origin.
    const loose = new Float32Array([100, 0, 0, 100, -100, 0, 0, -100]);
    const packed = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const desc: LayoutDescriptor = { kind: "blob", dimId: "role", clustering, footprints, loose, packed };
    expect(descriptorNodeCount(desc)).toBe(n);

    const at = (v: number): Float32Array => {
      const o = new Float32Array(n * 3);
      descriptorTarget(desc, { role: v }, o);
      return o;
    };
    const spread = (b: Float32Array): number => {
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(b[i * 3], b[i * 3 + 1]));
      return r;
    };

    // s=0 → exactly the loose positions (stride-2 → stride-3, z=0).
    const loose3 = new Float32Array([100, 0, 0, 0, 100, 0, -100, 0, 0, 0, -100, 0]);
    expect(Array.from(at(0))).toEqual(Array.from(loose3));
    // s=1 → exactly the packed positions (origin), z stays 0.
    const tight = at(100);
    for (let i = 0; i < n; i++) {
      expect(tight[i * 3]).toBeCloseTo(0);
      expect(tight[i * 3 + 1]).toBeCloseTo(0);
      expect(tight[i * 3 + 2]).toBe(0);
    }
    // value 50 → eased progress easeMorph(0.5); node = loose + (packed-loose)*progress.
    // packed = origin, so node = loose*(1-progress). Expressed via easeMorph so this
    // survives curve tuning (EASE_EXP).
    const f = easeMorph(0.5);
    const mid = at(50);
    for (let i = 0; i < n; i++) {
      expect(mid[i * 3]).toBeCloseTo(loose[i * 2] * (1 - f));
      expect(mid[i * 3 + 1]).toBeCloseTo(loose[i * 2 + 1] * (1 - f));
    }
    // Progressive: spread shrinks monotonically as the slider rises (no 0→1 jump).
    expect(spread(at(0))).toBeGreaterThan(spread(at(50)));
    expect(spread(at(50))).toBeGreaterThan(spread(at(100)));
  });

  it("easeMorph is a smoothstep curve with exact endpoints", () => {
    expect(easeMorph(0)).toBe(0);
    expect(easeMorph(1)).toBe(1);
    // Smoothstep: symmetric at midpoint (ease-in-out).
    expect(easeMorph(0.5)).toBeCloseTo(0.5, 6);
    // Monotonic non-decreasing.
    expect(easeMorph(0.25)).toBeLessThan(easeMorph(0.75));
    // Clamped outside [0,1].
    expect(easeMorph(-1)).toBe(0);
    expect(easeMorph(2)).toBe(1);
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

function blobFixture(): Extract<LayoutDescriptor, { kind: "blob" }> {
  return {
    kind: "blob",
    dimId: "user",
    clustering: { ids: new Int32Array([0, 0]), labels: ["Ann"], counts: [2] },
    footprints: { cx: new Float32Array([0]), cy: new Float32Array([0]), r: new Float32Array([10]) },
    loose: new Float32Array([-5, 0, 5, 0]), // stride-2, 2 nodes — the s=0 end
    packed: new Float32Array([-1, 0, 1, 0]), // stride-2, 2 nodes — the s=1 end
  };
}

describe("descriptorTarget (blob morphs loose → packed)", () => {
  it("sits at the LOOSE positions at slider 0", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 0 }, out);
    expect([out[0], out[1], out[2]]).toEqual([-5, 0, 0]);
    expect([out[3], out[4], out[5]]).toEqual([5, 0, 0]);
  });
  it("sits at the PACKED positions at slider 100", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 100 }, out);
    expect([out[0], out[1], out[2]]).toEqual([-1, 0, 0]);
    expect([out[3], out[4], out[5]]).toEqual([1, 0, 0]);
  });
  it("interpolates between loose and packed (z stays flat)", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 50 }, out); // smoothstep(0.5)=0.5
    expect(out[0]).toBeCloseTo(-3, 6); // -5 + (-1 - -5)*0.5
    expect(out[2]).toBe(0);
  });
});

describe("easeMorph (progressive curve)", () => {
  it("pins the endpoints exactly", () => {
    expect(easeMorph(0)).toBe(0);
    expect(easeMorph(1)).toBe(1);
  });
  it("is symmetric at the midpoint", () => {
    expect(easeMorph(0.5)).toBeCloseTo(0.5, 6);
  });
  it("is monotonically increasing", () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const v = easeMorph(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("has a GENTLE start — no 0→1 jump (rules out the old ease-out)", () => {
    expect(easeMorph(0.1)).toBeLessThan(0.1);
  });
  it("clamps out-of-range input", () => {
    expect(easeMorph(-1)).toBe(0);
    expect(easeMorph(2)).toBe(1);
  });
});
