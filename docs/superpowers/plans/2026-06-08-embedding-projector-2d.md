# Embedding Projector 2D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the laggy 3D force-ball at `/users/spatial-graph` with a precomputed 2D similarity-embedding map (UMAP) of the 16,942 (person, project) instances, rendered as a no-edge cosmos.gl scatter, colored by Company, with click→nearest-neighbor highlight + profile.

**Architecture:** A Python step (run during the daily sync) reads per-instance feature tokens extracted by a TypeScript script, computes a 2D UMAP projection + cosine kNN, and upserts an `AccInstanceEmbedding` table. The frontend loads those coordinates via tRPC and feeds them into the existing 2D renderer through a tiny **static PhysicsLayer** (fixed positions + working mask bus) — so the entire existing rAF/color/mask/click pipeline works unchanged. The 3D path is parked behind `NEXT_PUBLIC_ACC_3D_GRAPH`.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PrismaPg adapter) + Postgres 18 (local); cosmos.gl (`@cosmos.gl/graph`); Python 3.12 with scikit-learn 1.8 + umap-learn 0.5.11 + psycopg; Vitest + Playwright + pytest.

**Spec:** `docs/superpowers/specs/2026-06-08-embedding-projector-2d-design.md`

---

## File Structure

**Create:**
- `prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql` — raw `CREATE TABLE` (repo pattern; avoids `prisma migrate` + pgvector).
- `scripts/create-instance-embedding-table.ts` — idempotent table creator (runs the raw SQL).
- `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts` — pure `NodeFeatureSnapshot → string[]` tokenizer (the per-instance feature definition).
- `app/(dashboard)/users/access-analysis/instanceFeatureTokens.test.ts` — unit tests.
- `scripts/build-instance-features.ts` — Node script: bulkUsers → nodes → tokens → JSONL.
- `scripts/compute_instance_embeddings.py` — Python: JSONL → TF-IDF → UMAP → kNN → upsert.
- `scripts/test_compute_instance_embeddings.py` — pytest for the pure Python functions.
- `app/(dashboard)/users/access-analysis/staticLayer.ts` — `createStaticLayer()` implementing `PhysicsLayer` with fixed positions.
- `app/(dashboard)/users/access-analysis/staticLayer.test.ts` — unit tests.
- `app/(dashboard)/users/access-analysis/graphModeFlag.ts` — pure `NEXT_PUBLIC_ACC_3D_GRAPH` reader.
- `app/(dashboard)/users/access-analysis/graphModeFlag.test.ts` — unit tests.

**Modify:**
- `prisma/schema.prisma` — add `AccInstanceEmbedding` model (typed client for the read route).
- `server/routers/acc-dc-graph.ts` — add `instanceEmbedding` + `instanceNeighbors` procedures.
- `lib/server/acc-route-hydration.ts` — prefetch `instanceEmbedding`.
- `app/(dashboard)/users/access-analysis/nodeColors.ts` — add `"company"` color mode.
- `app/(dashboard)/users/access-analysis/bucketedColors.ts` — company category extraction.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — flag-off branch: static layer + embedding load + company default; hide 3D toggle.
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — gate `GraphCanvas3D` mount on flag.
- `app/(dashboard)/users/access-analysis/usePredicateEngine.ts` + `GraphInteractions.tsx` — neighbor-highlight mask + mini panel.
- `scripts/dc-daily-ingest.cjs` — invoke the two new scripts after the person-graph hook.
- `.gitignore` — ignore `.embedding/`.

---

## Phase 1 — Offline embedding pipeline (independently runnable & verifiable)

### Task 1: `AccInstanceEmbedding` table + Prisma model

**Files:**
- Create: `prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql`
- Create: `scripts/create-instance-embedding-table.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Write the raw SQL**

`prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql`:
```sql
CREATE TABLE IF NOT EXISTS "AccInstanceEmbedding" (
  "nodeId"        TEXT PRIMARY KEY,
  "x"             REAL NOT NULL,
  "y"             REAL NOT NULL,
  "neighbors"     JSONB NOT NULL DEFAULT '[]',
  "embeddingRunId" TEXT NOT NULL,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Add the Prisma model** (so the typed client exposes `db.accInstanceEmbedding`)

Append to `prisma/schema.prisma`:
```prisma
model AccInstanceEmbedding {
  nodeId        String   @id
  x             Float    @db.Real
  y             Float    @db.Real
  neighbors     Json     @default("[]")
  embeddingRunId String
  updatedAt     DateTime @default(now()) @updatedAt
}
```

- [ ] **Step 3: Write the idempotent table creator**

`scripts/create-instance-embedding-table.ts`:
```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] }) as unknown as PrismaClient;
}

async function main(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql"), "utf8");
  const prisma = createPrisma();
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log("AccInstanceEmbedding table ensured.");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Create the table + regenerate the client**

Run:
```bash
npx tsx scripts/create-instance-embedding-table.ts
npx prisma generate
```
Expected: "AccInstanceEmbedding table ensured." then a successful `prisma generate`. Do NOT run `prisma migrate` (it manages the `LodEmbedding` pgvector column via raw SQL — leave it alone).

- [ ] **Step 5: Verify the table exists**

Run:
```bash
npx tsx -e "import('@prisma/client').then(async m=>{const {PrismaPg}=await import('@prisma/adapter-pg');const db=new m.PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL})});console.log(await db.accInstanceEmbedding.count());process.exit(0)})"
```
Expected: prints `0`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql scripts/create-instance-embedding-table.ts
git commit -m "feat(acc-embed): AccInstanceEmbedding table + model"
```

---

### Task 2: Per-instance feature tokenizer (pure TS)

This is the single definition of "what makes two instances similar." Pure + tested. Project identity is **excluded** (D5) so clusters form by access pattern.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts`
- Test: `app/(dashboard)/users/access-analysis/instanceFeatureTokens.test.ts`

- [ ] **Step 1: Write the failing test**

`instanceFeatureTokens.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { instanceFeatureTokens } from "./instanceFeatureTokens";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function fixture(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u1::p1", nameLower: "ann", emailLower: "ann@hermosillo.com",
    project: "Tower A", role: "Project Manager", permTier: "edit", isExternal: false,
    activityBucket: "Med", signinBucket: "<30d", activityCountRaw: 42, lastSignInRel: "3d ago",
    permissionCoverage: "known", firmName: "Hermosillo", accountStatus: "active",
    affiliation: "internal", moduleSignature: ["build", "cost"], activityRecencyBucket: "8-14d",
    permissionStrength: 3, ...over,
  } as NodeFeatureSnapshot;
}

describe("instanceFeatureTokens", () => {
  it("emits role/company/module/permission/activity/affiliation tokens", () => {
    const t = instanceFeatureTokens(fixture());
    expect(t).toContain("role:Project Manager");
    expect(t).toContain("company:Hermosillo");
    expect(t).toContain("mod:build");
    expect(t).toContain("mod:cost");
    expect(t).toContain("perm:edit");
    expect(t).toContain("act:Med");
    expect(t).toContain("aff:internal");
    expect(t).toContain("status:active");
    expect(t).toContain("recency:8-14d");
  });
  it("does NOT emit a raw project-identity token (D5: down-weight project)", () => {
    const t = instanceFeatureTokens(fixture());
    expect(t.some((x) => x.startsWith("projid:"))).toBe(false);
  });
  it("is stable/deterministic and deduped", () => {
    const a = instanceFeatureTokens(fixture({ moduleSignature: ["build", "build"] }));
    expect(a.filter((x) => x === "mod:build")).toHaveLength(1);
  });
  it("handles missing optionals without throwing", () => {
    const t = instanceFeatureTokens(fixture({ moduleSignature: undefined, firmName: "", permTier: null, affiliation: undefined }));
    expect(Array.isArray(t)).toBe(true);
    expect(t).toContain("company:(none)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/instanceFeatureTokens.test.ts"`
Expected: FAIL — "Cannot find module './instanceFeatureTokens'".

- [ ] **Step 3: Implement the tokenizer**

`instanceFeatureTokens.ts`:
```typescript
import type { NodeFeatureSnapshot } from "./interactionTypes";

/**
 * Per-instance feature tokens — the definition of "similar access" for the
 * embedding. Categorical one-hots + module multi-hot + bucketed signals.
 * Project identity is DELIBERATELY EXCLUDED (spec D5) so clusters form by
 * access PATTERN, not raw project membership. Color-by-project still reveals
 * project distribution from the snapshot separately.
 */
export function instanceFeatureTokens(f: NodeFeatureSnapshot): string[] {
  const out = new Set<string>();
  out.add(`role:${f.role || "(none)"}`);
  out.add(`company:${f.firmName || "(none)"}`);
  out.add(`perm:${f.permTier ?? "(none)"}`);
  if (typeof f.permissionStrength === "number") out.add(`permstr:${f.permissionStrength}`);
  out.add(`act:${f.activityBucket}`);
  out.add(`recency:${f.activityRecencyBucket ?? "none"}`);
  out.add(`aff:${f.affiliation ?? (f.isExternal ? "external" : "internal")}`);
  out.add(`status:${f.accountStatus || "(none)"}`);
  out.add(`admin:${f.isAdmin ? "1" : "0"}`);
  for (const m of f.moduleSignature ?? []) out.add(`mod:${m}`);
  return Array.from(out).sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/instanceFeatureTokens.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts" "app/(dashboard)/users/access-analysis/instanceFeatureTokens.test.ts"
git commit -m "feat(acc-embed): pure per-instance feature tokenizer (project excluded)"
```

---

### Task 3: Node extractor → JSONL

Reuses the canonical node build (`buildGraphNodesFromUsers`) so node identity/order matches the client exactly (sorted `userId::projectId`).

**Files:**
- Create: `scripts/build-instance-features.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add `.embedding/` to `.gitignore`**

Append one line to `.gitignore`:
```
.embedding/
```

- [ ] **Step 2: Write the extractor**

`scripts/build-instance-features.ts`:
```typescript
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCachedAccDcBulkUsers } from "@/lib/server/acc-hot-cache";
import { buildGraphNodesFromUsers } from "@/app/(dashboard)/users/access-analysis/graphNodesFromUsers";
import { instanceFeatureTokens } from "@/app/(dashboard)/users/access-analysis/instanceFeatureTokens";

function createPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] }) as unknown as PrismaClient;
}

async function main(): Promise<void> {
  const db = createPrisma();
  try {
    const users = await getCachedAccDcBulkUsers(db as never, {
      includePermissionSummary: true,
      includeActivityMix: true,
    });
    const { nodeIds, features } = buildGraphNodesFromUsers(users);
    const outDir = join(process.cwd(), ".embedding");
    mkdirSync(outDir, { recursive: true });
    const lines = features.map((f, i) =>
      JSON.stringify({ nodeId: nodeIds[i], tokens: instanceFeatureTokens(f) }),
    );
    writeFileSync(join(outDir, "instance-features.jsonl"), lines.join("\n") + "\n", "utf8");
    console.log(`Wrote ${lines.length} instance feature rows to .embedding/instance-features.jsonl`);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it against real data**

Run: `npx tsx scripts/build-instance-features.ts`
Expected: `Wrote 16942 instance feature rows ...` (count near 16,942; exact value depends on current sync).

- [ ] **Step 4: Sanity-check the JSONL**

Run: `npx tsx -e "const fs=require('fs');const l=fs.readFileSync('.embedding/instance-features.jsonl','utf8').trim().split('\n');console.log('rows',l.length);console.log('sample',l[0])"`
Expected: row count printed; sample shows `{"nodeId":"...::...","tokens":["act:...","aff:...",...]}`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-instance-features.ts .gitignore
git commit -m "feat(acc-embed): node extractor → instance-features.jsonl"
```

---

### Task 4: Python projection (TF-IDF → UMAP → kNN → upsert)

**Files:**
- Create: `scripts/compute_instance_embeddings.py`
- Test: `scripts/test_compute_instance_embeddings.py`

- [ ] **Step 1: Install psycopg**

Run: `python -m pip install "psycopg[binary]"`
Expected: installs psycopg 3.x (sklearn/umap/numpy already present).

- [ ] **Step 2: Write the failing pure-function test**

`scripts/test_compute_instance_embeddings.py`:
```python
import numpy as np
from compute_instance_embeddings import normalize_coords, tfidf_matrix, knn_neighbors

def test_normalize_coords_fits_box():
    xy = np.array([[0.0, 0.0], [10.0, -5.0], [-2.0, 3.0]])
    out = normalize_coords(xy, half_extent=100.0)
    assert out.shape == xy.shape
    assert np.max(np.abs(out)) <= 100.0 + 1e-6
    assert np.max(np.abs(out)) >= 99.0  # largest coord pinned near the box edge

def test_tfidf_matrix_shapes():
    docs = [["role:a", "mod:x"], ["role:a", "mod:y"], ["role:b"]]
    m, vocab = tfidf_matrix(docs)
    assert m.shape[0] == 3
    assert m.shape[1] == len(vocab)
    assert "role:a" in vocab

def test_knn_neighbors_excludes_self_and_ranks():
    # three docs: 0 and 1 share role:a (similar); 2 is different
    docs = [["role:a", "mod:x"], ["role:a", "mod:x"], ["role:b"]]
    m, _ = tfidf_matrix(docs)
    nbrs = knn_neighbors(m, ["n0", "n1", "n2"], k=1)
    assert nbrs["n0"][0]["nodeId"] == "n1"   # nearest of 0 is 1
    assert nbrs["n0"][0]["nodeId"] != "n0"   # never self
    assert 0.0 <= nbrs["n0"][0]["score"] <= 1.0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts && python -m pytest test_compute_instance_embeddings.py -v`
Expected: FAIL — "No module named 'compute_instance_embeddings'".

- [ ] **Step 4: Write the script**

`scripts/compute_instance_embeddings.py`:
```python
"""Per-instance 2D embedding for /users/spatial-graph.

Reads .embedding/instance-features.jsonl (one {nodeId, tokens[]} per line),
TF-IDF weights the tokens, projects to 2D with UMAP (cosine), computes cosine
kNN, and upserts AccInstanceEmbedding in Postgres. Pure functions are unit-tested
in test_compute_instance_embeddings.py; main() does the I/O.
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

RANDOM_STATE = 42
HALF_EXTENT = 1000.0
K_NEIGHBORS = 10


def tfidf_matrix(docs):
    """docs: list[list[str]] token lists. Returns (sparse matrix, vocab list)."""
    vec = TfidfVectorizer(analyzer=lambda toks: toks, lowercase=False, min_df=1)
    m = vec.fit_transform(docs)
    return m, vec.get_feature_names_out().tolist()


def project_umap(matrix):
    """High-dim sparse TF-IDF -> 2D float array. UMAP with cosine metric.
    PCA fallback if umap import fails (spec §10)."""
    try:
        import umap
        reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=RANDOM_STATE)
        return np.asarray(reducer.fit_transform(matrix), dtype=np.float64)
    except Exception as e:  # noqa: BLE001 - fallback path is intentional, logged
        print(f"UMAP unavailable ({e}); falling back to PCA", file=sys.stderr)
        from sklearn.decomposition import TruncatedSVD
        svd = TruncatedSVD(n_components=2, random_state=RANDOM_STATE)
        return np.asarray(svd.fit_transform(matrix), dtype=np.float64)


def normalize_coords(xy, half_extent=HALF_EXTENT):
    """Scale so the largest abs coordinate == half_extent (stable framing)."""
    xy = np.asarray(xy, dtype=np.float64)
    xy = xy - xy.mean(axis=0, keepdims=True)
    max_abs = float(np.max(np.abs(xy))) or 1.0
    return xy * (half_extent / max_abs)


def knn_neighbors(matrix, node_ids, k=K_NEIGHBORS):
    """Cosine kNN. Returns {nodeId: [{nodeId, score}, ...]} excluding self."""
    n = matrix.shape[0]
    kk = min(k + 1, n)
    nn = NearestNeighbors(n_neighbors=kk, metric="cosine").fit(matrix)
    dist, idx = nn.kneighbors(matrix)
    out = {}
    for i, nid in enumerate(node_ids):
        row = []
        for j, d in zip(idx[i], dist[i]):
            if j == i:
                continue
            row.append({"nodeId": node_ids[j], "score": round(1.0 - float(d), 4)})
            if len(row) >= k:
                break
        out[nid] = row
    return out


def _load_jsonl(path):
    node_ids, docs = [], []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            node_ids.append(rec["nodeId"])
            docs.append(rec["tokens"])
    return node_ids, docs


def _upsert(node_ids, coords, neighbors, run_id):
    import psycopg
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    now = datetime.now(timezone.utc)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        for i, nid in enumerate(node_ids):
            cur.execute(
                """
                INSERT INTO "AccInstanceEmbedding" ("nodeId","x","y","neighbors","embeddingRunId","updatedAt")
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT ("nodeId") DO UPDATE SET
                  "x"=EXCLUDED."x","y"=EXCLUDED."y","neighbors"=EXCLUDED."neighbors",
                  "embeddingRunId"=EXCLUDED."embeddingRunId","updatedAt"=EXCLUDED."updatedAt"
                """,
                (nid, float(coords[i][0]), float(coords[i][1]),
                 json.dumps(neighbors.get(nid, [])), run_id, now),
            )
        conn.commit()


def main():
    path = os.path.join(os.getcwd(), ".embedding", "instance-features.jsonl")
    node_ids, docs = _load_jsonl(path)
    if not node_ids:
        raise SystemExit("no instance features found; run build-instance-features.ts first")
    matrix, _vocab = tfidf_matrix(docs)
    coords = normalize_coords(project_umap(matrix))
    assert np.all(np.isfinite(coords)), "non-finite coordinates produced"
    neighbors = knn_neighbors(matrix, node_ids)
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    _upsert(node_ids, coords, neighbors, run_id)
    print(f"Upserted {len(node_ids)} AccInstanceEmbedding rows (run {run_id})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts && python -m pytest test_compute_instance_embeddings.py -v`
Expected: PASS (3 tests). (The pure functions don't touch the DB.)

- [ ] **Step 6: Run the full projection against real data**

Run (from repo root, with env loaded): `python scripts/compute_instance_embeddings.py`
Expected: `Upserted 16942 AccInstanceEmbedding rows (run ...)`. If `DIRECT_URL` isn't in the shell env, prefix it: `DIRECT_URL="postgresql://postgres@127.0.0.1:5432/dashboard" python scripts/compute_instance_embeddings.py`.

- [ ] **Step 7: Verify rows landed + coords are finite**

Run: `npx tsx -e "import('@prisma/client').then(async m=>{const {PrismaPg}=await import('@prisma/adapter-pg');const db=new m.PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL})});const c=await db.accInstanceEmbedding.count();const s=await db.accInstanceEmbedding.findFirst();console.log('rows',c,'sample',JSON.stringify(s));process.exit(0)})"`
Expected: `rows 16942 sample {"nodeId":"...","x":..,"y":..,"neighbors":[...]}`.

- [ ] **Step 8: Commit**

```bash
git add scripts/compute_instance_embeddings.py scripts/test_compute_instance_embeddings.py
git commit -m "feat(acc-embed): python TF-IDF+UMAP+kNN projection → AccInstanceEmbedding"
```

---

### Task 5: Wire both scripts into the daily sync

**Files:**
- Modify: `scripts/dc-daily-ingest.cjs:104-110`

- [ ] **Step 1: Add the embedding hook after the person-graph hook**

In `scripts/dc-daily-ingest.cjs`, immediately after the existing `person-graph rebuild` try/catch (line ~110), insert:
```javascript
      try {
        log('Building per-instance embedding (features → UMAP)...');
        const { execSync } = require('node:child_process');
        execSync('npx tsx scripts/build-instance-features.ts', { stdio: 'inherit' });
        execSync('python scripts/compute_instance_embeddings.py', { stdio: 'inherit' });
      } catch (e) {
        log('instance-embedding build failed (non-fatal): ' + e.message);
      }
```
(Same non-fatal pattern as the person-graph hook — a failure logs and continues; ingest exit code is unaffected.)

- [ ] **Step 2: Verify the script parses**

Run: `node --check scripts/dc-daily-ingest.cjs`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add scripts/dc-daily-ingest.cjs
git commit -m "feat(acc-embed): run instance-embedding build after daily ingest (non-fatal)"
```

---

## Phase 2 — Server read

### Task 6: tRPC `instanceEmbedding` + `instanceNeighbors` + hydration

**Files:**
- Modify: `server/routers/acc-dc-graph.ts`
- Modify: `lib/server/acc-route-hydration.ts`

- [ ] **Step 1: Add the procedures**

In `server/routers/acc-dc-graph.ts`, add to the `accDcGraphRouter` object (keep the existing `bulkUsers`):
```typescript
  instanceEmbedding: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.accInstanceEmbedding.findMany({
      select: { nodeId: true, x: true, y: true },
    });
    // Map keyed by nodeId; the client joins to its sorted nodeIds (cosmos order).
    return rows as Array<{ nodeId: string; x: number; y: number }>;
  }),
  instanceNeighbors: adminProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.accInstanceEmbedding.findUnique({
        where: { nodeId: input.nodeId },
        select: { neighbors: true },
      });
      return (row?.neighbors ?? []) as Array<{ nodeId: string; score: number }>;
    }),
```
(`z` and `adminProcedure` are already imported in this file.)

- [ ] **Step 2: Prefetch the embedding in the route hydration**

In `lib/server/acc-route-hydration.ts`, add to the `Promise.allSettled([...])` in `prefetchAccessAnalysisRouteData`:
```typescript
    helpers.accDcGraph.instanceEmbedding.prefetch(undefined, {
      staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
    }),
```
(Keep the existing `bulkUsers` prefetch. `instanceNeighbors` is click-on-demand — not prefetched.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (Confirms `db.accInstanceEmbedding` is on the generated client from Task 1.)

- [ ] **Step 4: Commit**

```bash
git add server/routers/acc-dc-graph.ts lib/server/acc-route-hydration.ts
git commit -m "feat(acc-embed): tRPC instanceEmbedding + instanceNeighbors + prefetch"
```

---

## Phase 3 — Frontend: static layer, flag, color, interactions

### Task 7: `createStaticLayer` (PhysicsLayer with fixed positions)

The renderer pipeline only talks to the `PhysicsLayer` interface, so a static layer makes everything downstream (rAF push, mask bus, color) work unchanged with frozen embedding coords.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/staticLayer.ts`
- Test: `app/(dashboard)/users/access-analysis/staticLayer.test.ts`

- [ ] **Step 1: Write the failing test**

`staticLayer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createStaticLayer } from "./staticLayer";

describe("createStaticLayer", () => {
  it("reports frozen and returns stride-3 positions with z=0", () => {
    const xy = new Float32Array([1, 2, 3, 4]); // 2 nodes
    const layer = createStaticLayer(["a", "b"], xy);
    expect(layer.frozen).toBe(true);
    const p = layer.getPositions();
    expect(Array.from(p)).toEqual([1, 2, 0, 3, 4, 0]);
  });
  it("setMask mutates alphaMask + bumps maskVersion (mask bus works)", () => {
    const layer = createStaticLayer(["a", "b"], new Float32Array([0, 0, 0, 0]));
    const v0 = layer.maskVersion;
    layer.setMask((i) => (i === 0 ? 1.0 : 0.15));
    expect(layer.alphaMask[0]).toBe(1.0);
    expect(layer.alphaMask[1]).toBe(0.15);
    expect(layer.maskVersion).toBe(v0 + 1);
  });
  it("updateSliders / setActiveInput are no-ops (positionsVersion unchanged)", () => {
    const layer = createStaticLayer(["a"], new Float32Array([0, 0]));
    const pv = layer.positionsVersion;
    layer.updateSliders({ role: 1 });
    layer.setActiveInput(true);
    expect(layer.positionsVersion).toBe(pv);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/staticLayer.test.ts"`
Expected: FAIL — "Cannot find module './staticLayer'".

- [ ] **Step 3: Implement the static layer**

`staticLayer.ts`:
```typescript
import type { PhysicsLayer } from "./physicsLayer";

/**
 * A PhysicsLayer whose positions are FIXED (precomputed embedding coords). The
 * physics bus is inert (updateSliders/setActiveInput/syncPositions are no-ops);
 * only the MASK bus is live, so filter/search/lasso/click-highlight all work
 * exactly as in the simulated graph. `xy` is stride-2 [x0,y0,x1,y1,...]; the
 * 2D renderer drops z, but getPositions() returns stride-3 (z=0) to satisfy the
 * interface and the rAF pump.
 */
export function createStaticLayer(nodeIds: readonly string[], xy: Float32Array): PhysicsLayer {
  const n = nodeIds.length;
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    xyz[i * 3] = xy[i * 2] ?? 0;
    xyz[i * 3 + 1] = xy[i * 2 + 1] ?? 0;
    xyz[i * 3 + 2] = 0;
  }
  let _maskVersion = 0;
  const _alphaMask = new Float32Array(n).fill(1.0);
  return {
    get alphaMask() { return _alphaMask; },
    get maskVersion() { return _maskVersion; },
    get positionsVersion() { return 1; }, // constant: positions never change
    get frozen() { return true; },
    updateSliders() {/* inert */},
    setMask(predicate) {
      for (let i = 0; i < n; i++) _alphaMask[i] = predicate(i);
      _maskVersion++;
    },
    setActiveInput() {/* inert */},
    getPositions() { return xyz; },
    getTargets() { return {}; },
    getDimWeights() { return {}; },
    getSliders() { return {}; },
    syncPositions() {/* inert */},
    dispose() {/* nothing to release */},
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/staticLayer.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/staticLayer.ts" "app/(dashboard)/users/access-analysis/staticLayer.test.ts"
git commit -m "feat(acc-embed): static PhysicsLayer for fixed embedding coords"
```

---

### Task 8: `NEXT_PUBLIC_ACC_3D_GRAPH` flag helper + gate 3D mount

**Files:**
- Create: `app/(dashboard)/users/access-analysis/graphModeFlag.ts`
- Test: `app/(dashboard)/users/access-analysis/graphModeFlag.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`

- [ ] **Step 1: Write the failing test**

`graphModeFlag.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { is3dGraphEnabled } from "./graphModeFlag";

describe("is3dGraphEnabled", () => {
  it("returns false when flag unset/empty/0", () => {
    expect(is3dGraphEnabled(undefined)).toBe(false);
    expect(is3dGraphEnabled("")).toBe(false);
    expect(is3dGraphEnabled("0")).toBe(false);
  });
  it("returns true only when flag === '1'", () => {
    expect(is3dGraphEnabled("1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/graphModeFlag.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the flag helper**

`graphModeFlag.ts`:
```typescript
/** Build-time flag: 3D physics graph is parked behind NEXT_PUBLIC_ACC_3D_GRAPH=1 (spec §7). */
export function is3dGraphEnabled(flag: string | undefined): boolean {
  return flag === "1";
}

/** Runtime read of the public env flag (statically inlined by Next at build). */
export const ACC_3D_GRAPH_ENABLED = is3dGraphEnabled(process.env.NEXT_PUBLIC_ACC_3D_GRAPH);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/graphModeFlag.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate the 3D canvas mount on the flag**

In `GraphCanvas.tsx`, import the flag at the top:
```typescript
import { ACC_3D_GRAPH_ENABLED } from "./graphModeFlag";
```
Then wrap the 3D container slot (the `<div ref={container3DRef} ...>` block) so it only mounts when the flag is on:
```typescript
      {ACC_3D_GRAPH_ENABLED && (
        <div
          ref={container3DRef}
          style={{ position: "absolute", inset: 0, visibility: props.mode === "3d" ? "visible" : "hidden" }}
        >
          <GraphCanvas3D
            /* ...existing props unchanged... */
          />
        </div>
      )}
```
(Leave the 2D slot always-mounted. When the flag is off, `GraphCanvas3D` and its three.js context are never created.)

- [ ] **Step 6: Typecheck + run the canvas tests**

Run: `npx tsc --noEmit && npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts" "app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts"`
Expected: tsc 0 errors; existing canvas tests pass (they set the flag or assert 2D path — if a 3D test now needs the flag, set `process.env.NEXT_PUBLIC_ACC_3D_GRAPH="1"` in that test's setup).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphModeFlag.ts" "app/(dashboard)/users/access-analysis/graphModeFlag.test.ts" "app/(dashboard)/users/access-analysis/GraphCanvas.tsx"
git commit -m "feat(acc-embed): park 3D canvas behind NEXT_PUBLIC_ACC_3D_GRAPH"
```

---

### Task 9: `"company"` color mode + Company default

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/nodeColors.ts`
- Modify: `app/(dashboard)/users/access-analysis/bucketedColors.ts`

- [ ] **Step 1: Read the two files to find the category extractor**

Run: `npx vitest run --reporter=dot 2>&1 | head -1; sed -n '1,120p' "app/(dashboard)/users/access-analysis/bucketedColors.ts"`
Identify the function that maps `(feature, mode) → category string` (the categorical path in `buildBucketedColors`, alongside the existing `"status"` handling that reads `accountStatus`).

- [ ] **Step 2: Write the failing test**

Add to `app/(dashboard)/users/access-analysis/bucketedColors.test.ts` (create if absent):
```typescript
import { describe, it, expect } from "vitest";
import { buildBucketedColors } from "./bucketedColors";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const f = (firmName: string): NodeFeatureSnapshot => ({
  nodeId: "u::p", nameLower: "", emailLower: "", project: "", role: "r",
  permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
  activityCountRaw: 0, lastSignInRel: "Never", permissionCoverage: "unknown",
  firmName, accountStatus: "active",
} as NodeFeatureSnapshot);

describe("company color mode", () => {
  it("buckets by firmName and produces a legend", () => {
    const r = buildBucketedColors([f("Acme"), f("Acme"), f("Globex")], "company", 12);
    const labels = r.legend.map((e) => e.label);
    expect(labels).toContain("Acme");
    expect(labels).toContain("Globex");
    expect(r.colors.length).toBe(3 * 4);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"`
Expected: FAIL — `"company"` not a valid `ColorMode` (type error) or empty legend.

- [ ] **Step 4: Register the `"company"` mode**

In `nodeColors.ts`, extend `EXTRA_COLOR_MODES` and the label map (mirrors `"status"`):
```typescript
const EXTRA_COLOR_MODES = ["company", "status"] as const;
```
```typescript
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  ...Object.fromEntries(COLORABLE_DIM_IDS.map((id) => [id, getDimension(id)!.label])),
  company: "Company",
  status: "Account status",
} as Record<ColorMode, string>;
```
And put company at the front of `COLOR_MODES` so it leads the selector:
```typescript
export const COLOR_MODES: readonly ColorMode[] = [
  "company",
  "role",
  ...COLORABLE_DIM_IDS.filter((id) => id !== "role"),
  ...EXTRA_COLOR_MODES.filter((id) => id !== "company"),
];
```

- [ ] **Step 5: Extract the company category in `bucketedColors.ts`**

In the categorical category-extractor (the switch/branch found in Step 1), add a `company` case returning the firm, mirroring the `status` case:
```typescript
    if (mode === "company") return f.firmName || "(no company)";
```
(Place it next to the existing `if (mode === "status") return f.accountStatus || ...` branch.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/nodeColors.ts" "app/(dashboard)/users/access-analysis/bucketedColors.ts" "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"
git commit -m "feat(acc-embed): add Company color mode"
```

---

### Task 10: Shell flag-off branch — load embedding, static layer, company default, no edges, no toggle

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Query the embedding alongside bulkUsers**

Near the existing `bulkUsersQuery` (line ~294), add (only meaningful when flag-off, but harmless when on):
```typescript
  const embeddingQuery = trpc.accDcGraph.instanceEmbedding.useQuery(undefined, {
    staleTime: 600_000,
    enabled: !ACC_3D_GRAPH_ENABLED,
  });
```
Import at top: `import { ACC_3D_GRAPH_ENABLED } from "./graphModeFlag";` and `import { createStaticLayer } from "./staticLayer";`.

- [ ] **Step 2: Build the static layer from embedding coords when flag-off**

In the physics-construction `useEffect` (line ~310), branch before `createPhysicsLayerWorker`:
```typescript
      if (!ACC_3D_GRAPH_ENABLED) {
        const emb = embeddingQuery.data;
        if (!emb) return; // wait for embedding to load
        const byId = new Map(emb.map((e) => [e.nodeId, e]));
        const xy = new Float32Array(nodeIds.length * 2);
        for (let i = 0; i < nodeIds.length; i++) {
          const e = byId.get(nodeIds[i]);
          xy[i * 2] = e ? e.x : 0;     // missing rows fall to origin (logged below)
          xy[i * 2 + 1] = e ? e.y : 0;
        }
        const missing = nodeIds.filter((id) => !byId.has(id)).length;
        if (missing > 0) console.warn(`[embedding] ${missing} nodes missing coords (origin fallback)`);
        const layer = createStaticLayer(nodeIds, xy);
        if (cancelled) return;
        createdPhysics = layer;
        setFeatures(snapshot);
        setCatalog(catalog);
        setPhysics(layer);
        return; // skip the worker path entirely
      }
      const layer = await createPhysicsLayerWorker(/* ...existing args... */);
```
Add `embeddingQuery.data` to the effect's dependency array.

- [ ] **Step 2b: Force 2D mode + hide the toggle when flag-off**

Change the mode state init and pass a flag to the toolbar:
```typescript
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  // flag-off: there is no 3D path, so the toggle is hidden (Toolbar reads show3DToggle).
```
Pass `show3DToggle={ACC_3D_GRAPH_ENABLED}` into `<Toolbar .../>` and, in `Toolbar.tsx`, render the 2D/3D buttons only when `show3DToggle` is true (default the prop to `false`).

- [ ] **Step 3: Default color to Company when flag-off**

Set the initial color override so the embedding map opens colored by company:
```typescript
  const [colorOverride, setColorOverride] = useState<ColorMode | null>(
    ACC_3D_GRAPH_ENABLED ? null : "company",
  );
```

- [ ] **Step 4: Suppress edges on the embedding view**

Find where links are set (the same-user edge derivation + `setLinks` call in the shell/interactions). Guard it so flag-off never builds or sets links:
```typescript
  if (ACC_3D_GRAPH_ENABLED) {
    // existing same-user edge build + handle.setLinks(...) stays here
  }
```
(When flag-off, no `setLinks`/`setLinkColors` is ever called, so cosmos renders zero links.)

- [ ] **Step 5: Typecheck + run shell-adjacent unit tests**

Run: `npx tsc --noEmit && npx vitest run "app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx" "app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx"`
Expected: tsc 0; tests green (adjust any test that assumed a physics worker on the default path to set `NEXT_PUBLIC_ACC_3D_GRAPH="1"` or to provide an embedding mock).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/Toolbar.tsx"
git commit -m "feat(acc-embed): embedding map default — static layer, company color, no edges/toggle"
```

---

### Task 11: Click → neighbor highlight + mini "closest matches" panel + profile

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/usePredicateEngine.ts`
- Modify: `app/(dashboard)/users/access-analysis/GraphInteractions.tsx`
- Create: `app/(dashboard)/users/access-analysis/NeighborMatchesPanel.tsx`
- Test: `app/(dashboard)/users/access-analysis/usePredicateEngine.test.ts` (extend or create)

- [ ] **Step 1: Write the failing mask test (neighbor highlight)**

Add to `usePredicateEngine.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildMaskPredicate } from "./usePredicateEngine";

const features = [
  { nodeId: "u1::p1" }, { nodeId: "u2::p2" }, { nodeId: "u3::p3" }, { nodeId: "u4::p4" },
] as any;

describe("neighbor highlight", () => {
  it("lights the clicked node + its neighbor indices, dims the rest", () => {
    const pred = buildMaskPredicate({
      features, activeFilters: [], searchQuery: "", lassoSelection: null,
      drillDown: null, isolatedNodeIndex: 0, neighborIndices: new Set([2]),
    } as any);
    expect(pred(0)).toBe(1.0); // clicked
    expect(pred(2)).toBe(1.0); // neighbor
    expect(pred(1)).toBe(0.15); // unrelated dim
    expect(pred(3)).toBe(0.15);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/usePredicateEngine.test.ts"`
Expected: FAIL — `neighborIndices` ignored / unknown.

- [ ] **Step 3: Thread `neighborIndices` through the predicate**

In `usePredicateEngine.ts`, add `neighborIndices?: Set<number> | null` to `PredicateInputs`, and in `buildMaskPredicate`'s isolate branch (the `if (isolatedNodeIndex !== null) {...}` block) light neighbors too:
```typescript
    if (isolatedNodeIndex !== null) {
      if (i === isolatedNodeIndex) return 1.0;
      if (inputs.neighborIndices && inputs.neighborIndices.has(i)) return 1.0;
      if (isolatedUserId && parseNodeId(f.nodeId)?.userId === isolatedUserId) return 1.0;
      return 0.15;
    }
```
Add `inputs.neighborIndices` to the `usePredicateEngine` effect dependency array.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/usePredicateEngine.test.ts"`
Expected: PASS.

- [ ] **Step 5: Fetch neighbors on click + compute neighbor indices**

In `GraphInteractions.tsx` (or `ShellBody` where `isolatedNodeIndex`/`usePredicateEngine` live), when a node is clicked (`isolatedNodeIndex` set), fetch its neighbors and map to indices:
```typescript
  const clickedNodeId = isolatedNodeIndex !== null ? features[isolatedNodeIndex]?.nodeId : null;
  const neighborsQuery = trpc.accDcGraph.instanceNeighbors.useQuery(
    { nodeId: clickedNodeId ?? "" },
    { enabled: !!clickedNodeId && !ACC_3D_GRAPH_ENABLED, staleTime: 600_000 },
  );
  const indexByNodeId = useMemo(() => {
    const m = new Map<string, number>();
    features.forEach((f, i) => m.set(f.nodeId, i));
    return m;
  }, [features]);
  const neighborIndices = useMemo(() => {
    const s = new Set<number>();
    for (const nb of neighborsQuery.data ?? []) {
      const idx = indexByNodeId.get(nb.nodeId);
      if (idx !== undefined) s.add(idx);
    }
    return s;
  }, [neighborsQuery.data, indexByNodeId]);
```
Pass `neighborIndices` into `usePredicateEngine({ ... , neighborIndices })`.

- [ ] **Step 6: Build the mini panel**

`NeighborMatchesPanel.tsx`:
```typescript
"use client";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface NeighborMatch { nodeId: string; score: number }

export function NeighborMatchesPanel(props: {
  centerName: string;
  matches: NeighborMatch[];
  indexByNodeId: Map<string, number>;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  onOpenProfile: () => void;
  onSelectMatch: (index: number) => void;
}): React.JSX.Element | null {
  if (props.matches.length === 0) return null;
  return (
    <div data-testid="neighbor-matches" className="absolute right-3 top-16 z-10 w-64 rounded-lg border bg-card/95 p-3 text-sm shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{props.centerName}</span>
        <button onClick={props.onOpenProfile} className="text-xs text-blue-600 hover:underline">Open profile</button>
      </div>
      <div className="mb-1 text-xs text-muted-foreground">Closest matches</div>
      <ul className="space-y-1">
        {props.matches.map((m) => {
          const idx = props.indexByNodeId.get(m.nodeId);
          const f = idx !== undefined ? props.features[idx] : undefined;
          return (
            <li key={m.nodeId}>
              <button
                disabled={idx === undefined}
                onClick={() => idx !== undefined && props.onSelectMatch(idx)}
                className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-accent"
              >
                <span className="truncate">{f ? `${f.userName ?? f.nodeId} · ${f.project}` : m.nodeId}</span>
                <span className="text-xs text-muted-foreground">{(m.score * 100).toFixed(0)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Render the panel in the shell (flag-off only)**

In `ShellBody`, when `isolatedNodeIndex !== null && !ACC_3D_GRAPH_ENABLED`, render:
```typescript
        <NeighborMatchesPanel
          centerName={features[isolatedNodeIndex]?.userName ?? "Selected"}
          matches={neighborsQuery.data ?? []}
          indexByNodeId={indexByNodeId}
          features={features}
          onOpenProfile={() => setProfileOpenFor(features[isolatedNodeIndex].nodeId)}
          onSelectMatch={(idx) => setIsolated(idx)}
        />
```
Wire `onOpenProfile` to the existing profile-opening mechanism (the same `UserProfilePanel` trigger used by the current click→profile flow — reuse whatever state opens it; do NOT add a second profile component).

- [ ] **Step 8: Typecheck + run interaction tests**

Run: `npx tsc --noEmit && npx vitest run "app/(dashboard)/users/access-analysis/usePredicateEngine.test.ts" "app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx"`
Expected: tsc 0; tests green.

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/usePredicateEngine.ts" "app/(dashboard)/users/access-analysis/GraphInteractions.tsx" "app/(dashboard)/users/access-analysis/NeighborMatchesPanel.tsx" "app/(dashboard)/users/access-analysis/usePredicateEngine.test.ts"
git commit -m "feat(acc-embed): click → neighbor highlight + closest-matches panel + profile"
```

---

## Phase 4 — End-to-end verification

### Task 12: e2e smoke for the no-edges 2D embedding map

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts`

- [ ] **Step 1: Add the smoke assertions**

Add a test that loads `/users/spatial-graph` (flag-off default), waits for the graph canvas, and asserts: (a) the graph legend renders (`[data-testid="graph-legend"]`), (b) the 2D/3D toggle is NOT present, (c) cosmos reports zero links via the test bridge, (d) clicking a node reveals `[data-testid="neighbor-matches"]`.
```typescript
test("embedding map: no edges, no 3D toggle, click reveals matches", async ({ page }) => {
  await page.goto("/users/spatial-graph");
  await page.waitForSelector('[data-testid="graph-legend"]', { timeout: 60_000 });
  await expect(page.getByTestId("toolbar-mode-3d")).toHaveCount(0);
  const linkCount = await page.evaluate(() => (window as any).__ACC_GRAPH_TEST__?.getRenderState?.()?.linkCount ?? 0);
  expect(linkCount).toBe(0);
  // click roughly center of the canvas to hit a dense node
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: 200, y: 200 } });
  await expect(page.getByTestId("neighbor-matches")).toBeVisible({ timeout: 10_000 });
});
```
(Use the existing test-bridge accessor name from `graphTestBridge.ts`/`GraphCanvas2D.getRenderState`; adjust `toolbar-mode-3d` to the real toggle test id found in `Toolbar.tsx`.)

- [ ] **Step 2: Run the e2e (idle machine, port 3100)**

Run: `npm run test:e2e -- acc-dc-graph.spec.ts`
Expected: the new test passes (per the ACC graph e2e setup: `:3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST`, minted NextAuth cookie). Pre-populate `AccInstanceEmbedding` first (Task 4 Step 6) or the map has no coords.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git commit -m "test(acc-embed): e2e smoke for no-edge 2D embedding map"
```

---

### Task 13: Full-suite gates + owner UAT build

- [ ] **Step 1: Run the gates**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 0 errors; full unit suite green.

- [ ] **Step 2: Build + restart for owner UAT**

Owner action (do NOT `npm run build` under a running :3000 — it 500s the live app; stop it first):
```bash
npm run build
# restart the Task Scheduler "start-local" app
```
Then open `/users/spatial-graph` and compare to `LOOK AND FEEL 2.gif`.

- [ ] **Step 3: Tune at UAT (no commit unless changed)**

If clusters are project-dominated → confirm `instanceFeatureTokens` excludes project (it does) and consider down-weighting company too. If blobs are too tight/loose → adjust UMAP `n_neighbors` (15→30 looser global, →5 tighter local) and `min_dist` (0.1→0.0 tighter blobs) in `compute_instance_embeddings.py`, rerun Task 4 Step 6, rebuild.

---

## Self-Review

**Spec coverage:**
- D1 per-instance dots → Tasks 2–4 (per-instance tokens, 16,942 rows). ✓
- D2 replace 3D as default + flag → Tasks 8, 10. ✓
- D3 click = highlight + panel + profile → Task 11. ✓
- D4 Python offline compute → Tasks 3–5. ✓
- D5 project down-weight → Task 2 (project token excluded), Task 13 tuning. ✓
- D6 Company default + Role second → Tasks 9, 10. ✓
- §5 data flow (sync → table → route → render) → Tasks 1, 4, 5, 6, 10. ✓
- §6.2 raw-SQL table (no prisma migrate) → Task 1. ✓
- §7 flag-off must not boot physics worker or mount 3D → Tasks 7 (static layer), 8 (gate mount), 10 (skip worker). ✓
- §6.5 interactions (hover/color/zoom retained) → unchanged pipeline via static layer; Task 10/11. ✓
- §8 testing (python fixture, frontend units, e2e) → Tasks 4, 7, 9, 11, 12. ✓
- §9 rollout → Task 13. ✓

**Placeholder scan:** Steps that require reading the real symbol name (bucketedColors category extractor — Task 9 Step 1; Toolbar toggle test id — Task 12) are explicit *read-then-edit* steps with the concrete edit shown, not placeholders. No "TODO/TBD".

**Type consistency:** `PhysicsLayer` interface methods in Task 7 match `physicsLayer.ts` (alphaMask/maskVersion/positionsVersion/frozen/updateSliders/setMask/setActiveInput/getPositions/getTargets/getDimWeights/getSliders/syncPositions/dispose). `instanceFeatureTokens(f)` (Task 2) is consumed in Task 3. `createStaticLayer(nodeIds, xy)` (Task 7) is consumed in Task 10. `instanceEmbedding`/`instanceNeighbors` (Task 6) are consumed in Tasks 10/11. `ColorMode "company"` (Task 9) is consumed in Task 10. Consistent.

**Risk note for executor:** Task 10 Step 4 ("find where links are set") and Task 11 Step 7 ("reuse the profile trigger") require locating the exact current wiring in `AccessAnalysisShell`/`ShellBody`/`GraphInteractions` before editing — read those files first; the edits shown are the shape, the surrounding names must match the live code.
