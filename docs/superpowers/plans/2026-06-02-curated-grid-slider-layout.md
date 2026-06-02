# Curated Cross-Tab Slider Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pare the access-analysis slider graph to Project / Role / User name, replace the confusing k-means two-slider path with a readable cross-tab grid, give it an organic resting form, and move the slider value off the React hot path so dragging is lag-free.

**Architecture:** Slider **structure** (which value → which cell, each node's in-cell offset, axis labels) is computed once per grouping change in React. The slider **value** is applied as a cheap per-frame scalar inside the rAF/transition path (read from a ref), so a value drag never re-renders the shell or re-packs nodes. Pure layout modules (`gridLayout`, `restLayout`) own the math; the renderer stays position-driven with the GPU sim paused (clean, deterministic separation).

**Tech Stack:** Next.js (App Router) client components, cosmos.gl v3 (2D WebGL), d3-force / d3-hierarchy (layout math), DuckDB-WASM (data), Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-02-curated-grid-slider-layout-design.md`

**Repo constraints (do not skip):**
- Stage commits by **explicit path**. Before every commit run `git diff --cached --name-only` and confirm only intended files appear. `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` is **already pre-staged** in the index from unrelated WIP — never sweep it into a commit; commit with the pathspec form `git commit -m "…" -- <paths>`.
- Do **not** run `npm run build` while the :3000 app is running (it 500s the live app).
- Unit tests: `npx vitest run <path>`. Types: `npx tsc --noEmit`. e2e: `npm run test:e2e` (runs on :3100 with `NEXT_PUBLIC_ACC_GRAPH_TEST=1`, which forces the GPU sim **off** — the CPU positions must stay coherent).

---

## File Structure

**Create:**
- `app/(dashboard)/users/access-analysis/curatedSliders.ts` — the active-slider allow-list + filter (Project/Role/User).
- `app/(dashboard)/users/access-analysis/curatedSliders.test.ts`
- `app/(dashboard)/users/access-analysis/gridLayout.ts` — pure cross-tab grid: `buildGridStructure` (structure) + `gridPositions` (per-frame scalar).
- `app/(dashboard)/users/access-analysis/gridLayout.test.ts`
- `app/(dashboard)/users/access-analysis/restLayout.ts` — pure static organic rest layout.
- `app/(dashboard)/users/access-analysis/restLayout.test.ts`
- `app/(dashboard)/users/access-analysis/GridAxisLabels.tsx` — grid column/row header overlay (mirrors `ClusterLabels`).

**Modify:**
- `interactionTypes.ts` — add `userName` to `NodeFeatureSnapshot`.
- `featureSnapshot.ts` — populate `userName` (cased full name → email → userId).
- `dimensionCatalog.structural.ts` — add the `user` (User name) dimension.
- `AccessAnalysisShell.tsx` — engine selection by active count; build the layout descriptor (structure-once); stop computing `clusterPackedPositions`/`tightness` from `sliderValues`; render `GridAxisLabels` + folded caption; 3rd dim → color.
- `SliderContext.tsx` — expose a `valuesRef` read channel (live slider values without re-render).
- `GraphCanvas.tsx` — consume the descriptor; per-frame target from descriptor + live scalar (ref) via `clusterTransitionLayer`.
- `GraphCanvas2D.tsx` — epsilon-settle upload skip in `pushPositions` (pre-staged; commit separately/last).
- `CatalogSliderSidebar.tsx` — list only curated dims.

---

## Phase A — Curated slider set + User name dimension

### Task A1: Add `userName` to the feature snapshot type

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (NodeFeatureSnapshot, after `emailLower`)

- [ ] **Step 1: Add the field**

In `NodeFeatureSnapshot`, after the `emailLower` field (line ~30), add:

```ts
  /** Cased display name for the User-name dimension (full name → email → userId). */
  userName: string;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `featureSnapshot.ts` (missing `userName` in object literals) — those are fixed in A2. No errors elsewhere.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/users/access-analysis/interactionTypes.ts
git diff --cached --name-only   # confirm ONLY interactionTypes.ts
git commit -m "feat(acc-redesign): add userName to NodeFeatureSnapshot" -- app/(dashboard)/users/access-analysis/interactionTypes.ts
```

### Task A2: Populate `userName` in the snapshot builder

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts` (real snapshot object ~line 250; fallback object ~line 292)

- [ ] **Step 1: Set userName on the real snapshot**

In the mapped snapshot object (where `nameLower`/`emailLower` are set, ~line 250), add:

```ts
    userName: fullName || email || userId,
```

(`fullName`, `email`, `userId` are already in scope from lines ~194–198.)

- [ ] **Step 2: Set userName on the fallback snapshot**

In the `fallback(id)` object (~line 292, where `nameLower: ""`), add:

```ts
    userName: id.split("::")[0] || id,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run the snapshot tests if present**

Run: `npx vitest run app/(dashboard)/users/access-analysis/featureSnapshot`
Expected: PASS (or "no tests found" — acceptable).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/featureSnapshot.ts
git diff --cached --name-only   # confirm ONLY featureSnapshot.ts
git commit -m "feat(acc-redesign): populate userName on feature snapshot" -- app/(dashboard)/users/access-analysis/featureSnapshot.ts
```

### Task A3: Add the User-name dimension to the catalog

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts` (inside the returned array in `buildStructuralDimensions`, after the `role` dim ~line 33)
- Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts` (existing)

- [ ] **Step 1: Write a failing test**

Add to `dimensionCatalog.test.ts`:

```ts
import { buildDimensionCatalog } from "./dimensionCatalog";

test("catalog includes a User name slider dimension", () => {
  const dims = buildDimensionCatalog([]);
  const user = dims.find((d) => d.id === "user");
  expect(user).toBeDefined();
  expect(user!.label).toBe("User name");
  expect(user!.surfaces).toContain("slider");
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts`
Expected: FAIL (`user` is undefined).

- [ ] **Step 3: Add the dimension**

In `buildStructuralDimensions`, after the `role` object (closes ~line 33), insert:

```ts
    {
      id: "user", label: "User name", family: "affiliation", kind: "categorical",
      source: "AccDcProjectUser.user_id ⋈ name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      // Group/label by display name. Same-named distinct users may merge — acceptable
      // for this experimental slider (names are near-unique across ~3.4k users).
      extract: (f) => (f.userName ? f.userName : null),
    },
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts
git diff --cached --name-only
git commit -m "feat(acc-redesign): add User name dimension to catalog" -- app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts
```

### Task A4: Curated slider allow-list

**Files:**
- Create: `app/(dashboard)/users/access-analysis/curatedSliders.ts`
- Create: `app/(dashboard)/users/access-analysis/curatedSliders.test.ts`

- [ ] **Step 1: Write the failing test**

`curatedSliders.test.ts`:

```ts
import { buildDimensionCatalog } from "./dimensionCatalog";
import { CURATED_SLIDER_IDS, curatedSliderDimensions } from "./curatedSliders";

test("curated set is exactly project, role, user (in order)", () => {
  expect([...CURATED_SLIDER_IDS]).toEqual(["project", "role", "user"]);
});

test("curatedSliderDimensions returns only curated, available, slider-surfaced dims", () => {
  const catalog = buildDimensionCatalog([]);
  const dims = curatedSliderDimensions(catalog);
  expect(dims.map((d) => d.id).sort()).toEqual(["project", "role", "user"]);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run app/(dashboard)/users/access-analysis/curatedSliders.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`curatedSliders.ts`:

```ts
/**
 * curatedSliders.ts — The active slider set. The full catalog stays defined; this
 * narrows what the sidebar surfaces AND what drives the layout, so non-curated dims
 * are "safe" (re-enable by editing CURATED_SLIDER_IDS). Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensions } from "./catalogSliders";

/** The only sliders the graph currently uses. Order is irrelevant (layout sorts by value). */
export const CURATED_SLIDER_IDS = ["project", "role", "user"] as const;

const SET = new Set<string>(CURATED_SLIDER_IDS);

/** Curated ∩ (slider-surfaced AND available). Use everywhere the old code used sliderDimensions. */
export function curatedSliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return sliderDimensions(catalog).filter((d) => SET.has(d.id));
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run app/(dashboard)/users/access-analysis/curatedSliders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/curatedSliders.ts app/(dashboard)/users/access-analysis/curatedSliders.test.ts
git diff --cached --name-only
git commit -m "feat(acc-redesign): curated slider allow-list (project/role/user)" -- app/(dashboard)/users/access-analysis/curatedSliders.ts app/(dashboard)/users/access-analysis/curatedSliders.test.ts
```

### Task A5: Surface only curated sliders (shell + sidebar)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (the `sliderDims` useMemo ~line 116; the loader's `sliderDims` ~line 393)
- Modify: `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx` (wherever it derives the slider list)

- [ ] **Step 1: Shell — swap to curated**

In `AccessAnalysisShell.tsx`, replace the import/use of `sliderDimensions` with `curatedSliderDimensions`:
- Add import: `import { curatedSliderDimensions } from "./curatedSliders";`
- Line ~116: `const sliderDims = useMemo(() => curatedSliderDimensions(catalog), [catalog]);`
- Loader (~line 393): `const sliderDims = curatedSliderDimensions(catalog);`

(Leave `sliderDimensionIds`/`catalogDefaultSliders` as-is — they list defaults for persistence and are harmless supersets.)

- [ ] **Step 2: Sidebar — list only curated**

Read `CatalogSliderSidebar.tsx`. Where it builds the visible slider rows from the catalog (via `sliderDimensions` or `getCatalogSections`), filter to `curatedSliderDimensions(catalog)`. If it renders the full section tree, render a flat list of the three curated dims instead (structural section only). Keep the component's existing `DimensionSlider` usage and `useSliders()` wiring.

- [ ] **Step 3: Typecheck + sidebar test**

Run: `npx tsc --noEmit`
Run: `npx vitest run app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx`
Expected: tsc 0 errors. Update the sidebar test if it asserted the old full list (assert the three curated rows render).

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx
git diff --cached --name-only
git commit -m "feat(acc-redesign): surface only curated sliders in shell + sidebar" -- app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx
```

---

## Phase B — Cross-tab grid module (pure)

### Task B1: `buildGridStructure` (structure, computed once per regroup)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/gridLayout.ts`
- Create: `app/(dashboard)/users/access-analysis/gridLayout.test.ts`

- [ ] **Step 1: Write failing tests**

`gridLayout.test.ts`:

```ts
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { buildGridStructure } from "./gridLayout";

const dim = (id: string, get: (f: NodeFeatureSnapshot) => string): CatalogDimension =>
  ({ id, label: id, family: "structure", kind: "categorical", source: "", confidence: "high",
     available: true, surfaces: ["slider"], extract: (f) => get(f) } as unknown as CatalogDimension);

function feat(project: string, role: string): NodeFeatureSnapshot {
  return { nodeId: `${project}:${role}`, project, role } as unknown as NodeFeatureSnapshot;
}

test("assigns each node to a (col,row) cell by the two dim values", () => {
  const features = [feat("A", "X"), feat("A", "Y"), feat("B", "X")];
  const s = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
  expect(s.cols.map((c) => c.label).sort()).toEqual(["A", "B"]);
  expect(s.rows.map((r) => r.label).sort()).toEqual(["X", "Y"]);
  // node 0 (A,X) and node 2 (B,X) share a row; node 0 and node 1 share a column
  expect(s.rowOf[0]).toBe(s.rowOf[2]);
  expect(s.colOf[0]).toBe(s.colOf[1]);
});

test("folds values beyond the cap into a trailing Other band", () => {
  const features = ["A", "B", "C", "D"].flatMap((p) => [feat(p, "X"), feat(p, "X")]);
  const s = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 2, maxRows: 8 });
  expect(s.cols.length).toBe(3); // 2 kept + Other
  expect(s.cols[s.cols.length - 1].label).toBe("Other");
  expect(s.foldedCols).toBe(2); // C, D folded
});

test("unit offsets are bounded within the unit disc", () => {
  const features = Array.from({ length: 50 }, () => feat("A", "X"));
  const s = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
  for (let i = 0; i < features.length; i++) {
    expect(Math.hypot(s.ux[i], s.uy[i])).toBeLessThanOrEqual(1.0001);
  }
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run app/(dashboard)/users/access-analysis/gridLayout.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement structure**

`gridLayout.ts`:

```ts
/**
 * gridLayout.ts — Cross-tab grid for the two-slider view. Structure (cell assignment,
 * in-cell unit offsets, axis bands) is computed ONCE per regroup; gridPositions applies
 * the live slider scalar per-frame allocation-free. Pure: no React/DOM/IO, no clock/RNG.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { computeActionThresholds } from "./actionBuckets";
import { valueKeyLabel } from "./dominantClusters";
import { fillFactor } from "./clusterPacking";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const OTHER_KEY = " other";

export interface GridBand { key: string; label: string; count: number; }
export interface GridStructure {
  cols: GridBand[];
  rows: GridBand[];
  colOf: Int32Array;   // per-node column band index
  rowOf: Int32Array;   // per-node row band index
  ux: Float32Array;    // per-node in-cell unit offset x (|(ux,uy)| ≤ 1)
  uy: Float32Array;
  foldedCols: number;  // # distinct values folded into the Other column (0 = none)
  foldedRows: number;
}

function bandsFor(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  cap: number,
): { bands: GridBand[]; bandOf: Int32Array; folded: number } {
  const activity = dim.family === "activity";
  const thresholds = activity ? computeActionThresholds(features, [dim.id]) : new Map();
  const keyToLabel = new Map<string, string>();
  const count = new Map<string, number>();
  const keyPerNode: string[] = new Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const { key, label } = valueKeyLabel(features[i], dim, thresholds);
    keyPerNode[i] = key;
    if (!keyToLabel.has(key)) keyToLabel.set(key, label);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  // Rank by count desc, tie by key asc (deterministic). Keep top `cap`, fold the rest.
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const kept = ranked.slice(0, Math.max(1, cap));
  const keptKeys = new Set(kept.map(([k]) => k));
  const folded = ranked.length - kept.length;
  const idxOf = new Map<string, number>();
  const bands: GridBand[] = kept.map(([k, c], i) => { idxOf.set(k, i); return { key: k, label: keyToLabel.get(k)!, count: c }; });
  let otherIdx = -1;
  if (folded > 0) {
    otherIdx = bands.length;
    let otherCount = 0;
    for (const [k, c] of ranked) if (!keptKeys.has(k)) otherCount += c;
    bands.push({ key: OTHER_KEY, label: "Other", count: otherCount });
  }
  const bandOf = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const k = keyPerNode[i];
    bandOf[i] = keptKeys.has(k) ? idxOf.get(k)! : otherIdx;
  }
  return { bands, bandOf, folded };
}

export function buildGridStructure(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dimX: CatalogDimension,
  dimY: CatalogDimension,
  opts: { maxCols: number; maxRows: number },
): GridStructure {
  const col = bandsFor(features, dimX, opts.maxCols);
  const row = bandsFor(features, dimY, opts.maxRows);
  const n = features.length;
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  // Per-cell sunflower: each node gets a unit-disc offset (direction + sqrt fill).
  const seen = new Map<number, number>();
  const total = new Map<number, number>();
  const cellId = (c: number, r: number): number => r * (col.bands.length + 1) + c;
  for (let i = 0; i < n; i++) {
    const id = cellId(col.bandOf[i], row.bandOf[i]);
    total.set(id, (total.get(id) ?? 0) + 1);
  }
  for (let i = 0; i < n; i++) {
    const id = cellId(col.bandOf[i], row.bandOf[i]);
    const j = seen.get(id) ?? 0;
    seen.set(id, j + 1);
    const m = total.get(id)!;
    const rr = m <= 1 ? 0 : Math.sqrt((j + 0.5) / m);
    const th = j * GOLDEN_ANGLE;
    ux[i] = Math.cos(th) * rr;
    uy[i] = Math.sin(th) * rr;
  }
  return { cols: col.bands, rows: row.bands, colOf: col.bandOf, rowOf: row.bandOf, ux, uy, foldedCols: col.folded, foldedRows: row.folded };
}

export { fillFactor };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/(dashboard)/users/access-analysis/gridLayout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/gridLayout.ts app/(dashboard)/users/access-analysis/gridLayout.test.ts
git diff --cached --name-only
git commit -m "feat(acc-redesign): cross-tab grid structure (buildGridStructure)" -- app/(dashboard)/users/access-analysis/gridLayout.ts app/(dashboard)/users/access-analysis/gridLayout.test.ts
```

### Task B2: `gridPositions` (per-frame scalar, allocation-free)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/gridLayout.ts`
- Modify: `app/(dashboard)/users/access-analysis/gridLayout.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `gridLayout.test.ts`:

```ts
import { gridPositions, gridCellRadius } from "./gridLayout";

test("gridPositions centers cells on a lattice and writes into the provided buffer", () => {
  const features = [feat("A", "X"), feat("B", "X")];
  const s = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
  const out = new Float32Array(features.length * 3);
  const ref = gridPositions(s, { valueX: 1, valueY: 1 }, out);
  expect(ref).toBe(out); // no allocation
  // Two single-member columns, centered → x of col0 = -col1
  expect(out[0]).toBeCloseTo(-out[3], 5);
  expect(out[2]).toBe(0); // z=0
});

test("higher slider value spreads bands further apart (monotonic pitch)", () => {
  const features = [feat("A", "X"), feat("B", "X")];
  const s = buildGridStructure(features, dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
  const lo = new Float32Array(6); gridPositions(s, { valueX: 0.1, valueY: 0.1 }, lo);
  const hi = new Float32Array(6); gridPositions(s, { valueX: 1, valueY: 1 }, hi);
  expect(Math.abs(hi[3] - hi[0])).toBeGreaterThan(Math.abs(lo[3] - lo[0]));
});

test("cells never overlap: cell radius < half the min pitch", () => {
  const s = buildGridStructure([feat("A", "X"), feat("B", "Y")], dim("project", (f) => f.project), dim("role", (f) => f.role), { maxCols: 8, maxRows: 8 });
  const colPitch = 100, rowPitch = 100;
  expect(gridCellRadius(colPitch, rowPitch)).toBeLessThan(Math.min(colPitch, rowPitch) / 2);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run app/(dashboard)/users/access-analysis/gridLayout.test.ts`
Expected: FAIL (`gridPositions`/`gridCellRadius` not exported).

- [ ] **Step 3: Implement**

Append to `gridLayout.ts`:

```ts
// Pitch (distance between adjacent band centers) ramps with the axis slider value:
// low value → bands sit close (blended); high value → fully separated grid.
const PITCH_MIN = 90;
const PITCH_MAX = 420;
const CELL_RADIUS_FRAC = 0.42; // < 0.5 of min pitch → cells never overlap

function pitch(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return PITCH_MIN + (PITCH_MAX - PITCH_MIN) * t;
}

/** Member-fill radius for a cell given the two axis pitches (bounded so cells never touch). */
export function gridCellRadius(colPitch: number, rowPitch: number): number {
  return Math.min(colPitch, rowPitch) * CELL_RADIUS_FRAC;
}

/**
 * Per-frame positions (stride-3, z=0) written into `out` (allocation-free; `out.length`
 * must be features*3). valueX/valueY are the normalized (0..1) axis slider values.
 */
export function gridPositions(
  s: GridStructure,
  v: { valueX: number; valueY: number },
  out: Float32Array,
): Float32Array {
  const ncols = s.cols.length;
  const nrows = s.rows.length;
  const colPitch = pitch(v.valueX);
  const rowPitch = pitch(v.valueY);
  const cellR = gridCellRadius(colPitch, rowPitch);
  const fill = fillFactor(Math.max(v.valueX, v.valueY));
  const cx0 = (ncols - 1) / 2;
  const cy0 = (nrows - 1) / 2;
  const n = out.length / 3;
  for (let i = 0; i < n; i++) {
    const cx = (s.colOf[i] - cx0) * colPitch;
    const cy = (s.rowOf[i] - cy0) * rowPitch;
    out[i * 3] = cx + s.ux[i] * cellR * fill;
    out[i * 3 + 1] = cy + s.uy[i] * cellR * fill;
    out[i * 3 + 2] = 0;
  }
  return out;
}

/** Column-center x and row-center y in world space, for axis label placement. */
export function gridColCenterX(s: GridStructure, col: number, valueX: number): number {
  return (col - (s.cols.length - 1) / 2) * pitch(valueX);
}
export function gridRowCenterY(s: GridStructure, row: number, valueY: number): number {
  return (row - (s.rows.length - 1) / 2) * pitch(valueY);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/(dashboard)/users/access-analysis/gridLayout.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/gridLayout.ts app/(dashboard)/users/access-analysis/gridLayout.test.ts
git diff --cached --name-only
git commit -m "feat(acc-redesign): grid per-frame positions + axis centers" -- app/(dashboard)/users/access-analysis/gridLayout.ts app/(dashboard)/users/access-analysis/gridLayout.test.ts
```

---

## Phase C — Organic rest layout (pure)

### Task C1: `buildRestLayout`

**Files:**
- Create: `app/(dashboard)/users/access-analysis/restLayout.ts`
- Create: `app/(dashboard)/users/access-analysis/restLayout.test.ts`

- [ ] **Step 1: Write failing tests**

`restLayout.test.ts`:

```ts
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { buildRestLayout } from "./restLayout";

function feat(project: string): NodeFeatureSnapshot {
  return { nodeId: `${project}:${Math.random()}`, project } as unknown as NodeFeatureSnapshot;
}

test("returns stride-3 positions, finite, z=0", () => {
  const features = Array.from({ length: 200 }, (_, i) => feat(`P${i % 10}`));
  const xyz = buildRestLayout(features);
  expect(xyz.length).toBe(features.length * 3);
  for (let i = 0; i < features.length; i++) {
    expect(Number.isFinite(xyz[i * 3])).toBe(true);
    expect(Number.isFinite(xyz[i * 3 + 1])).toBe(true);
    expect(xyz[i * 3 + 2]).toBe(0);
  }
});

test("deterministic (same input → identical output)", () => {
  const features = Array.from({ length: 120 }, (_, i) => ({ nodeId: `n${i}`, project: `P${i % 6}` } as unknown as NodeFeatureSnapshot));
  const a = buildRestLayout(features);
  const b = buildRestLayout(features);
  expect(Array.from(a)).toEqual(Array.from(b));
});

test("same-project nodes are nearer than random (soft clumping)", () => {
  const features = Array.from({ length: 300 }, (_, i) => ({ nodeId: `n${i}`, project: `P${i % 5}` } as unknown as NodeFeatureSnapshot));
  const xyz = buildRestLayout(features);
  const dist = (i: number, j: number) => Math.hypot(xyz[i * 3] - xyz[j * 3], xyz[i * 3 + 1] - xyz[j * 3 + 1]);
  // mean intra-project (i, i+5 share project) vs inter-project (i, i+1 differ)
  let intra = 0, inter = 0, k = 0;
  for (let i = 0; i + 5 < features.length; i += 5) { intra += dist(i, i + 5); inter += dist(i, i + 1); k++; }
  expect(intra / k).toBeLessThan(inter / k);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run app/(dashboard)/users/access-analysis/restLayout.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`restLayout.ts`:

```ts
/**
 * restLayout.ts — Static, deterministic "gentle real grouping" cloud for the 0-slider
 * state. Same-project nodes seed near each other; a light collide+charge settle yields
 * soft, non-circular clumps (no rescale to a fixed circle; denser center, thinning edge).
 * Computed ONCE on load → zero runtime cost. Pure & deterministic (no RNG/clock).
 */
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TICKS = 160;
const NODE_R = 5;          // collide radius per node (soft personal space)
const SEED_SPREAD = 1400;  // global phyllotaxis radius before relaxation
const CLUMP_SPREAD = 70;   // intra-project jitter radius around each project's seed
const CENTER_STRENGTH = 0.02;
const MAX_EXTENT = 1900;   // safety: scale DOWN only if it would overflow GPU space

interface RNode { x: number; y: number; }

export function buildRestLayout(features: ReadonlyArray<NodeFeatureSnapshot>): Float32Array {
  const n = features.length;
  const out = new Float32Array(n * 3);
  if (n === 0) return out;

  // Distinct projects in first-seen order → a phyllotaxis seed per project (denser center).
  const projOrder = new Map<string, number>();
  for (const f of features) { const p = f.project ?? "(none)"; if (!projOrder.has(p)) projOrder.set(p, projOrder.size); }
  const np = projOrder.size;
  const projSeed = new Map<string, { x: number; y: number }>();
  for (const [p, idx] of projOrder) {
    const rr = SEED_SPREAD * Math.sqrt((idx + 0.5) / np);
    const th = idx * GOLDEN_ANGLE;
    projSeed.set(p, { x: Math.cos(th) * rr, y: Math.sin(th) * rr });
  }

  // Each node seeded near its project's seed (deterministic per-node phyllotaxis offset).
  const perProjSeen = new Map<string, number>();
  const nodes: RNode[] = features.map((f) => {
    const p = f.project ?? "(none)";
    const s = projSeed.get(p)!;
    const j = perProjSeen.get(p) ?? 0; perProjSeen.set(p, j + 1);
    const rr = CLUMP_SPREAD * Math.sqrt((j + 0.5) / Math.max(1, j + 1));
    const th = j * GOLDEN_ANGLE;
    return { x: s.x + Math.cos(th) * rr, y: s.y + Math.sin(th) * rr };
  });

  forceSimulation<RNode>(nodes)
    .force("collide", forceCollide<RNode>(NODE_R).strength(0.8).iterations(2))
    .force("charge", forceManyBody<RNode>().strength(-2).distanceMax(120))
    .force("x", forceX<RNode>(0).strength(CENTER_STRENGTH))
    .force("y", forceY<RNode>(0).strength(CENTER_STRENGTH))
    .stop()
    .tick(TICKS);

  let mx = 0, my = 0;
  for (const nd of nodes) { mx += nd.x; my += nd.y; }
  mx /= n; my /= n;
  let reach = 1;
  for (const nd of nodes) reach = Math.max(reach, Math.hypot(nd.x - mx, nd.y - my));
  const scale = Math.min(1, MAX_EXTENT / reach);
  for (let i = 0; i < n; i++) {
    out[i * 3] = (nodes[i].x - mx) * scale;
    out[i * 3 + 1] = (nodes[i].y - my) * scale;
    out[i * 3 + 2] = 0;
  }
  return out;
}
```

> Note: `forceSimulation(...).tick(TICKS)` — d3-force v3 `tick()` accepts an iteration count. If the installed version does not, replace with `for (let t = 0; t < TICKS; t++) sim.tick();` after capturing `const sim = forceSimulation(...)`.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/(dashboard)/users/access-analysis/restLayout.test.ts`
Expected: PASS (3 tests). If the clumping test is flaky on tiny inputs, raise `CENTER_STRENGTH`/`charge` until same-project mean distance is reliably lower.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/users/access-analysis/restLayout.ts app/(dashboard)/users/access-analysis/restLayout.test.ts
git diff --cached --name-only
git commit -m "feat(acc-redesign): static organic rest layout (gentle real grouping)" -- app/(dashboard)/users/access-analysis/restLayout.ts app/(dashboard)/users/access-analysis/restLayout.test.ts
```

---

## Phase D — Wiring: escalation, lag-fix, labels, color

> These tasks change live React/renderer wiring. Read each target file immediately before editing. Verify in the running app (the owner UAT-checks visually). After each task: `npx tsc --noEmit` + the named test, then commit by explicit path.

### Task D1: Expose a live slider-value ref from SliderContext

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx`

- [ ] **Step 1:** In `SliderContext.tsx`, locate the existing `valuesRef` (the synchronous accumulator used by the rAF coalesce). Add to the context value a stable getter so consumers can read live values without subscribing to re-renders:

```ts
  // Live (uncommitted) slider values for the rAF/render loop — reading this never
  // triggers a React re-render (unlike `values`). Normalized 0..100 like `values`.
  getLiveValues: () => valuesRef.current,
```

Add `getLiveValues: () => Record<string, number>;` to the context type. If no `valuesRef` exists, add one updated synchronously in `setSliderValue` before the rAF commit.

- [ ] **Step 2:** Run: `npx tsc --noEmit` → 0 errors. Run: `npx vitest run app/(dashboard)/users/access-analysis/SliderContext` (if a test exists) → PASS.

- [ ] **Step 3: Commit** (explicit path, verify `git diff --cached --name-only`).

### Task D2: Layout descriptor + engine selection in the shell (remove the hot-path re-pack)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1:** Replace the `clustering`/`footprints`/`tightness`/`clusterPackedPositions`/`clusterCloudCorners` block (~lines 115–183) with engine selection driven by `activeDims.length`, computing **structure only** (gated on `activeKey`, NOT `sliderValues`):
  - `0 active` → `restXyz = useMemo(() => buildRestLayout(features), [features])`.
  - `1 active` → existing dominant-blob structure (`buildDominantClusters` + `layoutClusterFootprintsOrganic`), structure only.
  - `2+ active` → `buildGridStructure(features, activeDims[0], activeDims[1], { maxCols: 12, maxRows: 8 })`.
  Bundle into a single `layoutDescriptor` object (discriminated by `kind: "rest" | "blob" | "grid"`) memoized on `[features, activeKey]`.
- [ ] **Step 2:** Pass `layoutDescriptor` to `GraphCanvas` as a new prop. Remove `clusterPackedPositions`/`clusterCorners`/`clusterAnchors` props from the slider path (keep `clusterIds` only if still used for color; otherwise drop). The shell no longer reads `sliderValues` for positions.
- [ ] **Step 3:** Render the active-grouping caption: for grid, show "Grouping: {X.label} × {Y.label}" + folded note when `foldedCols||foldedRows` (e.g. "+{foldedCols} more projects in Other"). Replace the existing indicator block (~lines 300–307).
- [ ] **Step 4:** `npx tsc --noEmit` → 0. Update `AccessAnalysisShell`-touching tests that referenced removed props. Commit by explicit path.

### Task D3: Per-frame target from descriptor + live scalar (GraphCanvas)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`

- [ ] **Step 1:** Replace the `clusterPackedPositions`-driven path with the descriptor. In `getPositionsOverride` (~lines 252–276), when `descriptor.kind === "grid"`, compute the target via `gridPositions(structure, { valueX, valueY }, reusedBuffer)` where `valueX/valueY` come from `sliders.getLiveValues()` (normalized /100) for `activeDims[0]/[1]`; feed it to `clusterTransitionLayer.setTarget` (or return the eased snapshot). For `kind === "blob"`, scale member fill by the strongest live value. For `kind === "rest"`, target = `restXyz` (static).
- [ ] **Step 2:** Allocate the reused grid buffer once per descriptor change (ref). Keep the GPU sim paused while a descriptor is active (existing `clusterActive` pause path — generalize `clusterActive = descriptor.kind !== "rest" ? true : ...`; rest can also be a static pushed layout with sim paused).
- [ ] **Step 3:** Ensure the rAF loop still calls `pushPositions` every frame while a descriptor is active (the `skipPositionPump` gate must be false when descriptor-driven).
- [ ] **Step 4:** `npx tsc --noEmit` → 0. Manually verify in the app: dragging Project then Role shows a grid; dragging a value is smooth (no stutter). Commit by explicit path.

### Task D4: Epsilon-settle upload skip (GraphCanvas2D)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (already pre-staged — commit this change on its own, last)

- [ ] **Step 1:** In `pushPositions`, alongside the byte-identical dirty-check (~lines 412–422), add: track the max per-coordinate delta vs `prevUploaded`; if `maxDelta < 0.25` (world units) AND `fitPendingRef.current === 0`, skip the upload+render (the layout has settled). Keep B.2 preview motion intact (its deltas exceed ε while animating).
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Manually verify the graph idles at full fps once a drag stops.
- [ ] **Step 3: Commit — carefully.** This file is already staged from prior WIP. First inspect the full staged diff: `git diff --cached -- "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx"`. Only commit if the staged content is the intended pre-existing WIP plus your epsilon change; if unsure, `git add` the file fresh and commit just it: `git commit -m "perf(acc-redesign): epsilon-settle upload skip" -- "app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx"`. Verify `git diff --cached --name-only` first.

### Task D5: Third dimension → node color

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (the `nodeColors` useMemo ~lines 195–201)

- [ ] **Step 1:** When `activeDims.length >= 3`, set node colors from the 3rd-strongest active dim via `buildNodeColors(features, <colorMode for activeDims[2].id>)` instead of the cluster-id buffer. For `< 3` active, keep current behavior (cluster color for grid/blob, role color at rest). Map `activeDims[2].id` to a `ColorMode` (project/role/user are all categorical → reuse the categorical color path).
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Verify: with Project+Role+User all on, dots are colored by User while positioned in the Project×Role grid. Commit by explicit path.

### Task D6: Grid axis labels overlay

**Files:**
- Create: `app/(dashboard)/users/access-analysis/GridAxisLabels.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (render it next to `ClusterLabels`)

- [ ] **Step 1:** Create `GridAxisLabels.tsx` modeled on `ClusterLabels.tsx`: props `{ graphRef, structure, getValueX, getValueY, mode }`. Each frame (rAF or the existing label cadence), for each column compute world x via `gridColCenterX(structure, col, valueX)` at a fixed top y, project with `graphRef…spaceToScreen`, and render the column label; same for rows down the left. Render nothing when `mode !== "2d"` or `structure.kind !== "grid"`.
- [ ] **Step 2:** In the shell, render `<GridAxisLabels … />` when the descriptor is a grid; keep `<ClusterLabels … />` for the blob (1-slider) case.
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Verify labels sit on the correct bands and track pan/zoom. Commit by explicit path.

### Task D7: Full-suite + e2e gate

- [ ] **Step 1:** Run the full unit suite: `npx vitest run` → all green (fix any tests that asserted the removed packed/k-means behavior; update them to the new grid/rest contract).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 3:** `npm run test:e2e` → green (lasso load-flake under machine load is a known artifact, not a regression — re-run on an idle machine if it trips).
- [ ] **Step 4:** Final manual UAT with the owner: 0 sliders = organic clumps; Project alone = labeled project blobs; Project+Role = readable grid with headers; smooth drag throughout; User name works as a 3rd slider (color).

---

## Self-Review

- **Spec coverage:** Part 1 (curated + user) → A1–A5. Part 2 (escalation) → D2. Part 3 (grid) → B1–B2 + D3 + D6. Part 4 (rest) → C1 + D3. Part 5 (lag-fix wiring) → D1–D4. Part 6 (labels) → D6 (grid) + existing ClusterLabels (blob). 3rd-dim color → D5. Gates → D7. ✅ all spec sections mapped.
- **Placeholder scan:** Pure modules (A1–C1) have complete code + tests. Wiring tasks (D1–D7) give exact files, line anchors, the precise change, and verification — appropriately concrete for live React/cosmos wiring that must be read-before-edit.
- **Type consistency:** `buildGridStructure`→`GridStructure`; `gridPositions(GridStructure, {valueX,valueY}, out)`; `gridCellRadius`/`gridColCenterX`/`gridRowCenterY` consistent across B1/B2/D3/D6. `userName` added in A1 and consumed in A2/A3. `curatedSliderDimensions` defined A4, used A5/D2. `getLiveValues` defined D1, used D3/D6.
- **Decomposition note:** Phases A–C are independent, fully test-driven, low-risk, and ship value on their own (curated UI + proven pure modules). Phase D is the integration; execute it last, verifying in the running app between tasks.
