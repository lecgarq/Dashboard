import { describe, expect, it } from "vitest";
import {
  dedupeAndCapEdges,
  dedupeAndSelectClusterAware,
  type RawNodeNeighbors,
} from "./similarityEdgeSet";

const makeNode = (id: string, nbrs: Array<[string, number]>): RawNodeNeighbors => ({
  nodeId: id,
  neighbors: nbrs.map(([nodeId, score]) => ({ nodeId, score })),
});

describe("dedupeAndCapEdges", () => {
  it("dedupes reciprocal pairs into one undirected edge with a<b and the max score", () => {
    const { edges, total, capped } = dedupeAndCapEdges(
      [makeNode("b", [["a", 0.4]]), makeNode("a", [["b", 0.9]])],
      100,
    );
    expect(total).toBe(1);
    expect(capped).toBe(false);
    expect(edges).toEqual([{ a: "a", b: "b", score: 0.9 }]);
  });

  it("drops self-edges and empty/missing neighbor ids", () => {
    const { edges } = dedupeAndCapEdges(
      [makeNode("a", [["a", 1], ["", 1]]), { nodeId: "x", neighbors: [] }],
      100,
    );
    expect(edges).toEqual([]);
  });

  it("keeps the strongest `limit` edges and reports capping", () => {
    const input: RawNodeNeighbors[] = [
      makeNode("a", [["b", 0.1], ["c", 0.9], ["d", 0.5]]),
    ];
    const { edges, total, capped } = dedupeAndCapEdges(input, 2);
    expect(total).toBe(3);
    expect(capped).toBe(true);
    expect(edges.map((e) => e.b)).toEqual(["c", "d"]); // sorted by score desc, top 2
  });

  it("returns the full set uncapped when limit exceeds total", () => {
    const { edges, total, capped } = dedupeAndCapEdges(
      [makeNode("a", [["b", 0.5], ["c", 0.5]])],
      100,
    );
    expect(total).toBe(2);
    expect(capped).toBe(false);
    expect(edges.length).toBe(2);
  });

  it("never slices with a negative arg when limit is non-positive", () => {
    const { edges, total, capped } = dedupeAndCapEdges(
      [makeNode("a", [["b", 0.5], ["c", 0.9]])],
      -1,
    );
    expect(edges).toEqual([]); // not slice(0,-1) which would drop only the last
    expect(total).toBe(2);
    expect(capped).toBe(true);
  });
});

describe("dedupeAndSelectClusterAware", () => {
  it("keeps cross-cluster bridges even when intra-cluster twins fill the limit", () => {
    // 5 intra-cluster score-1.0 twin edges (all cluster 0) + 1 low-score bridge a<->z (0<->1).
    const nodes: RawNodeNeighbors[] = [
      makeNode("a", [["b", 1], ["c", 1]]),
      makeNode("b", [["c", 1], ["d", 1]]),
      makeNode("c", [["d", 1]]),
      makeNode("z", [["a", 0.5]]), // bridge: z(cluster 1) <-> a(cluster 0)
    ];
    const clusterById = new Map<string, number | null>([
      ["a", 0], ["b", 0], ["c", 0], ["d", 0], ["z", 1],
    ]);
    // A plain top-3-by-score cap would pick 3 of the score-1.0 intra twins and DROP the bridge.
    const { edges } = dedupeAndSelectClusterAware(nodes, clusterById, 3, 0.4);
    const hasBridge = edges.some(
      (e) => (e.a === "a" && e.b === "z") || (e.a === "z" && e.b === "a"),
    );
    expect(hasBridge).toBe(true);
    expect(edges.length).toBe(3);
  });

  it("falls back to a plain strongest-first cap when nothing crosses clusters", () => {
    const nodes: RawNodeNeighbors[] = [makeNode("a", [["b", 0.9], ["c", 0.8]])];
    const clusterById = new Map<string, number | null>([["a", 0], ["b", 0], ["c", 0]]);
    const { edges, total, capped } = dedupeAndSelectClusterAware(nodes, clusterById, 1, 0.4);
    expect(total).toBe(2);
    expect(capped).toBe(true);
    expect(edges.length).toBe(1);
    expect(edges[0].score).toBe(0.9); // strongest intra kept
  });

  it("treats a null/unknown cluster as intra (not a guaranteed bridge)", () => {
    const nodes: RawNodeNeighbors[] = [makeNode("a", [["b", 0.7]])];
    const clusterById = new Map<string, number | null>([["a", 0], ["b", null]]);
    const { edges } = dedupeAndSelectClusterAware(nodes, clusterById, 10, 0.4);
    expect(edges.length).toBe(1); // still kept (as intra), just not reserved as a bridge
  });
});
