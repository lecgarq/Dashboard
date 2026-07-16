---
lecg_state_version: 2
milestone: v2.5
milestone_name: "Living Graph"
current_phase: 31
current_phase_name: "Click & Hover Choreography"
status: executing
current_plan: null
stopped_at: "Phase 31 implementation complete: 31-01 and 31-02 summarized. Running phase completion audit, full gates, isolated browser verification, deploy, and advance."
last_updated: "2026-07-16T13:12:00-06:00"
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-16)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.5 Living Graph (opened 2026-07-16) — embedding fidelity (hybrid
feature vector + UMAP), similarity intelligence (de-twinned, explained neighbors), living
UI (full ambient motion + click/hover choreography + expressive links), and the two carried
perf items (app-wide SSR-hydration fix, shell-chunk code-split).

## Current Position

- **Milestone:** v2.5 — **Living Graph.** Opened + roadmapped 2026-07-16. **5 phases
  (29–33)**, 16 requirements (EMB-01–06, SIM-01–03, LIFE-01–05, PERF-05–06), 16/16 mapped.
  Phase numbering continues from v2.4's Phase 28.
- **Phase:** 31 — Click & Hover Choreography — **implementation complete,
  verification in progress** (`31-01` and `31-02` summarized).
- **Phase 30 SHIPPED 2026-07-16** (4/4 plans, `30-VERIFICATION.md`, deployed
  BUILD_ID `SkA5J8kUu0LgER4NcyiJr`): `neighbors` Json is now the v2 structured
  payload `{v:2, matches:[{nodeId, score, why[≤3]}], twins:{count, ids[≤10]}}` —
  k=10 DISTINCT matches via kNN over exact-vector twin-group representatives;
  `instanceNeighbors` returns the typed normalized shape (old bare-array rows
  tolerated via `lib/acc/embedding/neighborPayload.ts`); panel shows twin chip +
  why chips (labels/values/coverage resolved client-side in `whySimilar.ts`);
  `similarityEdges` built from matches only, `interReserveFrac=0.4`/18k KEPT with
  recorded evidence. Live run `20260716T182623Z-e6fab986` (22,279 rows, trust
  0.9598 PASS, twin groups max 313 / p95 2). Commits: 2467f0a9, 6d52e7e9,
  9666da74, eef5eaa9.
  **Phase 31 planners note:** panel is content-complete and chrome-modest by
  design — LIFE-04's animated reveal wraps it without content rework; neighbor
  lighting should light `matches` only (twins are position clumps, not lit).
- **Phase 31 CONTEXT LOCKED 2026-07-16:** native Cosmos focus at ~2.25× / 180ms
  with exact pre-focus view restore; focus set is selected + ten distinct matches
  only (no twins or same-user footprint); floating matches card becomes one
  matches-first profile rail; hover incident edges temporarily render above the
  persistent click selection and an ~80ms tier/recency/breadth tooltip.
- **Phase 31 PLANNED 2026-07-16:** `31-01` delivers LIFE-01/LIFE-02 through the
  existing frozen Cosmos handle + Canvas2D overlay; `31-02` moves the complete
  Phase-30 match evidence into the existing profile rail for LIFE-04. No new
  renderer, fetch, dependency, scrape, or data contract.
- **Phase 31-01 COMPLETE 2026-07-16:** exact camera snapshot/focus/restore,
  selected+matches-only mask, selected/hovered Canvas2D edge priority with
  missing-match fallback, and 80ms truthful tier/recency/breadth tooltip.
  Focused gate: 47 tests + tsc clean.
- **Phase 31-02 COMPLETE 2026-07-16:** floating card removed; one identity
  header + closest matches/twins/why evidence + existing ACC body now share the
  right rail. Honest loading/empty/error states; one concurrent 180ms rail
  transition with reduced-motion duration 0. Focused gate: 30 tests + tsc +
  impeccable zero findings.
- **Next:** `/lecg-phase 31`.
- **Prior milestone:** v2.4 Spatial Graph Dimensions SHIPPED 2026-07-16 (18/18, deployed
  BUILD_ID `KeTX6mq25E1sa0vgA-Pnn`); retrospective in `MILESTONES.md`, archive in
  `.planning/milestones/v2.4-*`.

### v2.5 phase map (29–33)

| Phase | Goal | Requirements |
|---|---|---|
| **29** Embedding v2 — Feature Fidelity & UMAP | Full-feature hybrid vector, magnitude-aware, UMAP projection, quality-gated old-vs-new, recomputed live | EMB-01–06 |
| **30** Similarity Intelligence | kNN on the enriched vector, twin-saturation fixed, per-match "why similar" explanations, web rebuilt | SIM-01–03 |
| **31** Click & Hover Choreography | Camera-ease focus, neighbor lighting, enriched animated panel, hover edge emphasis + headline tooltip | LIFE-01, LIFE-02, LIFE-04 |
| **32** Ambient Life & Link Expression | Full ambient recency-modulated motion behind a hard ≥50fps gate + degradation rule; intentional link strength/hover/morph rendering | LIFE-03, LIFE-05 |
| **33** Perf Closeout & Verification | SSR-hydration fixed at the shared boundary (3 call sites), shell chunk code-split, time-to-graph re-measured vs 28.1 median | PERF-05, PERF-06 |

**Locked sequencing (do not re-order without re-deciding):**

- **Phase 29 strictly precedes 30** — neighbors computed on the old TF-IDF matrix would be
  thrown away the moment the vector changes.
- **Phase 30 precedes 31** — the click choreography lights the *new* neighbor sets and the
  panel integrates SIM-02's explanations; building it on twin-saturated lists wastes the work.
- **Phase 33 measures LAST** — same baseline-then-verify discipline as v2.4 (Phase 24 → 28).

### v2.5 scope decisions (owner, 2026-07-16)

| Decision | Chosen |
|---|---|
| Projection | **PaCMAP** (amended from UMAP at the Phase-29 discussion 2026-07-16 — `pacmap` + faiss-cpu, the milestone's only dependency change, offline python pipeline only). Fixed seed, small-N fallback kept. |
| Ambient motion | **Full ambient** — every node carries recency-modulated life at rest. Owner chose over the recommended "subtle". Safety net: hard ≥50fps gate at ~22k nodes + mandated auto-degradation rule (LIFE-03), reduced-motion → static. |
| Perf debt | **Both folded in** — PERF-05 app-wide SSR-hydration fix (layout.tsx + users/page.tsx via shared helper + test), PERF-06 shell-chunk code-split + re-measure vs 28.1 median 4,360 ms. |
| Phases | 5 (29–33) approved as proposed. |

### v2.5 grounding facts (verified from source, 2026-07-16)

Load-bearing findings from the milestone-open investigation. **Any planner/executor must
treat these as the baseline.**

- ⚠️ **NAME COLLISION (standing).** `app/(dashboard)/access-analysis/` = 23-panel charts
  page (untouched). `app/(dashboard)/users/access-analysis/` = spatial-graph shell (this
  milestone's surface). `/users/spatial-graph` and `/users/access-analysis` render the same
  UI via `spatial-graph/page.tsx` → `AccessAnalysisShellClient`.

- **Default path is flag-OFF.** `ACC_3D_GRAPH_ENABLED` is true only when
  `NEXT_PUBLIC_ACC_3D_GRAPH === "1"` (`graphModeFlag.ts:2-7`) — unset in the repo. The
  static embedding map is the live production surface; the GPU-sim/3D machinery is parked.

- **Embedding pipeline (offline):** `scripts/build-instance-features.ts` (bulkUsers →
  `buildGraphNodesFromUsers` → `instanceFeatureTokens` → `.embedding/instance-features.jsonl`)
  → `scripts/compute_instance_embeddings.py` (TF-IDF → dedupe ~87% duplicate profiles to
  ~3,000 archetypes → **t-SNE** cosine 2D → KMeans-12 → jitter-expand `JITTER_FRAC=0.012` →
  normalize to `HALF_EXTENT=1000` → cosine kNN k=10 on the FULL matrix) → upsert
  `AccInstanceEmbedding`. Wired in `scripts/dc-daily-ingest.cjs:139-146`, non-fatal.
  **The `:140` log says "features → UMAP" but the code runs t-SNE** — stale until EMB-03.

- **Token set today** (`instanceFeatureTokens.ts:10-22`): role, company, perm tier,
  `permstr:<n>`, activity bucket, recency bucket, affiliation, status, admin, `mod:<key>`
  multi-hot. **Project identity deliberately excluded** (D5 spec, comment `:6-8`).
  **Dropped from position today:** folderBreadth, accessibleDataBytes, activityTotal,
  membership tenure, riskScore, permissionCoverage, signinBucket, actionCounts/activityMix.
  Bag-of-words ⇒ all numeric magnitude discarded (`permstr:5` equidistant to `permstr:0`).

- **Storage:** `AccInstanceEmbedding` (`prisma/schema.prisma:926-934`) = `nodeId @id, x, y,
  cluster Int?, neighbors Json, embeddingRunId, updatedAt`. **No pgvector column** (the
  repo's only pgvector use is the unrelated LOD feature). Neighbors-Json payload changes are
  additive — no migration needed.

- **Client consumption:** `accDcGraph.instanceEmbedding` (`server/routers/acc-dc-graph.ts:63-69`)
  → `AccessAnalysisShell.tsx:680-692` joins into stride-2 `Float32Array` →
  `createStaticLayer(nodeIds, xy, targets, dimWeights)` (`staticLayer.ts:54-91`, frozen
  PhysicsLayer). Missing coords fall back to (0,0) + console warn.

- **Force anchors read the embedding baseline:** `staticLayer.ts:11-44` lerps embedding →
  strongest-slider anchor field with `ORGANIC_RESIDUAL=0.2`. A new embedding changes the
  morph baseline — v2.4's Group-by/slider morphs must still work (EMB-06 smoke check).

- **Similarity today:** `neighbors` = cosine kNN k=10 on the full TF-IDF matrix — lists
  saturate with score-1.0 identical-profile twins (acknowledged `acc-dc-graph.ts:94-96`).
  `similarityEdges` proc → `dedupeAndSelectClusterAware` (`lib/acc/embedding/similarityEdgeSet.ts`,
  18k edge budget, `interReserveFrac=0.4` cross-cluster reserve) →
  `SimilarityWebOverlay.tsx` (separate Canvas2D overlay, zIndex 4, quadratic beziers,
  ~30Hz, fades OUT entirely during slider morphs). `SIM_WEB_ENABLED` defaults ON flag-OFF.
  **cosmos itself draws zero links on the live path** (`AccessAnalysisShell.tsx:401-421`).

- **Interaction today:** click → `onIsolate(index)` (`GraphInteractions.tsx:126-132`) →
  `UserProfilePanel` rail (RightPanelStack precedence: user-detail > lasso > sliders) +
  `NeighborMatchesPanel` (`AccessAnalysisShell.tsx:524-543`) listing stored kNN. Hover →
  blue focus ring + `NodeTooltip` (identity fields only). Lasso → `SelectionPanel`. **No
  motion at rest, no camera ease, hard-cut panel swaps.**

- **Render contract:** cosmos.gl v3 FROZEN (`enableSimulation:false`,
  `transitionDuration:0`); node radius [2.0, 5.5] by `ACCESS_WEIGHT` (`nodeSizes.ts:8-36`);
  colors RGBA Float32Array from bucketed color-by; greyout 0.15. All motion = CPU/rAF
  `pushPositions` with settle-skip (`GraphCanvas2D.tsx:410-513`). **PERF-02 frozen-handle
  invariant (`GraphCanvas.test.ts`) must stay green through every LIFE change.**

- **Node grain:** one user × project membership (`nodeId = user_id::project_id`,
  `graphNodesFromUsers.ts`), ~22,279 nodes live (was 16,942 pre-2026-07-14 data growth —
  e2e suites still carry the old count as pre-existing drift failures).

- **cosmos.gl 3.3.0** (owner-confirmed upgrade, patched via patch-package) is the engine
  version all v2.4 invariants were re-proven against. Alpha semantics inverted vs d3
  (`getSimulationAlpha()` = 1 − progress) — version-sensitive, don't touch blind.

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below), unchanged since
  2026-06-23. v2.1–v2.4 all shipped on this baseline; v2.5 adds no new data source.

## Data Extraction — Verified 2026-06-23

Confirmed read-only against the live local PostgreSQL DB.

### Census (`scripts/count-acc-data.cjs` logic, no-SSL)

| Table / metric | Count |
|----------------|-------|
| AccProject (live API) | 1,153 |
| AccDcProject (Data Connector) | 550 |
| AccFolder | 415,908 |
| AccFolder — sized (contents crawled) | 111,308 |
| AccFolder — total files | 420,096 |
| AccFolder — total size | 3.17 TB |
| AccFolderPermission | 6,040,610 |
| AccProjectMember (live) | 14,566 |
| AccDcProjectUser | 22,835 |
| AccActivity (Data Connector events) | 1,102,030 |
| AccActivityAccds (web-session crawl) | 4,554,785 |
| Distinct projects in AccActivityAccds | 956 |
| Folder-crawl status | 975 ok / 178 inaccessible (= 1,153) |
| Activity by source | project 1,101,159 / admin 871 |
| AccDcIngestRun | 72 |

### Merge integrity (`scripts/verify-accds-merge.cjs`, partitioned mode)

All 5 assertions PASS: `accds=4,554,785 dc_backfill=41,714 dc_admin=871`; unified total
`4,597,370` == merged query `4,597,370`; backfill + account-admin rows kept; boundary
spot-check reconciles.

## Deferred Items

Carried forward at the v2.5 open (absorbed items dropped: SSR-hydration app-wide → PERF-05;
shell-chunk parse gap → PERF-06):

1. **DIM-05 project-coverage denominator** — verify whether 550/1,153 is the correct
   DC-sourced denominator before ever displaying it (`VERIFY:` in `dimensionCoverage.ts`).
2. **3 pre-existing `usePredicateEngine` Phase-25 unit failures** — banded-catalog aperture
   tests, proven pre-existing WIP (stash-and-rerun), not a regression.
3. **Tier-3 graph dims** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser` resolution
   spike) + TIME-01 temporal scrubber → v2.6 candidates.
4. **e2e drift re-baseline** — `acc-dc-graph.spec.ts` carries 14 pre-existing failures
   (node count 16,942→22,279 + physics-shell sidebar testids gone); suite can't gate until
   re-baselined. Lasso e2e 120s budget (CONCERNS §3.4) also still open.
5. **Standing:** COMPANY-GRAIN-01 (per-membership vs per-user company grain disagreement),
   ORPHAN-01 (PresetBar/SliderGroup/dimensionSearch/dimensionWeights orphans), TEST-SPLIT-01
   (CONCERNS §8.2/8.3 giant test files), MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir
   prune (20–23 still on disk), Phase-17 SPLIT-04 owner visual sign-off (test-basis-only,
   no live mount).

## Accumulated Context

### Standing guardrails (carry into every v2.5 phase)

- Commit by explicit path only — branch carries heavy unrelated WIP; check
  `git diff --cached --name-only` before every commit.
- Never `npm run build` while `:3000` serves — deploy sequence stops the
  `LECG Dashboard Local` task first (guard-bash hook DENIES violations; denials are
  intentional).
- Server-side SQL/`groupBy` for any large-table aggregate, never `findMany` + JS reduce
  (TEST-01 OOM-guard class).
- `prisma migrate dev` chokes on the pre-existing pgvector shadow-DB requirement — raw-SQL
  + `migrate resolve` is the established fallback (should be unneeded this milestone: no
  migration planned).
- Layouts organic, never a fixed grid (standing owner constraint).
- `prefers-reduced-motion` → static; interaction motion ≤200ms.
- PERF-02 frozen-handle invariant + TEST-01/02/03 stay green throughout.

### Decisions

v2.5 open decisions are recorded in `PROJECT.md` Key Decisions (UMAP, full ambient + gate,
perf fold-in) and REQUIREMENTS.md "Owner scope decisions". Prior-milestone decisions live in
`PROJECT.md` and `MILESTONES.md`.

## Next Action

**Continue `/lecg-phase 31`** with phase audit, full verification, deploy, and
advance. Phase 32 still owns ambient motion and the general
strength/width/morph link redesign.
