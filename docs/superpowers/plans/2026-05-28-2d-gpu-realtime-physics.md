# 2D GPU Real-Time Physics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 2D access-analysis graph animate in real time from the sliders using cosmos.gl's GPU force simulation, fully independent of the 3D `d3-force-3d` engine.

**Architecture:** A new pure module `gpuLayout2D.ts` maps slider state → per-node 2D target anchors + GPU force coefficients. `GraphCanvas2D.tsx` runs cosmos.gl with `enableSimulation: true` and uses its **cluster force as a per-node anchor** (one cluster per node, `setClusterPositions` = the slider-weighted dimension targets). `GraphCanvas.tsx` routes slider changes to the 2D renderer. The whole 2D-GPU path sits behind a `gpuSimulation` prop fed by an `ENABLE_GPU_2D_SIM` env-driven const; `physicsLayer.ts` and the entire 3D path are untouched.

**Tech Stack:** TypeScript, React 19, vitest 4 (+ jsdom, @testing-library/react), `@cosmos.gl/graph` 3.0.0-beta.9.

**Spec:** `docs/superpowers/specs/2026-05-28-2d-gpu-realtime-physics-design.md`

---

## File Structure

- **Create** `app/(dashboard)/users/access-analysis/gpuLayout2D.ts` — pure, zero-import module: `computeAnchors`, `mapForceConfig`, `clusterStrengthFromWeights`, `identityClusters`. One responsibility: turn sliders into GPU-sim inputs.
- **Create** `app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts` — unit tests (style mirrors `previewLayer.test.ts`).
- **Create** `app/(dashboard)/users/access-analysis/gpuLayout2D.purity.test.ts` — purity guard (style mirrors `mathLayer.purity.test.ts`).
- **Modify** `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — add `gpuSimulation` prop; GPU-mode cosmos construction + cluster wiring + `applySliders` handle method.
- **Modify** `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — `ENABLE_GPU_2D_SIM` const + `gpuSimulation` prop; route `sliders.values` → `handle2D.applySliders`; skip preview/override wiring in GPU mode.
- **Modify** `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` — extend cosmos mock (cluster + sim methods); add GPU-mode tests; update Test 6 import whitelist to allow `gpuLayout2D`.
- **Modify** `app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx` — pass `gpuSimulation={false}` so it keeps exercising the B.2 fallback path.
- **Modify** `.env` (final task) — document/enable `NEXT_PUBLIC_ACC_GPU_2D`.

**Conventions (verified):**
- Run all unit tests: `npm test`
- Run one file: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"`
- Commit by **explicit path only** (this branch carries large pre-existing WIP). Before every commit run `git diff --cached --name-only` and confirm only the intended files are staged.

---

### Task 1: `gpuLayout2D.computeAnchors` — per-node 2D target anchors

**Files:**
- Create: `app/(dashboard)/users/access-analysis/gpuLayout2D.ts`
- Test: `app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts`

- [ ] **Step 1: Write the failing test**

Create `gpuLayout2D.test.ts`:

```ts
// gpuLayout2D.test.ts
import { describe, it, expect } from "vitest";
import { computeAnchors } from "./gpuLayout2D";

// Two dims whose single-dim targets sit on orthogonal axes (matches mathLayer:
// target[dim] already encodes R*u_d*f_d, so blending = weighted average).
const targets = {
  d1: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
  d2: { x: new Float32Array([0, 0]), y: new Float32Array([100, 100]), z: new Float32Array([0, 0]) },
};
const dimWeights = { d1: new Float32Array([1, 1]), d2: new Float32Array([1, 1]) };

describe("computeAnchors", () => {
  it("returns an n*2 buffer of zeros when all sliders are zero (origin collapse)", () => {
    const a = computeAnchors({ d1: 0, d2: 0 }, targets, dimWeights, 2);
    expect(a).toBeInstanceOf(Float32Array);
    expect(a.length).toBe(4);
    expect(Array.from(a)).toEqual([0, 0, 0, 0]);
  });

  it("places anchors at the d1 target when only d1 is active", () => {
    const a = computeAnchors({ d1: 1, d2: 0 }, targets, dimWeights, 2);
    // node 0 → (100, 0); node 1 → (100, 0)
    expect(a[0]).toBeCloseTo(100, 5);
    expect(a[1]).toBeCloseTo(0, 5);
    expect(a[2]).toBeCloseTo(100, 5);
    expect(a[3]).toBeCloseTo(0, 5);
  });

  it("blends targets proportionally (equal sliders → midpoint)", () => {
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, dimWeights, 2);
    expect(a[0]).toBeCloseTo(50, 5);
    expect(a[1]).toBeCloseTo(50, 5);
  });

  it("gates a node to the origin when its dimWeight is zero on every active dim", () => {
    const zeroW = { d1: new Float32Array([0, 1]), d2: new Float32Array([0, 1]) };
    const a = computeAnchors({ d1: 1, d2: 1 }, targets, zeroW, 2);
    // node 0 has zero weight everywhere → stays at origin
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(0);
    // node 1 blends normally
    expect(a[2]).toBeCloseTo(50, 5);
    expect(a[3]).toBeCloseTo(50, 5);
  });

  it("throws on a node-count mismatch (dev guard)", () => {
    expect(() => computeAnchors({ d1: 1 }, targets, dimWeights, 3)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"`
Expected: FAIL — `Failed to resolve import "./gpuLayout2D"` / `computeAnchors is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `gpuLayout2D.ts`:

```ts
// gpuLayout2D.ts — Pure slider→GPU-layout mapping for the cosmos.gl 2D simulation.
//
// PURITY: zero imports. Defines its own input types so the module is fully
// standalone (no coupling to physicsLayer). Deterministic — no random, no clock.

/** Per-dimension target arrays (structurally compatible with physicsLayer.TargetArrays). */
export type Target2DArrays = Record<
  string,
  { x: Float32Array; y: Float32Array; z?: Float32Array }
>;

/**
 * Per-node 2D anchor = Σ_d (sliderᵈ · weightᵈᵢ · targetᵈᵢ) / Σ_d (sliderᵈ · weightᵢᵈ).
 * Mirrors previewLayer's blend (and mathLayer's formula) but emits stride-2.
 * Zero state (no active slider, or a node with zero weight everywhere) → origin (0,0).
 */
export function computeAnchors(
  sliders: Record<string, number>,
  targets: Target2DArrays,
  dimWeights: Record<string, Float32Array>,
  nodeCount: number,
): Float32Array {
  const dimIds = Object.keys(targets);
  for (const id of dimIds) {
    if (targets[id].x.length !== nodeCount) {
      throw new Error(
        `computeAnchors: target '${id}' length ${targets[id].x.length} != nodeCount ${nodeCount}`,
      );
    }
  }
  const out = new Float32Array(nodeCount * 2); // zero-initialized → origin fallback
  const ax = new Float32Array(nodeCount);
  const ay = new Float32Array(nodeCount);
  const wSum = new Float32Array(nodeCount);

  for (const id of dimIds) {
    const sv = sliders[id] ?? 0;
    if (sv <= 0) continue;
    const t = targets[id];
    const w = dimWeights[id];
    for (let i = 0; i < nodeCount; i++) {
      const wi = sv * (w ? w[i] : 1);
      if (wi === 0) continue;
      ax[i] += wi * t.x[i];
      ay[i] += wi * t.y[i];
      wSum[i] += wi;
    }
  }
  for (let i = 0; i < nodeCount; i++) {
    const s = wSum[i];
    if (s === 0) continue; // leave origin
    out[i * 2] = ax[i] / s;
    out[i * 2 + 1] = ay[i] / s;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/gpuLayout2D.ts" "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"
git diff --cached --name-only   # confirm ONLY these two files
git commit -m "feat(acc-graph): gpuLayout2D.computeAnchors — per-node 2D target anchors"
```

---

### Task 2: `gpuLayout2D.mapForceConfig` — slider intensity → GPU force coefficients

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/gpuLayout2D.ts`
- Test: `app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `gpuLayout2D.test.ts`:

```ts
import { mapForceConfig } from "./gpuLayout2D";

describe("mapForceConfig", () => {
  it("returns all five cosmos simulation coefficients", () => {
    const c = mapForceConfig({ d1: 0.5 });
    expect(c).toHaveProperty("simulationRepulsion");
    expect(c).toHaveProperty("simulationCluster");
    expect(c).toHaveProperty("simulationGravity");
    expect(c).toHaveProperty("simulationDecay");
    expect(c).toHaveProperty("simulationFriction");
  });

  it("increases repulsion and cluster pull as the max slider rises", () => {
    const off = mapForceConfig({ d1: 0, d2: 0 });
    const on = mapForceConfig({ d1: 1, d2: 0 });
    expect(on.simulationRepulsion).toBeGreaterThan(off.simulationRepulsion);
    expect(on.simulationCluster).toBeGreaterThan(off.simulationCluster);
  });

  it("uses max() across sliders (a single engaged slider drives intensity)", () => {
    const a = mapForceConfig({ d1: 1, d2: 0 });
    const b = mapForceConfig({ d1: 1, d2: 1 });
    expect(a.simulationRepulsion).toBeCloseTo(b.simulationRepulsion, 5);
  });

  it("contributes zero cluster pull when all sliders are zero", () => {
    expect(mapForceConfig({ d1: 0 }).simulationCluster).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts" -t mapForceConfig`
Expected: FAIL — `mapForceConfig is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `gpuLayout2D.ts`:

```ts
export interface GpuForceConfig {
  simulationRepulsion: number;
  simulationCluster: number;
  simulationGravity: number;
  simulationDecay: number;
  simulationFriction: number;
}

/** Linear interpolation clamped to [0,1] on t. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Slider intensity (max over all sliders, 0..1) → cosmos GPU force coefficients.
 * Analogue of physicsLayer.applySliderForces. Tunable constants below; the unit
 * tests assert monotonicity / zero-state, not exact values, so tuning is safe.
 */
export function mapForceConfig(sliders: Record<string, number>): GpuForceConfig {
  const max = Math.max(0, ...Object.values(sliders));
  return {
    // tight blob at rest → spread for cluster legibility when engaged
    simulationRepulsion: lerp(0.3, 1.5, max),
    // no targets at rest → strong per-node anchor pull when engaged
    simulationCluster: lerp(0, 0.4, max),
    // gentle constant cohesion toward center
    simulationGravity: 0.1,
    // cool fast when idle; slower (more visible motion) while separating
    simulationDecay: lerp(1000, 5000, max),
    // cosmos default friction
    simulationFriction: 0.85,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/gpuLayout2D.ts" "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-graph): gpuLayout2D.mapForceConfig — slider→GPU force coefficients"
```

---

### Task 3: `gpuLayout2D.clusterStrengthFromWeights` + `identityClusters`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/gpuLayout2D.ts`
- Test: `app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `gpuLayout2D.test.ts`:

```ts
import { clusterStrengthFromWeights, identityClusters } from "./gpuLayout2D";

describe("clusterStrengthFromWeights", () => {
  const targets3 = {
    d1: { x: new Float32Array([0, 0, 0]), y: new Float32Array([0, 0, 0]), z: new Float32Array([0, 0, 0]) },
  };
  it("returns per-node strength in [0,1], one entry per node", () => {
    const w = { d1: new Float32Array([1, 0.5, 0]) };
    const s = clusterStrengthFromWeights(w, { d1: 1 }, 3);
    expect(s).toBeInstanceOf(Float32Array);
    expect(s.length).toBe(3);
    expect(s[0]).toBeCloseTo(1, 5);
    expect(s[1]).toBeCloseTo(0.5, 5);
    expect(s[2]).toBe(0); // availability-gated → no pull
    void targets3;
  });
  it("yields zero strength for every node when no slider is active", () => {
    const w = { d1: new Float32Array([1, 1, 1]) };
    const s = clusterStrengthFromWeights(w, { d1: 0 }, 3);
    expect(Array.from(s)).toEqual([0, 0, 0]);
  });
});

describe("identityClusters", () => {
  it("assigns each node to its own cluster index", () => {
    expect(identityClusters(3)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts" -t cluster`
Expected: FAIL — `clusterStrengthFromWeights is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `gpuLayout2D.ts`:

```ts
/**
 * Per-node cluster-pull strength = max active-dim weight for that node, in [0,1].
 * A node availability-gated to weight 0 on all active dims gets strength 0, so the
 * GPU cluster force never drags it toward a pole it has no value for. Zero active
 * sliders → all-zero (no pull). Uses max (not product) so a node engaged on any
 * active dim is pulled at that dim's confidence.
 */
export function clusterStrengthFromWeights(
  dimWeights: Record<string, Float32Array>,
  sliders: Record<string, number>,
  nodeCount: number,
): Float32Array {
  const out = new Float32Array(nodeCount);
  for (const [id, sv] of Object.entries(sliders)) {
    if (sv <= 0) continue;
    const w = dimWeights[id];
    for (let i = 0; i < nodeCount; i++) {
      const wi = w ? w[i] : 1;
      if (wi > out[i]) out[i] = wi;
    }
  }
  return out;
}

/** Cluster assignment that puts every point in its own cluster: [0,1,…,n-1]. */
export function identityClusters(nodeCount: number): number[] {
  const out = new Array<number>(nodeCount);
  for (let i = 0; i < nodeCount; i++) out[i] = i;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/gpuLayout2D.ts" "app/(dashboard)/users/access-analysis/gpuLayout2D.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-graph): gpuLayout2D cluster strength + identity assignment"
```

---

### Task 4: Purity guard for `gpuLayout2D.ts`

**Files:**
- Create: `app/(dashboard)/users/access-analysis/gpuLayout2D.purity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `gpuLayout2D.purity.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("gpuLayout2D purity", () => {
  it("has zero import statements (fully standalone)", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8");
    const specifiers = [
      ...src.matchAll(/import\s+(?:[^"';]+from\s+)?["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(specifiers).toEqual([]);
  });

  it("references no React, DOM, engine, or renderer modules", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8").toLowerCase();
    for (const term of ["react", "next/", "three", "d3-force", "cosmos", "duckdb", "apache-arrow", "physicslayer"]) {
      expect(src).not.toContain(term);
    }
  });

  it("is deterministic — no Math.random or clock access", () => {
    const src = readFileSync(resolve(__dirname, "./gpuLayout2D.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random\b/);
    expect(src).not.toMatch(/Date\.now\b/);
    expect(src).not.toMatch(/new Date\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or passes immediately)**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/gpuLayout2D.purity.test.ts"`
Expected: PASS (the module from Tasks 1–3 already has zero imports). If it FAILS, remove any import you added to `gpuLayout2D.ts` — the module must define its own types.

- [ ] **Step 3: (No implementation needed — guard only)**

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/gpuLayout2D.purity.test.ts"
git diff --cached --name-only
git commit -m "test(acc-graph): purity guard for gpuLayout2D"
```

---

### Task 5: `GraphCanvas2D` GPU simulation mode + `applySliders` handle

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts`

This task adds a `gpuSimulation` prop (default **false**, so all existing tests keep exercising the frozen path) and a GPU construction branch that wires cosmos's cluster force. A new `applySliders` handle method recomputes anchors/forces and reheats.

- [ ] **Step 1: Extend the cosmos mock + write the failing GPU tests**

In `GraphCanvas.test.ts`, extend the `MockGraph` (inside `vi.mock("@cosmos.gl/graph", …)`) to capture the cluster + simulation methods. Add these lines inside the `MockGraph` constructor, after the existing `(g as any).render = vi.fn();` line:

```ts
      (g as any).setPointClusters = vi.fn((c: (number | undefined)[]) => { _clusterCalls.push(c.slice()); });
      (g as any).setClusterPositions = vi.fn((p: (number | undefined)[]) => { _clusterPosCalls.push(p.slice()); });
      (g as any).setPointClusterStrength = vi.fn((s: Float32Array) => { _clusterStrengthCalls.push(s.slice()); });
      (g as any).start = vi.fn((a?: number) => { _startCalls.push(a); });
      (g as any).pause = vi.fn(() => { _pauseCalls++; });
      (g as any).unpause = vi.fn();
      (g as any).fitView = vi.fn();
```

Add the module-level capture vars near the other `let _captured…` declarations:

```ts
let _clusterCalls: Array<(number | undefined)[]> = [];
let _clusterPosCalls: Array<(number | undefined)[]> = [];
let _clusterStrengthCalls: Array<Float32Array> = [];
let _startCalls: Array<number | undefined> = [];
let _pauseCalls = 0;
```

Reset them in the existing `beforeEach`:

```ts
  _clusterCalls = [];
  _clusterPosCalls = [];
  _clusterStrengthCalls = [];
  _startCalls = [];
  _pauseCalls = 0;
```

Extend `makeFakePhysics` so the GPU path can read targets/weights/sliders. Add these three methods to the returned `mock` object (alongside `getPositions`):

```ts
    getTargets: vi.fn(() => ({
      d1: { x: new Float32Array(n).fill(100), y: new Float32Array(n), z: new Float32Array(n) },
    })),
    getDimWeights: vi.fn(() => ({ d1: new Float32Array(n).fill(1) })),
    getSliders: vi.fn(() => ({ d1: 0 })),
```

Add a GPU-mode mount helper + tests at the end of the file:

```ts
async function setupGpuHandle(nodeCount = 3): Promise<any> {
  const { GraphCanvas2D } = await import("./GraphCanvas2D");
  const { render } = await import("@testing-library/react");
  const { createElement } = await import("react");
  let capturedHandle: any = null;
  const fakeRef = makeFakeRef();
  const physics = makeFakePhysics({ nodeCount });
  const rgba = new Float32Array(nodeCount * 4);
  render(
    createElement(GraphCanvas2D, {
      containerRef: fakeRef as any,
      physics,
      nodeColors: rgba,
      backgroundColor: "#09090B",
      gpuSimulation: true,
      onHandleReady: (h: any) => { capturedHandle = h; },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
  return capturedHandle;
}

describe("GraphCanvas2D — GPU simulation mode", () => {
  it("GPU-1: constructs cosmos with enableSimulation:true and clusters one-per-node", async () => {
    await setupGpuHandle(3);
    expect(_capturedConfig.enableSimulation).toBe(true);
    expect(_clusterCalls.at(-1)).toEqual([0, 1, 2]);
    expect(_clusterPosCalls.length).toBeGreaterThan(0);
    expect(_clusterPosCalls.at(-1)!.length).toBe(6); // stride-2 for 3 nodes
  });

  it("GPU-2: applySliders updates cluster positions + reheats via start()", async () => {
    const handle = await setupGpuHandle(3);
    _clusterPosCalls = [];
    _startCalls = [];
    handle.applySliders({ d1: 1 });
    expect(_clusterPosCalls.length).toBe(1);
    // d1 target.x=100 → node 0 anchor x ≈ 100
    expect(_clusterPosCalls[0]![0]).toBeCloseTo(100, 3);
    expect(_startCalls.length).toBe(1); // reheat
  });

  it("GPU-3: pushPositions is a no-op in GPU mode (cosmos owns positions)", async () => {
    const handle = await setupGpuHandle(3);
    _setPointPositionsCalls = [];
    handle.pushPositions(new Float32Array(9));
    expect(_setPointPositionsCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the GPU tests to verify they fail**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts" -t "GPU simulation mode"`
Expected: FAIL — `gpuSimulation` prop ignored; `enableSimulation` still `false`; `applySliders` undefined.

- [ ] **Step 3: Implement the GPU branch in `GraphCanvas2D.tsx`**

3a. Add the prop to `GraphCanvas2DProps` (after `backgroundColor`):

```ts
  /** When true, run cosmos.gl's GPU force simulation (cluster-anchor layout) instead of frozen mode. */
  gpuSimulation?: boolean;
```

3b. Add the `applySliders` method to the `GraphCanvas2DHandle` interface (after `pushPositions`):

```ts
  /**
   * GPU mode only: recompute per-node cluster anchors + force coefficients from
   * the given normalized (0..1) slider values and reheat the GPU simulation.
   * No-op in frozen mode.
   */
  applySliders(sliders: Record<string, number>): void;
```

3c. Add the import (top of file, after the cosmos import):

```ts
import { computeAnchors, mapForceConfig, clusterStrengthFromWeights, identityClusters } from "./gpuLayout2D";
```

3d. In the mount IIFE, replace the single `g = new Graph(div, { … } as any);` config object so `enableSimulation` and transition reflect the mode. Change the line `enableSimulation: false,` to:

```ts
        enableSimulation: props.gpuSimulation === true,
```

and change `transitionDuration: 0,` to:

```ts
        transitionDuration: 0,
        ...(props.gpuSimulation ? mapForceConfig(props.physics.getSliders()) : {}),
```

3e. After the initial `g.setPointPositions(xy2, false);` … `g.render();` block (just before `props.onHandleReady({`), add GPU init:

```ts
      if (props.gpuSimulation) {
        const n2 = xyz0.length / 3;
        const targets = props.physics.getTargets();
        const dimW = props.physics.getDimWeights();
        const sliders0 = props.physics.getSliders();
        const anchors0 = computeAnchors(sliders0, targets, dimW, n2);
        g.setPointClusters(identityClusters(n2));
        g.setClusterPositions(Array.from(anchors0));
        g.setPointClusterStrength(clusterStrengthFromWeights(dimW, sliders0, n2));
        g.setPointPositions(anchors0, false); // seed near targets, not random
        g.start(0.5);
        g.render();
      }
```

3f. Make `pushPositions` a no-op in GPU mode — add as the FIRST line inside `pushPositions(xyz)`:

```ts
          if (props.gpuSimulation) return; // GPU mode: cosmos owns positions
```

3g. Add the `applySliders` method to the returned handle object (right after `pushPositions(…) { … },`):

```ts
        applySliders(sliders: Record<string, number>): void {
          if (!props.gpuSimulation) return;
          const n2 = xy2.length / 2;
          const targets = props.physics.getTargets();
          const dimW = props.physics.getDimWeights();
          const anchors = computeAnchors(sliders, targets, dimW, n2);
          const cfg = mapForceConfig(sliders);
          g!.setClusterPositions(Array.from(anchors));
          g!.setPointClusterStrength(clusterStrengthFromWeights(dimW, sliders, n2));
          g!.setConfigPartial(cfg as unknown as Record<string, unknown>);
          g!.start(0.5);
          g!.render();
        },
```

- [ ] **Step 4: Run the GPU tests + the full 2D suite to verify**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"`
Expected: PASS — new GPU-1/2/3 tests pass AND all existing frozen-path tests (Test 1, 2, 9–12, etc.) still pass (they mount without `gpuSimulation`, default false).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-graph): GraphCanvas2D GPU cluster-anchor simulation mode + applySliders"
```

---

### Task 6: Wire `GraphCanvas` to drive the 2D GPU sim from sliders

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` (Test 6 whitelist)
- Modify: `app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx`

- [ ] **Step 1: Update the import-whitelist test (Test 6) to allow `gpuLayout2D`**

In `GraphCanvas.test.ts`, find the Test 6 regex for `GraphCanvas.tsx` allowed imports and add `gpuLayout2D`:

```ts
      expect(line, "GraphCanvas.tsx has unexpected import: " + line).toMatch(
        /react|next-themes|physicsLayer|GraphCanvas2D|GraphCanvas3D|useGraphRafLoop|SliderContext|previewLayer|gpuLayout2D/i
      );
```

- [ ] **Step 2: Run Test 6 to verify it still passes (no GraphCanvas import yet)**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts" -t "REND-04"`
Expected: PASS (regex widened; GraphCanvas.tsx not yet importing gpuLayout2D — still fine).

- [ ] **Step 3: Implement the GraphCanvas wiring**

3a. Add the env-driven const after the existing `ENABLE_PREVIEW_INTERPOLATION` const:

```ts
/**
 * Master switch for the 2D GPU cluster-anchor simulation (this milestone).
 * ON by default; set NEXT_PUBLIC_ACC_GPU_2D="0" to revert 2D to the frozen +
 * B.2-preview path. Rollback is this single env flip — no other change needed.
 */
const ENABLE_GPU_2D_SIM = process.env.NEXT_PUBLIC_ACC_GPU_2D !== "0";
```

3b. Pass the flag to `GraphCanvas2D` — add `gpuSimulation={ENABLE_GPU_2D_SIM}` to the `<GraphCanvas2D … />` props block.

3c. Gate the B.2 preview wiring so it does NOT run in GPU mode. Change the three preview `useEffect`/`useCallback` guards from `if (!ENABLE_PREVIEW_INTERPOLATION)` to also bail in GPU mode. Specifically, at the top of the preview-construction effect (line ~139), the subscribe effect (~161), and `getPositionsOverride` (~188), change the early-return condition to:

```ts
    if (!ENABLE_PREVIEW_INTERPOLATION || ENABLE_GPU_2D_SIM) { previewRef.current = null; return; }
```
(for the construction effect) and for the subscribe effect + `getPositionsOverride`:
```ts
    if (!ENABLE_PREVIEW_INTERPOLATION || ENABLE_GPU_2D_SIM) return null; // getPositionsOverride
```
```ts
    if (!ENABLE_PREVIEW_INTERPOLATION || ENABLE_GPU_2D_SIM) return;       // subscribe effect
```

3d. Add a slider→GPU routing effect. After the `useGraphRafLoop({…})` call, add:

```ts
  // GPU 2D: push slider changes straight to the cosmos GPU simulation.
  const sliderValues = sliders.values;
  useEffect(() => {
    if (!ENABLE_GPU_2D_SIM || props.mode !== "2d") return;
    const h = handle2D.current;
    if (!h) return;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(sliderValues)) normalized[k] = (v as number) / 100;
    h.applySliders(normalized);
  }, [sliderValues, props.mode]);
```

- [ ] **Step 4: Keep `previewIntegration.test.tsx` on the fallback path**

That test asserts B.2 preview behavior, which is disabled in GPU mode. Find where it renders `GraphCanvas` and add `gpuSimulation={false}` to the props (and, if the test reads `ENABLE_GPU_2D_SIM` indirectly, set `vi.stubEnv("NEXT_PUBLIC_ACC_GPU_2D", "0")` + `vi.resetModules()` in its `beforeEach`). If `GraphCanvas` does not yet accept a `gpuSimulation` prop, add an optional prop to `GraphCanvasProps`:

```ts
  /** Test/override: force 2D GPU sim on/off. Defaults to ENABLE_GPU_2D_SIM. */
  gpuSimulation?: boolean;
```
and use `const gpu2d = props.gpuSimulation ?? ENABLE_GPU_2D_SIM;` in place of `ENABLE_GPU_2D_SIM` in steps 3b–3d. This makes the behavior deterministically testable.

- [ ] **Step 5: Run the full access-analysis suite**

Run: `npm test`
Expected: PASS across the suite (unit count should be the prior green baseline + the new gpuLayout2D + GPU-mode tests). `previewIntegration` passes via the forced-off path.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts" "app/(dashboard)/users/access-analysis/__tests__/previewIntegration.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): route sliders to 2D GPU sim; gate B.2 preview off in GPU mode"
```

---

### Task 7: Type-check, enable for UAT, and verify live

**Files:**
- Modify: `.env`

- [ ] **Step 1: Type-check + lint the touched files**

Run: `npx tsc --noEmit`
Expected: 0 errors. Fix any type issues in `GraphCanvas2D.tsx` / `GraphCanvas.tsx` (cosmos methods are accessed on the typed `Graph`; if a method is missing from the beta's `.d.ts`, use the existing `(g as unknown as { … })` cast idiom already used in this file for `setLinks`/`fitView`).

Run: `npx eslint "app/(dashboard)/users/access-analysis/gpuLayout2D.ts" "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.tsx"`
Expected: clean.

- [ ] **Step 2: Confirm the flag default + add an explicit `.env` entry for clarity**

Add to `.env` (so the setting is visible/overridable; `!== "0"` already defaults ON without it):

```
# Access-analysis 2D graph: GPU cluster-anchor simulation. Set to 0 to revert to frozen+preview.
NEXT_PUBLIC_ACC_GPU_2D=1
```

- [ ] **Step 3: Build and run the app, verify live (manual)**

Run: `npm run build` then start per the project's run skill (Task Scheduler / `start-local.ps1` rebuild ships the current checkout).

Manual checks on `/users/access-analysis` in **2D mode**:
1. Move a single slider → 2D nodes animate immediately and flow to the new layout (no wait for a 3D settle).
2. Drag several sliders in sequence → motion stays live and smooth at ~17k nodes; **0 console errors**.
3. Let go → nodes settle to a stable layout; lasso + node selection still work on the settled positions.
4. Independence check: while the 3D view is mid-settle or has been toggled, confirm 2D still responds to sliders on its own.

- [ ] **Step 4: e2e regression (run on an idle machine)**

Run: `npm run test:e2e`
Expected: 2D lasso/selection specs green. NOTE (from project memory): the lasso-drag e2e can time out under machine load on this PC — that is a known load flake, not a regression; re-run on an idle machine if it trips.

- [ ] **Step 5: Commit**

```bash
git add .env
git diff --cached --name-only
git commit -m "chore(acc-graph): enable NEXT_PUBLIC_ACC_GPU_2D for UAT"
```

---

## Self-Review

**Spec coverage:**
- §3 cluster-anchor GPU mapping → Tasks 1,3,5 (computeAnchors, identityClusters/clusterStrength, cosmos wiring). ✓
- §4.1 pure module API (`computeAnchors`, `mapForceConfig`, `clusterStrengthFromWeights`) → Tasks 1–3. ✓
- §4.2 GraphCanvas2D GPU config + `applySliders` + pushPositions no-op → Task 5. ✓
- §4.3 slider→2D wiring + preview gated off → Task 6. ✓
- §4.4 force-config mapping → Task 2. ✓
- §5 physicsLayer/3D untouched → no task edits them (verify in `git diff --cached --name-only` each commit). ✓
- §6 edge cases (zero-state origin, count mismatch throw, cosmos-ready gate, mode switch) → Task 1 tests + Task 5 wiring (init gated behind existing `graph.ready` await). ✓
- §7 testing (unit + purity + e2e determinism via pause-at-rest) → Tasks 1–4, 7. ✓
- §9 rollback via env flip → Task 6 const + Task 7 `.env`. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact run commands. Force constants in Task 2 are concrete (tunable, with tests asserting only monotonicity). ✓

**Type consistency:** `computeAnchors(sliders, targets, dimWeights, nodeCount)`, `mapForceConfig(sliders)`, `clusterStrengthFromWeights(dimWeights, sliders, nodeCount)`, `identityClusters(nodeCount)`, handle method `applySliders(sliders)`, prop `gpuSimulation` — names used identically across Tasks 1–7. ✓

**Note for executor:** confirm the live exported `getSliders()`/`getTargets()`/`getDimWeights()` names on `PhysicsLayer` (verified present in `physicsLayer.ts`) before Task 5; the fake physics mock must expose them (added in Task 5 Step 1).
