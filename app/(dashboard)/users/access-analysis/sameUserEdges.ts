export interface ParsedNodeId {
  userId: string;
  projectId: string;
}

/** Split on the FIRST "::". Returns null for malformed ids (no "::", empty side). */
export function parseNodeId(nodeId: string): ParsedNodeId | null {
  const idx = nodeId.indexOf("::");
  if (idx <= 0 || idx + 2 >= nodeId.length) return null;
  return { userId: nodeId.slice(0, idx), projectId: nodeId.slice(idx + 2) };
}

export interface SameUserEdge {
  sourceIndex: number;
  targetIndex: number;
  sourceNodeId: string;
  targetNodeId: string;
  userId: string;
  edgeType: "same-user";
}

export interface DeriveResult {
  edges: SameUserEdge[];
  malformedCount: number;
  duplicateCount: number;
  distinctValidUsers: number;
  distinctUsersWithEdges: number;
}

/**
 * Same-user chain edges, derived purely from the nodeId list. Indices reference
 * positions in the SAME `nodeIds` array (= cosmos point-index space). Chain
 * topology only (no cliques, no self-edges, no duplicate edges). First occurrence
 * of a duplicate nodeId wins; later duplicates are counted and ignored.
 */
export function deriveSameUserEdges(nodeIds: readonly string[]): DeriveResult {
  const seen = new Set<string>();
  let malformedCount = 0;
  let duplicateCount = 0;
  const groups = new Map<string, Array<{ index: number; nodeId: string }>>();

  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const parsed = parseNodeId(nodeId);
    if (!parsed) {
      malformedCount++;
      continue;
    }
    if (seen.has(nodeId)) {
      duplicateCount++;
      continue;
    }
    seen.add(nodeId);
    const arr = groups.get(parsed.userId);
    if (arr) arr.push({ index: i, nodeId });
    else groups.set(parsed.userId, [{ index: i, nodeId }]);
  }

  const edges: SameUserEdge[] = [];
  let distinctUsersWithEdges = 0;
  for (const [userId, members] of groups) {
    if (members.length < 2) continue;
    members.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
    distinctUsersWithEdges++;
    for (let k = 0; k < members.length - 1; k++) {
      edges.push({
        sourceIndex: members[k].index,
        targetIndex: members[k + 1].index,
        sourceNodeId: members[k].nodeId,
        targetNodeId: members[k + 1].nodeId,
        userId,
        edgeType: "same-user",
      });
    }
  }

  return {
    edges,
    malformedCount,
    duplicateCount,
    distinctValidUsers: groups.size,
    distinctUsersWithEdges,
  };
}

/** Flatten edges to cosmos.gl link buffer: [s0,t0,s1,t1,...] as Float32Array. */
export function toCosmosLinks(edges: readonly SameUserEdge[]): Float32Array {
  const out = new Float32Array(edges.length * 2);
  for (let i = 0; i < edges.length; i++) {
    out[i * 2] = edges[i].sourceIndex;
    out[i * 2 + 1] = edges[i].targetIndex;
  }
  return out;
}
