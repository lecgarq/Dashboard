import { describe, it, expect } from "vitest";

import {
  buildClusterIdsFromNodes,
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
