# Access Graph — Similarity Embedding & Packed-Cluster Layout

**Date:** 2026-06-03
**Branch:** `feat/access-analysis-redesign`
**Status:** Design — validated end-to-end on production data via throwaway prototype (`.superpowers/brainstorm/56003-1780523182/`)

---

## 1. Problem

The current access graph (`/users/spatial-graph`, `/users/access-analysis`) renders as a **hub-and-spoke "star"**: hidden project/role hub nodes with users link-attached, producing radial spokes (`accGraphOrganicLayout.worker.ts`). It does not communicate *who is similar to whom*.

The owner wants the look & feel of three references: organic community blobs, the TensorFlow **embedding-projector** (t-SNE on MNIST), and a *Nature*-style **packed-circle cluster** diagram. The chosen direction is **packed circular similarity clusters** with breathing space and faint, explainable edges.

Critically, the owner requires that **placement be driven by a true vector embedding of every available signal — "vectorized like a RAG does" — with no hand-guessed weights and nothing skipped.**

## 2. Goals

- Replace the star layout with **packed circular clusters** of people grouped by access similarity (breathing space, no overlap).
- Compute similarity as **cosine over a per-person TF-IDF embedding** built from *all* relevant DB signals; weights derived by IDF, not by hand.
- Draw **faint, tiered edges** (3 data-derived levels) where each edge can explain *why* two people are similar.
- **Precompute server-side** on each Data Connector ingest and cache; client renders instantly.
- Interactivity v1: **live cluster-count slider** + **hover-edge-reason** (owner-selected).

## 3. Non-goals (v1)

- Color-by toggle (cluster/internal-external/tier), search-to-zoom, click-to-isolate — deferred (designed-for, not built).
- A weight/emphasis control ("group by folder-permission vs activity") — deferred; TF-IDF fixed weighting for v1.
- Including the 724 non-DC (locked/403) projects — out of scope; they lack folder-permission & activity depth.
- Granular folder `actions`, services, folder authorship — deliberately excluded (see §9).

## 4. Data coverage (the "go deep" guarantee)

Every table in the database was enumerated and classified (`coverage.cjs`). **12 tables / 7,541,387 rows feed the embedding:**

| rows | table | contribution |
|---|---|---|
| 6,032,535 | `AccFolderPermission` | folder-permission footprint (rarity-weighted permType, via roles) |
| 989,827 | `AccActivity` | activity action-counts (TF-IDF) + recency, by `autodeskId` |
| 415,702 | `AccFolder` | data-reach = reachable `totalSizeBytes` |
| 40,194 | `AccDcProjectUserProduct` | modules + admin (`accessLevel='project_admin'`) |
| 16,942 | `AccDcProjectUser` | projects + tenure (`addedOn`) |
| 14,558 | `AccProjectMember` | executive flag |
| 13,719 | `AccDcProjectUserRole` | roles |
| 13,616 | `AccDcProjectUserCompany` | companies |
| 3,367 | `AccDcUser` | identity, status, internal/external, autodeskId map |
| 428 / 344 / 155 | `AccDcProject` / `AccDcCompany` / `AccRole` | scope + display names |

**Deliberately skipped** (redundant or unreliable, each with reason): project-level roll-ups (`AccProjectRole`, `AccDcProjectRole`, `AccDcProjectProduct`, `AccDcProjectCompany`) are covered by their person-level equivalents; `AccActivityDailyRollup` is redundant with raw activity; `AccMemberCache` is legacy; `AccDcProjectUserService` (775) overlaps modules; granular folder `actions` are redundant with `permType`; folder authorship (`lastModifiedBy`) is free-text names (matching would be guessing). The remainder are ingest/system/empty tables. The coverage script asserts **no non-empty table is left unclassified.**

## 5. Embedding pipeline (RAG-style)

Population = **3,367 people** (distinct `userId` across the 428 DC projects). One person = one node (per-project behaviour is aggregated into the person's profile; we do **not** render 16,942 instances).

**Feature construction** — each person → a sparse bag of features:
- **Categorical (presence):** `proj:<id>`, `role:<id>`, `comp:<id>`, `mod:<key>`, `adm:<key>` (admin per module), `ext:int|ext` (internal = `hermosillo.com`/`.com.mx`), `stat:<status>`, `exec:1`.
- **Counts (TF = `log1p`):** `act:<rawAction>` (activity), `perm0..perm4` (folder-permission footprint per permType rank, aggregated over the person's roles).
- **Numerics → quantile one-hot buckets** (no hand scaling): tenure, data-reach (folders), reachable bytes, activity-recency, project-count.

**Weighting = TF-IDF.** `idf = ln((N+1)/(df+1)) + 1`. Rare signals (Full-Controller grants, `delete-entity`, niche roles) automatically outweigh ubiquitous ones (View-Only, `docs`, `view-entity`). **`min_df ≥ 2`** drops singleton features that cannot create similarity (134 dropped → **906 dimensions**). Vectors are **L2-normalized**; **similarity = cosine = dot product.**

Validation: separation = mean own-cluster cosine **0.67** vs nearest-other **0.42**.

## 6. Similarity graph & edge tiers

- **Top-6 cosine kNN** per person (undirected union) → **~14,800 edges**, ~0% isolated.
- **3 tiers, derived from the actual capped-edge distribution** (not round numbers): **L1 = top 20% (cos ≥ ~0.96), L2 = next 40%, L3 = remainder.** Rendered bright→faint with low opacity (texture, not focus).
- **Edge reason**: precompute the top shared features for each edge (the dimensions contributing most to the dot product) → shown on hover, e.g. *"same 6 projects · same role · similar upload activity."*

Cosine runs high (capped p50 ≈ 0.89) because ~52% of people are single-project with standard permissions and are genuinely near-identical — the tiers reflect that reality.

## 7. Clustering & layout

- **Spherical k-means** on the L2-normalized vectors. Default **k = 8**; a **live slider** re-clusters (see §8).
- **Packed circular discs:** disc radius ∝ √(member count); discs separated by collision relaxation + a gap → guaranteed breathing space.
- **Within a disc:** phyllotaxis (sunflower) fill — deterministic, non-overlapping; **high-access members toward the center.**
- **Node size = access breadth** (log of reachable folders); **color = cluster.**
- Result on real data: clean separated discs, avg node spacing ~10.7px (vs ~3px in the failed force layout). One large (~53%) "standard-access" cluster + distinctive satellites (active uploaders, inactive externals, specific-company groups).

## 8. Architecture

**Precompute (server, on each DC ingest):**
1. `lib/acc/embedding/buildPersonEmbeddings.ts` — pull the 12 tables, build TF-IDF vectors (the prototype `embed.cjs` ported to TS).
2. `lib/acc/embedding/similarityGraph.ts` — cosine top-K, tiers, per-edge reasons.
3. `lib/acc/embedding/clusterLayout.ts` — spherical k-means + packed-disc + phyllotaxis.
4. Persist to **`AccGraphLayoutCache`** (currently empty — extend its schema to hold: `snapshotHash`, `k`, `nodes` (json: id, x, y, cluster, size), `edges` (json: a, b, tier, reason), `clusters` (json: label, color, count), `builtAt`). Precompute a **small set of k values** (e.g. 6/8/10/12/14/16) so the slider switches between cached layouts without shipping raw vectors.

**Serve:** an API route returns the cached snapshot for the requested k (defaults to 8).

**Render (client):** the existing graph canvas (`AccessAnalysisShell` / `CosmosCanvasClient`) renders the **precomputed fixed positions + edges** — no client-side number-crunching, fast load. The cluster slider swaps to the nearest precomputed-k snapshot. Hover-edge reads the precomputed reason.

This matches the established "server-aggregated, client-renders" pattern already used by the access-analysis dashboard.

## 9. Constraints & honest limitations (baked in)

- **Scope = 428 DC projects / 3,367 people.** The 724 locked (403) projects + 202 live-only people are excluded (no folder-perm/activity data).
- **No sign-in data exists** (`lastSignIn` 100% null in both DC and live). "Dormant/stale account" is inferable only from **activity recency**, and **~64% of people have zero activity** — dormancy detection is weak.
- **Folder-permission footprint covers 71%** of people (others hold roles with no recorded folder grants).
- **One ~53% "standard-access" mega-cluster** is the true shape of the data; the cluster slider lets the owner split it finer.
- **Admin** uses the DC flag (355 people); the live flag differs slightly (337) — DC wins per existing convention.

## 10. Testing

- **Unit:** pure functions — TF-IDF build (idf math, min_df drop), cosine, tiering percentiles, spherical k-means determinism, phyllotaxis non-overlap invariant, disc-packing non-overlap invariant.
- **Data/regression:** snapshot counts (N=3,367, ~906 dims, ~14.8k edges, ~0% isolated, separation > 0.6) as guardrail assertions.
- **e2e:** route renders cached snapshot; slider switches k; hover shows an edge reason. Follow existing `test:e2e` harness (`NEXT_PUBLIC_ACC_GRAPH_TEST`).

## 11. Decisions log

- Direction: **packed circular clusters** (Nature/"B"), grouped **by similarity**.
- Similarity = **RAG-style TF-IDF embedding over all signals, cosine** (owner-directed; no guessed weights).
- Node = **person**; per-project behaviour aggregated; **not** 16,942 instances.
- Internal = **hermosillo.com** only.
- Extra signals: **executive flag added**; granular folder actions / services / folder authorship **skipped** (redundant or unreliable).
- Activity attributed by **autodeskId** (not email — avoids 35% null-email loss).
- Edges: **3 data-derived tiers**, transparent; **hover = reason**.
- Clusters: default **k=8** with a **live slider**.
- Scope: **428 DC projects** (v1).

## 12. Deferred / future

- Weight-emphasis control ("group by folder-permission similarity" vs "by activity") — re-shapes the picture; TF-IDF fixed for v1.
- Color-by toggle, search-to-zoom, click-to-isolate.
- All-1,152-project scope once locked projects are unlocked.
- True t-SNE/UMAP projection as an alternative to packed discs.
