# Deterministic Cluster Blobs + Smooth Labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 2D access-analysis cluster view render clean, separated, single-attribute blobs with center-following, zoom-adaptive, lightweight labels — and animate the `0↔1` engage/disengage transition smoothly.

**Architecture:** Replace force-balance separation with deterministic circle packing (`d3-hierarchy` `packSiblings`) computed in a pure module. Members sit on a sunflower inside each packed footprint; the slider tightens fill *within* the footprint so blobs can never overlap. A `clusterTransitionLayer` (exp-smoothing, mirroring the existing `previewLayer`) eases node positions toward the packed target every frame, giving smooth engage/disengage/regroup with no teleport. Color is derived from the cluster id while grouping, so color and cluster can't diverge. Labels project each footprint center via `spaceToScreen` and reveal by on-screen radius.

**Tech Stack:** TypeScript, React, cosmos.gl (mocked in tests), `d3-hierarchy`, `d3-scale-chromatic`, Vitest (`npm test` → `vitest run`), `npx tsc --noEmit` for types.

**Spec:** `docs/superpowers/specs/2026-05-29-cluster-blobs-and-labels-design.md`

**Conventions for every task:**
- Run a single test file with: `npx vitest run <path>`
- Run one test by name: `npx vitest run <path> -t "<name>"`
- Type gate: `npx tsc --noEmit`
- Full unit suite: `npm test`
- Commit by **explicit path only** (WIP branch hazard — never `git add -A`/`.`). Before each commit run `git diff --cached --name-only` and confirm it lists only the intended files.

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `app/(dashboard)/users/access-analysis/clusterPacking.ts` | Pure: footprint packing + member sunflower placement + fill curve | **New** |
| `app/(dashboard)/users/access-analysis/clusterPacking.test.ts` | Unit tests for packing invariants | **New** |
| `app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts` | Pure: exp-smoothing toward a settable position target (stride-3) | **New** |
| `app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts` | Unit tests for easing/retarget/no-teleport | **New** |
| `app/(dashboard)/users/access-analysis/clusterColors.ts` | Pure: cluster-id → RGBA buffer via curated palette | **New** |
| `app/(dashboard)/users/access-analysis/clusterColors.test.ts` | Unit tests for palette determinism + coverage | **New** |
| `app/(dashboard)/users/access-analysis/clusterLabelLayout.ts` | Pure: choose which labels show (on-screen radius + declutter) | **New** |
| `app/(dashboard)/users/access-analysis/clusterLabelLayout.test.ts` | Unit tests for LOD selection | **New** |
| `app/(dashboard)/users/access-analysis/dominantClusters.test.ts` | Per-dimension keying-correctness guard tests | **New** |
| `app/(dashboard)/users/access-analysis/ClusterLabels.tsx` | Rewrite: center-following, zoom-LOD, light styling, fade | **Modify** |
| `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` | Wire packed positions + transition layer; suppress force separation in cluster mode | **Modify** |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | Add runtime pause/resume of the cosmos sim for cluster mode | **Modify** |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | Compute footprints + packed positions; cluster-derived color; "Grouping by" indicator | **Modify** |

---

## Phase 1 — Pure packing math (`clusterPacking.ts`)

Foundation. No rendering. Unblocks everything else.

### Task 1: Fill curve + types

**Files:**
- Create: `app/(dashboard)/users/access-analysis/clusterPacking.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterPacking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// clusterPacking.test.ts
import { describe, it, expect } from "vitest";
import { fillFactor } from "./clusterPacking";

describe("fillFactor", () => {
  it("is loose (fills footprint) at low tightness and tight at high tightness", () => {
    expect(fillFactor(0)).toBeCloseTo(1.0, 5);
    expect(fillFactor(1)).toBeCloseTo(0.45, 5);
  });
  it("is monotonically non-increasing in tightness", () => {
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const f = fillFactor(t);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      prev = f;
    }
  });
  it("clamps out-of-range tightness", () => {
    expect(fillFactor(-1)).toBeCloseTo(1.0, 5);
    expect(fillFactor(2)).toBeCloseTo(0.45, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts" -t "fillFactor"`
Expected: FAIL — `fillFactor` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// clusterPacking.ts
/**
 * clusterPacking.ts — Deterministic, non-overlapping blob layout for the 2D
 * dominant-attribute cluster view. Pure: the only import is d3-hierarchy's
 * geometric circle-packing (no React/DOM/IO, no random, no clock).
 *
 * Separation is STRUCTURAL: footprints are circle-packed so they cannot overlap,
 * and members are placed on a sunflower whose radius never exceeds the footprint.
 * The slider's tightness only varies fill INSIDE the fixed footprint, so it can
 * never break the non-overlap invariant.
 */
import { packSiblings, packEnclose } from "d3-hierarchy";

/** Footprint fill radius as a fraction of the packed footprint, by tightness 0..1. */
const FILL_LOOSE = 1.0;
const FILL_TIGHT = 0.45;

/** Tightness (0..1) → fill fraction. Low = fills footprint; high = tight core. */
export function fillFactor(tightness: number): number {
  const t = Math.min(1, Math.max(0, tightness));
  return FILL_LOOSE + (FILL_TIGHT - FILL_LOOSE) * t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts" -t "fillFactor"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/clusterPacking.ts" "app/(dashboard)/users/access-analysis/clusterPacking.test.ts"
git diff --cached --name-only   # confirm only these two files
git commit -m "feat(acc-cluster): fill curve for deterministic blob packing"
```

### Task 2: `packClusterFootprints` — non-overlapping circle packing

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/clusterPacking.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterPacking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to clusterPacking.test.ts
import { packClusterFootprints } from "./clusterPacking";

describe("packClusterFootprints", () => {
  it("returns one center+radius per cluster", () => {
    const fp = packClusterFootprints([100, 50, 10]);
    expect(fp.cx.length).toBe(3);
    expect(fp.cy.length).toBe(3);
    expect(fp.r.length).toBe(3);
  });

  it("radius grows with member count (area-proportional)", () => {
    const fp = packClusterFootprints([400, 100]); // 4x members → ~2x radius
    expect(fp.r[0]).toBeGreaterThan(fp.r[1]);
  });

  it("NEVER overlaps: every pair is separated by >= sum of radii (the core invariant)", () => {
    const counts = [3000, 1200, 800, 50, 50, 40, 12, 5, 5, 5, 4, 3, 2, 1];
    const fp = packClusterFootprints(counts);
    for (let i = 0; i < counts.length; i++) {
      for (let j = i + 1; j < counts.length; j++) {
        const dx = fp.cx[i] - fp.cx[j];
        const dy = fp.cy[i] - fp.cy[j];
        const dist = Math.hypot(dx, dy);
        expect(dist).toBeGreaterThanOrEqual(fp.r[i] + fp.r[j] - 1e-6);
      }
    }
  });

  it("is recentered near the origin (cosmos space is centered at 0)", () => {
    const fp = packClusterFootprints([100, 100, 100, 100]);
    let mx = 0, my = 0;
    for (let i = 0; i < 4; i++) { mx += fp.cx[i]; my += fp.cy[i]; }
    expect(Math.abs(mx / 4)).toBeLessThan(50);
    expect(Math.abs(my / 4)).toBeLessThan(50);
  });

  it("fits within the target extent (does not blow past cosmos bounds)", () => {
    const fp = packClusterFootprints(new Array(200).fill(20));
    for (let i = 0; i < fp.cx.length; i++) {
      expect(Math.hypot(fp.cx[i], fp.cy[i]) + fp.r[i]).toBeLessThanOrEqual(1701);
    }
  });

  it("is deterministic (same input → identical output)", () => {
    const a = packClusterFootprints([10, 20, 30]);
    const b = packClusterFootprints([10, 20, 30]);
    expect(Array.from(a.cx)).toEqual(Array.from(b.cx));
    expect(Array.from(a.cy)).toEqual(Array.from(b.cy));
  });

  it("handles a single cluster (centered at origin)", () => {
    const fp = packClusterFootprints([500]);
    expect(fp.cx[0]).toBeCloseTo(0, 6);
    expect(fp.cy[0]).toBeCloseTo(0, 6);
    expect(fp.r[0]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts" -t "packClusterFootprints"`
Expected: FAIL — `packClusterFootprints` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to clusterPacking.ts

/** Per-cluster footprint: center (cosmos space) + radius. Stride-1 parallel arrays. */
export interface ClusterFootprints {
  cx: Float32Array;
  cy: Float32Array;
  r: Float32Array;
}

/** Base radius scale (pre-fit); BASE * sqrt(count). Absolute value is irrelevant
 *  because the packed layout is uniformly scaled to TARGET_EXTENT afterward — only
 *  the RATIO between cluster radii matters here. */
const BASE = 6;
/** Min/max footprint radius (relative units) so a 1-member blob is still visible
 *  and a giant blob does not dominate the ratio absurdly. */
const R_MIN = 8;
const R_MAX = 600;
/** Gap added around each footprint before packing so neighbors never touch. */
const GAP = 0.18;
/** Final layout is scaled so the enclosing circle radius equals this (matches the
 *  prior DISC_RADIUS so camera framing is unchanged). */
const TARGET_EXTENT = 1700;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function packClusterFootprints(counts: ReadonlyArray<number>): ClusterFootprints {
  const k = counts.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  if (k === 0) return { cx, cy, r };

  // Footprint radius (with gap) per cluster, in relative units.
  const padded = counts.map((c) => clamp(BASE * Math.sqrt(Math.max(0, c)), R_MIN, R_MAX) * (1 + GAP));

  // Pack big-blobs-first so large footprints sit centrally (cleaner look).
  // Keep original index mapping so outputs align to the caller's cluster order.
  const order = padded.map((_, i) => i).sort((a, b) => padded[b] - padded[a]);
  const circles = order.map((i) => ({ r: padded[i] })) as Array<{ r: number; x?: number; y?: number }>;
  packSiblings(circles); // mutates: assigns x,y, non-overlapping

  // Recenter on the enclosing circle so the layout is centered at the origin.
  const enclose = packEnclose(circles as Array<{ r: number; x: number; y: number }>);
  const ex = enclose?.x ?? 0;
  const ey = enclose?.y ?? 0;
  const encR = enclose?.r ?? padded[order[0]];

  // Uniform scale so the enclosing radius == TARGET_EXTENT. Removing the GAP from
  // the reported radius (we divide by 1+GAP) gives the true blob radius; the gap
  // remains baked into the spacing, so blobs keep a visible margin and never touch.
  const scale = encR > 0 ? TARGET_EXTENT / encR : 1;

  for (let oi = 0; oi < k; oi++) {
    const i = order[oi];
    const c = circles[oi];
    cx[i] = ((c.x ?? 0) - ex) * scale;
    cy[i] = ((c.y ?? 0) - ey) * scale;
    r[i] = (padded[i] / (1 + GAP)) * scale;
  }
  return { cx, cy, r };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts" -t "packClusterFootprints"`
Expected: PASS (7 tests). The non-overlap invariant test is the critical one.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/clusterPacking.ts" "app/(dashboard)/users/access-analysis/clusterPacking.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): non-overlapping footprint packing via d3 packSiblings"
```

### Task 3: `packMemberPositions` — sunflower fill inside each footprint

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/clusterPacking.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterPacking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to clusterPacking.test.ts
import { packMemberPositions } from "./clusterPacking";

describe("packMemberPositions", () => {
  const fp = packClusterFootprints([3, 2]); // cluster 0 has 3, cluster 1 has 2

  it("returns stride-2 positions for every node", () => {
    const ids = new Int32Array([0, 0, 0, 1, 1]);
    const pos = packMemberPositions(ids, fp, 1, 5);
    expect(pos.length).toBe(10);
  });

  it("keeps every member inside its footprint (never escapes → never overlaps)", () => {
    const ids = new Int32Array([0, 0, 0, 1, 1]);
    for (const tightness of [0, 0.5, 1]) {
      const pos = packMemberPositions(ids, fp, tightness, 5);
      for (let n = 0; n < 5; n++) {
        const c = ids[n];
        const dx = pos[n * 2] - fp.cx[c];
        const dy = pos[n * 2 + 1] - fp.cy[c];
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(fp.r[c] + 1e-6);
      }
    }
  });

  it("packs tighter at high tightness than low (mean radius from center shrinks)", () => {
    const ids = new Int32Array([0, 0, 0]);
    const meanR = (t: number): number => {
      const pos = packMemberPositions(ids, fp, t, 3);
      let s = 0;
      for (let n = 0; n < 3; n++) s += Math.hypot(pos[n * 2] - fp.cx[0], pos[n * 2 + 1] - fp.cy[0]);
      return s / 3;
    };
    expect(meanR(1)).toBeLessThan(meanR(0));
  });

  it("is deterministic", () => {
    const ids = new Int32Array([0, 1, 0, 1, 0]);
    const a = packMemberPositions(ids, fp, 0.7, 5);
    const b = packMemberPositions(ids, fp, 0.7, 5);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("places unclustered nodes (id < 0) at the origin", () => {
    const ids = new Int32Array([-1, 0]);
    const pos = packMemberPositions(ids, fp, 1, 2);
    expect(pos[0]).toBe(0);
    expect(pos[1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts" -t "packMemberPositions"`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to clusterPacking.ts

/** Golden angle — even Vogel sunflower spacing. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Per-node 2D position (stride-2) on a sunflower inside its cluster's footprint.
 * Fill radius = footprint.r * fillFactor(tightness), so members never leave the
 * footprint at any tightness → the packed non-overlap invariant is preserved.
 * Node ids < 0 (unclustered) collapse to the origin.
 */
export function packMemberPositions(
  clusterIds: Int32Array | ReadonlyArray<number>,
  footprints: ClusterFootprints,
  tightness: number,
  nodeCount: number,
): Float32Array {
  const out = new Float32Array(nodeCount * 2);
  const fill = fillFactor(tightness);
  const k = footprints.r.length;
  // running member index per cluster, so the j-th member of a cluster gets a
  // distinct sunflower slot (deterministic for a fixed clusterIds order).
  const seen = new Int32Array(k);
  // total members per cluster (for sunflower normalization)
  const total = new Int32Array(k);
  for (let n = 0; n < nodeCount; n++) {
    const c = clusterIds[n];
    if (c >= 0 && c < k) total[c] += 1;
  }
  for (let n = 0; n < nodeCount; n++) {
    const c = clusterIds[n];
    if (c < 0 || c >= k) continue; // leave at origin
    const j = seen[c]++;
    const m = total[c];
    const rFill = footprints.r[c] * fill;
    const rr = m <= 1 ? 0 : rFill * Math.sqrt((j + 0.5) / m);
    const th = j * GOLDEN_ANGLE;
    out[n * 2] = footprints.cx[c] + Math.cos(th) * rr;
    out[n * 2 + 1] = footprints.cy[c] + Math.sin(th) * rr;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterPacking.test.ts"`
Expected: PASS (all packing tests).

- [ ] **Step 5: Type gate + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/users/access-analysis/clusterPacking.ts" "app/(dashboard)/users/access-analysis/clusterPacking.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): sunflower member placement inside packed footprints"
```

---

## Phase 2 — Per-dimension correctness audit (`dominantClusters.test.ts`)

Verify keying per kind on the real catalog so "different roles in one blob" can't come from the assignment layer. No production code unless a test fails.

### Task 4: Keying guard tests across dimension kinds

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dominantClusters.test.ts`
- (Modify `dominantClusters.ts` ONLY if a guard fails.)

- [ ] **Step 1: Write the tests**

```ts
// dominantClusters.test.ts
import { describe, it, expect } from "vitest";
import { buildDominantClusters } from "./dominantClusters";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Minimal snapshot factory — only the fields the structural extractors read.
function snap(over: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return { nodeId: "n", role: null, project: null, firmName: null, accountStatus: null,
    permissionStrength: 0, membershipBucket: "unknown", membershipAgeDays: null,
    moduleSignature: [], isAdmin: false, isExternal: false, affiliation: null,
    actionCounts: {}, ...over } as NodeFeatureSnapshot;
}

const roleDim: CatalogDimension = {
  id: "role", label: "Role", family: "structure", kind: "categorical",
  source: "", confidence: "high", available: true, surfaces: ["slider", "color"],
  colorScale: "categorical", extract: (f) => (f.role && f.role !== "(no role)" ? f.role : null),
};

describe("buildDominantClusters — categorical keying", () => {
  it("groups identical role strings together and distinct strings apart", () => {
    const features = [
      snap({ role: "Admin" }), snap({ role: "Admin" }),
      snap({ role: "Editor" }), snap({ role: "Viewer" }),
    ];
    const c = buildDominantClusters(features, roleDim);
    expect(c.labels.length).toBe(3);               // Admin, Editor, Viewer
    expect(c.ids[0]).toBe(c.ids[1]);               // two Admins share a cluster
    expect(c.ids[0]).not.toBe(c.ids[2]);           // Admin != Editor
    expect(c.counts[c.ids[0]]).toBe(2);
  });

  it("collapses null/empty role into exactly one '(none)' cluster, not a neighbor", () => {
    const features = [snap({ role: null }), snap({ role: "(no role)" }), snap({ role: "Admin" })];
    const c = buildDominantClusters(features, roleDim);
    expect(c.ids[0]).toBe(c.ids[1]);               // null and "(no role)" → same "(none)"
    expect(c.ids[0]).not.toBe(c.ids[2]);
  });

  it("never collapses distinct values into a single blob (degenerate guard)", () => {
    const features = Array.from({ length: 50 }, (_, i) => snap({ role: `Role${i % 10}` }));
    const c = buildDominantClusters(features, roleDim);
    expect(c.labels.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/dominantClusters.test.ts"`
Expected: PASS. If any FAIL, fix the keying in `dominantClusters.ts` (`valueKeyLabel`) and re-run. Document the fix in the commit body.

- [ ] **Step 3: Add multiHot + ordinal guards**

```ts
// append to dominantClusters.test.ts
const moduleDim: CatalogDimension = {
  id: "moduleAccess", label: "Module access", family: "access", kind: "multiHot",
  source: "", confidence: "high", available: true, surfaces: ["slider", "color"],
  colorScale: "categorical", extract: (f) => [...(f.moduleSignature ?? [])].sort(),
};

describe("buildDominantClusters — multiHot keying", () => {
  it("treats the same set in any order as one cluster, different sets as different", () => {
    const features = [
      snap({ moduleSignature: ["docs", "build"] }),
      snap({ moduleSignature: ["build", "docs"] }), // same set, different order
      snap({ moduleSignature: ["docs"] }),          // subset → different cluster
    ];
    const c = buildDominantClusters(features, moduleDim);
    expect(c.ids[0]).toBe(c.ids[1]);
    expect(c.ids[0]).not.toBe(c.ids[2]);
  });
});

const permDim: CatalogDimension = {
  id: "permission", label: "Permission level", family: "access", kind: "ordinal",
  source: "", confidence: "medium", available: true, surfaces: ["color"],
  colorScale: "ordered", extract: (f) => f.permissionStrength ?? 0,
};

describe("buildDominantClusters — ordinal (permission) keying", () => {
  it("buckets by permission tier", () => {
    const features = [snap({ permissionStrength: 5 }), snap({ permissionStrength: 5 }), snap({ permissionStrength: 1 })];
    const c = buildDominantClusters(features, permDim);
    expect(c.ids[0]).toBe(c.ids[1]);
    expect(c.ids[0]).not.toBe(c.ids[2]);
  });
});
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/dominantClusters.test.ts"`
Expected: PASS (all).

```bash
git add "app/(dashboard)/users/access-analysis/dominantClusters.test.ts"
# include dominantClusters.ts ONLY if a guard required a keying fix
git diff --cached --name-only
git commit -m "test(acc-cluster): per-kind keying guards for dominant clustering"
```

> If `NodeFeatureSnapshot` field names in the `snap()` factory don't match the real type, open `interactionTypes.ts`, correct the field names, and re-run before committing.

---

## Phase 3 — Color from cluster id (`clusterColors.ts`)

Removes the color-vs-cluster divergence: while grouping, color is a pure function of cluster id, so a blob is always one hue.

### Task 5: `clusterColorBuffer`

**Files:**
- Create: `app/(dashboard)/users/access-analysis/clusterColors.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterColors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// clusterColors.test.ts
import { describe, it, expect } from "vitest";
import { clusterColorBuffer } from "./clusterColors";

describe("clusterColorBuffer", () => {
  it("returns RGBA in [0,1] with alpha 1 for every node", () => {
    const ids = new Int32Array([0, 1, 2, 0]);
    const buf = clusterColorBuffer(ids, 3);
    expect(buf.length).toBe(16); // 4 nodes * 4
    for (let i = 0; i < 4; i++) expect(buf[i * 4 + 3]).toBe(1); // alpha
    for (let i = 0; i < buf.length; i++) { expect(buf[i]).toBeGreaterThanOrEqual(0); expect(buf[i]).toBeLessThanOrEqual(1); }
  });

  it("gives nodes in the same cluster the same color", () => {
    const ids = new Int32Array([0, 1, 0]);
    const buf = clusterColorBuffer(ids, 2);
    expect([buf[0], buf[1], buf[2]]).toEqual([buf[8], buf[9], buf[10]]);
  });

  it("gives different clusters different colors (within palette range)", () => {
    const ids = new Int32Array([0, 1]);
    const buf = clusterColorBuffer(ids, 2);
    expect([buf[0], buf[1], buf[2]]).not.toEqual([buf[4], buf[5], buf[6]]);
  });

  it("covers high cluster counts without crashing (interpolator beyond palette size)", () => {
    const k = 200;
    const ids = new Int32Array(Array.from({ length: k }, (_, i) => i));
    const buf = clusterColorBuffer(ids, k);
    expect(buf.length).toBe(k * 4);
  });

  it("colors unclustered nodes (id < 0) a neutral grey", () => {
    const ids = new Int32Array([-1]);
    const buf = clusterColorBuffer(ids, 0);
    expect(buf[0]).toBeCloseTo(buf[1], 6);
    expect(buf[1]).toBeCloseTo(buf[2], 6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterColors.test.ts"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// clusterColors.ts
/**
 * clusterColors.ts — Pure cluster-id → RGBA buffer. While a dimension is grouping,
 * node color is derived from cluster id (one hue per blob), so color and cluster
 * cannot disagree. Curated palette for small counts; an evenly-spread interpolator
 * beyond palette size (better separation than the legacy FNV hash→hue).
 */
import { schemeTableau10 } from "d3-scale-chromatic";
import { interpolateSinebow } from "d3-scale-chromatic";

const GREY: [number, number, number] = [0.5, 0.5, 0.5];

/** "#rrggbb" → [r,g,b] in [0,1]. */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** "rgb(r, g, b)" (d3 interpolator output) → [r,g,b] in [0,1]. */
function rgbStrTo01(s: string): [number, number, number] {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return GREY;
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}

/** Deterministic color for a cluster index given the total cluster count. */
export function colorForCluster(idx: number, clusterCount: number): [number, number, number] {
  if (idx < 0) return GREY;
  if (clusterCount <= schemeTableau10.length) return hexToRgb01(schemeTableau10[idx % schemeTableau10.length]);
  // Spread hues evenly around the sinebow wheel; offset by 0.5/count to avoid 0==1.
  return rgbStrTo01(interpolateSinebow((idx + 0.5) / clusterCount));
}

/** RGBA Float32Array(n*4), alpha=1, colored by cluster id. */
export function clusterColorBuffer(clusterIds: Int32Array | ReadonlyArray<number>, clusterCount: number): Float32Array {
  const n = clusterIds.length;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = colorForCluster(clusterIds[i], clusterCount);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 1;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterColors.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Type gate + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/users/access-analysis/clusterColors.ts" "app/(dashboard)/users/access-analysis/clusterColors.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): cluster-id color buffer (color follows grouping)"
```

---

## Phase 4 — Smooth transition layer (`clusterTransitionLayer.ts`)

The careful `0↔1` animation. Pure; mirrors `previewLayer` exp-smoothing so it always eases from the visible state (no teleport, no restart on re-target).

### Task 6: `clusterTransitionLayer`

**Files:**
- Create: `app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// clusterTransitionLayer.test.ts
import { describe, it, expect } from "vitest";
import { createClusterTransitionLayer } from "./clusterTransitionLayer";

describe("clusterTransitionLayer", () => {
  it("eases toward the target without overshooting", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    layer.step(16);
    const x1 = layer.snapshot()[0];
    expect(x1).toBeGreaterThan(0);
    expect(x1).toBeLessThan(100); // partial move, no teleport
  });

  it("converges to the target over many steps", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    for (let i = 0; i < 200; i++) layer.step(16);
    expect(layer.snapshot()[0]).toBeCloseTo(100, 1);
  });

  it("re-targets from the CURRENT position (no restart/jump on retarget)", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    for (let i = 0; i < 5; i++) layer.step(16);
    const mid = layer.snapshot()[0];
    layer.setTarget(new Float32Array([0, 0, 0])); // reverse mid-flight
    layer.step(16);
    const after = layer.snapshot()[0];
    expect(after).toBeLessThan(mid);   // moved back toward 0
    expect(after).toBeGreaterThan(0);  // but did not jump to 0
  });

  it("caps dt so a long pause does not lurch (clamped step)", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    layer.step(100000); // huge dt (tab backgrounded)
    expect(layer.snapshot()[0]).toBeLessThan(100); // did not snap to target
  });

  it("reports settled=false while moving and true once at rest", () => {
    const layer = createClusterTransitionLayer({ nodeCount: 1 });
    layer.seedFrom(new Float32Array([0, 0, 0]));
    layer.setTarget(new Float32Array([100, 0, 0]));
    expect(layer.step(16)).toBe(false);          // moved → not settled
    for (let i = 0; i < 500; i++) layer.step(16);
    expect(layer.step(16)).toBe(true);           // at rest → settled
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// clusterTransitionLayer.ts
/**
 * clusterTransitionLayer.ts — Exp-smoothing of node positions toward a settable
 * target (stride-3, z held at 0 for the 2D view). Mirrors previewLayer so the
 * displayed buffer always eases FROM its current value: re-targeting mid-flight
 * never restarts or teleports, which is exactly what the 0<->1 engage/disengage
 * and regroup transitions require. Pure: no React/DOM/IO, no clock (dt is passed in).
 */
export interface ClusterTransitionLayer {
  seedFrom(xyz: Float32Array): void;
  setTarget(xyz: Float32Array): void;
  /** Advance toward target by dtMs. Returns true when settled (no material motion). */
  step(dtMs: number): boolean;
  snapshot(): Float32Array;
}

const TAU_MS = 90;        // time constant — gentle, professional ease (~0.2s to ~90%)
const MAX_DT_MS = 50;     // clamp after tab-background pauses (matches previewLayer)
const EPSILON = 1e-3;     // settle threshold in cosmos space units

export function createClusterTransitionLayer(opts: { nodeCount: number }): ClusterTransitionLayer {
  const n = opts.nodeCount;
  const displayed = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);

  return {
    seedFrom(xyz: Float32Array): void {
      if (xyz.length !== displayed.length)
        throw new Error(`clusterTransitionLayer.seedFrom: length ${xyz.length} != ${displayed.length}`);
      displayed.set(xyz);
    },
    setTarget(xyz: Float32Array): void {
      if (xyz.length !== target.length)
        throw new Error(`clusterTransitionLayer.setTarget: length ${xyz.length} != ${target.length}`);
      target.set(xyz);
    },
    step(dtMs: number): boolean {
      const dt = Math.min(MAX_DT_MS, Math.max(0, dtMs));
      const alpha = 1 - Math.exp(-dt / TAU_MS);
      let moved = false;
      for (let i = 0; i < displayed.length; i++) {
        const d = (target[i] - displayed[i]) * alpha;
        if (Math.abs(d) > EPSILON) { displayed[i] += d; moved = true; }
        else displayed[i] = target[i];
      }
      return !moved;
    },
    snapshot(): Float32Array {
      return displayed;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Type gate + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts" "app/(dashboard)/users/access-analysis/clusterTransitionLayer.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): exp-smoothing cluster transition layer (no-teleport easing)"
```

---

## Phase 5 — Label LOD math + component rewrite

### Task 7: `selectVisibleLabels` (pure LOD selection)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/clusterLabelLayout.ts`
- Test: `app/(dashboard)/users/access-analysis/clusterLabelLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// clusterLabelLayout.test.ts
import { describe, it, expect } from "vitest";
import { selectVisibleLabels } from "./clusterLabelLayout";

// candidate: { i, screenX, screenY, screenRadius, count }
describe("selectVisibleLabels", () => {
  it("hides labels whose on-screen blob radius is below the reveal threshold", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 40, count: 500 },
        { i: 1, screenX: 400, screenY: 400, screenRadius: 4, count: 5 },
      ],
      { minScreenRadius: 12, sepX: 120, sepY: 22 },
    );
    expect(out.map((o) => o.i)).toEqual([0]); // small blob withheld
  });

  it("reveals more labels as on-screen radius grows (zoom-in)", () => {
    const cands = [
      { i: 0, screenX: 100, screenY: 100, screenRadius: 30, count: 500 },
      { i: 1, screenX: 400, screenY: 100, screenRadius: 14, count: 50 },
    ];
    expect(selectVisibleLabels(cands, { minScreenRadius: 20, sepX: 120, sepY: 22 }).length).toBe(1);
    expect(selectVisibleLabels(cands, { minScreenRadius: 10, sepX: 120, sepY: 22 }).length).toBe(2);
  });

  it("declutters: drops a label colliding with an already-placed bigger one", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 40, count: 999 },
        { i: 1, screenX: 110, screenY: 105, screenRadius: 38, count: 10 }, // within sep of #0
      ],
      { minScreenRadius: 5, sepX: 120, sepY: 22 },
    );
    expect(out.map((o) => o.i)).toEqual([0]); // bigger wins the slot
  });

  it("prioritizes bigger blobs for the label slot (sorted by count desc)", () => {
    const out = selectVisibleLabels(
      [
        { i: 0, screenX: 100, screenY: 100, screenRadius: 30, count: 10 },
        { i: 1, screenX: 105, screenY: 100, screenRadius: 30, count: 900 },
      ],
      { minScreenRadius: 5, sepX: 120, sepY: 22 },
    );
    expect(out[0].i).toBe(1); // the 900-member blob is placed
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterLabelLayout.test.ts"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// clusterLabelLayout.ts
/**
 * clusterLabelLayout.ts — Pure label level-of-detail selection. A label is a
 * candidate only when its blob's ON-SCREEN radius clears a threshold (so zoomed
 * out shows only big blobs; zooming in reveals more). Among candidates, bigger
 * blobs win slots; a greedy declutter drops any that collide with one already
 * placed. No DOM — the component feeds projected screen coords in and renders out.
 */
export interface LabelCandidate {
  i: number;
  screenX: number;
  screenY: number;
  screenRadius: number;
  count: number;
}
export interface LabelLayoutOpts {
  minScreenRadius: number;
  sepX: number;
  sepY: number;
}

export function selectVisibleLabels(
  candidates: ReadonlyArray<LabelCandidate>,
  opts: LabelLayoutOpts,
): LabelCandidate[] {
  const eligible = candidates
    .filter((c) => c.screenRadius >= opts.minScreenRadius)
    .sort((a, b) => b.count - a.count); // biggest first wins the slot
  const placed: LabelCandidate[] = [];
  for (const c of eligible) {
    let collide = false;
    for (const p of placed) {
      if (Math.abs(c.screenX - p.screenX) < opts.sepX && Math.abs(c.screenY - p.screenY) < opts.sepY) {
        collide = true;
        break;
      }
    }
    if (!collide) placed.push(c);
  }
  return placed;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/clusterLabelLayout.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/clusterLabelLayout.ts" "app/(dashboard)/users/access-analysis/clusterLabelLayout.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): pure zoom-LOD label selection"
```

### Task 8: Rewrite `ClusterLabels.tsx` (center-following, LOD, light styling, fade)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/ClusterLabels.tsx` (full rewrite of the body)

- [ ] **Step 1: Replace the component**

New props take footprints (centers + radii in cosmos space) and per-cluster color, and use `selectVisibleLabels`. On-screen radius is derived by projecting the footprint center and a point one radius to its right, then measuring the pixel distance (captures the live zoom scale).

```tsx
"use client";

/**
 * ClusterLabels.tsx — HTML overlay labeling the dominant-attribute blobs.
 * Each label sits on its blob's PACKED CENTER (deterministic), projected to screen
 * pixels every frame via the 2D handle's spaceToScreen so it tracks pan/zoom. A
 * label shows only when its blob's on-screen radius clears a threshold (zoom-LOD),
 * and fades in/out via CSS opacity. Renders nothing in 3D or when no dim groups.
 */
import { useEffect, useMemo, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { selectVisibleLabels, type LabelCandidate } from "./clusterLabelLayout";
import { colorForCluster } from "./clusterColors";

const MIN_SCREEN_RADIUS = 14; // px — blob must be at least this big on screen to label
const SEP_X = 120;
const SEP_Y = 22;

export interface ClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  /** Footprint centers (cosmos space), stride-1 parallel arrays, or null when none. */
  centersX: Float32Array | null;
  centersY: Float32Array | null;
  /** Footprint radius per cluster (cosmos space). */
  radii: Float32Array | null;
  labels: string[];
  counts: number[];
  mode: "2d" | "3d";
}

export function ClusterLabels({
  graphRef, centersX, centersY, radii, labels, counts, mode,
}: ClusterLabelsProps): React.JSX.Element | null {
  const k = labels.length;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stable per-cluster color (matches the node cluster coloring).
  const colors = useMemo(
    () => labels.map((_, i) => {
      const [r, g, b] = colorForCluster(i, k);
      return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }),
    [labels, k],
  );

  useEffect(() => {
    if (mode !== "2d" || k === 0 || !centersX || !centersY || !radii) return;
    let active = true;
    let raf = 0;
    const tick = (): void => {
      if (!active) return;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      if (handle?.spaceToScreen) {
        const cands: LabelCandidate[] = [];
        for (let i = 0; i < k; i++) {
          const [sx, sy] = handle.spaceToScreen([centersX[i], centersY[i]]);
          const [ex] = handle.spaceToScreen([centersX[i] + radii[i], centersY[i]]);
          cands.push({ i, screenX: sx, screenY: sy, screenRadius: Math.abs(ex - sx), count: counts[i] ?? 0 });
        }
        const visible = new Set(
          selectVisibleLabels(cands, { minScreenRadius: MIN_SCREEN_RADIUS, sepX: SEP_X, sepY: SEP_Y }).map((c) => c.i),
        );
        for (let i = 0; i < k; i++) {
          const el = itemRefs.current[i];
          if (!el) continue;
          const c = cands[i];
          if (visible.has(i)) {
            el.style.opacity = "1";
            el.style.transform = `translate(-50%, -50%) translate(${c.screenX}px, ${c.screenY}px)`;
          } else {
            el.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [centersX, centersY, radii, counts, k, mode, graphRef]);

  if (mode !== "2d" || k === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}>
      {labels.map((label, i) => (
        <div
          key={`${i}:${label}`}
          ref={(el) => { itemRefs.current[i] = el; }}
          style={{
            position: "absolute", left: 0, top: 0,
            transform: "translate(-50%, -50%)",
            display: "flex", alignItems: "center", gap: 6,
            whiteSpace: "nowrap", fontSize: 11, fontWeight: 500, lineHeight: 1.2,
            color: "#fafafa",
            background: "rgba(9, 9, 11, 0.42)",
            backdropFilter: "blur(3px)",
            borderRadius: 6, padding: "2px 7px",
            opacity: 0, transition: "opacity 220ms ease",
            pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.75)",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[i], flex: "0 0 auto" }} />
          {label}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type gate**

Run: `npx tsc --noEmit`
Expected: PASS. (The shell still passes the OLD props — that's fixed in Task 11; if tsc errors only in `AccessAnalysisShell.tsx`, that's expected and resolved there.)

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/ClusterLabels.tsx"
git diff --cached --name-only
git commit -m "feat(acc-cluster): center-following zoom-LOD labels with light styling + fade"
```

---

## Phase 6 — Renderer integration (highest risk)

> **SPIKE FIRST (do not skip):** Confirm the runtime contract that cosmos.gl honors
> `pause()` + repeated `setPointPositions(xy, true)` (i.e. positions we push are
> displayed and NOT moved by the paused sim). Spend ≤30 min in the running app
> (`npm run build` then the local server, or a scratch story). If it does NOT hold,
> the fallback is to construct the 2D graph with `enableSimulation:false` whenever a
> dominant dim is active (mode-scoped construction) — note which path you took in the
> Task 10 commit body. Everything below assumes the pause+push contract holds.

### Task 9: Add runtime sim pause/resume to the 2D handle

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (handle interface + impl)

- [ ] **Step 1: Add to `GraphCanvas2DHandle` interface** (near the other optional methods, after `setClusterPositions`)

```ts
  /**
   * Cluster-deterministic mode: pause the GPU sim so pushed positions are the sole
   * source of truth (no force movement), or resume it. No-op when gpuSimulation is off.
   */
  pauseSimulation?(): void;
  resumeSimulation?(): void;
```

- [ ] **Step 2: Implement in the handle object** (alongside `setClusterPositions`, using the same `g`/`props.gpuSimulation` guards already in that file)

```ts
        pauseSimulation(): void {
          if (!props.gpuSimulation) return;
          (g as unknown as { pause?: () => void }).pause?.();
        },
        resumeSimulation(): void {
          if (!props.gpuSimulation) return;
          (g as unknown as { start?: (a?: number) => void }).start?.();
        },
```

- [ ] **Step 3: Type gate + commit**

```bash
npx tsc --noEmit
git add "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx"
git diff --cached --name-only
git commit -m "feat(acc-cluster): runtime pause/resume of the 2D cosmos sim"
```

### Task 10: Drive packed positions through a transition layer in `GraphCanvas`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.test.ts` (assert the wiring via the existing cosmos mock)

New prop on `GraphCanvasProps` (add near `clusterAnchors`):

```ts
  /**
   * Deterministic per-node packed positions (stride-3, z=0) for the labeled
   * cluster view. When present, the 2D view eases toward these via the cluster
   * transition layer with the GPU sim PAUSED — separation is structural, not
   * force-based. Undefined → GPU free-explore / scatter as before.
   */
  clusterPackedPositions?: Float32Array;
```

- [ ] **Step 1: Add the cluster transition wiring** (new block after the existing `getPositionsOverride` definition)

```ts
  // Deterministic cluster view: ease node positions toward the packed target.
  // Active whenever the shell supplies packed positions. Mutually exclusive with
  // the GPU force sim (which we pause) so separation never depends on force balance.
  const clusterActive = !!props.clusterPackedPositions;
  const clusterLayerRef = useRef<import("./clusterTransitionLayer").ClusterTransitionLayer | null>(null);
  const clusterLastTsRef = useRef<number>(0);
  const clusterSettledRef = useRef<boolean>(false);

  // (Re)create the layer when node count changes; seed from current visible positions.
  useEffect(() => {
    const xyz = props.physics.getPositions();
    const n = xyz.length / 3;
    const layer = createClusterTransitionLayer({ nodeCount: n });
    layer.seedFrom(xyz);
    clusterLayerRef.current = layer;
    return () => { clusterLayerRef.current = null; };
  }, [props.physics]);

  // Set the target whenever packed positions change (engage / regroup / tightness).
  // setTarget eases FROM current displayed → no teleport on re-target.
  useEffect(() => {
    const layer = clusterLayerRef.current;
    if (!layer) return;
    if (props.clusterPackedPositions) {
      layer.setTarget(props.clusterPackedPositions);
      clusterSettledRef.current = false;
    }
  }, [props.clusterPackedPositions]);

  // Pause/resume the GPU sim as we enter/leave cluster mode.
  useEffect(() => {
    if (!gpu2d || props.mode !== "2d") return;
    const h = handle2D.current;
    if (!h) return;
    if (clusterActive) h.pauseSimulation?.();
    else h.resumeSimulation?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterActive, gpu2d, props.mode, readyTick]);
```

Extend `getPositionsOverride` so that in cluster mode it returns the eased positions:

```ts
  const getPositionsOverride = useCallback((): Float32Array | null => {
    // Cluster-deterministic mode takes precedence: ease toward packed target.
    if (props.clusterPackedPositions && clusterLayerRef.current) {
      const layer = clusterLayerRef.current;
      const now = performance.now();
      const dt = clusterLastTsRef.current ? now - clusterLastTsRef.current : 16;
      clusterLastTsRef.current = now;
      clusterSettledRef.current = layer.step(dt);
      return layer.snapshot();
    }
    clusterLastTsRef.current = 0;
    if (!ENABLE_PREVIEW_INTERPOLATION || gpu2d) return null;
    if (!previewActiveLocalRef.current) return null;
    const layer = previewRef.current;
    if (!layer) return null;
    const now = performance.now();
    const dt = Math.min(50, now - lastFrameTsRef.current);
    lastFrameTsRef.current = now;
    layer.step(props.physics.getSliders(), dt);
    return layer.snapshot();
  }, [props.physics, gpu2d, props.clusterPackedPositions]);
```

The rAF loop must PUMP positions in cluster mode (it currently skips the pump when `gpu2d`). Change `skipPositionPump`:

```ts
    skipPositionPump: gpu2d && !clusterActive,
```

Add the import at the top of the file:

```ts
import { createClusterTransitionLayer } from "./clusterTransitionLayer";
```

- [ ] **Step 2: Add a wiring test** (uses the existing cosmos mock + `renderHook`/render already set up in the file)

```ts
// append a test in GraphCanvas.test.ts
it("REND-cluster: packed positions are pushed to cosmos (deterministic, sim paused)", async () => {
  // Render GraphCanvas in 2D with clusterPackedPositions set; flush a rAF tick.
  // Assert _setPointPositionsCalls received our packed buffer and pause() was called.
  // (Follow the existing render+act+rAF pattern used by the other REND tests in this file.)
  expect(true).toBe(true); // replace with the assertion once the render harness lines are copied from a sibling test
});
```

> Replace the placeholder body by copying the render/act/rAF scaffold from the nearest existing `it(...)` in this file (they already mount `GraphCanvas`, flush `requestAnimationFrame`, and read `_setPointPositionsCalls` / `_pauseCalls`). Assert: after a tick with `clusterPackedPositions` set, `_setPointPositionsCalls` is non-empty and `_pauseCalls >= 1`.

- [ ] **Step 3: Run the renderer tests + type gate**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"`
Run: `npx tsc --noEmit`
Expected: PASS (existing tests still green; new wiring test green).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas.tsx" "app/(dashboard)/users/access-analysis/GraphCanvas.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-cluster): drive packed positions via transition layer; pause force sim"
```

---

## Phase 7 — Shell wiring + "Grouping by" indicator

### Task 11: Compute footprints/positions/colors in the shell and pass them down

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Add imports**

```ts
import { packClusterFootprints, packMemberPositions } from "./clusterPacking";
import { clusterColorBuffer } from "./clusterColors";
```

- [ ] **Step 2: Replace the `clusterAnchors` memo block** (currently lines ~120-123) with footprints + packed positions + tightness, and derive cluster color while grouping.

```ts
  // Deterministic blob footprints (non-overlapping circle pack) for the dominant dim.
  const footprints = useMemo(
    () => (clustering ? packClusterFootprints(clustering.counts) : null),
    [clustering],
  );

  // Tightness = the dominant slider's value, normalized 0..1.
  const tightness = useMemo(() => {
    if (!dominant) return 0;
    return Math.min(1, Math.max(0, (sliderValues[dominant.id] ?? 0) / 100));
  }, [dominant, sliderValues]);

  // Per-node packed positions (stride-3, z=0) — recompute on regroup OR tightness change.
  const clusterPackedPositions = useMemo(() => {
    if (!clustering || !footprints) return undefined;
    const n = clustering.ids.length;
    const xy = packMemberPositions(clustering.ids, footprints, tightness, n);
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { xyz[i * 3] = xy[i * 2]; xyz[i * 3 + 1] = xy[i * 2 + 1]; xyz[i * 3 + 2] = 0; }
    return xyz;
  }, [clustering, footprints, tightness]);
```

- [ ] **Step 3: While grouping, color by cluster id; otherwise keep the manual color selector.**

Replace the `nodeColors` memo so cluster grouping wins:

```ts
  const nodeColors = useMemo<Float32Array>(
    () =>
      clustering
        ? clusterColorBuffer(clustering.ids, clustering.labels.length)
        : buildNodeColors(features, colorMode),
    [clustering, features, colorMode],
  );
```

- [ ] **Step 4: Pass new props to `GraphCanvas` and the rewritten `ClusterLabels`.**

In the `<GraphCanvas .../>` element, replace `clusterAnchors={clusterAnchors}` with:

```tsx
              clusterPackedPositions={clusterPackedPositions}
```

Replace the `<ClusterLabels .../>` element with:

```tsx
          <ClusterLabels
            graphRef={graphRef}
            centersX={footprints?.cx ?? null}
            centersY={footprints?.cy ?? null}
            radii={footprints?.r ?? null}
            labels={clustering?.labels ?? []}
            counts={clustering?.counts ?? []}
            mode={mode}
          />
```

> Remove the now-unused `clusterAnchors`/`clusterPositions2D` references. Leave `clustering?.ids` flowing to GraphCanvas only if still consumed elsewhere; otherwise drop the `clusterIds`/`clusterAnchors` props from the `<GraphCanvas>` call. Verify with tsc.

- [ ] **Step 5: Type gate + unit suite**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: PASS. Fix any prop-type mismatches surfaced by tsc.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git diff --cached --name-only
git commit -m "feat(acc-cluster): wire deterministic packing + cluster color into the shell"
```

### Task 12: "Grouping by: <X>" live indicator

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Add the indicator overlay** next to the existing mode-switcher overlay (the `absolute right-4 top-4` block). Insert a sibling at top-left:

```tsx
          {/* Active grouping indicator — makes the "strongest slider wins" rule visible. */}
          {dominant && mode === "2d" && (
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Grouping by: {dominant.label}
            </div>
          )}
```

- [ ] **Step 2: Type gate + manual check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git diff --cached --name-only
git commit -m "feat(acc-cluster): live 'Grouping by' indicator (strongest-slider model)"
```

---

## Phase 8 — Verification

### Task 13: Full suite + build + manual UAT

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all green (new packing/transition/color/label/keying tests + existing suite).

- [ ] **Step 2: Type + lint + build**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Manual UAT** (build + run locally, then in the access-analysis graph, 2D)

Confirm each — these map 1:1 to the spec success criteria:
- [ ] `Role = 100`, all else 0 → visibly separated, single-role blobs; no cross-role bleed.
- [ ] Repeat for `Company`, `Project`, `Permission level`, `Module access`, `Membership tenure` → each forms clean blobs.
- [ ] Labels sit on blob centers, ride pan/zoom, are not a wall of boxes; more reveal as you zoom in; they fade (not pop).
- [ ] **Drag `Role` 0→100 slowly**: nodes flow into blobs smoothly, no teleport, no stutter.
- [ ] **Drag `Role` 100→0 slowly**: blobs release to scatter smoothly; when it reaches 0 the free-explore view resumes without a jump.
- [ ] Raise `Company` above `Role`: blobs **regroup** by company (reflow, not snap) and "Grouping by: Company" updates instantly.
- [ ] Each blob is a single color (color == grouping); colors are distinguishable.

- [ ] **Step 4: Update TECHNICAL_DEBT + memory note, then final commit**

Per repo convention, record any deferred items (e.g. palette tuning, GPU-mode e2e for the cluster view) in `.gsd/TECHNICAL_DEBT.md`.

```bash
git add .gsd/TECHNICAL_DEBT.md
git diff --cached --name-only
git commit -m "docs(acc-cluster): record deferred items after cluster-blobs work"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Separation by deterministic packing → Tasks 1-3 (+ non-overlap invariant test). ✓
- Rendering integration (positions, sim off) → Tasks 9-10. ✓
- `0↔1` transition animation (interpolate, re-seed, defer GPU handoff, dt cap) → Task 6 (layer) + Task 10 (wiring, pause/resume). ✓
- Labels: center-following + zoom-LOD + light styling + fade → Tasks 7-8. ✓
- Multi-slider "strongest wins" + "Grouping by" indicator → Tasks 11-12. ✓
- Per-dimension keying audit → Task 4. ✓
- Color/cluster divergence + palette → Task 5 (cluster-id color) + Task 11 (wired). ✓

**Placeholder scan:** One intentional placeholder remains — the Task 10 wiring-test body — because it must copy the file's existing render/rAF scaffold rather than invent a second one; the step gives the exact assertions to make (`_setPointPositionsCalls` non-empty, `_pauseCalls >= 1`). All other steps contain complete code.

**Type consistency:** `ClusterFootprints` ({cx,cy,r}) is produced in Task 2 and consumed unchanged in Tasks 3, 8, 11. `clusterColorBuffer`/`colorForCluster` defined in Task 5, used in Tasks 8/11. `createClusterTransitionLayer` API ({seedFrom,setTarget,step,snapshot}) defined in Task 6, used in Task 10. `selectVisibleLabels`/`LabelCandidate` defined in Task 7, used in Task 8. `clusterPackedPositions` prop defined in Task 10, supplied in Task 11. Consistent.

**Known risk:** Phase 6 depends on cosmos.gl honoring `pause()` + pushed positions — guarded by the mandatory spike with a stated fallback (mode-scoped `enableSimulation:false`).
