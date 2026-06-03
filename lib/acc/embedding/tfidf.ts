import type { Embedding, PersonFeatureBag } from "./types";

/** Build L2-normalized TF-IDF sparse vectors. minDf drops features held by < minDf people. */
export function buildEmbedding(bags: PersonFeatureBag[], minDf = 2): Embedding {
  const N = bags.length;
  const df = new Map<string, number>();
  for (const b of bags) for (const k of b.features.keys()) df.set(k, (df.get(k) ?? 0) + 1);

  const fidx = new Map<string, number>();
  const featureKeys: string[] = [];
  for (const [k, d] of df) {
    if (d < minDf) continue;
    fidx.set(k, featureKeys.length);
    featureKeys.push(k);
  }
  const idf = featureKeys.map((k) => Math.log((N + 1) / ((df.get(k) ?? 0) + 1)) + 1);

  const persons = bags.map((b) => {
    const idx: number[] = [];
    const val: number[] = [];
    let nrm = 0;
    for (const [k, tf] of b.features) {
      const j = fidx.get(k);
      if (j === undefined) continue;
      const w = tf * idf[j];
      idx.push(j);
      val.push(w);
      nrm += w * w;
    }
    nrm = Math.sqrt(nrm) || 1;
    for (let t = 0; t < val.length; t++) val[t] /= nrm;
    return { personId: b.personId, name: b.name, idx, val };
  });

  return { persons, featureKeys };
}
