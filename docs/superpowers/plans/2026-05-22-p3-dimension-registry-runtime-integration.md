# P3 — Dimension Registry Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One task = one subagent. Only touch the files listed for that task. Run the task's tests before committing. Stop if any test fails.**

**Goal:** Make `dimensionRegistry.ts` the single source of truth for the dimensions the runtime already uses (slider state + layout targets + per-node force weighting), without expanding to the full 50+ advanced slider UI.

**Architecture:** The registry already describes every dimension (id, family, type, source, availability, defaultWeight, confidence, `extract`, `isAvailable`). P3 adds a thin **runtime view** of the registry (`RUNTIME_DIMENSION_IDS` + helpers), then rewires the three consumers to read from it: (1) `SliderContext` derives its dimension list + default slider values from registry descriptors; (2) `featureTargets` derives a node's categorical value from `descriptor.extract` and gains a multi-hot anchor builder; (3) `physicsLayer` multiplies each dimension's force strength by a precomputed slider-independent per-node weight (`confidence × availability × transformer`) supplied by the caller — keeping the physics module pure and the two-bus model intact. The only id reconciliation is `isExternal` → `internalExternal`, with a one-time localStorage migration.

**Tech Stack:** TypeScript, Vitest, React (client context), d3-force-3d. Pure modules (`dimensionRegistry`, `featureTargets`, new `dimensionWeights`, `physicsLayer`) keep the no-React/DOM/I/O discipline.

**Backed by:**
- `docs/superpowers/specs/2026-05-21-access-analysis-dimension-taxonomy.md` (§14 universal weighting model; §15 visual-form coverage)
- `docs/superpowers/plans/2026-05-22-p2-dimension-registry-foundation.md` (the foundation this builds on)

---

## Scope guardrails

**In scope:** registry runtime view; `SliderContext` + `featureTargets` + `physicsLayer` read the registry; per-node availability/confidence weighting; `isExternal`→`internalExternal` reconciliation + migration; multi-hot target for `module`; 0/100-per-dimension tests; a blocking 3D-color verification gate.

**Preserve:** node = UserProjectInstance (`userId::projectId`); the existing 6 runtime sliders (no new visible sliders); the two-bus model (PHYSICS vs MASK); the volumetric spherical-Fibonacci anchor layout; WS2 2D/3D edges; the renderer stack; the UAT-approved organic default profile.

**Do NOT touch (explicit from the P3 brief):** lasso, camera, nav/routes, `UserDetailPanel`, new edge layers, renderer replacement, UMAP/ForceAtlas/React-Force-Graph spikes, the full advanced slider UI. Also untouched: `graphTables.ts` data feed, `membershipAge`/`addedOn`, `activityMix`/`permStrength`/`riskScore` derived dims.

---

## Key design decisions (please confirm at approval)

1. **`defaultWeight` → default slider value (DRY), not a runtime re-multiplier.** The current `DEFAULT_VALUES` are *exactly* the registry `defaultWeight`s ×100. So the base weight is already expressed as the default slider position. The live per-node force weight is therefore `sliderNorm × confidence × availability × transformer` — base is **not** multiplied again (that would double-count). `DEFAULT_VALUES` is derived from the registry instead of hardcoded.

2. **`isExternal` → `internalExternal`.** The runtime dimension id is renamed to match the registry (the snapshot boolean field `f.isExternal` is untouched). A one-time localStorage migration maps any persisted `isExternal` slider value to `internalExternal`. This makes the registry genuinely authoritative rather than aliased.

3. **`confidence` enters runtime weighting.** Faithful to §14, low-confidence dims (signin ×0.4; tier/activity ×0.7) contribute proportionally less force at the same slider value. Expected visual delta: signin/activity nudge slightly less. Verified by `physicsClustering` regression. If you'd rather defer confidence and ship availability-only first, that's a one-line change in `buildDimensionWeights` — flagged in P3.4.

4. **`module` is exposed as *target-capable* but stays out of the default visible slider set.** Its multi-hot anchor builder lands and it's registered in the runtime weighting/target path, but it is NOT added to the 6 visible sliders (no UI chaos). The advanced UI (later phase) flips one flag to surface it.

---

## File Structure

- **Modify** `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` — add `RUNTIME_DIMENSION_IDS`, `getRuntimeDimensions()`, `runtimeDefaultSliders()`, `MULTI_HOT_DIMENSION_IDS`. Pure additions; the existing descriptor array is unchanged.
- **Create** `app/(dashboard)/users/access-analysis/dimensionWeights.ts` — pure `buildDimensionWeights(features, dims)` → `Record<dimId, Float32Array>` of slider-independent per-node weights (`confidence × availability × transformer`).
- **Create** `app/(dashboard)/users/access-analysis/__tests__/dimensionWeights.test.ts`.
- **Modify** `app/(dashboard)/users/access-analysis/featureTargets.ts` — delegate `categoryValue` to `descriptor.extract`; switch `TARGET_DIMENSIONS` to the registry runtime ids; add `computeMultiHotTarget` for `module`.
- **Modify** `app/(dashboard)/users/access-analysis/featureTargets.test.ts` — id rename + multi-hot cases.
- **Modify** `app/(dashboard)/users/access-analysis/SliderContext.tsx` — derive `DIMENSIONS` + `DEFAULT_VALUES` from the registry; add the `isExternal`→`internalExternal` localStorage migration.
- **Modify** `app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx` — registry-derived assertions + migration test.
- **Modify** `app/(dashboard)/users/access-analysis/physicsLayer.ts` — accept optional `dimWeights` and fold into the per-dimension force strength accessor (PHYSICS bus only).
- **Modify** `app/(dashboard)/users/access-analysis/physicsLayer.test.ts` + `physicsClustering.test.ts` — 0/100-per-dimension + availability-gate + two-bus assertions.
- **Modify** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — build `dimWeights` and pass registry-derived dim names/targets into `createPhysicsLayer`.

---

## Task P3.0: 3D semantic node-color verification gate (BLOCKING)

**Why first:** The P3 brief makes "do 3D nodes actually show semantic colors?" a blocking gate. The renderer already writes per-instance colors (`GraphCanvas3D.writeCurrentNodeColors`, landed `caf5a4c`), so this task is a *verification with a contingency*: prove it with a test + a manual visual check; only if it fails does it become a bugfix that blocks the rest of P3.

**Files:**
- Test: `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts`

- [ ] **Step 1: Add a render-state test that distinct semantic colors reach the instance buffer**

Append to the `describe("GraphCanvas3D — …")` block in `GraphCanvas3D.test.ts`:

```ts
  // P3.0 gate: distinct semantic colors actually reach the per-instance buffer.
  it("P3.0: distinct node colors populate the instanceColor buffer (>1 distinct)", () => {
    const physics = makeFakePhysics(3);
    const containerRef = makeContainerRef();
    let handle: any = null;
    // three distinct semantic colors (red / green / blue), alpha 1
    const nodeColors = new Float32Array([
      1, 0, 0, 1,
      0, 1, 0, 1,
      0, 0, 1, 1,
    ]);
    render(
      React.createElement(GraphCanvas3D, {
        containerRef,
        physics,
        nodeColors,
        backgroundColor: "#09090B",
        onHandleReady: (h: any) => { handle = h; },
      })
    );
    const rs = handle!.getRenderState();
    expect(rs.nodeColorNodeCount).toBe(3);
    expect(rs.nodeColorDistinctColors).toBeGreaterThan(1);
    expect(rs.nodeColorAllFinite).toBe(true);
    expect(rs.nodeColorNeedsUpdate).toBe(true);
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run GraphCanvas3D`
Expected: PASS. `getRenderState()` already exposes `nodeColorDistinctColors`/`nodeColorAllFinite`, and the mesh mock records `instanceColor`.

- [ ] **Step 3: Manual visual confirmation (records evidence, does not block on a passing test)**

The dashboard runs locally (see memory: `start-local.ps1` builds + serves the current checkout on `:3000`). Open `/users/access-analysis`, switch the graph to **3D**, and confirm the spheres render in multiple colors (default color mode is `role`), not a single uniform color. Capture one screenshot to `docs/superpowers/evidence/2026-05-22-p3.0-3d-colors.png`.

- [ ] **Step 4a (PASS path): record the gate as cleared, commit the test**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts"
git commit -m "test(acc-graph): P3.0 gate — assert distinct 3D node colors reach instance buffer"
```

- [ ] **Step 4b (FAIL path — only if Step 2 or Step 3 fails): fix BEFORE any other P3 task**

If colors are uniform/absent, the likely cause is one of: (a) `material.vertexColors` not honored with `instanceColor` in three r184, (b) `mesh.instanceColor.needsUpdate` not set after `writeCurrentNodeColors`, or (c) the `setColors` effect not firing on `props.nodeColors` change. Use **superpowers:systematic-debugging**: write the failing assertion first, find the root cause, fix `GraphCanvas3D.tsx`, re-run Step 2 + Step 3, then commit. Do not start P3.1 until this is green.

---

## Task P3.1: Registry runtime view (source-of-truth helpers)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `dimensionRegistry.test.ts`:

```ts
import {
  RUNTIME_DIMENSION_IDS,
  MULTI_HOT_DIMENSION_IDS,
  getRuntimeDimensions,
  runtimeDefaultSliders,
} from "../dimensionRegistry";

describe("dimension registry — runtime view", () => {
  it("RUNTIME_DIMENSION_IDS is the 6 wired runtime dims, in display order", () => {
    expect(RUNTIME_DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "activity", "signin",
    ]);
  });

  it("every runtime id resolves to a registered descriptor", () => {
    for (const id of RUNTIME_DIMENSION_IDS) {
      expect(getDimension(id)).toBeDefined();
    }
  });

  it("getRuntimeDimensions returns descriptors in RUNTIME_DIMENSION_IDS order", () => {
    expect(getRuntimeDimensions().map((d) => d.id)).toEqual([...RUNTIME_DIMENSION_IDS]);
  });

  it("runtimeDefaultSliders maps defaultWeight×100 to each runtime id", () => {
    expect(runtimeDefaultSliders()).toEqual({
      project: 35, role: 25, tier: 15, internalExternal: 10, activity: 5, signin: 5,
    });
  });

  it("MULTI_HOT_DIMENSION_IDS contains the multi-hot dims (module)", () => {
    expect(MULTI_HOT_DIMENSION_IDS).toContain("module");
    // every entry is genuinely typed multi-hot in the registry
    for (const id of MULTI_HOT_DIMENSION_IDS) {
      expect(getDimension(id)!.type).toBe("multi-hot");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionRegistry`
Expected: FAIL — `RUNTIME_DIMENSION_IDS`/`getRuntimeDimensions`/`runtimeDefaultSliders`/`MULTI_HOT_DIMENSION_IDS` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `dimensionRegistry.ts` (after `DIMENSION_IDS`):

```ts
/**
 * The dimensions wired into the LIVE runtime today (slider state + layout targets
 * + force weighting), in display order. This is the subset of the registry the
 * current 6-slider UI exposes — NOT the full taxonomy. The advanced UI phase widens
 * this list; until then it is the single source of truth for "what the runtime uses".
 *
 * `internalExternal` replaces the legacy `isExternal` slider id (P3 reconciliation).
 * `company`, `isAdmin`, `module` are registered but intentionally NOT in this list:
 * they are available to color/filter/target code but have no visible slider yet.
 */
export const RUNTIME_DIMENSION_IDS: readonly DimensionId[] = [
  "project",
  "role",
  "tier",
  "internalExternal",
  "activity",
  "signin",
];

/** Multi-hot dimensions need a centroid-of-active-keys anchor (not a single category anchor). */
export const MULTI_HOT_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter(
  (d) => d.type === "multi-hot",
).map((d) => d.id);

/** Runtime descriptors, resolved + ordered by RUNTIME_DIMENSION_IDS. */
export function getRuntimeDimensions(): DimensionDescriptor[] {
  return RUNTIME_DIMENSION_IDS.map((id) => {
    const d = getDimension(id);
    if (!d) throw new Error(`RUNTIME_DIMENSION_IDS references unregistered dimension: ${id}`);
    return d;
  });
}

/**
 * Default slider positions (0..100) for the runtime dims, derived from each
 * descriptor's defaultWeight (×100). This REPLACES the previously-hardcoded
 * DEFAULT_VALUES so the organic profile lives in one place (the registry).
 */
export function runtimeDefaultSliders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of getRuntimeDimensions()) out[d.id] = Math.round(d.defaultWeight * 100);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dimensionRegistry`
Expected: PASS (validity, extract, isAvailable, drift guard, module, runtime view).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts"
git commit -m "feat(acc-graph): add registry runtime view (RUNTIME_DIMENSION_IDS + defaults)"
```

---

## Task P3.2: featureTargets reads the registry (extract delegation + multi-hot)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/featureTargets.ts`
- Test: `app/(dashboard)/users/access-analysis/featureTargets.test.ts`

- [ ] **Step 1: Write the failing tests**

In `featureTargets.test.ts`, update the `categoryValue` external-dim assertion (the id is now `internalExternal`) and add a multi-hot block. Replace the `isExternal` line in the existing "maps each dimension…" test:

```ts
    expect(categoryValue(f, "internalExternal")).toBe("external");
```

Append a new block:

```ts
describe("featureTargets — registry-driven categoryValue", () => {
  it("TARGET_DIMENSIONS matches the registry runtime ids", () => {
    expect(TARGET_DIMENSIONS).toEqual([
      "project", "role", "tier", "internalExternal", "activity", "signin",
    ]);
  });

  it("categoryValue delegates to the registry descriptor.extract (coerced to string)", () => {
    const f = feature({ project: "Tower", role: "Engineer", permTier: "edit" });
    expect(categoryValue(f, "project")).toBe(getDimension("project")!.extract(f));
    expect(categoryValue(f, "role")).toBe(getDimension("role")!.extract(f));
    // null/absent coerces to a stable bucket string, never "null"
    expect(categoryValue(feature({ firmName: "" }), "internalExternal")).toBe("internal");
  });
});

describe("featureTargets — multi-hot module anchors", () => {
  it("a module-only node with shared modules converges near other same-module nodes", () => {
    const a = feature({ nodeId: "a", moduleSignature: ["build", "cost"] });
    const b = feature({ nodeId: "b", moduleSignature: ["build", "cost"] });
    const c = feature({ nodeId: "c", moduleSignature: ["takeoff"] });
    const xyz = computeMultiHotTarget([a, b, c], "module");
    // same signature → identical anchor; different signature → separated
    expect(dist3(xyz, 0, 1)).toBeCloseTo(0, 3);
    expect(dist3(xyz, 0, 2)).toBeGreaterThan(0);
  });

  it("an empty module signature anchors at the origin (no pull)", () => {
    const a = feature({ nodeId: "a", moduleSignature: [] });
    const xyz = computeMultiHotTarget([a], "module");
    expect(xyz[0]).toBe(0);
    expect(xyz[1]).toBe(0);
    expect(xyz[2]).toBe(0);
  });

  it("all anchor coordinates are finite", () => {
    const fs = [
      feature({ moduleSignature: ["build"] }),
      feature({ moduleSignature: ["build", "cost"] }),
      feature({ moduleSignature: [] }),
    ];
    expect(isFiniteArray(computeMultiHotTarget(fs, "module"))).toBe(true);
  });
});
```

Add to the imports at the top of `featureTargets.test.ts`:

```ts
import { computeMultiHotTarget } from "./featureTargets";
import { getDimension } from "./dimensionRegistry";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run featureTargets`
Expected: FAIL — `internalExternal` not in `TARGET_DIMENSIONS`; `computeMultiHotTarget` undefined.

- [ ] **Step 3: Write minimal implementation**

In `featureTargets.ts`:

Add the import (after the existing imports):

```ts
import { getDimension, MULTI_HOT_DIMENSION_IDS, type DimensionId } from "./dimensionRegistry";
```

Replace the `TargetDimensionId` type + `TARGET_DIMENSIONS` const with registry-driven definitions:

```ts
// Runtime layout dims are the registry runtime view — single source of truth.
export type TargetDimensionId = DimensionId;

export const TARGET_DIMENSIONS: readonly TargetDimensionId[] = [
  "project",
  "role",
  "tier",
  "internalExternal",
  "activity",
  "signin",
];
```

Replace the body of `categoryValue` (keep its signature) with registry delegation:

```ts
/** The categorical value a node carries for the given target dimension. */
export function categoryValue(
  f: NodeFeatureSnapshot,
  dim: TargetDimensionId,
): string {
  const d = getDimension(dim);
  const v = d ? d.extract(f) : null;
  // Coerce the registry's DimensionValue (string | string[] | number | null) to a
  // stable categorical bucket string. Arrays/null map to a single neutral bucket so
  // single-category dims keep one anchor; multi-hot dims use computeMultiHotTarget.
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("|") : "(none)";
  return "(none)";
}
```

Add the multi-hot anchor builder (after `computeDimensionTarget`):

```ts
/**
 * Multi-hot target: a node's anchor is the CENTROID of the per-key anchors for each
 * active key in its signature. Same signature → same centroid (convergence); empty
 * signature → origin (no pull, matching the availability gate). Keys are anchored on
 * the same volumetric spherical-Fibonacci set as categories, so depth is preserved.
 */
export function computeMultiHotTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: TargetDimensionId,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;

  const d = getDimension(dim);
  const keySet = new Set<string>();
  const sigs: string[][] = features.map((f) => {
    const v = d ? d.extract(f) : null;
    const keys = Array.isArray(v) ? [...v].sort() : [];
    for (const k of keys) keySet.add(k);
    return keys;
  });

  const keys = Array.from(keySet).sort();
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => keyIndex.set(k, i));
  const keyAnchors: Array<[number, number, number]> = keys.map((_, i) =>
    volumetricAnchor(i, keys.length, radius),
  );

  for (let n = 0; n < features.length; n++) {
    const sig = sigs[n];
    if (sig.length === 0) continue; // origin → no pull (availability gate)
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
```

In `buildFeatureTargets`, route multi-hot dims through `computeMultiHotTarget` (replace the single `computeDimensionTarget` call inside the loop):

```ts
  for (const dim of dims) {
    const xyz = (MULTI_HOT_DIMENSION_IDS as readonly string[]).includes(dim)
      ? computeMultiHotTarget(features, dim, radius)
      : computeDimensionTarget(features, dim, radius);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = xyz[i * 3];
      y[i] = xyz[i * 3 + 1];
      z[i] = xyz[i * 3 + 2];
    }
    out[dim] = { x, y, z };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run featureTargets`
Expected: PASS.

- [ ] **Step 5: Fix the drift-guard + clustering co-dependents**

The P2 drift-guard (`dimensionRegistry.test.ts`) pins the 5 SHARED ids; it is unaffected by the rename. But `physicsClustering.test.ts` references `isExternal` as a dim id — update those references to `internalExternal`:

Run: `npx vitest run physicsClustering`
If it fails on an `isExternal` id, replace the literal `"isExternal"` with `"internalExternal"` in that test (dim-id usages only; leave any `f.isExternal` boolean reads alone). Re-run until green.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean (note: any other file importing `TargetDimensionId` now gets the wider `DimensionId` type — this is intended; verify no narrowing breaks).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/featureTargets.ts" "app/(dashboard)/users/access-analysis/featureTargets.test.ts" "app/(dashboard)/users/access-analysis/physicsClustering.test.ts"
git commit -m "feat(acc-graph): featureTargets reads registry (extract delegation + multi-hot)"
```

---

## Task P3.3: SliderContext + shell derive from the registry (+ id migration)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `SliderContext.test.tsx`, add a registry-derivation block and a migration block:

```ts
import { DIMENSIONS, DEFAULT_VALUES, migratePersistedSliders } from "../SliderContext";
import { runtimeDefaultSliders, RUNTIME_DIMENSION_IDS } from "../dimensionRegistry";

describe("SliderContext — registry-derived dimensions", () => {
  it("DIMENSIONS ids match the registry runtime ids in order", () => {
    expect(DIMENSIONS.map((d) => d.id)).toEqual([...RUNTIME_DIMENSION_IDS]);
  });
  it("DEFAULT_VALUES equals runtimeDefaultSliders()", () => {
    expect(DEFAULT_VALUES).toEqual(runtimeDefaultSliders());
  });
  it("each DIMENSION carries the registry label", () => {
    const ext = DIMENSIONS.find((d) => d.id === "internalExternal");
    expect(ext?.label).toBe("Internal / external");
  });
});

describe("SliderContext — legacy isExternal migration", () => {
  it("maps a persisted isExternal slider value to internalExternal", () => {
    expect(migratePersistedSliders({ isExternal: 42, role: 25 })).toEqual({
      internalExternal: 42, role: 25,
    });
  });
  it("keeps internalExternal when both are present (new wins)", () => {
    expect(migratePersistedSliders({ isExternal: 10, internalExternal: 70 })).toEqual({
      internalExternal: 70,
    });
  });
  it("is a no-op when there is nothing to migrate", () => {
    expect(migratePersistedSliders({ role: 25 })).toEqual({ role: 25 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run SliderContext`
Expected: FAIL — `migratePersistedSliders` not exported; `DIMENSIONS` still has `isExternal`; `DEFAULT_VALUES` hardcoded.

- [ ] **Step 3: Write minimal implementation**

In `SliderContext.tsx`, replace the hardcoded `DIMENSIONS` + `DimensionId` + `DEFAULT_VALUES` block with registry-derived definitions:

```ts
import { getRuntimeDimensions, runtimeDefaultSliders } from "./dimensionRegistry";

// ---------------------------------------------------------------------------
// Runtime dimension list — derived from the registry (single source of truth).
// The advanced-UI phase widens RUNTIME_DIMENSION_IDS; this list follows it.
// ---------------------------------------------------------------------------

export const DIMENSIONS = getRuntimeDimensions().map((d) => ({
  id: d.id,
  label: d.label,
  // categorical/binary/multi-hot → "categorical"; temporal stays "bucket".
  kind: d.type === "temporal" ? ("bucket" as const) : ("categorical" as const),
}));

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

export const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";

/**
 * Organic default layout profile, now sourced from the registry defaultWeights
 * (×100). Structural dims lead (project > role > tier > internalExternal); behavior
 * dims (activity/signin) stay weak. Identical to the prior hardcoded profile, but
 * DRY against the registry.
 */
export const DEFAULT_VALUES: Record<DimensionId, number> =
  runtimeDefaultSliders() as Record<DimensionId, number>;

/**
 * One-time migration of persisted slider state: the legacy `isExternal` slider id
 * was renamed to `internalExternal` (registry reconciliation, P3). If a stored blob
 * still carries `isExternal`, fold its value into `internalExternal` (unless the new
 * key is already present, in which case the new value wins) and drop the legacy key.
 */
export function migratePersistedSliders(
  sliders: Record<string, number>,
): Record<string, number> {
  if (!("isExternal" in sliders)) return sliders;
  const { isExternal, ...rest } = sliders;
  if (!("internalExternal" in rest)) rest.internalExternal = isExternal;
  return rest;
}
```

Apply the migration where persisted sliders are read — in the two-pass mount effect, wrap `stored.sliders`:

```ts
    const migrated = migratePersistedSliders(stored.sliders as Record<string, number>);
    const next: Record<DimensionId, number> = { ...DEFAULT_VALUES };
    for (const dim of DIMENSIONS) {
      const v = migrated[dim.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        next[dim.id] = Math.max(0, Math.min(100, v));
      }
    }
```

- [ ] **Step 4: Update the shell's persisted-slider hydration to migrate too**

In `AccessAnalysisShell.tsx`, the loader reads the same blob into `initialSliders`. Import the migration and apply it:

Add to the SliderContext import:

```ts
import {
  CONTROLS_STORAGE_KEY,
  DEFAULT_VALUES,
  DIMENSIONS,
  migratePersistedSliders,
  SliderProvider,
  type DimensionId,
} from "./SliderContext";
```

In the `try { … parsed.sliders … }` block, migrate before reading per-dim:

```ts
              if (parsed.sliders) {
                const migrated = migratePersistedSliders(
                  parsed.sliders as Record<string, number>,
                );
                for (const d of DIMENSIONS) {
                  const v = migrated[d.id];
                  if (typeof v === "number" && Number.isFinite(v)) {
                    initialSliders[d.id] = Math.max(0, Math.min(1, v / 100));
                  }
                }
              }
```

(`dimNames = DIMENSIONS.map((d) => d.id)` and `buildFeatureTargets(snapshot)` already follow `DIMENSIONS`/`TARGET_DIMENSIONS`, so the rename flows through automatically.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run SliderContext`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/SliderContext.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx"
git commit -m "feat(acc-graph): derive sliders from registry + migrate isExternal→internalExternal"
```

---

## Task P3.4: Per-node availability/confidence weighting in physics (two-bus safe)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionWeights.ts`
- Create: `app/(dashboard)/users/access-analysis/__tests__/dimensionWeights.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Modify: `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Write the failing test for the pure weight builder**

Create `__tests__/dimensionWeights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDimensionWeights } from "../dimensionWeights";
import { CONFIDENCE_FACTOR, getDimension } from "../dimensionRegistry";
import type { NodeFeatureSnapshot } from "../interactionTypes";

function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "",
    project: "Tower A", role: "Architect", permTier: "View Only",
    isExternal: false, affiliation: "internal",
    activityBucket: "Med", signinBucket: "<30d",
    activityCountRaw: 1, lastSignInRel: "", permissionCoverage: "known",
    firmName: "Hermosillo", accountStatus: "active",
    isAdmin: false, moduleSignature: ["build"],
    ...over,
  };
}

describe("buildDimensionWeights", () => {
  it("weight = confidence for an available node (transformer=1 categorical)", () => {
    const w = buildDimensionWeights([snap()], ["project", "signin"]);
    expect(w.project[0]).toBeCloseTo(CONFIDENCE_FACTOR.high, 6);   // 1.0
    expect(w.signin[0]).toBeCloseTo(CONFIDENCE_FACTOR.low, 6);     // 0.4
  });

  it("availability gate zeroes the weight for unknown/absent values", () => {
    const w = buildDimensionWeights(
      [snap({ firmName: "", affiliation: "unknown", activityBucket: "None" })],
      ["company", "internalExternal", "activity"],
    );
    expect(w.company[0]).toBe(0);
    expect(w.internalExternal[0]).toBe(0);
    expect(w.activity[0]).toBe(0);
  });

  it("one Float32Array per dim, length = node count", () => {
    const w = buildDimensionWeights([snap(), snap()], ["role"]);
    expect(w.role).toBeInstanceOf(Float32Array);
    expect(w.role.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionWeights`
Expected: FAIL — `Cannot find module '../dimensionWeights'`.

- [ ] **Step 3: Write the pure weight builder**

Create `dimensionWeights.ts`:

```ts
/**
 * dimensionWeights.ts — Pure per-node, slider-INDEPENDENT force weights.
 *
 * No React, no DOM, no I/O. Implements the slider-independent half of the taxonomy
 * §14 universal weighting model:
 *
 *   effectiveWeight(d,n) = sliderNorm(d) × base(d) × confidence(d) × availability(d,n) × transformer(d,n)
 *
 * `sliderNorm` is applied live in the physics layer. `base` is already spent as the
 * default slider position (DEFAULT_VALUES === defaultWeight×100), so it is NOT folded
 * in here (no double-count). This module produces the remaining per-node factor:
 *
 *   weight(d,n) = confidence(d) × availability(d,n) × transformer(d,n)
 *
 * transformer is 1 for the categorical/binary/temporal runtime dims (scalar/temporal
 * value-normalization is a later phase). availability(d,n) ∈ {0,1} is the per-node
 * gate from descriptor.isAvailable, so sparse/unknown nodes never get dragged to a
 * dimension's pole.
 */

import {
  CONFIDENCE_FACTOR,
  getDimension,
  type DimensionId,
} from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildDimensionWeights(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: readonly DimensionId[],
): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const dim of dims) {
    const d = getDimension(dim);
    const arr = new Float32Array(features.length);
    if (d) {
      const conf = CONFIDENCE_FACTOR[d.confidence];
      for (let i = 0; i < features.length; i++) {
        arr[i] = d.isAvailable(features[i]) ? conf : 0;
      }
    }
    out[dim] = arr;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dimensionWeights`
Expected: PASS.

- [ ] **Step 5: Write the failing physics test (0/100 per dim + availability gate + two-bus)**

Append to `physicsLayer.test.ts` (use the file's existing physics-construction helpers; if it builds a layer via a local `make…` helper, mirror that — the assertions below are the contract):

```ts
describe("physicsLayer — per-node dimension weights", () => {
  // 2 nodes, one dim "role" with simple unit targets; weights gate node 1 to 0.
  function setup(weight1: number) {
    const nodeIds = ["a", "b"];
    const nodes = nodeIds.map((id, index) => ({ id, index }));
    const targets = {
      role: { x: new Float32Array([100, 100]), y: new Float32Array([0, 0]), z: new Float32Array([0, 0]) },
    };
    const dimWeights = { role: new Float32Array([1, weight1]) };
    return { nodeIds, nodes, targets, dimWeights };
  }

  it("slider 0 → role force strength is 0 for every node (no pull)", async () => {
    const { nodeIds, nodes, targets, dimWeights } = setup(1);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 0 }, dimWeights);
    expect(roleStrengthAt(layer, 0)).toBe(0);
    expect(roleStrengthAt(layer, 1)).toBe(0);
    layer.dispose();
  });

  it("slider 100 → strength = STRENGTH_AT_ONE × dimWeight per node", async () => {
    const { nodeIds, nodes, targets, dimWeights } = setup(0); // node 1 gated out
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 1 }, dimWeights);
    expect(roleStrengthAt(layer, 0)).toBeCloseTo(0.1, 6); // available
    expect(roleStrengthAt(layer, 1)).toBe(0);             // availability-gated
    layer.dispose();
  });

  it("applying weights never touches the MASK bus (two-bus invariant)", async () => {
    const { nodeIds, nodes, targets, dimWeights } = setup(1);
    const layer = await createPhysicsLayer(nodeIds, nodes, targets, ["role"], { role: 0.5 }, dimWeights);
    const v0 = layer.maskVersion;
    layer.updateSliders({ role: 1 });
    expect(layer.maskVersion).toBe(v0); // weighting is PHYSICS-bus only
    layer.dispose();
  });
});
```

> `roleStrengthAt(layer, i)` reads the effective per-node strength. Implement it in the test by exposing the d3 force strength accessor, OR (simpler, no API surface change) assert via a small `__debugStrength(dimId, nodeIndex)` test-only getter added to the returned object guarded behind `process.env.NODE_ENV === "test"`. Prefer the debug getter; document it as test-only.

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run physicsLayer`
Expected: FAIL — `createPhysicsLayer` takes 5 args, not 6; no per-node weighting.

- [ ] **Step 7: Wire weights into the physics strength accessor**

In `physicsLayer.ts`:

Add a parameter to `createPhysicsLayer` (after `initialSliders`):

```ts
  initialSliders: Record<string, number>,
  /**
   * Optional slider-INDEPENDENT per-node weights per dimension (confidence ×
   * availability × transformer), from dimensionWeights.buildDimensionWeights.
   * Omitted → every node weights 1.0 (back-compat). PHYSICS-bus only.
   */
  dimWeights: Record<string, Float32Array> = {},
```

Change `applySliderForces` so the strength is a per-node accessor that folds in the weight (replace the scalar `.strength(str)` calls):

```ts
  function applySliderForces(values: Record<string, number>): number {
    const maxSlider = Math.max(0, ...Object.values(values));
    for (const [dimId, sv] of Object.entries(values)) {
      const base = sv * STRENGTH_AT_ONE;
      const w = dimWeights[dimId];
      // Per-node strength accessor: base slider strength × this node's weight (1 if
      // no weights supplied). d3 re-reads the accessor on (re)initialize, so calling
      // .strength(fn) here re-applies it on every updateSliders — PHYSICS-bus only.
      const strengthFn = (_d: SimNode, i: number): number =>
        w ? base * w[i] : base;
      (sim.force(`${dimId}-x`) as ReturnType<typeof forceX> | null)?.strength(strengthFn);
      (sim.force(`${dimId}-y`) as ReturnType<typeof forceY> | null)?.strength(strengthFn);
      (sim.force(`${dimId}-z`) as ReturnType<typeof forceZ> | null)?.strength(strengthFn);
    }
    manyBody.strength(lerp(REPULSION_ZERO, REPULSION_ONE, maxSlider));
    sim.alphaDecay(lerp(DECAY_ZERO, DECAY_ONE, maxSlider));
    return maxSlider;
  }
```

> d3-force-3d's `forceX().strength(fn)` accepts `(node, i, nodes) => number` and evaluates it during `force.initialize`, caching per-node results. Setting `.strength(fn)` again on each `updateSliders` re-initializes that force — same O(n) cost as the current scalar path, still entirely within the PHYSICS bus. The MASK bus (`_alphaMask`/`_maskVersion`) is never referenced here.

If you chose the debug-getter approach in Step 5, add to the returned object:

```ts
    __debugStrength(dimId: string, nodeIndex: number): number {
      const f = sim.force(`${dimId}-x`) as { strength?: (fn?: unknown) => unknown } | null;
      // d3 exposes the resolved per-node strengths array post-initialize.
      const strengths = (f as unknown as { strengths?: Float32Array })?.strengths;
      return strengths ? strengths[nodeIndex] : NaN;
    },
```

(Guard with a comment that this is test-only diagnostics; it reads d3 internals and must not be used by render/interaction code.)

- [ ] **Step 8: Run physics tests to verify they pass**

Run: `npx vitest run physicsLayer`
Expected: PASS (existing PHYS-01…05 suites + the new weighting block).

- [ ] **Step 9: Build + pass dimWeights from the shell**

In `AccessAnalysisShell.tsx`:

Add the import:

```ts
import { buildDimensionWeights } from "./dimensionWeights";
```

Build weights from the same `snapshot` + `dimNames` and pass them in (after `const targets = buildFeatureTargets(snapshot);`):

```ts
        const dimWeights = buildDimensionWeights(snapshot, dimNames as DimensionId[]);
        const layer = await createPhysicsLayer(
          nodeIds,
          nodes,
          targets,
          dimNames,
          initialSliders,
          dimWeights,
        );
```

- [ ] **Step 10: Regression — clustering still produces volumetric clusters**

Run: `npx vitest run physicsClustering`
Expected: PASS. (Confidence now scales force; if a cluster-separation assertion is brittle at the new effective strengths, widen the tolerance — do NOT weaken the "not a globe" intent. If separation regresses materially, that's the signal to defer confidence: in `buildDimensionWeights`, replace `conf` with `1` for the available branch and re-run. Record which path you took.)

- [ ] **Step 11: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add "app/(dashboard)/users/access-analysis/dimensionWeights.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionWeights.test.ts" "app/(dashboard)/users/access-analysis/physicsLayer.ts" "app/(dashboard)/users/access-analysis/physicsLayer.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(acc-graph): per-node availability/confidence force weighting (two-bus safe)"
```

---

## Task P3.5: Expose `module` to the runtime target/weight path (no new slider)

**Why:** P3.4/P3.2 made the code multi-hot-capable. This task makes `module` *actually flow* through targets + weights at runtime WITHOUT adding a 7th visible slider — proving the "exposed safely, no UI chaos" requirement. It is driven by a fixed default strength (not user-adjustable yet) so the advanced UI can later add the slider with zero plumbing changes.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Modify: `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` (export a `RUNTIME_TARGET_DIMENSION_IDS` that includes module but stays out of the slider list)
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `dimensionRegistry.test.ts`:

```ts
import { RUNTIME_TARGET_DIMENSION_IDS } from "../dimensionRegistry";

describe("dimension registry — target vs slider runtime sets", () => {
  it("RUNTIME_TARGET_DIMENSION_IDS = slider dims + module (target-only, no slider)", () => {
    expect(RUNTIME_TARGET_DIMENSION_IDS).toEqual([...RUNTIME_DIMENSION_IDS, "module"]);
  });
  it("module is target-capable but NOT in the visible slider set", () => {
    expect(RUNTIME_DIMENSION_IDS).not.toContain("module");
    expect(RUNTIME_TARGET_DIMENSION_IDS).toContain("module");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionRegistry`
Expected: FAIL — `RUNTIME_TARGET_DIMENSION_IDS` not exported.

- [ ] **Step 3: Implement the target-set constant**

In `dimensionRegistry.ts`, after `RUNTIME_DIMENSION_IDS`:

```ts
/**
 * Dimensions that participate in LAYOUT TARGETS + weighting at runtime. This is the
 * slider set PLUS target-only dims (currently `module`): they shape position via a
 * fixed default strength but have no visible slider yet. The advanced-UI phase
 * promotes a target-only dim to RUNTIME_DIMENSION_IDS to give it a slider.
 */
export const RUNTIME_TARGET_DIMENSION_IDS: readonly DimensionId[] = [
  ...RUNTIME_DIMENSION_IDS,
  "module",
];
```

- [ ] **Step 4: Wire the target-only dim through the shell**

In `AccessAnalysisShell.tsx`, build targets/weights/forces over `RUNTIME_TARGET_DIMENSION_IDS`, but keep slider state over `DIMENSIONS`. Replace the relevant lines:

```ts
import {
  RUNTIME_TARGET_DIMENSION_IDS,
  type DimensionId,
} from "./dimensionRegistry";
```

```ts
        const targetDimIds = [...RUNTIME_TARGET_DIMENSION_IDS] as string[];
        const targets = buildFeatureTargets(snapshot, targetDimIds as never);
        const dimWeights = buildDimensionWeights(snapshot, RUNTIME_TARGET_DIMENSION_IDS);

        // Slider state covers the visible dims; target-only dims (module) get a fixed
        // default strength so they shape layout without a slider. Sliders for visible
        // dims still come from initialSliders (persisted/default).
        const moduleDefault = (getDimension("module")?.defaultWeight ?? 0);
        const seededSliders: Record<string, number> = {
          ...initialSliders,
          module: moduleDefault, // fixed; no UI control yet
        };

        const layer = await createPhysicsLayer(
          nodeIds,
          nodes,
          targets,
          targetDimIds,
          seededSliders,
          dimWeights,
        );
```

Add `getDimension` to the registry import. (SliderProvider still pushes only the 6 visible dims via `updateSliders`; the `module` strength is never overwritten because `updateSliders` merges by key — confirm this by reading `updateSliders`: it replaces `_sliders = { ...values }`. **Adjust:** change SliderContext's `flushToPhysics`/`updateSliders` payload to preserve non-slider keys, OR have the shell re-seed module on each update. Simplest safe choice: in `physicsLayer.updateSliders`, merge over the previous `_sliders` instead of replacing — see Step 5.)

- [ ] **Step 5: Make `updateSliders` merge (preserve target-only strengths)**

In `physicsLayer.ts` `updateSliders`, change the replace to a merge so slider pushes that omit `module` don't drop its strength:

```ts
    updateSliders(values: Record<string, number>): void {
      _sliders = { ..._sliders, ...values }; // merge: preserve target-only dims (e.g. module)
      const maxSlider = applySliderForces(_sliders);
```

Add a physics test asserting the merge:

```ts
  it("updateSliders merges — a target-only dim's strength survives a partial push", async () => {
    const nodeIds = ["a"];
    const nodes = [{ id: "a", index: 0 }];
    const targets = {
      role:   { x: new Float32Array([1]), y: new Float32Array([0]), z: new Float32Array([0]) },
      module: { x: new Float32Array([1]), y: new Float32Array([0]), z: new Float32Array([0]) },
    };
    const layer = await createPhysicsLayer(
      nodeIds, nodes, targets, ["role", "module"],
      { role: 0, module: 0.15 }, { role: new Float32Array([1]), module: new Float32Array([1]) },
    );
    layer.updateSliders({ role: 1 }); // module omitted
    expect(roleStrengthAt(layer, 0)).toBeCloseTo(0.1, 6);
    expect(moduleStrengthAt(layer, 0)).toBeCloseTo(0.015, 6); // 0.15 × 0.1, preserved
    layer.dispose();
  });
```

(`moduleStrengthAt` mirrors `roleStrengthAt` via the test-only `__debugStrength`.)

- [ ] **Step 6: Run tests**

Run: `npx vitest run dimensionRegistry physicsLayer`
Expected: PASS.

- [ ] **Step 7: Full regression + typecheck**

Run: `npm test`
Expected: all suites pass.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts" "app/(dashboard)/users/access-analysis/physicsLayer.ts" "app/(dashboard)/users/access-analysis/physicsLayer.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(acc-graph): flow module dimension through targets+weights (no new slider)"
```

---

## Self-Review

**1. Spec coverage (P3 brief's 8 questions → task):**
1. SliderContext consumes the registry → **P3.1** (runtime view) + **P3.3** (`DIMENSIONS`/`DEFAULT_VALUES` derived). ✓
2. featureTargets uses registry descriptors → **P3.2** (`categoryValue` delegates to `extract`; `TARGET_DIMENSIONS` = registry runtime ids). ✓
3. Current sliders map to registered dimensions → **P3.1** (`RUNTIME_DIMENSION_IDS`) + **P3.3** (`isExternal`→`internalExternal` migration). ✓
4. Module exposed safely without UI chaos → **P3.2** (multi-hot anchor) + **P3.5** (target-only, no slider). ✓
5. availability/`isAvailable` affects force weighting → **P3.4** (`buildDimensionWeights` per-node gate → strength accessor). ✓
6. 2D/3D targets stay volumetric + semantically consistent → **P3.2** (multi-hot reuses `volumetricAnchor`; single renderer feeds both modes). ✓
7. Test 0/100 per registered dimension → **P3.4** Step 5 (slider 0 → strength 0; slider 100 → STRENGTH_AT_ONE × weight, per node). ✓
8. Two-bus model intact → **P3.4** (weighting is PHYSICS-bus only; explicit `maskVersion`-unchanged test). ✓
- Blocking 3D color check → **P3.0** (verify-then-contingency). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has concrete code; every run step has a command + expected result. The one judgement call (debug-getter vs accessor exposure in P3.4 Step 5) is spelled out with the recommended path. ✓

**3. Type consistency:** `TargetDimensionId` becomes an alias of `DimensionId` (P3.2) — every downstream `categoryValue(f, dim)` still type-checks because the runtime ids are a subset. `RUNTIME_DIMENSION_IDS` / `RUNTIME_TARGET_DIMENSION_IDS` / `getRuntimeDimensions` / `runtimeDefaultSliders` / `migratePersistedSliders` / `buildDimensionWeights` / `__debugStrength` are spelled identically across tasks. `DEFAULT_VALUES` keyed by the new `DimensionId` (includes `internalExternal`, not `isExternal`). `createPhysicsLayer`'s new 6th param `dimWeights` is optional (default `{}`) so existing 5-arg callers/tests stay green. ✓

**4. Ordering safety:** P3.0 gates everything. P3.1 adds registry exports (no consumer change). P3.2 renames the target id + adds multi-hot (updates its own + clustering tests). P3.3 flips SliderContext/shell to the new ids (depends on P3.1/P3.2). P3.4 adds weighting (optional param, back-compat). P3.5 adds the target-only `module` flow + the `updateSliders` merge (depends on P3.4's `dimWeights`). Each task ends green. ✓

**5. Risk notes:**
- **Confidence layout delta** (P3.4): low-confidence dims contribute less force. Mitigation + a documented one-line fallback to availability-only if `physicsClustering` regresses.
- **localStorage migration** (P3.3): one-time `isExternal`→`internalExternal`; new key wins on conflict; covered by 3 unit cases. positionsCache hash keys on slider ids, so the rename invalidates cached positions once (graph recomputes on next load — expected, no data loss).
- **`__debugStrength`** reads d3 internals; test-only, commented as such, never called by render/interaction code.
- **No renderer/edge/lasso/camera/nav/UserDetailPanel changes** — confirmed against the do-not-touch list.

---

## Out of scope / follow-ups (NOT in P3)

1. The full advanced 50+ slider UI (visible controls for `company`, `isAdmin`, `module`, `membershipAge`, `permStrength`, …).
2. `membershipAge` — needs `added_on` in `graphTables.ts` projectRows first (P2 follow-up).
3. Scalar/temporal `transformer` value-normalization (currently transformer=1 for all runtime dims).
4. Derived dims `activityMix`/`permStrength`/`riskScore` (DuckDB rollups / composite logic).
5. Promoting `module` (or `company`/`isAdmin`) from target-only to a visible slider.
