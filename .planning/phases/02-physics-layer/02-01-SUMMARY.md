---
phase: 02-physics-layer
plan: 01
subsystem: physics
tags: [d3-force-3d, typescript, float32array, duckdb, spatial-graph, simulation]

# Dependency graph
requires:
  - phase: 01-data-math-foundation
    provides: positionsCache.ts (savePositions, loadCachedPositions, hashNodeSetAndSliders, stride-3 Float32Array), duckdbClient.ts (getDuckDbClient)
provides:
  - physicsLayer.ts: createPhysicsLayer factory + PhysicsLayer interface
  - d3-force-3d.d.ts: TypeScript declaration shim (no @types/ package exists on npm)
  - d3-force-3d@3.0.6 installed in package.json
affects: [03-render-layer, 04-interactions]

# Tech tracking
tech-stack:
  added: [d3-force-3d@3.0.6]
  patterns:
    - Two-bus architecture (physics bus vs mask bus) — setMask never touches simulation
    - forceSimulation(nodes, 3) — must pass numDimensions=3 explicitly (d3 defaults to 2D)
    - Named per-dimension forces — forceX/Y/Z triplets keyed by dimId (PHYS-01)
    - alpha(target).restart() reheat pattern — never bare restart() which resets to alpha=1
    - Per-dim target derivation via option-a: call computeTargetPositions once per dim with slider[d]=1, all others=0
    - Freeze-on-rest: sim.on("end") packs positions synchronously then awaits savePositions then sim.stop()
    - No-reheat optimization: skip if frozen && |delta| < 0.02 (scroll-wheel thrash guard)

key-files:
  created:
    - app/(dashboard)/users/access-analysis/physicsLayer.ts
    - app/(dashboard)/users/access-analysis/d3-force-3d.d.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Per-dim target derivation uses option-a: computeTargetPositions called once per dim with that dim's slider=1 and all others=0. Caller produces TargetArrays before passing to createPhysicsLayer. This reuses Phase 1 API with zero changes to mathLayer.ts."
  - "d3-force-3d.d.ts shim lives alongside physicsLayer.ts (not in a global types/ dir) so Next.js tsconfig include paths pick it up automatically. No typeRoots change needed."
  - "Cache-miss seed uses alpha(ALPHA_MAX_REHEAT).restart() at construction (not sim.restart() bare) to satisfy PHYS-02 invariant even on initial run."
  - "Positions packed synchronously into xyz Float32Array BEFORE async savePositions call in 'end' handler — prevents render-race where render reads partially-written values (Pitfall 5)."
  - "LRU eviction for positions cache deferred — cache entries bounded by node count x slider buckets; addressed in future phase."

patterns-established:
  - "PHYS-04 invariant: setMask has zero references to sim, manyBody, or any d3 symbol — enforced by inline comment and structural isolation"
  - "PHYS inline comments: each requirement (PHYS-01 through PHYS-05) has named inline comments for traceability — count 12 total"
  - "Pitfall guard pattern: Pitfall 1 (numDimensions=3), Pitfall 3 (d.index! not closure), Pitfall 4 (alpha before restart), Pitfall 5 (sync pack), Pitfall 7 (stride-3)"

requirements-completed: [PHYS-01, PHYS-02, PHYS-03, PHYS-04, PHYS-05]

# Metrics
duration: 3min
completed: 2026-05-19
---

# Phase 02 Plan 01: Physics Layer Foundation Summary

**d3-force-3d simulation with named per-dimension force triplets, slider-driven engine-param mapping, freeze-on-rest DuckDB cache write, and mask-bus isolation enforcing the PHYS-04 invariant that filter/search events never touch the simulation**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-19T19:12:22Z
- **Completed:** 2026-05-19T19:15:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed d3-force-3d@3.0.6 and verified all 5 named exports present (forceSimulation, forceX, forceY, forceZ, forceManyBody)
- Authored d3-force-3d.d.ts TypeScript declaration shim (no @types/ exists on npm) with SimNode3D, Simulation3D<N>, Force3DX/Y/Z<N>, ForceManyBody3D<N>
- Implemented physicsLayer.ts as a pure TypeScript factory module: 315 lines, zero React/DOM/Next imports, tsc --noEmit reports zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install d3-force-3d and author TypeScript declaration shim** - `ce34147` (chore)
2. **Task 2: Implement physicsLayer.ts factory with named forces + slider mapping** - `c54e852` (feat)

**Plan metadata:** (docs commit follows this summary)

## Public API Surface

```typescript
// Exported from physicsLayer.ts:

export interface SimNode {
  id: string;
  index?: number;
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number | null; fy?: number | null; fz?: number | null;
}

export type TargetArrays = Record<
  string,
  { x: Float32Array; y: Float32Array; z: Float32Array }
>;

export interface PhysicsLayer {
  readonly alphaMask: Float32Array;    // render reads directly for GPU upload
  readonly maskVersion: number;        // incremented by setMask only
  updateSliders(values: Record<string, number>): void;
  setMask(predicate: (nodeIndex: number) => number): void;
  getPositions(): Float32Array;        // Float32Array(n*3) snapshot
  dispose(): void;
}

export async function createPhysicsLayer(
  nodeIds: string[],
  nodes: SimNode[],
  targets: TargetArrays,
  dimNames: string[],
  initialSliders: Record<string, number>,
): Promise<PhysicsLayer>
```

## What Plan 02-02 (Tests) Needs to Know

1. **Per-dim target derivation (option-a):** Tests must supply `TargetArrays` directly — call `computeTargetPositions` with one dim at 1.0, all others 0.0, split the Float32Array(n*3) into `{ x, y, z }` per dim.

2. **PHYS-04 tick counter test (Pitfall 6):** Use `sim.tick(N)` for synchronous control in Vitest node environment — d3-force-3d falls back to setTimeout when requestAnimationFrame is absent. Do NOT await the "end" event in tests (will hang). See RESEARCH §Code Examples > "Test: PHYS-04 tick counter invariant" for the `createPhysicsLayer` reference usage.

3. **Cache mock required:** `createPhysicsLayer` is async and calls `getDuckDbClient()` + `loadCachedPositions()` at construction. Tests must vi.mock("./duckdbClient") and vi.mock("./positionsCache") following the DuckDB test pattern established in Phase 1.

4. **Two-bus invariant (PHYS-04):** After `setMask`, assert `sim.alpha()` is unchanged. For a frozen sim, register `sim.on("tick", cb)` before calling setMask, then assert cb was never called.

5. **No-reheat optimization:** Test by calling `updateSliders` twice with delta < 0.02 on a frozen sim — second call must not trigger `.alpha().restart()` (observable via spy on sim.alpha).

6. **Initial seed alpha:** Cache-miss path calls `sim.alpha(0.3).restart()` — not bare `restart()`. Tests creating a cache-miss scenario should assert sim.alpha() > 0 after construction.

## Files Created/Modified

- `app/(dashboard)/users/access-analysis/physicsLayer.ts` — createPhysicsLayer factory; PhysicsLayer, SimNode, TargetArrays exports; 315 lines
- `app/(dashboard)/users/access-analysis/d3-force-3d.d.ts` — TypeScript declaration shim; 75 lines
- `package.json` — d3-force-3d@3.0.6 added to dependencies
- `package-lock.json` — lockfile updated

## Decisions Made

- **Per-dim target derivation uses option-a** (from RESEARCH Open Question #2): `computeTargetPositions` called once per dim with slider[d]=1 and all others=0. Caller produces TargetArrays before passing to `createPhysicsLayer`. mathLayer.ts unchanged.
- **Declaration shim co-located** with physicsLayer.ts (not in global types/ dir): Next.js tsconfig include paths cover the access-analysis directory automatically — no tsconfig.json change needed.
- **Cache-miss initial seed** uses `sim.alpha(ALPHA_MAX_REHEAT).restart()` not bare `restart()` — satisfies PHYS-02 invariant even on the very first run where no prior alpha state exists.
- **Synchronous position pack** in "end" handler before async `savePositions` — prevents render-race (Pitfall 5 guard).
- **LRU eviction deferred** — cache is bounded by (nodeSet × slider-bucket) combinations; comment added in handler noting the deferral.

## Deviations from Plan

None — plan executed exactly as written. The RESEARCH skeleton was used verbatim with the additions specified in the plan (PHYS-04 inline comment, pitfall guard annotations, JSDoc two-bus description).

## Issues Encountered

None. All 5 required exports confirmed present via `node -e "require('d3-force-3d')"` before authoring the shim. TypeScript compilation clean on first write.

## Next Phase Readiness

- **Plan 02-02 (Tests):** physicsLayer.ts is ready for unit tests. Mock pattern for DuckDB established in Phase 1 applies directly. Test focus: PHYS-04 tick counter invariant, PHYS-03 engine param monotonicity, PHYS-05 freeze handler, cache-hit path pinning.
- **Phase 3 (Render Layer):** `PhysicsLayer` interface is stable. Render consumes `alphaMask` (Float32Array, direct GPU upload), `maskVersion` (change detection), and `getPositions()` (Float32Array(n*3) snapshot). Two-bus architecture structurally prevents render from accidentally triggering simulation ticks via filter events.
- **Blocker:** None. Phase 2 physics foundation is self-contained.

---
*Phase: 02-physics-layer*
*Completed: 2026-05-19*
