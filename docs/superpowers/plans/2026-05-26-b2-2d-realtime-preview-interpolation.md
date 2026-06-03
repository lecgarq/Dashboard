# B.2 — 2D Real-Time Preview Interpolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 2D access graph feel truly real-time during slider input by interpolating displayed node positions toward a slider-derived target field at full rAF cadence, while d3 continues to settle authoritatively in the background.

**Architecture:** Introduce a pure `previewLayer` module that computes a per-node target field from the current sliders, per-dimension target arrays, and per-node dimWeights, then lerps a displayed-position buffer toward that field every animation frame. `GraphCanvas` owns the preview buffer and supplies an optional `getPositionsOverride` to `useGraphRafLoop` so that during preview (and in 2D only) the renderer uploads the interpolated buffer instead of the d3 snapshot. On preview exit, the buffer is handed back to physics via a new `syncPositions(xyz)` API so d3 resumes from the visible state — no snap. 3D, mask bus, lasso/filter/selection semantics, and node identity are untouched.

**Tech Stack:** TypeScript, React, d3-force-3d (existing PhysicsLayer), Float32Array stride-3 buffers, Vitest + RTL for unit/integration, Playwright for runtime probe. No new runtime dependencies.

---

## Background (read once before starting)

**Why 2D feels tick-bound today (B.1 baseline).** The 2D path uploads positions every `requestAnimationFrame`, but the *source* positions only change when d3 ticks. With 16,942 nodes, d3 produces ~20–23 fresh ticks per second even with the B.1 drag-preview profile (repulsion detached, `forceManyBody` skipped). The renderer is therefore drawing the same coordinates ~3 frames in a row, perceived as steppy motion.

**Why a renderer-side preview buffer is the fix.** The per-dimension target arrays already exist inside `physicsLayer` (`TargetArrays`). The per-node `dimWeights` already exist (confidence × availability × transformer). Given current slider values, the *direction* every node wants to move is computable in O(n) without d3 — this is exactly what d3's `forceX/Y/Z.strength(...)` does internally, but d3 also applies velocity integration, repulsion, and alpha-bounded movement. For *preview* we don't need equilibrium; we need legible motion. So we lerp displayed positions toward a per-node weighted-target every frame and let d3 catch up in parallel.

**Why this preserves correctness.** d3 remains authoritative. Preview only overrides what the renderer *displays*; the simulation's node objects keep ticking. On preview exit we write the displayed buffer back into d3 (`syncPositions`) so the two states converge with zero visible discontinuity, and d3's normal settle path takes over.

**Strict scope reminder.** 2D only. No 3D changes, no color changes, no nav/route/DC work, no Task 6, no R1, no worker/precompute, no renderer-stack rewrite.

---

## File Structure

**New files**
- `app/(dashboard)/users/access-analysis/previewLayer.ts` — pure module: target-field computation, per-node net-pull weighting, lerp step. No React, no d3, no DOM.
- `app/(dashboard)/users/access-analysis/previewLayer.test.ts` — Vitest unit tests for the pure module.
- `app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx` — RTL integration test exercising GraphCanvas + SliderContext + a stub physics layer.

**Modified files**
- `app/(dashboard)/users/access-analysis/physicsLayer.ts` — add read-only accessors (`getTargets`, `getDimWeights`, `getSliders`) and a new `syncPositions(xyz)` method. Bump `PhysicsLayer` interface. No behavior change to the simulation.
- `app/(dashboard)/users/access-analysis/physicsLayer.test.ts` — add tests for the new accessors and `syncPositions`.
- `app/(dashboard)/users/access-analysis/SliderContext.tsx` — surface `isPreviewActive` (boolean ref + subscription) so GraphCanvas can react without churning React state on every drag.
- `app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx` — add tests for the new subscription API.
- `app/(dashboard)/users/access-analysis/useGraphRafLoop.ts` — add optional `getPositionsOverride?: () => Float32Array | null`. When provided and returning non-null, used in place of `physics.getPositions()`. Strictly opt-in.
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — own the preview buffer, wire the override (2D mode only), call `physics.syncPositions` on preview exit, expose a single feature flag `enablePreviewInterpolation` (default true; flips to false rolls back to B.1 behavior).
- `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` — integration coverage for preview enter/exit and the 3D no-op guarantee.

**Untouched (do not modify)**
- `GraphCanvas3D.tsx`, instance/edge color paths, mask bus, FilterContext, accessFacets, dimensionRegistry, lasso, search, positionsCache.

---

## Required APIs (locked signatures)

Add to `PhysicsLayer` (physicsLayer.ts):

```ts
export interface PhysicsLayer {
  // ...existing members unchanged...

  /** Read-only snapshot of the per-dimension target arrays passed at construction. */
  getTargets(): TargetArrays;

  /** Read-only snapshot of the per-dimension dimWeights passed at construction. Empty object if none. */
  getDimWeights(): Record<string, Float32Array>;

  /** Latest slider values seen by `updateSliders` (normalized 0..1). Returns a shallow copy. */
  getSliders(): Record<string, number>;

  /**
   * Write displayed xyz back into d3's node array so a subsequent tick continues
   * from this position (no snap on preview exit). Stride 3, length n*3.
   * Bumps positionsVersion. PHYSICS-bus only — never touches mask or alpha.
   */
  syncPositions(xyz: Float32Array): void;
}
```

Add to `SliderContextValue` (SliderContext.tsx):

```ts
interface SliderContextValue {
  // ...existing members unchanged...

  /**
   * Subscribe to preview-active transitions. Listener is invoked synchronously
   * inside enterPreview/exitPreview. Returns an unsubscribe function.
   * The boolean ref source-of-truth is owned by SliderContext; consumers MUST NOT
   * mirror it in React state on the hot path.
   */
  subscribePreviewActive(listener: (active: boolean) => void): () => void;

  /** Synchronous read of current preview state. */
  isPreviewActive(): boolean;
}
```

Extend `UseGraphRafLoopOptions` (useGraphRafLoop.ts):

```ts
export interface UseGraphRafLoopOptions {
  // ...existing members unchanged...

  /**
   * Optional per-frame positions source. When supplied and the call returns a
   * non-null Float32Array, the loop routes THAT array to onTick2D/onTick3D
   * instead of calling physics.getPositions(). Returning null falls back to
   * physics.getPositions() for that frame. Intended for 2D preview override.
   */
  getPositionsOverride?: () => Float32Array | null;
}
```

`previewLayer.ts` public surface:

```ts
export interface PreviewLayer {
  /** Allocate-once Float32Array(n*3) used as the displayed buffer. */
  readonly displayed: Float32Array;
  /** Pull seed positions from the current physics snapshot. Idempotent. */
  seedFrom(xyz: Float32Array): void;
  /**
   * Advance the displayed buffer one frame toward the slider-weighted target field.
   * Returns true if any coordinate changed by more than EPSILON this step.
   */
  step(sliders: Record<string, number>, dtMs: number): boolean;
  /** Snapshot displayed (returns the internal buffer; do not mutate externally). */
  snapshot(): Float32Array;
}

export function createPreviewLayer(opts: {
  targets: TargetArrays;
  dimWeights: Record<string, Float32Array>;
  nodeCount: number;
}): PreviewLayer;
```

---

## Invariants (enforced by tests)

- Node count remains 16,942 (no add/remove paths touched).
- UserProjectInstance identity unchanged — keying still by `id`.
- Mask bus untouched: no preview path reads or writes `alphaMask` / `maskVersion`.
- Lasso/search/filter/selection semantics unchanged — they consume mask + positions snapshot exactly as before.
- `positionsCache` save/restore semantics preserved — preview never persists; it only overlays the live render frame.
- No `Duplicate key` regression — preview does not introduce new React lists.
- 3D path: when `mode === "3d"`, `getPositionsOverride` is never installed; `useGraphRafLoop` behavior is byte-identical to B.1.

---

## Self-Review Pre-Check (run before declaring done)

- [ ] All `PhysicsLayer` additions are read-only or PHYSICS-bus only.
- [ ] No call site of `setMask` is added or modified.
- [ ] `getPositionsOverride` returning `null` falls through to `physics.getPositions()` (no allocation difference vs B.1).
- [ ] `syncPositions` writes node `x/y/z` in-place; no node-array reshape.
- [ ] Feature flag `enablePreviewInterpolation` flips the whole feature off in one place.

---

## TDD Task Breakdown

### Task 1: Pure `previewLayer` — types and seeding

**Files:**
- Create: `app/(dashboard)/users/access-analysis/previewLayer.ts`
- Create: `app/(dashboard)/users/access-analysis/previewLayer.test.ts`

- [ ] **Step 1.1: Write the failing test — module shape and seedFrom**

```ts
// previewLayer.test.ts
import { describe, it, expect } from "vitest";
import { createPreviewLayer } from "./previewLayer";

const targets = {
  d1: { x: new Float32Array([1, 2]), y: new Float32Array([3, 4]), z: new Float32Array([5, 6]) },
};
const dimWeights = { d1: new Float32Array([1, 1]) };

describe("previewLayer — construction & seed", () => {
  it("allocates an n*3 displayed buffer of zeros", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    expect(p.displayed).toBeInstanceOf(Float32Array);
    expect(p.displayed.length).toBe(6);
    expect(Array.from(p.displayed)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("seedFrom copies the provided xyz verbatim", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const seed = new Float32Array([10, 11, 12, 20, 21, 22]);
    p.seedFrom(seed);
    expect(Array.from(p.displayed)).toEqual([10, 11, 12, 20, 21, 22]);
  });

  it("seedFrom returns the same buffer reference each call (no realloc)", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const before = p.displayed;
    p.seedFrom(new Float32Array(6));
    expect(p.displayed).toBe(before);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/previewLayer.test.ts`
Expected: FAIL with "Cannot find module './previewLayer'".

- [ ] **Step 1.3: Write minimal implementation**

```ts
// previewLayer.ts
import type { TargetArrays } from "./physicsLayer";

export interface PreviewLayer {
  readonly displayed: Float32Array;
  seedFrom(xyz: Float32Array): void;
  step(sliders: Record<string, number>, dtMs: number): boolean;
  snapshot(): Float32Array;
}

export function createPreviewLayer(opts: {
  targets: TargetArrays;
  dimWeights: Record<string, Float32Array>;
  nodeCount: number;
}): PreviewLayer {
  const { nodeCount } = opts;
  const displayed = new Float32Array(nodeCount * 3);

  function seedFrom(xyz: Float32Array): void {
    if (xyz.length !== displayed.length) {
      throw new Error(
        `previewLayer.seedFrom: length mismatch (got ${xyz.length}, expected ${displayed.length})`,
      );
    }
    displayed.set(xyz);
  }

  function step(_sliders: Record<string, number>, _dtMs: number): boolean {
    // Implemented in Task 2.
    return false;
  }

  function snapshot(): Float32Array {
    return displayed;
  }

  return { displayed, seedFrom, step, snapshot };
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/previewLayer.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 1.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/previewLayer.ts app/"(dashboard)"/users/access-analysis/previewLayer.test.ts
git commit -m "feat(acc-graph): previewLayer scaffold + seedFrom (B.2 P1)"
```

---

### Task 2: Pure `previewLayer` — target field + lerp step

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/previewLayer.ts`
- Modify: `app/(dashboard)/users/access-analysis/previewLayer.test.ts`

**Design note.** Per-node target is the weighted average of dim targets:
`Tx[i] = Σ_d (slider[d] · w_d[i] · target[d].x[i]) / Σ_d (slider[d] · w_d[i])`
If the denominator is zero (no active dim contributes for node i), the node holds position. Lerp coefficient is `1 - exp(-dtMs / TAU_MS)` with `TAU_MS = 80` — a critical-damped-ish feel; at 16ms gives `~0.18` step, settling in ~5 frames toward the target field, which matches the perceived responsiveness window without overshooting d3.

- [ ] **Step 2.1: Write the failing tests**

```ts
// append to previewLayer.test.ts
describe("previewLayer — step", () => {
  const targets = {
    d1: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
    d2: { x: new Float32Array([0, 0]), y: new Float32Array([100, 100]), z: new Float32Array([0, 0]) },
  };
  const dimWeights = { d1: new Float32Array([1, 1]), d2: new Float32Array([1, 1]) };

  it("returns false when all sliders are zero", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([50, 50, 0, 50, 50, 0]));
    const moved = p.step({ d1: 0, d2: 0 }, 16);
    expect(moved).toBe(false);
    expect(Array.from(p.displayed)).toEqual([50, 50, 0, 50, 50, 0]);
  });

  it("moves toward the d1 target when only d1 is active", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([0, 0, 0, 0, 0, 0]));
    const moved = p.step({ d1: 1, d2: 0 }, 16);
    expect(moved).toBe(true);
    // x moves toward 100; first frame at TAU_MS=80 → ~0.18 of the way.
    expect(p.displayed[0]).toBeGreaterThan(10);
    expect(p.displayed[0]).toBeLessThan(25);
    expect(p.displayed[1]).toBe(0); // y untouched (no d2 pull)
  });

  it("blends targets proportionally to slider values", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    p.seedFrom(new Float32Array([0, 0, 0, 0, 0, 0]));
    // Many steps until convergence within EPSILON.
    for (let i = 0; i < 200; i++) p.step({ d1: 1, d2: 1 }, 16);
    // Equal weights → equal blend; target field = (50, 50, 0).
    expect(p.displayed[0]).toBeCloseTo(50, 0);
    expect(p.displayed[1]).toBeCloseTo(50, 0);
  });

  it("holds position when a node has zero dimWeight on every active dim", () => {
    const zeroW = { d1: new Float32Array([0, 1]), d2: new Float32Array([0, 1]) };
    const p = createPreviewLayer({ targets, dimWeights: zeroW, nodeCount: 2 });
    p.seedFrom(new Float32Array([7, 7, 7, 0, 0, 0]));
    p.step({ d1: 1, d2: 1 }, 16);
    expect(p.displayed[0]).toBe(7);
    expect(p.displayed[1]).toBe(7);
    expect(p.displayed[2]).toBe(7);
    // node 1 (weight 1) DID move
    expect(p.displayed[3]).toBeGreaterThan(0);
  });

  it("does not allocate per-frame (buffer reference stable across many steps)", () => {
    const p = createPreviewLayer({ targets, dimWeights, nodeCount: 2 });
    const ref = p.displayed;
    for (let i = 0; i < 100; i++) p.step({ d1: 1, d2: 0 }, 16);
    expect(p.snapshot()).toBe(ref);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/previewLayer.test.ts`
Expected: FAIL — the new step tests fail on returns `false` / no movement.

- [ ] **Step 2.3: Implement step()**

Replace the placeholder `step` and add the helpers:

```ts
// inside createPreviewLayer, near the top of the closure:
const TAU_MS = 80;
const EPSILON = 1e-4;
const { targets, dimWeights, nodeCount } = opts;
const dimIds = Object.keys(targets);
// Stable scratch arrays — one allocation per layer, never realloced.
const tx = new Float32Array(nodeCount);
const ty = new Float32Array(nodeCount);
const tz = new Float32Array(nodeCount);
const wSum = new Float32Array(nodeCount);

function step(sliders: Record<string, number>, dtMs: number): boolean {
  // Zero scratch.
  tx.fill(0); ty.fill(0); tz.fill(0); wSum.fill(0);
  let anyActive = false;
  for (const dimId of dimIds) {
    const sv = sliders[dimId] ?? 0;
    if (sv <= 0) continue;
    const t = targets[dimId];
    const w = dimWeights[dimId];
    anyActive = true;
    for (let i = 0; i < nodeCount; i++) {
      const wi = sv * (w ? w[i] : 1);
      if (wi === 0) continue;
      tx[i] += wi * t.x[i];
      ty[i] += wi * t.y[i];
      tz[i] += wi * t.z[i];
      wSum[i] += wi;
    }
  }
  if (!anyActive) return false;
  const alpha = 1 - Math.exp(-dtMs / TAU_MS);
  let moved = false;
  for (let i = 0; i < nodeCount; i++) {
    const sw = wSum[i];
    if (sw === 0) continue; // hold position
    const txi = tx[i] / sw;
    const tyi = ty[i] / sw;
    const tzi = tz[i] / sw;
    const j = i * 3;
    const dx = (txi - displayed[j]) * alpha;
    const dy = (tyi - displayed[j + 1]) * alpha;
    const dz = (tzi - displayed[j + 2]) * alpha;
    if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON || Math.abs(dz) > EPSILON) {
      displayed[j] += dx;
      displayed[j + 1] += dy;
      displayed[j + 2] += dz;
      moved = true;
    }
  }
  return moved;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/previewLayer.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 2.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/previewLayer.ts app/"(dashboard)"/users/access-analysis/previewLayer.test.ts
git commit -m "feat(acc-graph): previewLayer target-field + lerp step (B.2 P1)"
```

---

### Task 3: physicsLayer accessors

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
// physicsLayer.test.ts — append a new describe block
describe("B.2 accessors", () => {
  it("getTargets returns the targets passed at construction", async () => {
    const t = makeTinyFixture(); // existing helper; provides targets/dimNames/nodes/ids
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    expect(physics.getTargets()).toBe(t.targets);
    physics.dispose();
  });
  it("getDimWeights returns the dimWeights passed at construction (default {})", async () => {
    const t = makeTinyFixture();
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    expect(physics.getDimWeights()).toEqual({});
    physics.dispose();
  });
  it("getSliders reflects the latest updateSliders call (normalized copy)", async () => {
    const t = makeTinyFixture();
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    physics.updateSliders({ d1: 0.42 });
    const s = physics.getSliders();
    expect(s.d1).toBeCloseTo(0.42, 5);
    // mutating the copy must not affect the internal state
    s.d1 = 999;
    expect(physics.getSliders().d1).toBeCloseTo(0.42, 5);
    physics.dispose();
  });
});
```

If `makeTinyFixture` does not already exist in physicsLayer.test.ts, define it at the top of the new describe with a 2-node setup mirroring previewLayer.test.ts.

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/physicsLayer.test.ts`
Expected: FAIL — `physics.getTargets is not a function`.

- [ ] **Step 3.3: Implement accessors**

In `physicsLayer.ts`, inside `createPhysicsLayer`, after the existing slider state declarations:

```ts
let _latestSliders: Record<string, number> = { ...initialSliders };
```

In the existing `applySliderForces` / `updateSliders` path, **immediately before** the existing `applySliderForces(values)` call, persist the snapshot:

```ts
_latestSliders = { ...values };
```

Then in the returned object literal at the bottom of `createPhysicsLayer`, add:

```ts
getTargets: () => targets,
getDimWeights: () => dimWeights,
getSliders: () => ({ ..._latestSliders }),
```

And update the `PhysicsLayer` interface at the top of the file as specified in "Required APIs" (omit `syncPositions` for now — Task 4 adds it).

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/physicsLayer.test.ts`
Expected: PASS — including all existing tests (no behavioral regression).

- [ ] **Step 3.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/physicsLayer.ts app/"(dashboard)"/users/access-analysis/physicsLayer.test.ts
git commit -m "feat(acc-graph): physicsLayer read-only accessors (B.2 P2)"
```

---

### Task 4: physicsLayer.syncPositions

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`

- [ ] **Step 4.1: Write failing test**

```ts
// physicsLayer.test.ts — append
describe("B.2 syncPositions", () => {
  it("writes xyz into node x/y/z and bumps positionsVersion", async () => {
    const t = makeTinyFixture();
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    const v0 = physics.positionsVersion;
    const next = new Float32Array([1, 2, 3, 4, 5, 6]);
    physics.syncPositions(next);
    const out = physics.getPositions();
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(physics.positionsVersion).toBeGreaterThan(v0);
    physics.dispose();
  });
  it("does not touch maskVersion", async () => {
    const t = makeTinyFixture();
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    const m0 = physics.maskVersion;
    physics.syncPositions(new Float32Array([0, 0, 0, 0, 0, 0]));
    expect(physics.maskVersion).toBe(m0);
    physics.dispose();
  });
  it("rejects mismatched buffer length", async () => {
    const t = makeTinyFixture();
    const physics = await createPhysicsLayer(t.ids, t.nodes, t.targets, t.dimNames, t.sliders);
    expect(() => physics.syncPositions(new Float32Array(3))).toThrow(/length/i);
    physics.dispose();
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/physicsLayer.test.ts`
Expected: FAIL — `physics.syncPositions is not a function`.

- [ ] **Step 4.3: Implement syncPositions**

Add to the returned object inside `createPhysicsLayer`:

```ts
syncPositions: (xyz: Float32Array): void => {
  const expected = nodes.length * 3;
  if (xyz.length !== expected) {
    throw new Error(
      `physicsLayer.syncPositions: length mismatch (got ${xyz.length}, expected ${expected})`,
    );
  }
  for (let i = 0; i < nodes.length; i++) {
    const j = i * 3;
    nodes[i].x = xyz[j];
    nodes[i].y = xyz[j + 1];
    nodes[i].z = xyz[j + 2];
  }
  _positionsVersion++;
},
```

Add `syncPositions` to the `PhysicsLayer` interface (top of file).

- [ ] **Step 4.4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/physicsLayer.test.ts`
Expected: PASS — all existing + 3 new.

- [ ] **Step 4.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/physicsLayer.ts app/"(dashboard)"/users/access-analysis/physicsLayer.test.ts
git commit -m "feat(acc-graph): physicsLayer.syncPositions for B.2 preview handoff"
```

---

### Task 5: SliderContext — preview subscription

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx`
- Modify: `app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx`

- [ ] **Step 5.1: Write failing test**

```tsx
// SliderContext.test.tsx — new describe
describe("preview subscription (B.2)", () => {
  it("isPreviewActive reflects enter/exit, subscribers fire synchronously", () => {
    const physics = makeFakePhysics(); // existing helper or local stub
    const seen: boolean[] = [];
    function Probe(): JSX.Element {
      const ctx = useSliders();
      React.useEffect(() => ctx.subscribePreviewActive((a) => seen.push(a)), [ctx]);
      return <button onClick={() => ctx.setSliderValue("d1", 50)}>tap</button>;
    }
    render(
      <SliderProvider physics={physics}>
        <Probe />
      </SliderProvider>,
    );
    fireEvent.click(screen.getByText("tap"));
    // enterPreview must have fired true synchronously
    expect(seen[0]).toBe(true);
  });
});
```

If `makeFakePhysics` is not present, inline a minimal stub:

```ts
function makeFakePhysics() {
  return {
    alphaMask: new Float32Array(0),
    maskVersion: 0,
    positionsVersion: 0,
    frozen: false,
    updateSliders: vi.fn(),
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    getPositions: () => new Float32Array(0),
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    syncPositions: vi.fn(),
    dispose: vi.fn(),
  } as unknown as PhysicsLayer;
}
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/SliderContext.test.tsx`
Expected: FAIL — `ctx.subscribePreviewActive is not a function`.

- [ ] **Step 5.3: Implement subscription**

In `SliderContext.tsx`, inside `SliderProvider`, near the existing `previewActiveRef` declaration:

```ts
const previewListenersRef = useRef<Set<(a: boolean) => void>>(new Set());

const emitPreview = useCallback((active: boolean) => {
  previewListenersRef.current.forEach((fn) => fn(active));
}, []);
```

Modify `enterPreview` to emit on the *transition*:

```ts
const enterPreview = useCallback((): void => {
  if (!physics) return;
  if (!previewActiveRef.current) {
    previewActiveRef.current = true;
    physics.setActiveInput?.(true);
    emitPreview(true);
  }
  if (previewIdleIdRef.current !== null) {
    window.clearTimeout(previewIdleIdRef.current);
  }
  previewIdleIdRef.current = window.setTimeout(() => {
    previewIdleIdRef.current = null;
    previewActiveRef.current = false;
    physics.setActiveInput?.(false);
    emitPreview(false);
  }, PREVIEW_IDLE_MS);
}, [physics, emitPreview]);
```

Modify the `resetAll` early-exit branch that flips `previewActiveRef.current = false` to also call `emitPreview(false)`.

Extend `SliderContextValue` and `ctx` memo:

```ts
interface SliderContextValue {
  // existing fields...
  subscribePreviewActive: (listener: (active: boolean) => void) => () => void;
  isPreviewActive: () => boolean;
}

// in useMemo:
subscribePreviewActive: (fn) => {
  previewListenersRef.current.add(fn);
  return () => { previewListenersRef.current.delete(fn); };
},
isPreviewActive: () => previewActiveRef.current,
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/SliderContext.test.tsx`
Expected: PASS — including all existing.

- [ ] **Step 5.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/SliderContext.tsx app/"(dashboard)"/users/access-analysis/__tests__/SliderContext.test.tsx
git commit -m "feat(acc-graph): SliderContext preview subscription (B.2 P2)"
```

---

### Task 6: useGraphRafLoop — getPositionsOverride

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/useGraphRafLoop.ts`
- Create: `app/(dashboard)/users/access-analysis/useGraphRafLoop.test.ts`

- [ ] **Step 6.1: Write failing test**

```ts
// useGraphRafLoop.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useGraphRafLoop } from "./useGraphRafLoop";

function makePhysics(buf: Float32Array) {
  return {
    alphaMask: new Float32Array(0),
    maskVersion: 0,
    positionsVersion: 0,
    frozen: false,
    getPositions: () => buf,
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    updateSliders: vi.fn(),
    syncPositions: vi.fn(),
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    dispose: vi.fn(),
  } as unknown as Parameters<typeof useGraphRafLoop>[0]["physics"];
}

describe("useGraphRafLoop — getPositionsOverride", () => {
  it("routes override buffer to onTick2D when override returns non-null", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const fromOverride = new Float32Array([9, 9, 9]);
    const onTick2D = vi.fn();
    renderHook(() =>
      useGraphRafLoop({
        physics: makePhysics(fromPhysics),
        mode: "2d",
        enabled: true,
        onTick2D,
        onTick3D: vi.fn(),
        getPositionsOverride: () => fromOverride,
      }),
    );
    await act(() => new Promise((r) => setTimeout(r, 32)));
    expect(onTick2D).toHaveBeenCalled();
    expect(onTick2D.mock.calls[0][0]).toBe(fromOverride);
  });

  it("falls back to physics.getPositions when override returns null", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const onTick2D = vi.fn();
    renderHook(() =>
      useGraphRafLoop({
        physics: makePhysics(fromPhysics),
        mode: "2d",
        enabled: true,
        onTick2D,
        onTick3D: vi.fn(),
        getPositionsOverride: () => null,
      }),
    );
    await act(() => new Promise((r) => setTimeout(r, 32)));
    expect(onTick2D.mock.calls[0][0]).toBe(fromPhysics);
  });

  it("ignores override in 3D mode (always uses physics)", async () => {
    const fromPhysics = new Float32Array([1, 1, 1]);
    const fromOverride = new Float32Array([9, 9, 9]);
    const onTick3D = vi.fn();
    renderHook(() =>
      useGraphRafLoop({
        physics: makePhysics(fromPhysics),
        mode: "3d",
        enabled: true,
        onTick2D: vi.fn(),
        onTick3D,
        getPositionsOverride: () => fromOverride,
      }),
    );
    await act(() => new Promise((r) => setTimeout(r, 32)));
    expect(onTick3D.mock.calls[0][0]).toBe(fromPhysics);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/useGraphRafLoop.test.ts`
Expected: FAIL — `onTick2D` receives `fromPhysics` instead of `fromOverride`.

- [ ] **Step 6.3: Implement override**

In `useGraphRafLoop.ts`, extend the options interface and the tick body:

```ts
export interface UseGraphRafLoopOptions {
  // existing...
  getPositionsOverride?: () => Float32Array | null;
}

// stable ref:
const getOverrideRef = useRef(opts.getPositionsOverride);
getOverrideRef.current = opts.getPositionsOverride;

// inside tick():
let xyz: Float32Array;
if (opts.mode === "2d" && getOverrideRef.current) {
  const override = getOverrideRef.current();
  xyz = override ?? opts.physics.getPositions();
} else {
  xyz = opts.physics.getPositions();
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/useGraphRafLoop.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/useGraphRafLoop.ts app/"(dashboard)"/users/access-analysis/useGraphRafLoop.test.ts
git commit -m "feat(acc-graph): useGraphRafLoop optional getPositionsOverride (B.2 P3)"
```

---

### Task 7: GraphCanvas — wire preview override (2D only)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- Create: `app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx`

**Wiring sketch (inside `GraphCanvas`).**

```ts
const enablePreviewInterpolation = true; // single rollback switch (see Task 9)

const slider = useSliders();
const previewRef = useRef<PreviewLayer | null>(null);
const lastFrameTsRef = useRef<number>(0);
const previewActiveRef = useRef<boolean>(false);

// Build preview layer once per physics instance.
useEffect(() => {
  if (!enablePreviewInterpolation) { previewRef.current = null; return; }
  previewRef.current = createPreviewLayer({
    targets: props.physics.getTargets(),
    dimWeights: props.physics.getDimWeights(),
    nodeCount: props.physics.getPositions().length / 3,
  });
  return () => { previewRef.current = null; };
}, [props.physics]);

// Subscribe to preview transitions:
//   enter → seed buffer from current physics positions
//   exit  → write buffer back into physics (syncPositions)
useEffect(() => {
  return slider.subscribePreviewActive((active) => {
    const layer = previewRef.current;
    if (!layer) return;
    if (active) {
      layer.seedFrom(props.physics.getPositions());
      lastFrameTsRef.current = performance.now();
      previewActiveRef.current = true;
    } else if (previewActiveRef.current) {
      props.physics.syncPositions(layer.snapshot());
      previewActiveRef.current = false;
    }
  });
}, [slider, props.physics]);

// Override callback — referentially stable.
const getPositionsOverride = useCallback((): Float32Array | null => {
  if (!previewActiveRef.current) return null;
  const layer = previewRef.current;
  if (!layer) return null;
  const now = performance.now();
  const dt = Math.min(50, now - lastFrameTsRef.current); // cap at 50ms after pause
  lastFrameTsRef.current = now;
  layer.step(props.physics.getSliders(), dt);
  return layer.snapshot();
}, [props.physics]);

useGraphRafLoop({
  physics: props.physics,
  mode: props.mode,
  enabled: true,
  onTick2D,
  onTick3D,
  onMaskChange,
  getPositionsOverride,
});
```

- [ ] **Step 7.1: Write failing integration test**

```tsx
// __tests__/previewIntegration.test.tsx
import { render, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraphCanvas } from "../GraphCanvas";
import { SliderProvider } from "../SliderContext";
// import a fake physics constructor — see makePhysicsFixture below

describe("B.2 — 2D preview override end-to-end", () => {
  it("uploads preview-buffer xyz during slider input and reverts to physics after idle", async () => {
    const physics = makePhysicsFixture(); // 2 nodes, d1 only, target=(100,0,0)
    const xyzCaptured: Float32Array[] = [];
    const onTick2D = (xyz: Float32Array) => { xyzCaptured.push(new Float32Array(xyz)); };

    render(
      <SliderProvider physics={physics}>
        <GraphCanvas mode="2d" physics={physics} dimNames={["d1"]} onTick2DCapture={onTick2D} />
      </SliderProvider>,
    );

    // Move slider → enter preview, buffer should lerp toward target.
    fireEvent.click(document.body); // or use a programmatic slider helper
    // ...drive slider via ctx.setSliderValue("d1", 100)...

    await act(() => new Promise((r) => setTimeout(r, 100)));
    const moving = xyzCaptured.some(b => b[0] > 0 && b[0] < 100);
    expect(moving).toBe(true);

    // Wait past PREVIEW_IDLE_MS (250) → exit; verify syncPositions called.
    await act(() => new Promise((r) => setTimeout(r, 350)));
    expect(physics.syncPositions).toHaveBeenCalled();
  });

  it("3D mode never installs the override (no preview buffer used)", async () => {
    const physics = makePhysicsFixture();
    render(
      <SliderProvider physics={physics}>
        <GraphCanvas mode="3d" physics={physics} dimNames={["d1"]} />
      </SliderProvider>,
    );
    // drive slider; expect physics.syncPositions NOT called
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(physics.syncPositions).not.toHaveBeenCalled();
  });
});
```

If `GraphCanvas` does not already accept an `onTick2DCapture`-style prop for tests, gate it via an existing test-only prop or expose via a small `data-testid` attribute on the canvas + a memoized `lastXyzRef` — match whatever pattern `GraphCanvas.test.ts` already uses.

- [ ] **Step 7.2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/previewIntegration.test.tsx`
Expected: FAIL — `physics.syncPositions` never called / no interpolation observed.

- [ ] **Step 7.3: Implement the wiring**

Apply the "Wiring sketch" above in `GraphCanvas.tsx`. Add the import for `createPreviewLayer` and `useSliders`. Guard 3D: only pass `getPositionsOverride` when `props.mode === "2d"`.

- [ ] **Step 7.4: Run integration test + full suite for the access-analysis directory**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis`
Expected: PASS — all tests in the directory green.

- [ ] **Step 7.5: Commit**

```powershell
git add app/"(dashboard)"/users/access-analysis/GraphCanvas.tsx app/"(dashboard)"/users/access-analysis/__tests__/previewIntegration.test.tsx
git commit -m "feat(acc-graph): GraphCanvas wires 2D preview override + handoff (B.2 P4)"
```

---

### Task 8: Runtime verification probe

**Files:**
- Create (temporary): `e2e/access-graph/b2-preview-throughput.spec.ts`

The probe must measure **frames with changed coordinates**, not raw upload count, to avoid the B.1 trap where the canvas redraws the same xyz.

- [ ] **Step 8.1: Write the probe**

```ts
// e2e/access-graph/b2-preview-throughput.spec.ts
import { test, expect } from "@playwright/test";

test("B.2 2D preview ≥55 fresh frames/sec during slider drag", async ({ page }) => {
  await page.goto("/users/access-analysis?testMode=1");
  await page.waitForSelector('[data-testid="acc-graph-canvas"]');
  await page.evaluate(() => (window as any).__lecg_resetGraphTelemetry?.());

  // Start a probe that diffs xyz on every onTick2D call (installed by GraphCanvas in test mode).
  await page.evaluate(() => (window as any).__lecg_startFreshFrameProbe?.());

  // Programmatically drive the d1 slider over 1.2s.
  await page.evaluate(async () => {
    const ctx = (window as any).__lecg_sliderCtx;
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      const v = Math.round(((performance.now() - t0) / 1200) * 100);
      ctx.setSliderValue("activity", v);
      await new Promise(r => requestAnimationFrame(r));
    }
  });

  const stats = await page.evaluate(() => (window as any).__lecg_stopFreshFrameProbe?.());
  // stats: { freshFrames: number, durationMs: number, errors: string[] }
  const fps = (stats.freshFrames * 1000) / stats.durationMs;
  console.log("B.2 fresh-frame FPS:", fps, "errors:", stats.errors);
  expect(fps).toBeGreaterThanOrEqual(55);
  expect(stats.errors).toEqual([]);
});
```

Hooks `__lecg_startFreshFrameProbe` / `__lecg_stopFreshFrameProbe` / `__lecg_sliderCtx` are installed only when `?testMode=1`. They live behind the existing `NEXT_PUBLIC_ACC_GRAPH_TEST` flag and tear down on probe stop — no production residue.

- [ ] **Step 8.2: Run the probe locally**

Run:

```powershell
$env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"
npm run test:e2e -- e2e/access-graph/b2-preview-throughput.spec.ts
```

Expected: PASS with logged `fresh-frame FPS ≥ 55`, `errors: []`.

If the run fails on the 55 Hz threshold, capture the FPS number and the d3 tick rate (probe reports both) and stop — do not paper over with a lower threshold. The whole point of B.2 is that 2D no longer reads as tick-bound; if the override path is allocating per-frame or the lerp coefficient is wrong, fix it.

- [ ] **Step 8.3: Compare against B.1 baseline**

Run the same probe with `enablePreviewInterpolation = false` (one-line edit in GraphCanvas.tsx — revert after measurement). Expected: fresh-frame FPS drops back to ~20–23 (tick-bound), confirming the override is the lever, not unrelated infra changes.

Revert the toggle. Do not commit the toggled-off variant.

- [ ] **Step 8.4: Automated interaction-semantics probe (no manual gate)**

Extend the same `b2-preview-throughput.spec.ts` (working-tree-only — see Step 8.5) with assertions executed by Playwright, not by a human. The probe MUST verify, programmatically:

1. **No-snap handoff.** Sample `physics.getPositions()` and `previewLayer.snapshot()` at the moment of preview exit (the test installs a one-shot listener via `subscribePreviewActive`). Assert per-coordinate diff `< 0.5` for all 16,942 nodes. Captures any snap regression.
2. **NaN guard.** After the slider drag and after preview exit, assert no `Number.isNaN` in either buffer.
3. **Node count invariant.** Assert `physics.getPositions().length === 16942 * 3` before and after the drag.
4. **Lasso parity during preview.** Programmatically drive a lasso over a known screen region while preview is active; capture the selection ID set; compare against the set computed by hit-testing the visible (preview) buffer. They MUST match — lasso reads from the visible truth, not stale d3.
5. **Mask bus untouched.** Snapshot `physics.maskVersion` before and after the drag; assert unchanged when no filter was applied.
6. **3D B.1 parity.** Run the same drag in `mode=3d`; assert `physics.syncPositions` never called; assert no preview-buffer overrides observed.
7. **No console errors.** Listen for `console.error` / `pageerror`; assert empty, with explicit substring checks for `Duplicate key`, `primary key`, `constraint`, `NaN`.

All seven assertions run automatically inside the same `npm run test:e2e` invocation. No `expect(prompt)` style human gate.

- [ ] **Step 8.5: Probe stays working-tree-only by default — DO NOT COMMIT**

The probe spec and any `__lecg_*` test-mode globals exist only in the working tree during Task 8. They are NOT committed in this task. Verify the index is clean before exiting Task 8:

```powershell
git diff --cached --name-only  # MUST be empty
git status --short              # probe file appears as untracked / unstaged only
```

Record the probe FPS, fresh-frame count, and all seven assertion results in the Task 8 report to the controller. Do not stage `e2e/access-graph/b2-preview-throughput.spec.ts` or any related test-mode hook unless Luis explicitly approves committing it.

---

### Task 9: Cleanup + rollback switch + final gates

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` (lift the flag to a constant)
- Modify: `docs/superpowers/codebase-map/index.md` (one-line update)
- **DO NOT** modify `.gsd/TECHNICAL_DEBT.md`. The B.2 working branch may have that file deleted (per repo status); Task 9 MUST NOT recreate it. Record any deferred follow-ups in the Task 9 final report to the controller. Touching `.gsd/TECHNICAL_DEBT.md` requires explicit Luis approval AND a prior check that the file already exists in the working tree.

- [ ] **Step 9.1: Lift the feature flag to a named constant**

At the top of `GraphCanvas.tsx`:

```ts
/**
 * B.2 — 2D real-time preview interpolation. Rolling this to `false` disables
 * the per-frame lerp override and reverts to B.1 tick-bound behavior. The
 * preview layer is then never constructed and the override is never installed,
 * so 2D + 3D both behave exactly as they did before B.2.
 */
const ENABLE_PREVIEW_INTERPOLATION = true;
```

Replace inline references to `enablePreviewInterpolation` with `ENABLE_PREVIEW_INTERPOLATION`.

- [ ] **Step 9.2: Update the codebase map**

Add a single line to `docs/superpowers/codebase-map/index.md` under the access-analysis section: `previewLayer.ts — pure target-field + lerp module driving 2D preview override (B.2)`.

- [ ] **Step 9.3: Record deferred follow-ups (in the final report only)**

If anything was deferred (e.g. preview during 3D in a future B.3, worker-precomputed targets, committing the probe), list it in the Task 9 final report under a `## B.2 follow-ups` heading. Do NOT write to `.gsd/TECHNICAL_DEBT.md`. Do NOT invent debt items; if nothing was deferred, the section is omitted from the report.

- [ ] **Step 9.4: Run final gates**

```powershell
npm run lint
npx tsc --noEmit
npx vitest run
npm run test:e2e
```

Expected: lint clean, tsc 0 errors, vitest fully green, e2e green (or only the known lasso load-flake on `lasso-drag` — same exclusion as `project_lasso_e2e_load_flake`). Document any e2e flake as a comment on the verification commit, not as a green herring.

- [ ] **Step 9.5: Commit final docs + flag rename (explicit paths only)**

```powershell
git diff --cached --name-only  # MUST be empty before staging
git add app/"(dashboard)"/users/access-analysis/GraphCanvas.tsx docs/superpowers/codebase-map/index.md
git diff --cached --name-only  # MUST list exactly those two paths, no more
git commit -m "chore(acc-graph): B.2 rollback flag + map update"
```

NEVER `git add -A` or `git add .` on this branch — pre-existing WIP traps documented in `project_user_project_instances` / `feedback_surgical_staging` / `feedback_staging_index_hazard` apply.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Preview collapse without repulsion.** The pure target field has no `forceManyBody`, so nodes with identical targets sit on top of each other during preview. | This is acceptable visually because (a) per-node dimWeights vary the target, (b) the lerp is *toward* the target field, not *onto* it, and (c) on preview exit d3 immediately re-attaches repulsion (`setActiveInput(false)` already re-attaches `forceManyBody`) and the layout separates within a few hundred ms. Task 8.4 verifies no perceptible collapse. |
| **Handoff snap on preview exit.** d3's internal node positions diverged from the displayed buffer during preview; without `syncPositions` the next tick would render from d3's coordinates, snapping. | `syncPositions(snapshot())` writes the displayed buffer back into d3 *before* the next tick. `positionsVersion` bumps so downstream consumers see the new coordinates. Test in Task 4 + Task 7 covers it. |
| **Lasso during moving preview.** Lasso reads `physics.getPositions()` today — that would read d3's coordinates, not what the user sees. | Add a single read pathway: when `slider.isPreviewActive()` is true and `previewRef.current` exists, lasso reads from `previewRef.current.snapshot()`. This is a one-line change in the lasso handler; flagged here so the executing engineer adds it inside Task 7 wiring rather than missing it. Test 8.4 confirms. |
| **Per-frame allocations.** Lerp tempts the engineer to `new Float32Array(...)` each tick — fatal for 16k nodes at 60 Hz. | `previewLayer.ts` allocates `displayed`, `tx`, `ty`, `tz`, `wSum` once at construction. Task 2.1 has an explicit "no realloc" test. |
| **Mismatch between d3 state and displayed state.** If d3 ticks once during preview and we *don't* read its output, that's fine — we don't. But if a *non-preview* code path (e.g. a one-shot fit-to-frame on settle) reads `physics.getPositions()` mid-preview, it gets stale d3 coordinates. | Document at the top of `GraphCanvas.tsx`: "While `previewActiveRef.current` is true, the truth-of-display is `previewRef.current.snapshot()`. Any code path that needs the *visible* xyz must respect that ref." No other code paths touch positions mid-preview today; future ones must follow this contract. |

---

## Rollback path

**One-switch disable.** Set `ENABLE_PREVIEW_INTERPOLATION = false` in `GraphCanvas.tsx` and rebuild. Effect: preview layer is never constructed, override is never installed, `useGraphRafLoop` runs exactly the B.1 code path. Zero runtime difference from B.1 in this mode (verified by Task 8.3).

**Full revert.** Each task is a separate commit. `git revert` the 9 commits from Task 9 back through Task 1 in reverse order — or `git revert <task9-commit>..<task1-commit>` with the appropriate range. The preview layer is purely additive: nothing in physicsLayer's tick path, no mask bus changes, no 3D changes. Revert is safe with no migration considerations.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-b2-2d-realtime-preview-interpolation.md`.

**Do not implement until Luis approves.**

When approved, two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review checkpoint between tasks. Best fit because each task has tight scope, clear TDD steps, and a single commit; subagents won't drift.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints at Task 4 (physics API surface done), Task 7 (wiring done), Task 8 (probe results).

Which approach?
