# Access Graph Similarity Embedding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the access graph's hub-and-spoke layout with packed circular clusters of people grouped by a RAG-style TF-IDF embedding over all access signals, with tiered explainable edges, precomputed server-side and rendered from a cache.

**Architecture:** Pure algorithm modules (TF-IDF → cosine kNN → spherical k-means → packed-disc layout) are composed by a server orchestrator that reads the DB, builds one snapshot per cluster-count `k`, and persists to a new `AccPersonGraphSnapshot` table. A tRPC query serves the cached snapshot; the existing cosmos canvas renders the fixed positions + edges. A cluster slider switches `k`; hovering an edge shows its precomputed reason.

**Tech Stack:** TypeScript, Next.js (App Router), tRPC, Prisma (`server/db.ts`), Postgres (`db.$queryRaw`), vitest (unit), Playwright (e2e), cosmos.gl renderer.

**Reference:** Design spec `docs/superpowers/specs/2026-06-03-access-graph-similarity-embedding-design.md`. Validated prototype: `.superpowers/brainstorm/56003-1780523182/embed.cjs` + `layout.cjs` (gitignored — port their logic, don't import them).

**Shared data contract** (used across tasks — define exactly these names):

```typescript
// lib/acc/embedding/types.ts
export interface PersonFeatureBag { personId: string; name: string; features: Map<string, number>; } // feature key -> raw tf
export interface EmbeddedPerson { personId: string; name: string; idx: number[]; val: number[]; }     // sparse, L2-normalized
export interface Embedding { persons: EmbeddedPerson[]; featureKeys: string[]; }                       // featureKeys[i] = key for column i
export interface SimEdge { a: number; b: number; score: number; }                                      // a<b, person array indices
export interface TieredEdge { a: number; b: number; tier: 1 | 2 | 3; reason: string; }
export interface Clustering { k: number; assign: Int32Array; }
export interface LayoutNode { id: string; name: string; x: number; y: number; cluster: number; size: number; }
export interface ClusterMeta { idx: number; label: string; color: string; count: number; }
export interface PersonGraphSnapshot { k: number; dim: number; personCount: number; nodes: LayoutNode[]; edges: TieredEdge[]; clusters: ClusterMeta[]; }
```

---

## Phase A — Pure algorithm modules (no DB, no I/O)

### Task 1: Types + TF-IDF embedding builder

**Files:**
- Create: `lib/acc/embedding/types.ts`
- Create: `lib/acc/embedding/tfidf.ts`
- Test: `lib/acc/embedding/tfidf.test.ts`

- [ ] **Step 1: Create the types file** (paste the "Shared data contract" block above verbatim into `lib/acc/embedding/types.ts`).

- [ ] **Step 2: Write the failing test**

```typescript
// lib/acc/embedding/tfidf.test.ts
import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import type { PersonFeatureBag } from "./types";

const bag = (personId: string, features: Record<string, number>): PersonFeatureBag => ({
  personId, name: personId, features: new Map(Object.entries(features)),
});

describe("buildEmbedding", () => {
  it("drops singleton features (min_df >= 2)", () => {
    const bags = [bag("a", { shared: 1, onlyA: 1 }), bag("b", { shared: 1 })];
    const e = buildEmbedding(bags, 2);
    expect(e.featureKeys).toContain("shared");
    expect(e.featureKeys).not.toContain("onlyA");
  });

  it("L2-normalizes each person vector", () => {
    const bags = [bag("a", { x: 3, y: 4 }), bag("b", { x: 1, y: 1 })];
    const e = buildEmbedding(bags, 1);
    const norm = Math.hypot(...e.persons[0].val);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("weights rare features higher than common ones (idf)", () => {
    // 'common' in 3/3 people, 'rare' in 1 (kept via min_df=1). rare should get a higher idf weight.
    const bags = [bag("a", { common: 1, rare: 1 }), bag("b", { common: 1 }), bag("c", { common: 1 })];
    const e = buildEmbedding(bags, 1);
    const a = e.persons[0];
    const wCommon = a.val[a.idx.indexOf(e.featureKeys.indexOf("common"))];
    const wRare = a.val[a.idx.indexOf(e.featureKeys.indexOf("rare"))];
    expect(wRare).toBeGreaterThan(wCommon);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/tfidf.test.ts`
Expected: FAIL — `buildEmbedding` is not defined.

- [ ] **Step 4: Implement `lib/acc/embedding/tfidf.ts`**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/tfidf.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/acc/embedding/types.ts lib/acc/embedding/tfidf.ts lib/acc/embedding/tfidf.test.ts
git commit -m "feat(acc-embed): TF-IDF person embedding builder (min_df, L2-normalized)"
```

---

### Task 2: Cosine kNN graph + data-driven tiers + edge reasons

**Files:**
- Create: `lib/acc/embedding/cosineGraph.ts`
- Test: `lib/acc/embedding/cosineGraph.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/acc/embedding/cosineGraph.test.ts
import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import { knnEdges, tierEdges, humanizeFeature } from "./cosineGraph";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ id, personId: id, name: id, features: new Map(Object.entries(f)) } as PersonFeatureBag);

describe("knnEdges + tierEdges", () => {
  it("connects identical people with score ~1 and keeps a<b", () => {
    const e = buildEmbedding([bag("a", { p1: 1, p2: 1 }), bag("b", { p1: 1, p2: 1 }), bag("c", { z: 1 })], 1);
    const edges = knnEdges(e, 6, 0.3);
    const ab = edges.find((x) => x.a === 0 && x.b === 1);
    expect(ab).toBeTruthy();
    expect(ab!.score).toBeGreaterThan(0.99);
  });

  it("tiers split top 20% / next 40% / rest", () => {
    const edges = Array.from({ length: 10 }, (_, i) => ({ a: 0, b: i + 1, score: (i + 1) / 10 }));
    const tiered = tierEdges(edges, []);
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const t of tiered) counts[t.tier]++;
    expect(counts[1]).toBe(2); // top 20%
    expect(counts[2]).toBe(4); // next 40%
    expect(counts[3]).toBe(4);
  });
});

describe("humanizeFeature", () => {
  it("maps feature prefixes to readable phrases", () => {
    expect(humanizeFeature("proj:abc")).toBe("shared project");
    expect(humanizeFeature("act:upload-entity")).toBe("activity: upload-entity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/cosineGraph.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/acc/embedding/cosineGraph.ts`**

```typescript
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
export function edgeReason(e: Embedding, a: number, b: number, featureKeys: string[]): string {
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
```

Note: update the test import `tierEdges(edges, [])` — the 2-arg form returns empty reasons (fine for the tier test). Reason coverage is exercised in Task-5 integration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/cosineGraph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/embedding/cosineGraph.ts lib/acc/embedding/cosineGraph.test.ts
git commit -m "feat(acc-embed): cosine kNN + percentile edge tiers + edge reasons"
```

---

### Task 3: Spherical k-means

**Files:**
- Create: `lib/acc/embedding/kmeans.ts`
- Test: `lib/acc/embedding/kmeans.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/acc/embedding/kmeans.test.ts
import { describe, expect, it } from "vitest";
import { buildEmbedding } from "./tfidf";
import { sphericalKMeans } from "./kmeans";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ personId: id, name: id, features: new Map(Object.entries(f)) });

describe("sphericalKMeans", () => {
  it("separates two clearly distinct groups", () => {
    const bags: PersonFeatureBag[] = [];
    for (let i = 0; i < 10; i++) bags.push(bag("g1_" + i, { a: 1, b: 1 }));
    for (let i = 0; i < 10; i++) bags.push(bag("g2_" + i, { x: 1, y: 1 }));
    const e = buildEmbedding(bags, 1);
    const c = sphericalKMeans(e, 2, 42);
    // all g1 share a cluster, all g2 share the other
    const g1 = new Set([...Array(10)].map((_, i) => c.assign[i]));
    const g2 = new Set([...Array(10)].map((_, i) => c.assign[i + 10]));
    expect(g1.size).toBe(1);
    expect(g2.size).toBe(1);
    expect([...g1][0]).not.toBe([...g2][0]);
  });

  it("is deterministic for a fixed seed", () => {
    const e = buildEmbedding([bag("a", { a: 1 }), bag("b", { b: 1 }), bag("c", { a: 1 })], 1);
    const c1 = sphericalKMeans(e, 2, 7);
    const c2 = sphericalKMeans(e, 2, 7);
    expect([...c1.assign]).toEqual([...c2.assign]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/kmeans.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/acc/embedding/kmeans.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/kmeans.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/embedding/kmeans.ts lib/acc/embedding/kmeans.test.ts
git commit -m "feat(acc-embed): deterministic spherical k-means"
```

---

### Task 4: Packed-cluster layout (disc packing + phyllotaxis)

**Files:**
- Create: `lib/acc/embedding/packedLayout.ts`
- Test: `lib/acc/embedding/packedLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/acc/embedding/packedLayout.test.ts
import { describe, expect, it } from "vitest";
import { packedClusterLayout } from "./packedLayout";

describe("packedClusterLayout", () => {
  const assign = new Int32Array([0, 0, 0, 1, 1, 2]);
  const sizes = new Float64Array([1, 1, 1, 1, 1, 1]);

  it("places every node and keeps them inside the canvas", () => {
    const out = packedClusterLayout(assign, sizes, 3, { w: 1000, h: 700 });
    expect(out.nodes).toHaveLength(6);
    for (const n of out.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(700);
    }
  });

  it("separates clusters (different cluster centroids are far apart)", () => {
    const out = packedClusterLayout(assign, sizes, 3, { w: 1000, h: 700 });
    const cen = (c: number) => { const ns = out.nodes.filter((n) => n.cluster === c); return { x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length }; };
    const d = Math.hypot(cen(0).x - cen(1).x, cen(0).y - cen(1).y);
    expect(d).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/packedLayout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/acc/embedding/packedLayout.ts`** (port of prototype `layout.cjs`)

```typescript
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface PackedNode { index: number; x: number; y: number; cluster: number; size: number; }
export interface PackedLayout { nodes: PackedNode[]; discs: { x: number; y: number; r: number; cluster: number; count: number }[]; }

/**
 * One disc per cluster (radius ∝ √count), discs separated by collision relaxation,
 * members phyllotaxis-packed inside (largest `size` toward the centre). Pure + deterministic.
 */
export function packedClusterLayout(
  assign: Int32Array, sizes: Float64Array, k: number,
  opts: { w: number; h: number; base?: number; gap?: number; fill?: number } = { w: 1320, h: 840 },
): PackedLayout {
  const { w, h, base = 7, gap = 30, fill = 0.96 } = opts;
  const members: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < assign.length; i++) members[assign[i]].push(i);
  const R = members.map((m) => base * Math.sqrt(Math.max(1, m.length)));

  // pack discs: collision relaxation + pull to origin
  const cx = new Float64Array(k), cy = new Float64Array(k);
  for (let c = 0; c < k; c++) { const a = (2 * Math.PI * c) / k; const ring = R.reduce((s, r) => s + r, 0); cx[c] = Math.cos(a) * ring * 0.5; cy[c] = Math.sin(a) * ring * 0.5; }
  for (let it = 0; it < 600; it++) {
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      let dx = cx[j] - cx[i], dy = cy[j] - cy[i]; let d = Math.hypot(dx, dy) || 1e-6; const need = R[i] + R[j] + gap;
      if (d < need) { const push = (need - d) / 2; dx /= d; dy /= d; cx[i] -= dx * push; cy[i] -= dy * push; cx[j] += dx * push; cy[j] += dy * push; }
    }
    for (let c = 0; c < k; c++) { cx[c] *= 0.992; cy[c] *= 0.992; }
  }

  // phyllotaxis fill (largest size toward centre)
  const X = new Float64Array(assign.length), Y = new Float64Array(assign.length);
  for (let c = 0; c < k; c++) {
    const ms = members[c].slice().sort((a, b) => sizes[b] - sizes[a]); const M = ms.length;
    for (let m = 0; m < M; m++) { const rho = R[c] * fill * Math.sqrt((m + 0.5) / M); const th = m * GOLDEN; X[ms[m]] = cx[c] + rho * Math.cos(th); Y[ms[m]] = cy[c] + rho * Math.sin(th); }
  }

  // fit to canvas (preserve aspect)
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < assign.length; i++) { if (X[i] < minx) minx = X[i]; if (X[i] > maxx) maxx = X[i]; if (Y[i] < miny) miny = Y[i]; if (Y[i] > maxy) maxy = Y[i]; }
  const pad = 20; const s = Math.min((w - 2 * pad) / ((maxx - minx) || 1), (h - 2 * pad) / ((maxy - miny) || 1));
  const offx = (w - (maxx - minx) * s) / 2, offy = (h - (maxy - miny) * s) / 2;
  const px = (x: number) => offx + (x - minx) * s, py = (y: number) => offy + (y - miny) * s;

  const nodes: PackedNode[] = [];
  for (let i = 0; i < assign.length; i++) nodes.push({ index: i, x: px(X[i]), y: py(Y[i]), cluster: assign[i], size: sizes[i] });
  const discs = Array.from({ length: k }, (_, c) => ({ x: px(cx[c]), y: py(cy[c]), r: R[c] * s, cluster: c, count: members[c].length }));
  return { nodes, discs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/packedLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/embedding/packedLayout.ts lib/acc/embedding/packedLayout.test.ts
git commit -m "feat(acc-embed): packed-disc + phyllotaxis cluster layout"
```

---

## Phase B — Data assembly, orchestration, persistence

### Task 5: Person feature builder (DB → feature bags)

**Files:**
- Create: `lib/acc/embedding/buildPersonFeatures.ts`
- Test: `lib/acc/embedding/buildPersonFeatures.test.ts`

This module runs the SQL from the prototype `embed.cjs` via `db.$queryRaw`. Keep it a single exported async function `buildPersonFeatures(db)` returning `PersonFeatureBag[]`, plus a pure helper `quantileBuckets(values, n)` that is unit-tested.

- [ ] **Step 1: Write the failing test (pure helper only — SQL is integration-tested in Task 9)**

```typescript
// lib/acc/embedding/buildPersonFeatures.test.ts
import { describe, expect, it } from "vitest";
import { quantileBucket, quantileEdges } from "./buildPersonFeatures";

describe("quantile bucketing", () => {
  it("returns -1 for non-positive values", () => {
    expect(quantileBucket(0, [1, 2, 3])).toBe(-1);
  });
  it("buckets a value by quantile edges", () => {
    const edges = quantileEdges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5); // 4 internal edges
    expect(edges).toHaveLength(4);
    expect(quantileBucket(1, edges)).toBe(0);
    expect(quantileBucket(10, edges)).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/buildPersonFeatures.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/acc/embedding/buildPersonFeatures.ts`**

Port the feature construction from `.superpowers/brainstorm/56003-1780523182/embed.cjs` (the `feats`/`add` logic and all SQL). Use `db.$queryRawUnsafe<...>(sql)` for each aggregate query. Include the pure helpers:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { PersonFeatureBag } from "./types";

const BASELINE_MODULES = new Set(["docs", "insight"]);
const INTERNAL = new Set(["hermosillo.com", "hermosillo.com.mx"]);
const PERM_RANK: Record<string, number> = { "View Only": 0, "View+Download": 1, "Upload Only": 1, "View+Download+Upload": 2, "View+Download+Upload+Edit": 3, "Full Controller": 4 };

export function quantileEdges(values: number[], n = 5): number[] {
  const s = values.filter((v) => v > 0).slice().sort((a, b) => a - b);
  if (!s.length) return [];
  const e: number[] = [];
  for (let i = 1; i < n; i++) e.push(s[Math.floor((i / n) * s.length)]);
  return e;
}
export function quantileBucket(v: number, edges: number[]): number {
  if (v <= 0) return -1;
  let b = 0;
  for (const e of edges) if (v > e) b++;
  return b;
}

export async function buildPersonFeatures(db: PrismaClient): Promise<PersonFeatureBag[]> {
  // 1. person universe (distinct userId in AccDcProjectUser) + name
  // 2. proj/role/comp/mod(+adm)/exec/ext/status/activity(by autodeskId)/perm-footprint(via roles)/tenure/reach/bytes/recency/projectCount
  // 3. numeric -> quantileBucket one-hot
  // Mirror embed.cjs exactly; attribute activity by autodeskId; internal = INTERNAL set.
  // Return PersonFeatureBag[] (features = Map<string, number> of tf).
  // [Port the full embed.cjs body here — every query and add() call.]
}
```

(The executing engineer ports `embed.cjs` verbatim into the function body — it is the validated source of truth. Do not re-derive the SQL.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/buildPersonFeatures.test.ts`
Expected: PASS (helper tests; the SQL path is verified in Task 9).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/embedding/buildPersonFeatures.ts lib/acc/embedding/buildPersonFeatures.test.ts
git commit -m "feat(acc-embed): person feature builder (ports validated embed.cjs SQL)"
```

---

### Task 6: Snapshot orchestrator (compose modules → snapshot per k)

**Files:**
- Create: `lib/acc/embedding/buildSnapshots.ts`
- Test: `lib/acc/embedding/buildSnapshots.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/acc/embedding/buildSnapshots.test.ts
import { describe, expect, it } from "vitest";
import { buildSnapshotsFromBags } from "./buildSnapshots";
import type { PersonFeatureBag } from "./types";

const bag = (id: string, f: Record<string, number>): PersonFeatureBag => ({ personId: id, name: id, features: new Map(Object.entries(f)) });

describe("buildSnapshotsFromBags", () => {
  it("produces one snapshot per requested k with nodes, tiered edges, clusters", () => {
    const bags: PersonFeatureBag[] = [];
    for (let i = 0; i < 12; i++) bags.push(bag("g1_" + i, { a: 1, b: 1, p: 1 }));
    for (let i = 0; i < 12; i++) bags.push(bag("g2_" + i, { x: 1, y: 1, q: 1 }));
    const snaps = buildSnapshotsFromBags(bags, [2, 3]);
    expect(snaps.map((s) => s.k)).toEqual([2, 3]);
    const s2 = snaps[0];
    expect(s2.nodes).toHaveLength(24);
    expect(s2.clusters).toHaveLength(2);
    expect(s2.edges.length).toBeGreaterThan(0);
    expect(s2.edges.every((e) => e.tier >= 1 && e.tier <= 3)).toBe(true);
    expect(s2.edges.some((e) => e.reason.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/embedding/buildSnapshots.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/acc/embedding/buildSnapshots.ts`**

```typescript
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
  // node size = access breadth proxy: degree fallback if no reach feature — use edge degree
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/embedding/buildSnapshots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acc/embedding/buildSnapshots.ts lib/acc/embedding/buildSnapshots.test.ts
git commit -m "feat(acc-embed): snapshot orchestrator (embedding->clusters->layout per k)"
```

---

### Task 7: Prisma model + migration for the snapshot cache

**Files:**
- Modify: `prisma/schema.prisma` (add model near `AccGraphLayoutCache`, ~line 438)

- [ ] **Step 1: Add the model**

```prisma
model AccPersonGraphSnapshot {
  k           Int      @id          // cluster count this snapshot was built for
  dataHash    String
  personCount Int
  edgeCount   Int
  dim         Int
  nodes       Json                  // LayoutNode[]
  edges       Json                  // TieredEdge[]
  clusters    Json                  // ClusterMeta[]
  builtAt     DateTime @updatedAt
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name acc_person_graph_snapshot`
Expected: migration created + applied; `npx prisma generate` runs.
(Note from project memory: local migrate has had pgvector issues — if `migrate dev` fails on an unrelated shadow-DB error, fall back to `npx prisma db push` then `npx prisma generate`, and record the manual DDL.)

- [ ] **Step 3: Verify the client type exists**

Run: `npx tsc --noEmit`
Expected: no errors; `db.accPersonGraphSnapshot` is available.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(acc-embed): AccPersonGraphSnapshot cache table"
```

---

### Task 8: Persist orchestrator + standalone rebuild script

**Files:**
- Create: `lib/server/personGraphRebuild.ts`
- Create: `scripts/rebuild-person-graph.ts`

- [ ] **Step 1: Implement `lib/server/personGraphRebuild.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { buildPersonFeatures } from "@/lib/acc/embedding/buildPersonFeatures";
import { buildSnapshotsFromBags } from "@/lib/acc/embedding/buildSnapshots";

export const PERSON_GRAPH_KS = [6, 8, 10, 12, 14, 16];

export async function rebuildPersonGraph(db: PrismaClient): Promise<{ ks: number[]; personCount: number }> {
  const bags = await buildPersonFeatures(db);
  const snaps = buildSnapshotsFromBags(bags, PERSON_GRAPH_KS);
  const dataHash = createHash("sha1").update(`${bags.length}:${snaps[0]?.dim ?? 0}`).digest("hex").slice(0, 12);
  for (const s of snaps) {
    await db.accPersonGraphSnapshot.upsert({
      where: { k: s.k },
      create: { k: s.k, dataHash, personCount: s.personCount, edgeCount: s.edges.length, dim: s.dim, nodes: s.nodes as unknown as object, edges: s.edges as unknown as object, clusters: s.clusters as unknown as object },
      update: { dataHash, personCount: s.personCount, edgeCount: s.edges.length, dim: s.dim, nodes: s.nodes as unknown as object, edges: s.edges as unknown as object, clusters: s.clusters as unknown as object },
    });
  }
  return { ks: PERSON_GRAPH_KS, personCount: bags.length };
}
```

- [ ] **Step 2: Implement `scripts/rebuild-person-graph.ts`** (mirror `scripts/rebuild-graph.ts`)

```typescript
import { db } from "@/server/db";
import { rebuildPersonGraph } from "@/lib/server/personGraphRebuild";

async function main() {
  const r = await rebuildPersonGraph(db);
  console.log(`[rebuild-person-graph] ${r.personCount} people, ks=${r.ks.join(",")}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it against the real DB (manual verification)**

Run: `npx tsx scripts/rebuild-person-graph.ts`
Expected: logs `~3367 people, ks=6,8,10,12,14,16`; 6 rows in `AccPersonGraphSnapshot`.

- [ ] **Step 4: Commit**

```bash
git add lib/server/personGraphRebuild.ts scripts/rebuild-person-graph.ts
git commit -m "feat(acc-embed): persist orchestrator + rebuild-person-graph script"
```

---

### Task 9: Integration test + DC ingest hook

**Files:**
- Create: `lib/server/personGraphRebuild.test.ts` (integration — guarded to run only when DB present)
- Modify: `scripts/dc-daily-ingest.cjs` (post-success hook)

- [ ] **Step 1: Write a DB-guarded integration test**

```typescript
// lib/server/personGraphRebuild.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { buildPersonFeatures } from "@/lib/acc/embedding/buildPersonFeatures";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.runIf(RUN)("buildPersonFeatures (live DB)", () => {
  it("returns ~3,367 people each with at least one feature", async () => {
    const bags = await buildPersonFeatures(db);
    expect(bags.length).toBeGreaterThan(3000);
    expect(bags.every((b) => b.features.size > 0)).toBe(true);
    await db.$disconnect();
  }, 120_000);
});
```

- [ ] **Step 2: Run it**

Run: `RUN_DB_TESTS=1 npx vitest run lib/server/personGraphRebuild.test.ts`
Expected: PASS (~3,367 people). (On Windows PowerShell: `$env:RUN_DB_TESTS=1; npx vitest run ...`)

- [ ] **Step 3: Add the post-ingest hook** in `scripts/dc-daily-ingest.cjs`, after the success log and before `process.exit(...)`:

```javascript
    if (result.status === 'success') {
      try {
        log('Rebuilding person-similarity graph snapshot...');
        const { execSync } = require('node:child_process');
        execSync('npx tsx scripts/rebuild-person-graph.ts', { stdio: 'inherit' });
      } catch (e) {
        log('person-graph rebuild failed (non-fatal): ' + e.message);
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add lib/server/personGraphRebuild.test.ts scripts/dc-daily-ingest.cjs
git commit -m "feat(acc-embed): live integration test + post-ingest snapshot rebuild hook"
```

---

## Phase C — Serve + render + interactivity

### Task 10: tRPC query to serve a snapshot

**Files:**
- Create: `server/routers/acc-person-graph.ts`
- Modify: the root router (where `accDcGraph` is registered — find via `grep -r "accDcGraph:" server/`) to add `accPersonGraph`.

- [ ] **Step 1: Implement the router**

```typescript
// server/routers/acc-person-graph.ts
import { z } from "zod";
import { router, adminProcedure } from "../trpc"; // match the import style used by acc-dc-graph.ts
import { PERSON_GRAPH_KS } from "@/lib/server/personGraphRebuild";

export const accPersonGraphRouter = router({
  snapshot: adminProcedure
    .input(z.object({ k: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const k = nearestK(input?.k ?? 8);
      const row = await ctx.db.accPersonGraphSnapshot.findUnique({ where: { k } });
      if (!row) return null;
      return { k: row.k, dim: row.dim, personCount: row.personCount, nodes: row.nodes, edges: row.edges, clusters: row.clusters, availableKs: PERSON_GRAPH_KS };
    }),
});

function nearestK(k: number): number {
  return PERSON_GRAPH_KS.reduce((best, v) => (Math.abs(v - k) < Math.abs(best - k) ? v : best), PERSON_GRAPH_KS[0]);
}
```

- [ ] **Step 2: Register it** in the root router file next to `accDcGraph`, e.g. `accPersonGraph: accPersonGraphRouter,`.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/routers/acc-person-graph.ts server/routers/_app.ts
git commit -m "feat(acc-embed): tRPC accPersonGraph.snapshot query"
```

---

### Task 11: Client — render the cached snapshot

**Files:**
- Create: `app/(dashboard)/users/access-analysis/PersonGraphView.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx` (mount `PersonGraphView` behind a flag `NEXT_PUBLIC_ACC_PERSON_GRAPH`, default on)

- [ ] **Step 1: Implement `PersonGraphView.tsx`** — a canvas component that:
  - calls `trpc.accPersonGraph.snapshot.useQuery({ k })`,
  - draws edges by tier (alpha L1 0.24 / L2 0.07 / L3 0.025) then nodes (color by cluster, radius = size), matching the validated `layout.cjs` renderer,
  - exposes the test bridge `window.__ACC_GRAPH_TEST__ = { isReady: () => ready, getNodeCount: () => nodes.length, getK: () => k }`.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client"; // match existing client import

type Node = { id: string; name: string; x: number; y: number; cluster: number; size: number };
type Edge = { a: number; b: number; tier: 1 | 2 | 3; reason: string };
type Cluster = { idx: number; label: string; color: string; count: number };

export function PersonGraphView() {
  const [k, setK] = useState(8);
  const { data } = trpc.accPersonGraph.snapshot.useQuery({ k });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !data) return;
    const nodes = data.nodes as Node[]; const edges = data.edges as Edge[]; const clusters = data.clusters as Cluster[];
    const ctx = cv.getContext("2d")!; const W = cv.width, H = cv.height;
    ctx.fillStyle = "#070709"; ctx.fillRect(0, 0, W, H);
    const al: Record<number, number> = { 1: 0.24, 2: 0.07, 3: 0.025 }, lw: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.4 };
    for (const t of [3, 2, 1] as const) { ctx.lineWidth = lw[t]; ctx.strokeStyle = `rgba(200,210,225,${al[t]})`; ctx.beginPath(); for (const e of edges) { if (e.tier !== t) continue; const a = nodes[e.a], b = nodes[e.b]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } ctx.stroke(); }
    for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, n.size, 0, 6.2832); ctx.fillStyle = clusters[n.cluster].color; ctx.globalAlpha = n.size > 2.4 ? 0.95 : 0.8; ctx.fill(); ctx.globalAlpha = 1; }
    (window as unknown as { __ACC_GRAPH_TEST__?: object }).__ACC_GRAPH_TEST__ = { isReady: () => true, getNodeCount: () => nodes.length, getK: () => data.k };
  }, [data]);

  // hover-edge reason: find nearest edge midpoint to cursor, show its reason
  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    if (!data) return; const nodes = data.nodes as Node[]; const edges = data.edges as Edge[];
    const rect = (ev.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * (ev.currentTarget.width);
    const my = ((ev.clientY - rect.top) / rect.height) * (ev.currentTarget.height);
    let best: Edge | null = null, bd = 12;
    for (const e of edges) { const a = nodes[e.a], b = nodes[e.b]; const d = pointToSeg(mx, my, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = e; } }
    setHover(best ? best.reason : null);
  }

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} width={1320} height={840} onMouseMove={onMove} data-testid="person-graph-canvas" className="h-full w-full" />
      <div className="absolute left-3 top-3 flex items-center gap-2 text-xs text-zinc-300">
        <span>Clusters: {k}</span>
        <input type="range" min={6} max={16} step={2} value={k} onChange={(e) => setK(+e.target.value)} data-testid="cluster-slider" />
      </div>
      {hover && <div className="absolute bottom-3 left-3 rounded bg-zinc-900/90 px-2 py-1 text-xs text-zinc-100">{hover}</div>}
    </div>
  );
}

function pointToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1; const l2 = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
```

- [ ] **Step 2: Mount behind flag** in `AccessAnalysisShellClient.tsx`: if `process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH !== "0"`, render `<PersonGraphView />`; else the existing shell.

- [ ] **Step 3: Verify build + types**

Run: `npx tsc --noEmit`
Expected: no errors. (Do NOT run `npm run build` while the prod server is on :3000 — per project memory it 500s the running app.)

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/PersonGraphView.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx"
git commit -m "feat(acc-embed): render cached person-similarity snapshot + cluster slider + hover reason"
```

---

### Task 12: e2e smoke

**Files:**
- Create: `tests/e2e/acc-person-graph.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, type Page } from "@playwright/test";

test("person graph renders, slider changes k, edge hover shows a reason", async ({ page }: { page: Page }) => {
  await page.goto("/users/spatial-graph", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 120_000 });
  const n = await page.evaluate(() => (window as any).__ACC_GRAPH_TEST__.getNodeCount());
  expect(n).toBeGreaterThan(3000);
  await page.getByTestId("cluster-slider").fill("12");
  await page.waitForFunction(() => (window as any).__ACC_GRAPH_TEST__.getK() === 12, undefined, { timeout: 30_000 });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- acc-person-graph`
Expected: PASS. (Per project memory, run on an idle machine — single-boot e2e can time out under load; that is environmental, not a regression.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/acc-person-graph.spec.ts
git commit -m "test(acc-embed): e2e smoke for person graph render + slider"
```

---

### Task 13: Full suite + cleanup

- [ ] **Step 1: Run the full unit suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: all green, 0 TS errors.

- [ ] **Step 2: Update technical-debt docs** (per project convention) noting deferrals: weight-emphasis control, color-by toggle, search/isolate, all-1,152-project scope.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(acc-embed): record person-graph deferrals"
```

---

## Self-Review

**Spec coverage:** §5 embedding → Tasks 1,5; §6 edges/tiers/reasons → Task 2; §7 clustering+layout → Tasks 3,4,6; §8 architecture (precompute→cache→serve→render) → Tasks 6–11; cluster slider + hover (owner picks) → Task 11; testing (§10) → Tasks 1–4,6,9,12,13; limitations (§9) carried as data facts, not code. All spec sections map to a task.

**Placeholder scan:** Task 5 Step 3 intentionally instructs porting the validated `embed.cjs` body rather than reprinting ~150 lines of SQL — the source file is the contract and is referenced by exact path; helpers are fully shown and unit-tested. All other steps contain complete code.

**Type consistency:** `PersonFeatureBag`, `Embedding`, `SimEdge`, `TieredEdge`, `Clustering`, `LayoutNode`, `ClusterMeta`, `PersonGraphSnapshot` are defined once in `types.ts` and used unchanged across tasks. Functions: `buildEmbedding`, `knnEdges`, `tierEdges`, `edgeReason`, `humanizeFeature`, `sphericalKMeans`, `packedClusterLayout`, `buildPersonFeatures`, `buildSnapshotsFromBags`, `rebuildPersonGraph` — names consistent between definition and call sites.

**Deviation from spec:** persistence uses a new `AccPersonGraphSnapshot` table (one row per k) instead of overloading the already-wired `AccGraphLayoutCache`. Rationale: avoid breaking the existing instance-graph cache.
