# Requirements: LECG Dashboard — v2.7 Activity Universe

**Defined:** 2026-07-20
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric
derivable from the local Prisma DB and honest about coverage.
**Source:** direct owner goal 2026-07-20 ("nodes for all the instances of activities that I
have extracted — every activity has an author and that author's properties conform the
graph") + owner scope decisions recorded below. The previously stated v2.7 entry ticket
(ISSUE-GRAPH-01 resolution spike) was superseded by this goal and stays deferred.
**Prior milestone:** v2.6 Full-Rate Graph (8/8 shipped 2026-07-20) — requirements archived to
`.planning/milestones/v2.6-REQUIREMENTS.md`, retrospective in `MILESTONES.md`.

**Milestone goal:** The spatial graph's node universe changes grain: instead of one node per
user×project instance (22,279 nodes), **one node per extracted activity event** — the full
raw corpus — with each node inheriting its author's properties (role, company, modules,
project) plus its own event properties (verb, service/module, object type, folder, month).
The dimension slider surface survives the swap at the new grain, a temporal scrubber lands
(TIME-01, finally unblocked because month IS a node attribute now), and the v2.6 hard
**≥50 fps Tier-0** bar applies at the shipped scale.

---

## ⚠️ Read Before Planning

Measured 2026-07-20 (read-only census, scratchpad `activity-grain-census.cjs` pattern from
`scripts/count-acc-data.cjs`):

| Fact | Value |
|---|---|
| `AccActivityAccds` rows (grew since 2026-06-23 census) | **4,862,301** |
| Unified source adds (DC backfill + admin, v2.6-era census) | +41,714 +871 |
| Last 12 months | 4,458,926 |
| Distinct authors (`userEmail`) | 2,313 |
| Current graph node count (user×project) | 22,279 |
| Bounded-grain reference points | user+project+verb+month = 106,196 · user+project+month = 40,166 |

1. **This is a ~220× scale jump on every layer.** v2.6 proved 60 fps at 22,279 nodes /
   18,000 GPU links; the embedding pipeline (PaCMAP), the hydration payload (compact JSON,
   2,386.7 ms median), the CPU/rAF morph path, and the e2e baselines are ALL sized for 22k.
   None of them carries to 4.86M unchanged. The milestone opens with a feasibility spike
   (SCALE-01) whose measured numbers pick the shipped rung on an owner-approved fallback
   ladder — the same written-clause discipline that let v2.5 LIFE-03 close honestly.

2. **Owner accepted the risk explicitly (2026-07-20):** offered the bounded grains above,
   the owner chose **all raw events** + full replace + the hard ≥50 fps bar + TIME-01
   folded in. The ladder exists so a failed rung produces a recorded owner decision, not a
   dead milestone.

3. **The PERF-02 frozen-handle contract must evolve deliberately.** All motion today is
   CPU/rAF `pushPositions` over a frozen cosmos handle — a per-node JS loop that cannot run
   4.86M nodes at 50 fps. Slider morph/grouping and ambient life must move GPU-side (or be
   proven at scale). The invariant's tests are updated as a deliberate, recorded contract
   change — never silently weakened.

4. **A new Prisma table + migration is expected** (unlike v2.5/v2.6's zero-migration
   guardrail): activity-grain positions/attributes (~4.86M rows) do not fit
   `AccInstanceEmbedding`'s per-instance shape. The pgvector shadow-DB trap stands:
   raw-SQL migration + `prisma migrate resolve`, never `prisma migrate dev`.

5. **JSON node payloads are dead at this scale.** 22k nodes were already 14.5 MB before
   v2.6's compact hydration. 4.86M nodes require a binary columnar path (typed-array
   buffers) with its own honest time-to-graph budget — the 3,913.7 ms cutoff does NOT
   carry; the spike sets the new budget from evidence.

6. **NAME COLLISION (standing).** `app/(dashboard)/access-analysis/` is the 23-panel charts
   page (untouched this milestone). `app/(dashboard)/users/access-analysis/` is the
   spatial-graph shell this milestone rebuilds. `/users/spatial-graph` and
   `/users/access-analysis` render the same UI.

7. **Author resolution is not 100%.** `userEmail` is nullable on both activity tables;
   the null/unresolvable-author rate is unmeasured. Nodes with unresolved authors are
   disclosed with honest coverage labels — never silently dropped (AGENTS.md data rule).

**Overarching guardrails:** analytics source stays the local Prisma DB; no new external
data source. Zinc theme; ECharts/graph colors theme-resolved. Layouts organic — never a
fixed grid. `prefers-reduced-motion` → fully static. No new WebGL on data surfaces (the
spatial graph already runs cosmos.gl; this milestone stays inside that canvas).
`npx tsc --noEmit` before any build; deploy = stop `LECG Dashboard Local` task → build →
restart → probe. Isolated builds PowerShell-only. TEST-01/02/03 characterization pins stay
green (they guard `/access-analysis` + `/template-mty`, untouched surfaces). Commit by
explicit path only.

---

## v2.7 Requirements

Each maps to exactly one roadmap phase (numbering continues from Phase 36 → **starts at
Phase 37**).

### Scale Feasibility (SCALE)

Data authority: the live corpus itself (census above) + measured prototypes on the
workshop machine.

- [ ] **SCALE-01**: A feasibility spike **measures, on the workshop machine**, before any
      build phase: (a) cosmos.gl render of the full 4,862,301-point set (synthetic or real
      positions) — fps at rest, during pan/zoom, and with ambient motion; GPU memory; (b)
      binary payload size + load/parse time for positions + minimal attributes; (c)
      offline embedding runtime estimate at activity grain. The results pick the shipped
      rung on this **written fallback ladder**, owner-approved per rung: **L0** all 4.86M
      events, all animated → **L1** all events resident + rendered, ambient motion on a
      decimated subset → **L2** all events resident, far-zoom LOD decimation of rendering →
      **L3** bounded grain (user+project+verb+month, 106,196 nodes — every activity still
      counted, none dropped). The chosen rung + numbers land in `37-BASELINE.md`.

- [ ] **SCALE-02**: Activity node data reaches the client as **binary columnar payloads**
      (typed-array positions + attribute columns; no per-node JSON array), cached and
      streamed appropriately; a new honest time-to-graph budget is set from the spike
      evidence and the shipped route meets it (median-of-5, `:3100` methodology, recorded).

### Activity Universe (ACT)

Data authority: unified activity source — `lib/server/unifiedActivitySource.ts` merge of
`AccActivityAccds` (4,862,301 rows, primary) + `AccActivity` (DC backfill 41,714 + admin
871). Counts re-measured at pipeline build time.

- [ ] **ACT-01**: One graph node per extracted activity event at the shipped ladder rung —
      each node carrying its event properties: `activityVerb`, `serviceGroup`/module
      classification (via the established `lib/acc/activityClassification.ts`),
      `objectType`, folder, project, and month (`createdAt`). Node sizing/appearance is
      derived from real event data, theme-resolved.

- [ ] **ACT-02**: Every activity node **inherits its author's properties** — role (via the
      established `mergeRoleNames` AccRole fallback), company, provisioned modules, and
      author identity — joined from `userEmail`. The null/unresolved-author rate is
      measured and disclosed as an honest coverage label on the graph surface; unresolved
      nodes render with an explicit "Unknown author" grouping, never dropped.

- [ ] **ACT-03**: The activity universe **fully replaces** the user×project instance graph
      on `/users/spatial-graph` + `/users/access-analysis` (owner decision: full replace,
      no mode toggle). The user-instance data path, its per-instance embedding payload,
      and dead code retire with a clean diff; no orphaned loader keeps shipping bytes.

- [ ] **ACT-04**: Hover/click on an activity node shows the event honestly (verb, object
      name/type, folder, project, date, author) and the author's profile (reusing the
      established `UserProfilePanel` surface where it fits); selection/lasso still works
      at the shipped scale.

### Embedding (EMB — continues v2.5 numbering)

Data authority: offline Python pipeline (`scripts/compute_instance_embeddings.py` lineage,
pacmap + faiss-cpu already installed) over the unified activity source.

- [ ] **EMB-07**: An offline pipeline computes 2D positions for the full activity corpus —
      full-fit PaCMAP if the spike proves runtime tractable, otherwise **sample-fit +
      nearest-neighbor projection of the remainder** (decision recorded with measured
      runtimes). Deterministic (fixed seed, proven twice), gate-conditional write (a
      quality-gate regression aborts before any write — v2.5 EMB-05 discipline), stored in
      a new activity-grain Prisma table via raw-SQL migration + `migrate resolve`.
      Feature vector spans author properties AND event properties so that "the author's
      properties conform the graph" (owner's words) is literally true of the layout.

### Dimensions (DIM — continues v2.4 numbering)

- [ ] **DIM-07**: The dimension slider surface (group-by / color-by / strength sliders)
      **survives the swap** (owner: "full replace but I need to have dimensions slider
      still") — rebuilt activity-native: verb, module/serviceGroup, objectType, month,
      author role, author company, project at minimum; organic dimension-driven layouts
      (never a grid); per-dimension honest coverage labels (established
      `dimensionCoverage` pattern).

### Performance (PERF — continues v2.4/v2.5 numbering)

- [ ] **PERF-07**: Slider morph, grouping transitions, and ambient life run at the shipped
      scale without dropping under the Tier-0 bar — the CPU/rAF per-node morph path is
      replaced or augmented GPU-side as the spike evidence dictates; the PERF-02
      frozen-handle invariant is **evolved deliberately**: its tests are rewritten to pin
      the new motion contract (what may and may not mutate cosmos state), recorded as a
      contract change in the phase artifacts — never silently weakened.

### Temporal (TIME — deferred since v2.4, unblocked by this grain)

- [ ] **TIME-01**: A temporal scrubber filters (and can animate) the graph by month across
      the corpus — month is now a native node attribute, dissolving the original blocker
      ("time is not a node attribute"). GPU-mask or equivalent filtering keeps scrubbing
      inside the perf bar; `prefers-reduced-motion` → no auto-animation, static stepping
      only.

### Renderer Gate (REND — continues v2.6 numbering)

- [ ] **REND-04**: **Hard perf gate, measured last:** Tier-0 with ambient life + the
      shipped activity universe sustains **≥50 fps** on the workshop machine over a ≥10 s
      LIFE-03-methodology sample, tier controller observed idle, recorded in the closeout
      verification. The gate applies at the owner-approved ladder rung shipped by
      SCALE-01; passing at a lower rung than L0 is honest only with the recorded owner
      sign-off from Phase 37.

### E2E Health (E2E — continues v2.6 numbering)

- [ ] **E2E-03**: `tests/e2e/acc-dc-graph.spec.ts` (+ lasso spec) is re-baselined to the
      activity universe — node-count expectations, selectors, and fixture scale updated —
      and passes green on the isolated `:3100` production harness so it can gate the
      closeout. The `NEXT_PUBLIC_ACC_GRAPH_TEST` fixture path gets an activity-grain
      equivalent sized for CI sanity, with the full-scale gate remaining a workshop-machine
      measurement.

---

## Coverage

12 requirements — SCALE-01 → Phase 37 · SCALE-02, EMB-07, ACT-02 → Phase 38 ·
ACT-01, ACT-03, ACT-04 → Phase 39 · DIM-07, PERF-07 → Phase 40 ·
TIME-01, REND-04, E2E-03 → Phase 41. **12/12 mapped, each to exactly one phase.**

## Deferred (recorded, not planned)

- **ISSUE-GRAPH-01** — `AccIssue.createdBy`→`AccDcUser` resolution-rate spike (was the
  stated v2.7 entry ticket; superseded by this owner goal, stays a v2.8 candidate) +
  issue dims on the graph.
- **SVC-01** service-override attribution refinement; **DIM-05** 550/1,153 denominator
  verify (`VERIFY:` in `dimensionCoverage.ts`) — data-truth items, again not picked.
- **DC-01 / DC-02** — external Account Admin provisioning blocker, unchanged.
- **PaCMAP MN_ratio/FP_ratio tuning** — revisit only on owner UAT ask.
- **Focus-session camera restore** (CONCERNS §3.8), **default e2e dev harness** (§3.9),
  **cluster-label chips owner decision** (§3.10).
- **Standing:** COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01, MILESTONES v2.1/v2.2 backfill,
  v2.3 phase-dir prune, Phase-17 SPLIT-04 owner visual sign-off, per-folder terrain
  projection seed.
