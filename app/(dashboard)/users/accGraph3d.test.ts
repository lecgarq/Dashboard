import { describe, expect, it } from "vitest";

import {
  ACC_GRAPH_3D_POSITION_OPTIONS,
  buildPositions3d,
  computeSemanticDepth,
  get3dEdgeSampleStep,
  readGraphDisplayMode,
  selectInitialGraphBackend,
  shouldInitializeLayoutWorker,
  shouldRender3dEdges,
  type GraphDisplayMode,
  type SemanticDepthNode,
} from "./accGraph3d";

const baseNode = {
  id: "instance:alpha@example.com:project-a",
  projectId: "project-a",
  isAdmin: false,
  roles: ["Architect"],
  modules: ["docs"],
  individualAccess: false,
} satisfies SemanticDepthNode;

describe("computeSemanticDepth", () => {
  it("returns deterministic finite depth for equivalent nodes", () => {
    const first = computeSemanticDepth(baseNode);
    const second = computeSemanticDepth({ ...baseNode });

    expect(Number.isFinite(first)).toBe(true);
    expect(second).toBe(first);
  });

  it("moves semantic cohorts to different depth bands", () => {
    const adminDepth = computeSemanticDepth({ ...baseNode, isAdmin: true });
    const memberDepth = computeSemanticDepth({ ...baseNode, isAdmin: false });
    const otherProjectDepth = computeSemanticDepth({ ...baseNode, projectId: "project-b" });

    expect(adminDepth).not.toBe(memberDepth);
    expect(otherProjectDepth).not.toBe(memberDepth);
  });
});

describe("3D edge rendering policy", () => {
  it("hides edges while camera or layout interaction is active", () => {
    expect(shouldRender3dEdges({ linkCount: 100, isCameraMoving: false, isInteracting: false })).toBe(true);
    expect(shouldRender3dEdges({ linkCount: 100, isCameraMoving: true, isInteracting: false })).toBe(false);
    expect(shouldRender3dEdges({ linkCount: 100, isCameraMoving: false, isInteracting: true })).toBe(false);
    expect(shouldRender3dEdges({ linkCount: 0, isCameraMoving: false, isInteracting: false })).toBe(false);
  });

  it("caps dense edge sets with deterministic sampling", () => {
    expect(get3dEdgeSampleStep(100, 9000)).toBe(1);
    expect(get3dEdgeSampleStep(18000, 9000)).toBe(2);
    expect(get3dEdgeSampleStep(61000, 9000)).toBe(7);
  });
});

describe("buildPositions3d", () => {
  it("preserves x/y ordering while adding finite semantic z", () => {
    const positions2d = new Float32Array([0.1, 0.2, 0.8, 0.7]);
    const nodes: SemanticDepthNode[] = [
      baseNode,
      { ...baseNode, id: "instance:beta@example.com:project-b", projectId: "project-b" },
    ];

    const positions3d = buildPositions3d(nodes, positions2d);

    expect(positions3d[0]).toBeCloseTo(-0.4, 5);
    expect(positions3d[1]).toBeCloseTo(-0.3, 5);
    expect(positions3d[3]).toBeCloseTo(0.3, 5);
    expect(positions3d[4]).toBeCloseTo(0.2, 5);
    expect(Number.isFinite(positions3d[2])).toBe(true);
    expect(Number.isFinite(positions3d[5])).toBe(true);
    expect(positions3d[2]).not.toBe(positions3d[5]);
  });

  it("uses bounded orbit depth so semantic layers read as 3D without dominating x/y layout", () => {
    expect(ACC_GRAPH_3D_POSITION_OPTIONS.xyScale).toBeGreaterThan(ACC_GRAPH_3D_POSITION_OPTIONS.zScale * 3);

    const positions2d = new Float32Array([0, 0, 1, 1]);
    const positions3d = buildPositions3d(
      [
        { ...baseNode, id: "a", projectId: "project-a", isAdmin: true },
        { ...baseNode, id: "b", projectId: "project-b", isAdmin: false },
      ],
      positions2d,
      ACC_GRAPH_3D_POSITION_OPTIONS,
    );

    const xySpan = Math.hypot(positions3d[3] - positions3d[0], positions3d[4] - positions3d[1]);
    const zSpan = Math.abs(positions3d[5] - positions3d[2]);

    expect(zSpan).toBeLessThan(xySpan * 0.45);
  });

  it("returns a correctly sized empty buffer when positions are missing", () => {
    const positions3d = buildPositions3d([baseNode], new Float32Array([]));

    expect(positions3d).toHaveLength(3);
    expect(Array.from(positions3d)).toEqual([0, 0, expect.any(Number)]);
  });
});

describe("graph display mode selection", () => {
  it("defaults to 2D cosmos when WebGL2 is available", () => {
    expect(selectInitialGraphBackend(null, true)).toBe("cosmos");
  });

  it("honors saved 3D mode only when WebGL2 is available", () => {
    expect(selectInitialGraphBackend("3d", true)).toBe("three3d");
    expect(selectInitialGraphBackend("3d", false)).toBe("canvas2d");
  });

  it("reads only known display modes from storage", () => {
    const getItem = (key: string) => (key === "acc-graph-display-mode" ? "3d" : null);

    expect(readGraphDisplayMode(getItem)).toBe<GraphDisplayMode>("3d");
    expect(readGraphDisplayMode(() => "bogus")).toBeNull();
  });

  it("initializes the layout worker for 3D orbit when graph data is already loaded", () => {
    expect(shouldInitializeLayoutWorker("three3d", 10)).toBe(true);
    expect(shouldInitializeLayoutWorker("canvas2d", 10)).toBe(true);
    expect(shouldInitializeLayoutWorker("cosmos", 10)).toBe(false);
    expect(shouldInitializeLayoutWorker("three3d", 0)).toBe(false);
  });
});
