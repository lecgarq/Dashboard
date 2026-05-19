---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-19T19:29:31Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-19)

**Core value:** The Access Analysis spatial graph reveals how people relate to projects through real math on real data — not vibes, not patches.
**Current focus:** Phase 2 — Physics Layer

## Current Position

Phase: 2 of 4 (Physics Layer) — COMPLETE
Plan: 2 of 2 in current phase — COMPLETE
Status: Phase 2 complete — physicsLayer.ts + tests (PHYS-01..05) green; ready for Phase 3 (render layer)
Last activity: 2026-05-19 — Phase 2 plan 02: physicsLayer.test.ts + physicsLayer.purity.test.ts (16 tests)

Progress: [█████░░░░░] 50% (4/4 plans complete in phases 1-2; phases 3-4 remaining)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~11 min
- Total execution time: ~33 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-math-foundation | 2 | ~30 min | ~15 min |
| 02-physics-layer | 2 | ~13 min | ~6.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (dataLayer), 01-02 (mathLayer), 02-01 (physicsLayer)
- Trend: On track

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Engine: Cosmograph/cosmos.gl disqualified (2D-only, no runtime force mutation). Engine is react-force-graph-2d + react-force-graph-3d v1.29.1.
- Topology: One node per (user, project) — not collapsed per user.
- Sliders: Additive blend formula `Σ(u_d × f_d × s_d) / Σ(s_d)` — not normalized to fixed budget; avoids slider-stealing.
- Filter/search: Alpha mask only — simulation NEVER restarts on filter.

### Decisions Made This Session

- **R = 300 world units** for seed positions (mathLayer.ts R_DEFAULT). Parameterized via `options.radius` for override.
- **z = 0 at seed time.** Physics layer handles z depth in 3D mode.
- **Monotonicity observable axis** (RESEARCH Open Question #2 resolved): sweep activity slider 0→1 with recency fixed at 1; distance from pure-recency endpoint (0, R) is monotonically non-decreasing.
- **Forbidden-term purity check** catches all mentions in JSDoc — mathLayer.ts comments must not contain the terms "react", "d3-force", "three", etc.
- **DuckDB tests use vi.mock not real WASM** — jsdom has no real Worker; all DuckDB-touching tests in repo use mocks. Established pattern for data layer tests.
- **positionsCache xyz breaking change** — packPositions/unpackPositions now use stride-3 (xyz) not stride-2 (xy). Phase 2 physics callers must allocate Float32Array(n*3).
- **INTERNAL_DOMAINS default is lecg.com** (exact match). Luis to confirm subdomains during Phase 2.
- **moduleWeights are uniform 1/N in Phase 1** — deferred to DC CSV join for real per-module activity weights.
- **Per-dim target derivation uses option-a** (02-01): computeTargetPositions called once per dim with slider[d]=1, all others=0. Caller produces TargetArrays before passing to createPhysicsLayer; mathLayer.ts unchanged.
- **d3-force-3d.d.ts co-located** with physicsLayer.ts — no tsconfig.json change needed; Next.js include paths cover the directory.
- **Cache-miss seed uses alpha(0.3).restart()** — satisfies PHYS-02 invariant (never bare restart()) even at initial construction.
- **PHYS-04 two-bus invariant structurally enforced** — setMask has zero references to sim, manyBody, or any d3 symbol.
- **Partial vi.mock of d3-force-3d** (02-02): wraps real exports to capture sim+manyBody refs in tests; no _unsafe_internals needed in production code.
- **d3-force-3d arity guard** (02-02): sim.force() wrapper must use arguments.length; passing origForce(name, undefined) with 2 args silently removes the force in d3.
- **force.strength()() double-call** (02-02): d3-force-3d strength getter returns constant() accessor, not the number; must call .strength()() to get value.
- **No-reheat test uses cache-hit path** (02-02): cache-hit sets frozen=true from construction; more reliable than re-freezing a cache-miss sim mid-test.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3 risk: 2D/3D shared graphData object reference behavior under project's node count (~500–6000) is not benchmarked. Prototype the switch mechanism early in Phase 3.
- Phase 4 risk: Lasso canvas-to-graph-space coordinate transform under pan/zoom is MEDIUM confidence (community gist). Validate immediately in 04-01.
- DuckDB-WASM main-thread blocking: duckdbClient.ts warmup pattern should be audited for DuckDBSharedWorker during Phase 1.

## Session Continuity

Last session: 2026-05-19
Stopped at: Completed 02-02-PLAN.md — physicsLayer PHYS-01..05 tests green; Phase 2 complete; ready for Phase 3
Resume file: None
