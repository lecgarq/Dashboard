import { describe, it, expect } from "vitest";

import {
  buildClusterIdsFromNodes,
  controlsToSimulationConfig,
  pointInPolygon,
  projectTopologyLinksToIndexPairs,
  type ClusterableNode,
} from "./cosmosUtils";

describe("buildClusterIdsFromNodes", () => {
  it("assigns the same id to nodes sharing the primary role", () => {
    const nodes: ClusterableNode[] = [
      { roles: ["Architect"] },
      { roles: ["Modeler"] },
      { roles: ["Architect"] },
      { roles: ["Modeler"] },
    ];
    const ids = buildClusterIdsFromNodes(nodes, "role");
    expect(ids[0]).toBe(ids[2]);
    expect(ids[1]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("returns undefined for nodes missing the cluster key", () => {
    const nodes: ClusterableNode[] = [
      { roles: ["Architect"] },
      { roles: [] },
      {}, // no roles field at all
      { roles: ["Architect"] },
    ];
    const ids = buildClusterIdsFromNodes(nodes, "role");
    expect(ids[1]).toBeUndefined();
    expect(ids[2]).toBeUndefined();
    expect(ids[0]).toBe(ids[3]);
  });

  it("emits a dense [0..N-1] id space (no gaps) in first-seen order", () => {
    const nodes: ClusterableNode[] = [
      { roles: ["A"] },
      { roles: ["B"] },
      { roles: ["A"] },
      { roles: ["C"] },
      { roles: ["B"] },
    ];
    const ids = buildClusterIdsFromNodes(nodes, "role");
    expect(ids[0]).toBe(0);
    expect(ids[1]).toBe(1);
    expect(ids[2]).toBe(0);
    expect(ids[3]).toBe(2);
    expect(ids[4]).toBe(1);
    const distinct = new Set(ids.filter((v): v is number => v !== undefined));
    expect(distinct).toEqual(new Set([0, 1, 2]));
  });

  it("supports the 'module' cluster key", () => {
    const nodes: ClusterableNode[] = [
      { modules: ["docs"] },
      { modules: ["cost"] },
      { modules: ["docs"] },
    ];
    const ids = buildClusterIdsFromNodes(nodes, "module");
    expect(ids[0]).toBe(0);
    expect(ids[1]).toBe(1);
    expect(ids[2]).toBe(0);
  });

  it("ignores roles when keyed on 'module' (and vice versa)", () => {
    const nodes: ClusterableNode[] = [
      { roles: ["Architect"], modules: [] },
      { roles: ["Architect"], modules: ["docs"] },
    ];
    const byModule = buildClusterIdsFromNodes(nodes, "module");
    expect(byModule[0]).toBeUndefined();
    expect(byModule[1]).toBe(0);
  });

  it("returns an empty array for empty input", () => {
    expect(buildClusterIdsFromNodes([], "role")).toEqual([]);
  });
});

describe("controlsToSimulationConfig", () => {
  it("at spacing=0, clusterStrength=0 returns minimum repulsion, max gravity, zero cluster", () => {
    const cfg = controlsToSimulationConfig({ spacing: 0, clusterStrength: 0 });
    expect(cfg.simulationRepulsion).toBeCloseTo(0.1, 5);
    expect(cfg.simulationLinkDistance).toBeCloseTo(4, 5);
    expect(cfg.simulationLinkSpring).toBeCloseTo(0.7, 5);
    expect(cfg.simulationGravity).toBeCloseTo(0.25, 5);
    expect(cfg.simulationCluster).toBe(0);
  });

  it("at spacing=100, clusterStrength=100 returns max repulsion, low gravity, full cluster pull", () => {
    const cfg = controlsToSimulationConfig({ spacing: 100, clusterStrength: 100 });
    expect(cfg.simulationRepulsion).toBeCloseTo(5.0, 5);
    expect(cfg.simulationLinkDistance).toBeCloseTo(80, 5);
    expect(cfg.simulationLinkSpring).toBeCloseTo(0.1, 5);
    expect(cfg.simulationGravity).toBeCloseTo(0.05, 5);
    expect(cfg.simulationCluster).toBe(1);
  });

  it("at spacing=50 produces midrange values (sanity check)", () => {
    const cfg = controlsToSimulationConfig({ spacing: 50, clusterStrength: 50 });
    expect(cfg.simulationRepulsion).toBeGreaterThan(0.1);
    expect(cfg.simulationRepulsion).toBeLessThan(5.0);
    expect(cfg.simulationLinkSpring).toBeGreaterThan(0.1);
    expect(cfg.simulationLinkSpring).toBeLessThan(0.7);
    expect(cfg.simulationGravity).toBeGreaterThan(0.05);
    expect(cfg.simulationGravity).toBeLessThan(0.25);
    expect(cfg.simulationCluster).toBe(0.5);
  });

  it("monotonicity across separation 0..100", () => {
    let prevRepulsion = -Infinity;
    let prevDistance = -Infinity;
    let prevSpring = Infinity;
    let prevGravity = Infinity;
    for (let s = 0; s <= 100; s += 10) {
      const cfg = controlsToSimulationConfig({ spacing: s, clusterStrength: 0 });
      expect(cfg.simulationRepulsion).toBeGreaterThanOrEqual(prevRepulsion);
      expect(cfg.simulationLinkDistance).toBeGreaterThanOrEqual(prevDistance);
      expect(cfg.simulationLinkSpring).toBeLessThanOrEqual(prevSpring);
      expect(cfg.simulationGravity).toBeLessThanOrEqual(prevGravity);
      prevRepulsion = cfg.simulationRepulsion;
      prevDistance = cfg.simulationLinkDistance;
      prevSpring = cfg.simulationLinkSpring;
      prevGravity = cfg.simulationGravity;
    }
  });

  it("clamps out-of-range slider values into [0,100]", () => {
    const low = controlsToSimulationConfig({ spacing: -50, clusterStrength: -10 });
    const high = controlsToSimulationConfig({ spacing: 200, clusterStrength: 250 });
    expect(low.simulationRepulsion).toBeCloseTo(0.1, 5);
    expect(low.simulationGravity).toBeCloseTo(0.25, 5);
    expect(low.simulationCluster).toBe(0);
    expect(high.simulationRepulsion).toBeCloseTo(5.0, 5);
    expect(high.simulationGravity).toBeCloseTo(0.05, 5);
    expect(high.simulationCluster).toBe(1);
  });
});

describe("projectTopologyLinksToIndexPairs", () => {
  it("chains visible spokes that share a hub into consecutive pairs", () => {
    // Three users (a, b, c) all linked to hub "role:owner"
    const idx = new Map([["a", 0], ["b", 1], ["c", 2]]);
    const links = [
      { source: "a", target: "role:owner" },
      { source: "b", target: "role:owner" },
      { source: "c", target: "role:owner" },
    ];
    const out = projectTopologyLinksToIndexPairs(links, idx);
    // Sorted indices [0,1,2] → pairs (0,1) and (1,2)
    expect(Array.from(out.sources)).toEqual([0, 1]);
    expect(Array.from(out.targets)).toEqual([1, 2]);
  });

  it("emits zero springs when no spokes share a hub", () => {
    const idx = new Map([["a", 0], ["b", 1]]);
    const links = [
      { source: "a", target: "role:owner" },
      { source: "b", target: "role:editor" },
    ];
    const out = projectTopologyLinksToIndexPairs(links, idx);
    expect(out.sources.length).toBe(0);
    expect(out.targets.length).toBe(0);
  });

  it("skips topology links whose source is not in the index map", () => {
    const idx = new Map([["a", 0]]);
    const links = [
      { source: "a", target: "role:owner" },
      { source: "ghost", target: "role:owner" },
    ];
    const out = projectTopologyLinksToIndexPairs(links, idx);
    // Only one mapped spoke → no chain
    expect(out.sources.length).toBe(0);
  });

  it("dedupes identical pairs across multiple hubs", () => {
    const idx = new Map([["a", 0], ["b", 1]]);
    // Both links produce the same (0,1) pair from two different hubs
    const links = [
      { source: "a", target: "hub1" },
      { source: "b", target: "hub1" },
      { source: "a", target: "hub2" },
      { source: "b", target: "hub2" },
    ];
    const out = projectTopologyLinksToIndexPairs(links, idx);
    expect(out.sources.length).toBe(1);
    expect(out.sources[0]).toBe(0);
    expect(out.targets[0]).toBe(1);
  });

  it("returns empty Int32Arrays (not undefined) for an empty input", () => {
    const out = projectTopologyLinksToIndexPairs([], new Map());
    expect(out.sources).toBeInstanceOf(Int32Array);
    expect(out.targets).toBeInstanceOf(Int32Array);
    expect(out.sources.length).toBe(0);
  });
});

describe("pointInPolygon", () => {
  // Square covering [0,0]..[10,10], counter-clockwise winding
  const squareCCW = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
  // Same square, clockwise winding
  const squareCW = new Float32Array([0, 0, 0, 10, 10, 10, 10, 0]);

  it("returns true for points inside a square (CCW winding)", () => {
    expect(pointInPolygon(5, 5, squareCCW)).toBe(true);
    expect(pointInPolygon(1, 1, squareCCW)).toBe(true);
    expect(pointInPolygon(9, 9, squareCCW)).toBe(true);
  });

  it("returns false for points outside a square", () => {
    expect(pointInPolygon(-1, 5, squareCCW)).toBe(false);
    expect(pointInPolygon(11, 5, squareCCW)).toBe(false);
    expect(pointInPolygon(5, -1, squareCCW)).toBe(false);
    expect(pointInPolygon(5, 11, squareCCW)).toBe(false);
    expect(pointInPolygon(100, 100, squareCCW)).toBe(false);
  });

  it("is winding-direction independent (CW and CCW agree on containment)", () => {
    for (const [x, y] of [
      [5, 5],
      [1, 1],
      [9, 9],
      [-1, 5],
      [11, 5],
      [5, -1],
      [5, 11],
    ]) {
      expect(pointInPolygon(x, y, squareCCW)).toBe(
        pointInPolygon(x, y, squareCW),
      );
    }
  });

  it("returns a consistent result for points on edges (deterministic, no NaN)", () => {
    // The exact edge classification is implementation-defined for ray-casting,
    // but the result must be a boolean (not NaN, not throwing).
    const onEdge = pointInPolygon(0, 5, squareCCW);
    const onVertex = pointInPolygon(0, 0, squareCCW);
    expect(typeof onEdge).toBe("boolean");
    expect(typeof onVertex).toBe("boolean");
    // Calling twice is deterministic
    expect(pointInPolygon(0, 5, squareCCW)).toBe(onEdge);
  });

  it("returns false for degenerate polygons (< 3 vertices)", () => {
    expect(pointInPolygon(0, 0, new Float32Array([]))).toBe(false);
    expect(pointInPolygon(0, 0, new Float32Array([1, 1]))).toBe(false);
    expect(pointInPolygon(0, 0, new Float32Array([1, 1, 2, 2]))).toBe(false);
  });

  it("handles a non-convex (concave) polygon — C-shape", () => {
    // C-shape opening to the right: outer rect [0,0]..[10,10] with a notch
    // cut out from [4,3]..[10,7]. Counter-clockwise outer perimeter that
    // dives into the notch.
    const cShape = new Float32Array([
      0, 0,
      10, 0,
      10, 3,
      4, 3,
      4, 7,
      10, 7,
      10, 10,
      0, 10,
    ]);
    // Inside the solid left bar
    expect(pointInPolygon(2, 5, cShape)).toBe(true);
    // Inside the notch (open to the right) — should be OUTSIDE polygon
    expect(pointInPolygon(7, 5, cShape)).toBe(false);
    // Inside the bottom arm
    expect(pointInPolygon(7, 1, cShape)).toBe(true);
    // Inside the top arm
    expect(pointInPolygon(7, 9, cShape)).toBe(true);
  });

  it("treats the polygon as closed (last vertex wraps to first)", () => {
    // Triangle — three vertices, no explicit closing vertex required
    const triangle = new Float32Array([0, 0, 10, 0, 5, 10]);
    expect(pointInPolygon(5, 1, triangle)).toBe(true);
    expect(pointInPolygon(5, 5, triangle)).toBe(true); // centroid
    expect(pointInPolygon(0, 9, triangle)).toBe(false); // outside near tip
    expect(pointInPolygon(5, 11, triangle)).toBe(false); // beyond apex
  });
});
