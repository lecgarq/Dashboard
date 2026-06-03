// gpuLayout2D.test.ts
import { describe, it, expect } from "vitest";
import { computeAnchors } from "./gpuLayout2D";
import { mapForceConfig } from "./gpuLayout2D";
import { clusterStrengthFromWeights, identityClusters } from "./gpuLayout2D";
import { computeClusterAnchors, mapClusterForceConfig } from "./gpuLayout2D";
import { clusterCountOf, mapDominantForceConfig } from "./gpuLayout2D";

// Two dims whose single-dim targets sit on orthogonal axes (matches mathLayer:
// target[dim] already encodes R*u_d*f_d, so blending = weighted average).
const targets = {
  d1: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
  d2: { x: new Float32Array([0, 0]), y: new Float32Array([100, 100]), z: new Float32Array([0, 0]) },
};
const dimWeights = { d1: new Float32Array([1, 1]), d2: new Float32Array([1, 1]) };

describe("computeAnchors", () => {
  it("returns an n*2 buffer of zeros when all sliders are zero (origin collapse)", () => {
    const a = computeAnchors({ d1: 0, d2: 0 }, targets, dimWeights, 2);
    expect(a).toBeInstanceOf(Float32Array);
    expect(a.length).toBe(4);
    expect(Array.from(a)).toEqual([0, 0, 0, 0]);
  });

  it("places anchors at the d1 target when only d1 is active", () => {
    const a = computeAnchors({ d1: 1, d2: 0 }, targets, dimWeights, 2);
    // node 0 → (100, 0); node 1 → (100, 0)
    expect(a[0]).toBeCloseTo(100, 5);
    expect(a[1]).toBeCloseTo(0, 5);
    expect(a[2]).toBeCloseTo(100, 5);
    expect(a[3]).toBeCloseTo(0, 5);
  });

  it("blends targets proportionally (equal sliders → midpoint)", () => {
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, dimWeights, 2);
    expect(a[0]).toBeCloseTo(50, 5);
    expect(a[1]).toBeCloseTo(50, 5);
  });

  it("gates a node to the origin when its dimWeight is zero on every active dim", () => {
    const zeroW = { d1: new Float32Array([0, 1]), d2: new Float32Array([0, 1]) };
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, zeroW, 2);
    // node 0 has zero weight everywhere → stays at origin
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(0);
    // node 1 blends normally
    expect(a[2]).toBeCloseTo(50, 5);
    expect(a[3]).toBeCloseTo(50, 5);
  });

  it("throws on a node-count mismatch (dev guard)", () => {
    expect(() => computeAnchors({ d1: 1 }, targets, dimWeights, 3)).toThrow();
  });

  it("throws when a target y array is shorter than nodeCount", () => {
    const badYTargets = {
      d1: { x: new Float32Array([100, 100, 100]), y: new Float32Array([0, 0]) },
    };
    expect(() =>
      computeAnchors({ d1: 1 }, badYTargets, { d1: new Float32Array([1, 1, 1]) }, 3),
    ).toThrow(/y/);
  });
});

describe("mapForceConfig", () => {
  it("returns all five cosmos simulation coefficients", () => {
    const c = mapForceConfig({ d1: 0.5 });
    expect(c).toHaveProperty("simulationRepulsion");
    expect(c).toHaveProperty("simulationCluster");
    expect(c).toHaveProperty("simulationGravity");
    expect(c).toHaveProperty("simulationDecay");
    expect(c).toHaveProperty("simulationFriction");
  });

  it("increases repulsion and cluster pull as the max slider rises", () => {
    const off = mapForceConfig({ d1: 0, d2: 0 });
    const on = mapForceConfig({ d1: 1, d2: 0 });
    expect(on.simulationRepulsion).toBeGreaterThan(off.simulationRepulsion);
    expect(on.simulationCluster).toBeGreaterThan(off.simulationCluster);
  });

  it("uses max() across sliders (a single engaged slider drives intensity)", () => {
    const a = mapForceConfig({ d1: 1, d2: 0 });
    const b = mapForceConfig({ d1: 1, d2: 1 });
    expect(a.simulationRepulsion).toBeCloseTo(b.simulationRepulsion, 5);
  });

  it("contributes zero cluster pull when all sliders are zero", () => {
    expect(mapForceConfig({ d1: 0 }).simulationCluster).toBe(0);
  });
});

describe("clusterStrengthFromWeights", () => {
  it("returns per-node strength in [0,1], one entry per node", () => {
    const w = { d1: new Float32Array([1, 0.5, 0]) };
    const s = clusterStrengthFromWeights(w, { d1: 1 }, 3);
    expect(s).toBeInstanceOf(Float32Array);
    expect(s.length).toBe(3);
    expect(s[0]).toBeCloseTo(1, 5);
    expect(s[1]).toBeCloseTo(0.5, 5);
    expect(s[2]).toBe(0); // availability-gated → no pull
  });
  it("yields zero strength for every node when no slider is active", () => {
    const w = { d1: new Float32Array([1, 1, 1]) };
    const s = clusterStrengthFromWeights(w, { d1: 0 }, 3);
    expect(Array.from(s)).toEqual([0, 0, 0]);
  });

  it("clamps strength to 1 when a dimWeight entry exceeds 1", () => {
    const w = { d1: new Float32Array([1.5, 0.5, 0]) };
    const s = clusterStrengthFromWeights(w, { d1: 1 }, 3);
    expect(s[0]).toBe(1); // clamped from 1.5
    expect(s[1]).toBeCloseTo(0.5, 5);
    expect(s[2]).toBe(0);
  });
});

describe("identityClusters", () => {
  it("assigns each node to its own cluster index", () => {
    expect(identityClusters(3)).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// computeClusterAnchors
// ---------------------------------------------------------------------------

describe("computeClusterAnchors", () => {
  // Two dims sitting on orthogonal axes, same as computeAnchors fixture above.
  // Cluster 0: nodes 0,1 (both at d1 target = (100,0) with d1-only sliders)
  // Cluster 1: nodes 2,3 (both at d2 target = (0,100))
  const targetsC = {
    d1: { x: new Float32Array([100, 100, 0, 0]), y: new Float32Array([0, 0, 0, 0]) },
    d2: { x: new Float32Array([0, 0, 0, 0]),   y: new Float32Array([0, 0, 100, 100]) },
  };
  const weightsC = {
    d1: new Float32Array([1, 1, 0, 0]),
    d2: new Float32Array([0, 0, 1, 1]),
  };

  it("returns Float32Array of length clusterCount*2", () => {
    const clusterIds = new Int32Array([0, 0, 1, 1]);
    const out = computeClusterAnchors({ d1: 1, d2: 1 }, targetsC, weightsC, clusterIds, 2, 4);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(4);
  });

  it("cluster 0 anchor = mean of its member node anchors (d1-only nodes → (100,0))", () => {
    const clusterIds = new Int32Array([0, 0, 1, 1]);
    const out = computeClusterAnchors({ d1: 1, d2: 0 }, targetsC, weightsC, clusterIds, 2, 4);
    // Nodes 0,1 have d1 weight=1, d2 weight=0 → each anchor = (100, 0); cluster 0 mean = (100, 0)
    expect(out[0]).toBeCloseTo(100, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it("cluster 1 anchor = mean of its member node anchors (d2-only nodes → (0,100))", () => {
    const clusterIds = new Int32Array([0, 0, 1, 1]);
    const out = computeClusterAnchors({ d1: 0, d2: 1 }, targetsC, weightsC, clusterIds, 2, 4);
    // Nodes 2,3 have d2 weight=1, d1 weight=0 → each anchor = (0, 100); cluster 1 mean = (0, 100)
    expect(out[2]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(100, 5);
  });

  it("empty cluster stays at origin (0, 0)", () => {
    // 3 clusters but only cluster 0 has members (nodes 0 and 1)
    const clusterIds = new Int32Array([0, 0, 0, 0]);
    const out = computeClusterAnchors({ d1: 1, d2: 0 }, targetsC, weightsC, clusterIds, 3, 4);
    // cluster 1 and 2 have no members → origin
    expect(out[2]).toBe(0); // cluster 1 x
    expect(out[3]).toBe(0); // cluster 1 y
    expect(out[4]).toBe(0); // cluster 2 x
    expect(out[5]).toBe(0); // cluster 2 y
  });

  it("negative cluster ids are skipped (unclustered nodes don't pollute any cluster)", () => {
    // Node 0 in cluster 0, node 1 is unclustered (-1)
    const clusterIds = new Int32Array([0, -1, 0, -1]);
    const out = computeClusterAnchors({ d1: 1, d2: 0 }, targetsC, weightsC, clusterIds, 1, 4);
    // Only nodes 0,2 are in cluster 0; node 1,3 are skipped
    // Node 0: d1-weight=1 → anchor=(100,0); Node 2: d1-weight=0 → anchor=(0,0)
    // mean cluster 0 = (50, 0)
    expect(out[0]).toBeCloseTo(50, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it("out-of-range cluster ids (>= clusterCount) are skipped", () => {
    // Node 2 has cluster id 99 which is >= clusterCount=2 → skip
    const clusterIds = new Int32Array([0, 0, 99, 1]);
    const out = computeClusterAnchors({ d1: 1, d2: 1 }, targetsC, weightsC, clusterIds, 2, 4);
    // Cluster 0: nodes 0,1 → d1-anchor; Cluster 1: node 3 only (node 2 skipped)
    expect(out.length).toBe(4);
    // Node 99 index out of range — just verify no throw and cluster 1 only has node 3
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[2])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapClusterForceConfig
// ---------------------------------------------------------------------------

describe("mapClusterForceConfig", () => {
  it("returns all five cosmos simulation coefficients", () => {
    const c = mapClusterForceConfig();
    expect(c).toHaveProperty("simulationRepulsion");
    expect(c).toHaveProperty("simulationCluster");
    expect(c).toHaveProperty("simulationGravity");
    expect(c).toHaveProperty("simulationDecay");
    expect(c).toHaveProperty("simulationFriction");
  });

  it("simulationCluster is greater than the zero-slider mapForceConfig value (cluster pull is active)", () => {
    const clusterConfig = mapClusterForceConfig();
    const zeroSliderConfig = mapForceConfig({}); // max=0 → simulationCluster = lerp(0,0.4,0) = 0
    expect(clusterConfig.simulationCluster).toBeGreaterThan(zeroSliderConfig.simulationCluster);
  });

  it("simulationCluster value is 0.5 (strong pull for discrete clumps)", () => {
    expect(mapClusterForceConfig().simulationCluster).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Dominant-attribute clustering (the "with-labels" blob layout)
// ---------------------------------------------------------------------------

describe("clusterCountOf", () => {
  it("returns max id + 1", () => {
    expect(clusterCountOf(new Int32Array([0, 1, 0, 2]))).toBe(3);
  });
  it("returns 0 for an empty array", () => {
    expect(clusterCountOf(new Int32Array([]))).toBe(0);
  });
});

describe("mapDominantForceConfig", () => {
  it("returns all five cosmos simulation coefficients", () => {
    const c = mapDominantForceConfig(0.5);
    expect(c).toHaveProperty("simulationRepulsion");
    expect(c).toHaveProperty("simulationCluster");
    expect(c).toHaveProperty("simulationGravity");
    expect(c).toHaveProperty("simulationDecay");
    expect(c).toHaveProperty("simulationFriction");
  });

  it("cluster pull is 0 at slider 0 (scatter) and rises toward 100", () => {
    expect(mapDominantForceConfig(0).simulationCluster).toBe(0);
    expect(mapDominantForceConfig(1).simulationCluster).toBeGreaterThan(
      mapDominantForceConfig(0.5).simulationCluster,
    );
    expect(mapDominantForceConfig(0.5).simulationCluster).toBeGreaterThan(0);
  });

  it("keeps repulsion constant so blobs stay separated and legible (not a spread ramp)", () => {
    expect(mapDominantForceConfig(0).simulationRepulsion).toBe(
      mapDominantForceConfig(1).simulationRepulsion,
    );
  });

  it("clamps out-of-range slider values", () => {
    expect(mapDominantForceConfig(5).simulationCluster).toBe(
      mapDominantForceConfig(1).simulationCluster,
    );
    expect(mapDominantForceConfig(-1).simulationCluster).toBe(0);
  });
});
