---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-19T17:33:00Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 8
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-19)

**Core value:** The Access Analysis spatial graph reveals how people relate to projects through real math on real data — not vibes, not patches.
**Current focus:** Phase 3 — Render Layer (COMPLETE)

## Current Position

Phase: 4 of 4 (Interactions + Analytics Bridge) — IN PROGRESS
Plan: 1 of 2 in current phase — COMPLETE (04-01)
Status: 04-01 complete — interaction layer (predicate engine + lasso + tooltip + cosmos/three event wiring) shipped; 135 access-analysis tests green; ready for 04-02 chrome
Last activity: 2026-05-19 — Phase 4 plan 01: usePredicateEngine + LassoOverlay + NodeTooltip + GraphInteractions + featureSnapshot + Canvas handle extensions + 15 new assertions

Progress: [████████░░] 88% (7/8 plans complete across phases 1-4)

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

### Decisions Made in Phase 04 Plan 01

- **Single predicate engine pattern locked.** One usePredicateEngine effect ≡ one physics.setMask call; collapses filter/search/lasso/drill/isolate into one channel. Verified by source-level grep (PHYS-04 invariant — zero sim symbols inside usePredicateEngine.ts).
- **forwardRef on GraphCanvas** exposing discriminated `GraphCanvasHandle = { mode: "2d", handle } | { mode: "3d", handle }` — picked over cloneElement injection for cleaner ref ownership in GraphInteractions.
- **Ref-indirect event handlers (cosmos.gl + three.js).** Both renderers use `handlersRef.current = h` via setEventHandlers; cosmos.gl config is set once at construction and never re-issued (Pitfall 5).
- **three.js hover raycast is rAF-coalesced** (Pitfall 6): pointermove writes pendingEvent; raycast runs at most once per frame against the InstancedMesh.
- **LassoOverlay disabled in 3D for v1** — only rendered when `mode==='2d' && lassoActive`. Lasso path stored in useRef[<number[]>]() not React state (anti-pattern: pointer events fire 60+Hz).
- **NodeTooltip uses createPortal to document.body** + fixed positioning; viewport-clamped. Radix Tooltip primitive does not fit (no DOM anchor for canvas-rendered nodes).
- **Search debounce 100ms via local useDebounced hook** inside GraphInteractions — deterministic for tests, simpler than useDeferredValue.
- **DuckDB BigInt→Number cast pattern** (featureSnapshot.ts): activity_count + last_signin_days normalized to Number on read (Pitfall 2).
- **Activity buckets: None=0, Low=1-10, Med=11-100, High=101+; signin buckets <7d/<30d/<90d/>90d** — defaults per RESEARCH Open Q#2.
- **Test infrastructure deviations (tests-only):** HTMLCanvasElement.getContext mock + own-property offsetX/Y synthesis on Event objects for jsdom pointer test path.

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
Stopped at: Completed 04-01-PLAN.md — usePredicateEngine + LassoOverlay + NodeTooltip + GraphInteractions + featureSnapshot + Canvas handle extensions; 15 new assertions; 135 access-analysis tests green; ready for Phase 4 plan 02 (chrome)
Resume file: None

## Session Continuity

Last session: 2026-05-19
Stopped at: Completed 03-01-PLAN.md — GraphCanvas + GraphCanvas2D + useGraphRafLoop + 8 tests; REND-01 amended; ready for Phase 3 Plan 02
Resume file: None
