import type { Embedding, SimEdge, TieredEdge } from "./types";

/** Top-K cosine neighbours (undirected union, a<b), with a minimum score floor. Dense-scatter dot product. */
export function knnEdges(e: Embedding, k = 6, floor = 0.3): SimEdge[] {
  const N = e.persons.length;
  const F = e.featureKeys.length;
  const buf = new Float64Array(F);
  const top: { j: number; s: number }[][] = Array.from({ length: N }, () => []);
  const keep = (arr: { j: number; s: number }[], j: number, s: number) => {
    if (arr.length < k) { arr.push({ j, s }); return; }
    let m = 0;
    for (let q = 1; q < k; q++) if (arr[q].s < arr[m].s) m = q;
    if (s > arr[m].s) arr[m] = { j, s };
  };
  for (let i = 0; i < N; i++) {
    const pi = e.persons[i];
    for (let t = 0; t < pi.idx.length; t++) buf[pi.idx[t]] = pi.val[t];
    for (let j = i + 1; j < N; j++) {
      const pj = e.persons[j];
      let dot = 0;
      for (let t = 0; t < pj.idx.length; t++) dot += buf[pj.idx[t]] * pj.val[t];
      if (dot >= floor) { keep(top[i], j, dot); keep(top[j], i, dot); }
    }
    for (let t = 0; t < pi.idx.length; t++) buf[pi.idx[t]] = 0;
  }
  const set = new Map<string, number>();
  for (let i = 0; i < N; i++) for (const e2 of top[i]) {
    const a = Math.min(i, e2.j), b = Math.max(i, e2.j);
    set.set(`${a}:${b}`, e2.s);
  }
  return [...set.entries()].map(([key, score]) => {
    const [a, b] = key.split(":").map(Number);
    return { a, b, score };
  });
}

/** Assign each edge a tier by percentile of the score distribution: top 20% = L1, next 40% = L2, rest = L3. */
export function tierEdges(edges: SimEdge[], featureKeys: string[], embedding?: Embedding): TieredEdge[] {
  const scores = edges.map((e) => e.score).sort((a, b) => a - b);
  const pct = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] ?? 0;
  const t1 = pct(0.8), t2 = pct(0.4);
  return edges.map((e) => ({
    a: e.a, b: e.b,
    tier: (e.score >= t1 ? 1 : e.score >= t2 ? 2 : 3) as 1 | 2 | 3,
    reason: embedding ? edgeReason(embedding, e.a, e.b, featureKeys) : "",
  }));
}

/** Reason = the top shared features (by product of weights) between the two people, humanized + deduped. */
function edgeReason(e: Embedding, a: number, b: number, featureKeys: string[]): string {
  const pa = e.persons[a], pb = e.persons[b];
  const mb = new Map<number, number>();
  for (let t = 0; t < pb.idx.length; t++) mb.set(pb.idx[t], pb.val[t]);
  const contrib: { key: string; w: number }[] = [];
  for (let t = 0; t < pa.idx.length; t++) {
    const w = mb.get(pa.idx[t]);
    if (w) contrib.push({ key: featureKeys[pa.idx[t]], w: w * pa.val[t] });
  }
  contrib.sort((x, y) => y.w - x.w);
  const phrases: string[] = [];
  for (const c of contrib) {
    const h = humanizeFeature(c.key);
    if (!phrases.includes(h)) phrases.push(h);
    if (phrases.length >= 3) break;
  }
  return phrases.join(" · ");
}

export function humanizeFeature(key: string): string {
  const [prefix, ...rest] = key.split(":");
  const val = rest.join(":");
  switch (prefix) {
    case "proj": return "shared project";
    case "role": return "same role";
    case "comp": return "same company";
    case "mod": return `module: ${val}`;
    case "adm": return "admin access";
    case "act": return `activity: ${val}`;
    case "perm0": case "perm1": case "perm2": case "perm3": case "perm4": return "similar folder permissions";
    case "ext": return val === "int" ? "both internal" : "both external";
    case "stat": return `status: ${val}`;
    case "exec": return "executive";
    case "ten": return "similar tenure";
    case "reach": return "similar folder reach";
    case "bytes": return "similar data volume";
    case "recency": return "similar recent activity";
    case "pc": return "similar project count";
    default: return prefix;
  }
}
