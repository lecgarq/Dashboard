---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-19T22:45:19.590Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-19)

**Core value:** The Access Analysis spatial graph reveals how people relate to projects through real math on real data — not vibes, not patches.
**Current focus:** Phase 3 — Render Layer (COMPLETE)

## Current Position

Phase: 3 of 4 (Render Layer) — COMPLETE
Plan: 2 of 2 in current phase — COMPLETE (03-02)
Status: Phase 3 complete — GraphCanvas3D + mode transitions + 12 tests green; ready for Phase 4 (Interactions)
Last activity: 2026-05-19 — Phase 3 plan 02: GraphCanvas3D.tsx + GraphCanvas.tsx updated + GraphCanvas3D.test.ts (12 tests)

Progress: [███████░░░] 75% (6/6 plans complete across phases 1-3; Phase 4 pending)

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
- Last 5 plans: 01-01 (dataLayer), 01-02 (mathLayer), 02-01 (physicsLayer), 02-02 (physicsLayer tests), 03-01 (GraphCanvas 2D)
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

### Decisions Made in Phase 03 Plan 01

- **REND-01 amended**: cosmos.gl v3 frozen mode replaces react-force-graph-2d v1.29.1 per CONTEXT.md 2026-05-19.
- **lastMaskVersionRef initialized at loop start** to physics.maskVersion to prevent spurious onMaskChange on first tick.
- **graph.ready Promise guard** in GraphCanvas2D protects against cosmos.gl async init queue limit (Pitfall 3).
- **Plain object ref `{ current: div }`** used in tests instead of createRef — React 19 makes `current` non-configurable.

### Decisions Made in Phase 03 Plan 02

- **REND-02 amended**: three.js r184 InstancedMesh + OrbitControls (cosmograph has no 3D mode; replaced 2026-05-19).
- **easeInOutCubic for 600ms tilt** (2D→3D) — smooth symmetrical entry; easeOutCubic for 400ms flatten (3D→2D) — snappy return.
- **Per-instance alpha baked into RGB color** (not material.opacity) — MeshBasicMaterial.opacity is global; per-node dim requires color × 0.15.
- **ResizeObserver stubbed in tests** — not in jsdom; fixed with `vi.stubGlobal("ResizeObserver", FakeResizeObserver)`.
- **ES6 class mocks for three.js** — `vi.fn().mockImplementation()` arrow functions cannot be called with `new`; must use class syntax in vi.mock factory.
- **GraphCanvas3D always-mounted** — unconditional render inside visibility-toggled container3DRef; no `{mode === '3d' && ...}` conditional.
- **Phase 3 COMPLETE**: GraphCanvas + GraphCanvas2D + GraphCanvas3D + useGraphRafLoop + 20 total tests; REND-01 through REND-05 addressed.

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

- Phase 3 risk (RESOLVED): CSS visibility swap + always-mounted pattern confirmed working; no context loss on mode switch.
- Phase 4 risk: Lasso canvas-to-graph-space coordinate transform under pan/zoom is MEDIUM confidence (community gist). Validate immediately in 04-01.
- DuckDB-WASM main-thread blocking: duckdbClient.ts warmup pattern should be audited for DuckDBSharedWorker during Phase 1.

## Session Continuity

Last session: 2026-05-19
Stopped at: Completed 03-02-PLAN.md — GraphCanvas3D.tsx + GraphCanvas.tsx updated + 12 tests; REND-02 amended; Phase 3 complete; ready for Phase 4 (Interactions)
Resume file: None

## Session Continuity

Last session: 2026-05-19
Stopped at: Completed 03-01-PLAN.md — GraphCanvas + GraphCanvas2D + useGraphRafLoop + 8 tests; REND-01 amended; ready for Phase 3 Plan 02
Resume file: None
