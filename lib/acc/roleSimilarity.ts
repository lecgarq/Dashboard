import type { RoleTreeNode } from "@/lib/server/templateRoleTree";

export interface SimNode {
  roleId: string;
  roleName: string;
  folderCount: number;
  /** Highest permission tier the role holds — drives node colour. */
  maxRank: number;
}

export interface SimEdge {
  source: string; // roleId
  target: string; // roleId
  weight: number; // cosine similarity 0..1
}

export interface RoleSimilarityGraph {
  nodes: SimNode[];
  edges: SimEdge[];
}

/** folderId → tier rank vector for one role (an absent folder = 0). */
function vectorOf(role: RoleTreeNode): Map<string, number> {
  const v = new Map<string, number>();
  for (const t of role.tiers) for (const f of t.folders) v.set(f.id, t.rank);
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  // Iterate the smaller map for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, va] of small) {
    const vb = large.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  if (dot === 0) return 0;
  let na = 0;
  for (const va of a.values()) na += va * va;
  let nb = 0;
  for (const vb of b.values()) nb += vb * vb;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Build a role-to-role similarity graph from each role's folder access. Two roles
 * are similar when they hold permissions on the same folders at the same tiers —
 * measured as the cosine similarity of their folderId→tier-rank vectors. Each role
 * keeps an edge to its `topK` most-similar peers (above `minWeight`); edges are
 * undirected and de-duplicated. Pure — no I/O — so it is unit-tested.
 */
export function buildRoleSimilarityGraph(
  roles: RoleTreeNode[],
  opts: { topK?: number; minWeight?: number } = {},
): RoleSimilarityGraph {
  const topK = opts.topK ?? 4;
  const minWeight = opts.minWeight ?? 0.05;

  const nodes: SimNode[] = roles.map((r) => ({
    roleId: r.roleId,
    roleName: r.roleName,
    folderCount: r.folderCount,
    maxRank: Math.max(1, ...r.tiers.map((t) => t.rank)),
  }));

  const vectors = roles.map((r) => vectorOf(r));
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edges = new Map<string, SimEdge>();

  for (let i = 0; i < roles.length; i++) {
    const sims: Array<{ j: number; w: number }> = [];
    for (let j = 0; j < roles.length; j++) {
      if (i === j) continue;
      const w = cosine(vectors[i], vectors[j]);
      if (w >= minWeight) sims.push({ j, w });
    }
    sims.sort((a, b) => b.w - a.w);
    for (const { j, w } of sims.slice(0, topK)) {
      const key = edgeKey(roles[i].roleId, roles[j].roleId);
      const weight = Math.min(1, Math.round(w * 1000) / 1000);
      const existing = edges.get(key);
      if (!existing || weight > existing.weight) {
        const [s, t] = roles[i].roleId < roles[j].roleId
          ? [roles[i].roleId, roles[j].roleId]
          : [roles[j].roleId, roles[i].roleId];
        edges.set(key, { source: s, target: t, weight });
      }
    }
  }

  return { nodes, edges: [...edges.values()] };
}
