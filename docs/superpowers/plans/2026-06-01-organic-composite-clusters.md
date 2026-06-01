# Organic Composite Clusters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-01-organic-composite-clusters-design.md`.

**Goal:** Make the 2D cluster view group by the *combination* of all engaged sliders (composite blobs), arrange blobs in an *organic* non-overlapping force layout instead of a rigid packed circle, and remove the lag + fix the off-screen camera framing.

**Architecture:** Two new pure modules (`buildCompositeClusters` in `dominantClusters.ts`; `clusterForceLayout.ts` using `d3-force` `forceCollide`) produce the exact same `DominantClustering {ids,labels,counts}` and `ClusterFootprints {cx,cy,r}` shapes the renderer already consumes — so the shell swaps two function calls and nothing downstream changes. Perf + camera framing are fixed in the shell/renderer using the now-known footprint bbox.

**Tech Stack:** TypeScript, React, `d3-force@^3` (already installed — `forceSimulation/forceCollide/forceManyBody/forceX/forceY`), Vitest, Playwright (`:3100`, GPU-off).

**Process guardrails (project memory):** commit by **explicit path only** (never `-A`/`.`); `git diff --cached --name-only` before every commit; commit scope token `acc-cluster`. Execute **in place** (no worktree — WIP lives in the tree). `npm test` resolves `@testing-library/dom` (installed locally, uncommitted).

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `app/(dashboard)/users/access-analysis/dominantClusters.ts` | add `activeCatalogDims` + `buildCompositeClusters` (+ tiny-blob `Other` merge); export `valueKeyLabel` | Modify |
| `app/(dashboard)/users/access-analysis/clusterPacking.ts` | export `footprintRadius(count)` for reuse | Modify |
| `app/(dashboard)/users/access-analysis/clusterForceLayout.ts` | organic non-overlapping footprint layout via d3-force collide | **New** |
| `app/(dashboard)/users/access-analysis/clusterForceLayout.test.ts` | invariants: non-overlap, determinism, bbox, edge cases | **New** |
| `app/(dashboard)/users/access-analysis/dominantClusters.test.ts` | composite keying + tiny-merge tests (file already exists; append) | Modify |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | swap dominant→active dims; composite clusters; force layout; tightness=max; indicator "A + B"; memo gating | Modify |
| `app/(dashboard)/users/access-analysis/ClusterLabels.tsx` | throttle the rAF label projection | Modify |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | camera fit to the known footprint bbox + label-LOD retune | Modify |
| `tests/e2e/acc-cluster-blobs.spec.ts` | composite e2e + un-skip framing fixme | Modify |

---

## Task 1: Composite clustering (`buildCompositeClusters` + tiny-blob merge)

**Files:** Modify `dominantClusters.ts`; append to `dominantClusters.test.ts`.

- [ ] **Step 1: Write failing tests** (append to `dominantClusters.test.ts`)

```ts
import { activeCatalogDims, buildCompositeClusters } from "./dominantClusters";
// (CatalogDimension test factory + NodeFeatureSnapshot helper already exist in this file;
//  reuse them. If not, mirror the dim()/node() factories from catalogTargets.test.ts.)

describe("activeCatalogDims", () => {
  const role = catDim({ id: "role", label: "Role", kind: "categorical", extract: (f) => f.role ?? null });
  const company = catDim({ id: "company", label: "Company", kind: "categorical", extract: (f) => f.company ?? null });
  it("returns every slider>0 dim, strongest first, stable", () => {
    expect(activeCatalogDims([role, company], { role: 40, company: 80 }).map((d) => d.id)).toEqual(["company", "role"]);
    expect(activeCatalogDims([role, company], { role: 0, company: 0 })).toEqual([]);
    expect(activeCatalogDims([role, company], { role: 50 }).map((d) => d.id)).toEqual(["role"]);
  });
});

describe("buildCompositeClusters", () => {
  const role = catDim({ id: "role", label: "Role", kind: "categorical", extract: (f) => f.role ?? null });
  const company = catDim({ id: "company", label: "Company", kind: "categorical", extract: (f) => f.company ?? null });
  const feats = [
    node({ role: "Arch", company: "Acme" }),
    node({ role: "Arch", company: "Bro" }),
    node({ role: "Eng", company: "Acme" }),
    node({ role: "Arch", company: "Acme" }),
  ];
  it("one dim = same grouping as buildDominantClusters", () => {
    const a = buildCompositeClusters(feats, [role], 0);
    expect(a.labels.sort()).toEqual(["Arch", "Eng"]);
    expect(a.counts.reduce((x, y) => x + y, 0)).toBe(4);
  });
  it("two dims = grouped by the tuple, labels joined", () => {
    const c = buildCompositeClusters(feats, [role, company], 0);
    // distinct tuples present: Arch·Acme(2), Arch·Bro(1), Eng·Acme(1)
    expect(c.labels.length).toBe(3);
    expect(c.labels.some((l) => l.includes("Arch") && l.includes("Acme"))).toBe(true);
    expect(c.counts.reduce((x, y) => x + y, 0)).toBe(4);
  });
  it("tiny tuples below minCount fold into a single 'Other'", () => {
    // minCount 2 → Arch·Bro(1) and Eng·Acme(1) merge into Other(2); Arch·Acme(2) stays.
    const c = buildCompositeClusters(feats, [role, company], 2);
    expect(c.labels.filter((l) => l === "Other").length).toBe(1);
    const other = c.labels.indexOf("Other");
    expect(c.counts[other]).toBe(2);
    // every node still assigned to a valid cluster
    expect(Array.from(c.ids).every((id) => id >= 0 && id < c.labels.length)).toBe(true);
  });
});
```

(If `catDim`/`node` factories are not already in `dominantClusters.test.ts`, copy them from `catalogTargets.test.ts` lines 269-285.)

- [ ] **Step 2: Run → RED.** `npm test -- dominantClusters.test`

- [ ] **Step 3: Implement in `dominantClusters.ts`.** Export the existing `valueKeyLabel` (change `function valueKeyLabel` → `export function valueKeyLabel`). Then append:

```ts
/** All slider-engaged dims (value>0), strongest first, ties by id — the composite grouping key set. */
export function activeCatalogDims(
  dims: readonly CatalogDimension[],
  sliderValues: Record<string, number>,
): CatalogDimension[] {
  return dims
    .filter((d) => (sliderValues[d.id] ?? 0) > 0)
    .sort((a, b) => {
      const va = sliderValues[a.id] ?? 0;
      const vb = sliderValues[b.id] ?? 0;
      return vb - va || (a.id < b.id ? -1 : 1);
    });
}

/**
 * Group nodes by the TUPLE of the given dims' values (composite blobs). One dim
 * reproduces buildDominantClusters. Tuples with fewer than minCount members fold
 * into a single "Other" cluster so 2+ broad attributes can't shatter the view.
 * minCount<=1 disables the merge. Pure & deterministic (first-seen order).
 */
export function buildCompositeClusters(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
  minCount = 1,
): DominantClustering {
  if (dims.length === 0) {
    return { ids: new Int32Array(features.length), labels: [], counts: [] };
  }
  const activityIds = dims.filter((d) => d.family === "activity").map((d) => d.id);
  const thresholds = activityIds.length
    ? computeActionThresholds(features, activityIds)
    : new Map<string, ActionThresholds>();

  const keyToIdx = new Map<string, number>();
  const labels: string[] = [];
  const counts: number[] = [];
  const rawIds = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const parts = dims.map((d) => valueKeyLabel(features[i], d, thresholds));
    const key = parts.map((p) => p.key).join("¦"); // ¦ tuple separator
    const label = parts.map((p) => p.label).join(" · "); // · join
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      idx = labels.length;
      keyToIdx.set(key, idx);
      labels.push(label);
      counts.push(0);
    }
    rawIds[i] = idx;
    counts[idx] += 1;
  }
  if (minCount <= 1) return { ids: rawIds, labels, counts };

  // Fold clusters below minCount into one trailing "Other".
  const keep = counts.map((c) => c >= minCount);
  if (keep.every(Boolean)) return { ids: rawIds, labels, counts };
  const remap = new Int32Array(labels.length);
  const newLabels: string[] = [];
  const newCounts: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (keep[i]) {
      remap[i] = newLabels.length;
      newLabels.push(labels[i]);
      newCounts.push(counts[i]);
    } else {
      remap[i] = -1; // → Other (assigned below)
    }
  }
  const otherIdx = newLabels.length;
  newLabels.push("Other");
  newCounts.push(0);
  const ids = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const m = remap[rawIds[i]];
    ids[i] = m >= 0 ? m : otherIdx;
  }
  for (let i = 0; i < counts.length; i++) if (!keep[i]) newCounts[otherIdx] += counts[i];
  return { ids, labels: newLabels, counts: newCounts };
}
```

- [ ] **Step 4: Run → GREEN.** `npm test -- dominantClusters.test`
- [ ] **Step 5: Commit** — `git add` the 2 files → `feat(acc-cluster): composite (multi-slider) clustering with tiny-blob Other merge`.

---

## Task 2: Organic force layout (`clusterForceLayout.ts`)

**Files:** Modify `clusterPacking.ts` (export `footprintRadius`); Create `clusterForceLayout.ts` + `.test.ts`.

- [ ] **Step 1: Export the radius helper from `clusterPacking.ts`.** Add (and refactor `packClusterFootprints`'s `padded` to call it):

```ts
/** Footprint radius for a cluster of `count` members (clamped). Shared by the
 *  deterministic packer and the organic force layout so both size blobs identically. */
export function footprintRadius(count: number): number {
  return clamp(BASE * Math.sqrt(Math.max(0, count)), R_MIN, R_MAX);
}
```
Then change the `padded` line to: `const padded = counts.map((c) => footprintRadius(c) * (1 + GAP));`

- [ ] **Step 2: Write failing tests** (`clusterForceLayout.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";

describe("layoutClusterFootprintsOrganic", () => {
  it("k=0 → empty, k=1 → single blob at origin", () => {
    const z = layoutClusterFootprintsOrganic([]);
    expect(z.cx.length).toBe(0);
    const one = layoutClusterFootprintsOrganic([10]);
    expect(one.cx.length).toBe(1);
    expect(Math.hypot(one.cx[0], one.cy[0])).toBeLessThan(1);
  });
  it("footprints never overlap after relaxation (collide invariant)", () => {
    const f = layoutClusterFootprintsOrganic([100, 50, 50, 20, 20, 5, 5, 5]);
    for (let i = 0; i < f.r.length; i++)
      for (let j = i + 1; j < f.r.length; j++) {
        const d = Math.hypot(f.cx[i] - f.cx[j], f.cy[i] - f.cy[j]);
        expect(d).toBeGreaterThan((f.r[i] + f.r[j]) * 0.98); // small tolerance
      }
  });
  it("is deterministic — same input → identical output", () => {
    const a = layoutClusterFootprintsOrganic([30, 20, 10, 10, 5]);
    const b = layoutClusterFootprintsOrganic([30, 20, 10, 10, 5]);
    expect(Array.from(a.cx)).toEqual(Array.from(b.cx));
    expect(Array.from(a.cy)).toEqual(Array.from(b.cy));
  });
  it("all coords finite and radii positive", () => {
    const f = layoutClusterFootprintsOrganic([7, 7, 7, 7]);
    for (let i = 0; i < f.r.length; i++) {
      expect(Number.isFinite(f.cx[i]) && Number.isFinite(f.cy[i])).toBe(true);
      expect(f.r[i]).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run → RED.** `npm test -- clusterForceLayout.test`

- [ ] **Step 4: Implement `clusterForceLayout.ts`**

```ts
/**
 * clusterForceLayout.ts — Organic, non-overlapping footprint layout (replaces the
 * rigid packSiblings→packEnclose circle for the general placement). Uses d3-force
 * forceCollide to GUARANTEE non-overlap (the blobs-don't-touch invariant) while
 * forceManyBody + weak center gravity give an irregular, breathing outer shape.
 *
 * Pure & deterministic: nodes are seeded on a fixed phyllotaxis spiral (NO RNG) and
 * the simulation is ticked a FIXED number of times synchronously (sim.stop()), so
 * the same counts always yield the same layout (no per-render jitter). Output is the
 * SAME ClusterFootprints {cx,cy,r} shape as packClusterFootprints → drop-in.
 */
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import { footprintRadius, type ClusterFootprints } from "./clusterPacking";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GAP = 6;          // px of breathing room added to each collide radius
const TICKS = 280;      // fixed iteration count → deterministic settle
const TARGET_EXTENT = 1700; // keep camera framing comparable to the old layout

interface FNode { r: number; x: number; y: number; index: number; }

export function layoutClusterFootprintsOrganic(
  counts: ReadonlyArray<number>,
): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };
  for (let i = 0; i < k; i++) r[i] = footprintRadius(counts[i]);
  if (k === 1) return { cx, cy, r };

  // Deterministic spiral seed (bigger blobs nearer center via count order).
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  const seedR = 1200;
  const nodes: FNode[] = order.map((idx, rank) => {
    const rr = seedR * Math.sqrt((rank + 0.5) / k);
    const th = rank * GOLDEN_ANGLE;
    return { r: r[idx], x: Math.cos(th) * rr, y: Math.sin(th) * rr, index: idx };
  });

  const sim = forceSimulation(nodes as unknown as Array<{ index: number }>)
    .force("collide", forceCollide<FNode>((d) => d.r + GAP).strength(1).iterations(3))
    .force("charge", forceManyBody<FNode>().strength(-12))
    .force("x", forceX<FNode>(0).strength(0.045))
    .force("y", forceY<FNode>(0).strength(0.045))
    .stop();
  for (let t = 0; t < TICKS; t++) sim.tick();

  // Recenter on centroid + scale so the max extent ≈ TARGET_EXTENT (stable framing).
  let mx = 0, my = 0;
  for (const n of nodes) { mx += n.x; my += n.y; }
  mx /= k; my /= k;
  let maxReach = 1;
  for (const n of nodes) maxReach = Math.max(maxReach, Math.hypot(n.x - mx, n.y - my) + n.r);
  const scale = TARGET_EXTENT / maxReach;
  for (const n of nodes) {
    cx[n.index] = (n.x - mx) * scale;
    cy[n.index] = (n.y - my) * scale;
    r[n.index] = n.r * scale;
  }
  return { cx, cy, r };
}
```

> Determinism note: `forceSimulation` only injects random initial positions for nodes lacking `x`/`y`. We set both, and `forceCollide`'s tie-break jiggle only fires on *exactly coincident* nodes — our spiral seed guarantees distinct positions — so no `Math.random()` path executes. The determinism test (Step 2) is the guard; if it ever flakes, increase `seedR` so seeds never coincide.

- [ ] **Step 5: Run → GREEN.** `npm test -- "clusterForceLayout.test clusterPacking.test"` (confirm the `footprintRadius` refactor didn't change `packClusterFootprints`).
- [ ] **Step 6: Commit** — 3 files → `feat(acc-cluster): organic non-overlapping footprint layout via d3-force collide`.

---

## Task 3: Shell cutover — composite clusters + organic layout + indicator + memo gating

**Files:** Modify `AccessAnalysisShell.tsx`.

- [ ] **Step 1: Update imports** (line ~34-38 region). Add `activeCatalogDims, buildCompositeClusters` to the `./dominantClusters` import; add `import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";`. Keep `packMemberPositions` from `./clusterPacking` (drop `packClusterFootprints` import).

- [ ] **Step 2: Replace the dominant/clustering/footprints/tightness memos** (current lines ~113-131). Replace `dominant`/`clustering`/`footprints`/`tightness` with:

```tsx
// Composite grouping: every engaged slider contributes to the blob key (multi-slider).
const activeDims = useMemo(
  () => activeCatalogDims(sliderDims, sliderValues),
  [sliderDims, sliderValues],
);
// Recompute clusters/footprints only when the active-slider SET changes (perf): key
// by the joined active ids, not the live values (tightness alone must not re-pack).
const activeKey = activeDims.map((d) => d.id).join(",");
const TINY_BLOB_MIN = Math.max(1, Math.floor(features.length * 0.001));
const clustering = useMemo(
  () => (activeDims.length ? buildCompositeClusters(features, activeDims, TINY_BLOB_MIN) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [features, activeKey],
);
const footprints = useMemo(
  () => (clustering ? layoutClusterFootprintsOrganic(clustering.counts) : null),
  [clustering],
);
const tightness = useMemo(() => {
  if (activeDims.length === 0) return 0;
  const max = Math.max(...activeDims.map((d) => sliderValues[d.id] ?? 0));
  return Math.min(1, Math.max(0, max / 100));
}, [activeDims, sliderValues]);
```

- [ ] **Step 3: Update the "Grouping by" indicator** (current line ~251-256). Replace `dominant && ...` / `{dominant.label}` with:

```tsx
{activeDims.length > 0 && mode === "2d" && (
  <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-md">
    <span className="h-2 w-2 rounded-full bg-blue-500" />
    Grouping by: {activeDims.map((d) => d.label).join(" + ")}
    {clustering?.labels.includes("Other") ? <span className="text-muted-foreground"> (small → Other)</span> : null}
  </div>
)}
```

Also update any other `dominant` references (the `clusterPackedPositions` memo at ~134-141 uses `clustering`/`footprints`/`tightness` only — no change needed; verify no remaining `dominant` identifier via `grep -n "dominant" AccessAnalysisShell.tsx`).

- [ ] **Step 4: Verify** `npx tsc --noEmit` → 0 errors (no dangling `dominant`/`packClusterFootprints`). `npm test` → green.
- [ ] **Step 5: Commit** — `AccessAnalysisShell.tsx` → `feat(acc-cluster): wire composite clusters + organic layout into the shell (max-slider tightness, A+B indicator)`.

---

## Task 4: Perf — throttle label projection

**Files:** Modify `ClusterLabels.tsx`.

- [ ] **Step 1:** In the rAF `tick` loop (around lines 70-80), throttle DOM writes to ~30 Hz using the rAF timestamp. Change the `tick` signature to `tick(ts)` and guard:

```tsx
let lastProject = 0;
const tick = (ts: number) => {
  if (!active) return;
  if (ts - lastProject >= 33) { // ~30 Hz
    lastProject = ts;
    // ... existing per-label projection/opacity writes ...
  }
  raf = requestAnimationFrame(tick);
};
raf = requestAnimationFrame(tick);
```

(Keep the existing projection body unchanged — only gate how often it runs. `requestAnimationFrame` passes a DOMHighResTimeStamp, so no clock import.)

- [ ] **Step 2: Verify** `npm test -- ClusterLabels` (if a test exists) and `npx tsc --noEmit` → 0. Manual: lag should drop (verified live in Task 6 UAT).
- [ ] **Step 3: Commit** — `ClusterLabels.tsx` → `perf(acc-cluster): throttle cluster-label projection to ~30Hz`.

---

## Task 5: Camera framing fix (fit to the known footprint bbox)

**Files:** Modify `GraphCanvas2D.tsx`. **⚠ Requires owner GPU-on eyeball — see Step 4.**

The deferred fitView frames cosmos's stale bbox under `dontRescale=true`. Now that the shell computes exact footprints, pass the layout's true extent so the fit is explicit and correct, and retune the label-LOD so labels survive the zoom.

- [ ] **Step 1:** Add an optional `clusterExtent?: number` to `GraphCanvas2DProps` and thread it from `GraphCanvas.tsx` (the shell already knows footprints: pass `max reach = max over i of hypot(cx_i,cy_i)+r_i`, or simply `1700` since `layoutClusterFootprintsOrganic` normalizes to `TARGET_EXTENT`). On the settle frame (the `fitPendingRef===0` branch), do one `setPointPositions(xy2, false)` then `fitView?.(0, 0.12, false)` so cosmos rescales its committed bbox to the true extent before framing. (This is the earlier fix, now paired with the LOD retune in Step 2 that prevents the label dropout.)

- [ ] **Step 2:** In `clusterLabelLayout.ts` (the LOD selector) lower the on-screen-radius reveal threshold and/or scale it by the fitted zoom so the blobs that now fit the viewport still reveal labels. (Read the current threshold; reduce until the `LABEL_DIAG` `revealedAndInside` is high.)

- [ ] **Step 3: Headless proxy verification.** Run `npx playwright test tests/e2e/acc-cluster-blobs.spec.ts -g "frame within" --workers=1 --timeout=240000` (un-skip the fixme first — Task 6). Target: `withinCanvas > 0.8*total` AND `revealedAndInside > 0.4*total`.

- [ ] **Step 4: ⚠ Owner GPU-on verification.** e2e runs GPU-off; the live `:3000` build is GPU-on. After the headless proxy passes, the owner must eyeball `:3000` (blobs centered + labels visible) before this task is "done". DO NOT claim the framing fixed on headless evidence alone. Commit behind this caveat.

- [ ] **Step 5: Commit** — `GraphCanvas2D.tsx` + `clusterLabelLayout.ts` → `fix(acc-cluster): frame camera to packed footprint bbox + retune label LOD`.

---

## Task 6: e2e + gates

**Files:** Modify `tests/e2e/acc-cluster-blobs.spec.ts`.

- [ ] **Step 1:** Add a composite test: load graph, set **Role** to 100, record blob count via `getByTestId("cluster-label").count()`; then also set **Company** to 100; assert the new count is **greater** (composite split) and the indicator text matches `/Grouping by:\s*(Role \+ Company|Company \+ Role)/`, with `getPositionsStats().anyNaN === false`.

- [ ] **Step 2:** Un-skip the framing `test.fixme` → `test(` once Task 5 Step 3 passes. Keep the `withinCanvas`/`revealedAndInside` assertions.

- [ ] **Step 3: Gates.** `npm test` (unit green), `npx tsc --noEmit` (0), `npm run lint` (0 errors), `npm run build` (exit 0), `npx playwright test tests/e2e/acc-cluster-blobs.spec.ts --workers=1 --timeout=240000` (green; load-flake caveat — re-run isolated). Negative check: `git log` shows only `acc-cluster`-scoped commits touching the cluster files; no unrelated WIP swept in.

- [ ] **Step 4: Deploy + report.** `npm run build`; ask the owner to restart `:3000` (or, if authorized, stop the listener + relaunch `next start`). Report gate counts + the composite/organic behavior to eyeball + the framing caveat.

---

## Self-Review

**Spec coverage:** composite clustering → Task 1 (+shell Task 3); tiny-blob Other merge → Task 1; organic non-overlapping placement → Task 2 (+shell Task 3); no new dep (d3-force) → Task 2; max-slider tightness + "A + B" indicator → Task 3; perf gating → Task 3 Step 2 memo + Task 4 throttle; camera framing fix + LOD → Task 5; organic all-0 scatter → **deferred** (the spec listed it; the GPU random-disc seed lives in delicate `GraphCanvas2D` and can't be GPU-verified headless — call it out to the owner and do it in a follow-up rather than risk the GPU path here). e2e → Task 6.

**Placeholder scan:** pure-module tasks (1,2) have complete code; shell/renderer tasks give exact before/after against the read current code. The one empirical step (Task 5 Step 2 LOD threshold) is a measured tuning loop with a stop condition (`LABEL_DIAG` targets), not a placeholder.

**Type consistency:** `buildCompositeClusters`/`activeCatalogDims` return `DominantClustering`/`CatalogDimension[]` (match `dominantClusters.ts`); `layoutClusterFootprintsOrganic` returns `ClusterFootprints {cx,cy,r}` (matches `packMemberPositions`/`ClusterLabels` consumers); `footprintRadius` exported from `clusterPacking.ts` and consumed in `clusterForceLayout.ts`.

**Scope note:** organic all-0 scatter explicitly deferred (above) to keep the GPU-path risk bounded; everything else is one cohesive plan.
