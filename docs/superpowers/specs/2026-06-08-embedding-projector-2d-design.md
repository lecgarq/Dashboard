# Embedding Projector 2D — Design Spec

- **Date:** 2026-06-08
- **Status:** Approved (owner), ready for implementation plan
- **Route affected:** `/users/spatial-graph`
- **Branch:** `feat/access-analysis-redesign`

---

## 1. Problem

The current `/users/spatial-graph` view (see `docs/superpowers/assets/problem.mov`) renders the access graph as a
**3D force-directed ball** (`GraphCanvas3D.tsx`, three.js + `d3-force-3d` via
`physicsLayerWorker`). It has two fatal problems:

1. **Wrong look.** The owner wants the **TensorFlow Embedding Projector** aesthetic
   (`docs/superpowers/assets/LOOK AND FEEL 2.gif`): a flat 2D similarity scatter where similar items land near
   each other, crisp separated clusters, color-by-label legend, **no edges**, zoom-to-detail,
   click-to-see-nearest-neighbors. A 3D force layout *always* projects to a filled sphere —
   depth overlap destroys the whitespace and community separation that make the reference
   readable.
2. **Lag.** ~13k same-user chain edges (`sameUserEdges.ts`) are drawn as full-opacity
   `LineSegments`. Transparent-edge **GPU overdraw** is the dominant frame cost, plus per-tick
   17k matrix writes + 13k edge-position rewrites.

**Root cause of the look mismatch (load-bearing):** *no code in the repo projects the data to
2D.* The existing embedding pipeline (`lib/acc/embedding/`) builds per-person TF-IDF vectors
(`tfidf.ts`) and cosine kNN (`cosineGraph.ts`), but the layout step
(`packedLayout.ts` / `packedLayout3D.ts`) **k-means clusters then phyllotaxis-packs nodes into
discs/balls** — it never runs a dimensionality-reduction projection. A node's position = its
cluster + its size-rank spiral slot; the high-dimensional similarity is discarded. This is
exactly why the 2026-06-05 projector UAT was rejected (nodes hidden in packed discs,
preset-cluster color, no per-node click).

## 2. Goal

Replace the 3D force-ball with a **2D similarity-embedding map** of the existing
(person, project) instances, computed by a real dimensionality-reduction projection (UMAP/t-SNE),
rendered as a static no-edge scatter, with click-to-explore-neighbors. Match the look and the
zero-lag feel of `docs/superpowers/assets/LOOK AND FEEL 2.gif`.

**No rendering-framework change.** `cosmos.gl` (`GraphCanvas2D.tsx`) is already integrated and
renders a 16,942-point static scatter at 60fps; with no edges there is no overdraw and no lag.

## 3. Decisions (owner-approved)

| # | Decision | Choice |
|---|----------|--------|
| D1 | What a dot represents | **A (person, project) instance** — 16,942 dots (same node set as today). |
| D2 | Replace or coexist | **Replace as default.** 2D embedding map is the only default view. The existing 3D physics graph is **parked dormant behind a build-time flag** (`NEXT_PUBLIC_ACC_3D_GRAPH=1`) — kept in the repo, not deleted, to preserve the 11-commit 3D investment and future raw-3D-exploration optionality. |
| D3 | Click action | **Both** — highlight most-similar dots + mini "closest matches" panel, with a button/double-click to open the full person profile. |
| D4 | Where computed | **Ahead of time in Python** (UMAP/t-SNE via `umap-learn`/`scikit-learn`) during the daily sync; results saved to Postgres; the page reads finished coordinates. |
| D5 | Project-identity weight | **Down-weighted.** Clusters form by *access pattern*, not raw project membership. Color-by-project still reveals project distribution. |
| D6 | Default color dimension | **Company** (reveals internal staff vs external vendors vs consultants). Role is the second selector option. |

## 4. Non-goals (YAGNI)

- No per-person (3,367) aggregation mode — per-instance only (D1).
- 3D mode is not in the default path and the default UI has no 2D/3D toggle; the 3D physics graph is retained dormant behind `NEXT_PUBLIC_ACC_3D_GRAPH=1` (D2), not built upon in v1.
- No same-user edges, no edges of any kind in v1.
- No live/in-browser projection — offline only (D4).
- No bookmarks/isolate-101/search-by-label parity with the reference UI beyond what already
  exists (existing search + lasso stay; nothing new added there in v1).
- No expansion to all 1,152 projects — scope stays at the 428 DC-extractable projects /
  16,942 instances already loaded.

## 5. Architecture & data flow

```
Daily sync (scripts/dc-daily-ingest.cjs, after DC ingest)
   │  (replaces / sits beside the existing execSync rebuild hook, line ~106)
   ▼
[NEW] scripts/build_instance_embedding.py
   1. Read instances + access attributes from local Postgres
   2. Build per-instance feature matrix (TF-IDF weighted, project down-weighted)
   3. UMAP (or t-SNE/PCA fallback) → 2D (x, y) per instance
   4. Cosine NearestNeighbors → top-K similar instances + distances
   5. Upsert AccInstanceEmbedding (one row per instance)
   ▼
Postgres: AccInstanceEmbedding { nodeId, x, y, neighbors[], embeddingRunId }
   ▼
Server route / tRPC (admin-gated) → ships coords + neighbors to client
   ▼
/users/spatial-graph
   AccessAnalysisShell feeds coords (static) into GraphCanvas2D (cosmos.gl)
   → no edges → instant, zero-lag scatter
```

The expensive math runs **once per sync**, never in the browser.

## 6. Components

### 6.1 Python embedding script — `scripts/build_instance_embedding.py` (NEW)

- **Invocation:** from `dc-daily-ingest.cjs` via `execSync('python scripts/build_instance_embedding.py', { stdio: 'inherit' })` after ingest completes, mirroring the existing `rebuild-person-graph.ts` hook. Guarded so an embedding failure does not abort the ingest (log + continue).
- **DB access:** `psycopg` (or `psycopg2`) to local Postgres (trust auth, localhost — see local-PG migration notes).
- **Inputs (one row per instance, keyed by `nodeId = userId::projectId`):** the same access
  signals the client already derives in `featureSnapshot.ts`, read from the
  `GRAPH_ANALYTICS_SOURCE_TABLES` source tables: role on project, company, module signature
  (non-baseline product keys), permission tier, activity bucket (action counts), folder
  footprint, internal/external affiliation, status, activity-recency bucket, admin flag.
- **Vectorization:** one-hot categorical + multi-hot module signature + ordinal permission +
  bucketed numerics, **TF-IDF weighted** (`sklearn.feature_extraction.text.TfidfTransformer`
  or equivalent) so rare signals carry more weight — no hand-tuning. **Project identity
  down-weighted** per D5 (either excluded from the vector or scaled by a small factor; raw
  project id must not dominate variance).
- **Projection:** **UMAP** (`umap-learn`, cosine metric) → 2D. Rationale: same separated-blob
  look as t-SNE but preserves global structure and runs on 17k points in seconds. **PCA**
  (`sklearn`) is the zero-extra-dependency fallback for a first light; **t-SNE** available as an
  alternative if owner wants tighter blobs. Output normalized into a fixed coordinate box for
  stable framing.
- **Neighbors:** `sklearn.neighbors.NearestNeighbors(metric='cosine')` → top-K (e.g. K=10) per
  instance with distances, for the click-to-explore panel. (Mirrors `cosineGraph.ts` but
  per-instance.)
- **Determinism:** fixed `random_state`/seed so reruns on identical data are stable. Stamp each
  run with an `embeddingRunId` (timestamp or uuid generated by the script).
- **Output:** upsert all 16,942 rows; assert every instance gets finite (x, y) and at least one
  neighbor (or explicit empty for singletons).

### 6.2 Storage — `AccInstanceEmbedding` table (NEW)

- Columns: `nodeId TEXT PK`, `x REAL`, `y REAL`, `neighbors JSONB` (`[{nodeId, score}]`),
  `embeddingRunId TEXT`, `updatedAt TIMESTAMPTZ`.
- **Migration note:** `prisma migrate` is known-broken on this DB (pgvector). Add the table via
  **raw SQL `CREATE TABLE`** + `prisma db pull` / manual schema reconcile, matching the approach
  used for prior raw `ALTER`s. Do **not** run a full `prisma migrate dev`.

### 6.3 Data access — server route / tRPC (extend existing)

- Admin-gated read that returns `{ nodeId, x, y }[]` (+ a neighbors lookup) in cosmos
  index order for the current node set. Prefer extending the existing access-analysis data
  loader rather than a brand-new endpoint. Hydration-key shape must match the client's expected
  prefetch shape (avoid the cache-miss refetch class of bug seen previously).

### 6.4 Frontend — `AccessAnalysisShell.tsx` + `GraphCanvas2D.tsx`

- **Position source swap:** instead of building a `createPhysicsLayerWorker` and pumping
  simulated positions, load the precomputed embedding coords and push them **once** (static)
  into `GraphCanvas2D` (cosmos.gl frozen mode already supports static positions via
  `pushPositions` / `setPointSet`).
- **No edges:** do not call `setLinks`/`setLinkColors`; remove the same-user edge derivation
  from this view's load path.
- **Color:** reuse `buildBucketedColors(features, colorMode, 12)`; default `colorMode` =
  **Company** (D6); keep the selector (Role second). Top-12 + grey "Other" legend with counts
  on the side (reuse/extend existing legend).
- **Renderer reuse:** `GraphCanvas2D` is otherwise unchanged (purity contract preserved).

### 6.5 Interactions

- **Hover** → existing tooltip (person + project).
- **Click** → mask bus highlights the clicked dot's top-K neighbors, dims the rest (reuse the
  existing alpha-mask path — `physics.setMask` equivalent, now driven by the neighbors lookup
  rather than a filter predicate), and opens a **mini "closest matches" panel** listing the
  neighbors + similarity scores. A panel **"Open profile"** button (and/or double-click) opens
  the existing `UserProfilePanel`.
- **Color-by selector + legend**, **zoom/pan**, **search**, **lasso** — unchanged, retained.

## 7. Default-path changes (3D parked behind a flag, not deleted)

The 3D physics graph stays in the repo, dormant, behind a build-time flag
`NEXT_PUBLIC_ACC_3D_GRAPH` (default unset/off). All 3D code is **retained**, not removed.

**Flag OFF (default — what every user sees):**
- The view loads the embedding-fed 2D map only. `GraphCanvas3D` is **not mounted**, the
  `d3-force-3d` physics layer is **not constructed**, and **no edges** are derived
  (`sameUserEdges.ts` is not on this path). No 2D/3D toggle is shown.

**Flag ON (`NEXT_PUBLIC_ACC_3D_GRAPH=1` — dormant escape hatch):**
- Restores today's behavior exactly: the 2D/3D `mode` toggle, `GraphCanvas3D`, the
  `physicsLayerWorker` position source, and same-user edges — unchanged.

**Implementation shape:** the shell branches on the flag at the top of the load path. The two
paths must not both run (flag-off must not boot the physics worker or mount the three.js
canvas — that is the whole point of removing the lag). `GraphCanvas2D` is shared by both
paths; only its *position source* differs (embedding coords vs physics).

> Flag-off deletes the lag source (edge overdraw) and the hairball from the default experience
> while keeping the 3D path one env var away.

## 8. Testing

- **Python:** a fixture test (small known feature matrix → stable 2D + neighbors under fixed
  seed); an integration assertion that a full run produces finite (x, y) for all 16,942
  instances and writes the expected row count.
- **Frontend (vitest):** neighbor-highlight mask builder (clicked node → correct highlighted
  index set); Company-default color + legend counts; position-feed wiring (static coords reach
  the cosmos handle).
- **e2e:** update the existing graph smoke (`acc-dc-graph.spec.ts` family) for the no-edges 2D
  map: nodes present, no link geometry, click highlights a neighbor set, color legend renders.
- **Gates:** `tsc --noEmit` clean; full unit suite green; e2e on idle machine.

## 9. Rollout / how the owner sees it

1. Implement Python step + table + frontend swap behind the existing default (2D).
2. Run `python scripts/build_instance_embedding.py` on real data to populate the table.
3. `npm run build` + restart (note: do **not** build under a running :3000 — it 500s the live app).
4. Owner opens `/users/spatial-graph`, eyeballs against `docs/superpowers/assets/LOOK AND FEEL 2.gif`.
5. Tune projection params (UMAP `n_neighbors`/`min_dist`), project down-weight factor, and color
   defaults from there.

## 10. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `umap-learn` install friction on owner's Python | PCA fallback (sklearn only) ships first-light; UMAP added once install is confirmed. |
| Project identity dominates clusters despite down-weight | Tunable weight; verify via color-by-project (should be mixed, not one-project-per-blob). |
| Embedding run is slow / blocks ingest | Run after ingest, failure-isolated (log + continue); cache results; only reruns on new sync. |
| Prisma migrate breaks on pgvector | Raw `CREATE TABLE` + manual schema reconcile (known recipe). |
| Hydration-key mismatch → redundant refetch | Match prefetch shape exactly (prior bug class). |
| Stale coords vs current node set | Embedding keyed by `nodeId`; client joins by `nodeId`; instances without a row fall back to a neutral position or are excluded (decide in plan). |

## 11. Reuse map

| Reused as-is | New |
|--------------|-----|
| `GraphCanvas2D.tsx` (cosmos.gl renderer) | `scripts/build_instance_embedding.py` |
| `buildBucketedColors` + color-by selector + legend | `AccInstanceEmbedding` table + read route |
| `featureSnapshot.ts` signal definitions (mirrored in Python) | Per-instance feature vectorization (Python) |
| alpha-mask / highlight bus | neighbor-highlight + "closest matches" panel |
| `UserProfilePanel`, search, lasso, zoom | position-feed swap in `AccessAnalysisShell` |
| `dc-daily-ingest.cjs` rebuild-hook pattern | — |

## 12. Open questions for the plan

- Exact source SQL for each per-instance signal (map `featureSnapshot.ts` DuckDB reads → Postgres source tables).
- UMAP default params (`n_neighbors`, `min_dist`, `metric`) — start `15 / 0.1 / cosine`, tune at UAT.
- K for neighbors (default 10).
- Exact `NEXT_PUBLIC_ACC_3D_GRAPH` branch point in the shell so flag-off never boots the
  physics worker or mounts `GraphCanvas3D` (the two paths must be mutually exclusive at load).
