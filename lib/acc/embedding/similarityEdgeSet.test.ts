import { describe, expect, it } from "vitest";
import { dedupeAndCapEdges, type RawNodeNeighbors } from "./similarityEdgeSet";

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
