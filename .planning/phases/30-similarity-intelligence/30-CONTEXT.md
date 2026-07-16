# Phase 30: Similarity Intelligence - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Clicking a node yields a neighbor list a person can trust and understand — distinct,
meaningful matches (no score-1.0 clones) each carrying a "why similar" breakdown — and
the similarity web is rebuilt from those de-twinned lists:

1. **SIM-01** — `scripts/compute_instance_embeddings.py` collapses exact-vector twins
   out of the stored `AccInstanceEmbedding.neighbors` payload: each node stores k
   *distinct* matches plus a twin summary (count + capped member list).
   `accDcGraph.instanceNeighbors` and `NeighborMatchesPanel` consume the new shape;
   the panel gains an honest "N identical twins" affordance.
2. **SIM-02** — every rendered match explains why: python stores the exact top
   contributing shared-dimension KEYS per match (derived from the real hybrid vector);
   the client resolves human labels, values, and coverage text from the
   `NodeFeatureSnapshot`s it already holds, following the v2.4 coverage-label
   conventions (`dimensionCoverage.ts` / `coverageText`).
3. **SIM-03** — the similarity edge set is rebuilt from the de-twinned neighbor lists
   (twin edges vanish from the web; twin groups still read as position clumps).
   `dedupeAndSelectClusterAware` semantics preserved or re-tuned with recorded
   evidence; strength normalization stays min-max over the real score distribution
   (already true in `mapEdgesToIndices` — pin it, don't regress it).

**Out of scope:** camera ease, neighbor lighting, animated panel reveal, hover edge
emphasis (all Phase 31 — this phase redesigns the panel's CONTENT, not its
choreography; keep chrome modest so 31's coherent reveal isn't rework); ambient
motion and link strength/hover/morph rendering (Phase 32); PERF-05/06 (Phase 33);
any Prisma schema change (`neighbors` is Json — payload change needs no migration);
any new npm or python dependency.

**⚠️ Name-collision trap (standing):** `app/(dashboard)/users/access-analysis/` is
this phase's surface; `app/(dashboard)/access-analysis/` (23-panel charts page) is
untouched.

**⚠️ Shape-change trap:** today `neighbors` is a bare array `[{nodeId, score}]` and
`instanceNeighbors` casts it raw. A richer payload (matches + twins) is a SHAPE
change, not a field addition — pipeline, proc, and panel must ship together, and the
proc must normalize/tolerate the old array shape so a stale row (or a not-yet-rerun
pipeline) renders gracefully instead of crashing the panel.
</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 30 entry + `.planning/REQUIREMENTS.md` SIM-01..03.
- `.planning/phases/29-embedding-v2-feature-fidelity/29-VERIFICATION.md` — live run
  `20260716T173543Z-345c0e14`: 22,279 rows, hybrid matrix vocab 473 + 8 numeric cols,
  duplicate rate 20.4% (17,732 unique profiles → ~4,547 rows inside exact-duplicate
  groups), trustworthiness 0.9597. Neighbors ALREADY recomputed on the hybrid matrix
  (same `{nodeId, score}` shape) — Phase 30 does not re-derive the vector.
- `scripts/compute_instance_embeddings.py` — `knn_neighbors()` (cosine, K_NEIGHBORS=10,
  full matrix), `residual_jitter` already identifies byte-identical row groups (the
  twin-group machinery exists), `_upsert` writes `neighbors` Json per node.
  Pure functions unit-tested in `scripts/test_compute_instance_embeddings.py`.
- `server/routers/acc-dc-graph.ts:70-101` — `instanceNeighbors` (raw Json cast) +
  `similarityEdges` (18k default budget → `dedupeAndSelectClusterAware`).
- `lib/acc/embedding/similarityEdgeSet.ts` — `dedupeAndSelectClusterAware`
  (`interReserveFrac=0.4` cross-cluster reserve; header comment documents WHY: plain
  top-N is 100% saturated by score-1.0 twin edges). With twins collapsed upstream,
  that saturation premise changes — re-tune needs evidence, not assumption.
- `app/(dashboard)/users/access-analysis/NeighborMatchesPanel.tsx` — pure
  presentational, parent supplies matches + `indexByNodeId` + `features`; currently a
  flat name·project·% list.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:355-364, 524-543` —
  on-demand `instanceNeighbors` query (flag-OFF only, staleTime 600s), panel mount,
  `neighborIndices` predicate lighting.
- `app/(dashboard)/users/access-analysis/similarityWeb.ts:20-58` —
  `mapEdgesToIndices` already min-max normalizes strength over the real edge score
  distribution (SIM-03's normalization clause is partially satisfied; pin with a test).
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` (`NodeFeatureSnapshot`)
  — client already holds role, company/firmName, permTier, permissionStrength,
  activityTotal/buckets, membershipAgeDays, riskScore/flags, accessibleDataBytes,
  folderBreadth, `permissionCoverage` per node → the client side of the hybrid
  why-similar rendering needs zero new data fetch.
- `app/(dashboard)/users/access-analysis/dimensionCoverage.ts` — `coverageText()` +
  `isUnderCovered()` node-derived coverage convention (v2.4) that SIM-02's labels reuse.
- VERIFY (planner): actual twin-group size distribution at the current snapshot
  (max/median group size) — bounds the capped-ids choice; measure in the pipeline,
  don't guess.
- VERIFY (planner): per-match dimension-contribution derivation — contribution of
  each vector block to one pair's cosine similarity (elementwise product share per
  dimension group). Confirm the math against the installed sklearn/numpy in a unit
  test; do not hand-wave "top dimensions".
</evidence>

<defaults>
## Inferred Dashboard Defaults

- k = 10 distinct matches per node (current K_NEIGHBORS carries over as the
  post-collapse target); pipeline fetches enough raw neighbors (or runs kNN over
  unique-vector representatives, then maps back) to fill 10 distinct — planner picks
  the mechanically simplest route and pins it.
- Payload naming, exact Json layout, and the top-N why-similar key count (~3) are
  planner discretion within the decisions below; payload stays bounded per node.
- `instanceNeighbors` returns a typed normalized shape; old bare-array rows normalize
  to `{matches, twins: {count: 0, ids: []}}` equivalents.
- Panel stays zinc-themed, presentational, parent-fed; twin affordance and per-match
  why-chips must remain readable at workshop projection distance; interaction motion
  ≤200ms; `prefers-reduced-motion` respected (no new animation this phase anyway).
- DC-sourced attributes in why-similar labels carry coverage text exactly like v2.4
  dimension labels (`coverageText`); `permissionCoverage === "unknown"` attributes
  never render as confident explanations.
- Offline pipeline stays non-fatal in `dc-daily-ingest.cjs`; a failed run never
  breaks ingest; rerun records a fresh `embeddingRunId`.
- No schema change; no new dependency; explicit-path commits;
  `npx tsc --noEmit` before any rebuild; TEST-01/02/03 + PERF-02 frozen-handle
  invariant untouched-and-green; python tests extended in
  `test_compute_instance_embeddings.py`.
</defaults>

<decisions>
## Implementation Decisions (owner, 2026-07-16)

### 1. Twin rule = exact-vector twins only
- Collapse only rows with byte-identical hybrid vectors — the same duplicate groups
  EMB-04's machinery already measures (20.4% of rows). Deterministic, zero threshold
  tuning. Near-identical-but-distinct profiles stay as real ranked matches.

### 2. Twin affordance = count + capped expandable list
- `neighbors` Json stores per node: twin count + first ~10 twin nodeIds (cap is
  planner-tunable against the measured group-size distribution, stays bounded).
- Panel renders an "N identical twins" chip; expanding lists the capped members
  (name · project via client snapshot join) with an honest "+N more" overflow line.
  Twin rows re-isolate on click like matches do.

### 3. Why-similar = hybrid (python exact keys, client renders detail)
- Python computes the exact top contributing shared-dimension KEYS per match from the
  real hybrid vector (TF-IDF/block weights included) and stores them additively per
  match (~3 keys).
- The client resolves keys → human labels, live values ("same company: ACME",
  "similar activity: High/High"), and coverage text from the NodeFeatureSnapshots it
  already holds + `dimensionCoverage.ts` conventions. No new fetch, exact ranking.

### 4. Web = distinct-match edges only
- `similarityEdges` derives from the de-twinned match lists; twin edges vanish from
  the web (twin groups still read as tight position clumps on the map).
- Cluster-aware selection re-tuned with recorded evidence: measure the post-collapse
  inter/intra score distributions, then keep or adjust `interReserveFrac=0.4` and the
  18k budget with the numbers in the summary. Strength normalization stays min-max
  over the real distribution (pin with a test).

### Claude's Discretion
- Json field names, twin-id cap value, why-key count, kNN-over-uniques vs
  overfetch-then-collapse mechanics, panel layout details within the modest-chrome
  constraint, and the evidence format for the edge re-tune.
</decisions>

<specifics>
## Specific Ideas

- The workshop story: "these are the 10 people most like Luis-on-Project-X — and the
  panel tells you WHY each one matches, plus that 12 colleagues have this exact
  access profile." Trust through explanation, not just proximity.
- Panel content-complete but chrome-modest: Phase 31 turns it into the animated
  click-reveal centerpiece; don't build throwaway animation now.
</specifics>

<workshop>
## Workshop Impact

- Surface: `/users/spatial-graph` (+ `/users/access-analysis` alias) — the node-click
  neighbor panel and the similarity web. Positions unchanged (Phase 29's map stands).
- Presenter gains: every match answers "why is this person similar?"; identical-profile
  crowds become one honest count instead of a list of clones; the web connects
  genuinely-similar distinct profiles.
</workshop>

<data_truth>
## Data Truthfulness

- No new data source; explanations derive from the same hybrid vector that places the
  nodes — the "why" is the actual distance math, not a parallel heuristic.
- DC-sourced attributes in explanations carry coverage labels (v2.4 convention);
  "unknown"-coverage attributes are never presented as confident reasons.
- Twin counts are exact (byte-identical vectors), and the capped member list says
  "+N more" instead of pretending completeness.
- Edge re-tune decisions are recorded with measured score distributions, not vibes.
</data_truth>

<deferred>
## Deferred Ideas

- Near-twin (score-threshold) collapsing — rejected this phase (owner: exact-vector
  only); revisit only if UAT shows lists still read as clone-saturated.
- Twin edges as a distinct rendered class in the web — rejected; Phase 32 (LIFE-05
  link expression) owns any future link-class styling.
- pgvector runtime nearest-neighbor — still deferred (precomputed Json suffices).
</deferred>

<verification>
## Verification Expectations

- Python: unit tests for twin-group collapse (exact-vector grouping, capped ids,
  count correctness), distinct-match fill (k=10 post-collapse), and the per-match
  contribution derivation (seeded, pure); full-suite
  `python -m pytest test_compute_instance_embeddings.py` green.
- TS: `instanceNeighbors` old-shape normalization pinned; `similarityEdgeSet` re-tune
  behavior pinned (or existing tests updated with the evidence recorded);
  `mapEdgesToIndices` min-max normalization pinned; panel twin-chip + why-chip
  rendering covered by a jsdom test.
- Live pipeline run against the DB with a fresh `embeddingRunId`; panel eyeballed on
  the live graph: distinct matches + twin chip + why labels render, no console
  errors; stale-shape fallback exercised (old row renders gracefully).
- Post-collapse inter/intra edge score distributions measured and recorded; chosen
  `interReserveFrac`/budget justified in the summary.
- `npx tsc --noEmit` clean; `node scripts/repo-map/check.cjs` if router/shared-module
  imports change; TEST-01/02/03 + PERF-02 (`GraphCanvas.test.ts`) green.
</verification>

---

*Phase: 30-similarity-intelligence*
*Context gathered: 2026-07-16*
