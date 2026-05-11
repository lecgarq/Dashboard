import { describe, expect, it } from "vitest";

import {
  buildPositions3d,
  computeSemanticDepth,
  readGraphDisplayMode,
  selectInitialGraphBackend,
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
});
