# Phase 29: Embedding v2 — Feature Fidelity & PaCMAP - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

> **⚠️ EMB-03 AMENDED BY OWNER (2026-07-16, this discussion):** projection library is
> **PaCMAP (`pacmap` PyPI package)**, not UMAP/umap-learn. The milestone-open decision
> recorded in REQUIREMENTS.md/STATE.md/PROJECT.md ("UMAP, umap-learn as the only dep
> change") is superseded: the milestone's only dependency change is now **pacmap**
> (+ its faiss-cpu dependency), still offline-python-only, still zero app-runtime impact.
> Everything else in EMB-03 stands (fixed seed, small-N fallback, stale ingest-log fix).

<domain>
## Phase Boundary

The **offline embedding pipeline** is rebuilt for feature fidelity, and its output lands
live on the graph:

1. **EMB-01/02** — `scripts/build-instance-features.ts` (+ the token/feature modules it
   imports from `app/(dashboard)/users/access-analysis/`) emits a **hybrid feature
   vector**: today's categorical tokens PLUS the six dropped numerics (folderBreadth,
   accessibleDataBytes, activityTotal, membershipAgeDays, riskScore, permissionStrength)
   with documented per-dimension normalization; permissionCoverage joins as a categorical
   token. Every included/excluded dim listed with a one-line rationale.
2. **EMB-03 (amended)** — `scripts/compute_instance_embeddings.py` projects with
   **PaCMAP** (fixed seed, small-N fallback kept); the stale `dc-daily-ingest.cjs:140`
   log line becomes true as "features → PaCMAP".
3. **EMB-04** — full ~22k-node set projected directly (dedupe-then-expand retired);
   duplicate-profile rate re-measured and reported (baseline ~87%); jitter retained only
   as residual for rows still byte-identical after numerics.
4. **EMB-05** — quantitative quality gate emitted by the pipeline run (see Decisions).
5. **EMB-06** — recompute runs against the live DB, `embeddingRunId` recorded, graph
   renders the new coordinates, v2.4 Group-by/slider anchor morphs smoke-checked on the
   new baseline.

**Out of scope:** neighbor payload shape changes, twin collapsing, "why similar"
explanations, `NeighborMatchesPanel`, `similarityEdgeSet.ts` re-tuning (all Phase 30 —
this phase MAY keep writing the current `neighbors` Json shape from the new vector, but
designs nothing new there); any interaction/motion work (Phases 31–32); PERF-05/06
(Phase 33); any Prisma schema change (none needed — `AccInstanceEmbedding` unchanged);
any npm dependency.

**⚠️ Name-collision trap (standing):** `app/(dashboard)/users/access-analysis/` is this
phase's surface (spatial-graph shell); `app/(dashboard)/access-analysis/` (23-panel
charts page) is untouched.

**⚠️ File-name trap:** the owner's amendment referenced "build_instance_embedding.py" —
no such file exists. The real files are `scripts/build-instance-features.ts` (TS feature
export) and `scripts/compute_instance_embeddings.py` (python projection). Modify those;
do not create a new script.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 29 entry + `.planning/REQUIREMENTS.md` EMB-01–06 —
  goal, 4 success criteria (SC2's "UMAP/umap-learn" wording superseded by the owner
  amendment above).
- `.planning/STATE.md` "v2.5 grounding facts" — full verified pipeline map.
- `scripts/build-instance-features.ts` — bulkUsers (`includePermissionSummary` +
  `includeActivityMix`) → `buildGraphNodesFromUsers` → `instanceFeatureTokens` →
  `.embedding/instance-features.jsonl` (`{nodeId, tokens[]}` per line).
- `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts:10-22` — today's
  token set: role, company, permTier, `permstr:<n>` (magnitude-blind one-hot),
  activity/recency buckets, affiliation, status, admin, `mod:<key>` multi-hot. Project
  identity deliberately excluded (D5 spec, comment lines 6-8).
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` (`NodeFeatureSnapshot`) —
  all six target numerics exist and are populated by the snapshot builder: `riskScore`
  (0..5 count), `membershipAgeDays` (nullable), `permissionStrength` (0..5),
  `accessibleDataBytes`, `permissionTypeSummary.folderBreadth`, `activityTotal`; plus
  `permissionCoverage` ("known"|"partial"|"unknown") and sparse
  `activityMix`/`actionCounts`.
- `scripts/compute_instance_embeddings.py` — current flow: TF-IDF → `dedupe_docs`
  (~3,000 archetypes) → t-SNE(cosine, perplexity=max(5,min(40,n//100))) on uniques →
  KMeans-12 on 2D → `expand_with_jitter(JITTER_FRAC=0.012)` → `normalize_coords`
  (HALF_EXTENT=1000) → cosine kNN k=10 on the FULL matrix → psycopg upsert with
  `embeddingRunId`. `RANDOM_STATE=42`. Small-N (<10) TruncatedSVD fallback at line 64.
  Pure functions unit-tested in `scripts/test_compute_instance_embeddings.py`.
- `scripts/dc-daily-ingest.cjs:139-146` — non-fatal wiring; line 140 log says
  "features → UMAP" (stale; becomes "features → PaCMAP").
- **Python env verified live 2026-07-16:** python 3.12.10, sklearn 1.8.0, numpy 2.3.5.
  `pacmap` NOT installed; `pip install --dry-run pacmap` resolves cleanly →
  **pacmap 0.9.1 + faiss-cpu 1.14.3** (installability confirmed, no numba conflict).
  umap-learn 0.5.11 is installed but now unused by this phase.
- `AccInstanceEmbedding` (`prisma/schema.prisma:926-934`) — nodeId @id, x, y, cluster,
  neighbors Json, embeddingRunId, updatedAt. No schema change needed.
- Consumption: `accDcGraph.instanceEmbedding` → `AccessAnalysisShell.tsx:680-692` →
  `createStaticLayer` (`staticLayer.ts:54-91`); anchors lerp from the embedding baseline
  (`staticLayer.ts:11-44`, `ORGANIC_RESIDUAL=0.2`) — new coords change the morph
  baseline, hence the EMB-06 smoke check.
- VERIFY (planner): PaCMAP 0.9.1 API — `random_state` determinism guarantee, supported
  `distance` metrics (expect "angular" as the cosine-family option), and `apply_pca`
  behavior on high-dim input. Confirm from the installed package before writing the
  projection code; do not trust memory.
- VERIFY (planner): memory shape of the hybrid matrix at ~22k rows × full vocab
  (company vocab is the big axis). Expected approach: TruncatedSVD-reduce the sparse
  hybrid matrix (~100 comps) before PaCMAP if pacmap requires dense input; measure,
  don't assume.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Offline pipeline only — zero npm deps, zero app-runtime changes beyond consuming new
  coordinates through the existing untouched path.
- `RANDOM_STATE=42` stays the single seed; `HALF_EXTENT=1000` framing kept (client
  contract expects that extent); psycopg upsert + runId format unchanged.
- Feature-builder boundary: TS emits **raw** numeric values into the jsonl
  (`{nodeId, tokens[], numerics{}}` — additive line shape); python owns normalization
  (vectorized numpy). Unit tests on BOTH sides: a TS test pinning the numeric extractor
  (nulls → explicit missing, not 0) and python tests in
  `test_compute_instance_embeddings.py` pinning each normalization (EMB-02).
- Per-dimension normalization defaults (planner documents each in-code):
  log1p + max-scale for `accessibleDataBytes`, `activityTotal`, `folderBreadth`,
  `membershipAgeDays`; linear /5 for `permissionStrength` and `riskScore` (bounded
  ordinals); nulls get a paired "missing" indicator rather than silent 0 where
  missing ≠ zero (membershipAgeDays, permissionStrength).
- Project identity stays excluded (standing D5 spec — not re-decided).
- `activityMix`/`actionCounts` sparse maps stay excluded this phase: the aggregate
  `activityTotal` + recency bucket carry the magnitude signal; per-action mix is a
  future refinement, not silently half-included.
- Ingest wiring stays non-fatal; a failed embedding build must never fail the ingest.
- Explicit-path commits; `npx tsc --noEmit` before any rebuild; TEST-01/02/03 and the
  PERF-02 frozen-handle invariant untouched-and-green.

</defaults>

<decisions>
## Implementation Decisions (owner, 2026-07-16)

### 1. Projection = PaCMAP (supersedes UMAP)
- Swap the projection in `scripts/compute_instance_embeddings.py` from t-SNE to
  **PaCMAP** (`pacmap` 0.9.1). umap-learn is NOT used. `dc-daily-ingest.cjs:140` log
  becomes "features → PaCMAP". Fixed seed; small-N (<10) SVD fallback preserved.
- REQUIREMENTS.md EMB-03 carries an amendment note; the phase directory keeps its slug.

### 2. Vector mix = balanced hybrid
- Categorical block (TF-IDF/one-hot tokens) and scaled-numeric block are **block-scaled
  to proportional aggregate weight** — numeric magnitudes and categorical identity carry
  comparable influence on distance. Nodes with the same role but wildly different data
  reach genuinely separate. The exact block-scaling factor is derived (e.g., equalize
  mean row-norms per block) and unit-pinned, not hand-tuned per demo.

### 3. Look = tight islands
- Target the current approved projector look: tight, separated cluster islands readable
  at workshop distance. PaCMAP params tuned toward local structure (n_neighbors around
  its default ~10, cosine-family metric), seed 42. Not a continuous-gradient fabric.
- KMeans-12 coloring on the 2D output stays (color == spatial group convention).

### 4. Quality gate = trustworthiness + twin rate
- Ship-gate (EMB-05), computed by the pipeline on the SAME input snapshot:
  a. `sklearn.manifold.trustworthiness` (k=10) of the new 2D vs the hybrid vector
     **≥** the old embedding's trustworthiness vs the same hybrid vector;
  b. duplicate-profile rate **drops** from the ~87% baseline (EMB-04's measurement).
- Both numbers printed in the run output and recorded in `29-VERIFICATION.md`.
  Neighbor-purity is deliberately NOT a gate (numerics legitimately separate same-role
  users; purity could block a better map). Owner eyeball on the live graph remains the
  final UAT but is not the gate.

### 5. Dedupe-then-expand retired — project the full set
- PaCMAP projects all ~22k rows directly; within-archetype placement becomes real
  numeric variation (EMB-04's ask). `dedupe_docs` survives only as the measurement tool
  for the duplicate-rate metric, and jitter survives only as a residual applied to rows
  still byte-identical after the numeric block. Pipeline runtime measured and recorded.

### Claude's Discretion
- Exact PaCMAP hyperparameter values within the tight-islands target, the SVD-reduce
  width if densification is needed, jsonl numerics field naming, the block-scaling
  derivation detail, and how the rationale table (EMB-01 included/excluded list) is
  formatted (in-code comment block vs pipeline-printed) — all within the defaults above.

</decisions>

<specifics>
## Specific Ideas

- The visible deliverable is the map itself: same controls, new truth. The workshop
  story upgrades from "clusters of identical token profiles" to "position encodes how
  much each person can actually reach and how alive they are".
- EMB-06 smoke check is load-bearing, not ceremonial: `staticLayer.ts` anchors lerp
  FROM the embedding baseline, so a new map that breaks Group-by/slider morphs is a
  phase failure even if the projection metrics pass.

</specifics>

<workshop>
## Workshop Impact

- Surface: `/users/spatial-graph` (and its `/users/access-analysis` alias) — positions
  only; controls, panels, edges unchanged this phase.
- Presenter gains: honest answer to "why is this node here?" — position now reflects
  permission strength, folder breadth, data reach, tenure, activity volume and risk,
  not just categorical membership; the 87%-jittered-clones caveat retires.
</workshop>

<data_truth>
## Data Truthfulness

- No new data source; every feature comes from the already-computed
  `NodeFeatureSnapshot` (bulkUsers → `buildGraphNodesFromUsers`).
- Missing numerics (null tenure, unknown permission strength) are encoded as explicit
  missing indicators, never silently coerced to 0.
- The duplicate-rate and trustworthiness comparison are recorded evidence in the run
  output — the "better map" claim is measured, not asserted.
- `permissionCoverage` ("known"/"partial"/"unknown") enters the vector, keeping crawl
  coverage part of the similarity definition rather than hidden.
</data_truth>

<deferred>
## Deferred Ideas

- `activityMix`/`actionCounts` per-action distribution as vector features — deferred
  (aggregate `activityTotal` + recency carry the signal this phase); candidate for a
  future embedding refinement.
- umap-learn (installed, now unused) — leave installed; no cleanup task.
</deferred>

<verification>
## Verification Expectations

- `scripts/test_compute_instance_embeddings.py` extended: normalization functions,
  block scaling, PaCMAP-path shape/finiteness, small-N fallback — all seeded/pure.
- TS-side unit test for the numeric extractor at the feature-builder boundary (EMB-02).
- Full pipeline run against the live DB: `embeddingRunId` recorded; duplicate-rate
  before/after + trustworthiness old-vs-new printed and copied into
  `29-VERIFICATION.md`; pipeline runtime noted.
- `npx tsc --noEmit` clean; ingest wiring still non-fatal (failure-path eyeball).
- Live graph check on the new coordinates + **anchor-morph smoke check** (Group-by /
  slider morph still functions on the new baseline) — PERF-02 frozen-handle invariant
  (`GraphCanvas.test.ts`) green.
- TEST-01/02/03 untouched and green.
</verification>

---

*Phase: 29-embedding-v2-feature-fidelity*
*Context gathered: 2026-07-16*
