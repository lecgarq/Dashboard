import type { Clustering, Embedding } from "./types";

/** Deterministic seeded PRNG (mulberry32) so layouts/clusters are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Spherical k-means on L2-normalized sparse vectors (cosine = dot). k-means++ seeding, 18 iters. */
export function sphericalKMeans(e: Embedding, k: number, seed = 12345): Clustering {
  const N = e.persons.length;
  const F = e.featureKeys.length;
  const rand = rng(seed);
  const cent: Float64Array[] = Array.from({ length: k }, () => new Float64Array(F));
  const dot = (i: number, c: Float64Array) => { const p = e.persons[i]; let d = 0; for (let t = 0; t < p.idx.length; t++) d += p.val[t] * c[p.idx[t]]; return d; };
  const setCentToPoint = (ci: number, i: number) => { cent[ci].fill(0); const p = e.persons[i]; for (let t = 0; t < p.idx.length; t++) cent[ci][p.idx[t]] = p.val[t]; };

  setCentToPoint(0, Math.floor(rand() * N));
  for (let s = 1; s < k; s++) {
    let best = -1, bd = -2;
    for (let i = 0; i < N; i++) {
      let mx = -2;
      for (let q = 0; q < s; q++) { const d = dot(i, cent[q]); if (d > mx) mx = d; }
      const far = 1 - mx;
      if (far > bd && rand() < 0.9) { bd = far; best = i; }
    }
    setCentToPoint(s, best < 0 ? Math.floor(rand() * N) : best);
  }

  const assign = new Int32Array(N);
  for (let it = 0; it < 18; it++) {
    for (let i = 0; i < N; i++) { let bc = 0, bm = -2; for (let q = 0; q < k; q++) { const d = dot(i, cent[q]); if (d > bm) { bm = d; bc = q; } } assign[i] = bc; }
    for (let q = 0; q < k; q++) cent[q].fill(0);
    for (let i = 0; i < N; i++) { const p = e.persons[i], q = assign[i]; for (let t = 0; t < p.idx.length; t++) cent[q][p.idx[t]] += p.val[t]; }
    for (let q = 0; q < k; q++) { let nrm = 0; for (let f = 0; f < F; f++) nrm += cent[q][f] * cent[q][f]; nrm = Math.sqrt(nrm) || 1; for (let f = 0; f < F; f++) cent[q][f] /= nrm; }
  }
  return { k, assign };
}
