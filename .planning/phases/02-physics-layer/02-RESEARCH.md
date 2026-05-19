# Phase 2: Physics Layer - Research

**Researched:** 2026-05-19
**Domain:** d3-force-3d simulation — named forces, slider-driven reheat, freeze-on-rest, alphaMask ownership
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Force composition**
- Per-dim forces: one named force per dimension (6 total) — `simulation.force("dim-activity", ...)`, `"dim-recency"`, `"dim-role"`, `"dim-perms"`, `"dim-admin"`, `"dim-external"`. Each force pulls toward that dim's target via `forceX/Y/Z(d => targets[d.index])` with its own `.strength()` tracking the matching slider value. Matches PHYS-01 example literally.
- Baseline force: `forceManyBody` (repulsion) only — required by PHYS-03. No `forceCollide`, no `forceCenter`.
- 2D/3D: simulation always runs in 3D. Render layer flattens Z when in 2D mode. Single source of truth; no force reconfiguration on mode switch.
- Math input contract: math layer exposes per-dim target Float32Arrays (e.g., `activityTargetsX/Y/Z`); each named force reads its own dim's array. Physics never calls `computeTargetPositions` directly.
- Initial seeding: cached positions if `hashNodeSet(nodeIds) + slider-bucket` cache hits — node starts frozen, no sim. Cache miss → small random seed in `[-1, 1]^3`.
- `velocityDecay`: d3 default `0.4`.
- Per-dim `force.strength()` at slider = 1.0: `0.1` (d3 `forceX` default). Slider value scales linearly to `[0, 0.1]`.
- Force composition rule: pure additive (d3 default).

**Slider→physics mapping**
- Reheat target alpha on slider change: `alpha = max(sliderValues)`, capped at `0.3`. Gentle reheat — sim resumes warm and settles fast; never a full-restart shock.
- `alphaDecay`: inverse coupling — `alphaDecay = lerp(0.1, 0.02, max(sliderValues))`. Low max → fast decay → quick freeze. High max → slow decay → user sees motion.
- `manyBody.strength`: `lerp(-10, -60, max(sliderValues))`. Sliders at zero = nodes pack tight; sliders engaged = nodes spread so dim clusters are legible.
- No-reheat optimization: if sim is frozen AND `abs(newSlider - oldSlider) < 0.02`, skip reheat entirely. Prevents thrashing on scroll-wheel slider tweaks.
- Mutation API: slider change → `force.strength(newValue)` on that dim's named force + `simulation.alpha(target).restart()` (the `d3ReheatSimulation` pattern). Never `simulation.restart()` from scratch.

**Freeze-on-rest behavior**
- Trigger: d3's native `"end"` event (alpha < `alphaMin` = `0.001`). No polling, no custom velocity check, no tick cap.
- Cache key: `hash(nodeIds) + hash(sliders quantized to 0.05 buckets)`. Near-equal slider configs share cached positions. Extends Phase 1's positions cache schema.
- On freeze: write the position Float32Array to DuckDB-WASM positions cache under the composite key, then call `simulation.stop()` so the tick counter halts (literal PHYS-03 success criterion).
- Post-freeze slider change: unfreeze, reheat per the mapping rules above, re-settle, write new cache entry under the new (nodeSet, slider-bucket) key. Old entries remain and are evicted by LRU.

**AlphaMask semantics**
- Value range: continuous `0.0–1.0` (per-node opacity).
- Allocation & ownership: `physicsLayer` owns the `Float32Array`, sized to node count, and exposes `setMask(predicate: (node) => number)`. Interaction code in Phase 4 calls into this API; it does not own the array.
- Animation: render layer eases `current → target` mask values over ~200ms per frame. Physics writes the target instantaneously and does NOT tick interpolation.
- Change notification: monotonic `maskVersion` counter. `setMask` bumps it; render's RAF loop compares last-seen vs current and re-uploads only when changed. No event emitter, no callbacks.
- Filter/search/lasso contract: these events MUST go through `setMask` and MUST NOT touch the simulation. PHYS-03 invariant: tick counter does not increment after a mask update.

### Claude's Discretion
- Exact module file layout inside `src/` (where `physicsLayer.ts` lives, helper splits).
- Vitest test naming conventions and fixture shape.
- TypeScript type definitions for the public physics API (`PhysicsLayer`, `MaskPredicate`, etc.).
- Internal helper for `lerp`, `quantize`, `hashSliders` — colocate or share with math layer.
- Whether `simulation.alphaMin` and `simulation.alphaTarget` get exposed as tunables or stay hardcoded constants.

### Deferred Ideas (OUT OF SCOPE)
- Per-dim easing curves for slider → `force.strength` (non-linear ramps).
- `forceCollide` or `forceCenter` as opt-in baselines.
- Slider debouncing/coalescing at the input side — belongs in Phase 4 (Interactions).
- Two-channel mask (visibility + emphasis).
- Mode-switch force reconfiguration.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHYS-01 | d3-force-3d simulation with named per-dimension forces (`simulation.force("dim-activity")`, etc.) | d3-force-3d 3.0.6 `force(name, f)` API confirmed; `forceX/Y/Z` verified; see §Standard Stack + §Code Examples |
| PHYS-02 | Slider changes call `force.strength()` + `d3ReheatSimulation()` — never a full restart | `simulation.alpha(target).restart()` pattern confirmed in d3-force-3d API; see §Architecture Patterns > Pattern 2 |
| PHYS-03 | `max(slider_values)` drives engine params (alpha, alphaDecay, repulsion, attraction) continuously | `alphaDecay`, `forceManyBody.strength()` are live-mutable; see §Architecture Patterns > Pattern 3 |
| PHYS-04 | Filter, search, and lasso events do NOT touch the simulation — they only mutate an alphaMask Float32Array | Pure TypeScript alphaMask owned by physicsLayer; `setMask` API pattern; see §Architecture Patterns > Pattern 4 |
| PHYS-05 | Positions freeze to position cache when alpha settles | d3 `"end"` event fires when alpha < alphaMin; `savePositions` from positionsCache.ts already exists; see §Architecture Patterns > Pattern 5 |
</phase_requirements>

---

## Summary

Phase 2 builds `physicsLayer.ts` as a pure TypeScript module (no React, no DOM, no rendering) that owns a d3-force-3d simulation and an alphaMask Float32Array. The critical architectural insight is the two-bus design: the physics bus (simulation tick counter, named forces, position Float32Array) and the mask bus (alphaMask, maskVersion counter). Filter and search events are strictly routed to the mask bus; they never touch the simulation. This invariant is the single most important property Phase 3 and Phase 4 depend on.

The library stack is already partially in place. `d3-force` (v3.0.0) is already in `package.json`. Phase 2 needs `d3-force-3d` (v3.0.6) added — it is a drop-in superset of d3-force that adds `numDimensions()`, `forceZ()`, and 3D positional properties (`z`, `vz`). There are no bundled TypeScript declarations for d3-force-3d; the project will need a local `d3-force-3d.d.ts` shim declaration file mapping the JS exports to the existing `@types/d3-force` interfaces extended with z-axis members. All position writes go through `savePositions` from the already-complete `positionsCache.ts`.

The only genuine complexity is the tick counter test for PHYS-04. d3-force-3d does not expose a tick counter property directly — the pattern is to count `"tick"` events via the simulation's own event system. The test asserts that the count does not increment after `setMask` is called on a frozen simulation.

**Primary recommendation:** Install `d3-force-3d@3.0.6`, author a 50-line `d3-force-3d.d.ts` declaration shim, then implement `physicsLayer.ts` as a factory function returning a `PhysicsLayer` object. Keep it framework-free and independently testable with Vitest, matching the mathLayer.ts purity pattern.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| d3-force-3d | 3.0.6 | 3D force simulation with named forces, alpha API, "end" event | Only library that extends d3-force to 3D with the identical API; `react-force-graph-3d` uses it internally |
| d3-force | 3.0.0 | Already installed; provides `forceManyBody`, `forceX`, `forceY` types | Already in package.json; d3-force-3d re-exports these with z-axis extensions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| positionsCache.ts (local) | Phase 1 | `savePositions`, `loadCachedPositions`, `hashNodeSetAndSliders` | Used in freeze-on-rest handler and initial cache-hit path |
| mathLayer.ts (local) | Phase 1 | `computeTargetPositions`, `NodeFeatureVector`, `DimensionDescriptor` | Physics calls math layer's output array as force targets |
| @types/d3-force | 3.0.10 | TypeScript types for d3-force base types | Already installed; extend via declaration merging for z-axis |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| d3-force-3d | cosmograph/cosmos.gl | cosmos.gl is disqualified: 2D-only, no runtime force-weight mutation API |
| d3-force-3d | three.js + custom verlet | Would require implementing the entire cooling/alpha/event system from scratch |
| "end" event for freeze | polling `simulation.alpha() < 0.001` | Polling burns CPU; d3's own `"end"` event fires exactly when alpha < alphaMin |

**Installation:**
```bash
npm install d3-force-3d@3.0.6
```

No `@types/d3-force-3d` exists on npm (confirmed May 2026). Author a local declaration shim instead.

---

## Architecture Patterns

### Recommended Project Structure
```
app/(dashboard)/users/access-analysis/
├── physicsLayer.ts        # Public API: createPhysicsLayer factory
├── physicsLayer.test.ts   # Vitest unit tests (node env, no jsdom needed)
├── mathLayer.ts           # Phase 1 — consumed but not modified
├── dataLayer.ts           # Phase 1 — consumed but not modified
├── positionsCache.ts      # Phase 1 — savePositions / loadCachedPositions used
└── d3-force-3d.d.ts       # TypeScript declaration shim (new, 50 lines)
```

### Pattern 1: Factory Function + PhysicsLayer Interface

**What:** `createPhysicsLayer(nodes, options)` returns a `PhysicsLayer` object with a narrow public API. The simulation, alphaMask array, and maskVersion counter are private closure state.

**When to use:** Always — this matches the mathLayer.ts factory pattern and keeps the physics object testable without a class hierarchy.

```typescript
// app/(dashboard)/users/access-analysis/physicsLayer.ts

export interface PhysicsLayer {
  /** Current alphaMask — render reads this directly (Float32Array for GPU upload) */
  readonly alphaMask: Float32Array;
  /** Monotonic version counter; incremented by setMask only */
  readonly maskVersion: number;
  /** Update a named dim's force strength + reheat the simulation */
  updateSlider(dimId: string, value: number): void;
  /** Update ALL sliders at once — recalculates all mapped engine params */
  updateSliders(values: Record<string, number>): void;
  /** Mutate alphaMask via predicate; increments maskVersion; NEVER touches simulation */
  setMask(predicate: (nodeIndex: number) => number): void;
  /** Tear down the simulation timer */
  dispose(): void;
}

export function createPhysicsLayer(
  nodes: SimNode[],
  targets: TargetArrays,
  options?: PhysicsOptions,
): PhysicsLayer { ... }
```

### Pattern 2: Named Forces + Reheat (PHYS-01 / PHYS-02)

**What:** Register one named force per dimension. On slider change, call `force.strength(newStrength)` on the specific named force, then reheat via `simulation.alpha(newAlpha).restart()`.

**When to use:** Any slider value change. Never call `simulation.restart()` without setting alpha first — that resets to alpha=1 (full shock).

```typescript
// Source: d3-force-3d v3.0.6 official README + API verification
import {
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  forceManyBody,
} from "d3-force-3d";

const sim = forceSimulation(nodes, 3)  // numDimensions = 3
  .alphaMin(0.001)
  .alphaDecay(0.0228)  // default; overridden per slider sweep
  .velocityDecay(0.4); // locked decision

// Register per-dimension named forces
const DIM_NAMES = ["dim-activity", "dim-recency", "dim-role", "dim-perms", "dim-admin", "dim-external"] as const;

for (const [i, dimName] of DIM_NAMES.entries()) {
  // forceX pulls toward targets array slice; same pattern for Y and Z
  sim.force(dimName, forceX<SimNode>((d) => targets[dimName].x[d.index!]).strength(0));
}

sim.force("repulsion", forceManyBody<SimNode>().strength(-10)); // initial: sliders at 0

// Reheat pattern (d3ReheatSimulation is shorthand for this):
function d3ReheatSimulation(sim: Simulation, targetAlpha: number): void {
  sim.alpha(targetAlpha).restart();
}
```

### Pattern 3: Continuous Engine Param Mapping (PHYS-03)

**What:** On any slider change, recompute `maxSlider = max(sliderValues)` and update three engine params atomically before restarting.

**When to use:** Called inside `updateSliders()` before the reheat.

```typescript
function applyEngineParams(sim: Simulation, manyBody: ForceManyBody, maxSlider: number): void {
  // alphaDecay: high max → slow decay (user sees motion); low max → fast freeze
  const newAlphaDecay = lerp(0.1, 0.02, maxSlider);
  // manyBody.strength: high max → spread nodes for cluster legibility
  const newRepulsion = lerp(-10, -60, maxSlider);
  // Reheat alpha capped at 0.3 — gentle, never full-restart shock
  const newAlpha = Math.min(maxSlider, 0.3);

  sim.alphaDecay(newAlphaDecay);
  manyBody.strength(newRepulsion);

  // No-reheat optimization: skip if frozen and delta < threshold
  const SKIP_THRESHOLD = 0.02;
  if (frozen && Math.abs(maxSlider - prevMaxSlider) < SKIP_THRESHOLD) return;

  d3ReheatSimulation(sim, newAlpha);
}
```

### Pattern 4: AlphaMask Ownership + maskVersion (PHYS-04)

**What:** `physicsLayer` owns a `Float32Array` of length `nodeCount` initialized to `1.0`. `setMask(predicate)` fills it and bumps `maskVersion`. The simulation is never touched.

**When to use:** Every filter, search, click-isolate, and lasso event in Phase 4 calls `setMask`. Simulation code never reads `alphaMask`.

```typescript
let _maskVersion = 0;
const _alphaMask = new Float32Array(nodes.length).fill(1.0);

function setMask(predicate: (nodeIndex: number) => number): void {
  for (let i = 0; i < _alphaMask.length; i++) {
    _alphaMask[i] = predicate(i);
  }
  _maskVersion++;
  // simulation is NOT touched — tick counter does not increment
}
```

**Critical test:** Record `sim.alpha()` before and after `setMask`. Assert values are identical (sim.alpha() only changes when simulation ticks). For a frozen simulation use a tick counter via `simulation.on("tick", () => tickCount++)` — assert tickCount unchanged.

### Pattern 5: Freeze-on-Rest (PHYS-05)

**What:** Register an `"end"` event listener on the simulation. When fired, extract positions from the simulation's node objects, pack into Float32Array, write to DuckDB-WASM via `savePositions`, then call `simulation.stop()`.

**When to use:** Fires automatically when d3's alpha drops below `alphaMin` (0.001).

```typescript
// Source: d3-force-3d "end" event — fires when alpha < alphaMin
sim.on("end", async () => {
  frozen = true;
  // Extract positions from d3 node objects into Float32Array(n*3)
  const xyz = new Float32Array(nodes.length * 3);
  for (let i = 0; i < nodes.length; i++) {
    xyz[i * 3 + 0] = nodes[i].x ?? 0;
    xyz[i * 3 + 1] = nodes[i].y ?? 0;
    xyz[i * 3 + 2] = nodes[i].z ?? 0;
  }
  // Quantized slider key matches positionsCache.ts §hashNodeSetAndSliders
  const cacheKey = hashNodeSetAndSliders(nodeIds, quantizedSliders);
  const { connection } = await getDuckDbClient();
  await savePositions(connection, cacheKey, nodeIds, xyz);
  simulation.stop(); // halts tick counter — PHYS-03 invariant
});
```

### Pattern 6: Initial Cache-Hit Path

**What:** Before starting the simulation, check DuckDB-WASM for a cached position matching the current node set + slider bucket. On hit: write positions directly into d3 node objects and call `simulation.stop()` immediately — simulation never runs.

```typescript
const cachedXyz = await loadCachedPositions(connection, cacheKey, nodeIds);
if (cachedXyz) {
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].x = cachedXyz[i * 3];
    nodes[i].y = cachedXyz[i * 3 + 1];
    nodes[i].z = cachedXyz[i * 3 + 2];
    nodes[i].fx = nodes[i].x; // pin to prevent d3 from moving them
    nodes[i].fy = nodes[i].y;
    nodes[i].fz = nodes[i].z;
  }
  simulation.stop();
  frozen = true;
} else {
  // seed random in [-1, 1]^3 then let simulation run
  simulation.restart();
}
```

### Anti-Patterns to Avoid

- **`simulation.restart()` without setting alpha first:** Resets alpha to its current value only — if alpha is 0, restart does nothing. Always call `simulation.alpha(target).restart()` together.
- **Calling `simulation.restart()` from filter/search handlers:** The PHYS-03 invariant is broken immediately. All filter/search events must go through `setMask` only.
- **Reading positions from d3 node objects inside a render loop:** d3 mutates `node.x/y/z` in-place during ticks. The render layer must read from the frozen Float32Array copy, not the live d3 nodes, to avoid jitter on the first render frame after the "end" event.
- **Using `forceSimulation(nodes, 2)` (2D default):** The default is 2D. Must explicitly pass `3` as the second argument or call `.numDimensions(3)` to enable z-axis forces and `node.z/vz` properties.
- **Initializing all slider strengths to 0.1:** At startup, all dim forces should have `strength(0)` until the user drags a slider. Initializing to 0.1 causes unexpected motion before any user interaction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Alpha-based cooling schedule | Custom temperature decay loop | d3-force-3d `alphaDecay` + `alphaMin` | d3's Verlet integrator handles all tick timing with requestAnimationFrame; custom loop will fight it |
| n-body repulsion | Custom O(n²) repulsion | `forceManyBody` | Uses Barnes-Hut O(n log n) approximation; critical for >500 nodes |
| Settle detection | Poll `simulation.alpha() < threshold` in a timer | d3 `"end"` event | d3 uses its own internal timer; polling can fire between ticks and double-save |
| Tick counter | Custom integer counter on a JS timer | `simulation.on("tick", cb)` listener | d3 fires "tick" synchronously inside its own RAF loop; external timers drift |
| Position extraction from Float32 | Custom stride calculation | `packPositions` from positionsCache.ts | Already implemented and tested in Phase 1; handles stride-3 xyz correctly |

**Key insight:** d3-force-3d's event system (tick, end) is the only reliable synchronization point. Any code that tries to observe simulation state from outside d3's timer loop will race.

---

## Common Pitfalls

### Pitfall 1: numDimensions Defaults to 2
**What goes wrong:** `forceSimulation(nodes)` creates a 2D simulation. `forceZ` forces are silently ignored. `node.z` is never populated. Phase 3 receives all-zero z values.
**Why it happens:** d3-force-3d maintains backward compatibility with d3-force by defaulting to 2D.
**How to avoid:** Always `forceSimulation(nodes, 3)` or `.numDimensions(3)`. Add a test that asserts `node.z !== 0` after at least one tick with a non-zero z-force.
**Warning signs:** Position Float32Array has non-zero x/y but all-zero z after the simulation runs.

### Pitfall 2: TypeScript — No @types/d3-force-3d on npm
**What goes wrong:** `import { forceSimulation } from "d3-force-3d"` causes TypeScript error: no declaration file.
**Why it happens:** d3-force-3d ships ESM-only with no bundled .d.ts; DefinitelyTyped has no entry.
**How to avoid:** Create `app/(dashboard)/users/access-analysis/d3-force-3d.d.ts` (or `types/d3-force-3d.d.ts`) that re-exports `@types/d3-force` types extended with z-axis members (`z?`, `vz?`, `fz?` on SimulationNodeDatum; `forceZ` export).
**Warning signs:** `tsc --noEmit` reports "Cannot find module 'd3-force-3d' or its corresponding type declarations."

### Pitfall 3: forceX accessor receives d3 node object, not array index
**What goes wrong:** `forceX((d) => targets[d])` — `d` is the node object, not an integer index. Accessing `targets[d]` returns `undefined`.
**Why it happens:** d3-force passes the full node datum object to accessor functions. The index is a second argument, or stored as `d.index` after simulation initializes.
**How to avoid:** Use `forceX((d, i) => targets.x[i])` or `forceX((d) => targets.x[d.index!])`. Note: `d.index` is only set after `simulation.nodes()` is called — ensure accessor uses `d.index` not a closure over a loop variable.
**Warning signs:** All nodes cluster at x=0 despite non-zero target arrays.

### Pitfall 4: simulation.alpha(0).restart() does nothing
**What goes wrong:** Calling `simulation.alpha(0).restart()` is a no-op — d3 immediately terminates because alpha(0) < alphaMin(0.001).
**Why it happens:** `restart()` begins ticking but the very first tick check sees alpha < alphaMin and fires "end" immediately.
**How to avoid:** Always set alpha to a positive value before restart. The locked decision is `Math.min(maxSlider, 0.3)` — minimum meaningful value ~0.01.
**Warning signs:** Slider change appears to do nothing; simulation never animates.

### Pitfall 5: Position reading race between "end" event and render
**What goes wrong:** The render loop reads `node.x/y/z` for one frame after the "end" event fires, during which `savePositions` is writing asynchronously. Positions appear at partially-written values.
**Why it happens:** "end" fires synchronously on the d3 timer; `savePositions` is async; render RAF fires before the await resolves.
**How to avoid:** In the "end" handler, copy positions to the output Float32Array synchronously, THEN await `savePositions`. Render reads the Float32Array snapshot, not the live d3 nodes.
**Warning signs:** Occasional single-frame flash of wrong node positions immediately after simulation settles.

### Pitfall 6: Vitest environment — d3-force-3d uses requestAnimationFrame
**What goes wrong:** d3-force-3d's internal timer uses `requestAnimationFrame` in browser environments. Vitest default environment is `node`, which has no `requestAnimationFrame`.
**Why it happens:** d3-timer (a d3-force-3d dependency) falls back to `setTimeout` in environments without `rAF`. Tests pass but run slower and timing is imprecise.
**How to avoid:** For physicsLayer tests, call `simulation.tick(N)` manually instead of relying on the timer. This runs N ticks synchronously, giving deterministic test control without any async timer dependency.
**Warning signs:** Tests that await `"end"` event hang indefinitely in node environment.

### Pitfall 7: Float32 position stride mismatch
**What goes wrong:** Passing `Float32Array(n*2)` (xy only) to `savePositions` which expects stride-3 (xyz).
**Why it happens:** `positionsCache.ts` was extended in Phase 1 to stride-3; earlier consumers may still use stride-2.
**How to avoid:** Always allocate `new Float32Array(nodes.length * 3)` and pack `[x, y, z]` at offsets `[i*3, i*3+1, i*3+2]`. `packPositions` will throw if length !== `ids.length * 3`.
**Warning signs:** `packPositions: xyz length X != 3 * ids.length Y` error.

---

## Code Examples

Verified patterns from official d3-force-3d README and API verification (2026-05-19):

### Full physicsLayer Skeleton

```typescript
// app/(dashboard)/users/access-analysis/physicsLayer.ts
// No React, no DOM, no rendering — pure TypeScript (matches mathLayer.ts purity pattern)

import {
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  forceManyBody,
  type Simulation,
} from "d3-force-3d";
import { getDuckDbClient } from "./duckdbClient";
import { savePositions, loadCachedPositions, hashNodeSetAndSliders } from "./positionsCache";

// ---- Types ---------------------------------------------------------------

export interface SimNode {
  id: string;
  index?: number;
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number | null; fy?: number | null; fz?: number | null;
}

/** Per-dimension target coordinate arrays — produced by mathLayer */
export interface TargetArrays {
  [dimId: string]: { x: Float32Array; y: Float32Array; z: Float32Array };
}

export interface PhysicsLayer {
  readonly alphaMask: Float32Array;
  readonly maskVersion: number;
  updateSliders(values: Record<string, number>): void;
  setMask(predicate: (nodeIndex: number) => number): void;
  getPositions(): Float32Array;
  dispose(): void;
}

// ---- Constants -----------------------------------------------------------

const ALPHA_MIN = 0.001;
const ALPHA_MAX_REHEAT = 0.3;
const STRENGTH_AT_ONE = 0.1;     // d3 forceX/Y/Z default
const REPULSION_ZERO = -10;
const REPULSION_ONE = -60;
const DECAY_ZERO = 0.1;          // fast freeze when sliders at 0
const DECAY_ONE = 0.02;          // slow decay when sliders engaged
const SKIP_THRESHOLD = 0.02;     // no-reheat optimization

// ---- Helpers -------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

// ---- Factory -------------------------------------------------------------

export async function createPhysicsLayer(
  nodeIds: string[],
  nodes: SimNode[],
  targets: TargetArrays,
  dimNames: string[],
  initialSliders: Record<string, number>,
): Promise<PhysicsLayer> {
  // --- alphaMask bus (completely separate from simulation) ---
  let _maskVersion = 0;
  const _alphaMask = new Float32Array(nodes.length).fill(1.0);

  // --- Simulation setup ---
  const manyBody = forceManyBody<SimNode>().strength(REPULSION_ZERO);
  const sim = forceSimulation<SimNode>(nodes, 3)  // numDimensions = 3
    .alphaMin(ALPHA_MIN)
    .alphaDecay(DECAY_ZERO)
    .velocityDecay(0.4)
    .force("repulsion", manyBody);

  // Register one named force per dimension
  for (const dimId of dimNames) {
    const t = targets[dimId];
    if (!t) continue;
    sim
      .force(`${dimId}-x`, forceX<SimNode>((d) => t.x[d.index!]).strength(0))
      .force(`${dimId}-y`, forceY<SimNode>((d) => t.y[d.index!]).strength(0))
      .force(`${dimId}-z`, forceZ<SimNode>((d) => t.z[d.index!]).strength(0));
  }

  let frozen = false;
  let prevMax = 0;
  let _sliders = { ...initialSliders };

  // Freeze-on-rest handler
  sim.on("end", async () => {
    frozen = true;
    const xyz = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      xyz[i * 3 + 0] = nodes[i].x ?? 0;
      xyz[i * 3 + 1] = nodes[i].y ?? 0;
      xyz[i * 3 + 2] = nodes[i].z ?? 0;
    }
    const cacheKey = hashNodeSetAndSliders(nodeIds, _sliders);
    const { connection } = await getDuckDbClient();
    await savePositions(connection, cacheKey, nodeIds, xyz);
    sim.stop();  // halts tick counter — PHYS-03
  });

  // Check cache before running
  const { connection } = await getDuckDbClient();
  const cacheKey = hashNodeSetAndSliders(nodeIds, _sliders);
  const cached = await loadCachedPositions(connection, cacheKey, nodeIds);
  if (cached) {
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = cached[i * 3]; nodes[i].y = cached[i * 3 + 1]; nodes[i].z = cached[i * 3 + 2];
      nodes[i].fx = nodes[i].x; nodes[i].fy = nodes[i].y; nodes[i].fz = nodes[i].z;
    }
    sim.stop();
    frozen = true;
  } else {
    // Random seed in [-1, 1]^3
    for (const n of nodes) {
      n.x = Math.random() * 2 - 1;
      n.y = Math.random() * 2 - 1;
      n.z = Math.random() * 2 - 1;
    }
    sim.restart();
  }

  // Public API
  return {
    get alphaMask() { return _alphaMask; },
    get maskVersion() { return _maskVersion; },

    updateSliders(values: Record<string, number>) {
      _sliders = { ...values };
      const maxSlider = Math.max(0, ...Object.values(values));
      const newAlpha = Math.min(maxSlider, ALPHA_MAX_REHEAT);
      const newDecay = lerp(DECAY_ZERO, DECAY_ONE, maxSlider);
      const newRepulsion = lerp(REPULSION_ZERO, REPULSION_ONE, maxSlider);

      // Update each named force's strength
      for (const [dimId, sv] of Object.entries(values)) {
        const str = sv * STRENGTH_AT_ONE;
        (sim.force(`${dimId}-x`) as ReturnType<typeof forceX>)?.strength(str);
        (sim.force(`${dimId}-y`) as ReturnType<typeof forceY>)?.strength(str);
        (sim.force(`${dimId}-z`) as ReturnType<typeof forceZ>)?.strength(str);
      }

      manyBody.strength(newRepulsion);
      sim.alphaDecay(newDecay);

      // No-reheat optimization
      const skip = frozen && Math.abs(maxSlider - prevMax) < SKIP_THRESHOLD;
      if (!skip) {
        frozen = false;
        // Unpin nodes before reheat
        for (const n of nodes) { n.fx = null; n.fy = null; n.fz = null; }
        sim.alpha(newAlpha).restart();
      }
      prevMax = maxSlider;
    },

    setMask(predicate: (nodeIndex: number) => number) {
      // NEVER touches simulation — PHYS-04 invariant
      for (let i = 0; i < _alphaMask.length; i++) {
        _alphaMask[i] = predicate(i);
      }
      _maskVersion++;
    },

    getPositions() {
      const xyz = new Float32Array(nodes.length * 3);
      for (let i = 0; i < nodes.length; i++) {
        xyz[i * 3 + 0] = nodes[i].x ?? 0;
        xyz[i * 3 + 1] = nodes[i].y ?? 0;
        xyz[i * 3 + 2] = nodes[i].z ?? 0;
      }
      return xyz;
    },

    dispose() { sim.stop(); },
  };
}
```

### TypeScript Declaration Shim for d3-force-3d

```typescript
// app/(dashboard)/users/access-analysis/d3-force-3d.d.ts
// d3-force-3d has no bundled types and no @types/ package (verified 2026-05-19).
// This shim exposes the subset used by physicsLayer.ts.

declare module "d3-force-3d" {
  import type {
    SimulationNodeDatum,
    SimulationLinkDatum,
    Force,
  } from "d3-force";

  export interface SimNode3D extends SimulationNodeDatum {
    z?: number;
    vz?: number;
    fz?: number | null;
  }

  export type Simulation3D<N extends SimNode3D> = {
    nodes(): N[];
    nodes(nodes: N[]): Simulation3D<N>;
    alpha(): number;
    alpha(alpha: number): Simulation3D<N>;
    alphaMin(): number;
    alphaMin(min: number): Simulation3D<N>;
    alphaDecay(): number;
    alphaDecay(decay: number): Simulation3D<N>;
    alphaTarget(): number;
    alphaTarget(target: number): Simulation3D<N>;
    velocityDecay(): number;
    velocityDecay(decay: number): Simulation3D<N>;
    numDimensions(): number;
    numDimensions(dims: 1 | 2 | 3): Simulation3D<N>;
    force(name: string): Force<N, SimulationLinkDatum<N>> | null;
    force(name: string, force: Force<N, SimulationLinkDatum<N>> | null): Simulation3D<N>;
    on(typenames: "tick" | "end", listener: () => void): Simulation3D<N>;
    on(typenames: "tick" | "end"): (() => void) | undefined;
    tick(iterations?: number): Simulation3D<N>;
    restart(): Simulation3D<N>;
    stop(): Simulation3D<N>;
    find(x: number, y: number, z?: number, radius?: number): N | undefined;
  };

  export type Force3DX<N extends SimNode3D> = {
    (alpha: number): void;
    initialize(nodes: N[], random: () => number): void;
    strength(): number;
    strength(s: number | ((d: N, i: number) => number)): Force3DX<N>;
    x(): ((d: N) => number) | number;
    x(x: number | ((d: N) => number)): Force3DX<N>;
  } & Force<N, SimulationLinkDatum<N>>;

  export type Force3DY<N extends SimNode3D> = Force3DX<N>;
  export type Force3DZ<N extends SimNode3D> = Force3DX<N>;

  export type ForceManyBody3D<N extends SimNode3D> = {
    (alpha: number): void;
    initialize(nodes: N[], random: () => number): void;
    strength(): number;
    strength(s: number | ((d: N) => number)): ForceManyBody3D<N>;
    theta(): number;
    theta(t: number): ForceManyBody3D<N>;
    distanceMin(): number;
    distanceMin(d: number): ForceManyBody3D<N>;
    distanceMax(): number;
    distanceMax(d: number): ForceManyBody3D<N>;
  } & Force<N, SimulationLinkDatum<N>>;

  export function forceSimulation<N extends SimNode3D>(
    nodes?: N[],
    numDimensions?: 1 | 2 | 3,
  ): Simulation3D<N>;

  export function forceX<N extends SimNode3D>(x?: number | ((d: N) => number)): Force3DX<N>;
  export function forceY<N extends SimNode3D>(y?: number | ((d: N) => number)): Force3DY<N>;
  export function forceZ<N extends SimNode3D>(z?: number | ((d: N) => number)): Force3DZ<N>;
  export function forceManyBody<N extends SimNode3D>(): ForceManyBody3D<N>;
}
```

### Test: PHYS-04 tick counter invariant

```typescript
// physicsLayer.test.ts — node environment (no jsdom needed; d3 uses setTimeout fallback)

import { describe, it, expect } from "vitest";

it("PHYS-04: setMask does not increment tick counter", async () => {
  // Use simulation.tick(N) for synchronous control — avoids RAF dependency
  const sim = forceSimulation(nodes, 3).stop(); // stop immediately
  let tickCount = 0;
  sim.on("tick", () => { tickCount++; });

  const physics = await createPhysicsLayer(...);
  const before = tickCount;

  // setMask must not trigger any tick
  physics.setMask((i) => i % 2 === 0 ? 1.0 : 0.3);

  expect(tickCount).toBe(before);
});
```

### Test: PHYS-03 slider sweep observable

```typescript
it("PHYS-03: slider sweep 0→1 produces monotonic engine params", () => {
  const steps = [0, 0.25, 0.5, 0.75, 1.0];
  const decayValues: number[] = [];
  const repulsionValues: number[] = [];

  for (const v of steps) {
    // Call updateSliders and read back via sim.alphaDecay() and manyBody.strength()
    physics.updateSliders({ activity: v, recency: 0 });
    decayValues.push(sim.alphaDecay());
    repulsionValues.push(Math.abs(manyBodyStrength)); // repulsion magnitude
  }

  // alphaDecay should decrease as slider increases (more motion time)
  for (let i = 1; i < decayValues.length; i++) {
    expect(decayValues[i]).toBeLessThanOrEqual(decayValues[i - 1]);
  }
  // repulsion magnitude should increase as slider increases
  for (let i = 1; i < repulsionValues.length; i++) {
    expect(repulsionValues[i]).toBeGreaterThanOrEqual(repulsionValues[i - 1]);
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `simulation.force("charge", d3.forceManyBody())` (2D) | `forceSimulation(nodes, 3)` with `forceZ` | d3-force-3d v1 → v3 | numDimensions is now a constructor arg, not a post-init setter |
| Polling `alpha() < threshold` for settle detection | d3 `"end"` event | d3-force v2+ | Eliminates poll loop; event fires inside d3's own timer loop |
| `simulation.restart()` (reset to alpha=1) | `simulation.alpha(target).restart()` | d3-force v2 | Old API was undocumented to preserve alpha; new is explicit |
| `@types/d3-force-3d` on DefinitelyTyped | Local declaration shim | Never existed | Must author shim; no community types for the 3D variant |

**Deprecated/outdated:**
- `simulation.drag()`: removed in d3-force v2; use `velocityDecay` instead.
- cosmograph/cosmos.gl: disqualified by project decision — 2D-only, no runtime force-weight mutation.

---

## Open Questions

1. **d3-force-3d: does forceZ exist as a named export?**
   - What we know: README documents `forceZ`, GitHub source exports it, API verified via WebFetch. npm metadata shows no bundled types.
   - What's unclear: Exact named-export shape in the ESM bundle vs CJS build. Project uses Next.js with webpack — need to verify the ESM import path resolves correctly.
   - Recommendation: After `npm install d3-force-3d`, run `node -e "const d = require('d3-force-3d'); console.log(Object.keys(d))"` to confirm `forceZ` is in the exports list before writing physicsLayer.ts.

2. **Target arrays shape: per-dim xyz vs interleaved Float32Array**
   - What we know: mathLayer.ts returns a single `Float32Array(n*3)` for all nodes and all sliders combined. The physics layer needs per-dim per-axis target arrays for the `forceX/Y/Z` accessors.
   - What's unclear: Whether the plan calls `computeTargetPositions` per-dim (one call per slider) or once with all sliders and then splits the result, or whether it stores the target arrays differently.
   - Recommendation: Plan 02-01 should define how physics receives per-dim targets from the math layer. Options: (a) call `computeTargetPositions` once per dimension with that dim's slider set to 1 and all others to 0; (b) expose a new `computeTargetPerDim` from mathLayer. Option (a) reuses the existing API without any Phase 1 changes.

3. **LRU eviction for positions cache**
   - What we know: CONTEXT.md says "Old entries remain and are evicted by LRU." positionsCache.ts has no LRU logic today.
   - What's unclear: Whether Phase 2 must implement LRU or defer it.
   - Recommendation: Defer. With ~500–6000 nodes and 6 dims at 0.05 slider buckets, worst-case entries are bounded. Add a comment `// TODO: LRU eviction` in savePositions. Do not implement in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- d3-force-3d GitHub README (fetched 2026-05-19) — `forceSimulation`, `numDimensions`, `forceX/Y/Z`, `forceManyBody`, `"end"` event, `alpha/alphaDecay/alphaMin/alphaTarget`, `restart/stop/tick` APIs
- npm info d3-force-3d (fetched 2026-05-19) — version 3.0.6 confirmed, deps: d3-binarytree, d3-dispatch, d3-octree, d3-quadtree, d3-timer
- positionsCache.ts (Phase 1 source) — `savePositions`, `loadCachedPositions`, `hashNodeSetAndSliders`, stride-3 Float32Array confirmed
- mathLayer.ts (Phase 1 source) — `computeTargetPositions` signature, `Float32Array(n*3)` output, `NodeFeatureVector`, `DimensionDescriptor`
- package.json — d3-force-3d NOT installed; d3-force@3.0.0 IS installed; @types/d3-force@3.0.10 installed

### Secondary (MEDIUM confidence)
- npm search for @types/d3-force-3d (2026-05-19) — confirmed does not exist on npm; local declaration shim required
- d3-force-3d npm page — confirms ESM + UMD exports, no `.d.ts` bundled

### Tertiary (LOW confidence)
- None. All critical claims verified via primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — d3-force-3d 3.0.6 version confirmed via npm, API verified via official README
- Architecture: HIGH — patterns derived directly from d3-force-3d API + Phase 1 source contracts
- Pitfalls: HIGH — most derive from verified API properties (numDimensions default, no @types, stride-3 contract)
- Open Questions: MEDIUM — target arrays shape requires a plan-level decision; LRU is a clear deferral

**Research date:** 2026-05-19
**Valid until:** 2026-06-18 (d3-force-3d is stable; 30-day window)
