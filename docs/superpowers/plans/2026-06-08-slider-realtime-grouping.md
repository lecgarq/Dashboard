# Real-time "Group by + Strength" grouping on the projector map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the projector map's inert per-attribute sliders with one **Group by** picker + one **Grouping strength** slider that smoothly morphs the static embedding scatter into organic grouped blobs in real time, with no GPU physics.

**Architecture:** Reuse the existing per-frame morph engine (`descriptorTarget` "blob" branch + `clusterTransitionLayer` easing, already driven off `getLiveValues()` off the React path). Add one pure descriptor builder whose **s=0 endpoint is the embedding scatter** (instead of a loose footprint) and whose **s=1 endpoint is the packed clump, scale-normalized to the embedding's bounding box** so the cloud never rescales mid-morph. Drive a single slider via a simplified sidebar. The parked flag-ON physics graph and the MASK bus (filters/search/lasso) are untouched.

**Tech Stack:** Next.js (App Router) client components, TypeScript, React, Radix slider, d3-force/d3-hierarchy (already used by the layout), cosmos.gl 2D renderer, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-08-slider-realtime-grouping-design.md`

**Conventions for every task:**
- Unit test runner: `npx vitest run "<path>"` (quote paths — they contain parentheses). Single test: add `-t "<name>"`.
- Typecheck: `npx tsc --noEmit`.
- All new files live in `app/(dashboard)/users/access-analysis/`.
- **Staging hazard (this branch):** before each commit run `git diff --cached --name-only` and stage ONLY the explicit paths listed in the step. Never `git add -A`/`.`.
- Commit trailer: every commit ends with a second `-m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`.

**Task order rationale (owner gate):** Tasks 1–3 land the **bounding-box-stability test** that guards the coordinate-scale risk. This MUST be green before the wiring (Task 8) that makes the morph visible — i.e., before any visual review.

---

### Task 1: BBox helper (`embeddingFit.ts`)

A pure helper that computes the bounding box + center + half-extent of a stride-2 position buffer. Used to scale-normalize the packed clump to the embedding's footprint.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/embeddingFit.ts`
- Test: `app/(dashboard)/users/access-analysis/embeddingFit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// embeddingFit.test.ts
import { describe, it, expect } from "vitest";
import { computeBBoxStride2 } from "./embeddingFit";

describe("computeBBoxStride2", () => {
  it("returns center + half-extent of the bounding square", () => {
    // points span x:[-10,30] (width 40), y:[0,10] (height 10)
    const xy = new Float32Array([-10, 0, 30, 10, 10, 5]);
    const b = computeBBoxStride2(xy);
    expect(b.minX).toBe(-10);
    expect(b.maxX).toBe(30);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(10);
    expect(b.cx).toBe(10);
    expect(b.cy).toBe(5);
    // half-extent is the LARGER half-span (so the fit is a square)
    expect(b.halfExtent).toBe(20);
  });

  it("is safe on an empty buffer", () => {
    const b = computeBBoxStride2(new Float32Array(0));
    expect(b.halfExtent).toBe(0);
    expect(b.cx).toBe(0);
    expect(b.cy).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/embeddingFit.test.ts"`
Expected: FAIL — `computeBBoxStride2` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// embeddingFit.ts
/**
 * embeddingFit.ts — Pure geometry helper for scale-normalizing the grouped-clump
 * layout onto the embedding scatter's footprint, so the cloud never rescales during
 * the Group-by morph (the coordinate-scale risk). No React/DOM/IO.
 */

export interface BBox2 {
  minX: number; minY: number; maxX: number; maxY: number;
  cx: number; cy: number;
  /** Larger of the two half-spans → the half-side of the bounding SQUARE. */
  halfExtent: number;
}

/** Bounding box of a stride-2 [x0,y0,x1,y1,...] buffer. */
export function computeBBoxStride2(xy: Float32Array): BBox2 {
  if (xy.length < 2) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0, halfExtent: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const n = xy.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfExtent = Math.max((maxX - minX) / 2, (maxY - minY) / 2);
  return { minX, minY, maxX, maxY, cx, cy, halfExtent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/embeddingFit.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/embeddingFit.ts" "app/(dashboard)/users/access-analysis/embeddingFit.test.ts"
git commit -m "feat(acc-graph): bbox helper for embedding-fit scale normalization" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Embedding-blob descriptor builder (`embeddingBlobDescriptor.ts`)

The core new piece: a `"blob"` `LayoutDescriptor` whose **loose (s=0) endpoint is the embedding scatter** and whose **packed (s=1) endpoint is the grouped clump, normalized to the embedding's bbox**. Reuses `buildDominantClusters`, `layoutClusterFootprints`, `packMemberPositions`, and `computeBBoxStride2`. `descriptorTarget`'s existing `"blob"` branch consumes it unchanged.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.ts`
- Test: `app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// embeddingBlobDescriptor.test.ts
import { describe, it, expect } from "vitest";
import { buildEmbeddingBlobDescriptor } from "./embeddingBlobDescriptor";
import { computeBBoxStride2 } from "./embeddingFit";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Minimal categorical dim that groups on a synthetic `grp` field. buildDominantClusters
// only touches dim.kind / dim.family / dim.extract / dim.id for a non-activity dim.
const DIM = {
  id: "grp", label: "Group", family: "structure", kind: "categorical",
  source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
  extract: (f) => (f as unknown as { grp: string }).grp,
} as unknown as CatalogDimension;

// 40 nodes in 4 groups; embedding spread over a known, off-origin, non-square box.
function fixture(): { features: NodeFeatureSnapshot[]; xy: Float32Array } {
  const n = 40;
  const features: NodeFeatureSnapshot[] = [];
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    features.push({ grp: `g${i % 4}` } as unknown as NodeFeatureSnapshot);
    xy[i * 2] = 100 + (i * 13 % 400);       // x in [100, ~500]
    xy[i * 2 + 1] = -50 + (i * 7 % 200);    // y in [-50, ~150]
  }
  return { features, xy };
}

describe("buildEmbeddingBlobDescriptor", () => {
  it("uses the embedding coords as the s=0 (loose) endpoint, by node index", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    expect(desc.kind).toBe("blob");
    expect(desc.dimId).toBe("grp");
    expect(desc.loose.length).toBe(features.length * 2);
    for (let i = 0; i < xy.length; i++) expect(desc.loose[i]).toBe(xy[i]);
  });

  it("normalizes the packed (s=1) clump to the embedding bounding square (no balloon)", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const emb = computeBBoxStride2(xy);
    const packed = computeBBoxStride2(desc.packed);
    // half-extent within 5% and center within 5% of the embedding span.
    const tol = emb.halfExtent * 0.05;
    expect(Math.abs(packed.halfExtent - emb.halfExtent)).toBeLessThanOrEqual(tol);
    expect(Math.abs(packed.cx - emb.cx)).toBeLessThanOrEqual(tol);
    expect(Math.abs(packed.cy - emb.cy)).toBeLessThanOrEqual(tol);
  });

  it("emits one footprint center per cluster, aligned to clustering.labels", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    expect(desc.footprints.cx.length).toBe(desc.clustering.labels.length);
    expect(desc.footprints.cy.length).toBe(desc.clustering.labels.length);
    expect(desc.clustering.labels.length).toBe(4); // g0..g3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.test.ts"`
Expected: FAIL — `buildEmbeddingBlobDescriptor` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// embeddingBlobDescriptor.ts
/**
 * embeddingBlobDescriptor.ts — Builds the projector-map "blob" descriptor whose
 * morph runs FROM the embedding scatter (s=0) TO a grouped clump (s=1). The clump is
 * scale-normalized to the embedding's bounding box so the cloud never rescales during
 * the morph (the coordinate-scale risk). descriptorTarget's "blob" branch lerps
 * loose→packed off the live slider, unchanged. Pure: no React/DOM/IO.
 */
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprints } from "./clusterForceLayout";
import { packMemberPositions, type ClusterFootprints } from "./clusterPacking";
import { computeBBoxStride2 } from "./embeddingFit";
import type { LayoutDescriptor } from "./layoutDescriptor";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildEmbeddingBlobDescriptor(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  embeddingXy: Float32Array,
): Extract<LayoutDescriptor, { kind: "blob" }> {
  const n = features.length;
  const clustering = buildDominantClusters(features, dim);
  const footprintsRaw = layoutClusterFootprints(clustering.counts);
  const packedRaw = packMemberPositions(clustering.ids, footprintsRaw, 1, n);

  // Affine-fit the packed cloud onto the embedding's bounding square (uniform scale,
  // matched centers). Apply the SAME transform to the footprint centers so labels
  // sit on the morphed clumps.
  const emb = computeBBoxStride2(embeddingXy);
  const pack = computeBBoxStride2(packedRaw);
  const scale = pack.halfExtent > 0 ? emb.halfExtent / pack.halfExtent : 1;

  const packed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    packed[i * 2] = emb.cx + (packedRaw[i * 2] - pack.cx) * scale;
    packed[i * 2 + 1] = emb.cy + (packedRaw[i * 2 + 1] - pack.cy) * scale;
  }

  const k = footprintsRaw.r.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  for (let c = 0; c < k; c++) {
    cx[c] = emb.cx + (footprintsRaw.cx[c] - pack.cx) * scale;
    cy[c] = emb.cy + (footprintsRaw.cy[c] - pack.cy) * scale;
    r[c] = footprintsRaw.r[c] * scale;
  }
  const footprints: ClusterFootprints = { cx, cy, r };

  return { kind: "blob", dimId: dim.id, clustering, footprints, loose: embeddingXy, packed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.ts" "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.test.ts"
git commit -m "feat(acc-graph): embedding-blob descriptor (scatter s=0 -> normalized clump s=1)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Bounding-box-stability gate test (owner-required)

The owner's hard gate: prove the morphed cloud never balloons across the full strength range. Drives `descriptorTarget` over s ∈ {0, 0.25, 0.5, 0.75, 1} and asserts the cloud's half-extent stays within the embedding bbox (×1.05).

**Files:**
- Test: `app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.morph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// embeddingBlobDescriptor.morph.test.ts
import { describe, it, expect } from "vitest";
import { buildEmbeddingBlobDescriptor } from "./embeddingBlobDescriptor";
import { descriptorTarget } from "./layoutDescriptor";
import { computeBBoxStride2 } from "./embeddingFit";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const DIM = {
  id: "grp", label: "Group", family: "structure", kind: "categorical",
  source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
  extract: (f) => (f as unknown as { grp: string }).grp,
} as unknown as CatalogDimension;

function fixture(): { features: NodeFeatureSnapshot[]; xy: Float32Array } {
  const n = 60;
  const features: NodeFeatureSnapshot[] = [];
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    features.push({ grp: `g${i % 5}` } as unknown as NodeFeatureSnapshot);
    xy[i * 2] = 200 + (i * 17 % 600);
    xy[i * 2 + 1] = -100 + (i * 11 % 300);
  }
  return { features, xy };
}

// downproject the stride-3 morph output to stride-2 for bbox comparison.
function toXy(xyz: Float32Array): Float32Array {
  const n = xyz.length / 3;
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { xy[i * 2] = xyz[i * 3]; xy[i * 2 + 1] = xyz[i * 3 + 1]; }
  return xy;
}

describe("Group-by morph — bounding box stability (coordinate-scale gate)", () => {
  it("never balloons beyond the embedding bbox across the whole strength range", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const emb = computeBBoxStride2(xy);
    const out = new Float32Array(features.length * 3);
    const limit = emb.halfExtent * 1.05;
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const target = descriptorTarget(desc, { grp: s * 100 }, out);
      const box = computeBBoxStride2(toXy(target));
      expect(box.halfExtent).toBeLessThanOrEqual(limit);
    }
  });

  it("at strength 0 reproduces the embedding scatter exactly", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const out = new Float32Array(features.length * 3);
    const target = descriptorTarget(desc, { grp: 0 }, out);
    for (let i = 0; i < features.length; i++) {
      expect(target[i * 3]).toBeCloseTo(xy[i * 2], 5);
      expect(target[i * 3 + 1]).toBeCloseTo(xy[i * 2 + 1], 5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.morph.test.ts"`
Expected: PASS (2 tests). (This is a *characterization gate* over already-built code from Tasks 1–2; it should pass. If it FAILS, the normalization in Task 2 is wrong — fix Task 2 before proceeding, do NOT weaken the tolerance.)

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.morph.test.ts"
git commit -m "test(acc-graph): bbox-stability gate for the Group-by morph (no balloon/jump)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Group-by option list (`groupByDimensions.ts`)

Pure helpers: which catalog dims appear in the picker (categorical/binary + the bucketed `permission`/`tenure` ordinals; numeric activity-count dims excluded for v1), in a curated order, plus a sensible default.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/groupByDimensions.ts`
- Test: `app/(dashboard)/users/access-analysis/groupByDimensions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// groupByDimensions.test.ts
import { describe, it, expect } from "vitest";
import { groupByDimensions, defaultGroupBy } from "./groupByDimensions";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string, kind: CatalogDimension["kind"], available = true): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind,
    source: "test", confidence: "high", available, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}

describe("groupByDimensions", () => {
  it("keeps categorical/binary + permission/tenure, drops numeric activity dims and unavailable", () => {
    const catalog = [
      dim("role", "categorical"),
      dim("company", "categorical"),
      dim("permission", "ordinal"),       // kept (bucketed)
      dim("tenure", "ordinal"),           // kept (bucketed)
      dim("docViews", "ordinal"),         // dropped (numeric activity)
      dim("internalExternal", "binary"),  // kept
      dim("ghost", "categorical", false), // dropped (unavailable)
    ];
    const ids = groupByDimensions(catalog).map((d) => d.id);
    expect(ids).toContain("role");
    expect(ids).toContain("company");
    expect(ids).toContain("permission");
    expect(ids).toContain("tenure");
    expect(ids).toContain("internalExternal");
    expect(ids).not.toContain("docViews");
    expect(ids).not.toContain("ghost");
  });

  it("orders curated dims first (company, role, project, ...)", () => {
    const catalog = [dim("role", "categorical"), dim("project", "categorical"), dim("company", "categorical")];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["company", "role", "project"]);
  });

  it("defaultGroupBy returns the first curated option, or 'role' when empty", () => {
    expect(defaultGroupBy([dim("role", "categorical"), dim("company", "categorical")])).toBe("company");
    expect(defaultGroupBy([])).toBe("role");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// groupByDimensions.ts
/**
 * groupByDimensions.ts — Which catalog dims the projector map's "Group by" picker
 * offers, and the default. Categorical/binary dims (and the bucketed permission/tenure
 * ordinals) form sensible blobs; numeric activity-count ordinals are excluded for v1
 * (they'd shatter into specks or need bucketing). Curated priority order. Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const PRIORITY = [
  "company", "role", "project", "permission", "tenure",
  "internalExternal", "adminMember", "accountStatus", "dominantActivity",
];

const BUCKETED_ORDINALS = new Set(["permission", "tenure"]);

function isGroupable(d: CatalogDimension): boolean {
  if (!d.available) return false;
  if (d.kind === "categorical" || d.kind === "binary") return true;
  return BUCKETED_ORDINALS.has(d.id);
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const rank = (id: string): number => {
    const i = PRIORITY.indexOf(id);
    return i < 0 ? PRIORITY.length : i;
  };
  return catalog
    .filter(isGroupable)
    .sort((a, b) => rank(a.id) - rank(b.id) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export function defaultGroupBy(catalog: readonly CatalogDimension[]): string {
  return groupByDimensions(catalog)[0]?.id ?? "role";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/groupByDimensions.ts" "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"
git commit -m "feat(acc-graph): Group-by picker option list + default" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `GroupByControls` sidebar component

The new two-control sidebar: a native `<select>` Group-by picker + a `DimensionSlider` for strength (reused so it matches the existing look). Strength reads/writes the selected dim's value through `useSliders`; picker selection is controlled by the parent (so the parent can also build the descriptor for that dim and transfer strength on change).

**Files:**
- Create: `app/(dashboard)/users/access-analysis/GroupByControls.tsx`
- Test: `app/(dashboard)/users/access-analysis/GroupByControls.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// GroupByControls.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupByControls } from "./GroupByControls";
import { SliderProvider } from "./SliderContext";
import type { CatalogDimension } from "./dimensionCatalog.types";

function dim(id: string): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind: "categorical",
    source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}
const CATALOG = [dim("company"), dim("role"), dim("project")];

function renderControls(groupBy: string, onGroupByChange = vi.fn()) {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <GroupByControls catalog={CATALOG} groupBy={groupBy} onGroupByChange={onGroupByChange} />
    </SliderProvider>,
  );
  return { onGroupByChange };
}

describe("GroupByControls", () => {
  it("renders a Group-by option per groupable dim, with the current one selected", () => {
    renderControls("role");
    const select = screen.getByTestId("group-by-select") as HTMLSelectElement;
    expect(select.value).toBe("role");
    expect(screen.getByRole("option", { name: "Company" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Project" })).toBeTruthy();
  });

  it("calls onGroupByChange when the picker changes", () => {
    const { onGroupByChange } = renderControls("role");
    fireEvent.change(screen.getByTestId("group-by-select"), { target: { value: "company" } });
    expect(onGroupByChange).toHaveBeenCalledWith("company");
  });

  it("shows the strength value badge for the selected dim (defaults 0)", () => {
    renderControls("role");
    expect(screen.getByTestId("slider-value-role").textContent).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GroupByControls.test.tsx"`
Expected: FAIL — `GroupByControls` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// GroupByControls.tsx
"use client";
/**
 * GroupByControls.tsx — The projector map's grouping sidebar: a "Group by" picker +
 * a single "Grouping strength" slider. Strength is the selected dim's slider value
 * (read/written through useSliders, so the per-frame morph reads it off getLiveValues);
 * the picker selection is controlled by the parent, which builds the descriptor for
 * that dim and transfers strength on change.
 */
import { useMemo } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { groupByDimensions } from "./groupByDimensions";
import type { CatalogDimension } from "./dimensionCatalog.types";

export interface GroupByControlsProps {
  catalog: readonly CatalogDimension[];
  groupBy: string;
  onGroupByChange: (id: string) => void;
}

export function GroupByControls({ catalog, groupBy, onGroupByChange }: GroupByControlsProps): React.JSX.Element {
  const { values, setSliderValue, resetOne } = useSliders();
  const options = useMemo(() => groupByDimensions(catalog), [catalog]);
  const strength = values[groupBy] ?? 0;

  return (
    <aside data-testid="group-by-controls" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Map grouping</h2>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Group by</span>
          <select
            data-testid="group-by-select"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {options.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>

        <DimensionSlider
          dimId={groupBy}
          label="Grouping strength"
          value={strength}
          onChange={(v) => setSliderValue(groupBy, v)}
          onReset={() => resetOne(groupBy)}
        />

        <p className="text-xs text-muted-foreground">
          0 = free map · 100 = grouped into blobs. Drag to morph in real time.
        </p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/GroupByControls.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GroupByControls.tsx" "app/(dashboard)/users/access-analysis/GroupByControls.test.tsx"
git commit -m "feat(acc-graph): GroupByControls sidebar (picker + strength slider)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Render `GroupByControls` in `RightPanelStack` (flag-OFF)

Swap the default sidebar from `CatalogSliderSidebar` to `GroupByControls` when the parent says so (`useGroupByControls`), passing the controlled `groupBy` + `onGroupByChange`. Flag-ON keeps `CatalogSliderSidebar`. Props are optional so existing callers/tests are unaffected until Task 8 wires them.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/RightPanelStack.tsx`
- Test: `app/(dashboard)/users/access-analysis/RightPanelStack.groupBy.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// RightPanelStack.groupBy.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightPanelStack } from "./RightPanelStack";
import { SliderProvider } from "./SliderContext";
import { SelectionProvider } from "./SelectionContext";
import type { CatalogDimension } from "./dimensionCatalog.types";

// trpc queries used by RightPanelStack must not hit the network in a unit test.
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: { bulkUsers: { useQuery: () => ({ data: [] }) } },
    accMembers: { enrichedUsers: { useQuery: () => ({ data: [] }) } },
  },
}));

function dim(id: string): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind: "categorical",
    source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}
const CATALOG = [dim("company"), dim("role")];

function renderStack(useGroupByControls: boolean) {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <SelectionProvider>
        <RightPanelStack
          features={[]}
          catalog={CATALOG}
          visibleSelectedIndices={null}
          useGroupByControls={useGroupByControls}
          groupBy="company"
          onGroupByChange={vi.fn()}
        />
      </SelectionProvider>
    </SliderProvider>,
  );
}

describe("RightPanelStack — sidebar selection", () => {
  it("renders GroupByControls when useGroupByControls is true", () => {
    renderStack(true);
    expect(screen.getByTestId("group-by-controls")).toBeTruthy();
    expect(screen.queryByTestId("catalog-slider-sidebar")).toBeNull();
  });

  it("renders the legacy CatalogSliderSidebar when useGroupByControls is false", () => {
    renderStack(false);
    expect(screen.getByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("group-by-controls")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/RightPanelStack.groupBy.test.tsx"`
Expected: FAIL — `RightPanelStack` does not accept `useGroupByControls` / renders no group-by controls.

- [ ] **Step 3: Edit `RightPanelStack.tsx`**

Add the import near the other panel imports (after line 19):

```tsx
import { GroupByControls } from "./GroupByControls";
```

Extend the props interface (replace the existing `RightPanelStackProps`):

```tsx
export interface RightPanelStackProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
  catalog: readonly CatalogDimension[];
  visibleSelectedIndices: ReadonlySet<number> | null;
  /** Flag-OFF projector map: render the Group-by controls instead of the slider wall. */
  useGroupByControls?: boolean;
  groupBy?: string;
  onGroupByChange?: (id: string) => void;
}
```

Update the destructure (replace the existing parameter list):

```tsx
export function RightPanelStack({
  features,
  catalog,
  visibleSelectedIndices,
  useGroupByControls = false,
  groupBy,
  onGroupByChange,
}: RightPanelStackProps): React.JSX.Element {
```

Replace the default "sliders" branch (currently lines ~118-121):

```tsx
        ) : (
          <motion.div key="sliders" {...slide}>
            {useGroupByControls && groupBy && onGroupByChange ? (
              <GroupByControls catalog={catalog} groupBy={groupBy} onGroupByChange={onGroupByChange} />
            ) : (
              <CatalogSliderSidebar catalog={catalog} />
            )}
          </motion.div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/RightPanelStack.groupBy.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/RightPanelStack.tsx" "app/(dashboard)/users/access-analysis/RightPanelStack.groupBy.test.tsx"
git commit -m "feat(acc-graph): RightPanelStack renders GroupByControls on the projector map" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Map-grouping resolver (`mapGrouping.ts`)

Extract the small, branchy "what dim/color/labels for the current state" decision into a pure, unit-tested function so the shell wiring (Task 8) is thin glue. Flag-ON preserves today's behavior; flag-OFF is the new "cluster galaxy at rest, follow group-by once grouping" rule.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/mapGrouping.ts`
- Test: `app/(dashboard)/users/access-analysis/mapGrouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mapGrouping.test.ts
import { describe, it, expect } from "vitest";
import { resolveMapGrouping } from "./mapGrouping";

// hasDim: company/role are colorable registry dims; "weird" is not.
const hasDim = (id: string) => id === "company" || id === "role";

describe("resolveMapGrouping (flag-OFF projector map)", () => {
  it("at rest (strength 0): cluster color, no labels, groups by the picker dim", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "company", groupingDim: "role", strength: 0, hasDim });
    expect(r.groupDimId).toBe("company");
    expect(r.colorMode).toBe("cluster");
    expect(r.showLabels).toBe(false);
  });

  it("while grouping (strength > 0): color + labels follow the picker dim", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "company", groupingDim: "role", strength: 40, hasDim });
    expect(r.groupDimId).toBe("company");
    expect(r.colorMode).toBe("company");
    expect(r.showLabels).toBe(true);
  });

  it("falls back to cluster color when the picker dim is not colorable", () => {
    const r = resolveMapGrouping({ flagOn: false, groupBy: "weird", groupingDim: "role", strength: 40, hasDim });
    expect(r.colorMode).toBe("cluster");
    expect(r.showLabels).toBe(true); // still grouping/labelled by the dim
  });
});

describe("resolveMapGrouping (flag-ON physics graph)", () => {
  it("groups + colors + labels by the dominant slider dim (today's behavior)", () => {
    const r = resolveMapGrouping({ flagOn: true, groupBy: "company", groupingDim: "role", strength: 0, hasDim });
    expect(r.groupDimId).toBe("role");
    expect(r.colorMode).toBe("role");
    expect(r.showLabels).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/mapGrouping.test.ts"`
Expected: FAIL — `resolveMapGrouping` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// mapGrouping.ts
/**
 * mapGrouping.ts — Pure resolver for which dim the map groups by, which color mode to
 * use, and whether to show cluster labels. Flag-ON = today's dominant-slider behavior.
 * Flag-OFF (projector map) = the cluster galaxy at rest, color+labels follow the
 * Group-by picker once strength > 0. No React/DOM/IO.
 */
import type { ColorMode } from "./nodeColors";

export interface MapGroupingInput {
  flagOn: boolean;
  /** Picker selection (flag-OFF). */
  groupBy: string;
  /** Dominant slider dim (flag-ON). */
  groupingDim: string;
  /** Selected group-by strength 0..100 (flag-OFF). */
  strength: number;
  /** Is `id` a colorable registry dimension? (i.e. getDimension(id) != null). */
  hasDim: (id: string) => boolean;
}

export interface MapGroupingResult {
  groupDimId: string;
  colorMode: ColorMode;
  showLabels: boolean;
}

export function resolveMapGrouping(i: MapGroupingInput): MapGroupingResult {
  if (i.flagOn) {
    return {
      groupDimId: i.groupingDim,
      colorMode: (i.hasDim(i.groupingDim) ? i.groupingDim : "role") as ColorMode,
      showLabels: true,
    };
  }
  const grouping = i.strength > 0;
  const colorMode: ColorMode = !grouping
    ? "cluster"
    : ((i.hasDim(i.groupBy) ? i.groupBy : "cluster") as ColorMode);
  return { groupDimId: i.groupBy, colorMode, showLabels: grouping };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/mapGrouping.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/mapGrouping.ts" "app/(dashboard)/users/access-analysis/mapGrouping.test.ts"
git commit -m "feat(acc-graph): pure map-grouping resolver (dim/color/labels by state)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Wire it into the shell (`AccessAnalysisShell.tsx`)

Glue task: in `ShellBody`, introduce the controlled `groupBy` state, derive the embedding coords from the static layer, build the embedding-blob descriptor on the flag-OFF path, always pass `layoutTarget`, drive color/labels via `resolveMapGrouping`, and render `GroupByControls` through `RightPanelStack`. Flag-ON behavior is preserved.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Add imports** (after line 49, with the other local imports)

```tsx
import { buildEmbeddingBlobDescriptor } from "./embeddingBlobDescriptor";
import { groupByDimensions, defaultGroupBy } from "./groupByDimensions";
import { resolveMapGrouping } from "./mapGrouping";
```

- [ ] **Step 2: Pull `setSliderValue` from the slider context**

Replace (line 127):

```tsx
  const { values: sliderValues, getLiveValues } = useSliders();
```

with:

```tsx
  const { values: sliderValues, getLiveValues, setSliderValue } = useSliders();
```

- [ ] **Step 3: Add controlled group-by state + strength + transfer handler** (immediately after the `useSliders()` line)

```tsx
  // Projector map (flag-OFF): ONE controlled grouping dim + a single strength slider.
  // Strength is stored as that dim's slider value, so the per-frame morph reads it off
  // getLiveValues() with no extra plumbing. Changing the picker transfers the current
  // strength to the new dim (and zeroes the old) so the layout follows the selection.
  const [groupBy, setGroupBy] = useState<string>(() => defaultGroupBy(catalog));
  const strength = sliderValues[groupBy] ?? 0;
  const onGroupByChange = useCallback(
    (next: string): void => {
      const carry = sliderValues[groupBy] ?? 0;
      setSliderValue(groupBy, 0);
      setSliderValue(next, carry);
      setGroupBy(next);
    },
    [groupBy, sliderValues, setSliderValue],
  );
```

- [ ] **Step 4: Resolve dim/color/labels and the embedding coords**

Replace the existing grouping/color block (lines 129-180, from the `groupingOrder` memo through `groupedByLabel`) with:

```tsx
  // Flag-ON: dominant slider dim (unchanged). Flag-OFF: the picker selection.
  const groupingOrder = useMemo(() => catalog.map((d) => d.id), [catalog]);
  const groupingDim = useMemo(
    () => activeGroupingDimension(sliderValues, groupingOrder, "role"),
    [sliderValues, groupingOrder],
  );
  const grouping = useMemo(
    () =>
      resolveMapGrouping({
        flagOn: ACC_3D_GRAPH_ENABLED,
        groupBy,
        groupingDim,
        strength,
        hasDim: (id) => getDimension(id as DimensionId) != null,
      }),
    [groupBy, groupingDim, strength],
  );

  // The catalog dimension we cluster + position by (always defined: falls back to role).
  const groupDim = useMemo(
    () =>
      catalog.find((d) => d.id === grouping.groupDimId) ??
      catalog.find((d) => d.id === "role") ??
      catalog[0],
    [catalog, grouping.groupDimId],
  );

  // Static layer's positions ARE the embedding scatter (flag-OFF). Downproject to
  // stride-2 once; used as the morph's s=0 endpoint.
  const embeddingXy = useMemo<Float32Array | null>(() => {
    if (ACC_3D_GRAPH_ENABLED) return null;
    const xyz = physics.getPositions();
    const n = xyz.length / 3;
    const xy = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      xy[i * 2] = xyz[i * 3];
      xy[i * 2 + 1] = xyz[i * 3 + 1];
    }
    return xy;
  }, [physics]);

  // LAYOUT descriptor: flag-ON keeps the loose→tight footprint morph; flag-OFF morphs
  // the embedding scatter (s=0) → grouped clump (s=1), normalized to the embedding bbox.
  const blobDesc = useMemo(() => {
    if (!groupDim) return null;
    if (ACC_3D_GRAPH_ENABLED) return buildUserBlobDescriptor(features, groupDim);
    return embeddingXy ? buildEmbeddingBlobDescriptor(features, groupDim, embeddingXy) : null;
  }, [features, groupDim, embeddingXy]);

  const layoutOutRef = useRef<Float32Array>(new Float32Array(features.length * 3));
  const layoutTarget = useCallback((): Float32Array => {
    if (!blobDesc) return layoutOutRef.current;
    return descriptorTarget(blobDesc, getLiveValues(), layoutOutRef.current);
  }, [blobDesc, getLiveValues]);

  // Color: sticky override wins; else the resolver's auto mode.
  const [colorOverride, setColorOverride] = useState<ColorMode | null>(null);
  const colorIsAuto = colorOverride === null;
  const autoColorMode: ColorMode = grouping.colorMode;
  const colorMode: ColorMode = colorOverride ?? autoColorMode;
  const setColorMode = (m: ColorMode): void => setColorOverride(m);
  const resetColor = (): void => setColorOverride(null);
  const groupedByLabel = COLOR_MODE_LABELS[autoColorMode] ?? autoColorMode;
```

> Note: this removes the old `blobDesc`/`layoutOutRef`/`layoutTarget` definitions (previously lines 149-157) and the old color block — they are re-expressed above. Delete the now-duplicated originals if the editor leaves them.

- [ ] **Step 5: Always pass `layoutTarget`; gate labels by `grouping.showLabels`**

Replace line 323:

```tsx
              layoutTarget={ACC_3D_GRAPH_ENABLED ? layoutTarget : undefined}
```

with:

```tsx
              layoutTarget={layoutTarget}
```

Replace the `MapClusterLabels` centers/labels props (lines 337-339):

```tsx
            centersX={grouping.showLabels && blobDesc ? blobDesc.footprints.cx : null}
            centersY={grouping.showLabels && blobDesc ? blobDesc.footprints.cy : null}
            labels={grouping.showLabels && blobDesc ? blobDesc.clustering.labels : []}
```

(Leave `gpuSimulation={ACC_3D_GRAPH_ENABLED ? undefined : false}` unchanged — flag-OFF stays physics-free.)

- [ ] **Step 6: Pass the group-by props to `RightPanelStack`**

Replace the `RightPanelStack` element (lines 363-367):

```tsx
        <RightPanelStack
          features={features}
          catalog={catalog}
          visibleSelectedIndices={visibleSubset}
          useGroupByControls={!ACC_3D_GRAPH_ENABLED}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
        />
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `groupedByLabel`/`activeGroupingDimension`/`getDimension` show as unused on the flag-ON branch, they are still used — `activeGroupingDimension` in `groupingDim`, `getDimension` in the `hasDim` closure, `groupedByLabel` in the `Toolbar` props. Do not delete them.)

- [ ] **Step 8: Run the access-analysis suite**

Run: `npx vitest run "app/(dashboard)/users/access-analysis"`
Expected: PASS. The pre-existing `previewIntegration.test.tsx` and any `ShellBody` tests still pass (flag-OFF default now passes a real `layoutTarget`; at strength 0 the descriptor returns the embedding scatter, so positions are unchanged at rest).

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(acc-graph): wire Group-by + Strength morph into the projector map" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (no regressions vs. the pre-task baseline; new tests from Tasks 1–7 included).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint the changed files**

Run: `npx eslint "app/(dashboard)/users/access-analysis/embeddingFit.ts" "app/(dashboard)/users/access-analysis/embeddingBlobDescriptor.ts" "app/(dashboard)/users/access-analysis/groupByDimensions.ts" "app/(dashboard)/users/access-analysis/GroupByControls.tsx" "app/(dashboard)/users/access-analysis/mapGrouping.ts" "app/(dashboard)/users/access-analysis/RightPanelStack.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"`
Expected: no errors.

- [ ] **Step 4: Record the gate result**

Confirm in the final report: unit suite green, `tsc` 0, and the **bbox-stability gate** (`embeddingBlobDescriptor.morph.test.ts`) green — this is the owner's required gate before visual review.

---

### Task 10 (deferred to owner): Visual UAT + e2e

The owner rebuilds and reviews on their machine (deploy = `npm run build` + restart; do NOT build under a running `:3000` — it 500s the live app). E2e runs on `:3100` with `NEXT_PUBLIC_ACC_GRAPH_TEST`.

- [ ] **Step 1 (owner):** Rebuild and open `/users/spatial-graph`. Verify: at strength 0 the map is the same projector scatter; dragging strength smoothly morphs dots into labeled blobs with no lag and no rescale/jump; changing "Group by" smoothly re-flows; back to 0 returns to the scatter.
- [ ] **Step 2 (optional e2e):** Add a smoke spec under `tests/e2e/` that loads the graph, reads positions at strength 0 (== scatter), drags `group-by-controls` strength to 100, and asserts positions changed with no single-frame delta above a jump threshold. Run: `npm run test:e2e`.

---

## Self-Review

**1. Spec coverage**
- Decision 1 (sliders re-group) → Tasks 2, 8. ✓
- Decision 2 (Group-by + Strength, simplify) → Tasks 4, 5, 6, 8. ✓
- Decision 3 (reuse morph engine, no physics) → Task 8 keeps `gpuSimulation={false}`, reuses `descriptorTarget`/`clusterTransitionLayer`. ✓
- Scale-match risk + test → Tasks 1, 2, 3 (owner gate). ✓
- Color auto-follows group-by; cluster galaxy at rest → Task 7 + 8. ✓
- Labels fade/show with strength → Task 8 (`grouping.showLabels`). ✓ (binary show/hide v1; MapClusterLabels has no opacity prop — true fade is out of v1 scope, noted.)
- Many-valued attributes → `buildDominantClusters` makes one cluster per value; `MapClusterLabels` caps at 16 + matches the top-12 legend buckets, so chips don't shatter. Numeric dims excluded from the picker (Task 4). ✓
- Flag-ON graph + MASK bus untouched → Task 8 branches on `ACC_3D_GRAPH_ENABLED`; no MASK/filter/lasso code touched. ✓
- Node-index alignment → asserted in Task 2. ✓

**2. Placeholder scan** — No TBD/TODO/"handle edge cases"; every code step has full code; every test has assertions. ✓

**3. Type consistency** — `computeBBoxStride2`→`BBox2` used in Tasks 1-3; `buildEmbeddingBlobDescriptor(features, dim, embeddingXy)` signature identical in Tasks 2, 3, 8; `groupByDimensions`/`defaultGroupBy` in Tasks 4, 5, 8; `GroupByControlsProps {catalog, groupBy, onGroupByChange}` in Tasks 5, 6, 8; `RightPanelStackProps` additions in Tasks 6, 8; `resolveMapGrouping`/`MapGroupingResult {groupDimId, colorMode, showLabels}` in Tasks 7, 8. `descriptorTarget(desc, live, out)` and `ClusterFootprints {cx,cy,r}` match the existing modules. ✓

**Known limitation carried from spec:** group-by re-layout recomputes `layoutClusterFootprints` (d3-force) in a `useMemo` on picker change — fast for company/role, up to ~1s for thousands of project clusters (one-time, on change, not per frame). Acceptable for v1; a worker offload is a future optimization.
