# Requirements: LECG Dashboard — v2.6 Full-Rate Graph

**Defined:** 2026-07-20
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric
derivable from the local Prisma DB and honest about coverage.
**Source:** owner scope selection 2026-07-20 (seeded from the v2.5 close's Deferred Items +
CONCERNS Ph30/Ph32/Ph33 debt): renderer rethink headline + health sweep supporting, hard
≥50fps Tier-0 bar. Tier-3 dims and data-truth items explicitly not picked this cycle.
**Prior milestone:** v2.5 Living Graph (16/16 shipped 2026-07-20) — requirements archived to
`.planning/milestones/v2.5-REQUIREMENTS.md`, retrospective in `MILESTONES.md`.

**Milestone goal:** The similarity web renders off the Canvas2D rasterization ceiling so that
full ambient life + the full 14.2k-link web sustain **≥50 fps at Tier 0** on the workshop
machine — the hard gate v2.5's LIFE-03 could not pass — and the repo's automated suites can
gate again (e2e re-baselined, unit suite fully green, guard-bash powershell gap closed,
embedding pipeline pruned).

---

## ⚠️ Read Before Planning

Verified at the v2.5 close (2026-07-20); primary evidence `MILESTONES.md` v2.5 retrospective
and CONCERNS Ph32/Ph33 roll-forwards. Phase dirs 29–33 are pruned from disk — `33-BASELINE.md`
(LINK-PERF profiling evidence) lives in git history, last present at commit `27297514`.

1. **NAME COLLISION (standing).** `app/(dashboard)/access-analysis/` is the 23-panel charts
   page. `app/(dashboard)/users/access-analysis/` is the **spatial-graph shell** this
   milestone touches. `/users/spatial-graph` and `/users/access-analysis` render the same UI.

2. **The ceiling is rasterization, not JS.** LINK-PERF profiling: JS tick ~1.4 ms/draw vs
   ~40 ms/frame Canvas2D raster for the 14.2k-bezier web (`SimilarityWebOverlay.tsx` — a
   separate Canvas2D overlay; cosmos itself draws zero links on the live path). The shipped
   mitigations (ambient-only ~10 Hz redraw throttle + Path2D batching + empty-stroke skip)
   banked +94% → 41.33 fps and are the last cheap levers. The three renderer levers on the
   table: **OffscreenCanvas worker rasterization**, **cosmos-native links**, **zoom-based
   edge decimation**.

3. **The render contract is FROZEN.** cosmos.gl runs `enableSimulation:false`; all motion is
   CPU/rAF `pushPositions` on the static layer. PERF-02 frozen-handle invariant
   (`GraphCanvas.test.ts`) must stay green. If the cosmos-native-links lever is chosen, it
   must not start the simulation or mutate cluster/anchor/config state.

4. **Phase-32 link expression is a shipped visual contract.** Real-score weak/medium/strong
   bands at locked boundaries, monotone width/alpha, ambient<selected<hover draw order,
   25%-opacity-floor morph web, reduced-motion snap — pinned by `similarityWeb.test.ts`.
   The renderer rethink changes *where* pixels are produced, not *what* they express.

5. **The three-tier fps controller ships today** (Tier 0 full → 1 reduced → 2 static) and
   degrades below 50 fps by design. v2.6 keeps it as the safety net for non-workshop
   machines; the gate is that it **never engages on the workshop machine**.

6. **e2e drift is pre-existing, not renderer-caused.** `acc-dc-graph.spec.ts`: 14 failures
   from node count 16,942→22,279 + dead physics-shell sidebar testids; Ph30 additionally
   proved the curated-slider selectors ("User name thumb") dead — the real path is
   `group-by-select` + "Grouping strength thumb". Re-baseline before renderer work so the
   suite can gate it.

**Overarching guardrails:** no new data source, no new Prisma table or migration, zero new
npm dependencies without explicit owner approval (OffscreenCanvas is a web platform API;
cosmos-native links use the installed cosmos.gl). No new WebGL on data surfaces (the spatial
graph already runs cosmos.gl). Zinc theme preserved; `prefers-reduced-motion` → fully static
graph. Existing characterization tests (TEST-01/02/03) and the PERF-02 frozen-handle
invariant stay green. `npx tsc --noEmit` before any rebuild. Layouts stay organic — never a
fixed grid. Isolated builds are **PowerShell-only**, single-quoted from bash (v2.5 trap #2).

---

## v2.6 Requirements

Each maps to exactly one roadmap phase (numbering continues from Phase 33 → **starts at
Phase 34**).

### Renderer (REND)

Data authority for all REND requirements: the existing similarity edge set —
`AccInstanceEmbedding.neighbors` (v2.5 de-twinned payload) → `similarityEdgeSet.ts` →
`SimilarityWebOverlay.tsx`. No new data; the rethink changes rendering architecture only.

- [ ] **REND-01**: The similarity web renders **off the main-thread Canvas2D raster path**.
      The three levers (OffscreenCanvas worker rasterization, cosmos-native links,
      zoom-based edge decimation — alone or combined) are prototyped and measured against
      the live 14.2k-link web; the chosen approach is implemented and the decision recorded
      with the measured numbers (not vibes). Main-thread raster cost measurably drops vs
      the 33-BASELINE ~40 ms/frame figure.

- [ ] **REND-02**: **Hard perf gate, measured last:** Tier-0 full ambient motion + the full
      link web sustain **≥50 fps** on the workshop machine at the full 22,279-node /
      ~14.2k-link set, measured with the LIFE-03 methodology (≥10 s sample, recorded in the
      phase verification). The three-tier controller stays in place as the safety net but is
      **observed not to engage** on the workshop machine during the sample. This is the gate
      v2.5 closed via its degradation clause; v2.6 exists to pass it outright.

- [ ] **REND-03**: The **Phase-32 visual contract survives the renderer swap** — real-score
      strength bands at the locked boundaries, monotone width/alpha, ambient<selected<hover
      draw order, the 25%-opacity-floor morph web, and reduced-motion snap all behave
      identically on the new renderer; `similarityWeb.test.ts` pins stay green (extended,
      not weakened, where the renderer boundary moves) and the PERF-02 frozen-handle
      invariant stays green.

### E2E Health (E2E)

Data authority: the existing Playwright suite + isolated `:3100` prod-build harness
(`NEXT_PUBLIC_ACC_GRAPH_TEST`, minted NextAuth cookie auth).

- [x] **E2E-01**: `tests/e2e/acc-dc-graph.spec.ts` is **re-baselined and green** on an
      isolated `:3100` production build — node-count expectations updated to the live
      22,279-node snapshot, dead physics-shell sidebar testids and curated-slider selectors
      ("User name thumb") replaced with the real v2.4+ surface (`group-by-select`,
      "Grouping strength thumb"); 0 of the 14 pre-existing drift failures remain. The suite
      can gate the v2.6 renderer phases.

- [x] **E2E-02**: The lasso e2e flake is closed (CONCERNS §3.4) — `acc-3d-lasso.spec.ts` no
      longer times out at the 120 s global budget under machine load (scoped timeout /
      `test.slow()` / reduced fixture, whichever the evidence supports); passes recorded on
      consecutive runs.

### Unit Suite (TEST — continues v2.1 numbering)

- [x] **TEST-04**: The 3 pre-existing `usePredicateEngine` banded-catalog aperture failures
      (proven pre-existing WIP at v2.4 Phase 25, stash-and-rerun) are resolved — code fixed
      or the tests corrected against real intended behavior, with the rationale recorded —
      so `npm test` is **fully green** with zero carried failures.

### Tooling Guard (GUARD)

Data authority: `.claude/hooks/guard-bash.cjs` (existing PreToolUse hook).

- [x] **GUARD-01**: The guard-bash powershell-wrap gap is closed — `powershell -Command`
      invocations that wrap `next build`/`npm run build` are denied while `:3000` serves,
      same as bare invocations; the double-quoted-`$env:`-expands-empty trap is documented
      at the rule. A regression check (hook unit test or recorded manual matrix) covers the
      wrapped forms. This gap overwrote the live `.next` once during Phase 33.

### Pipeline Hygiene (PIPE — continues v2.3 numbering)

Data authority: `AccInstanceEmbedding` (Prisma) + `scripts/compute_instance_embeddings.py`
upsert path.

- [x] **PIPE-02**: The embedding pipeline **prunes stale rows** — after each run, rows whose
      nodeId is absent from the current run's snapshot set are deleted (983 stale old-shape
      rows today → 0 after the first pruned run); the prune count is reported in the run
      output. Delete-only, additive to the existing gate-conditional upsert — a trustworthiness
      regression still aborts before any write, including the prune.

---

## Coverage

8 requirements — E2E-01/02, TEST-04, GUARD-01, PIPE-02 → Phase 34 · REND-01/03 → Phase 35 ·
REND-02 → Phase 36. **8/8 mapped, each to exactly one phase.**

## Deferred (recorded, not planned)

- **Tier-3 graph dims** — ISSUE-GRAPH-01 (`AccIssue.createdBy`→`AccDcUser` resolution-rate
  spike is the v2.7 entry ticket) + TIME-01 temporal scrubber → v2.7 candidates.
- **SVC-01** service-override attribution refinement; **DIM-05** 550/1,153 denominator verify
  (`VERIFY:` in `dimensionCoverage.ts`) — data-truth items, not picked this cycle.
- **DC-01 / DC-02** — external Account Admin provisioning blocker, unchanged.
- **PaCMAP MN_ratio/FP_ratio tuning** — package defaults; revisit only on owner UAT ask.
- **Standing:** COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01 (CONCERNS §8.2/8.3 giant test
  files — NOT covered by E2E-01, which re-baselines assertions without splitting files),
  MILESTONES v2.1/v2.2 backfill, v2.3 phase-dir prune, Phase-17 SPLIT-04 owner visual
  sign-off, per-folder terrain projection seed.
