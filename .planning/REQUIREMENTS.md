# Requirements: LECG Dashboard — v2.5 Living Graph

**Defined:** 2026-07-16
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric
derivable from the local Prisma DB and honest about coverage.
**Source:** direct owner request 2026-07-16, scoped through a live source investigation of the
embedding pipeline, similarity machinery, and interaction surface (findings recorded in
`STATE.md` "v2.5 grounding facts").
**Prior milestone:** v2.4 Spatial Graph Dimensions (18/18 shipped) — requirements archived to
`.planning/milestones/v2.4-REQUIREMENTS.md`, retrospective in `MILESTONES.md`.

**Milestone goal:** Make the spatial graph's positions *true* — every node placed by the full
extracted feature set with magnitude-aware distances — make its similarity relationships
*intelligent* (meaningful neighbors, explained), and make the surface *alive* (ambient node
life, click/hover choreography, expressive links) without giving up the frozen-render
performance contract.

**Owner ask (verbatim, 2026-07-16):** *"I want to improve the embeddings and vectoral position
of my spatial graph to be extremely accurate with the extracted data and also the relationships
of similarities to be advanced and intelligent enough that is correctly computed. Also I want to
improve vastly the UI in terms of nodes, links, what happens when clicking a node, I want the
nodes to feel alive etc."*

**Owner scope decisions (2026-07-16):** UMAP projection (umap-learn added to the offline python
pipeline — the milestone's only dependency change, zero app-runtime impact); **full ambient**
motion level (every node carries life, perf-gated with a mandated degradation rule); both
v2.4-deferred perf items folded in (app-wide SSR-hydration miss + shell-chunk parse gap);
5 phases (29–33) approved.

---

## ⚠️ Read Before Planning

Verified from source 2026-07-16 (full detail in `STATE.md` "v2.5 grounding facts").

1. **NAME COLLISION (standing).** `app/(dashboard)/access-analysis/` is the 23-panel charts
   page. `app/(dashboard)/users/access-analysis/` is the **spatial-graph shell** this milestone
   touches. `/users/spatial-graph` and `/users/access-analysis` render the same UI.

2. **The embedding is offline, not runtime.** Positions come from
   `scripts/build-instance-features.ts` → `scripts/compute_instance_embeddings.py`
   (wired into `scripts/dc-daily-ingest.cjs:139-146`, non-fatal), stored in
   `AccInstanceEmbedding` (`prisma/schema.prisma:926-934` — plain x/y floats + `neighbors`
   Json, **no pgvector column**). The client consumes it read-only via
   `accDcGraph.instanceEmbedding` → `createStaticLayer`. Changing embedding quality means
   changing the offline pipeline and re-running it against the live DB — not the app.

3. **Today's embedding is bag-of-words.** `instanceFeatureTokens.ts:10-22` emits ~10 token
   types → TF-IDF → t-SNE. All numeric magnitude is discarded (`permstr:5` and `permstr:0`
   are equidistant tokens); ~half the computed snapshot dims never feed position
   (folderBreadth, accessibleDataBytes, activityTotal, membership tenure, riskScore,
   actionCounts); **87% of nodes are jittered clones of ~3,000 archetypes**
   (`compute_instance_embeddings.py:167`, `JITTER_FRAC=0.012`) — within-archetype spread is
   noise, not data. The ingest log's "features → UMAP" string is stale; the code runs t-SNE.

4. **Similarity = the same TF-IDF matrix.** `neighbors` is cosine kNN (k=10) computed on the
   full (non-deduped) matrix, so lists saturate with score-1.0 identical-profile twins
   (acknowledged at `acc-dc-graph.ts:94-96`). Edge set: `similarityEdgeSet.ts`
   `dedupeAndSelectClusterAware` (18k budget, 40% reserved cross-cluster). The web renders in
   `SimilarityWebOverlay.tsx` — a separate Canvas2D overlay; **cosmos itself draws zero links
   on the live path** (`AccessAnalysisShell.tsx:401-421`, `edges=[]` flag-OFF).

5. **The render contract is FROZEN.** cosmos.gl runs `enableSimulation:false`; all motion is
   CPU/rAF `pushPositions` on the static layer. The v2.4 PERF-02 frozen-handle invariant
   (`GraphCanvas.test.ts`) must stay green — ambient life must NOT start the GPU simulation
   or mutate cluster/anchor/config state. Reheat fragility is the known trap (CONCERNS §3.2,
   resolved but load-bearing).

6. **Force anchors read the embedding baseline.** `staticLayer.ts:11-44` lerps the embedding
   toward slider anchor targets (`catalogTargets`/`catalogWeights`, v2.4-revived). A new
   embedding changes the *baseline* those morphs start from — v2.4's Group-by/slider morphs
   must still work on the new coordinates.

**Overarching guardrails:** no new data source, no new Prisma table or migration
(`AccInstanceEmbedding.neighbors` is already Json — richer neighbor payloads are additive, not
schema changes). **One new offline python dependency (pacmap, + its faiss-cpu dependency; amended from
umap-learn at the Phase-29 discussion) is the only dependency change; zero new npm
dependencies.** Zinc theme preserved; no new WebGL on data surfaces (the spatial
graph already runs cosmos.gl). `prefers-reduced-motion` honored everywhere — reduced-motion
renders a static graph. Under-covered data labeled, never hidden. Existing characterization
tests (TEST-01/02/03) and the PERF-02 frozen-handle invariant stay green. `npx tsc --noEmit`
before any rebuild. Layouts stay organic — never a fixed grid (standing owner constraint).

---

## v2.5 Requirements

Each maps to exactly one roadmap phase (numbering continues from Phase 28 → **starts at
Phase 29**).

### Embedding Fidelity (EMB)

Positions must be derived from the full extracted feature set with magnitude-aware distances.
Data authority for all EMB requirements: `getCachedAccDcBulkUsers` →
`buildGraphNodesFromUsers` → `featureSnapshot.ts` (all fields already computed from existing
Prisma tables); output stored in the existing `AccInstanceEmbedding` model.

- [ ] **EMB-01**: The embedding feature vector includes the **full node-dimension set** —
      today-dropped numerics (folderBreadth, accessibleDataBytes, activityTotal, membership
      tenure, riskScore, permissionCoverage) join the existing categorical signals (role,
      company, permission tier, activity/recency/sign-in buckets, affiliation, admin,
      module signature). Every included and every deliberately-excluded dimension is listed
      with a one-line rationale (project identity stays excluded per the standing D5 spec
      unless re-decided).

- [ ] **EMB-02**: **Numeric magnitude survives into distance.** Ordinal/numeric dims are
      scaled/normalized (documented per-dimension: log-scale for bytes/counts, rank or
      min-max for bounded scores) so permissionStrength 5 is *closer* to 4 than to 0 —
      no more equidistant one-hot tokens for ordered quantities. Normalization choices are
      unit-tested at the feature-builder boundary.

- [ ] **EMB-03**: Projection is **PaCMAP** (`pacmap` PyPI package; cosine-family metric,
      fixed seed for reproducibility) replacing t-SNE; the stale "features → UMAP" ingest
      log becomes true as "features → PaCMAP". Small-N fallback (<10 unique points)
      preserved. **AMENDED 2026-07-16 (Phase-29 discussion): owner swapped the projector
      from UMAP/umap-learn to PaCMAP — see `29-CONTEXT.md`; pacmap (+ faiss-cpu) is now
      the milestone's only dependency change.**

- [ ] **EMB-04**: **Archetype collapse is measurably reduced.** With numeric features in the
      vector, the duplicate-profile rate (~87% today) is re-measured and reported by the
      pipeline; within-archetype placement reflects real numeric variation, with jitter
      retained only as a residual for still-identical profiles.

- [ ] **EMB-05**: The pipeline emits a **quantitative quality gate**: trustworthiness /
      neighbor-purity metrics (old vs new embedding, same input snapshot) recorded in the run
      output; the new embedding ships only if it beats or matches the baseline on the chosen
      metrics — the comparison is recorded evidence, not vibes.

- [ ] **EMB-06**: The recompute is **run against the live DB** and lands on the graph:
      `embeddingRunId` recorded, `dc-daily-ingest.cjs` wiring unchanged and still non-fatal,
      graph renders the new coordinates with v2.4's Group-by/slider morphs still functional
      on the new baseline (anchor-morph smoke check).

### Similarity Intelligence (SIM)

Data authority: `AccInstanceEmbedding.neighbors` (Json — richer payload is additive), feature
vectors from the EMB pipeline, snapshots already shipped to the client.

- [ ] **SIM-01**: kNN neighbors are recomputed on the **enriched vector**, and the
      duplicate-twin saturation is fixed: identical-profile twins are collapsed or tiered
      (e.g., "N identical twins" + k *distinct* meaningful matches) so a node's neighbor list
      carries information, not clones. Server proc + `NeighborMatchesPanel` consume the new
      shape.

- [ ] **SIM-02**: Every neighbor match **explains why** — a per-match shared-attribute
      breakdown (top contributing dimensions: same company, same tier, similar activity
      volume, …) rendered in `NeighborMatchesPanel`, honest about coverage (a DC-sourced
      attribute names its coverage like every v2.4 dimension label does).

- [ ] **SIM-03**: The similarity edge set is recomputed from the new neighbors with the
      cluster-aware budget retained (`dedupeAndSelectClusterAware` semantics preserved or
      deliberately re-tuned with evidence); edge strength normalization stays honest
      (min-max over the real score distribution, not a hardcoded range).

### Living Graph (LIFE)

The interaction surface. All motion ≤200ms for interaction responses, `prefers-reduced-motion`
→ static, and the PERF-02 frozen-handle invariant stays green (no GPU-sim starts, ambient
motion rides the existing CPU/rAF `pushPositions` path).

- [ ] **LIFE-01**: **Click choreography** — clicking a node eases the camera/focus to it,
      lights its neighbor set (nodes + their similarity edges emphasized), and dims
      non-neighbors; background click / Esc reverses it. Builds on the existing
      isolate → `UserProfilePanel` + `NeighborMatchesPanel` flow, replacing the current
      hard cut.

- [ ] **LIFE-02**: **Hover life** — hovering a node emphasizes its own similarity edges and
      upgrades the tooltip (`NodeTooltip`) with the node's headline dimensions (tier,
      recency, breadth) beyond the current identity fields.

- [ ] **LIFE-03**: **Full ambient motion** (owner-chosen) — every node carries subtle organic
      life at rest (drift/breathing modulated by activity recency: recently-active nodes
      visibly alive, dormant nodes stiller), driven through the existing rAF static-layer
      path. **Hard perf gate:** sustained frame rate ≥ 50 fps on the workshop machine at the
      full ~22k-node set, measured and recorded; if the gate fails, ambient intensity
      auto-degrades (fewer animated nodes / interaction-only) rather than shipping jank —
      the degradation rule is part of the requirement, not an excuse to skip the gate.

- [ ] **LIFE-04**: **Click panel enriched** — the node-click experience integrates the SIM-02
      "why similar" explanations and the profile rail into one coherent, animated reveal
      (entrance/exit within the motion budget), keeping the existing
      user-detail > lasso > sliders panel precedence.

- [ ] **LIFE-05**: **Links feel intentional** — similarity-web rendering upgrades: strength
      maps to width/opacity deliberately, a selected/hovered node's own edges render above
      the rest, and the web's behavior during slider morphs (currently: fade out entirely) is
      a designed transition rather than a disappearance.

### Performance Closeout (PERF — continues v2.4 numbering)

- [ ] **PERF-05**: The **app-wide SSR-hydration miss is fixed at the shared boundary** — a
      `deserializeHydrationState` (or equivalent) helper wraps
      `createServerSideHelpers().dehydrate()`'s superjson-wrapped state before
      `<HydrationBoundary>` for **all three** call sites (`spatial-graph/page.tsx` already
      fixed in 28.1; `app/(dashboard)/layout.tsx` + `users/page.tsx` still refetch), with a
      unit test pinning the helper so the bug class can't silently return. Root-cause record:
      MILESTONES.md v2.4 trap #2, CONCERNS §Ph28.1(1).

- [ ] **PERF-06**: The **~4s shell-chunk parse gap is reduced** — heavy static imports are
      code-split out of the `AccessAnalysisShell` chunk (CONCERNS §Ph28.1(2)); time-to-graph
      is re-measured with the Phase 24/28.1 methodology (isolated `:3100` prod build,
      median-of-5) against the 28.1 median (4,360 ms) and the delta is recorded. Target:
      measurable improvement; any regression blocks the phase.

---

## Coverage

16 requirements — EMB-01..06 → Phase 29 · SIM-01..03 → Phase 30 · LIFE-01/02/04 → Phase 31 ·
LIFE-03/05 → Phase 32 · PERF-05/06 → Phase 33. **16/16 mapped, each to exactly one phase.**

## Deferred (recorded, not planned)

- **Tier-3 graph dims** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser` resolution
  spike, unmeasured rate) + TIME-01 temporal scrubber → still deferred (v2.6 candidates).
- **DIM-05 project-coverage denominator** — verify 550/1,153 before ever displaying
  (`VERIFY:` in `dimensionCoverage.ts`).
- **pgvector live nearest-neighbor** for the graph — precomputed Json neighbors suffice at
  this scale; a vector column on `AccInstanceEmbedding` is speculative until a runtime-NN
  use case exists.
- **Standing:** COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01 (CONCERNS §8.2/8.3 — the
  `acc-dc-graph.spec.ts` suite also carries 14 pre-existing drift failures and needs a
  re-baseline before it can gate anything), MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir
  prune, 3 pre-existing `usePredicateEngine` unit fails.
