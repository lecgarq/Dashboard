# Access Map — 2D Infographic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/users/spatial-graph` into a light/dark-aware 2D "infographic" access map — loads pre-grouped by Role with a settle animation, top-12 single-color clusters + grey "Other", cluster labels, a legend, sized dots, and gossamer same-user threads — reusing the existing cosmos.gl 2D GPU engine.

**Architecture:** Pure helpers compute colors/sizes/active-dimension off the existing `NodeFeatureSnapshot`; `AccessAnalysisShell` flips the renderer to 2D-default and wires those buffers + two new overlay components (Legend, MapClusterLabels) into the already-built `GraphCanvas`/`GraphInteractions`/physics stack. No data-pipeline changes.

**Tech Stack:** Next.js (App Router) · React 18 · TypeScript · vitest 4 · @testing-library/react · cosmos.gl (GPU 2D) · d3-force-3d (physics worker) · next-themes.

**Spec:** `docs/superpowers/specs/2026-06-05-access-map-2d-infographic-redesign-design.md`

**Commands (Windows / PowerShell or Bash tool):**
- Single unit file: `npx vitest run "app/(dashboard)/users/access-analysis/<file>.test.ts"`
- Types: `npx tsc --noEmit`
- E2E: `npm run test:e2e` (Playwright, :3100 harness)
- Build (NEVER while :3000 is running): `npm run build`

**Conventions observed in this folder:** pure helpers are `*.ts` with co-located `*.test.ts`; components are `*.tsx`; colors are RGBA `Float32Array(n*4)` in [0,1]; the renderer never computes color/size (REND-04 purity — it only uploads precomputed buffers).

---

## Pre-flight (read-only, no commit)

- [ ] **Confirm staging index is clean before each commit.** This branch carries large WIP; commit only the explicit paths in each task.

```bash
git -C "C:/LECG/Dashboard" diff --cached --name-only   # must be empty before you stage a task
```

- [ ] **Confirm the worker exposes live positions for centroids.** Task 7 calls `physics.getPositions()` on a throttle. Verify the worker-backed layer returns the *current* positions (not an empty/stale buffer):

```bash
grep -n "getPositions" "C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/physicsLayerWorker.ts"
```
Expected: a `getPositions` implementation that returns the latest synced `Float32Array(n*3)`. If it returns empty until first sync, Task 7's centroid tick still degrades gracefully (it skips a frame when positions are all-zero) — note it and proceed.

---

## Task 1: `buildNodeSizes` — per-node radius by access breadth

**Files:**
- Create: `app/(dashboard)/users/access-analysis/nodeSizes.ts`
- Test: `app/(dashboard)/users/access-analysis/nodeSizes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// nodeSizes.test.ts
import { describe, it, expect } from "vitest";
import { buildNodeSizes, ACCESS_WEIGHT } from "./nodeSizes";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function f(p: Partial<NodeFeatureSnapshot>): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "", project: "", role: "",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active", ...p,
  };
}

describe("buildNodeSizes", () => {
  it("returns one radius per feature, all within [MIN,MAX]", () => {
    const feats = [f({}), f({ permissionStrength: 5, isAdmin: true, projectCount: 30 })];
    const sizes = buildNodeSizes(feats);
    expect(sizes).toBeInstanceOf(Float32Array);
    expect(sizes.length).toBe(2);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(2);
      expect(s).toBeLessThanOrEqual(5.5);
    }
  });

  it("is monotonic: more access => larger-or-equal radius", () => {
    const low = f({ permissionStrength: 0, isAdmin: false, projectCount: 1 });
    const high = f({ permissionStrength: 5, isAdmin: true, projectCount: 20 });
    const [sLow, sHigh] = buildNodeSizes([low, high]);
    expect(sHigh).toBeGreaterThan(sLow);
  });

  it("admin outranks a non-admin of equal permission strength", () => {
    const plain = f({ permissionStrength: 3, isAdmin: false, projectCount: 2 });
    const admin = f({ permissionStrength: 3, isAdmin: true, projectCount: 2 });
    const [sPlain, sAdmin] = buildNodeSizes([plain, admin]);
    expect(sAdmin).toBeGreaterThan(sPlain);
  });

  it("ACCESS_WEIGHT is pure and handles missing optionals as zero", () => {
    expect(ACCESS_WEIGHT(f({}))).toBe(0 + 0 + Math.log2(1 + 1));
  });

  it("degenerate all-equal input returns all MIN (no NaN from /0)", () => {
    const sizes = buildNodeSizes([f({}), f({}), f({})]);
    for (const s of sizes) expect(s).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/nodeSizes.test.ts"`
Expected: FAIL — `buildNodeSizes` / `ACCESS_WEIGHT` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// nodeSizes.ts
/**
 * nodeSizes.ts — Pure per-node radius buffer for the 2D access map.
 * Bigger dot = broader access (admin / many projects / strong permission).
 * No React/DOM/IO. Returns world-unit radii consumed by GraphCanvas `nodeSizes`.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

const MIN_R = 2.0;
const MAX_R = 5.5;

/** Pure access-breadth weight: permission strength + admin bonus + log(projects). */
export function ACCESS_WEIGHT(f: NodeFeatureSnapshot): number {
  const perm = f.permissionStrength ?? 0;          // 0..5
  const admin = f.isAdmin ? 2 : 0;                 // governance bonus
  const breadth = Math.log2(1 + (f.projectCount ?? 1)); // diminishing returns
  return perm + admin + breadth;
}

/** RGBA-free Float32Array(n) of per-node radii in [MIN_R, MAX_R]. */
export function buildNodeSizes(features: ReadonlyArray<NodeFeatureSnapshot>): Float32Array {
  const out = new Float32Array(features.length);
  let max = 0;
  for (const f of features) max = Math.max(max, ACCESS_WEIGHT(f));
  for (let i = 0; i < features.length; i++) {
    const t = max > 0 ? ACCESS_WEIGHT(features[i]) / max : 0;
    out[i] = MIN_R + (MAX_R - MIN_R) * t;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/nodeSizes.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/nodeSizes.ts" "app/(dashboard)/users/access-analysis/nodeSizes.test.ts"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): buildNodeSizes — per-node radius by access breadth"
```

---

## Task 2: `buildBucketedColors` — top-N colors + grey Other + legend model

**Files:**
- Create: `app/(dashboard)/users/access-analysis/bucketedColors.ts`
- Test: `app/(dashboard)/users/access-analysis/bucketedColors.test.ts`

This reuses `categoryForColor` and `getDimension`/`colorScale` from `nodeColors.ts`/`dimensionRegistry.ts` (already verified to exist).

- [ ] **Step 1: Write the failing test**

```ts
// bucketedColors.test.ts
import { describe, it, expect } from "vitest";
import { buildBucketedColors, CATEGORICAL_PALETTE, OTHER_GREY } from "./bucketedColors";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function f(role: string): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "", project: "", role,
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: ">90d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active",
  };
}

describe("buildBucketedColors", () => {
  it("colors all distinct values when count <= maxColors and emits no Other row", () => {
    const feats = [f("A"), f("A"), f("B"), f("C")];
    const { colors, legend } = buildBucketedColors(feats, "role", 12);
    expect(colors.length).toBe(feats.length * 4);
    expect(legend.some((l) => l.isOther)).toBe(false);
    expect(legend.find((l) => l.label === "A")?.count).toBe(2);
    // total counts across legend equals feature count
    expect(legend.reduce((s, l) => s + l.count, 0)).toBe(feats.length);
  });

  it("ranks by count desc, keeps top-N, folds the rest into one grey Other", () => {
    // 3 of 'big', 1 each of 5 small => maxColors=2 keeps big + next, Other=rest
    const feats = [
      f("big"), f("big"), f("big"),
      f("s1"), f("s2"), f("s3"), f("s4"),
    ];
    const { legend } = buildBucketedColors(feats, "role", 2);
    expect(legend[0].label).toBe("big");
    expect(legend[0].count).toBe(3);
    const other = legend.find((l) => l.isOther);
    expect(other).toBeTruthy();
    expect(other!.color).toEqual(OTHER_GREY);
    // top-2 colored + Other; total preserved
    expect(legend.filter((l) => !l.isOther).length).toBe(2);
    expect(legend.reduce((s, l) => s + l.count, 0)).toBe(feats.length);
  });

  it("assigns palette colors to the colored rows and grey to Other members in the buffer", () => {
    const feats = [f("big"), f("big"), f("small")];
    const { colors } = buildBucketedColors(feats, "role", 1);
    // 'big' (top-1) gets palette[0]; 'small' falls to grey
    expect([colors[0], colors[1], colors[2]]).toEqual(CATEGORICAL_PALETTE[0]);
    expect([colors[8], colors[9], colors[10]]).toEqual(OTHER_GREY);
    expect(colors[3]).toBe(1); // alpha
  });

  it("ordered dimensions return a ramp buffer and an empty discrete legend", () => {
    // riskScore is an ordered/colorScale dim in the registry; legend is empty (gradient handled by UI)
    const feats = [f("A"), f("B")];
    const { legend } = buildBucketedColors(feats, "riskScore", 12);
    expect(Array.isArray(legend)).toBe(true);
    expect(legend.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// bucketedColors.ts
/**
 * bucketedColors.ts — Top-N categorical coloring with a grey "Other" bucket,
 * plus a legend model. Keeps the infographic readable: at most `maxColors`
 * distinct hues; everything else collapses to one muted grey.
 *
 * Ordered/numeric dims (riskScore, permissionStrength, activityMix…) keep the
 * existing sequential ramp from nodeColors.buildNodeColors and return an EMPTY
 * discrete legend (a gradient legend is a UI concern, deferred).
 *
 * Pure: no React/DOM/IO. Returns RGBA Float32Array(n*4) in [0,1].
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { categoryForColor, buildNodeColors, type ColorMode } from "./nodeColors";
import { getDimension, type DimensionId } from "./dimensionRegistry";

export type RGB = [number, number, number];

/** 12 distinguishable hues (legible on both white and near-black). RGB in [0,1]. */
export const CATEGORICAL_PALETTE: readonly RGB[] = [
  [0.231, 0.510, 0.965], // blue
  [0.976, 0.451, 0.086], // orange
  [0.133, 0.773, 0.369], // green
  [0.545, 0.361, 0.965], // purple
  [0.024, 0.714, 0.831], // cyan
  [0.918, 0.702, 0.031], // yellow
  [0.925, 0.282, 0.600], // pink
  [0.078, 0.722, 0.651], // teal
  [0.937, 0.267, 0.267], // red
  [0.659, 0.333, 0.969], // violet
  [0.388, 0.400, 0.945], // indigo
  [0.518, 0.800, 0.086], // lime
];

/** Muted grey for the residual "Other" bucket. */
export const OTHER_GREY: RGB = [0.706, 0.737, 0.784];

export interface LegendEntry {
  label: string;
  color: RGB;
  count: number;
  isOther?: boolean;
}

export interface BucketedColors {
  colors: Float32Array;
  legend: LegendEntry[];
}

/** True when this color mode is an ordered/sequential ramp (no discrete buckets). */
function isOrdered(mode: ColorMode): boolean {
  const d = getDimension(mode as DimensionId);
  return d?.colorScale === "ordered";
}

export function buildBucketedColors(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  mode: ColorMode,
  maxColors = 12,
): BucketedColors {
  // Ordered ramp path: reuse the existing blue→red ramp, no discrete legend.
  if (isOrdered(mode)) {
    return { colors: buildNodeColors(features, mode), legend: [] };
  }

  // Count members per category.
  const counts = new Map<string, number>();
  const cats: string[] = new Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const c = categoryForColor(features[i], mode);
    cats[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  // Rank: count desc, label asc (deterministic tie-break).
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );

  const colorByCat = new Map<string, RGB>();
  const legend: LegendEntry[] = [];
  const top = ranked.slice(0, maxColors);
  const rest = ranked.slice(maxColors);

  top.forEach(([label, count], i) => {
    const color = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length];
    colorByCat.set(label, color);
    legend.push({ label, color, count });
  });
  if (rest.length > 0) {
    const otherCount = rest.reduce((s, [, c]) => s + c, 0);
    for (const [label] of rest) colorByCat.set(label, OTHER_GREY);
    legend.push({ label: "Other", color: OTHER_GREY, count: otherCount, isOther: true });
  }

  // Fill the RGBA buffer.
  const colors = new Float32Array(features.length * 4);
  for (let i = 0; i < features.length; i++) {
    const rgb = colorByCat.get(cats[i]) ?? OTHER_GREY;
    colors[i * 4] = rgb[0];
    colors[i * 4 + 1] = rgb[1];
    colors[i * 4 + 2] = rgb[2];
    colors[i * 4 + 3] = 1;
  }
  return { colors, legend };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"`
Expected: PASS (5 tests). If `riskScore` is not an ordered registry dim, adjust the ordered-path test to use whatever `colorScale: "ordered"` dim exists (grep: `colorScale` in `dimensionRegistry.ts`).

- [ ] **Step 5: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/bucketedColors.ts" "app/(dashboard)/users/access-analysis/bucketedColors.test.ts"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): buildBucketedColors — top-N palette + grey Other + legend model"
```

---

## Task 3: `activeGroupingDimension` — dominant slider → grouping/color dim

**Files:**
- Create: `app/(dashboard)/users/access-analysis/activeGrouping.ts`
- Test: `app/(dashboard)/users/access-analysis/activeGrouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// activeGrouping.test.ts
import { describe, it, expect } from "vitest";
import { activeGroupingDimension } from "./activeGrouping";

const ORDER = ["role", "project", "user", "company"];

describe("activeGroupingDimension", () => {
  it("returns the fallback when every slider is 0", () => {
    expect(activeGroupingDimension({ role: 0, project: 0 }, ORDER, "role")).toBe("role");
  });
  it("returns the single non-zero slider's dim", () => {
    expect(activeGroupingDimension({ role: 0, project: 70 }, ORDER, "role")).toBe("project");
  });
  it("returns the highest slider when several are non-zero", () => {
    expect(activeGroupingDimension({ role: 30, project: 80, user: 10 }, ORDER, "role")).toBe("project");
  });
  it("breaks ties by ORDER (first wins)", () => {
    expect(activeGroupingDimension({ role: 50, project: 50 }, ORDER, "role")).toBe("role");
  });
  it("ignores ids absent from ORDER", () => {
    expect(activeGroupingDimension({ ghost: 99, role: 40 }, ORDER, "role")).toBe("role");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/activeGrouping.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// activeGrouping.ts
/**
 * activeGrouping.ts — Pure: which dimension is the dominant grouping force.
 * The dominant slider drives clustering, cluster labels, and (unless overridden)
 * the node color + legend. Ties resolve by `order` so the result is stable.
 */
export function activeGroupingDimension(
  values: Record<string, number>,
  order: readonly string[],
  fallback: string,
): string {
  let best = fallback;
  let bestVal = 0;
  for (const id of order) {
    const v = values[id] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = id;
    }
  }
  return bestVal > 0 ? best : fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/activeGrouping.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/activeGrouping.ts" "app/(dashboard)/users/access-analysis/activeGrouping.test.ts"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): activeGroupingDimension — dominant-slider selector"
```

---

## Task 4: Default-grouping by Role (with Project fallback) + scale-bug fix

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/catalogSliders.ts`
- Test: `app/(dashboard)/users/access-analysis/catalogSliders.test.ts` (create)
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:286-303` (normalize base defaults — see Step 6)

**Why the scale fix:** `catalogDefaultSliders()` is read in TWO scales — `SliderContext` uses it as 0..100; `AccessAnalysisShell` passes it to physics which expects 0..1. Today it returns all-`0` so the mismatch is invisible. A non-zero default exposes it, so the shell must divide base defaults by 100 when building `initialSliders`.

- [ ] **Step 1: Write the failing test**

```ts
// catalogSliders.test.ts
import { describe, it, expect } from "vitest";
import { catalogDefaultSliders, GROUPING_DEFAULT } from "./catalogSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, available = true): CatalogDimension {
  // Minimal shape — only fields catalogSliders reads.
  return { id, label: id, surfaces: ["slider"], available } as unknown as CatalogDimension;
}

describe("catalogDefaultSliders", () => {
  it("defaults Role to the grouping value, everything else 0", () => {
    const cat = [dim("role"), dim("project"), dim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role).toBe(GROUPING_DEFAULT);
    expect(d.project).toBe(0);
    expect(d.user).toBe(0);
  });

  it("falls back to Project when Role is absent/unavailable", () => {
    const cat = [dim("role", false), dim("project"), dim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role ?? 0).toBe(0);          // role greyed → not an available slider
    expect(d.project).toBe(GROUPING_DEFAULT);
  });

  it("leaves all 0 when neither role nor project is available", () => {
    const cat = [dim("user"), dim("company")];
    const d = catalogDefaultSliders(cat);
    expect(Object.values(d).every((v) => v === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/catalogSliders.test.ts"`
Expected: FAIL — `GROUPING_DEFAULT` not exported; Role not defaulted.

- [ ] **Step 3: Modify `catalogSliders.ts`**

Replace the `catalogDefaultSliders` function (lines 17-22) with:

```ts
/** Grouping strength applied to the default clustering dimension on first load. */
export const GROUPING_DEFAULT = 60;

/**
 * Default state: the primary grouping dimension starts engaged so the map LOADS
 * already organized (settle-on-load); every other slider is 0 for clean
 * single-dimension clusters. Prefers Role; falls back to Project; else all 0.
 */
export function catalogDefaultSliders(catalog: readonly CatalogDimension[]): Record<string, number> {
  const dims = sliderDimensions(catalog);                  // available sliders only
  const out: Record<string, number> = {};
  for (const d of dims) out[d.id] = 0;
  const has = (id: string): boolean => dims.some((d) => d.id === id);
  const primary = has("role") ? "role" : has("project") ? "project" : null;
  if (primary) out[primary] = GROUPING_DEFAULT;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/catalogSliders.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing suite touching this helper to catch fallout**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/sliderPresets.test.ts" "app/(dashboard)/users/access-analysis/physicsClustering.test.ts"`
Expected: PASS (no regressions from the default change). If a test asserted "all sliders 0 at default", update it to expect the primary at `GROUPING_DEFAULT`.

- [ ] **Step 6: Fix the 0..100 → 0..1 base-default normalization in the shell**

In `AccessAnalysisShell.tsx`, the block that builds `initialSliders` (around lines 286-303) currently spreads catalog defaults verbatim and only normalizes the localStorage overrides. Change the base spread to normalize too. Replace:

```ts
const initialSliders: Record<string, number> = { ...catalogDefaultSliders(catalog) };
```

with:

```ts
// catalogDefaultSliders is in 0..100 (SliderContext scale); physics wants 0..1.
const initialSliders: Record<string, number> = Object.fromEntries(
  Object.entries(catalogDefaultSliders(catalog)).map(([k, v]) => [k, v / 100]),
);
```

(The localStorage override loop below it already divides by 100, so it stays unchanged and consistent.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/catalogSliders.ts" "app/(dashboard)/users/access-analysis/catalogSliders.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): default group-by Role (Project fallback) + fix slider default scale"
```

---

## Task 5: Theme-aware gossamer link colors

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/linkEmphasis.ts`
- Test: `app/(dashboard)/users/access-analysis/linkEmphasis.test.ts` (create or extend)

`computeLinkEmphasisColors(edges, activeUserIds, colors = DEFAULT_LINK_COLORS)` already accepts a `LinkColorOpts`. Add light/dark presets.

- [ ] **Step 1: Write the failing test**

```ts
// linkEmphasis.test.ts
import { describe, it, expect } from "vitest";
import { GOSSAMER_LIGHT, GOSSAMER_DARK } from "./linkEmphasis";

describe("gossamer link presets", () => {
  it("light base is a dark cool grey at ~0.10 alpha", () => {
    expect(GOSSAMER_LIGHT.base[3]).toBeCloseTo(0.10, 2);
    // darker than mid-grey so it reads on white
    expect(GOSSAMER_LIGHT.base[0]).toBeLessThan(0.5);
  });
  it("dark base is a light grey, slightly higher alpha so it reads on near-black", () => {
    expect(GOSSAMER_DARK.base[3]).toBeGreaterThan(GOSSAMER_LIGHT.base[3]);
    expect(GOSSAMER_DARK.base[0]).toBeGreaterThan(0.5);
  });
  it("both keep bright > base alpha for same-user focus emphasis", () => {
    expect(GOSSAMER_LIGHT.bright[3]).toBeGreaterThan(GOSSAMER_LIGHT.base[3]);
    expect(GOSSAMER_DARK.bright[3]).toBeGreaterThan(GOSSAMER_DARK.base[3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"`
Expected: FAIL — `GOSSAMER_LIGHT`/`GOSSAMER_DARK` not exported.

- [ ] **Step 3: Add the presets to `linkEmphasis.ts`**

After the existing `DEFAULT_LINK_COLORS` definition, add:

```ts
/** Gossamer threads for the LIGHT (white) infographic: dark cool-grey, ~0.10 alpha. */
export const GOSSAMER_LIGHT: LinkColorOpts = {
  base: [0.36, 0.39, 0.45, 0.10],
  bright: [0.20, 0.45, 0.95, 0.85], // same-user focus = blue accent
  dim: [0.36, 0.39, 0.45, 0.03],
};

/** Gossamer threads for the DARK (near-black) variant: light grey, slightly higher alpha. */
export const GOSSAMER_DARK: LinkColorOpts = {
  base: [0.68, 0.71, 0.77, 0.13],
  bright: [0.55, 0.74, 1.0, 0.9],
  dim: [0.68, 0.71, 0.77, 0.04],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/linkEmphasis.ts" "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): gossamer light/dark link-color presets"
```

---

## Task 6: `Legend` overlay component

**Files:**
- Create: `app/(dashboard)/users/access-analysis/Legend.tsx`
- Test: `app/(dashboard)/users/access-analysis/Legend.test.tsx`

Consumes the `LegendEntry[]` from Task 2. Theme-aware via semantic Tailwind tokens (`bg-card`, `text-foreground`, `border`) which already flip with the app theme (verified in Toolbar).

- [ ] **Step 1: Write the failing test**

```tsx
// Legend.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Legend } from "./Legend";
import type { LegendEntry } from "./bucketedColors";

const entries: LegendEntry[] = [
  { label: "Coordinators", color: [0.2, 0.5, 0.9], count: 1135 },
  { label: "Reviewers", color: [0.9, 0.4, 0.1], count: 892 },
  { label: "Other", color: [0.7, 0.7, 0.78], count: 240, isOther: true },
];

describe("Legend", () => {
  it("renders a row per entry with label + formatted count", () => {
    render(<Legend entries={entries} />);
    expect(screen.getByTestId("graph-legend")).toBeTruthy();
    expect(screen.getByText("Coordinators")).toBeTruthy();
    expect(screen.getByText("1,135")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
  });

  it("renders nothing when entries is empty (e.g. ordered ramp)", () => {
    const { container } = render(<Legend entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/Legend.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// Legend.tsx
"use client";

/**
 * Legend.tsx — Infographic legend overlay for the 2D access map.
 * One row per colored cluster (swatch + label + count) plus an optional grey
 * "Other" row. Reflects the COLOR dimension. Theme-aware via semantic tokens.
 * Renders nothing for an empty model (ordered/ramp dims have no discrete legend).
 */
import type { LegendEntry } from "./bucketedColors";

function rgbCss([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export function Legend({ entries }: { entries: LegendEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="graph-legend"
      className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[60%] rounded-lg border bg-card/85 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map((e) => (
          <span key={e.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: rgbCss(e.color) }}
            />
            <span className={e.isOther ? "text-muted-foreground" : ""}>{e.label}</span>
            <span className="text-muted-foreground">{e.count.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/Legend.test.tsx"`
Expected: PASS (2 tests). (If the suite needs jsdom/RTL setup, this folder already has `.test.tsx` component tests — they share the configured environment.)

- [ ] **Step 5: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/Legend.tsx" "app/(dashboard)/users/access-analysis/Legend.test.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): Legend overlay component"
```

---

## Task 7: `MapClusterLabels` overlay — live centroid labels (palette + theme aware)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/MapClusterLabels.tsx`
- Test: `app/(dashboard)/users/access-analysis/MapClusterLabels.test.tsx`

**Why a new component, not the existing `ClusterLabels`:** `ClusterLabels` is from the discrete-blob era — it needs precomputed footprint centers/radii and colors each swatch via `colorForCluster(c, k)` (NOT our top-N palette) with a hardcoded dark chip. Our map needs labels whose color matches the bucketed legend and whose chip flips with the theme, anchored at the LIVE centroid of each colored cluster. This is a transparent, justified deviation from the spec line "wire the existing ClusterLabels"; it reuses the same `spaceToScreen` projection pattern.

This component groups nodes by category (via `buildClusterAssignment`), computes each top-N cluster's live centroid from `physics.getPositions()` on a ~30Hz throttle, projects to screen via the 2D handle, and positions a label chip there. Only renders in 2D.

- [ ] **Step 1: Write the failing test (pure centroid helper first)**

The math is the testable part; the rAF/projection is integration. Export a pure `clusterCentroids` and test it.

```tsx
// MapClusterLabels.test.tsx
import { describe, it, expect } from "vitest";
import { clusterCentroids } from "./MapClusterLabels";

describe("clusterCentroids", () => {
  it("averages member x/y per cluster id and counts members", () => {
    // 4 nodes, stride-3 positions; clusterIds: [0,0,1,1]
    const pos = new Float32Array([
      0, 0, 0,   2, 4, 0,   10, 10, 0,   12, 14, 0,
    ]);
    const ids = new Int32Array([0, 0, 1, 1]);
    const { cx, cy, counts } = clusterCentroids(pos, ids, 2);
    expect(cx[0]).toBeCloseTo(1);   // (0+2)/2
    expect(cy[0]).toBeCloseTo(2);   // (0+4)/2
    expect(cx[1]).toBeCloseTo(11);  // (10+12)/2
    expect(cy[1]).toBeCloseTo(12);  // (10+14)/2
    expect(Array.from(counts)).toEqual([2, 2]);
  });

  it("returns count 0 (NaN-free) for an empty cluster id", () => {
    const pos = new Float32Array([0, 0, 0]);
    const ids = new Int32Array([0]);
    const { cx, cy, counts } = clusterCentroids(pos, ids, 2);
    expect(counts[1]).toBe(0);
    expect(cx[1]).toBe(0);
    expect(cy[1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/MapClusterLabels.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// MapClusterLabels.tsx
"use client";

/**
 * MapClusterLabels.tsx — HTML overlay naming the colored clusters on the 2D map.
 * Anchors each label at its cluster's LIVE centroid (mean node position), projected
 * to screen via the cosmos 2D handle's spaceToScreen each ~30Hz frame so it tracks
 * the settle + pan/zoom. Colors match the bucketed legend; the chip flips with the
 * theme. Renders only in 2D. Only the top-N (by member count) clusters get a chip.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { LegendEntry, RGB } from "./bucketedColors";

const MAX_LABELS = 16;     // top clusters worth a chip
const MIN_SEP_PX = 18;     // basic vertical de-clutter

/** Pure: per-cluster centroid (mean x/y) + member counts. Stride-3 positions. */
export function clusterCentroids(
  positions: Float32Array,
  clusterIds: Int32Array,
  k: number,
): { cx: Float32Array; cy: Float32Array; counts: Int32Array } {
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const counts = new Int32Array(k);
  for (let i = 0; i < clusterIds.length; i++) {
    const c = clusterIds[i];
    if (c < 0 || c >= k) continue;
    cx[c] += positions[i * 3];
    cy[c] += positions[i * 3 + 1];
    counts[c]++;
  }
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      cx[c] /= counts[c];
      cy[c] /= counts[c];
    }
  }
  return { cx, cy, counts };
}

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export interface MapClusterLabelsProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  /** Per-node cluster id aligned to physics node order (from buildClusterAssignment). */
  clusterIds: Int32Array;
  /** Cluster id → display label (from buildClusterAssignment.labels). */
  labels: string[];
  /** Legend rows — used for per-label color + to skip the grey "Other" cluster. */
  legend: LegendEntry[];
  /** Latest positions snapshot getter (stride-3). Usually () => physics.getPositions(). */
  getPositions: () => Float32Array | null;
}

export function MapClusterLabels({
  graphRef, mode, clusterIds, labels, legend, getPositions,
}: MapClusterLabelsProps): React.JSX.Element | null {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const k = labels.length;

  // Map label string → color + "is Other" from the legend; skip Other clusters.
  const colorByLabel = useMemo(() => {
    const m = new Map<string, { color: RGB; isOther: boolean }>();
    for (const e of legend) m.set(e.label, { color: e.color, isOther: !!e.isOther });
    return m;
  }, [legend]);

  // Which cluster ids to render: those present in the legend and not "Other".
  const renderIds = useMemo(() => {
    const ids: number[] = [];
    for (let c = 0; c < k; c++) {
      const info = colorByLabel.get(labels[c]);
      if (info && !info.isOther) ids.push(c);
    }
    return ids.slice(0, MAX_LABELS);
  }, [k, labels, colorByLabel]);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (mode !== "2d" || renderIds.length === 0) return;
    let active = true;
    let raf = 0;
    let last = 0;
    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < 33) { raf = requestAnimationFrame(tick); return; }
      last = ts;
      const gh = graphRef.current;
      const handle = gh && gh.mode === "2d" ? gh.handle : null;
      const pos = getPositions();
      if (handle?.spaceToScreen && pos && pos.length >= clusterIds.length * 3) {
        const { cx, cy, counts } = clusterCentroids(pos, clusterIds, k);
        const placed: number[] = []; // screen Y of placed labels (de-clutter)
        renderIds.forEach((c, t) => {
          const el = itemRefs.current[t];
          if (!el) return;
          if (counts[c] === 0) { el.style.opacity = "0"; return; }
          const [sx, sy] = handle.spaceToScreen([cx[c], cy[c]]);
          const collide = placed.some((y) => Math.abs(y - sy) < MIN_SEP_PX);
          if (collide) { el.style.opacity = "0"; return; }
          placed.push(sy);
          el.style.opacity = "1";
          el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [mode, renderIds, clusterIds, k, graphRef, getPositions]);

  if (mode !== "2d" || renderIds.length === 0) return null;

  const chipBg = dark ? "rgba(9,9,11,0.55)" : "rgba(255,255,255,0.78)";
  const chipColor = dark ? "#fafafa" : "#1f2937";
  const chipShadow = dark ? "0 1px 2px rgba(0,0,0,0.7)" : "0 1px 2px rgba(0,0,0,0.18)";

  return (
    <div
      data-testid="map-cluster-labels"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 6 }}
    >
      {renderIds.map((c, t) => (
        <div
          key={`${c}:${labels[c]}`}
          data-testid="map-cluster-label"
          ref={(el) => { itemRefs.current[t] = el; }}
          style={{
            position: "absolute", left: 0, top: 0, transform: "translate(-50%,-50%)",
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            fontSize: 12, fontWeight: 600, lineHeight: 1.2,
            color: chipColor, background: chipBg, borderRadius: 6, padding: "2px 7px",
            opacity: 0, transition: "opacity 150ms ease", textShadow: chipShadow,
            backdropFilter: "blur(2px)",
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: "50%", flex: "0 0 auto",
            background: rgbCss(colorByLabel.get(labels[c])!.color),
          }} />
          {labels[c]}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/MapClusterLabels.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (Confirms the `GraphCanvasHandle` 2D-mode narrowing + `spaceToScreen` usage type-check against the real handle.)

- [ ] **Step 6: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/MapClusterLabels.tsx" "app/(dashboard)/users/access-analysis/MapClusterLabels.test.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): MapClusterLabels — live centroid labels (palette + theme aware)"
```

---

## Task 8: Toolbar — 2D/3D toggle, grouped-by indicator, color auto/override reset

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/Toolbar.tsx`
- Test: `app/(dashboard)/users/access-analysis/Toolbar.test.tsx` (create)

Adds: a 2D/3D segmented toggle (re-instates the removed pill), a read-only "Grouped by: X" indicator, and an "auto" badge + "Reset" control on the Color select when not overridden.

- [ ] **Step 1: Write the failing test**

```tsx
// Toolbar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "./Toolbar";
import { FilterProvider } from "./FilterContext";

function renderToolbar(props: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  const onModeChange = vi.fn();
  const onColorModeChange = vi.fn();
  const onColorReset = vi.fn();
  render(
    <FilterProvider>
      <Toolbar
        features={[]}
        mode="2d"
        onModeChange={onModeChange}
        lassoActive={false}
        onLassoToggle={() => {}}
        colorMode="role"
        onColorModeChange={onColorModeChange}
        groupedByLabel="Role"
        colorIsAuto
        onColorReset={onColorReset}
        {...props}
      />
    </FilterProvider>,
  );
  return { onModeChange, onColorModeChange, onColorReset };
}

describe("Toolbar 2D-map controls", () => {
  it("shows the grouped-by indicator", () => {
    renderToolbar();
    expect(screen.getByTestId("toolbar-grouped-by").textContent).toContain("Role");
  });
  it("fires onModeChange when 3D is clicked", () => {
    const { onModeChange } = renderToolbar();
    fireEvent.click(screen.getByTestId("toolbar-mode-3d"));
    expect(onModeChange).toHaveBeenCalledWith("3d");
  });
  it("hides the color Reset when color is auto, shows it when overridden", () => {
    const { rerender } = (() => {
      const r = renderToolbar({ colorIsAuto: true });
      return { rerender: () => {} , ...r };
    })();
    expect(screen.queryByTestId("toolbar-color-reset")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/Toolbar.test.tsx"`
Expected: FAIL — new props/testids missing.

- [ ] **Step 3: Extend `ToolbarProps` and the JSX**

In `Toolbar.tsx`, add to `ToolbarProps` (after `onColorModeChange`):

```ts
  /** Display label of the active grouping dimension (e.g. "Role"). */
  groupedByLabel?: string;
  /** True when color is auto-following the grouping dim (no manual override). */
  colorIsAuto?: boolean;
  /** Clears a manual color override, returning color to auto-follow. */
  onColorReset?: () => void;
```

Add them to the destructured params (with defaults `groupedByLabel = ""`, `colorIsAuto = true`, `onColorReset`).

Insert the mode toggle + grouped-by indicator right after the opening `<header ...>` (before the search input):

```tsx
<div className="flex items-center gap-1" data-testid="toolbar-mode">
  <button
    type="button"
    data-testid="toolbar-mode-2d"
    onClick={() => onModeChange("2d")}
    className={`rounded-l-md border px-2.5 py-1.5 text-sm ${mode === "2d" ? "bg-blue-500 text-white border-blue-500" : "hover:bg-accent"}`}
  >2D</button>
  <button
    type="button"
    data-testid="toolbar-mode-3d"
    onClick={() => onModeChange("3d")}
    className={`-ml-px rounded-r-md border px-2.5 py-1.5 text-sm ${mode === "3d" ? "bg-blue-500 text-white border-blue-500" : "hover:bg-accent"}`}
  >3D</button>
</div>
{groupedByLabel ? (
  <span data-testid="toolbar-grouped-by" className="text-sm text-muted-foreground">
    Grouped by: <b className="text-foreground">{groupedByLabel}</b>
  </span>
) : null}
```

Then, inside the existing Color `<label>` block, after the `<select>`, add the auto badge / reset:

```tsx
{colorIsAuto ? (
  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">auto</span>
) : (
  <button
    type="button"
    data-testid="toolbar-color-reset"
    onClick={() => onColorReset?.()}
    className="text-xs text-blue-500 underline-offset-2 hover:underline"
  >Reset</button>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/Toolbar.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0 errors.

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/Toolbar.tsx" "app/(dashboard)/users/access-analysis/Toolbar.test.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): Toolbar 2D/3D toggle + grouped-by indicator + color auto/reset"
```

---

## Task 9: GraphCanvas2D — 0.5px gossamer link width

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx:264` (cosmos config)

- [ ] **Step 1: Add `linkWidth` to the cosmos config**

In the `g = new Graph(div, { ... })` config object (the block containing `renderLinks: true,` at ~line 272), add:

```ts
        linkWidth: 0.5,
```

directly beneath `renderLinks: true,`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If cosmos's config type rejects `linkWidth`, it accepts a function form `linkWidth: () => 0.5` — use that.)

- [ ] **Step 3: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): 0.5px gossamer link width in 2D canvas"
```

---

## Task 10: Wire it all into `AccessAnalysisShell` / `ShellBody`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

This is the integration task. It (a) flips default mode to 2D + real `setMode`, (b) derives the active grouping dimension + color auto-follow/override, (c) builds bucketed colors + node sizes + theme gossamer links, (d) mounts `Legend` + `MapClusterLabels`, (e) feeds the new Toolbar props.

- [ ] **Step 1: Flip mode to 2D state (outer `AccessAnalysisShell`)**

Replace lines 226-227:

```ts
  // 3D-only: the 2D cosmos path stays in the repo but is never mounted here.
  const mode = "3d" as const;
  const setMode = (_m: "2d" | "3d"): void => { /* 3D-only: mode is fixed */ };
```

with:

```ts
  // 2D-default infographic map; 3D remains reachable via the toolbar toggle.
  const [mode, setMode] = useState<"2d" | "3d">("2d");
```

`useState` is already imported. `gpuSimulation` must be true on 2D for live motion — confirm Step 7.

- [ ] **Step 2: Add imports at the top of the file**

```ts
import { useTheme } from "next-themes";
import { useSliders } from "./SliderContext";
import { activeGroupingDimension } from "./activeGrouping";
import { buildBucketedColors } from "./bucketedColors";
import { buildNodeSizes } from "./nodeSizes";
import { buildClusterAssignment } from "./nodeColors";
import { GOSSAMER_LIGHT, GOSSAMER_DARK } from "./linkEmphasis";
import { Legend } from "./Legend";
import { MapClusterLabels } from "./MapClusterLabels";
import { getDimension } from "./dimensionRegistry";
import { COLOR_MODE_LABELS, type ColorMode } from "./nodeColors";
```

(Some of these may already be imported — dedupe.)

- [ ] **Step 3: In `ShellBody`, derive the active grouping dim + color auto-follow/override**

Replace the existing color state line:

```ts
  const [colorMode, setColorMode] = useState<ColorMode>("role");
```

with the auto-follow model:

```ts
  const { resolvedTheme } = useTheme();
  const { values: sliderValues } = useSliders();

  // Active grouping dim = dominant slider (Role default). Catalog order = the
  // slider dim ids, in catalog order, for stable tie-breaks.
  const groupingOrder = useMemo(() => catalog.map((d) => d.id), [catalog]);
  const groupingDim = useMemo(
    () => activeGroupingDimension(sliderValues, groupingOrder, "role"),
    [sliderValues, groupingOrder],
  );

  // Color follows the grouping dim unless the user overrides it. Override is set
  // by the toolbar color select; "Reset" clears it back to auto.
  const [colorOverride, setColorOverride] = useState<ColorMode | null>(null);
  const colorIsAuto = colorOverride === null;
  // The grouping dim is colorable only if it's a registry dim with a color surface;
  // else auto falls back to "role".
  const autoColorMode: ColorMode = useMemo(() => {
    const d = getDimension(groupingDim as never);
    return d ? (groupingDim as ColorMode) : "role";
  }, [groupingDim]);
  const colorMode: ColorMode = colorOverride ?? autoColorMode;
  const setColorMode = (m: ColorMode): void => setColorOverride(m);
  const resetColor = (): void => setColorOverride(null);
  const groupedByLabel = COLOR_MODE_LABELS[autoColorMode] ?? autoColorMode;
```

- [ ] **Step 4: Replace the node-color buffer with bucketed colors + add sizes**

Replace the existing `nodeColors` memo (lines 116-119):

```ts
  const nodeColors = useMemo<Float32Array>(
    () => buildNodeColors(features, colorMode),
    [features, colorMode],
  );
```

with:

```ts
  const bucketed = useMemo(
    () => buildBucketedColors(features, colorMode, 12),
    [features, colorMode],
  );
  const nodeColors = bucketed.colors;
  const nodeSizes = useMemo<Float32Array>(() => buildNodeSizes(features), [features]);

  // Cluster ids/labels for the centroid labels — grouped by the COLOR dimension
  // so chip colors match the legend. (Auto-follow keeps grouping≈color; under an
  // override, labels follow the colored buckets the legend describes.)
  const clusterAssign = useMemo(
    () => buildClusterAssignment(features, colorMode),
    [features, colorMode],
  );
```

- [ ] **Step 5: Make link colors theme-aware**

Replace the `baseLinkColors` memo (lines 145-149):

```ts
  const baseLinkColors = useMemo(() => {
    const colors = computeLinkEmphasisColors(edges, new Set());
    assertLinkArrays(edges.length, links, colors);
    return colors;
  }, [edges, links]);
```

with:

```ts
  const baseLinkColors = useMemo(() => {
    const opts = resolvedTheme === "dark" ? GOSSAMER_DARK : GOSSAMER_LIGHT;
    const colors = computeLinkEmphasisColors(edges, new Set(), opts);
    assertLinkArrays(edges.length, links, colors);
    return colors;
  }, [edges, links, resolvedTheme]);
```

- [ ] **Step 6: Pass new props to Toolbar, GraphCanvas, and mount overlays**

Update the `<Toolbar ... />` props to add:

```tsx
        groupedByLabel={groupedByLabel}
        colorIsAuto={colorIsAuto}
        onColorReset={resetColor}
```

Add `nodeSizes` to `<GraphCanvas ... />`:

```tsx
            <GraphCanvas
              ref={graphRef}
              physics={physics}
              nodeColors={nodeColors}
              nodeSizes={nodeSizes}
              mode={mode}
              onRendererReady={() => setRendererReady((v) => v + 1)}
              links={links}
              linkColors={baseLinkColors}
            />
```

Mount `Legend` + `MapClusterLabels` INSIDE the relative graph container (the `<div className="relative flex-1 min-h-0 min-w-0">`), after `</GraphInteractions>`:

```tsx
            <Legend entries={bucketed.legend} />
            <MapClusterLabels
              graphRef={graphRef}
              mode={mode}
              clusterIds={clusterAssign.clusterIds}
              labels={clusterAssign.labels}
              legend={bucketed.legend}
              getPositions={() => physics.getPositions()}
            />
```

- [ ] **Step 7: Ensure 2D runs the live GPU simulation (settle + drag motion)**

`GraphCanvas2D` only simulates when `gpuSimulation === true`. Confirm `GraphCanvas` forwards a truthy `gpuSimulation` to the 2D path under the `NEXT_PUBLIC_ACC_GPU_2D` flag:

```bash
grep -n "gpuSimulation\|ENABLE_GPU_2D_SIM\|NEXT_PUBLIC_ACC_GPU_2D" "C:/LECG/Dashboard/app/(dashboard)/users/access-analysis/GraphCanvas.tsx"
```
Expected: `GraphCanvas` passes `gpuSimulation={ENABLE_GPU_2D_SIM}` (or similar) to `GraphCanvas2D`. If it does NOT (e.g. it was hard-set false during the 3D-only era), set it to the flag value so 2D animates. Verify the flag default is on in `.env`/code; if off, the layout still forms via the physics-worker `pushPositions` path but without the GPU live-settle — note which path is active.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 9: Full unit suite (no regressions)**

Run: `npm test`
Expected: all green (prior baseline ~1488 + the new tests from Tasks 1-8). Investigate any red before continuing.

- [ ] **Step 10: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git -C "C:/LECG/Dashboard" commit -m "feat(acc-map): wire 2D infographic — bucketed colors, sizes, legend, labels, gossamer, auto-color"
```

---

## Task 11: E2E smoke + manual visual UAT

**Files:**
- Modify/inspect: the access-graph e2e spec (find it): `grep -rl "spatial-graph\|access-analysis" tests/e2e`

- [ ] **Step 1: Locate the existing e2e spec and its boot assertion**

```bash
grep -rln "AccessAnalysisShell\|spatial-graph\|toolbar-color-mode\|map-cluster" "C:/LECG/Dashboard/tests/e2e"
```
Expected: the spec(s) that boot the graph. Read the one that exercises `/users/spatial-graph` or the shell.

- [ ] **Step 2: Add a 2D-map smoke assertion**

In that spec, after the graph boots, assert the infographic chrome is present in 2D. Add (adapt selectors to the spec's existing `page` fixture / auth helper):

```ts
test("access map loads in 2D with legend + labels", async ({ page }) => {
  await page.goto("/users/spatial-graph");
  await expect(page.getByTestId("toolbar-mode-2d")).toBeVisible();
  await expect(page.getByTestId("graph-legend")).toBeVisible();
  // grouped-by defaults to Role
  await expect(page.getByTestId("toolbar-grouped-by")).toContainText("Role");
  // at least one cluster label chip appears once the layout settles
  await expect(page.getByTestId("map-cluster-label").first()).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 3: Run the e2e smoke**

Run: `npm run test:e2e`
Expected: the new test passes (GPU-on; on the :3100 harness with `NEXT_PUBLIC_ACC_GRAPH_TEST`). Note: per project memory, a single-boot crash or lasso-load flake under machine load is environmental, not a regression — re-run on an idle machine if it times out.

- [ ] **Step 4: Commit**

```bash
git -C "C:/LECG/Dashboard" add -- "C:/LECG/Dashboard/tests/e2e/<spec-file>"
git -C "C:/LECG/Dashboard" commit -m "test(acc-map): e2e smoke for 2D legend + cluster labels"
```

- [ ] **Step 5: Manual visual UAT (owner) — rebuild required**

The dashboard serves a built `.next`; a code change is only visible after a rebuild. Per project memory: do NOT `npm run build` while the :3000 server is running (it 500s the live site).

1. Stop the running server (Task Scheduler task / the :3000 process).
2. `npm run build`
3. `npm start` (or restart the Task Scheduler task)
4. Open `/users/spatial-graph` and verify against the spec:
   - Loads already grouped by Role with a visible settle animation (not a loose cloud).
   - Top ~12 single-color clusters + grey "Other"; legend bottom-left; cluster name labels on colored clusters.
   - Sized dots (admins/broad-access visibly larger); gossamer threads faint, not foggy.
   - Theme toggle flips canvas + legend + label chips between light and dark; the "reference look" is the light variant.
   - Dragging a non-Role slider re-settles, and the legend + labels + colors follow it (grouped-by indicator updates); the color "Reset" returns to auto.
   - 3D toggle still works (raw view, no infographic chrome).

---

## Final gates (run before declaring done)

- [ ] `npm test` → all green
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run test:e2e` → green (or only the known environmental flakes)
- [ ] Owner visual UAT signed off in both themes
- [ ] `git -C "C:/LECG/Dashboard" status` → only the intended files committed; no stray staged WIP

---

## Self-review notes (author)

- **Spec coverage:** default-grouped load (Task 4 + 10·S1), 2D default + 3D toggle (Task 8 + 10·S1), top-12 + Other colors (Task 2 + 10·S4), color auto-follow/override (Task 3 + 8 + 10·S3), labels (Task 7 + 10·S6), legend (Task 6 + 10·S6), sized dots (Task 1 + 10·S4/S6), gossamer theme-aware (Task 5 + 9 + 10·S5), theme-follow (canvas already; Legend/labels in 6/7), sidebar preserved (untouched). Non-goals (callouts, 3D chrome, pipeline) — not implemented, as intended.
- **Deviation from spec:** the spec said "wire the existing `ClusterLabels`"; Task 7 builds a new `MapClusterLabels` instead, because `ClusterLabels` hardcodes a dark chip and colors swatches via `colorForCluster` (not our bucketed palette). Documented inline in Task 7. Functionally equivalent + theme/palette-correct.
- **Type consistency:** `LegendEntry`/`RGB`/`BucketedColors` (Task 2) are consumed unchanged by Legend (6), MapClusterLabels (7), and the shell (10). `activeGroupingDimension` signature (3) matches its shell call (10·S3). `GROUPING_DEFAULT` (4) is the single source of the default value.
- **Open risk:** Task 7 centroids depend on `physics.getPositions()` returning live positions through the worker — verified in pre-flight; degrades gracefully (skips a frame) if positions are momentarily empty.
