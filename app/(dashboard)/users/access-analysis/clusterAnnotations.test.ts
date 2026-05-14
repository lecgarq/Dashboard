import { describe, expect, it } from "vitest";
import { computeCentroidsFromMemory } from "./clusterAnnotations";

describe("computeCentroidsFromMemory", () => {
  it("groups (node_id, cluster) by cluster and averages x/y", () => {
    const result = computeCentroidsFromMemory([
      { node_id: "a", cluster: "P1", label: "ProjA", x: 0, y: 0 },
      { node_id: "b", cluster: "P1", label: "ProjA", x: 10, y: 20 },
      { node_id: "c", cluster: "P2", label: "ProjB", x: 100, y: 100 },
    ]);
    expect(result).toEqual([
      { cluster: "P1", label: "ProjA", cx: 5, cy: 10, count: 2 },
      { cluster: "P2", label: "ProjB", cx: 100, cy: 100, count: 1 },
    ]);
  });

  it("filters singletons when minMembers > 1", () => {
    const result = computeCentroidsFromMemory(
      [
        { node_id: "a", cluster: "P1", label: "ProjA", x: 0, y: 0 },
        { node_id: "b", cluster: "P2", label: "ProjB", x: 5, y: 5 },
        { node_id: "c", cluster: "P1", label: "ProjA", x: 10, y: 10 },
      ],
      3,
    );
    expect(result).toEqual([]);
  });
});
