# Phase 37: Scale Feasibility Spike & Fallback Ladder - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

One requirement: **SCALE-01**. Answer, with measured numbers on THIS machine (the
workshop machine — the local `:3000` box), whether cosmos.gl + the app's data path can
hold 4,862,301 activity-event points, and lock the shipped ladder rung as a recorded
owner decision. Three measurement tracks:

1. **Render track** — flag-gated spike route renders the full 4,862,301-point set
   (synthetic positions, real scale): fps at rest / pan+zoom / with ambient motion,
   GPU memory, context-loss behavior. Both ambient variants measured: CPU
   `pushPositions` full-set (expected fail — documents why) and GPU-side displacement
   (the L0 hope; owner accepted GPU-shader drift as a valid meaning of "all animated").
2. **Payload track** — raw typed-array columnar prototype (zero deps): bytes on wire,
   load + parse + GPU-upload time for positions + minimal attribute columns at 4.86M.
   Grounds the SCALE-02 time-to-graph budget set in Phase 38.
3. **Embedding track** — measured sample-fit runtimes (PaCMAP on samples, faiss kNN
   projection of remainder) to estimate full-corpus pipeline cost. Estimate only; the
   real pipeline is Phase 38.

Output: `37-BASELINE.md` (numbers) + ladder-rung owner sign-off (L0 all-animated →
L1 decimated ambient → L2 far-zoom LOD → L3 verb+month grain 106,196) captured in the
phase artifacts. Every later phase builds to the chosen rung.

**NOT this phase:** the real embedding pipeline, new Prisma table, production payload
route (Phase 38); any change to the live graph surface, user-instance retirement
(Phase 39); dimension/slider work (Phase 40); scrubber, e2e re-baseline, final gate
(Phase 41). No production surface changes — the spike route is invisible without its
flag.

**Trap:** `app/(dashboard)/access-analysis/` (23-panel charts page) ≠
`app/(dashboard)/users/access-analysis/` (spatial-graph shell — the spike's home).
`/users/spatial-graph` and `/users/access-analysis` render the same UI.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 37 entry — goal, 5 success criteria, SCALE-01 mapping.
- `.planning/REQUIREMENTS.md` v2.7 — census table (4,862,301 accds rows measured
  2026-07-21; 2,313 distinct authors; grain reference points 106,196 / 40,166), ladder
  definition, "Read Before Planning" facts 1–5.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — cosmos.gl v3 frozen-mode
  renderer; handle API `pushPositions(xyz)` (stride-3→stride-2 persistent buffer),
  `setColors(rgba)`, `setSimilarityLinks`, optional GPU cluster-anchor simulation via
  `gpuSimulation` prop (`mapDominantForceConfig` / `gpuLayout2D.ts`) — the existing
  GPU-side machinery the ambient prototype starts from.
- `app/(dashboard)/users/access-analysis/ambientMotion.ts` — three-tier fps controller
  (`createAmbientFpsController`, LOW_FPS=50, RECOVERY_FPS=55, window-based demote/
  promote) — reuse `observeWindow` for spike sampling; tier semantics unchanged.
- `app/(dashboard)/users/access-analysis/graphTestBridge.ts` — established
  `NEXT_PUBLIC_ACC_GRAPH_TEST` bridge exposing counters to Playwright; spike route
  should expose its measurements the same way.
- `scripts/measure-spatial-graph-baseline.cjs` + `tests/e2e/spatial-graph-baseline.spec.ts`
  — the established median-of-5 `:3100` time-to-graph methodology (Phase 33/36
  lineage); LIFE-03 fps methodology = ≥10 s sample, tier observed, recorded.
- `lib/server/graphSnapshotCompression.*` + `graphNodesFromCompactPayload.ts` — the
  Phase-36 compact JSON payload (sized for 22k; the thing binary columns replace at
  4.86M scale).
- `scripts/compute_instance_embeddings.py` — pacmap 0.9.1 + faiss-cpu installed;
  deterministic `random_state=42`, gate-conditional upsert lineage for the embedding
  track's sample-fit measurements.
- VERIFY: cosmos.gl v3.3.0's documented/practical point-count ceiling and whether
  `setPointPositions` accepts a 4.86M-point Float32Array without internal chunking —
  measure, don't assume; context-loss handling behavior at allocation failure.
- VERIFY: workshop-machine GPU model + VRAM (record in 37-BASELINE.md; 4.86M × stride-2
  Float32 positions = ~39 MB per buffer, plus colors RGBA = ~78 MB — theoretical, must
  be measured with cosmos internal buffers included).

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Zinc dark theme on the spike route (it's a dev surface but no reason to deviate);
  reduced-motion → static (ambient prototypes gated off).
- Spike flag follows the established `NEXT_PUBLIC_ACC_*` env-flag convention (e.g.
  `NEXT_PUBLIC_ACC_SCALE_SPIKE`), same pattern as `NEXT_PUBLIC_ACC_GRAPH_TEST` /
  `NEXT_PUBLIC_ACC_GPU_2D`; flag off = route absent/404, zero production impact.
- Synthetic positions: clustered Gaussian mixture (organic look, exercises overdraw
  realistically), deterministic seed so runs are comparable; attribute columns use
  REAL cardinalities from the census (2,313 authors, 956 projects, live verb set via
  a cheap `SELECT DISTINCT`).
- Measurements via `performance.now()` frame deltas + `observeWindow` (existing
  controller), ≥10 s samples, recorded as median + min; GPU memory via
  `WEBGL_debug_renderer_info` + allocation accounting (browser cannot read true VRAM —
  record what is measurable, label what is estimated).
- Isolated `:3100` production build for any timing that feeds budgets (dev-server
  numbers are not evidence — standing rule); PowerShell-only isolated builds.
- Commit by explicit path; tsc gate before any build; guard-bash denials intentional.
- Spike code committed (owner decision) but isolated: new files + the flag wire-up
  only; zero edits to live shell behavior with the flag off.
- Embedding sample-fit sizes: measured points at ~100k / 500k / 1M with wall-clock
  recorded, extrapolation labeled as estimate — never presented as a measured
  full-corpus figure.

</defaults>

<decisions>
## Locked Owner Choices (2026-07-21)

1. **Harness = committed flag-gated route** reusing `GraphCanvas2D` + `graphTestBridge`
   inside the repo — same build pipeline as production, re-runnable evidence. Not a
   throwaway external harness.
2. **Spike data = synthetic positions at real scale** (4,862,301 points, clustered,
   deterministic) + real attribute cardinalities. Embedding runtime measured separately
   on real-data samples. No waiting for the Phase-38 pipeline.
3. **GPU-shader ambient drift counts as L0 "all animated."** The spike prototypes
   GPU-side displacement; per-node CPU choreography detail is Phase-40 territory.
   CPU full-set push is still measured to document the ceiling honestly.
4. **Payload format = raw typed-array buffers, zero new dependencies** (Float32/Uint8/
   Uint32 columns + small JSON header, served as ArrayBuffer). Apache Arrow rejected
   unless raw buffers prove painful — revisit only on evidence, with owner approval
   (new-dep rule).
5. **Ladder sign-off format** (from milestone open, restated): rung chosen via an
   explicit owner checkpoint at phase end — numbers table from `37-BASELINE.md` + live
   spike-route demo on this machine; the decision and its evidence recorded in the
   phase artifacts. L0 all-animated → L1 all resident + decimated ambient → L2 all
   resident + far-zoom LOD rendering → L3 bounded grain user+project+verb+month
   (106,196; every activity still counted).

</decisions>
