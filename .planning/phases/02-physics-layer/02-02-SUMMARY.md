---
phase: 02-physics-layer
plan: 02
subsystem: physics
tags: [vitest, d3-force-3d, testing, behavioral, purity, float32array, simulation]

# Dependency graph
requires:
  - phase: 02-physics-layer
    plan: 01
    provides: physicsLayer.ts (createPhysicsLayer, PhysicsLayer, SimNode, TargetArrays)
provides:
  - physicsLayer.test.ts: behavioral suite covering PHYS-01..05, cache-hit, no-reheat (13 tests)
  - physicsLayer.purity.test.ts: static purity assertions (3 tests)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Partial vi.mock of d3-force-3d — wraps real exports; forceSimulation wrapper captures sim reference for test inspection without modifying production code
    - vi.hoisted() for mock functions referenced inside vi.mock factories (avoids ReferenceError from hoisting order)
    - arguments.length arity guard in sim.force() wrapper — d3-force-3d uses argument count (not undefined check) to distinguish GET vs SET; passing 2 args with undefined would SET the force to undefined
    - force.strength()() double-call — d3-force-3d returns constant() accessor from strength() getter; must call result again to get the number
    - setTimeout(r, 10ms) for d3-timer end-event flush — d3's "end" event fires via internal d3-timer setTimeout, not synchronously from tick(N)
    - Cache-hit path for frozen-state tests — cleaner than trying to re-freeze a cache-miss sim mid-test

key-files:
  created:
    - app/(dashboard)/users/access-analysis/physicsLayer.test.ts
    - app/(dashboard)/users/access-analysis/physicsLayer.purity.test.ts
  modified: []

key-decisions:
  - "Partial vi.mock of d3-force-3d (not _unsafe_internals): wraps real forceSimulation and forceManyBody in the test file itself, no production code changes required."
  - "d3-force-3d arity guard: sim.force() wrapper must use arguments.length to detect GET vs SET. Calling origForce(name, undefined) with 2 args would silently REMOVE the force (d3 treats 2-arg call as setter)."
  - "force.strength()() double-call required: d3-force-3d strength getter returns a constant() accessor function, not the number. Tests must call .strength()() to get the actual value."
  - "No-reheat test uses cache-hit path: testing the frozen-state guard with cache-miss requires re-freezing mid-test (unreliable). Cache-hit sets frozen=true from construction, enabling clean two-call delta tests."
  - "PHYS-05 flush uses 10ms setTimeout: d3-timer fires end event via its own setTimeout. A microtask flush (0ms) is insufficient; 10ms gives the d3 timer a scheduling slot."

# Metrics
duration: 10min
completed: 2026-05-19
---

# Phase 02 Plan 02: Physics Layer Tests Summary

**Behavioral Vitest suite proving PHYS-01..05 invariants via partial d3-force-3d mock that captures sim and manyBody references, plus a static purity test enforcing the import allowlist and DOM-free contract**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-19T19:19:22Z
- **Completed:** 2026-05-19T19:29:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wrote physicsLayer.test.ts: 13 behavioral tests in node environment covering all 5 PHYS requirements, cache-hit short-circuit, and no-reheat optimization
- Wrote physicsLayer.purity.test.ts: 3 static tests asserting import allowlist and zero DOM API references
- Discovered and documented 4 d3-force-3d API quirks (arity guard, double-call strength getter, timer async flush, "end" event via d3-timer) — all handled in tests without touching production code
- Full physicsLayer suite: 16 tests passing; zero regressions in the 541-test repo suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Write physicsLayer.test.ts behavioral suite (PHYS-01..05)** - `5c98b3d` (test)
2. **Task 2: Write physicsLayer.purity.test.ts (no UI-framework imports)** - `3ad4415` (test)

## Test Coverage Map

| Requirement | Test Name | Commit | Assertion |
|-------------|-----------|--------|-----------|
| PHYS-01 | Named per-dimension forces registered | 5c98b3d | forceX/Y/Z triplets present; initial strength()() === 0 |
| PHYS-01 | Registers forces for arbitrary dimNames | 5c98b3d | Works for 3-dim fixture too |
| PHYS-02 | alpha(positive).restart() ordering | 5c98b3d | alpha call index < restart call index; value in (0, 0.3] |
| PHYS-02 | Never bare restart() | 5c98b3d | restartCalledWithoutAlpha === false |
| PHYS-03 | Monotonic alphaDecay + repulsion sweep | 5c98b3d | Non-increasing decay; non-decreasing |repulsion|; reheat capped at 0.3 |
| PHYS-04 | setMask tick counter (load-bearing) | 5c98b3d | tickCount === before after 10 setMask calls |
| PHYS-04 | setMask does not touch sim.alpha | 5c98b3d | sim.alpha() unchanged after setMask |
| PHYS-05 | savePositions called once with Float32Array(n*3) | 5c98b3d | toHaveBeenCalledTimes(1), length === n*3 |
| PHYS-05 | sim.stop() called by end handler | 5c98b3d | stopCallCount > 0 after tick(300) + 10ms wait |
| Cache-hit | Nodes pinned via fx/fy/fz | 5c98b3d | node[0].fx toBeCloseTo(10) |
| Cache-hit | Pinned nodes do not move under tick(10) | 5c98b3d | x/y/z unchanged; savePositions never called |
| No-reheat | Consecutive small deltas skip restart | 5c98b3d | restartCallCount === 0 for delta=0.01 twice |
| No-reheat | Large delta always reheats when frozen | 5c98b3d | restartCallCount > 0 for delta=0.5 |
| Purity | Import allowlist (d3-force-3d, positionsCache, duckdbClient) | 3ad4415 | All 3 allowed; rejects anything else |
| Purity | Zero React/react-force-graph/three/next imports | 3ad4415 | No forbidden specifier found |
| Purity | Zero DOM API refs in source text | 3ad4415 | No document/window/rAF/HTMLElement |

## How Debug Access Was Implemented

**Approach: Partial vi.mock of "d3-force-3d"** — no production code changes.

The test file intercepts `forceSimulation` and `forceManyBody` exports:

```typescript
vi.mock("d3-force-3d", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    forceSimulation: (...args) => {
      const sim = real.forceSimulation(...args);
      // Wrap sim.force() with arity guard to record names
      const origForce = sim.force.bind(sim);
      sim.force = function(name, f) {
        if (arguments.length >= 2) { ... origForce(name, f) }
        else { return origForce(name); } // GET: exactly 1 arg
      };
      _capturedSim = sim;
      return sim;
    },
    forceManyBody: (...args) => {
      const mb = real.forceManyBody(...args);
      _capturedManyBody = mb;
      return mb;
    },
  };
});
```

`_capturedSim` and `_capturedManyBody` are module-level variables reset in `beforeEach`, populated when `createPhysicsLayer` is called.

## Pitfalls Encountered

**Pitfall 6 (rAF in node env) — mitigated**: Tests use `simulation.tick(N)` for synchronous alpha advancement. No rAF dependency.

**d3-force-3d arity guard (discovered during testing)**: `sim.force(name, undefined)` with 2 args acts as a SET (removes the force), not a GET. The wrapper must use `arguments.length >= 2` to branch, not `f !== undefined`. Without this, all per-dim forces were silently deleted, causing `strength is not a function` errors.

**force.strength()() double-call (discovered during testing)**: In d3-force-3d, `force.strength()` returns the `constant()` accessor function, not the numeric value. Calling `.strength()()` (twice) yields the number. Initial attempt used `.strength()` which returned a function, causing assertion failures.

**d3-timer async end-event (discovered during testing)**: d3's "end" event fires via `d3-timer`'s internal `setTimeout`, not synchronously from `tick(N)`. A 0ms `setTimeout` flush was sometimes insufficient. Changed to `setTimeout(r, 10)` to give d3-timer a scheduling slot.

**No-reheat test mid-test refreezing (discovered during testing)**: Testing the no-reheat guard by running cache-miss → tick to freeze → spy → updateSliders×2 was unreliable because the first big-delta updateSliders unfreezes the sim (sets `frozen=false`) before the second call. Switched to using the cache-hit path where `frozen=true` persists across both calls.

**mockReset vs mockClear (discovered during testing)**: `mockReset()` clears both call history AND implementations, causing `savePositions` to return `undefined` (not a resolved Promise) in subsequent tests. Changed to `mockClear()` + `.mockResolvedValue(undefined)` to restore the async implementation.

**vi.hoisted() required (discovered during testing)**: Mock function variables (`mockSavePositions` etc.) cannot be plain `const` declarations if referenced inside `vi.mock()` factories — vi.mock is hoisted to top of file, causing `ReferenceError: Cannot access before initialization`. Fixed with `vi.hoisted(() => ({ ... }))`.

## Confirmation: Phase 2 Complete

All 5 PHYS requirements (PHYS-01..05) are verified by green Vitest tests:
- PHYS-01: named force triplets registered at strength 0 — PROVEN
- PHYS-02: alpha(target).restart() before any restart — PROVEN
- PHYS-03: monotonic engine params across slider sweep — PROVEN
- PHYS-04: setMask never touches sim (load-bearing invariant) — PROVEN
- PHYS-05: freeze-on-rest writes positions and stops sim — PROVEN

Phase 2 (physics layer) is complete. physicsLayer.ts is ready for Phase 3 (render layer).

## Deviations from Plan

**[Rule 1 - Bug] d3-force-3d arity guard in sim.force() wrapper**
- **Found during:** Task 1 (PHYS-01 first run)
- **Issue:** My `vi.mock` wrapper passed `origForce(name, undefined)` for GET calls. d3-force-3d treats any 2-arg call as SET, silently removing the force. `sim.force('name')` returned the simulation object (for chaining) instead of the force.
- **Fix:** Added `arguments.length >= 2` branch in the wrapper — passes exactly 1 arg for GET, 2 args for SET.
- **Files modified:** physicsLayer.test.ts (test file only)
- **Commit:** 5c98b3d

**[Rule 1 - Bug] force.strength()() double-call required**
- **Found during:** Task 1 (PHYS-01 strength assertion)
- **Issue:** `force.strength()` returns a `constant()` function, not a number.
- **Fix:** Updated assertions to call `force.strength()()`.
- **Files modified:** physicsLayer.test.ts
- **Commit:** 5c98b3d

**[Rule 1 - Bug] mockReset clears implementation**
- **Found during:** Task 1 (PHYS-05 second test)
- **Issue:** `mockSavePositions.mockReset()` in beforeEach removed the `async () => undefined` implementation; subsequent tests got an undefined return (not a Promise).
- **Fix:** Changed to `mockClear()` + `.mockResolvedValue(undefined)` to preserve async behavior.
- **Files modified:** physicsLayer.test.ts
- **Commit:** 5c98b3d

---
*Phase: 02-physics-layer*
*Completed: 2026-05-19*
