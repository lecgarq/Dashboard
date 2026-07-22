# Milestones — LECG Dashboard

## v2.7 Activity Universe (Shipped: 2026-07-22)

**Phases:** 5 (37–41) · **Requirements:** 12/12 shipped · **Span:** 2026-07-20 →
2026-07-22 · **Tag:** _local-only_

**Goal vs outcome:** Replace the 22,279-node user×project spatial graph with one node per
extracted activity event, preserve dimension-driven exploration, add time, and still pass
the workshop machine's hard ≥50 fps Tier-0 gate. **Achieved at the owner-approved L2
rung:** all 4,904,886 events stay resident and counted while a deterministic 490,489-point
far-zoom set renders. The graph now carries event and author properties, exposes eight
activity-native dimensions, supports exact-month playback, and serves a 149.7 MB binary
columnar artifact in 451 ms median. The final headed D3D11 sample held 67.225 fps for
12.004 seconds with ambient active and Tier 0 unchanged; navigation-ready median was
1,699.7 ms. The instance graph and embedding storage were retired cleanly.

**Per-requirement audit:**

| Req | Verdict | Phase | Evidence |
|---|---|---|---|
| SCALE-01 full-scale feasibility + ladder | ✅ shipped | 37 | Full 4,862,301-point render, payload, memory, and embedding probes recorded; L0/L1 failed and owner locked L2; `37-BASELINE.md`, `37-VERIFICATION.md`, `f772f5bc` |
| SCALE-02 binary payload + budget | ✅ shipped | 38 | 4,904,886-row typed-array artifact, ETag/304 route, 424 ms median vs 2,500 ms; closeout remeasure 451 ms; `38-VERIFICATION.md`, `41-VERIFICATION.md`, `19735550` |
| ACT-01 one event node at shipped rung | ✅ shipped | 39 | 4,904,886 resident / 490,489 rendered at L2 with real event columns, module colors, recency sizing, and PaCMAP layout; `39-VERIFICATION.md`, `f5514155` |
| ACT-02 author inheritance + coverage | ✅ shipped | 38 | Author sidecar uses the `mergeRoleNames` path; 94.41% resolved / 5.59% unknown, reconciled and surfaced with explicit Unknown author; `38-VERIFICATION.md`, `39-VERIFICATION.md`, `fa2502c2` |
| ACT-03 full instance-graph replacement | ✅ shipped | 39 | Both route aliases resolve to the activity surface; old payload/loaders/3D/kNN path removed, then dead instance table/model/scripts/mocks retired in Phase 41; `39-VERIFICATION.md`, `41-VERIFICATION.md`, `f805a887` + `c28cb962` |
| ACT-04 honest event interaction | ✅ shipped | 39 | Resident hover labels, on-demand event detail, `UserProfilePanel`, Unknown-author state, and rendered-subset lasso; fixture lasso green; `39-VERIFICATION.md`, `41-VERIFICATION.md`, `d1bda10d` |
| EMB-07 deterministic activity embedding | ✅ shipped | 38 | 71-dim author+event full-fit PaCMAP, seed 42, two byte-identical 4,904,886-row fits, quality gate before write, raw-SQL migration, fresh-connection durability proof; `38-VERIFICATION.md`, `eaf402cb` |
| DIM-07 activity-native dimensions | ✅ shipped | 40 | Eight descriptors, honest coverage, organic group layout, color-by, and strength controls; activity sweep 37/37; `40-VERIFICATION.md`, `6b7be17a` + `5f11dada` |
| PERF-07 GPU morph + evolved contract | ✅ shipped | 40 | Cosmos-native GPU position transitions, bounded ambient subset, and explicit may/may-not motion contract pins; final Tier-0 proof in Phase 41; `40-VERIFICATION.md`, `41-VERIFICATION.md`, `2356e659` |
| TIME-01 temporal scrubber | ✅ shipped | 41 | All/exact-month filtering, one-second playback, atomic point-set/count/legend updates, and reduced-motion static stepping; `41-VERIFICATION.md`, `f2c7bad8` |
| REND-04 hard ≥50 fps Tier-0 gate | ✅ shipped | 41 | Headed Intel D3D11, 67.225 fps over 12.004 s, ambient active, Tier 0→0, 4,904,886 resident / 490,489 rendered; `41-VERIFICATION.md`, `72a8b71d` |
| E2E-03 activity-universe harness | ✅ shipped | 41 | Deterministic 180-event fixture; route aliases, time, dimensions, reduced motion, and lasso passed 4/4 in 11.8 s on isolated production harness; `41-VERIFICATION.md`, `2eefe742` |

**Phases shipped:** 37 Scale Feasibility Spike & Fallback Ladder (2026-07-21,
BUILD_ID `LGy8KOP1nWXoeczYd5-8J`) · 38 Activity Data Pipeline & Embedding
(2026-07-21, `je7yDXXumvtzNylv874vC`) · 39 Activity Universe Swap (2026-07-21,
`8Va2aGSw6-sTC0SXkgNxO`) · 40 Dimensions & Sliders at Scale (2026-07-21,
`nisFtHzavDZXZs-Ej75XB`) · 41 Time Scrubber, Hard Gate & Closeout (2026-07-21,
`QJVfBFWLtaVk9USrIvqbD`, authenticated 4,904,886-event production probe).

**Durable traps & decisions (carry forward):**

1. Full residency is not full rendering. L2 keeps every event resident/countable while
   far-zoom rendering is deterministically decimated; the owner chose this from measured
   L0/L1 failures, not as an invisible fallback.
2. FPS evidence must be headed, forced to D3D11, and reject SwiftShader. Headless software
   raster numbers are not workshop-hardware evidence.
3. At 490k rendered points, Cosmos GPU interpolation works, but per-frame full-buffer
   target uploads do not. Bound ambient targets to 10 Hz at Tier 0 / 5 Hz at Tier 1.
4. A 149.7 MB whole-file payload is acceptable for the current single-user local service
   because ETag/304 and the 451 ms gate hold. Stream only if concurrency or memory proves it
   necessary.
5. Full-corpus PaCMAP costs about 50 minutes and 15.7 GB RSS per fit, not the spike's
   extrapolated 34 minutes / 6 GB. Psycopg writes require an explicit commit plus a fresh-
   connection proof; same-session counts can lie after a savepoint rollback.
6. Event detail depends on payload/meta/table row-order consistency. Rebuild the artifact
   after table changes; the live path returns an honest stale result instead of wrong data.
7. The scale-spike route stays behind its existing production-off flag as the smallest
   reusable regression harness. Production returned 404 with the flag off.

**Deferred items (destinations):**

- ISSUE-GRAPH-01 issue-author resolution spike + issue dimensions → v2.8 candidate.
- SVC-01 attribution refinement and DIM-05 550/1,153 denominator verification → future
  data-truth phase; DC-01/DC-02 remain externally blocked.
- Activity PaCMAP ratio/feature tuning and incremental projection → only on owner UAT or
  materially more frequent rebuilds; current full-fit is manual and quality-gated.
- Default Playwright dev harness repair → tooling phase; the isolated production harness
  remains authoritative (`CONCERNS.md` §3.9).
- Payload streaming, region-LOD spatial indexing, and artifact/meta coupling hardening →
  only when concurrency, corpus growth, or measured latency makes the present ceilings real.
- Standing COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01, MILESTONES v2.1/v2.2 backfill,
  v2.3 phase-dir prune, Phase-17 SPLIT-04 owner visual sign-off, and terrain seed debt carry.

**Archive:** [`milestones/v2.7-ROADMAP.md`](milestones/v2.7-ROADMAP.md) · [`milestones/v2.7-REQUIREMENTS.md`](milestones/v2.7-REQUIREMENTS.md)

---

## v2.6 Full-Rate Graph (Shipped: 2026-07-20)

**Phases:** 3 (34–36) · **Requirements:** 8/8 shipped · **Span:** 2026-07-20 · **Tag:** _local-only_

**Goal vs outcome:** Move the similarity web off its ~40 ms/frame main-thread Canvas2D
raster ceiling and pass the previously missed hard gate: full ambient motion plus the full
web at ≥50 fps in Tier 0 on the workshop machine, after restoring trust in the automated
gates. **Achieved outright:** the measured winner was the already-installed Cosmos native
GPU link path; the final sample held 60.016 fps for 10.014 seconds with all 22,279 nodes
animated, 18,000 links, and Tier 0 unchanged. The health sweep also re-baselined graph e2e,
closed the lasso budget and PowerShell build-guard gaps, fixed the aperture predicate bug,
and pruned 983 stale embeddings. Closeout removed a separate route bottleneck: compact
graph hydration plus on-demand rail loading reduced median time-to-graph to 2,386.7 ms,
39.0% under the strict 3,913.7 ms cutoff. Zero new dependencies or migrations.

**Per-requirement audit:**

| Req | Verdict | Phase | Evidence |
|---|---|---|---|
| REND-01 off Canvas2D raster path | ✅ shipped | 35 | Four candidates measured on 22,279 nodes / 18,000 links: Canvas2D 39.79 fps and Tier 0→2 vs Cosmos native 60.03 fps at Tier 0; `35-VERIFICATION.md`, commit `02b729f6` |
| REND-02 hard ≥50 fps Tier-0 gate | ✅ shipped | 36 | Measure-last sample 60.016 fps / 10.014 s, all 22,279 nodes animated, 18,000 links, Tier 0→0; `36-VERIFICATION.md` |
| REND-03 Phase-32 visual contract | ✅ shipped | 35 | Band/width/alpha/order, 25% morph floor, reduced motion, and frozen-Cosmos invariants pinned; focused Vitest 5 files / 54 passed plus framebuffer/browser gates; `35-VERIFICATION.md` |
| E2E-01 graph e2e re-baseline | ✅ shipped | 34 | Baseline 16 failed / 5 skipped / 6 passed → 16 passed / 8 intentional skips / 0 failed on isolated production harness; `34-VERIFICATION.md`, `c1b78647` |
| E2E-02 lasso budget flake | ✅ shipped | 34 | Inner readiness budget fixed; three consecutive flag-on passes at 44.7 s / 37.6 s / 37.9 s; `34-VERIFICATION.md`, `c1b78647` |
| TEST-04 fully green unit suite | ✅ shipped | 34 | Aperture resolver fixed at the shared id-space boundary; 2,629 tests passed / 0 failed / 1 skipped; `34-VERIFICATION.md`, `49e1202c` |
| GUARD-01 PowerShell wrapper guard | ✅ shipped | 34 | Wrapped build payloads denied while :3000 serves; isolated-dist exception retained; hook regression matrix 10/10; `34-VERIFICATION.md`, `50dd815c` + `63ef0aca` |
| PIPE-02 stale embedding prune | ✅ shipped | 34 | Gate-conditional real run pruned 983 stale rows to 0 after upserting 22,279 current rows; Python suite 17/17; `34-VERIFICATION.md`, `58a6d996` |

**Phases shipped:** 34 Test & Guard Health Sweep (2026-07-20, BUILD_ID
`CV_frbgC6hmbArjJ53Qi7`) · 35 Similarity-Web Renderer Rethink (2026-07-20,
`lzC97Z2E6chNTArdzDZd0`) · 36 Full-Rate Gate & Closeout (2026-07-20,
`39p7DFRd3DbgM8WjWU2Pz`, authenticated populated-graph probe).

**Durable traps & decisions (carry forward):**

1. Measure renderer candidates on the full live graph. Canvas2D's ceiling was raster cost,
   not JS; Cosmos native links won at ~60 fps without a worker, decimation, or dependency.
2. Counters are not visual proof. Phase 35 initially passed while the framebuffer was blank;
   real framebuffer pixels and screenshots exposed the lazy 300×150 backing-size defect.
3. Route payloads can dominate renderer readiness. A 14.5 MB full-user hydration followed
   by an eager 17.6 MB rail fetch caused cross-run contention; a graph-only cached payload
   and the existing single-user query were the narrow fix.
4. The default Playwright dev harness remains unreliable for this route. Use the isolated
   production-build `playwright.verify.config.ts` path until CONCERNS §3.9 is resolved.
5. Build guards must inspect wrapped shell payloads, not only the outer executable; preserve
   the PowerShell wrapper regression matrix and the isolated-dist exemption.

**Deferred items (destinations):**

- Tier-3 graph dims: ISSUE-GRAPH-01 resolution-rate spike is the v2.7 entry ticket; TIME-01
  temporal scrubber remains a candidate.
- Focus-session camera restore (Escape clears selection but not zoom) → CONCERNS §3.8 / next
  graph-interaction phase.
- Default e2e dev harness cleanup → CONCERNS §3.9 / tooling phase.
- Default-map cluster-label chips require an owner decision → CONCERNS §3.10.
- SVC-01, DIM-05 denominator verification, DC-01/DC-02, PaCMAP ratio tuning, and standing
  COMPANY-GRAIN-01 / ORPHAN-01 / TEST-SPLIT-01 debt carry forward unchanged.

**Archive:** [`milestones/v2.6-ROADMAP.md`](milestones/v2.6-ROADMAP.md) · [`milestones/v2.6-REQUIREMENTS.md`](milestones/v2.6-REQUIREMENTS.md)

---

## v2.5 Living Graph (Shipped: 2026-07-20)

**Phases:** 5 (29–33) · **Requirements:** 16/16 shipped · **Span:** 2026-07-16 → 2026-07-20 · **Tag:** _local-only_

**Goal vs outcome:** Make the spatial graph's positions *true* (full extracted feature set, magnitude-aware distances), its similarity relationships *intelligent* (de-twinned, explained neighbors), and its surface *alive* (full ambient motion, click/hover choreography, expressive links) — then close the carried perf debt so the life is felt. **Achieved end-to-end:** the bag-of-words t-SNE map (84.3% jittered clones) became a hybrid-vector PaCMAP projection (20.4% duplicates, trustworthiness 0.9388→0.9597, gate-conditional upsert); neighbor lists went from 10×100%-clone rows to k=10 distinct matches + twin chip + per-match "why similar" chips with coverage labels; click/hover/ambient choreography shipped entirely on the frozen CPU/rAF path (PERF-02 invariant green throughout); and PERF-05/06 closed the v2.4 debt with hard numbers (no-refetch on both routes, shell chunk −18.3%, time-to-graph −23.5%). One dependency change total (offline python `pacmap`+`faiss-cpu`), zero new npm deps, zero migrations.

**Per-requirement audit:**

| Req | Verdict | Phase | Evidence |
|---|---|---|---|
| EMB-01 full-feature vector | ✅ shipped | 29 | 8 categorical groups + 6 raw numerics + `cov:` token; in-code include/exclude rationale table (`instanceFeatureNumerics.ts`, `31ecc672`) |
| EMB-02 magnitude survives distance | ✅ shipped | 29 | log1p+max-scale / ÷5 ordinals / missing indicators, block-scaled; unit-pinned both sides incl. "permstr 5 closer to 4 than 0" (TS 3 tests + pytest) |
| EMB-03 PaCMAP projection | ✅ shipped (as amended) | 29 | Owner amendment UMAP→PaCMAP recorded; pacmap 0.9.1 + faiss-cpu, `random_state=42`, determinism proven live twice; ingest log truthful (`12140386`) |
| EMB-04 archetype collapse reduced | ✅ shipped | 29 | Duplicate rate 84.3%→20.4% (unique 3,488→17,732), measured baseline honest vs ~87% estimate; jitter residual-only |
| EMB-05 quantitative quality gate | ✅ shipped | 29 | trustworthiness(k=10) old=0.9388 new=0.9597 PASS, same-snapshot seeded sample; upsert conditional (exit 1 on regression); neighbor-purity deliberately non-gate (owner §4) |
| EMB-06 live recompute on graph | ✅ shipped | 29 | Run `20260716T173543Z-345c0e14` (22,279 rows); :3000 renders new islands, zero (0,0) fallbacks; Role 0→60→0 morph smoke OK; ingest wiring non-fatal |
| SIM-01 de-twinned neighbors | ✅ shipped | 30 | kNN over twin-group representatives, k=10 DISTINCT guaranteed + `{count, ids[≤10]}` twin summary; run `20260716T182623Z-e6fab986` (trust 0.9598 PASS, twin max 313/p95 2); panel before/after screenshots |
| SIM-02 "why similar" explanations | ✅ shipped | 30 | `top_contribution_keys` (elementwise product on real hybrid matrix, math unit-pinned) → `whySimilar.ts` labels+values+coverage suffixes; placeholder/unknown-coverage suppression (`eef5eaa9`) |
| SIM-03 edge set rebuilt honestly | ✅ shipped | 30 | Matches-only edges (twins structurally excluded); `interReserveFrac=0.4`/18k KEPT with recorded evidence table (inter share 11.0%→14.5%); min-max pinned by `similarityWeb.test.ts` |
| LIFE-01 click choreography | ✅ shipped | 31 | 180ms/2.25× frozen-Cosmos focus w/ exact restore; selected+10-distinct-match lighting; Playwright 11 lit nodes/navigation/Close (`849d74d4`, `4821cac3`) |
| LIFE-02 hover life | ✅ shipped | 31 | Hover incident-edge priority + cancellable 80ms tier/recency/breadth tooltip, truthful partial coverage; handler-path Playwright |
| LIFE-04 enriched click panel | ✅ shipped | 31 | Floating card removed → one matches-first rail (identity header + match/twin/why evidence + ACC body), concurrent 180ms swap, reduced-motion 0 (`923428f1`) |
| LIFE-03 full ambient motion | ✅ shipped (fallback clause) | 32 | Deterministic recency micro-orbits on frozen rAF path; **hard Tier-0 ≥50fps gate FAILED on final 14,200-link path (20.68fps)** — passes by the requirement's explicit degradation clause: three-tier controller observed degrading 0→1→2 to static, recorded not hypothesized; pre-link diagnostic 60.04fps retained honestly as non-final |
| LIFE-05 intentional links | ✅ shipped | 32 | Real-score weak/medium/strong bands at locked boundaries, monotone width/alpha, ambient<selected<hover draw order, 25%-opacity-floor morph web (no fade-to-nothing), reduced-motion snap (`3a48274a`) |
| PERF-05 app-wide hydration fix | ✅ shipped | 33 | `lib/server/hydrationState.ts` at all 3 call sites + 2/2 unit test; network evidence: zero refetch violations both routes; in-scope root-cause bonus — `BULK_USERS_LEAN_INPUT` client-proxy fix → `lib/acc/cachePolicy.ts` (`e7e14e64`, `65306046`) |
| PERF-06 shell-chunk split + re-measure | ✅ shipped | 33 | Graph-first `next/dynamic` split, shell chunk 164,154→134,108 B (−18.3%), framer-motion evicted; fresh in-phase pair 5,116→3,914 ms (−23.5%); vs 28.1 median 4,360: −446 ms (−10.2%) (`65306046`, `33-BASELINE.md`) |

Owner-added LINK-PERF (no REQ-ID, best-effort, no fps gate): ✅ delivered — raster-bound ceiling proven causally (60.0fps blanked vs 17.6 drawing), ambient-only ~10 Hz redraw throttle + Path2D/empty-stroke skip → 21.35→41.33 fps (+94%), Phase-32 contract intact (`682a4176`).

**Phases shipped:** 29 Embedding v2 — Feature Fidelity & PaCMAP (2026-07-16, data-only — rebuild skipped with rationale, live route probe) · 30 Similarity Intelligence (2026-07-16, BUILD_ID `SkA5J8kUu0LgER4NcyiJr`) · 31 Click & Hover Choreography (2026-07-16, `YTIBgQ4sRBXlonyphxjTq`) · 32 Ambient Life & Link Expression (2026-07-16, `wiAv-e6WVMCVkPo2ie-5N`) · 33 Perf Closeout & Verification (2026-07-20, `-zcfnulR0rESok3UDom50`, authenticated live smoke 1/1).

**Durable traps & decisions (carry forward):**

1. **RSC client-reference proxy poisons server prefetch.** A constant imported from a `"use client"` module by server code becomes a client-reference proxy — the `/users` SSR prefetch had errored silently since v2.4/PERF-03 because of `BULK_USERS_LEAN_INPUT`. Fix pattern: shared constants live in directive-free modules (`lib/acc/cachePolicy.ts`). Check this any time a server component imports from a client file.
2. **Isolated builds are PowerShell-only** — Git Bash trips a `.tsbuildinfo` path-style clash. Worse: a Git Bash **double-quoted** PowerShell command expands `$env:` to empty — one such command built over the live `.next` mid-phase (recovered same-day). guard-bash gap recorded in CONCERNS (`[NEW Ph33]`); single-quote or heredoc PowerShell invocations.
3. **Canvas2D rasterization is the fps ceiling, not JS.** Profiling: JS tick 1.36 ms/draw vs ~40 ms/frame raster for the 14.2k-bezier web. Throttling redraws (+94%) is the last cheap lever; further gains need a renderer rethink — OffscreenCanvas worker / cosmos-native links / zoom decimation → **v2.6 candidate** (CONCERNS, `33-BASELINE.md`).
4. **Twin-collapse before kNN, not after.** Computing neighbors over exact-vector twin-group *representatives* is what guarantees k distinct matches; post-hoc filtering of a saturated list cannot. Twin edges are excluded structurally from the web, not score-filtered.
5. **PaCMAP determinism + gate-conditional upsert** held: fixed seed proven by identical double-run; the pipeline refuses to write on trustworthiness regression (exit 1 before upsert). MN_ratio/FP_ratio remain package defaults — revisit only on owner UAT ask.
6. **Requirement-embedded fallback clauses keep audits honest** — LIFE-03's hard gate failed on the shipped path, and the milestone still closes truthfully because the degradation rule was written into the requirement, observed, and recorded (not asserted).
7. Sequencing that held: 29→30 (neighbors on the new vector only), 30→31 (choreography lights the de-twinned sets), 33 measured last (baseline-then-verify, same as v2.4's 24→28).

**Deferred items (destinations):**

- **Similarity-web renderer rethink** (OffscreenCanvas worker / cosmos-native links / zoom decimation) — raster-bound ceiling; tier controller still degrades below 50fps by design → **v2.6 candidate** (CONCERNS Ph33).
- **guard-bash powershell-wrap gap** — deny rules bypassed by powershell-wrapped builds; double-quote `$env:` expansion trap → CONCERNS `[NEW Ph33]`.
- **Tier-3 graph dims** — ISSUE-GRAPH-01 (needs `AccIssue.createdBy`→`AccDcUser` resolution spike) + TIME-01 temporal scrubber → v2.6 candidates.
- **e2e drift re-baseline** — `acc-dc-graph.spec.ts` 14 pre-existing failures (node count 16,942→22,279 + dead physics-shell testids); suite cannot gate until re-baselined → standing.
- **DIM-05 project-coverage denominator** (verify 550/1,153 before display; `VERIFY:` in `dimensionCoverage.ts`) → standing.
- **3 pre-existing `usePredicateEngine` Phase-25 unit failures** (stash-and-rerun proven pre-existing WIP) → standing.
- **PaCMAP MN_ratio/FP_ratio tuning** — defaults only; revisit on owner UAT ask → CONCERNS (phase-29 tagged).
- **Standing:** COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01, MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir prune (20–23 + 07 still on disk), Phase-17 SPLIT-04 owner visual sign-off.

**Archive:** [`milestones/v2.5-ROADMAP.md`](milestones/v2.5-ROADMAP.md) · [`milestones/v2.5-REQUIREMENTS.md`](milestones/v2.5-REQUIREMENTS.md)

---

## v2.4 Spatial Graph Dimensions (Shipped: 2026-07-16)

**Phases:** 5 (24–28) + 1 fractional (28.1) · **Requirements:** 18/18 shipped · **Commits:** 74 (2026-07-14 → 2026-07-16; 12 feat, 6 fix, 2 refactor, 49 docs, 5 chore) · **Tag:** _local-only_

**Goal vs outcome:** Make every access-analysis dimension selectable on the spatial graph and make selecting one actually *restructure* the graph — by unlocking dimension machinery already built, computed every page load, and discarded. **Achieved with zero new data source, Prisma table, loader, or npm dependency** — the milestone was an unlock, not a build. The two hardcoded 3-string apertures became a unified, coverage-honest, ~17-dim group/color/filter surface; the 208-dim catalog wall renders lazily and searchably; the dead force-anchor engine drives organic layout; and the closeout exonerated the widened surface for a first-paint regression that turned out to be a pre-existing SSR-hydration bug.

**Per-requirement audit:**

| Req | Verdict | Phase | Evidence |
|---|---|---|---|
| DIM-01 group by any node dim | ✅ shipped | 25 | `APERTURE_THEME_GROUPS`→17-id presets, themed `GroupByControls` (`662dc0da`,`917a98c9`) |
| DIM-02 color by any node dim | ✅ shipped | 25 | Toolbar Color-by over same aperture; banded categorical swatches (`917a98c9`) |
| DIM-03 unified id-space | ✅ shipped | 24 | 24-VERIFICATION 8/8 |
| DIM-04 filter by any dim | ✅ shipped | 25 | Add-a-chip Toolbar, aperture-keyed `FilterContext`, `DIMENSIONS` import removed (`7ae2f29a`) |
| DIM-05 honest coverage labels | ✅ shipped (deviation) | 25 | `dimensionCoverage.ts` node-derived covered/total + provenance chip. **Deviation:** node-derived denominator, NOT 550/1,153 project denominator (never verified → would be a made-up number; `VERIFY:` note stands) |
| DIM-06 stale registry doc fixed | ✅ shipped | 24 | 24-VERIFICATION |
| CAT-01 catalog wall renders in prod | ✅ shipped | 26 | Grouping/Catalog tabs, 3D-flag decoupled (`d54ace25`) |
| CAT-02 176-action lazy-load | ✅ shipped | 26 | 26-VERIFICATION; CONCERNS §3.3 closed |
| CAT-03 searchable catalog | ✅ shipped | 26 | 26-VERIFICATION |
| CAT-04 unavailable dims greyed w/ reason | ✅ shipped | 26 | 26-VERIFICATION |
| LAY-01 dimension restructures organically | ✅ shipped | 27 | 27-VERIFICATION |
| LAY-02 catalogTargets/Weights live | ✅ shipped | 27 | dead compute→live render path |
| LAY-03 sliders morph continuously | ✅ shipped | 27 | 27-VERIFICATION |
| LAY-04 never a fixed grid | ✅ shipped | 27 | 27-VERIFICATION |
| PERF-01 DuckDB warm-up off critical path | ✅ shipped | 28 | idle-guard `useHybridAnalytics.ts` + live path already JS-snapshot (28-01); CONCERNS §3.1 closed |
| PERF-02 no accidental reheat | ✅ shipped | 27 | frozen-handle invariant `GraphCanvas.test.ts`; CONCERNS §3.2 closed |
| PERF-03 lasso e2e reliable | ✅ shipped | 28.1 | LassoOverlay latest-ref (`716ee966`); e2e 3/3 warm-cache GREEN |
| PERF-04 no first-paint regression | ✅ shipped | 28.1 | SSR-hydration fix `spatial-graph/page.tsx` (`9fb54cb8`); median 4360 ms ≤ 6812 gate, −30% vs baseline |

**Phases shipped:** 24 Baseline & Dimension ID Unification (2026-07-14) · 25 Dimension Aperture (2026-07-15, BUILD_ID `Vl7pXM_h_j5j2UrFGYd5Z`) · 26 Catalog Slider Wall (2026-07-15, `CwTEecFhqC9yUj_Vm7Koh`) · 27 Layout Engine — Force-Anchor Revival & Reheat Guard (2026-07-15, `kZKWbfeAqYW1R4bYrUx2U`) · 28 Performance Closeout — PERF-01 shipped, PERF-03/04 found-regressed → 28.1 · 28.1 Spatial-Graph Regression Debug (2026-07-16, deployed BUILD_ID `KeTX6mq25E1sa0vgA-Pnn`).

**Durable traps & decisions (carry forward):**

1. **Name collision** — `app/(dashboard)/access-analysis/` = 23-panel charts page; `app/(dashboard)/users/access-analysis/` = spatial-graph shell. `/users/spatial-graph` and `/users/access-analysis` render the same UI. This milestone touched the `users/` one.
2. **The "+42% regression" was NOT the widened surface.** Boot instrumentation: whole build/render path = 317 ms (`buildCatalogTargets`/`Weights` = 86 ms). Root cause was a pre-existing **SSR-hydration miss**: `createServerSideHelpers({transformer:superjson}).dehydrate()` returns a superjson-WRAPPED `{json,meta}` state, but the App Router passed it raw to `<HydrationBoundary>` (which needs a bare `DehydratedState`) → hydrated nothing → the client refetched the multi-MB `bulkUsers` on the critical path. Fix = `superjson.deserialize` before the boundary. **This same bug still affects `layout.tsx` + `users/page.tsx` app-wide** (CONCERNS §Ph28.1).
3. **PERF-03 lasso race was latent since the Phase-24 baseline**, not authored by Phase 27 — `LassoOverlay`'s pointer effect depended on an inline `onComplete`; Phase 27's post-freeze re-renders newly *triggered* it warm-cache. Fixed with a latest-ref pattern.
4. **cosmos.gl 3.3.0** upgrade (uncommitted at milestone open) was owner-confirmed and rode through all phases; frozen-handle invariant held.
5. Sequencing that held: DIM-03 before DIM-01/02; CAT-01 before CAT-02/03/04; PERF-02 landed inside Phase 27 (not a separate phase) as the safety net for LAY-01/02.

**Deferred items (destinations):**

- **DIM-05 project-coverage denominator** — verify whether 550/1,153 is the correct DC-sourced denominator before ever displaying it (→ v2.5 or a data-truth spike). `VERIFY:` in `dimensionCoverage.ts`.
- **App-wide SSR-hydration miss** — `layout.tsx` + `users/page.tsx` prefetches still refetch; candidate shared `deserializeHydrationState(helpers)` helper (→ CONCERNS §Ph28.1(1)).
- **`dynamic()` shell-chunk ~4 s parse gap** — remaining time-to-graph cost after the hydration fix; code-split heavy static imports out of the shell chunk (→ CONCERNS §Ph28.1(2)).
- **3 pre-existing `usePredicateEngine` Phase-25 unit failures** — banded-catalog aperture tests; not a regression (proven by stash-and-rerun); pre-existing WIP.
- **Tier-3 graph dims** (ISSUE-GRAPH-01 needs `AccIssue.createdBy`→`AccDcUser` resolution spike; TIME-01 temporal scrubber) → v2.5.
- **COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01, MILESTONES v2.1/v2.2 backfill** → standing.

**Archive:** [`milestones/v2.4-ROADMAP.md`](milestones/v2.4-ROADMAP.md) · [`milestones/v2.4-REQUIREMENTS.md`](milestones/v2.4-REQUIREMENTS.md)

---

## v2.3 New Graphs (Shipped: 2026-07-14)

**Phases completed:** 6 phases, 28 plans, 62 tasks

**Key accomplishments:**

- Server loader + pure transform + client horizontal-bar chart reading `AccFolderPermissionSummary` (22,082 rows), converting `totalBytes` BigInt→Number server-side, with a new `formatBytes()` helper and per-role click-to-drill — a vertical slice not yet wired into `/access-analysis` (plan 20-05 does the registration).
- Real per-project sign-in recency signal (AccDcUser.lastSignIn via AccDcProjectUser join) bucketed into 5 locked bands with an honest, populated "Never signed in" bucket — loader, transform, and drillable chart, standalone and unit-tested; not yet mounted on the page (plan 20-05 wires it in).
- Additive `issueCoverage` on `coordinationByProjectView.ts` + a pure 4-bucket transform + a standalone `IssueFetchCoverageDonut` client component (ok/zero_issues/forbidden/error, all always shown, drillable per bucket) — not yet mounted; plan 20-05 places it above Model Coordination.
- PIPE-01 vertical slice: `loadIngestFreshness()` server loader (latest `AccDcIngestRun` + live `AccActivity` throughput by `ingestRunId`, `rowsByModule` never read), pure `ingestStaleness`/`statusTone`/`formatRunDuration` transforms, and a muted `IngestFreshnessPanel` ops-metadata strip — not yet mounted on `/access-analysis` (plan 20-05 owns page wiring).
- Wired PermissionFootprintChart, DormantSignInChart, IssueFetchCoverageDonut, and IngestFreshnessPanel into the live `/access-analysis` page (8→11-entry parallel loader fan-out), owner-verified live with no BigInt serialization error, plus an in-phase fix removing raw-GUID leakage from the project picker.
- Role-stacked activity-recency chart sourced from `AccActivityAccds` MAX(createdAt) per (project, user), built unmounted to replace the sign-in-recency panel in 20.1-06.
- Task 1 — `lib/server/permissionLevelView.ts` + server action.
- New "Folder activity by company" graph (owner UAT item 6) built as a two-pass bounded design — a 10,566-row eager headline aggregate (top-10 companies by folder-scoped activity, honest Unknown-company bucket) plus a lazy per-company folder drill on click — never materializing the 190,049-row company×folder cross-product. Built unmounted; ready for plan 20.1-06 to wire into the Companies tab.
- FolderPermissionTerrain now accepts an external project selection (0/1/2+ -> overview/single/compare) via a new pure `deriveTerrainSelection` helper, with pickers hideable and existing behavior byte-identical when the new props are absent.
- `/access-analysis` reorganized from a 722-line flat panel wall into a 6-tab (Overview·Roles·Users·Companies·Projects·Compare) Radix Tabs shell with one global picker/FilterBanner pinned above the strip, and the folder-permission terrain relocated into the Compare tab driven by that same picker (`externalSelectedIds`/`hidePickers` from 20.1-04), replacing its own expand-gate (`TerrainReveal`, deleted).
- 1. [Rule 1 - Bug] Fetch-gating condition changed from `rows === null` to a ref flag
- Role-click scroll-jump measured/fixed and pinned by a Playwright spec (Tasks 1-2, prior session); owner UAT re-check surfaced 4 itemized gaps — Activity-recency panels now state the question they answer, Permission-volume-by-level and Folder-activity-by-company "Other" buckets expand in place, and three project-name loaders (`accessInstanceView`/`moduleActivityView`/`activityTimelineView`) that were leaking raw project GUIDs into the global picker now resolve through the same `buildProjectNameMap`/`resolveProjectName` precedence already used elsewhere in the codebase — all four closed with one commit each.
- Server-side `loadIssueFunnel()` aggregate loader over the full 17,360-row `AccIssue` set (monthly `date_trunc` timeline cut + status `groupBy` cut in one `Promise.all`), its aggregate-bound Vitest test, and an unwired lazy auth-gated server action mirroring the existing `activityRecencyActions.ts` shape.
- Two unmounted presentational charts for the Projects tab — a monthly issue-creation area line (amber accent, zoom+peak pin, no YoY) and an 8-status donut with local per-status drill — both driven by live `deriveIssueCoverageCaption` numbers instead of any hardcoded coverage figure.
- ISSUE-02/ISSUE-03 are now live on the /access-analysis Projects tab — a monthly issue-creation timeline and an 8-status donut, both lazily fetched once per page load and owner-approved on a `:3100` production-build preflight.
- Service-first precedence layered into `classifyActivity` (narrow override, verb taxonomy unchanged as fallback), service preserved through the module-activity loader's SQL union, live attribution counters on `ModuleSummary`, and a live before/after evidence file showing the real fix moves only 207 of 4.72M activities (0.0044%) — nowhere near Model Coordination.
- `loadProvisionedModules()` server loader over `AccProjectMember.products` (full live-project coverage) + `summarizeProvisionedModules()` pure transform + `ProvisionedModulesChart` horizontal-bar component with click-to-drill, all built and tested UNMOUNTED for plan 21.1-04 to wire into the Overview tab.
- `summarizeProjectActivity()` pure transform (top-10 + Other, Account-level exclusion, per-project drill payload) + `ProjectActivityDonut` component with local click-to-drill module breakdown, both built and tested UNMOUNTED for plan 21.1-04 to wire into the Overview tab's new 2-up row.
- All 3 Phase 21.1 UAT items wired live into the /access-analysis Overview tab (2-up row: Activity share by project + Provisioned modules; live service/verb-split ⓘ caveat), owner-approved on a `:3100` production preflight after a 5-correction owner-delegated module-attribution taxonomy review that finished with the owner-directed Sheets-cluster → Build move.
- Task 1 — `AccIssueType` model + migration.
- `loadIssueFunnel()` gains a third `typeRows` cut (per-project issue counts by resolved type name) and a new `summarizeIssueType()` pure transform folds them into top-N + honest "Unknown type"/"No type set" buckets — both unmounted, ready for the 22-03 chart.
- COMPLETE.
- Zero files modified. Zero commits made.
- No reorder warranted — zero-diff curation PASS.
- Owner gave a one-word blanket approval ("approved") of the full 4-page workshop surface on the rebuilt `:3000`; recorded honestly as blanket-granularity evidence, zero findings raised, Task 3's fix-now branch correctly skipped as a legitimate no-op.
- Refreshed a stale repo-map dependency-cruiser baseline (6->2, ratcheted down only, never up), re-ran the full v2.3 gate sweep live (tsc/test/TEST-01-03/WebGL-scope-fence/spatial-graph-scope-fence all green), wrote `23-VERIFICATION.md` (`status: owner_approved`), and flipped both the Phase 22 and Phase 23 ROADMAP checkboxes — unblocking plan 23-05's final self-gate.

---

A historical log of shipped versions. Full per-milestone detail lives in `.planning/milestones/`.

---

## v2.0 — Workshop-Grade UI/UX Overhaul

**Shipped:** 2026-06-19 · **Tag:** `v2.0` · **Phases:** 7 · **Plans:** 30 (33 with gap-closure) · **Tasks:** ~80

A premium UI/UX overhaul of four pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) so the data looks, feels, and responds like a workshop showcase — fast, visually premium (2.5D depth, not flat), tactile, and explorable live. Presentation-layer surgery on a locked stack, built foundation-first.

**Key accomplishments:**

1. **Shared design foundation** — depth/glow/glass tokens, `PremiumSurface` primitive, theme-aware `EChart` wrapper, motion facade, and one slide-in `DrillSheet`, imported by all 4 pages (Phase 1).
2. **Decomposed the 2,474-line `/users` monolith** into a 314-line orchestrator + Zustand store + single data hook with zero user-visible change, guarded by a golden-path test, and killed the hydration-key double-fetch (Phases 2 & 4).
3. **Built one reusable virtualized `DataTable`** (sort, sticky glass header, pinned column, inline expand, density toggle) now shared by `/users` and `/template-mty` (Phases 3, 4, 6).
4. **Client-side cross-filtering on `/access-analysis`** — clicking one chart filters the others with zero new queries — plus Suspense tiers, depth/glow donuts with drill morphs, and lazy folder terrain (Phase 5).
5. **WCAG AA chart-label contrast at projector brightness** in both themes, backed by an automated 15-assertion regression gate ("raise the token, not the threshold") (Phase 5).
6. **Polished `/template-mty` and `/forma-proposal`** — premium DataTable + depth pies + settle-and-freeze role graph drill; `HierarchyView` split with deferred d3 + a selective real-3D background accent off the data (Phase 6).
7. **Pre-workshop projector UAT** — a 38-test Playwright harness across all 4 pages + every scriptable engineering gate, plus an owner :3100 runbook; engineering report ALL-GREEN and owner "approved on the projector" (Phase 7).

**Stats:** 161 commits over 3 days (2026-06-17 → 2026-06-19) · 53 `feat`, 11 `test`, 6 `fix`, 3 `perf`, 3 `refactor` · 238 files changed.
**Verification:** all 7 phases passed; owner UAT sign-off on Phases 4, 5, 6, and the Phase 7 projector pass.
**Archive:** [`milestones/v2.0-ROADMAP.md`](milestones/v2.0-ROADMAP.md) · [`milestones/v2.0-REQUIREMENTS.md`](milestones/v2.0-REQUIREMENTS.md)
**Deferred to v-next:** Forma role-permission diff view (FRM-V2-01), project-grouped picker accordion (ACC-V2-01), additional new analytics (NA-V2-01), `/users` data freshness.

---

## v1.0 — ACC Users Graph + Access Analysis Dashboard

**Shipped:** 2026-05-08 · **Tag:** `v1.0` · **Phases:** 6 · **Plans:** 33

Production-deployed ACC user-access platform — GPU-accelerated graph (25,559-node hub interactive), filter pipeline with hide-on-filter semantics, and a single-page Access Analysis dashboard with junk/duplicate/outlier detection, drill-down panel, CSV-per-widget, and drag-reorder persistence.

> This milestone predates the project's GSD re-initialization; its planning artifacts were archived before the v2.0 fresh init. Full record lives in the `v1.0` git tag's history. Its existence is why the Workshop overhaul (internally numbered "v1.0" by the fresh project) ships as **v2.0**.

---
