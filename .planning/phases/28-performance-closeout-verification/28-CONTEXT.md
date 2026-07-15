# Phase 28: Performance Closeout & Verification - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The final v2.4 phase. It closes the three remaining performance/fragility items
(PERF-01, PERF-03, PERF-04) against the **finished** dimension/layout feature set
shipped in Phases 24–27, and proves — by real re-measurement, not assumption — that
widening the dimension surface did not cost `/users/spatial-graph` its first paint.

Surface: `/users/spatial-graph` (= `/users/access-analysis`, the same shell via
`AccessAnalysisShellClient` → `AccessAnalysisShell` — **NOT** the 23-panel
`/access-analysis` charts page; name-collision trap). Plus two test/tooling files
(`tests/e2e/acc-dc-graph.spec.ts`, `scripts/measure-spatial-graph-baseline.cjs`) and
one dead-but-guarded client hook (`useHybridAnalytics.ts`).

**What changes:**
- PERF-01: the mount-time DuckDB-Wasm warm-up `useEffect` in `useHybridAnalytics.ts`
  is moved off the render critical path (idle-callback guard), and the fact that the
  live spatial-graph path is *already* DuckDB-free by default is documented.
- PERF-03: the **default 2D lasso** e2e is verified green under the reliable prod
  `:3100` harness, warm-cache.
- PERF-04: the committed baseline script is re-run and its median compared to the
  Phase-24 6193.2 ms figure with a stated tolerance, plus one live-UX reading.

**What does NOT change (adjacent-phase ownership):**
- No new dimensions, controls, layout behavior, or catalog work — that was
  Phases 25 (aperture), 26 (catalog wall), 27 (force-anchor layout + PERF-02 reheat
  guard). Phase 28 verifies *around* them; it does not extend them.
- The parked 3D graph stays parked. `NEXT_PUBLIC_ACC_3D_GRAPH` is **not** enabled for
  shipping; the literal `acc-3d-lasso.spec.ts` (3D-only, `test.skip(!ACC_3D_GRAPH)`)
  is **not** the PERF-03 target (owner decision — see Decisions).
- No new data source, loader, Prisma table, or npm dependency (milestone guardrail).
- The `next dev --webpack` infra bug is **not** fixed here — routed around, not
  repaired (owner decision).

Requirements: PERF-01 (DuckDB warm-up off critical path), PERF-03 (lasso e2e reliable),
PERF-04 (first paint no-regression vs the Phase-24 baseline).

</domain>

<evidence>
## Grounding Sources

- `.planning/phases/24-baseline-dimension-id-unification/24-BASELINE.md` — the
  **only** valid PERF-04 baseline. Judged metric: **median time-to-graph-rendered
  6193.2 ms** (N=5, isolated `:3100` prod build, cosmos.gl 3.3.0, GRAPH_TEST=1 frozen
  static-layer path, GPU sim OFF). Supporting first-paint median 644 ms. Contains the
  verbatim re-run instructions Phase 28 must follow. The stale pre-milestone ~0.46s
  figure is **superseded — do not cite it.**
- `scripts/measure-spatial-graph-baseline.cjs` — the committed, re-runnable
  orchestrator (preflights `:3100`, records cosmos version/BUILD_ID/commit, runs the
  N=5 Playwright spec `tests/e2e/spatial-graph-baseline.spec.ts`, prints merged JSON).
  Does NOT build/start the server — that stays an explicit owner-visible step.
- `.planning/codebase/CONCERNS.md` §3.1 (DuckDB warm-up, lines 122–128), §3.4 (lasso
  e2e 120s flake, lines 146–149). §3.2 (reheat) already **closed in Phase 27**.
  Line 451 assigns §3.1/§3.4 to Phase 28; §3.5 (prefetch guard) stays a future seed.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:85–89, 603–711` —
  the live "light-speed" default path (`USE_JS_SNAPSHOT`, on unless
  `NEXT_PUBLIC_ACC_JS_SNAPSHOT="0"`) builds nodes/features in pure JS and **never boots
  DuckDB-WASM on the critical path**. DuckDB only loads on the critical path in the
  non-default legacy branch (`getDuckDbClient()` in the `Promise.all` at `:611–612`).
- `app/(dashboard)/users/access-analysis/useHybridAnalytics.ts:137–142` — the mount-time
  warm-up `useEffect` firing `getDuckDbClient()`. This hook is used only by
  `HybridAnalyticsSurface` → `DeferredAnalyticsSection` → `AccessAnalysisPage`, and
  **`AccessAnalysisPage` is imported by nothing live** (verified: grep across
  `app/ components/ lib/` returns only its own definition + tests). This is a real
  dead surface (unmounted since v2.2 Ph17's SPLIT-03/04). The idle-guard is defensive
  hardening + literal §3.1 closure, not a live first-paint win (that already exists).
- `tests/e2e/acc-dc-graph.spec.ts:537` — `test("lasso drag selects a proper subset and
  renders the selection pie panel")` — the **default-path (2D)** lasso, and the actual
  subject of the load-flake memory note (`[[project_lasso_e2e_load_flake]]`, F1 shipped:
  leaner `lassoProbe.ts` grid; passes green warm-cache).
- `tests/e2e/acc-3d-lasso.spec.ts:5,53` — 3D-only, `test.skip(!ACC_3D_GRAPH)` where
  `ACC_3D_GRAPH = NEXT_PUBLIC_ACC_3D_GRAPH === "1"`. Skips entirely by default.
- `playwright.config.ts:37` — default webServer = `next dev --webpack` (the broken
  pg/fs-bundling path that 500s every request). `playwright.verify.config.ts` — no
  webServer; runs specs against an **out-of-band prod `next start` on `:3100`**
  (`NEXT_DIST_DIR=.next-e2e`, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, minted-cookie auth via
  `playwright/global-setup.ts`). This is the reliable harness the baseline and
  cluster-label specs already use.
- `.planning/STATE.md` — Phase 27 complete/deployed at BUILD_ID `kZKWbfeAqYW1R4bYrUx2U`;
  cosmos.gl pinned at 3.3.0 (patch applied); Phase 28 open-risk note on PERF-03/infra.

VERIFY: the exact warm-cache pre-step that makes `acc-dc-graph.spec.ts:537` reliable
(memory note RC6: `bulkUsers` cold-cache ~52s can blow the 120s gate on a cold-first
run — pre-warm by running a cheaper spec/graph load first, or run on an idle machine;
do NOT raise the timeout as the first fix).

</evidence>

<defaults>
## Inferred Dashboard Defaults

- `npx tsc --noEmit` green before any rebuild; existing characterization tests
  (TEST-01/02/03) stay green and byte-identical; `npm test` green (roadmap SC#4).
- Zinc theme untouched; no new WebGL; no new dependency/loader/Prisma table
  (milestone guardrails — Phase 28 is verification, so most touch zero UI).
- Prod `:3100` measurement/e2e never disrupts the always-on `:3000` service; the
  `.next/BUILD_ID` is verified unchanged before and after any isolated build (the
  baseline file's own re-run discipline).
- PERF-04 re-run uses the **identical** committed script and GRAPH_TEST=1 frozen path
  so the comparison is apples-to-apples (the baseline file mandates this; a live GPU
  number is captured *separately* as context, never as the regression basis).
- Report regressions vs pre-existing flakes separately; never claim an e2e/build/probe
  passed without concrete output.

</defaults>

<decisions>
## Implementation Decisions

### PERF-01 — DuckDB warm-up: idle-guard + document (owner choice)
The live spatial-graph critical path **already avoids DuckDB boot** by default
(`AccessAnalysisShell` JS-snapshot win). The only remaining mount-time warm-up
`useEffect` (`useHybridAnalytics.ts:139–140`) is on the **unmounted** `HybridAnalyticsSurface`.
Phase 28 will:
1. Wrap that warm-up in a `requestIdleCallback` (with a `setTimeout` fallback for
   browsers/JSDOM lacking it) so it can never block a render critical path — closing
   CONCERNS §3.1 **literally** and defending any future remount of the surface.
2. **Document** in `28-VERIFICATION.md` that the live `/users/spatial-graph` mount is
   already DuckDB-free on the critical path (cite `AccessAnalysisShell.tsx:85–89`,
   `603–711`), so §3.1 is closed by prior work + this guard — not by a first-paint win
   this phase invents.
Rejected: server-precomputing the distribution snapshot (heavy, touches the data path
for a dead surface — overkill). Rejected: verify-and-document only (leaves the literal
`useEffect` un-guarded against a future remount).

Claude's discretion: exact idle-guard shape (cleanup on unmount, cancel token) and
whether the existing `HybridAnalyticsSurface.mainQuery`/`.fallback` tests need a small
non-behavioral touch to stay byte-identical under the guard — keep them green; do not
rewrite them.

### PERF-03 target — the default 2D lasso, not the parked 3D spec (owner choice)
The regression target is **`tests/e2e/acc-dc-graph.spec.ts:537`** ("lasso drag selects a
proper subset and renders the selection pie panel") — the lasso users actually get on the
default 2D embedding graph. The literal `acc-3d-lasso.spec.ts` tests the **parked** 3D
feature (skips unless `NEXT_PUBLIC_ACC_3D_GRAPH=1`) and is **not** run/enabled — enabling
3D contradicts the milestone's "3D stays parked" scope. CONCERNS §3.4 names the 3D file,
but the owner's verification intent is the shipping path; note this reinterpretation in
the plan so the file-name mismatch is explicit, not silent.

### PERF-03 harness — route around via prod `:3100`, do NOT fix `next dev` (owner choice)
Run the lasso e2e under **`playwright.verify.config.ts`** against an out-of-band prod
`next start` on `:3100` (the exact mechanism the baseline + cluster-label specs already
use reliably). The standing `next dev --webpack` pg/fs-bundling infra bug is **routed
around, not repaired** this phase. "Reliably" = the lasso test passes green **warm-cache**
(pre-warm `bulkUsers` per the memory-note RC6 caveat) across a small repeat count the
planner picks (e.g. 3 consecutive green runs) within its time budget — the load-flake is
a machine-load/cold-cache artifact, so the pass condition is warm-cache stability, not a
raised timeout.

Claude's discretion: the pre-warm step, the repeat count that constitutes "reliable," and
whether to run on an idle machine window.

### PERF-04 pass bar — ±10% tolerance gate + a live GPU reading for context (owner choice)
Re-run `scripts/measure-spatial-graph-baseline.cjs` (identical GRAPH_TEST=1 frozen path,
N=5) after all v2.4 changes and compare **median time-to-graph-rendered**:
- **PASS** if the new median ≤ **~6812 ms** (baseline 6193.2 ms + 10% for run-to-run
  noise). If it exceeds that, record it as a **finding to investigate** before closing —
  not an automatic milestone fail.
- **Also capture one live GPU-sim reading** — the default `:3000` behavior (GPU 2D sim
  ON, i.e. `NEXT_PUBLIC_ACC_GRAPH_TEST` unset) — as honest UX context in
  `28-VERIFICATION.md`. This live number is **context only**; the ±10% frozen-path
  comparison is the actual regression gate (the baseline caveat forbids mixing paths).
Record cosmos.gl version, BUILD_ID, commit, and node count with the result, mirroring
`24-BASELINE.md`. Rejected: strict no-regression (would fail on measurement noise alone).

Claude's discretion: exact tolerance arithmetic display, and how the single live GPU
reading is captured (one instrumented load is enough — it is not a judged N=5 metric).

</decisions>

<workshop>
## Workshop Impact

Near-zero visible change — this phase is the milestone's honesty/verification close, not
a feature. The payoff for the workshop presenter is confidence: a proven no-regression
first paint, a reliably-green lasso demo path, and a DuckDB warm-up that can never stall
the graph even if the analytics surface is ever remounted. The presenter should notice
nothing different on `/users/spatial-graph`; that is the success condition.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Source stays `accDcGraph.bulkUsers` + offline `AccInstanceEmbedding`.
- PERF-04 honesty is load-bearing: the frozen-path re-measure (GRAPH_TEST=1) is the only
  valid regression comparison to the baseline; the live GPU reading is disclosed as a
  *different code path* and never substituted for the gate. Do not paraphrase away the
  baseline file's two verbatim caveats.
- If PERF-03's lasso cannot be made reliably green even warm-cache under the prod harness,
  say so plainly and record it as unresolved — do not weaken the assertion or touch the
  physics/freeze/lasso path to mask a load flake (memory-note standing guidance).

</data_truth>

<deferred>
## Deferred Ideas

- **Fix `next dev --webpack`** (pg/fs webpack bundling 500s) — routed around this phase;
  stays a standing infra seed (REQUIREMENTS.md "Future Requirements").
- **3D graph revival + its `acc-3d-lasso.spec.ts`** — parked; separate future decision.
- **Server-precomputed distribution snapshot** for the analytics surface — only if that
  surface is ever remounted and DuckDB warm-up becomes a real critical-path cost.
- **CONCERNS §3.5** prefetch-regression guard, **§8.2/8.3** >100KB test-file splits —
  explicitly out of v2.4 scope (owner approved §3.1–3.4 only).

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` green; `npm test` green; TEST-01/02/03 byte-identical (SC#4).
- PERF-01: the warm-up `useEffect` is idle-guarded; a focused test or the existing
  `HybridAnalyticsSurface.mainQuery`/`.fallback` tests stay green; the DuckDB-free live
  critical path is documented with file:line citations.
- PERF-03: `acc-dc-graph.spec.ts:537` runs green warm-cache under
  `playwright.verify.config.ts` on prod `:3100` across the planner's chosen repeat count,
  with the `[lasso] projected cloud=`/`dense=` diagnostics captured as proof.
- PERF-04: re-run median recorded vs 6193.2 ms with the ±10% verdict, conditions block
  (cosmos version/BUILD_ID/commit/node count), and the separate live GPU reading; live
  `:3000` `.next/BUILD_ID` verified unchanged before/after the isolated build.
- Written into `28-VERIFICATION.md`; PERF-01/03/04 checkboxes flipped in REQUIREMENTS.md
  traceability only on real evidence; then milestone-close is the next step (out of this
  phase).

</verification>

---

*Phase: 28-performance-closeout-verification*
*Context gathered: 2026-07-15*
