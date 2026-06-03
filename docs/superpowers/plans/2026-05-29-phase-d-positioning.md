# Phase D — Positioning Engine + Color Decouple Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the catalog-driven positioning engine (ordinal ramp + per-action quantile buckets + catalog targets/weights) as pure, fully-tested modules, and ship one live behavior change — the 2D cloud clusters by *sliders* instead of by *color* — plus a smooth-0→100 calibration probe.

**Architecture:** Three pure modules consume the Phase C `CatalogDimension` descriptors and produce the same `TargetArrays` / `Record<id, Float32Array>` shapes the physics layer already eats — dispatching by `descriptor.kind` (categorical→volumetric Fibonacci, multiHot→centroid, ordinal→ordered ramp). They are **unwired** in Phase D (Phase E flips the shell + sidebar onto them, exactly as Phase C left the catalog pure+unwired). The only *live* runtime change is removing color-derived `clusterIds` from the 2D layout path so the existing slider-anchor path drives clustering. A Playwright probe sweeps a slider 0→100 and measures cluster separation to prove no dead zone / no snap / even increments.

**Tech Stack:** TypeScript (Next.js app dir), Vitest (unit), Playwright (e2e on `:3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`), d3-force-3d physics worker, cosmos.gl GPU 2D.

---

## Scope & Guardrails (READ FIRST)

The owner chose **"Engine + the color fix"** (Option A) on 2026-05-29. That decision bounds this phase:

**IN scope:**
- Pure engine modules: `actionBuckets.ts`, `catalogTargets.ts`, `catalogWeights.ts`, `sliderCalibration.ts` — built + fully unit-tested, **left unwired**.
- **One live change:** stop feeding color-derived `clusterIds` into the 2D layout so it clusters by sliders (color stays a pure recolor).
- Cache: bump `LAYOUT_VERSION`; add an exact-slider-key guard test.
- The Playwright calibration probe + a color-independence e2e + a component guard test.

**OUT of scope — do NOT do these (they are Phase E):**
- ❌ Do **NOT** delete or edit the legacy `dimensionRegistry.ts`, `dimensionGroups.ts`, `dimensionWeights.ts`, `sliderPresets.ts`, or `featureTargets.ts`'s legacy functions. They keep the live graph running until Phase E migrates consumers.
- ❌ Do **NOT** change `SliderContext.tsx`, the slider id-space (`SLIDER_DIMENSION_IDS`), `DIMENSIONS`, or `DEFAULT_VALUES`. The new ~200-dim slider tree is Phase E.
- ❌ Do **NOT** wire `buildCatalogTargets` / `buildCatalogWeights` into `AccessAnalysisShell`'s `createPhysicsLayerWorker` call. They ship pure + exported + tested only.

**Process guardrails (from project memory):**
- Stage commits by **explicit path only** — never `git add -A` or `git add .`. This branch (`feat/access-analysis-redesign`) carries large uncommitted WIP.
- **Before every commit**, run `git diff --cached --name-only` and confirm it lists *only* the files named in that task's commit step. Pre-staged WIP can sweep into an explicit-path commit.
- Commit scope token for this phase: `acc-positioning`.

---

## File Structure

**New files (pure engine — unwired):**
- `app/(dashboard)/users/access-analysis/actionBuckets.ts` — per-action relative quantile bucketing (none/low/med/high). Deferred here from Phase B.
- `app/(dashboard)/users/access-analysis/catalogTargets.ts` — catalog-driven targets; dispatch by `kind`; `computeOrdinalRampTarget`.
- `app/(dashboard)/users/access-analysis/catalogWeights.ts` — catalog-driven per-node weights (`confidence × availability`; ordinal availability ≡ 1).
- `app/(dashboard)/users/access-analysis/sliderCalibration.ts` — perceptual slider→force response curve (default identity).

**New test files:**
- `actionBuckets.test.ts`, `catalogTargets.test.ts`, `catalogWeights.test.ts`, `sliderCalibration.test.ts`
- `tests/e2e/acc-positioning.spec.ts` — calibration probe + color-independence + 2D-clusters-by-slider smoke.

**Modified files:**
- `featureTargets.ts` — **export** `volumetricAnchor` and `ANCHOR_RADIUS` (currently private) for reuse. No logic change.
- `physicsLayer.ts` — apply `calibrateSliderResponse` to the slider strength (one line; default identity = no behavior change).
- `positionsCache.ts` — bump `LAYOUT_VERSION` to `feature-targets-v2`.
- `AccessAnalysisShell.tsx` — remove the `clusterAssignment` memo + the `clusterIds` prop + the now-unused `buildClusterAssignment` import.
- `GraphCanvas.test.ts` — add the color-decouple component guard test.

---

## Task 1: Per-action quantile bucketing (`actionBuckets.ts`)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/actionBuckets.ts`
- Test: `app/(dashboard)/users/access-analysis/actionBuckets.test.ts`

Spec §8/§10 decision 4: each action dimension buckets a node's raw count into `none/low/med/high` using cut points over that action's **own nonzero** distribution, so a 2,228-user action and a 1-user action each use their full range and outliers can't stretch the layout. The catalog's action descriptors already `extract` the raw count (`f.actionCounts?.[id] ?? 0`); this module turns raw counts into bucket indices.

- [ ] **Step 1: Write the failing test**

```ts
// app/(dashboard)/users/access-analysis/actionBuckets.test.ts
import { describe, it, expect } from "vitest";
import {
  computeActionThresholds,
  bucketForCount,
  ACTION_BUCKET_COUNT,
} from "./actionBuckets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function feat(actionCounts: Record<string, number>): NodeFeatureSnapshot {
  // Only actionCounts matters here; cast through unknown for the partial shape.
  return { actionCounts } as unknown as NodeFeatureSnapshot;
}

describe("actionBuckets", () => {
  it("has 4 buckets (none/low/med/high)", () => {
    expect(ACTION_BUCKET_COUNT).toBe(4);
  });

  it("count 0 is always bucket 0 (none), regardless of thresholds", () => {
    expect(bucketForCount(0, [5, 10])).toBe(0);
    expect(bucketForCount(0, [Infinity, Infinity])).toBe(0);
  });

  it("classifies nonzero counts into low/med/high by tercile cut points", () => {
    // 9 nonzero values 1..9 → terciles t1≈3.67, t2≈6.33
    const features = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => feat({ view: c }));
    const th = computeActionThresholds(features, ["view"]).get("view")!;
    expect(th[0]).toBeGreaterThan(0);
    expect(th[1]).toBeGreaterThan(th[0]);
    expect(bucketForCount(1, th)).toBe(1); // low
    expect(bucketForCount(5, th)).toBe(2); // med
    expect(bucketForCount(9, th)).toBe(3); // high
  });

  it("per-action relative: a rare 1-user action degenerates to none vs present", () => {
    const features = [feat({ rare: 1 }), feat({ rare: 0 }), feat({})];
    const th = computeActionThresholds(features, ["rare"]).get("rare")!;
    expect(bucketForCount(0, th)).toBe(0);
    expect(bucketForCount(1, th)).toBe(3); // the single present value lands at high
  });

  it("an action with no data anywhere gets [Infinity, Infinity] (all counts → none)", () => {
    const th = computeActionThresholds([feat({})], ["ghost"]).get("ghost")!;
    expect(th).toEqual([Infinity, Infinity]);
    expect(bucketForCount(0, th)).toBe(0);
  });

  it("outliers do not move the cut points off the bulk (relative, not absolute)", () => {
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000]; // one huge outlier
    const th = computeActionThresholds(counts.map((c) => feat({ a: c })), ["a"]).get("a")!;
    // t1/t2 stay near the bulk (1), so a count of 2 is already high, not "low".
    expect(th[0]).toBeLessThan(1000);
    expect(bucketForCount(1, th)).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/actionBuckets.test.ts`
Expected: FAIL — `Cannot find module './actionBuckets'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/(dashboard)/users/access-analysis/actionBuckets.ts
/**
 * actionBuckets.ts — Per-action relative quantile bucketing (Phase D).
 *
 * Spec §8/§10 decision 4: each ACTION dimension buckets a node's raw count into
 * none / low / med / high using cut points computed over that action's OWN nonzero
 * distribution, so a 2,228-user action and a 1-user action each use their full range
 * and outliers cannot stretch the layout. The catalog's action descriptors already
 * extract the raw count (f.actionCounts?.[id] ?? 0); this turns counts into buckets.
 *
 * Pure: no React/DOM/IO. Deterministic.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** Bucket index along the ordinal ramp: 0=none, 1=low, 2=med, 3=high. */
export type ActionBucket = 0 | 1 | 2 | 3;
export const ACTION_BUCKET_COUNT = 4;

/** Interior tercile cut points over an action's NONZERO counts: [t1, t2]. */
export type ActionThresholds = readonly [number, number];

/** Linear-interpolated quantile of a pre-sorted ascending array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Precompute per-action thresholds. For each action id, collect every node's
 * count > 0, sort ascending, and take the 1/3 and 2/3 quantiles as [t1, t2].
 * A node's bucket is then: 0 if count<=0; 1 if count<t1; 2 if count<t2; else 3.
 *
 * Degenerate distributions collapse gracefully: an action with no data anywhere
 * gets [Infinity, Infinity] (every count → none); a single present value puts that
 * value at high (spec §17: rare actions become "did vs didn't").
 */
export function computeActionThresholds(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  actionIds: ReadonlyArray<string>,
): Map<string, ActionThresholds> {
  const byAction = new Map<string, number[]>();
  for (const id of actionIds) byAction.set(id, []);
  for (const f of features) {
    const counts = f.actionCounts;
    if (!counts) continue;
    for (const id of actionIds) {
      const c = counts[id] ?? 0;
      if (c > 0) byAction.get(id)!.push(c);
    }
  }
  const out = new Map<string, ActionThresholds>();
  for (const id of actionIds) {
    const arr = byAction.get(id)!;
    if (arr.length === 0) {
      out.set(id, [Infinity, Infinity]);
      continue;
    }
    arr.sort((a, b) => a - b);
    out.set(id, [quantile(arr, 1 / 3), quantile(arr, 2 / 3)]);
  }
  return out;
}

/** Classify a raw count into a bucket using the action's thresholds. */
export function bucketForCount(count: number, thresholds: ActionThresholds): ActionBucket {
  if (count <= 0) return 0;
  if (count < thresholds[0]) return 1;
  if (count < thresholds[1]) return 2;
  return 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/actionBuckets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only   # MUST be empty before staging
git add "app/(dashboard)/users/access-analysis/actionBuckets.ts" "app/(dashboard)/users/access-analysis/actionBuckets.test.ts"
git diff --cached --name-only   # confirm ONLY these two files
git commit -m "feat(acc-positioning): per-action relative quantile bucketing (none/low/med/high)"
```

---

## Task 2: Catalog-driven targets + ordinal ramp (`catalogTargets.ts`)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/featureTargets.ts` (export `volumetricAnchor`, `ANCHOR_RADIUS`)
- Create: `app/(dashboard)/users/access-analysis/catalogTargets.ts`
- Test: `app/(dashboard)/users/access-analysis/catalogTargets.test.ts`

This dispatches by `descriptor.kind`: **categorical/binary** → one volumetric Fibonacci anchor per distinct value (reuses the proven `volumetricAnchor`); **multiHot** → centroid of per-key anchors; **ordinal** (permission, tenure, all actions) → an **ordered ramp** along a per-dimension axis (`none → … → high`) so the cloud forms a readable gradient.

- [ ] **Step 1: Export the two reusable primitives from `featureTargets.ts`**

Change line 66:
```ts
const ANCHOR_RADIUS = 16000;
```
to:
```ts
export const ANCHOR_RADIUS = 16000;
```

Change line 123 (the `volumetricAnchor` declaration):
```ts
function volumetricAnchor(
```
to:
```ts
export function volumetricAnchor(
```

(No other change to `featureTargets.ts` — the legacy path keeps working.)

- [ ] **Step 2: Write the failing test**

```ts
// app/(dashboard)/users/access-analysis/catalogTargets.test.ts
import { describe, it, expect } from "vitest";
import {
  buildCatalogTargets,
  computeOrdinalRampTarget,
} from "./catalogTargets";
import { ANCHOR_RADIUS } from "./featureTargets";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(partial: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return partial as unknown as NodeFeatureSnapshot;
}

const catDim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x",
  label: "X",
  family: "structure",
  kind: "categorical",
  source: "test",
  confidence: "high",
  available: true,
  surfaces: ["slider"],
  extract: () => null,
  ...over,
});

describe("catalogTargets", () => {
  it("categorical: same value → identical anchor; different values → separated", () => {
    const dim = catDim({ id: "project", kind: "categorical", extract: (f) => f.project ?? null });
    const features = [node({ project: "A" }), node({ project: "B" }), node({ project: "A" })];
    const t = buildCatalogTargets(features, [dim])["project"];
    expect(t.x[0]).toBeCloseTo(t.x[2], 6);
    expect(t.y[0]).toBeCloseTo(t.y[2], 6);
    const d = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z![0] - t.z![1]);
    expect(d).toBeGreaterThan(0);
  });

  it("ordinal ramp: none and high sit at opposite ends of one axis (gradient)", () => {
    const dim = catDim({ id: "permission", kind: "ordinal", family: "access" });
    // permission strength 0 (none) vs 5 (high)
    const features = [node({ permissionStrength: 0 }), node({ permissionStrength: 5 })];
    const t = buildCatalogTargets(features, [dim])["permission"];
    // colinear & opposite-signed along the dim axis → the two are ~2*radius apart.
    const sep = Math.hypot(t.x[0] - t.x[1], t.y[0] - t.y[1], t.z![0] - t.z![1]);
    expect(sep).toBeGreaterThan(ANCHOR_RADIUS); // spans most of the axis
    // none is the negative pole, high the positive pole → mirrored about origin.
    expect(Math.sign(t.x[0])).not.toBe(Math.sign(t.x[1]));
  });

  it("ordinal ramp: monotonic position along the axis (low between none and high)", () => {
    const dim = catDim({ id: "permission", kind: "ordinal", family: "access" });
    const features = [
      node({ permissionStrength: 0 }),
      node({ permissionStrength: 2 }),
      node({ permissionStrength: 5 }),
    ];
    const t = buildCatalogTargets(features, [dim])["permission"];
    // Project onto x: index 1 lies strictly between index 0 and index 2.
    const lo = t.x[0], mid = t.x[1], hi = t.x[2];
    expect((mid - lo) * (hi - mid)).toBeGreaterThan(0); // same direction → monotonic
  });

  it("ordinal action ramp: count buckets via per-action quantiles", () => {
    const dim = catDim({
      id: "view-entity",
      kind: "ordinal",
      family: "activity",
      extract: (f) => f.actionCounts?.["view-entity"] ?? 0,
    });
    const features = [
      node({ actionCounts: {} }),                       // none
      node({ actionCounts: { "view-entity": 1 } }),     // low-ish
      node({ actionCounts: { "view-entity": 100 } }),   // high
    ];
    const t = buildCatalogTargets(features, [dim])["view-entity"];
    // none (index 0) and high (index 3) are the extremes; both finite, separated.
    const sep = Math.hypot(t.x[0] - t.x[2], t.y[0] - t.y[2], t.z![0] - t.z![2]);
    expect(sep).toBeGreaterThan(0);
    expect(Number.isFinite(t.x[1])).toBe(true);
  });

  it("multiHot: empty signature → origin (no pull); shared signature → shared centroid", () => {
    const dim = catDim({
      id: "moduleAccess",
      kind: "multiHot",
      family: "access",
      extract: (f) => (f.moduleSignature ?? []) as string[],
    });
    const features = [
      node({ moduleSignature: [] }),
      node({ moduleSignature: ["build", "docs"] }),
      node({ moduleSignature: ["build", "docs"] }),
    ];
    const t = buildCatalogTargets(features, [dim])["moduleAccess"];
    expect(t.x[0]).toBe(0);
    expect(t.y[0]).toBe(0);
    expect(t.x[1]).toBeCloseTo(t.x[2], 6);
  });

  it("computeOrdinalRampTarget is deterministic & length-correct", () => {
    const dim = catDim({ id: "permission", kind: "ordinal" });
    const features = [node({ permissionStrength: 3 }), node({ permissionStrength: 3 })];
    const a = computeOrdinalRampTarget(features, dim, () => ({ index: 3, bucketCount: 6 }));
    const b = computeOrdinalRampTarget(features, dim, () => ({ index: 3, bucketCount: 6 }));
    expect(a.length).toBe(6); // 2 nodes * 3
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[0]).toBeCloseTo(a[3], 6); // same bucket → same point
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/catalogTargets.test.ts`
Expected: FAIL — `Cannot find module './catalogTargets'`.

- [ ] **Step 4: Write the implementation**

```ts
// app/(dashboard)/users/access-analysis/catalogTargets.ts
/**
 * catalogTargets.ts — Catalog-driven layout targets (Phase D).
 *
 * Builds per-dimension anchor positions from the Phase C CatalogDimension
 * descriptors, dispatching by descriptor.kind:
 *   - categorical / binary → volumetric spherical-Fibonacci clumps (one anchor per
 *     distinct value), reusing volumetricAnchor from featureTargets.
 *   - multiHot            → centroid of per-key anchors (empty signature → origin).
 *   - ordinal             → an ORDERED RAMP: buckets placed along a per-dimension
 *     axis (none → … → high) so the cloud forms a readable gradient, not blobs.
 *
 * Pure: no React/DOM/IO. Deterministic.
 *
 * UNWIRED in Phase D (engine only). Phase E swaps the shell's buildFeatureTargets
 * call for buildCatalogTargets once the sidebar emits catalog ids.
 */
import type { TargetArrays } from "./physicsLayer";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { volumetricAnchor, ANCHOR_RADIUS } from "./featureTargets";
import {
  ACTION_BUCKET_COUNT,
  bucketForCount,
  computeActionThresholds,
  type ActionThresholds,
} from "./actionBuckets";

/** Ordered membership ladder for the tenure ordinal ramp (unknown = none pole). */
const MEMBERSHIP_ORDER: Record<string, number> = {
  unknown: 0,
  "<30d": 1,
  "<90d": 2,
  "<1y": 3,
  ">1y": 4,
};
const MEMBERSHIP_BUCKET_COUNT = 5;
const PERMISSION_BUCKET_COUNT = 6; // strength 0..5

/** A node's ordinal bucket placement: index in [0, bucketCount-1]. */
interface OrdinalBucket {
  index: number;
  bucketCount: number;
}

/** Stable per-dimension unit axis for the ordinal ramp (distinct dims → distinct axes). */
function rampDirection(dimId: string): [number, number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < dimId.length; i++) {
    h ^= dimId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const u = (h >>> 0) / 0xffffffff; // [0,1)
  const yUnit = 1 - 2 * u; // [-1,1]
  const rxy = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
  const theta = (2 * Math.PI * ((Math.imul(h, 2654435761) >>> 0) / 0xffffffff));
  return [Math.cos(theta) * rxy, yUnit, Math.sin(theta) * rxy];
}

/** Coerce a descriptor value to a stable categorical bucket string. */
function catValue(f: NodeFeatureSnapshot, dim: CatalogDimension): string {
  const v = dim.extract(f);
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("|") : "(none)";
  return "(none)";
}

/** Categorical/binary anchors — same as the legacy path but driven by dim.extract. */
export function computeCatalogCategoricalTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const set = new Set<string>();
  for (const f of features) set.add(catValue(f, dim));
  const cats = Array.from(set).sort();
  const indexOf = new Map<string, number>();
  cats.forEach((c, i) => indexOf.set(c, i));
  const anchors = cats.map((_, i) => volumetricAnchor(i, cats.length, radius));
  for (let n = 0; n < features.length; n++) {
    const a = anchors[indexOf.get(catValue(features[n], dim)) ?? 0];
    out[n * 3] = a[0];
    out[n * 3 + 1] = a[1];
    out[n * 3 + 2] = a[2];
  }
  return out;
}

/** MultiHot anchors — centroid of per-key anchors; empty signature → origin. */
export function computeCatalogMultiHotTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const keySet = new Set<string>();
  const sigs: string[][] = features.map((f) => {
    const v = dim.extract(f);
    const keys = Array.isArray(v) ? [...v].sort() : [];
    for (const k of keys) keySet.add(k);
    return keys;
  });
  const keys = Array.from(keySet).sort();
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => keyIndex.set(k, i));
  const keyAnchors = keys.map((_, i) => volumetricAnchor(i, keys.length, radius));
  for (let n = 0; n < features.length; n++) {
    const sig = sigs[n];
    if (sig.length === 0) continue; // origin → no pull
    let x = 0, y = 0, z = 0;
    for (const k of sig) {
      const a = keyAnchors[keyIndex.get(k)!];
      x += a[0]; y += a[1]; z += a[2];
    }
    out[n * 3] = x / sig.length;
    out[n * 3 + 1] = y / sig.length;
    out[n * 3 + 2] = z / sig.length;
  }
  return out;
}

/**
 * Ordinal ramp: place each node's bucket along the dimension's axis from -radius
 * (none) to +radius (high). `none` is a real pole (spec §10), not the origin, so
 * every node is positioned and the cloud forms a gradient.
 */
export function computeOrdinalRampTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  bucketOf: (f: NodeFeatureSnapshot) => OrdinalBucket,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const dir = rampDirection(dim.id);
  for (let n = 0; n < features.length; n++) {
    const { index, bucketCount } = bucketOf(features[n]);
    const denom = Math.max(1, bucketCount - 1);
    const t = (index / denom) * 2 - 1; // -1 (none) … +1 (high)
    const r = radius * t;
    out[n * 3] = dir[0] * r;
    out[n * 3 + 1] = dir[1] * r;
    out[n * 3 + 2] = dir[2] * r;
  }
  return out;
}

/** Per-ordinal-dim bucketer. permission/tenure are by id; activity dims use quantiles. */
function bucketerFor(
  dim: CatalogDimension,
  thresholds: Map<string, ActionThresholds>,
): (f: NodeFeatureSnapshot) => OrdinalBucket {
  if (dim.id === "permission") {
    return (f) => ({
      index: Math.max(0, Math.min(5, Math.round(f.permissionStrength ?? 0))),
      bucketCount: PERMISSION_BUCKET_COUNT,
    });
  }
  if (dim.id === "tenure") {
    return (f) => ({
      index: MEMBERSHIP_ORDER[f.membershipBucket ?? "unknown"] ?? 0,
      bucketCount: MEMBERSHIP_BUCKET_COUNT,
    });
  }
  // Activity-family action dims: per-action quantile bucket of the raw count.
  const th = thresholds.get(dim.id) ?? ([Infinity, Infinity] as ActionThresholds);
  return (f) => ({
    index: bucketForCount(f.actionCounts?.[dim.id] ?? 0, th),
    bucketCount: ACTION_BUCKET_COUNT,
  });
}

function splitXYZ(xyz: Float32Array, n: number): { x: Float32Array; y: Float32Array; z: Float32Array } {
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = xyz[i * 3];
    y[i] = xyz[i * 3 + 1];
    z[i] = xyz[i * 3 + 2];
  }
  return { x, y, z };
}

/**
 * Build per-dimension TargetArrays for the given catalog dimensions. Action
 * thresholds are precomputed once over the feature set (spec §8: one pass).
 */
export function buildCatalogTargets(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
  radius: number = ANCHOR_RADIUS,
): TargetArrays {
  const n = features.length;
  const actionIds = dims.filter((d) => d.family === "activity").map((d) => d.id);
  const thresholds = computeActionThresholds(features, actionIds);
  const out: TargetArrays = {};
  for (const dim of dims) {
    let xyz: Float32Array;
    if (dim.kind === "ordinal") {
      xyz = computeOrdinalRampTarget(features, dim, bucketerFor(dim, thresholds), radius);
    } else if (dim.kind === "multiHot") {
      xyz = computeCatalogMultiHotTarget(features, dim, radius);
    } else {
      xyz = computeCatalogCategoricalTarget(features, dim, radius); // categorical | binary
    }
    out[dim.id] = splitXYZ(xyz, n);
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/catalogTargets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the featureTargets tests to confirm the export change is harmless**

Run: `npx vitest run app/(dashboard)/users/access-analysis/featureTargets.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 7: Commit**

```bash
git diff --cached --name-only   # MUST be empty
git add "app/(dashboard)/users/access-analysis/featureTargets.ts" "app/(dashboard)/users/access-analysis/catalogTargets.ts" "app/(dashboard)/users/access-analysis/catalogTargets.test.ts"
git diff --cached --name-only   # confirm ONLY these three
git commit -m "feat(acc-positioning): catalog-driven targets + ordinal ramp (categorical/multiHot/ordinal dispatch)"
```

---

## Task 3: Catalog-driven weights (`catalogWeights.ts`)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/catalogWeights.ts`
- Test: `app/(dashboard)/users/access-analysis/catalogWeights.test.ts`

Per-node, slider-independent force weight = `confidence × availability`. Spec §10 rule: for enabled **ordinal** dims, availability is **1 for all nodes** (count 0 = an exact `none`, a real pole), so confidence only *scales* influence — it never removes a node. Categorical/multiHot keep the availability gate (no value → weight 0 → no pull toward a pole the node has no value for).

- [ ] **Step 1: Write the failing test**

```ts
// app/(dashboard)/users/access-analysis/catalogWeights.test.ts
import { describe, it, expect } from "vitest";
import { buildCatalogWeights } from "./catalogWeights";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const node = (p: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot => p as unknown as NodeFeatureSnapshot;
const dim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x", label: "X", family: "structure", kind: "categorical", source: "t",
  confidence: "high", available: true, surfaces: ["slider"], extract: () => null, ...over,
});

describe("catalogWeights", () => {
  it("confidence scales weight: high=1, medium=0.7, low=0.4", () => {
    const features = [node({ project: "A" })];
    const hi = buildCatalogWeights(features, [dim({ id: "h", confidence: "high", extract: () => "A" })]);
    const me = buildCatalogWeights(features, [dim({ id: "m", confidence: "medium", extract: () => "A" })]);
    const lo = buildCatalogWeights(features, [dim({ id: "l", confidence: "low", extract: () => "A" })]);
    expect(hi["h"][0]).toBeCloseTo(1, 6);
    expect(me["m"][0]).toBeCloseTo(0.7, 6);
    expect(lo["l"][0]).toBeCloseTo(0.4, 6);
  });

  it("ordinal: availability is 1 for ALL nodes (count 0 is a real 'none')", () => {
    const d = dim({ id: "view", kind: "ordinal", family: "activity", confidence: "medium", extract: (f) => f.actionCounts?.["view"] ?? 0 });
    const features = [node({ actionCounts: {} }), node({ actionCounts: { view: 9 } })];
    const w = buildCatalogWeights(features, [d])["view"];
    expect(w[0]).toBeCloseTo(0.7, 6); // count 0 still weighted (none = real pole)
    expect(w[1]).toBeCloseTo(0.7, 6);
  });

  it("categorical: a node with no value (null) gets weight 0 (availability gate)", () => {
    const d = dim({ id: "project", kind: "categorical", confidence: "high", extract: (f) => f.project ?? null });
    const features = [node({ project: "A" }), node({})];
    const w = buildCatalogWeights(features, [d])["project"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBe(0);
  });

  it("multiHot: empty signature → weight 0 (matches the centroid origin gate)", () => {
    const d = dim({ id: "moduleAccess", kind: "multiHot", confidence: "high", extract: (f) => (f.moduleSignature ?? []) as string[] });
    const features = [node({ moduleSignature: ["build"] }), node({ moduleSignature: [] })];
    const w = buildCatalogWeights(features, [d])["moduleAccess"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBe(0);
  });

  it("binary: always weighted (admin/member are both real poles)", () => {
    const d = dim({ id: "admin", kind: "binary", confidence: "high", extract: (f) => (f.isAdmin ? "admin" : "member") });
    const features = [node({ isAdmin: true }), node({ isAdmin: false })];
    const w = buildCatalogWeights(features, [d])["admin"];
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/catalogWeights.test.ts`
Expected: FAIL — `Cannot find module './catalogWeights'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/(dashboard)/users/access-analysis/catalogWeights.ts
/**
 * catalogWeights.ts — Catalog-driven, slider-independent per-node force weights.
 *
 *   weight(d,n) = confidence(d) × availability(d,n)
 *
 * `sliderNorm` is applied live in the physics layer (not here). Spec §10: for an
 * enabled ORDINAL dim, availability is 1 for ALL nodes (count 0 = exact "none", a
 * real pole) so confidence only scales influence and never removes a node.
 * Categorical/multiHot keep the availability gate so a node with no value is never
 * dragged to a pole it has no value for.
 *
 * Pure: no React/DOM/IO. UNWIRED in Phase D (Phase E swaps it into the shell).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension, DimConfidence } from "./dimensionCatalog.types";

const CONFIDENCE_FACTOR: Record<DimConfidence, number> = { high: 1, medium: 0.7, low: 0.4 };

function availability(dim: CatalogDimension, f: NodeFeatureSnapshot): 0 | 1 {
  // Ordinal & binary dims position every node (none/false are real poles).
  if (dim.kind === "ordinal" || dim.kind === "binary") return 1;
  const v = dim.extract(f);
  if (v == null) return 0;
  if (Array.isArray(v)) return v.length ? 1 : 0;
  if (typeof v === "string") return v === "(none)" ? 0 : 1;
  return 1;
}

export function buildCatalogWeights(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const dim of dims) {
    const conf = CONFIDENCE_FACTOR[dim.confidence];
    const arr = new Float32Array(features.length);
    for (let i = 0; i < features.length; i++) arr[i] = conf * availability(dim, features[i]);
    out[dim.id] = arr;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/catalogWeights.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only   # MUST be empty
git add "app/(dashboard)/users/access-analysis/catalogWeights.ts" "app/(dashboard)/users/access-analysis/catalogWeights.test.ts"
git diff --cached --name-only   # confirm ONLY these two
git commit -m "feat(acc-positioning): catalog-driven per-node weights (confidence x availability; ordinal always positioned)"
```

---

## Task 4: Decouple color from the 2D layout (LIVE change)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Test: `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` (add one test)

Today the shell builds `clusterAssignment` from `colorMode` and passes `clusterIds` into `GraphCanvas`. With `clusterIds` present, `GraphCanvas2D` uses `mapClusterForceConfig()` + `computeClusterAnchors(...clusterIds...)` → **the 2D cloud clusters by color group**, and the slider-anchor path is gated OFF (`GraphCanvas.tsx:291`). Removing `clusterIds` makes the slider-anchor per-node path take over; color stays a pure recolor via `nodeColors`.

- [ ] **Step 1: Write the failing component guard test**

Add this test inside the existing `describe("GraphCanvas2D — GPU simulation mode", ...)` block in `GraphCanvas.test.ts` (it reuses the file's existing `setupGpuHandle` / `_capturedConfig` / `_clusterCalls` harness):

```ts
  it("GPU-decouple: with NO clusterIds, 2D uses the slider force config (not cluster mode)", async () => {
    await setupGpuHandle(3); // no clusterProps → clusterIds undefined
    // Cluster mode would pin simulationCluster to the fixed 0.5 (see GPU-4); the
    // slider-driven path (mapForceConfig) yields the slider-derived value instead.
    expect(_capturedConfig.simulationCluster).not.toBe(0.5);
    // Nodes stay one-per-node (no color grouping) so color never collapses clumps.
    expect(_clusterCalls.at(-1)).toEqual([0, 1, 2]);
  });
```

- [ ] **Step 2: Run the test to verify it passes ALREADY (the per-node path exists)**

Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas.test.ts -t "GPU-decouple"`
Expected: PASS. (The per-node slider path already works — this test pins it as the contract before we change the shell to always use it.)

> Note: this is a *guard* test for an existing-but-dormant path, so it is green immediately. The behavior change is the shell edit below; the test ensures no future change re-introduces color into the 2D force config.

- [ ] **Step 3: Edit the shell — stop deriving layout from color**

In `AccessAnalysisShell.tsx`:

Change the import (line 38) from:
```ts
import { buildNodeColors, buildClusterAssignment, type ColorMode } from "./nodeColors";
```
to:
```ts
import { buildNodeColors, type ColorMode } from "./nodeColors";
```

Delete the `clusterAssignment` memo (lines 111–115):
```ts
  // Per-node cluster index (color-group) for the 2D GPU graph's discrete clumps.
  const clusterAssignment = useMemo(
    () => buildClusterAssignment(features, colorMode),
    [features, colorMode],
  );
```

Remove the `clusterIds` prop from `<GraphCanvas>` (line 187):
```ts
              clusterIds={clusterAssignment.clusterIds}
```
(delete that single line — `nodeColors` stays; the 2D graph now clusters by sliders.)

- [ ] **Step 4: Verify the shell still type-checks and the graph suite is green**

Run: `npx tsc --noEmit`
Expected: 0 errors (no remaining references to `clusterAssignment` / `buildClusterAssignment`).

Run: `npx vitest run app/(dashboard)/users/access-analysis/GraphCanvas.test.ts`
Expected: PASS (including the new GPU-decouple test; the GPU-4 cluster-mode tests still pass because they pass `clusterIds` explicitly).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only   # MUST be empty
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"
git diff --cached --name-only   # confirm ONLY these two
git commit -m "feat(acc-positioning): decouple color from 2D layout (cluster by sliders; color is pure recolor)"
```

---

## Task 5: Calibration hook + cache-key bump (`sliderCalibration.ts`)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/sliderCalibration.ts`
- Test: `app/(dashboard)/users/access-analysis/sliderCalibration.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts` (one line)
- Modify: `app/(dashboard)/users/access-analysis/positionsCache.ts` (`LAYOUT_VERSION`)

A force sim saturates (most visible motion happens in the first slider increments). This adds a single, deterministic response-curve hook used by the physics strength mapping. It **defaults to identity** (`GAMMA=1` → no behavior change); Task 6's probe tunes it only if it reveals front-loading. Same slider value → same eased value → same positions (no snap). The cache version is bumped because the new engine + the possibility of a tuned curve change the *meaning* of cached positions.

- [ ] **Step 1: Write the failing test**

```ts
// app/(dashboard)/users/access-analysis/sliderCalibration.test.ts
import { describe, it, expect } from "vitest";
import { calibrateSliderResponse, SLIDER_RESPONSE_GAMMA } from "./sliderCalibration";

describe("sliderCalibration", () => {
  it("is monotonic non-decreasing across 0..1", () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = calibrateSliderResponse(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("fixes the endpoints: 0→0 and 1→1 (no dead zone at the top, full at max)", () => {
    expect(calibrateSliderResponse(0)).toBe(0);
    expect(calibrateSliderResponse(1)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    expect(calibrateSliderResponse(-0.5)).toBe(0);
    expect(calibrateSliderResponse(2)).toBe(1);
  });

  it("default gamma is identity (no behavior change until tuned)", () => {
    expect(SLIDER_RESPONSE_GAMMA).toBe(1);
    expect(calibrateSliderResponse(0.5)).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/sliderCalibration.test.ts`
Expected: FAIL — `Cannot find module './sliderCalibration'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/(dashboard)/users/access-analysis/sliderCalibration.ts
/**
 * sliderCalibration.ts — Perceptual slider→force response curve (Phase D).
 *
 * A force sim saturates: most visible cluster separation happens in the first
 * slider increments. This maps the raw normalized slider (0..1) to an eased value
 * used for the per-node force pull so each 10-pt step yields a more even increment
 * in separation (spec §10.4). Tuned empirically by the acc-positioning calibration
 * probe. GAMMA > 1 is convex → delays motion → evens out late steps.
 *
 * Default GAMMA = 1 → identity (no behavior change) until the probe sets it.
 * Pure & deterministic: same input → same output, so cached positions never "snap".
 */
export const SLIDER_RESPONSE_GAMMA = 1; // tuned by tests/e2e/acc-positioning.spec.ts

export function calibrateSliderResponse(norm: number): number {
  const n = Math.min(1, Math.max(0, norm));
  return SLIDER_RESPONSE_GAMMA === 1 ? n : Math.pow(n, SLIDER_RESPONSE_GAMMA);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/sliderCalibration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the hook into the physics strength mapping**

In `physicsLayer.ts`, add the import near the other local imports at the top of the file:
```ts
import { calibrateSliderResponse } from "./sliderCalibration";
```

In `applySliderForces` (the line that currently reads `const base = sv * STRENGTH_AT_ONE;`, ~line 344), change it to:
```ts
    const base = calibrateSliderResponse(sv) * STRENGTH_AT_ONE;
```
(With `GAMMA=1` this is identical to today; it becomes the single tuning point for Task 6.)

- [ ] **Step 6: Bump the layout cache version**

In `positionsCache.ts`, change `LAYOUT_VERSION` (line 11) from:
```ts
export const LAYOUT_VERSION = "feature-targets-v1";
```
to:
```ts
export const LAYOUT_VERSION = "feature-targets-v2";
```
Update the adjacent comment to note: `v2`: Phase D positioning engine + perceptual slider-response calibration; invalidates v1 positions.

- [ ] **Step 7: Add a cache-key exactness guard test**

Append to `positionsCache.test.ts` (or create it if absent) a test asserting the slider key never collapses distinct slider values (the "no snap" guarantee) and is stable for equal values:

```ts
import { hashNodeSetAndSliders } from "./positionsCache";

describe("hashNodeSetAndSliders — exact-slider key (no snap)", () => {
  const ids = ["a::p", "b::p"];
  it("different slider values → different hashes (intermediate positions never collide)", () => {
    const h10 = hashNodeSetAndSliders(ids, { project: 0.1 });
    const h11 = hashNodeSetAndSliders(ids, { project: 0.11 });
    expect(h10).not.toBe(h11);
  });
  it("identical slider state → identical hash (cache hit)", () => {
    expect(hashNodeSetAndSliders(ids, { project: 0.37 })).toBe(
      hashNodeSetAndSliders(ids, { project: 0.37 }),
    );
  });
});
```

- [ ] **Step 8: Run the affected unit suites**

Run: `npx vitest run app/(dashboard)/users/access-analysis/sliderCalibration.test.ts app/(dashboard)/users/access-analysis/positionsCache.test.ts app/(dashboard)/users/access-analysis/physicsLayer.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git diff --cached --name-only   # MUST be empty
git add "app/(dashboard)/users/access-analysis/sliderCalibration.ts" "app/(dashboard)/users/access-analysis/sliderCalibration.test.ts" "app/(dashboard)/users/access-analysis/physicsLayer.ts" "app/(dashboard)/users/access-analysis/positionsCache.ts" "app/(dashboard)/users/access-analysis/positionsCache.test.ts"
git diff --cached --name-only   # confirm ONLY these five
git commit -m "feat(acc-positioning): perceptual slider-response hook + LAYOUT_VERSION v2 + exact-key guard"
```

---

## Task 6: Calibration probe + color-independence e2e (`tests/e2e/acc-positioning.spec.ts`)

**Files:**
- Create: `tests/e2e/acc-positioning.spec.ts`
- (Conditional) Modify: `app/(dashboard)/users/access-analysis/sliderCalibration.ts` + `positionsCache.ts` — only if the probe reveals front-loading.

The probe sweeps the **Project** slider 0→100 in **3D** (where `physics.getPositions()` is the rendered layout) and reads `getClusteringScore("project").ratio` at each 10-pt step via the existing `window.__ACC_GRAPH_TEST__` bridge. It asserts the three smoothness guarantees (spec §10) and a perceptual-evenness check. A color-independence test asserts switching the color dropdown never moves nodes. A 2D smoke proofs the new cluster-by-slider behavior.

> Probe runs require the e2e server. Mirrors `tests/e2e/acc-dc-graph.spec.ts` (port `:3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, minted-cookie auth). This spec carries its own minimal helpers so it is self-contained.

- [ ] **Step 1: Write the probe spec**

```ts
// tests/e2e/acc-positioning.spec.ts
import { test, expect, type Page } from "@playwright/test";

const GRAPH_URL = "/users/access-analysis";

type Bridge = {
  isReady(): boolean;
  getMode(): "2d" | "3d";
  getPositionsStats(): { count: number; anyNaN: boolean; maxAbs: number; center: [number, number, number] };
  getClusteringScore(dim: string): { ratio: number; sameMean: number; crossMean: number; sampledPairs: number };
  getColorMode(): string;
};
declare global {
  interface Window { __ACC_GRAPH_TEST__?: Bridge }
}

async function gotoGraph(page: Page): Promise<void> {
  await page.goto(GRAPH_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ACC_GRAPH_TEST__?.isReady(), undefined, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const b = window.__ACC_GRAPH_TEST__;
    if (!b) return false;
    const s = b.getPositionsStats();
    return s.count > 0 && !s.anyNaN && s.maxAbs > 1;
  }, undefined, { timeout: 90_000 });
}

/** Switch to 3D so physics.getPositions() === the rendered cloud. */
async function switchTo3D(page: Page): Promise<void> {
  if (await page.evaluate(() => window.__ACC_GRAPH_TEST__?.getMode()) === "3d") return;
  await page.getByTestId("toolbar-mode-toggle").click();
  await page.waitForFunction(() => window.__ACC_GRAPH_TEST__?.getMode() === "3d", undefined, { timeout: 30_000 });
  await page.waitForFunction(() => (window.__ACC_GRAPH_TEST__?.getPositionsStats().maxAbs ?? 0) > 1, undefined, { timeout: 60_000 });
}

/** Drive the Project slider to an exact value via keyboard, reading aria-valuenow. */
async function setProjectSlider(page: Page, target: number): Promise<void> {
  const thumb = page.getByLabel("Project thumb");
  await thumb.focus();
  const read = async () => Number(await thumb.getAttribute("aria-valuenow"));
  let cur = await read();
  let guard = 0;
  while (cur < target && guard++ < 250) { await page.keyboard.press("ArrowRight"); cur = await read(); }
  while (cur > target && guard++ < 250) { await page.keyboard.press("ArrowLeft"); cur = await read(); }
}

async function ratioAt(page: Page, value: number): Promise<number> {
  await setProjectSlider(page, value);
  await page.waitForTimeout(1_200); // let the rAF-coalesced reheat settle partway
  return page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("project").ratio);
}

test.describe("ACC positioning — slider smoothness + color independence", () => {
  test("project slider 0→100 separates smoothly: no dead zone, monotonic, even-ish", async ({ page }, testInfo) => {
    await gotoGraph(page);
    await switchTo3D(page);

    const samples: Array<{ v: number; ratio: number }> = [];
    for (const v of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      samples.push({ v, ratio: await ratioAt(page, v) });
    }
    await testInfo.attach("separation-curve", {
      body: Buffer.from(JSON.stringify(samples, null, 2)),
      contentType: "application/json",
    });

    const r0 = samples[0].ratio;       // slider 0 (baseline)
    const r10 = samples[1].ratio;      // slider 10 (first step)
    const r100 = samples[10].ratio;    // slider 100 (max)

    // Guarantee 1 — no dead zone: the first 10-pt step already increases separation.
    expect(r10).toBeGreaterThan(r0 * 1.02);
    // Engaged sliders cluster: max is clearly more separated than rest.
    expect(r100).toBeGreaterThan(r0 * 1.2);
    // Monotonic-ish: no large regression between consecutive steps (force jitter ≤ 15%).
    for (let i = 2; i < samples.length; i++) {
      expect(samples[i].ratio).toBeGreaterThan(samples[i - 1].ratio * 0.85);
    }
    // Perceptual evenness (spec §10.4): the second half of the sweep (50→100) still
    // contributes meaningful separation — not all motion is front-loaded into 0→50.
    const firstHalf = samples[5].ratio - samples[0].ratio;   // 0→50
    const secondHalf = samples[10].ratio - samples[5].ratio; // 50→100
    expect(secondHalf).toBeGreaterThan(firstHalf * 0.33);
  });

  test("color is a pure overlay: switching 'Color by' never moves nodes (3D)", async ({ page }) => {
    await gotoGraph(page);
    await switchTo3D(page);
    await setProjectSlider(page, 60);
    await page.waitForTimeout(1_500);
    const before = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());

    // Flip the color dropdown to a different attribute.
    const select = page.getByTestId("toolbar-color-mode");
    await select.selectOption({ index: 1 });
    await expect
      .poll(() => page.evaluate(() => window.__ACC_GRAPH_TEST__!.getColorMode()))
      .not.toBe("role");
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    // Positions are byte-stable: color never touches the physics/positions bus.
    expect(after.maxAbs).toBeCloseTo(before.maxAbs, 3);
    expect(after.center[0]).toBeCloseTo(before.center[0], 3);
    expect(after.center[1]).toBeCloseTo(before.center[1], 3);
  });

  test("2D clusters by sliders (color-decoupled) without crashing", async ({ page }, testInfo) => {
    await gotoGraph(page); // default mode is 2D
    await setProjectSlider(page, 100);
    await page.waitForTimeout(1_500);
    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    expect(pos.anyNaN).toBe(false);
    expect(pos.count).toBeGreaterThan(0);
    await expect(page.locator("canvas").first()).toBeVisible();
    const body = await page.screenshot({ fullPage: false });
    await testInfo.attach("2d-cluster-by-slider", { body, contentType: "image/png" });
  });
});
```

- [ ] **Step 2: Run the probe**

Run: `npx playwright test tests/e2e/acc-positioning.spec.ts`
Expected: all 3 tests PASS. The separation-curve JSON is attached to the HTML report.

> If the machine is under load, an isolated single-boot timeout is a known flake on this PC (see project memory "Lasso e2e load flake") — re-run on an idle machine before treating a timeout as a failure. A logic failure is a real signal; a 120s-budget timeout under load is not.

- [ ] **Step 3: Tune ONLY if the smoothness test fails on `secondHalf`/`no-dead-zone`**

Decision rule:
- If `secondHalf < firstHalf * 0.33` (motion front-loaded): raise `SLIDER_RESPONSE_GAMMA` in `sliderCalibration.ts` (try `1.6`, then `2.2`), and bump `LAYOUT_VERSION` again (`feature-targets-v2` → `-v3`) so positions recompute. Re-run Step 2. Repeat until the curve passes.
- If `r10 <= r0 * 1.02` (dead zone at the bottom): lower `STRENGTH_AT_ONE`'s reheat floor is NOT in scope — instead try `GAMMA` *below* 1 (e.g. `0.8`) to front-load *more* responsiveness at the low end, then re-check the evenness assertion. Re-run.
- If the probe passes at `GAMMA=1`: leave it identity (the current physics response is already acceptable) — no further change.

If you change `GAMMA`/`LAYOUT_VERSION`, re-run the Task 5 unit suite (`sliderCalibration.test.ts`) and update the `SLIDER_RESPONSE_GAMMA` assertion if you changed the default.

- [ ] **Step 4: Commit**

```bash
git diff --cached --name-only   # MUST be empty
# Always include the spec; include the two tuning files ONLY if Step 3 changed them.
git add "tests/e2e/acc-positioning.spec.ts"
# (if tuned:) git add "app/(dashboard)/users/access-analysis/sliderCalibration.ts" "app/(dashboard)/users/access-analysis/positionsCache.ts"
git diff --cached --name-only   # confirm ONLY the intended files
git commit -m "test(acc-positioning): slider 0->100 calibration probe + color-independence + 2D cluster-by-slider e2e"
```

---

## Task 7: Full-suite gates

**Files:** none (verification only).

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: PASS — full suite green (prior baseline 1272 + the ~21 new tests from Tasks 1–5).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: E2E suite**

Run: `npm run test:e2e`
Expected: existing access-analysis suite green (lasso load-flake excepted per memory) + the 3 new `acc-positioning` tests green.

- [ ] **Step 4: Confirm scope was respected (negative checks)**

Run: `git diff deploy --name-only -- "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/dimensionGroups.ts" "app/(dashboard)/users/access-analysis/SliderContext.tsx" "app/(dashboard)/users/access-analysis/dimensionWeights.ts"`
Expected: **empty** — none of the legacy/UI files were touched (those are Phase E).

- [ ] **Step 5: Report**

Summarize: gates (unit / tsc / e2e counts), the final `SLIDER_RESPONSE_GAMMA` value + whether `LAYOUT_VERSION` ended at `v2` or higher, the separation-curve numbers from the probe, and confirmation that the engine modules are pure + unwired (ready for Phase E to flip live). Note that the legacy registry was intentionally NOT removed (consumers migrate in Phase E).

---

## Self-Review

**1. Spec coverage (§10 + §16.D):**
- "Ordinal-ramp anchors" → Task 2 (`computeOrdinalRampTarget` + `bucketerFor`). ✅
- "Per-action quantile buckets (none/low/med/high)" (deferred from §8/Phase B) → Task 1. ✅
- "Every node positioned; `none` is a real pole; confidence tunes but never zeroes an enabled ordinal dim" → Task 2 (ramp places none at the −pole) + Task 3 (ordinal availability ≡ 1). ✅
- "Categorical Fibonacci vs ordinal ramp" → Task 2 dispatch by `kind`. ✅
- "Per-node weight = confidence × availability" → Task 3. ✅
- "Smooth 0→100: linear pull / no dead zone / no snap / perceptual calibration" → Task 5 (calibration hook, exact-key guard) + Task 6 (probe + tuning). ✅
- "Exact-slider cache key" → Task 5 Step 7 (already 2dp = native granularity; guard test added) + `LAYOUT_VERSION` bump. ✅
- "Decouple color from layout — clustering uses slider-weighted anchors directly" → Task 4 (remove `clusterIds`) + GPU-decouple guard + color-independence e2e. ✅
- Owner's Option-A boundary (engine pure+unwired; only color-fix live; no registry removal; no slider-id changes) → Scope section + Task 7 Step 4 negative check. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step shows complete code; the one empirical step (Task 6 Step 3 tuning) is a concrete decision rule with specific constants and a stop condition, not a placeholder. ✅

**3. Type consistency:**
- `ActionThresholds` / `bucketForCount` / `ACTION_BUCKET_COUNT` defined in Task 1, consumed identically in Task 2. ✅
- `CatalogDimension` / `DimConfidence` imported from `dimensionCatalog.types` (matches the real export at `dimensionCatalog.types.ts:12,6`). ✅
- `TargetArrays` shape `Record<id, {x,y,z}>` matches `physicsLayer` + `featureTargets.buildFeatureTargets`. ✅
- `volumetricAnchor` / `ANCHOR_RADIUS` exported in Task 2 Step 1, consumed in `catalogTargets.ts`. ✅
- `calibrateSliderResponse` created in Task 5 Step 3, imported in `physicsLayer.ts` Step 5. ✅
- Bridge methods used by the probe (`isReady`, `getMode`, `getPositionsStats`, `getClusteringScore`, `getColorMode`) all exist on the real `graphTestBridge.ts` surface (lines 256–289, 406). ✅
- Selectors (`Project thumb`, `toolbar-mode-toggle`, `toolbar-color-mode`) verified against `SliderSidebar`/`Toolbar.tsx`. ✅

**Open risk flagged for execution:** In 2D GPU mode `physics.getPositions()` may not reflect the GPU sim (the position pump is skipped, `GraphCanvas.tsx:273`), which is why the calibration + color-independence probes run in **3D**. If a future change makes 3D physics positions diverge from the d3 worker, revisit the probe's measurement basis.
