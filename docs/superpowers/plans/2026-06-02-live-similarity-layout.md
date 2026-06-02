# Live Similarity Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the continuous similarity physics the single source of truth for the slider-driven graph so multi-slider grouping is similarity-based, the shape is organic (no fixed circle), and dragging is lag-free and jump-free.

**Architecture:** Retire the discrete tuple-blob packer (`buildCompositeClusters` → `layoutClusterFootprintsOrganic` → `packMemberPositions`, rescaled to a fixed 1700 circle) as the live layout source. Node positions come from the worker physics (`physicsLayer.ts`, slider = force strength = closeness/separation). Blob hulls + labels are *derived* from where similar nodes emergently settle (new pure `emergentBlobs.ts`), merged by proximity, and updated on a throttle so labels glide while dots flow continuously. Lag is removed by transient slider state (no ~200-slider re-render per tick) and a GPU-upload epsilon throttle.

**Tech Stack:** Next.js (App Router), React, cosmos.gl v3, d3-force-3d (in Web Worker), DuckDB-WASM, Vitest, Playwright.

---

## File Structure

- `emergentBlobs.ts` (CREATE) — pure: live positions + per-node signature + counts → merged blobs `{centroidX, centroidY, radius, label, count, nodeCount}`. One responsibility: derive labels/hulls from emergent layout.
- `emergentBlobs.test.ts` (CREATE) — unit tests for the pure module.
- `dominantClusters.ts` (MODIFY) — add `signatureLabels(features, activeDims)` returning a per-node signature key + a human label map (reuse `valueKeyLabel`), without building the tuple cluster object. Keep existing exports for now.
- `physicsLayer.ts` (MODIFY) — tune `STRENGTH_AT_ONE` / `REPULSION_*` so slider = visible closeness/separation; expose nothing new beyond what tests read.
- `AccessAnalysisShell.tsx` (MODIFY) — stop computing/passing `clusterPackedPositions`/`clusterCorners` as layout; feed physics positions; wire `emergentBlobs` (throttled) into `ClusterLabels`; fix the "Grouping by" copy.
- `GraphCanvas2D.tsx` (MODIFY) — physics path authoritative; add per-frame position-delta epsilon to skip near-settled GPU re-uploads; camera auto-fit on the physics-frozen/normalized layout.
- `GraphCanvas.tsx` (MODIFY) — drop the `clusterPackedPositions`/`clusterCorners` plumbing if it only fed Engine B.
- `SliderContext.tsx` (MODIFY) — transient drag value channel: push to physics via existing rAF coalesce without forcing a full sidebar re-render every tick.
- `ClusterLabels.tsx` (MODIFY) — accept emergent centers (live, eased) instead of static footprint centers.
- Tests touching discrete blobs (`clusterPacking.test.ts`, `acc-cluster-blobs.spec.ts`, `dominantClusters.test.ts`, `ClusterLabels`/`clusterForceLayout` tests) — UPDATE/RETIRE for the new behavior.

---

## Task 1: Emergent blob derivation (pure module)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/emergentBlobs.ts`
- Test: `app/(dashboard)/users/access-analysis/emergentBlobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveEmergentBlobs } from "./emergentBlobs";

// positions stride-2 [x,y,...]; signatures[i] = group key; labels maps key->human label
describe("deriveEmergentBlobs", () => {
  it("is deterministic and groups by signature centroid", () => {
    const pos = new Float32Array([0, 0, 1, 0, 100, 100, 101, 100]);
    const sig = ["A", "A", "B", "B"];
    const labels = { A: "Admins", B: "Guests" };
    const a = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 10 });
    const b = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 10 });
    expect(a).toEqual(b);
    expect(a.length).toBe(2);
    expect(a[0].count).toBe(2);
    expect(a.map((x) => x.label).sort()).toEqual(["Admins", "Guests"]);
  });

  it("merges co-located signatures into one similarity blob", () => {
    const pos = new Float32Array([0, 0, 2, 0, 1, 1, 200, 200]);
    const sig = ["A", "B", "C", "D"]; // A,B,C all near origin → merge; D far
    const labels = { A: "a", B: "b", C: "c", D: "d" };
    const out = deriveEmergentBlobs(pos, sig, labels, { topN: 8, mergeDist: 20 });
    expect(out.length).toBe(2);
    const big = out.find((b) => b.count === 3)!;
    expect(big).toBeTruthy();
  });

  it("caps to topN by count and never NaNs on a single-member blob", () => {
    const pos = new Float32Array([0, 0]);
    const out = deriveEmergentBlobs(pos, ["X"], { X: "x" }, { topN: 1, mergeDist: 5 });
    expect(out.length).toBe(1);
    expect(Number.isFinite(out[0].radius)).toBe(true);
    expect(Number.isFinite(out[0].centroidX)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/emergentBlobs.test.ts"`
Expected: FAIL — `deriveEmergentBlobs is not a function` / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * emergentBlobs.ts — derive labelled blobs from where similar nodes EMERGENTLY
 * settle in the continuous similarity layout. Pure & deterministic.
 *
 * Input positions come straight from the physics layer (stride-2 [x,y]); each
 * node carries a signature key (its values across the active dimensions). We
 * compute each signature's live centroid, MERGE signatures whose centroids are
 * within `mergeDist` (they ended up together ⇒ similar), keep the top-N blobs by
 * member count, and label each by its largest contributing signature. Positions
 * flow continuously, so callers throttle/ease this — the dots never jump.
 */
export interface EmergentBlob {
  centroidX: number;
  centroidY: number;
  radius: number;
  label: string;
  count: number; // members after merge
}

export interface EmergentBlobOpts {
  topN: number;
  mergeDist: number;
}

interface Acc {
  sx: number;
  sy: number;
  n: number;
  label: string;
}

export function deriveEmergentBlobs(
  positions: Float32Array, // stride-2
  signatures: ReadonlyArray<string>,
  labels: Readonly<Record<string, string>>,
  opts: EmergentBlobOpts,
): EmergentBlob[] {
  const n = signatures.length;
  // 1. per-signature centroid + count (deterministic insertion order)
  const bySig = new Map<string, Acc>();
  for (let i = 0; i < n; i++) {
    const key = signatures[i];
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    let a = bySig.get(key);
    if (!a) {
      a = { sx: 0, sy: 0, n: 0, label: labels[key] ?? key };
      bySig.set(key, a);
    }
    a.sx += x;
    a.sy += y;
    a.n += 1;
  }
  // ordered by count desc, then label asc (stable, deterministic)
  const sigs = [...bySig.entries()]
    .map(([key, a]) => ({ key, cx: a.sx / a.n, cy: a.sy / a.n, count: a.n, label: a.label }))
    .sort((p, q) => q.count - p.count || (p.label < q.label ? -1 : p.label > q.label ? 1 : 0));

  // 2. greedy proximity merge (largest first absorbs nearby smaller signatures)
  const merged: { cx: number; cy: number; count: number; label: string; taken: boolean }[] =
    sigs.map((s) => ({ cx: s.cx, cy: s.cy, count: s.count, label: s.label, taken: false }));
  const blobs: { cx: number; cy: number; count: number; label: string }[] = [];
  for (let i = 0; i < merged.length; i++) {
    if (merged[i].taken) continue;
    let sx = merged[i].cx * merged[i].count;
    let sy = merged[i].cy * merged[i].count;
    let count = merged[i].count;
    const label = merged[i].label; // largest signature names the blob
    merged[i].taken = true;
    for (let j = i + 1; j < merged.length; j++) {
      if (merged[j].taken) continue;
      const dx = merged[j].cx - merged[i].cx;
      const dy = merged[j].cy - merged[i].cy;
      if (Math.hypot(dx, dy) <= opts.mergeDist) {
        sx += merged[j].cx * merged[j].count;
        sy += merged[j].cy * merged[j].count;
        count += merged[j].count;
        merged[j].taken = true;
      }
    }
    blobs.push({ cx: sx / count, cy: sy / count, count, label });
  }

  // 3. top-N by count; radius from member spread (RMS distance), floored
  blobs.sort((p, q) => q.count - p.count || (p.label < q.label ? -1 : 1));
  const kept = blobs.slice(0, Math.max(1, opts.topN));
  return kept.map((b) => {
    // radius: RMS distance of member nodes whose centroid is nearest this blob.
    let s2 = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      if (Math.hypot(x - b.cx, y - b.cy) <= opts.mergeDist * 4) {
        s2 += (x - b.cx) ** 2 + (y - b.cy) ** 2;
        m += 1;
      }
    }
    const radius = m > 0 ? Math.max(8, Math.sqrt(s2 / m)) : 8;
    return { centroidX: b.cx, centroidY: b.cy, radius, label: b.label, count: b.count };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/emergentBlobs.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/emergentBlobs.ts" "app/(dashboard)/users/access-analysis/emergentBlobs.test.ts"
git commit -m "feat(acc-redesign): emergent similarity-blob derivation (pure)"
```

---

## Task 2: Per-node signature helper (no tuple cluster object)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dominantClusters.ts`
- Test: `app/(dashboard)/users/access-analysis/dominantClusters.test.ts`

- [ ] **Step 1:** Read `dominantClusters.ts` (`valueKeyLabel`, `buildCompositeClusters`) to reuse its per-node value→{key,label} logic. Add:

```ts
/** Per-node signature for the active dims (NOT a cluster object). The key is the
 *  joined value-keys; labelMap maps each key to a human label (longest active-dim
 *  value names joined with " · "). Used by emergentBlobs for label derivation. */
export function signatureLabels(
  features: ReadonlyArray<NodeFeatureSnapshot>, // match the existing param type
  activeDims: ReadonlyArray<CatalogDim>,        // match the existing type
  thresholds?: unknown,                         // match buildCompositeClusters
): { signatures: string[]; labelMap: Record<string, string> } {
  const signatures: string[] = new Array(features.length);
  const labelMap: Record<string, string> = {};
  for (let i = 0; i < features.length; i++) {
    const keys: string[] = [];
    const labelParts: string[] = [];
    for (const d of activeDims) {
      const { key, label } = valueKeyLabel(features[i], d /*, thresholds */);
      keys.push(key);
      labelParts.push(label);
    }
    const sig = keys.join("¦");
    signatures[i] = sig;
    if (!(sig in labelMap)) labelMap[sig] = labelParts.join(" · ");
  }
  return { signatures, labelMap };
}
```

(Adjust signatures of `valueKeyLabel`/types to the file's actual exports while editing.)

- [ ] **Step 2: Write the failing test**

```ts
import { signatureLabels } from "./dominantClusters";
// build 2 fake features + 2 active dims using the file's existing test fixtures
it("signatureLabels: same values → same signature, human label", () => {
  const { signatures, labelMap } = signatureLabels(FX_FEATURES, [DIM_ROLE, DIM_RECENCY]);
  expect(signatures.length).toBe(FX_FEATURES.length);
  expect(labelMap[signatures[0]]).toContain(" · "); // multi-dim label
});
```

- [ ] **Step 3: Run → fail, implement (Step 1 code), run → pass.**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/dominantClusters.test.ts"`

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dominantClusters.ts" "app/(dashboard)/users/access-analysis/dominantClusters.test.ts"
git commit -m "feat(acc-redesign): per-node signatureLabels for emergent blobs"
```

---

## Task 3: Slider → closeness/separation tuning

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Test: `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`

- [ ] **Step 1:** Read the constants `STRENGTH_AT_ONE`, `REPULSION_ZERO`, `REPULSION_ONE`, `DECAY_ZERO`, `DECAY_ONE`, `lerp` and the `applySliderForces` return. Confirm monotonicity: higher slider ⇒ higher target-pull strength AND higher repulsion (separation).

- [ ] **Step 2: Write the failing/guard test** (a behavior lock, not a value change unless needed):

```ts
it("higher slider → stronger pull and more separation (monotonic)", () => {
  // construct a layer with a tiny fixture; drive updateSliders low vs high;
  // assert the applied force strength + manyBody strength increase with value.
  // (Use the existing test harness pattern in physicsLayer.test.ts.)
});
```

- [ ] **Step 3:** If the perceived effect is too weak/strong on real data, adjust `STRENGTH_AT_ONE` / `REPULSION_ONE` so low slider = loose/overlapping and high = tight + separated. Keep changes minimal; re-run the existing physics suite.

Run: `npx vitest run "app/(dashboard)/users/access-analysis/physicsLayer.test.ts" "app/(dashboard)/users/access-analysis/physicsClustering.test.ts"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/physicsLayer.ts" "app/(dashboard)/users/access-analysis/physicsLayer.test.ts"
git commit -m "feat(acc-redesign): slider value drives closeness/separation"
```

---

## Task 4: Make physics authoritative + wire emergent blobs (Shell + Canvas)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (lines ~108-167, ~255-278)
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`, `GraphCanvas2D.tsx`
- Modify: `app/(dashboard)/users/access-analysis/ClusterLabels.tsx`

- [ ] **Step 1:** In `AccessAnalysisShell.tsx`, remove `clustering`/`footprints`/`clusterPackedPositions`/`clusterCloudCorners` as the *layout* source. Keep `activeDims`. Compute `signatureLabels(features, activeDims)` and store `signatures`+`labelMap` in refs.

- [ ] **Step 2:** Add a throttled emergent-blob effect: on a ~10Hz timer (or `physics.positionsVersion` change, throttled), read `physics.getPositions()`, down-project to stride-2, call `deriveEmergentBlobs(pos2, signatures, labelMap, {topN: 8, mergeDist: <px in layout units>})`, set state `emergentBlobs`. Skip when `activeDims.length === 0`.

- [ ] **Step 3:** Pass `nodeColors` from a signature-based color (reuse `clusterColorBuffer` keyed on a per-node signature index derived from `signatures`) so color matches emergent grouping; OR keep `colorMode` coloring. Choose signature-based for consistency with blobs.

- [ ] **Step 4:** `<GraphCanvas>` no longer receives `clusterPackedPositions`/`clusterCorners`. Confirm it falls through to the physics `pushPositions` path. In `GraphCanvas2D.tsx`, ensure `clusterModeRef`/`clusterPushActive` stay false for the slider view so physics positions drive the layout; keep the `physics.frozen`+spread-change camera fit.

- [ ] **Step 5:** `<ClusterLabels>` now takes `emergentBlobs` (centroidX/Y, radius, label, count) instead of `footprints.cx/cy/r` + `clustering.labels`. Ease label screen positions (lerp toward target each frame) so they glide.

- [ ] **Step 6:** Update the "Grouping by" overlay copy: when `activeDims.length >= 2`, say "Grouping by similarity across: A + B"; for 1 dim, "Grouping by: A".

- [ ] **Step 7:** Run the component/interaction tests; fix fallout.

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"`

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx" "app/(dashboard)/users/access-analysis/ClusterLabels.tsx"
git commit -m "feat(acc-redesign): physics-authoritative live layout + emergent blobs"
```

---

## Task 5: Remove slider lag (transient state + upload throttle)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (`pushPositions`)

- [ ] **Step 1:** Read `SliderContext.tsx` (`setSliderValue`, `schedulePush`, `flushToPhysics`, the `values` state). The physics push already rAF-coalesces. The cost is React re-rendering all sliders on each `setValues`. Change so a **drag** updates a transient channel (ref) that feeds `flushToPhysics` and only the dragged slider re-renders; commit to React state on drag-end (or use `useTransition` to deprioritize the broad re-render). Keep `useSliders().values` semantics for non-drag reads.

- [ ] **Step 2:** In `GraphCanvas2D.pushPositions`, after the existing byte-identical dirty-check, add a per-frame max-delta epsilon: if the largest |Δ| across all coords since the last upload is `< EPS` (e.g. 0.25 layout units), skip `setPointPositions`+`render` this frame. This stops re-uploads as the ease settles.

- [ ] **Step 3:** Add an e2e perf probe (extend `tests/e2e/`): drag a slider across its range; assert no frame exceeds a budget (e.g. capture `performance` long-tasks via the test bridge) and that positions change across frames (continuity, not a single teleport).

- [ ] **Step 4:** Run unit + targeted e2e.

Run: `npx vitest run "app/(dashboard)/users/access-analysis/"` then `npm run test:e2e`
Expected: PASS (lasso load-flake under machine load is a known non-regression).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/SliderContext.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx" tests/e2e/
git commit -m "perf(acc-redesign): transient slider state + GPU upload epsilon throttle"
```

---

## Task 6: Update/retire discrete-blob tests + full gates

**Files:**
- Modify/retire: `clusterPacking.test.ts`, `clusterForceLayout.test.ts`, `ClusterLabels`-related tests, `dominantClusters.test.ts` (tuple paths), `tests/e2e/acc-cluster-blobs.spec.ts`.

- [ ] **Step 1:** For each failing test that asserts the *fixed-circle / tuple-blob* behavior, either update it to the emergent behavior or delete it with a one-line note in the commit (the behavior is intentionally superseded per the spec).

- [ ] **Step 2:** Run the FULL gates:

Run:
```bash
npx vitest run
npx tsc --noEmit
npm run test:e2e
```
Expected: unit green, tsc 0 errors, e2e green (lasso load-flake excepted).

- [ ] **Step 3: Commit**

```bash
git add -- <explicit changed test paths>
git commit -m "test(acc-redesign): retire fixed-circle/tuple-blob assertions for similarity layout"
```

---

## Self-Review

- **Spec coverage:** G1 lag → Task 5 (+ Task 4 removes per-tick re-pack); G2 smooth/live → Engine A continuous (Task 4) + no discrete pop; G3 similarity 2+ → physics blend + emergentBlobs merge (Tasks 1,4); G4 closeness → Task 3; G5 organic shape → Task 4 (remove 1700 rescale path, keep uniform ±350). ✅
- **Placeholder scan:** Tasks 2/3/4 reference reading the file first because exact signatures live in code; the code to ADD is shown. Acceptable for inline execution (the executor reads then adapts the shown code to actual types).
- **Type consistency:** `EmergentBlob.centroidX/centroidY/radius/label/count` used consistently across Task 1 and Tasks 4/5. `signatureLabels` returns `{signatures, labelMap}` consumed identically in Task 4.

## Manual verification (goal acceptance)

After Task 6, verify against the live app at `/users/access-analysis`:
1. Drag a single slider 0→100: dots flow smoothly, no stutter, groups tighten as value rises.
2. Engage a 2nd slider: grouping becomes similarity-based (few merged, human-labeled blobs — NOT dozens of `A·B` combos).
3. Overall silhouette changes with the data and is not a constant circle; camera frames it.
4. Throughout, no perceptible lag or jumping.
