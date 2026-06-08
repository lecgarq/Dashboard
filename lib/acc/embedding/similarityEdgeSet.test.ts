import { describe, expect, it } from "vitest";
import { dedupeAndCapEdges, type RawNodeNeighbors } from "./similarityEdgeSet";

const node = (id: string, nbrs: Array<[string, number]>): RawNodeNeighbors => ({
  nodeId: id,
  neighbors: nbrs.map(([nodeId, score]) => ({ nodeId, score })),
});

describe("dedupeAndCapEdges", () => {
  it("dedupes reciprocal pairs into one undirected edge with a<b and the max score", () => {
    const { edges, total, capped } = dedupeAndCapEdges(
      [node("b", [["a", 0.4]]), node("a", [["b", 0.9]])],
      100,
    );
    expect(total).toBe(1);
    expect(capped).toBe(false);
    expect(edges).toEqual([{ a: "a", b: "b", score: 0.9 }]);
  });

  it("drops self-edges and empty/missing neighbor ids", () => {
    const { edges } = dedupeAndCapEdges(
      [node("a", [["a", 1], ["", 1]]), { nodeId: "x", neighbors: [] }],
      100,
    );
    expect(edges).toEqual([]);
  });

  it("keeps the strongest `limit` edges and reports capping", () => {
    const input: RawNodeNeighbors[] = [
      node("a", [["b", 0.1], ["c", 0.9], ["d", 0.5]]),
    ];
    const { edges, total, capped } = dedupeAndCapEdges(input, 2);
    expect(total).toBe(3);
    expect(capped).toBe(true);
    expect(edges.map((e) => e.b)).toEqual(["c", "d"]); // sorted by score desc, top 2
  });
});
