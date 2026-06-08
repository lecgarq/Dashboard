/**
 * similarityEdgeSet.ts — pure dedup + sort + top-N cap for the similarity web.
 *
 * Turns the per-node stored neighbor lists (AccInstanceEmbedding.neighbors) into a
 * single undirected edge set, sorted strongest-first and capped, so the wire payload
 * stays small (~18k edges instead of ~80-90k). No DB / tRPC / React imports.
 */

export interface RawNeighbor {
  nodeId: string;
  score: number;
}
export interface RawNodeNeighbors {
  nodeId: string;
  neighbors: RawNeighbor[];
}
export interface SimEdgeIds {
  a: string;
  b: string;
  score: number;
}
export interface CappedEdgeSet {
  edges: SimEdgeIds[];
  /** Count of unique undirected edges BEFORE the limit cap. */
  total: number;
  /** True when total > limit and `edges` was trimmed to the strongest ones. */
  capped: boolean;
}

const SEP = "\0"; // NUL — never appears in a nodeId

export function dedupeAndCapEdges(
  nodes: readonly RawNodeNeighbors[],
  limit: number,
): CappedEdgeSet {
  const best = new Map<string, number>(); // "lo<SEP>hi" -> max score
  for (const node of nodes) {
    const a = node.nodeId;
    for (const nb of node.neighbors ?? []) {
      const b = nb.nodeId;
      if (!b || b === a) continue;
      const key = a < b ? a + SEP + b : b + SEP + a;
      const prev = best.get(key);
      if (prev === undefined || nb.score > prev) best.set(key, nb.score);
    }
  }

  const all: SimEdgeIds[] = [];
  for (const [key, score] of best) {
    const i = key.indexOf(SEP);
    all.push({ a: key.slice(0, i), b: key.slice(i + 1), score });
  }
  all.sort((x, y) => y.score - x.score);

  const total = all.length;
  const safeLimit = Math.max(0, limit);
  const edges = total > safeLimit ? all.slice(0, safeLimit) : all;
  return { edges, total, capped: total > edges.length };
}
