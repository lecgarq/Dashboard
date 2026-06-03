# P0 — Graph Physics Responsiveness + Camera Stability + Highlight Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Graph internals are touched** (`physicsLayer.ts`, `GraphCanvas2D/3D.tsx`) — every such task MUST run the
> `access-analysis-graph-development` workflow §4 layout-math validation and keep the purity/clustering tests
> green. Staging is surgical, explicit-path only (`surgical-staging-workflow`).
>
> **⛔ PLAN-GATED: do not implement until the user approves this plan.**

**Goal:** Make slider moves visibly animate nodes, stop selection from moving the camera, and make
selected/related nodes obviously stand out — without replacing the renderer stack or breaking the two-bus
model.

**Architecture:** Three independent, surgical fixes on the existing stack: (A) fix the physics reheat
change-detection in `physicsLayer.updateSliders`; (B) stop selection-induced layout resizes from reframing
the camera; (C) make selection additive (light the same-user footprint + emphasize the focus set) instead of
purely subtractive. Diagnosis with full evidence:
[`../research/2026-05-25-graph-physics-camera-highlight-diagnosis.md`](../research/2026-05-25-graph-physics-camera-highlight-diagnosis.md).

**Tech Stack:** Next.js client components, d3-force-3d (physics), cosmos.gl (2D WebGL), three.js (3D),
Vitest + fast-check (unit), Playwright + `graphTestBridge` (e2e on :3100).

---

## Root cause (one line each)

- **A — sliders don't animate:** `updateSliders` reheats only when `max(allSliders)` changes; the multi-slider
  organic preset makes that max sticky, so non-dominant slider moves hit the `skip` path and never restart the
  sim (`physicsLayer.ts:319-342`).
- **B — selection moves camera:** selection swaps the right panel via `AnimatePresence mode="wait"`
  (`RightPanelStack.tsx:60`), collapsing the panel column → resizing the graph → 3D `ResizeObserver` calls
  `fitView()` every resize (`GraphCanvas3D.tsx:438-447`).
- **C — weak highlight:** highlight is subtractive only; isolate dims the selected node's own footprint;
  only edges brighten (`usePredicateEngine.ts:121-122`, `GraphCanvas2D.tsx:314-328`).

## Files to change

| File | Task | Why | Gate |
|------|------|-----|------|
| `physicsLayer.ts` | 1 | Reheat on per-dimension slider delta + reheat-alpha floor | ⛔ graph-physics: purity + clustering + layout-math validation |
| `physicsLayer.test.ts` | 1 | New failing test (non-dominant reheat) + keep PHYS-02/03/no-reheat green | unit |
| `RightPanelStack.tsx` | 3 | Fixed-width panel column so swaps never resize the graph | unit + e2e |
| `GraphCanvas3D.tsx` | 4 | `ResizeObserver` resizes without re-fitting (preserve camera) | ⛔ renderer: e2e 3D |
| `usePredicateEngine.ts` | 5 | Isolate lights the same-user footprint (MASK bus) | unit + e2e |
| `usePredicateEngine.test.ts` *(new or existing dir)* | 5 | Footprint-lit predicate test | unit |
| `GraphCanvas2D.tsx`, `GraphCanvas3D.tsx`, `GraphCanvas.tsx`, `GraphInteractions.tsx` | 6 *(SHOULD)* | Additive size emphasis for the focus set | ⛔ renderer: e2e |
| `tests/e2e/acc-dc-graph.spec.ts` | 7 | Regressions: animation, camera-stable-on-select, footprint-lit | e2e |

## Forbidden files (do NOT touch)

- **Routes / nav:** `page.tsx`, `AccessAnalysisShellClient.tsx`, anything under routing/nav (R1 is paused).
- **DC ingest / backfill:** `acc-dc-graph.ts` router, `acc-hot-cache.ts`, `dcUserAssembly.ts`,
  `activityAggregate.ts`, `activityCategories.ts`, all DC scripts. **T1-owned — do not edit.**
- **Dimensions / sliders taxonomy:** `dimensionRegistry.ts`, `featureTargets.ts`, `dimensionGroups.ts`,
  `sliderPresets.ts` — **no new dimensions/sliders** (hard constraint).
- **Edge taxonomy:** `sameUserEdges.ts`, `linkEmphasis.ts` — **no new edge types** (Task 6 reuses the existing
  focus set; it does not add edges).
- **Lasso / detail panel:** `LassoOverlay.tsx`, `UserDetailPanel.tsx`, `SelectionPanel.tsx`.
- **Spatial-graph route:** do not delete it.
- **`graphTestBridge.ts` `GraphTestApi`:** treat as a tested contract; only additive, back-compatible methods,
  and only if a task truly needs one (the plan as written needs none).
- **Baseline WIP / `.gsd/` deletions / `.planning/`** — never stage; explicit-path commits only.

## Hard-constraint compliance

- ✅ Renderer stack NOT replaced (diagnosis proves it animates).
- ✅ Node identity `userId::projectId` preserved; `EXPECTED_NODE_COUNT = 16_942` unchanged.
- ✅ Two buses preserved: Task 1 is PHYSICS-bus only (never touches mask); Tasks 3–6 are MASK/render only
  (never call `updateSliders`/`alpha`/`restart`).
- ✅ Selection never moves the camera (Tasks 3 + 4).
- ✅ Slider movement visibly animates nodes (Task 1).

---

## Task 1 — Physics: reheat on per-dimension slider delta (Defect A) ⛔ graph-physics

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts` (`updateSliders` body + one constant; remove
  the now-unused `prevMax`)
- Test: `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`

**Why this is the fix:** the reheat decision must key off "did any individual dimension change materially",
not "did the scalar max change". Keeping `newAlpha = min(maxSlider, ALPHA_MAX_REHEAT)` means a sticky-high
preset now *helps* (healthy reheat alpha); a floor guarantees visible motion when all sliders are low.

- [ ] **Step 1: Write the failing test** (add to `physicsLayer.test.ts`, after the "No-reheat optimization"
  describe block)

```ts
// =============================================================================
// Defect A (P0): non-dominant slider move must reheat under a multi-slider preset
// =============================================================================
describe("Defect A: reheat keys off per-dimension delta, not the scalar max", () => {
  it("reheats when a non-dominant slider changes even though max(allSliders) is unchanged", async () => {
    // Cache HIT → frozen from construction (mirrors a reloaded organic view).
    const cachedPositions = new Float32Array(4 * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);

    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    // recency is the DOMINANT slider (0.8); activity is non-dominant (0).
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0.8,
    });
    const sim = _capturedSim;

    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => { restartCount++; return origRestart(); };

    // Move ONLY the non-dominant slider. max(allSliders) stays 0.8 (recency dominates),
    // so the OLD scalar-max gate skipped this and the graph never moved.
    physics.updateSliders({ "dim-activity": 0.5, "dim-recency": 0.8 });

    expect(restartCount, "non-dominant slider change must reheat the sim").toBeGreaterThan(0);
  });

  it("still skips a sub-threshold nudge of any single slider when frozen", async () => {
    const cachedPositions = new Float32Array(4 * 3).fill(0);
    mockLoadCachedPositions.mockResolvedValueOnce(cachedPositions);
    const { nodeIds, nodes, targets, dimNames } = makeFixture(4);
    const physics = await createPhysicsLayer(nodeIds, nodes, targets, dimNames, {
      "dim-activity": 0,
      "dim-recency": 0.8,
    });
    const sim = _capturedSim;
    let restartCount = 0;
    const origRestart = sim.restart.bind(sim);
    sim.restart = () => { restartCount++; return origRestart(); };
    physics.updateSliders({ "dim-activity": 0.01, "dim-recency": 0.8 }); // delta 0.01 < 0.02
    expect(restartCount, "sub-threshold nudge stays skipped (no thrash)").toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch the first case fail**

Run: `npx vitest run physicsLayer`
Expected: the "non-dominant slider change must reheat" test FAILS (restartCount = 0 on current code); the
sub-threshold test passes.

- [ ] **Step 3: Add the reheat-alpha floor constant** (in the constants block, after `SKIP_THRESHOLD`)

```ts
/** Reheat alpha floor — any material slider change reheats to at least this so motion is always visible. */
const ALPHA_REHEAT_FLOOR = 0.15;
```

- [ ] **Step 4: Replace the `updateSliders` body** with per-dimension change detection

```ts
    // PHYS-02 + PHYS-03: Update all slider strengths + engine params atomically, then reheat.
    updateSliders(values: Record<string, number>): void {
      const prev = _sliders;                       // reference to the previous vector
      _sliders = { ..._sliders, ...values };       // merge: preserve target-only dims (e.g. module)
      const maxSlider = applySliderForces(_sliders);
      // Reheat to at least the floor so even a small change is visibly animated; a
      // sticky-high preset still yields a healthy alpha via maxSlider.
      const newAlpha = Math.max(
        ALPHA_REHEAT_FLOOR,
        Math.min(maxSlider, ALPHA_MAX_REHEAT),
      );

      // CHANGE-DETECTION FIX (P0): key the skip on the PER-DIMENSION delta, not the
      // scalar max. Multi-slider presets make max(allSliders) sticky, so a
      // non-dominant slider move left maxSlider unchanged and was silently skipped
      // (force field changed, sim never restarted → nodes never moved).
      let maxDelta = 0;
      for (const k of new Set([...Object.keys(prev), ...Object.keys(_sliders)])) {
        maxDelta = Math.max(maxDelta, Math.abs((_sliders[k] ?? 0) - (prev[k] ?? 0)));
      }
      const skip = frozen && maxDelta < SKIP_THRESHOLD;
      if (!skip) {
        frozen = false;
        // Unpin nodes before reheat so forces can move them.
        for (const n of nodes) {
          n.fx = null;
          n.fy = null;
          n.fz = null;
        }
        // PHYS-02: alpha(target).restart() — never bare restart() (Pitfall 4).
        sim.alpha(newAlpha).restart();
      }
    },
```

- [ ] **Step 5: Remove the now-unused `prevMax`** — delete `let prevMax = 0;` and change the construction
  seed line from `prevMax = applySliderForces(_sliders);` to `applySliderForces(_sliders);` (keep the comment).

- [ ] **Step 6: Run the full physics suite** — new tests pass, all PHYS-01..05 + no-reheat + P1.1/P3.4/P3.5
  stay green

Run: `npx vitest run physicsLayer physicsClustering mathLayer`
Expected: PASS. (PHYS-03 reheat assertion still holds: in its single-dim sweep `maxSlider == v` and the floor
0.15 ≤ the smallest asserted `v` 0.25, so `newAlpha == min(v,0.3)` for all asserted steps. No-reheat tests use
single-dim deltas, unaffected.)

- [ ] **Step 7: Layout-math validation** (`access-analysis-graph-development` §4): `physicsLayer.purity.test.ts`
  + `physicsClustering.test.ts` green; no NaN; determinism intact.

Run: `npx vitest run physicsLayer.purity physicsClustering`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/physicsLayer.ts" "app/(dashboard)/users/access-analysis/physicsLayer.test.ts"
git diff --cached --name-only   # MUST list exactly those two files
git commit -m "fix(acc-graph): P0 reheat physics on per-dimension slider delta (not sticky scalar max)"
```

---

## Task 3 — Camera: fixed-width panel column so selection never resizes the graph (Defect B)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/RightPanelStack.tsx:54-59` (root `div` className only)

**Why:** the panel column's width currently follows its child; the `AnimatePresence mode="wait"` swap removes
the child for a beat (and panels may differ in width), resizing the graph's `flex-1` area. A fixed-width
column makes the graph area constant across every selection → no reframe, in 2D *and* 3D, at the source.

- [ ] **Step 1: Pin the column width** — change the root `div` of `RightPanelStack`

```tsx
    <div
      data-testid="right-panel-stack"
      data-top-layer={top}
      className="relative flex w-80 shrink-0"
    >
```

(If a panel is wider than `w-80`, match the column to that panel's width instead — pick the **single** width
all three panels already render at; the point is that the column width is constant regardless of which child
is mounted. Verify by reading `SliderSidebar.tsx`/`SelectionPanel.tsx`/`UserDetailPanel.tsx` root widths and
using the max.)

- [ ] **Step 2: Verify no unit test asserts the old className**

Run: `npx vitest run AccessAnalysisPage SelectionPanel`
Expected: PASS (these assert `data-top-layer`/visibility, not width).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/RightPanelStack.tsx"
git diff --cached --name-only
git commit -m "fix(acc-graph): P0 fix right-panel column width so selection never reframes the graph"
```

---

## Task 4 — Camera: 3D ResizeObserver resizes without refitting (Defect B, defense-in-depth) ⛔ renderer

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx:438-447` (ResizeObserver callback)

**Why:** even with Task 3, any genuine viewport resize (window drag, devtools) currently calls `fitView()`,
discarding the user's orbit. Resize should preserve the camera; fits remain on first-settle (already in
`pumpPositions3D`) and on mode transitions.

- [ ] **Step 1: Remove the refit from the resize callback** — keep size/aspect updates, drop `fitView()`

```tsx
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      if (rw === 0 || rh === 0) return;
      renderer.setSize(rw, rh, false);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      // P0: do NOT fitView() on resize — that discards the user's orbit/zoom.
      // Initial framing is handled by the first-settle fit in pumpPositions3D;
      // mode transitions fit via GraphCanvas. Resize only adjusts the projection.
    });
```

- [ ] **Step 2: Run the 3D e2e subset** — 3D still loads centered with volume, edges intact

Run: `npx playwright test acc-dc-graph -g "3D"`
Expected: PASS — "3D renders a non-empty, finite, centered cloud", "3D edges…" green (these don't depend on
resize-refit; first-settle fit still frames the cloud).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx"
git diff --cached --name-only
git commit -m "fix(acc-graph): P0 3D resize preserves camera (no fitView on resize)"
```

---

## Task 5 — Highlight: isolate lights the same-user footprint (Defect C, MASK bus)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/usePredicateEngine.ts:104-164` (isolate branch only)
- Test: `app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.ts` *(create if absent; the
  pure predicate path is exercisable without React — extract via the existing `filterSelectionByPredicate`
  pattern, or test the mask through a fake `physics.setMask`)*

**Why:** clicking a node currently dims the user's *own other instances* to 0.15 like strangers; only edges
brighten. Lighting the footprint makes "this user's access spread" instantly legible. MASK-bus only — no sim
contact.

- [ ] **Step 1: Write the failing test** — isolate must light all instances of the isolated user

```ts
import { describe, it, expect } from "vitest";
import { usePredicateEngine } from "../usePredicateEngine";
// NOTE: usePredicateEngine is a hook; to unit-test the predicate, capture the
// predicate via a fake physics object and invoke the effect through React's
// test renderer OR refactor the predicate into an exported pure helper
// `buildMaskPredicate(inputs)` and test that directly (preferred — mirrors
// filterSelectionByPredicate). The test below assumes the pure helper.

import { buildMaskPredicate } from "../usePredicateEngine";

function f(nodeId: string) {
  return { nodeId, role: "r", project: "p", isExternal: false,
    activityBucket: "a", signinBucket: "s", permTier: "t",
    nameLower: "n", emailLower: "e" } as any;
}

describe("isolate lights the same-user footprint", () => {
  it("lights every instance whose userId matches the isolated node, dims the rest", () => {
    const features = [f("u1::pA"), f("u1::pB"), f("u2::pA")];
    const predicate = buildMaskPredicate({
      features, activeFilters: {}, searchQuery: "",
      lassoSelection: null, drillDown: null, isolatedNodeIndex: 0,
    } as any);
    expect(predicate(0)).toBe(1.0); // clicked instance
    expect(predicate(1)).toBe(1.0); // same user, other project → footprint lit
    expect(predicate(2)).toBe(0.15); // different user → dimmed
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run usePredicateEngine`
Expected: FAIL — `predicate(1)` is currently `0.15` (only the exact index is lit), and `buildMaskPredicate`
does not yet exist.

- [ ] **Step 3: Extract the pure predicate + light the footprint** — refactor `usePredicateEngine` so the
  predicate body is an exported pure `buildMaskPredicate(inputs)` the hook calls; change the isolate branch

```ts
import { parseNodeId } from "./sameUserEdges";

/** Pure mask predicate — exported so it is unit-testable and reused by the hook. */
export function buildMaskPredicate(
  inputs: Omit<PredicateInputs, "physics">,
): (i: number) => number {
  const { features, activeFilters, searchQuery, lassoSelection, drillDown, isolatedNodeIndex } = inputs;

  // Precompute the isolated user's id once (not per node).
  let isolatedUserId: string | null = null;
  if (isolatedNodeIndex !== null) {
    const fi = features[isolatedNodeIndex];
    isolatedUserId = fi ? parseNodeId(fi.nodeId)?.userId ?? null : null;
  }

  return (i: number): number => {
    const f = features[i];
    if (!f) return 0.15;

    // 1) Click-isolate wins outright — light the clicked node AND its same-user footprint.
    if (isolatedNodeIndex !== null) {
      if (i === isolatedNodeIndex) return 1.0;
      if (isolatedUserId && parseNodeId(f.nodeId)?.userId === isolatedUserId) return 1.0;
      return 0.15;
    }

    // 2) Global filter chips + P7 facets — AND across all keys with non-empty sets.
    for (const [dim, allowed] of Object.entries(activeFilters)) {
      if (allowed.size === 0) continue;
      if (isFacetKey(dim)) {
        if (!nodeMatchesFacet(f, dim, allowed)) return 0.15;
        continue;
      }
      const v = featureValueForDim(f, dim);
      if (!allowed.has(v)) return 0.15;
    }

    // 3) Search prefix match on name OR email (already lowercased upstream).
    if (searchQuery) {
      const hitsName = f.nameLower.startsWith(searchQuery);
      const hitsEmail = f.emailLower.startsWith(searchQuery);
      if (!hitsName && !hitsEmail) return 0.15;
    }

    // 4) Lasso selection (with optional pie-slice drill-down INSIDE the lasso).
    if (lassoSelection) {
      if (!lassoSelection.has(i)) return 0.15;
      if (drillDown) {
        for (const [dim, value] of Object.entries(drillDown)) {
          if (featureValueForDim(f, dim) !== value) return 0.15;
        }
      }
    }

    return 1.0;
  };
}

export function usePredicateEngine(inputs: PredicateInputs): void {
  useEffect(() => {
    const { physics, ...rest } = inputs;
    physics.setMask(buildMaskPredicate(rest));
  }, [
    inputs.physics, inputs.features, inputs.activeFilters, inputs.searchQuery,
    inputs.lassoSelection, inputs.drillDown, inputs.isolatedNodeIndex,
  ]);
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run usePredicateEngine GraphInteractions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/usePredicateEngine.ts" "app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-graph): P0 isolate lights the same-user footprint (mask bus)"
```

---

## Task 6 — Highlight: additive size emphasis for the focus set (Defect C, SHOULD) ⛔ renderer

> **Scope note:** Task 5 alone already fixes "related nodes vanish". Task 6 adds *positive* emphasis so the
> selected/related nodes **pop** (size), not just "others dim". It touches both renderers, so it is the larger
> of the highlight tasks. If the user wants the minimal change, ship Tasks 1/3/4/5/7 and defer Task 6.

**Files:**
- Modify: `GraphCanvas2D.tsx` (add `setSizes` to the handle → cosmos `setPointSizes`)
- Modify: `GraphCanvas3D.tsx` (apply per-instance scale in `pumpPositions3D` from a focus-scale buffer)
- Modify: `GraphCanvas.tsx` (route a `sizes` buffer to both handles, like `nodeColors`)
- Modify: `GraphInteractions.tsx` (compute the focus-scale buffer from `activeUserIds ∪ lassoSelection` and
  push it on focus change — mirrors the existing link-emphasis effect at `:187-193`)

**Design:** a per-node `Float32Array(n)` of point sizes: base size for all nodes, `base * FOCUS_SCALE` for
focus nodes (instances whose `userId ∈ activeUserIds`, plus lasso members). No identity/physics/edge change.

- [ ] **Step 1: Write a failing test for the focus-size buffer builder** — extract a pure helper

`app/(dashboard)/users/access-analysis/focusEmphasis.ts` (new, pure):
```ts
import { parseNodeId } from "./sameUserEdges";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export const BASE_POINT_SIZE = 4;
export const FOCUS_POINT_SCALE = 2.4;

/** Per-node size buffer: focus nodes (same-user footprint ∪ lasso) are enlarged. */
export function buildFocusSizes(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  activeUserIds: ReadonlySet<string>,
  lassoSelection: ReadonlySet<number> | null,
  base = BASE_POINT_SIZE,
): Float32Array {
  const out = new Float32Array(features.length).fill(base);
  if (activeUserIds.size === 0 && !lassoSelection) return out;
  for (let i = 0; i < features.length; i++) {
    const uid = parseNodeId(features[i].nodeId)?.userId;
    const inFocus = (uid && activeUserIds.has(uid)) || (lassoSelection?.has(i) ?? false);
    if (inFocus) out[i] = base * FOCUS_POINT_SCALE;
  }
  return out;
}
```
Test `focusEmphasis.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildFocusSizes, BASE_POINT_SIZE, FOCUS_POINT_SCALE } from "./focusEmphasis";
const f = (id: string) => ({ nodeId: id } as any);
describe("buildFocusSizes", () => {
  it("enlarges same-user footprint and lasso members, leaves the rest at base", () => {
    const features = [f("u1::pA"), f("u1::pB"), f("u2::pA"), f("u3::pA")];
    const sizes = buildFocusSizes(features, new Set(["u1"]), new Set([3]));
    expect(sizes[0]).toBeCloseTo(BASE_POINT_SIZE * FOCUS_POINT_SCALE); // u1 footprint
    expect(sizes[1]).toBeCloseTo(BASE_POINT_SIZE * FOCUS_POINT_SCALE); // u1 footprint
    expect(sizes[2]).toBeCloseTo(BASE_POINT_SIZE);                     // unrelated
    expect(sizes[3]).toBeCloseTo(BASE_POINT_SIZE * FOCUS_POINT_SCALE); // lasso member
  });
  it("returns all-base when nothing is in focus", () => {
    const sizes = buildFocusSizes([f("u1::pA")], new Set(), null);
    expect(sizes[0]).toBeCloseTo(BASE_POINT_SIZE);
  });
});
```

- [ ] **Step 2: Run → fail** (`buildFocusSizes` doesn't exist)

Run: `npx vitest run focusEmphasis`
Expected: FAIL.

- [ ] **Step 3: Create `focusEmphasis.ts`** with the code above. Run → green.

Run: `npx vitest run focusEmphasis`
Expected: PASS.

- [ ] **Step 4: 2D — add `setSizes` to the handle.** In `GraphCanvas2D.tsx`, add to `GraphCanvas2DHandle`:
```ts
  /** Replace per-node point sizes (world units). length = nodeCount. */
  setSizes(sizes: Float32Array): void;
```
and implement inside the `onHandleReady` object:
```ts
        setSizes(sizes: Float32Array): void {
          g!.setPointSizes(sizes);
          g!.render();
        },
```

- [ ] **Step 5: 3D — apply per-instance scale.** In `GraphCanvas3D.tsx`, add a `currentSizes` buffer and a
  `setSizes` handle method; multiply the dummy scale in `pumpPositions3D`:
```ts
    let currentSizes: Float32Array | null = null;
    // inside pumpPositions3D, replace dummy.position.set(...) block body with:
    for (let i = 0; i < n; i++) {
      dummy.position.set(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
      const s = currentSizes ? currentSizes[i] / 4 : 1; // 4 = SphereGeometry base radius
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    // add to the handle object:
    setSizes: (sizes: Float32Array) => { currentSizes = sizes; }, // applied on next pump
```

- [ ] **Step 6: Route sizes through `GraphCanvas.tsx`** — add a `nodeSizes` reactive sync mirroring
  `nodeColors`:
```tsx
  useEffect(() => {
    if (!props.nodeSizes) return;
    handle2D.current?.setSizes(props.nodeSizes);
    handle3D.current?.setSizes(props.nodeSizes);
  }, [props.nodeSizes]);
```

- [ ] **Step 7: Compute + push the focus sizes in `GraphInteractions.tsx`** — extend the existing
  focus-change effect (it already computes `activeUserIds` and pushes link emphasis):
```tsx
  // P0 highlight: enlarge the focus set (same-user footprint ∪ lasso) on focus change.
  const focusSizes = useMemo(
    () => buildFocusSizes(features, activeUserIds, lassoSelection),
    [features, activeUserIds, lassoSelection],
  );
```
then pass `nodeSizes={focusSizes}` down to `<GraphCanvas .../>` via the shell. **Minimal wiring option:** lift
`focusSizes` into `ShellBody` (it already owns `nodeColors`) so it can be passed to `GraphCanvas` as
`nodeSizes`; compute it there from `activeUserIds`/`lassoSelection` exposed by selection state — keeping
`GraphInteractions` and `GraphCanvas` prop contracts aligned. (Choose one owner; do not push sizes from two
places.)

- [ ] **Step 8: Run unit + type gate**

Run: `npx vitest run focusEmphasis GraphCanvas GraphInteractions && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/focusEmphasis.ts" "app/(dashboard)/users/access-analysis/focusEmphasis.test.ts" "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/GraphInteractions.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): P0 additive size emphasis for the selected/related focus set"
```

---

## Task 7 — E2E regressions: animation, camera-stable-on-select, footprint-lit

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts` (add three tests; no `graphTestBridge` change required)

- [ ] **Step 1: Animation — a non-dominant slider nudge unfreezes/moves the graph.** Use a real keyboard
  nudge (not `End`) so the scalar max stays sticky, proving Defect A is fixed.
```ts
test("P0: nudging a non-dominant slider re-animates the graph (reheat)", async ({ page }, testInfo) => {
  await waitForFreeze(page);                       // ensure frozen baseline
  expect(await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getFrozen())).toBe(true);
  // Company is a low/zero default in the organic preset (advanced group) → non-dominant.
  await page.getByTestId("slider-group-Affiliation").getByRole("button").click();
  const thumb = page.getByLabel("Company / firm thumb");
  await thumb.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight"); // mid-range, not max
  // Reheat must briefly unfreeze (Defect A). Poll for frozen=false.
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getFrozen() === false, undefined, { timeout: 10_000 });
  const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
  expect(pos.anyNaN).toBe(false);
  expect(pos.count).toBe(16_942);
  await proofShot(page, testInfo, "after-p0-nondominant-slider");
});
```

- [ ] **Step 2: Camera — selecting a node does not reframe the view.** Compare projected cloud size before
  vs after isolate (Defect B).
```ts
test("P0: selecting a node does not move the camera (2D projected size stable)", async ({ page }, testInfo) => {
  await waitForFreeze(page);
  await page.waitForFunction(() => {
    const s = window.__ACC_GRAPH_TEST__!.getProjectedCloudSize();
    return !!s && s.widthPx > 150 && s.heightPx > 150;
  }, undefined, { timeout: 30_000 });
  const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getProjectedCloudSize());
  const id = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getCentermostNodeId() ?? window.__ACC_GRAPH_TEST__!.getFirstNodeId());
  await page.evaluate((nid) => window.__ACC_GRAPH_TEST__!.simulateClick(nid!), id);
  await expect(page.getByTestId("right-panel-stack")).toHaveAttribute("data-top-layer", "user-detail");
  const after = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getProjectedCloudSize());
  // Camera unchanged → projected size within a tight tolerance (no refit).
  expect(Math.abs(after!.widthPx - before!.widthPx)).toBeLessThan(before!.widthPx * 0.05);
  expect(Math.abs(after!.zoom - before!.zoom)).toBeLessThan(Math.max(0.01, before!.zoom * 0.05));
  await page.keyboard.press("Escape");
  await proofShot(page, testInfo, "after-p0-select-camera-stable");
});
```

- [ ] **Step 3: Highlight — isolating a multi-project user lights >1 node (footprint).** (Defect C)
```ts
test("P0: isolating a multi-project user lights its footprint (not just one node)", async ({ page }, testInfo) => {
  const sample = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getEdgeSample()); // a multi-project user
  expect(sample).toBeTruthy();
  await page.evaluate((nid) => window.__ACC_GRAPH_TEST__!.simulateClick(nid), sample!.nodeId);
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount() > 1, undefined, { timeout: 15_000 });
  const lit = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getHighlightedNodeCount());
  expect(lit, "footprint lit, not a single isolated node").toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__!.getDimmedNodeCount() === 0, undefined, { timeout: 15_000 });
  await proofShot(page, testInfo, "after-p0-footprint-lit");
});
```

- [ ] **Step 4: Run the full e2e suite** (idle machine — see the lasso load-flake memo)

Run: `npm run test:e2e`
Expected: prior 22 tests + 3 new green (allow the known lasso load-flake to be re-run on an idle machine per
`project_lasso_e2e_load_flake`).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git diff --cached --name-only
git commit -m "test(acc-graph): P0 e2e — slider reheat, camera-stable-on-select, footprint-lit"
```

---

## 2D behavior (after the fix)

- **Animate:** when a slider changes materially, the sim reheats; the rAF loop (`GraphCanvas.tsx:124-138`)
  pumps live positions and `GraphCanvas2D.pushPositions` (still-animating branch) renders them every frame —
  nodes visibly move. On settle, the existing scale-change refit reframes once.
- **Camera-stable:** selection no longer resizes the graph area (Task 3), so cosmos does not change framing.
  `pushPositions` only refits on a material spread change, which selection never causes.
- **Highlight:** non-focus nodes dim to 0.15 (unchanged); the selected node's footprint stays lit (Task 5);
  focus nodes are enlarged via `setPointSizes` (Task 6). Color buffer alpha stays 1 (dimming is mask-only),
  preserving the e2e color contract.

## 3D behavior (after the fix)

- **Volumetric + live:** targets already produce real z-depth; with reheat working, slider changes visibly
  re-flow the instanced cloud each frame. Orbit (`OrbitControls`) is preserved.
- **Camera-stable:** resize no longer refits (Task 4); panel swaps no longer resize (Task 3). The user's orbit
  survives selection. First-settle fit and mode-transition fits remain.
- **Highlight:** dimmed instances keep the `× 0.15` color bake; footprint instances stay full color (Task 5);
  focus instances scale up via the per-instance matrix (Task 6).

## Test strategy

- **Unit (authoritative for physics):** Task 1's new tests prove the reheat fix deterministically (no browser,
  no rAF). `physicsLayer.purity` + `physicsClustering` + `mathLayer.purity` guard the layout-math invariants
  (no NaN, determinism, monotonic clustering). Task 5/6 add pure-predicate / pure-builder tests.
- **Type gate:** `npx tsc --noEmit -p tsconfig.json` after Tasks 1, 5, 6.
- **Full unit run before done:** `npm test` (focused runs hide cross-file breakage).

## E2E strategy

- Task 7 adds three regressions that map 1:1 to the three defects, all readable through the **existing**
  `graphTestBridge` (`getFrozen`, `getPositionsStats`, `getProjectedCloudSize`, `getHighlightedNodeCount`,
  `getEdgeSample`, `simulateClick`) — **no `GraphTestApi` change**, preserving the tested contract.
- The animation test deliberately uses `ArrowRight` (mid-range), not `End`, because the old green tests only
  ever drove sliders to the extreme — which is exactly why they missed Defect A.
- Run on an idle machine; the lasso load-flake (`project_lasso_e2e_load_flake`) is unrelated and may need a
  re-run.

## Rollback strategy

- Each task is a **single, isolated commit** on `feat/access-analysis-redesign`; revert any one with
  `git revert <hash>` without disturbing the others (the four fixes are independent).
- **Order of safety:** Task 1 (physics) and Task 3 (panel width) are the smallest and highest-value — land and
  verify them first; they can ship without Tasks 4/6.
- If Task 6 (renderer size emphasis) shows any WebGL regression in e2e, revert just that commit — Tasks 1/3/4/5
  still deliver animation + camera stability + footprint lighting.
- No schema/data/route changes → nothing to migrate back. The position cache is untouched (see diagnosis §7).

## Stop conditions

- **Plan-gated:** do not start until the user approves this plan.
- A fix would require touching a **forbidden file** (routes/nav, DC ingest, dimension/edge taxonomy, lasso,
  `UserDetailPanel`, T1-owned files) → stop and surface it.
- `physicsLayer.purity` / `physicsClustering` / `mathLayer.purity` go red, or `getPositionsStats().anyNaN`
  becomes true → stop, switch to `superpowers:systematic-debugging`, do not paper over.
- `EXPECTED_NODE_COUNT` would change → stop (identity regression).
- After 3 failed fix attempts on any task → stop and question the approach (per systematic-debugging Phase 4.5).
- If `git diff --cached --name-only` shows any file you didn't author for the task → stop, unstage, re-verify
  (staging index hazard).

---

## Self-review

- **Spec coverage:** root cause ✅, files to change ✅, forbidden files ✅, minimal slider-animation fix
  (Task 1) ✅, minimal camera-stability fix (Tasks 3+4) ✅, minimal highlight-visibility fix (Task 5, +Task 6
  stronger) ✅, 2D behavior ✅, 3D behavior ✅, test strategy ✅, e2e strategy ✅, rollback ✅, atomic tasks ✅,
  stop conditions ✅.
- **Two-bus integrity:** Task 1 touches only the PHYSICS bus; Tasks 3–7 touch only MASK/render/layout — no
  cross-contamination. ✅
- **Placeholder scan:** every code step contains real code; no "TBD"/"add error handling". ✅
- **Type consistency:** new symbols `ALPHA_REHEAT_FLOOR`, `buildMaskPredicate`, `buildFocusSizes`,
  `BASE_POINT_SIZE`, `FOCUS_POINT_SCALE`, handle method `setSizes` are defined where introduced and reused
  consistently. ✅
- **Constraint check:** renderer stack preserved; both canvases stay always-mounted (no conditional render
  added); no new dimensions/sliders/edges; node identity intact. ✅
