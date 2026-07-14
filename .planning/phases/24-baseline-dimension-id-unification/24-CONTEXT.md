# Phase 24: Baseline & Dimension ID Unification - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture the honest first-paint/graph-rendered baseline for `/users/spatial-graph` BEFORE any
other v2.4 change lands (the number Phase 28's PERF-04 regression check judges against), and
unify the two divergent dimension id-spaces — `groupByDimensions.ts` catalog ids and
`nodeColors.ts` registry ids — into one source, so Phase 25's widening has one list to widen.
Fix the stale `dimensionRegistry.ts:317-322` doc claim (DIM-06). Widening the aperture,
rendering the catalog sidebar, and layout changes are Phases 25–27.

</domain>

<evidence>
## Grounding Sources

- `.planning/STATE.md` — v2.4 grounding facts: the two hardcoded 3-string arrays live at
  `groupByDimensions.ts:10` (`PRESETS`, catalog id-space) and `nodeColors.ts:62`
  (`COLOR_MODES`, registry id-space); they are two id-spaces sharing three names. Stale doc
  comment at `dimensionRegistry.ts:317-322`. Name-collision trap:
  `app/(dashboard)/access-analysis` (charts page) ≠ `app/(dashboard)/users/access-analysis`
  (spatial-graph shell); `/users/spatial-graph` and `/users/access-analysis` render the same
  `AccessAnalysisShellClient`.
- `.planning/ROADMAP.md` Phase 24 — 4 success criteria: baseline measured before anything
  changes (not the stale ~0.46s figure), single unified id-space, doc comment corrected or
  split collapsed, tsc + tests green.
- `.planning/REQUIREMENTS.md` — DIM-03, DIM-06 text and the "TWO ID-SPACES, NOT ONE" warning.
- **The cosmos.gl 3.3.0 blocker recorded in STATE.md is RESOLVED** — owner committed the
  dependency refresh (`0bfe0962`, includes `@cosmos.gl/graph` 3.3.0 + patch) and deployed to
  `:3000` on 2026-07-14. Post-swap verification: tsc 0 errors, vitest 2535 green, WebGL e2e
  on isolated `:3100`. Node count drifted 16,942 → **22,279** (pre-existing drift, not
  app-code change). The baseline is therefore measured against cosmos.gl **3.3.0** and the
  22,279-node graph, and must record both.
- Existing e2e infra: `npm run test:e2e` runs against an isolated `:3100` webpack prod build
  with minted NextAuth cookie auth (`NEXT_PUBLIC_ACC_GRAPH_TEST`) — the measurement script
  should reuse this mechanism.
- VERIFY: exact auth/bootstrap steps the measurement script needs to load
  `/users/spatial-graph` on `:3100` — confirm against the existing e2e setup files during
  planning, do not invent new auth.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- No visual redesign: this phase changes plumbing and adds a measurement script only. Zinc
  theme, motion, and the spatial-graph UI are untouched.
- No new WebGL, no new Prisma tables, no new loaders — `accDcGraph.bulkUsers` +
  `instanceEmbedding` unchanged.
- `/access-analysis` (the 23-panel charts page) untouched — the work lives under
  `app/(dashboard)/users/` and `components/`/`lib/` dimension modules.
- Gates: `npx tsc --noEmit` and `npm test` green; never `npm run build` while `:3000` is live
  (build for measurement goes to the isolated `:3100` dist, same as the e2e preview flow).

</defaults>

<decisions>
## Implementation Decisions

### Baseline measurement protocol
- Record BOTH page first-paint and time-to-graph-visibly-rendered (nodes drawn on canvas).
- **Phase 28's no-regression check judges time-to-graph-rendered**; first-paint is recorded
  as supporting context.
- Environment: **isolated `:3100` webpack prod build** (same build+`next start` mechanism the
  e2e suite uses). Not live `:3000`.
- Do NOT reuse the stale pre-milestone ~0.46s figure for anything.

### Repeatability
- A **committed measurement script** (Playwright against `:3100`, under `scripts/`) that
  outputs the timings; Phase 28 re-runs the identical script.
- Median of N runs (N≈5), cold-start noted.
- Recorded alongside the number: cosmos.gl version (3.3.0), node count (expected 22,279),
  `.next/BUILD_ID`, commit hash, and date — in the phase planning docs.

### Unification direction
- **Catalog ids become the single id-space.** Registry entries map onto catalog ids;
  Group-by AND Color-by both resolve their option lists from the catalog.
- `dimensionRegistry.ts` is NOT retired in this phase — DIM-06 is satisfied by correcting the
  doc comment to state real ownership (registry = color + filter chips; catalog = sliders,
  grouping, clustering, and now the id-space of record). Full collapse deferred.
- Phases 25/26 widen ONE list (the catalog-resolved aperture), which is what the roadmap's
  dependency notes assume.

### Behavior-invariance bar
- **Pixel-identical UI.** Group-by/Color-by show the same 3 options, same labels, same order;
  grouping and coloring output byte-identical. Existing dimension tests stay green untouched
  (no test rewrites to accommodate drift).
- Any visible change belongs to Phase 25.

### Sequencing within the phase
- Measurement lands FIRST (Plan 1), before the unification refactor touches any runtime file
  — "measure before anything changes" applies inside the phase too.

### Claude's Discretion
- Exact script name/location under `scripts/`, timing instrumentation approach (Playwright
  trace vs performance marks), and how graph-rendered is detected (canvas draw signal vs
  existing test hooks) — as long as Phase 28 can re-run it identically.
- Internal shape of the catalog→registry mapping (lookup table, resolver function), as long
  as one id-space is the source of truth and the UI is invariant.

</decisions>

<specifics>
## Specific Ideas

- The baseline is "the honest number this milestone will be judged against" — treat the
  measurement record as a first-class artifact, not a scratch note.

</specifics>

<workshop>
## Workshop Impact

- Surface: `/users/spatial-graph` (and its alias `/users/access-analysis`) — but Phase 24 is
  intentionally invisible in the demo: identical UI, identical behavior.
- Value delivered: the credibility of every later v2.4 phase — a real before/after perf story
  and a single dimension vocabulary that Phases 25–27 build on without doubling divergence.

</workshop>

<data_truth>
## Data Truthfulness

- No data changes. Same Prisma sources (`accDcGraph.bulkUsers`, `AccInstanceEmbedding`).
- The baseline record must state its own conditions honestly: cosmos.gl 3.3.0, 22,279 nodes
  (drifted from the previously-cited 16,942), BUILD_ID, commit.

</data_truth>

<deferred>
## Deferred Ideas

- Full registry retirement (folding color/filter-chip metadata into the catalog) — natural
  follow-on once Phase 25/26 prove the catalog-as-source direction; not this phase.
- None new from discussion — stayed within phase scope.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` passes; `npm test` green with no regression to dimension tests.
- Measurement script runs end-to-end against the `:3100` prod build and its output (both
  metrics, median-of-N, environment record) is committed to the phase docs.
- Group-by/Color-by verified pixel-identical (same 3 options, same output) after unification.
- `dimensionRegistry.ts:317-322` doc comment states real ownership.
- Dashboard guardrails: zinc theme untouched, no new WebGL, `/access-analysis` charts page
  untouched; never build while `:3000` is live.

</verification>

---

*Phase: 24-baseline-dimension-id-unification*
*Context gathered: 2026-07-14*
