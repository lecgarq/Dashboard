import type { ClusterMeta, Embedding, PersonFeatureBag, PersonGraphSnapshot, SimEdge } from "./types";
import { buildEmbedding } from "./tfidf";
import { knnEdges, tierEdges, humanizeFeature } from "./cosineGraph";
import { sphericalKMeans } from "./kmeans";
import { packedClusterLayout } from "./packedLayout";

const COLORS = ["#60a5fa","#fb7185","#34d399","#fbbf24","#a78bfa","#22d3ee","#f472b6","#a3e635","#f59e0b","#4ade80","#c084fc","#2dd4bf","#fca5a5","#bef264","#93c5fd","#fdba74"];

/** Cluster label = the 3 highest-weight centroid features, humanized. */
function clusterLabels(e: Embedding, assign: Int32Array, k: number): string[] {
  const F = e.featureKeys.length;
  const cent = Array.from({ length: k }, () => new Float64Array(F));
  for (let i = 0; i < e.persons.length; i++) { const p = e.persons[i], q = assign[i]; for (let t = 0; t < p.idx.length; t++) cent[q][p.idx[t]] += p.val[t]; }
  return cent.map((c) => {
    const top = [...c].map((v, f) => [f, v] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const seen: string[] = [];
    for (const [f] of top) { const h = humanizeFeature(e.featureKeys[f]); if (!seen.includes(h)) seen.push(h); }
    return seen.join(" · ");
  });
}

export function buildSnapshotsFromBags(bags: PersonFeatureBag[], ks: number[], minDf = 2): PersonGraphSnapshot[] {
  const e = buildEmbedding(bags, minDf);
  const rawEdges: SimEdge[] = knnEdges(e, 6, 0.3);
  const tiered = tierEdges(rawEdges, e.featureKeys, e);
  const deg = new Float64Array(e.persons.length);
  for (const ed of rawEdges) { deg[ed.a]++; deg[ed.b]++; }
  const sizes = new Float64Array(e.persons.length);
  for (let i = 0; i < sizes.length; i++) sizes[i] = Math.min(3.2, 1.1 + Math.log1p(deg[i]) * 0.34);

  return ks.map((k) => {
    const cl = sphericalKMeans(e, k);
    const labels = clusterLabels(e, cl.assign, k);
    const layout = packedClusterLayout(cl.assign, sizes, k, { w: 1320, h: 840 });
    const counts = new Array(k).fill(0);
    for (let i = 0; i < cl.assign.length; i++) counts[cl.assign[i]]++;
    const clusters: ClusterMeta[] = Array.from({ length: k }, (_, c) => ({ idx: c, label: labels[c], color: COLORS[c % COLORS.length], count: counts[c] }));
    const nodes = layout.nodes.map((n) => ({ id: e.persons[n.index].personId, name: e.persons[n.index].name, x: +n.x.toFixed(2), y: +n.y.toFixed(2), cluster: n.cluster, size: +n.size.toFixed(2) }));
    return { k, dim: e.featureKeys.length, personCount: e.persons.length, nodes, edges: tiered, clusters };
  });
}
