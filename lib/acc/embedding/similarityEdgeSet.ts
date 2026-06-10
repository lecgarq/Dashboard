/**
 * similarityEdgeSet.ts — pure dedup + sort + top-N cap for the similarity web.
 *
 * Turns the per-node stored neighbor lists (AccInstanceEmbedding.neighbors) into a
 * single undirected edge set, sorted strongest-first and capped, so the wire payload
 * stays small (~18k edges instead of ~80-90k). No DB / tRPC / React imports.
 */

interface RawNeighbor {
  nodeId: string;
  score: number;
}
export interface RawNodeNeighbors {
  nodeId: string;
  neighbors: RawNeighbor[];
}
interface SimEdgeIds {
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

/** Dedup reciprocal neighbor pairs into undirected edges (canonical a<b, max score). */
function dedupeEdges(nodes: readonly RawNodeNeighbors[]): SimEdgeIds[] {
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
  return all;
}

const byScoreDesc = (x: SimEdgeIds, y: SimEdgeIds): number => y.score - x.score;

export function dedupeAndCapEdges(
  nodes: readonly RawNodeNeighbors[],
  limit: number,
): CappedEdgeSet {
  const all = dedupeEdges(nodes).sort(byScoreDesc);
  const total = all.length;
  const safeLimit = Math.max(0, limit);
  const edges = total > safeLimit ? all.slice(0, safeLimit) : all;
  return { edges, total, capped: total > edges.length };
}

/**
 * Cluster-aware selection. A plain top-N-by-score cap is saturated by score≈1.0
 * duplicate-profile twin edges — which are ALL intra-cluster — so the rare
 * cross-cluster "bridge" edges (correctly lower-similarity) never survive and the
 * web never visibly connects different clusters. This reserves up to
 * `interReserveFrac` of the budget for cross-cluster edges first, then fills with
 * the strongest intra-cluster edges (the within-cluster texture).
 *
 * An edge is "inter" only when BOTH endpoints have a known cluster and they differ;
 * a missing/null cluster is treated as intra (we can't assert it's a bridge).
 */
export function dedupeAndSelectClusterAware(
  nodes: readonly RawNodeNeighbors[],
  clusterById: ReadonlyMap<string, number | null>,
  limit: number,
  interReserveFrac = 0.4,
): CappedEdgeSet {
  const all = dedupeEdges(nodes);
  const total = all.length;
  const safeLimit = Math.max(0, limit);

  const isInter = (e: SimEdgeIds): boolean => {
    const ca = clusterById.get(e.a);
    const cb = clusterById.get(e.b);
    return ca != null && cb != null && ca !== cb;
  };

  const inter = all.filter(isInter).sort(byScoreDesc);
  const intra = all.filter((e) => !isInter(e)).sort(byScoreDesc);

  const interTake = Math.min(inter.length, Math.floor(safeLimit * interReserveFrac));
  let edges = inter.slice(0, interTake);
  edges = edges.concat(intra.slice(0, safeLimit - edges.length));
  // If intra ran short, top up from any remaining inter edges.
  if (edges.length < safeLimit && inter.length > interTake) {
    edges = edges.concat(inter.slice(interTake, interTake + (safeLimit - edges.length)));
  }
  edges.sort(byScoreDesc);
  return { edges, total, capped: total > edges.length };
}
