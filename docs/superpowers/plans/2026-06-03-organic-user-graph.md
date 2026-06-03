# Organic User-Graph Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/users/spatial-graph` load as an organic, force-directed network grouped by **user** (rainbow blobs + faint grey same-user lines + hover-only names), with one **User-name slider** that progressively tightens from organic (0) to fully clustered (100).

**Architecture:** The engine already has every piece — it just activates only when a slider is dragged, and its morph's loose end is wired to the *ungrouped* rest disc. We (a) make the **user blob the default** layout, (b) repoint the morph's `s=0` endpoint from the rest disc to the **loose grouped** layout (`packMemberPositions(..., tightness 0, ...)`), (c) swap the ease-out curve for a **progressive** one, (d) recolor edges grey, (e) drop persistent labels for hover, (f) add a per-user project count to the tooltip. Color-by-user is already automatic in blob mode.

**Tech Stack:** Next.js App Router, React 19, TypeScript, cosmos.gl (2D) / three.js (3D), d3-hierarchy circle packing, Vitest + Testing Library, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-03-organic-user-graph-design.md`

---

## Architecture note — confirm before Task 3

The graph renders from the **descriptor seam**: `AccessAnalysisShell` builds a `LayoutDescriptor` (structure, once per regroup) and hands `layoutTarget()` (which calls `descriptorTarget`) to `<GraphCanvas>` for per-frame positions. Changing the descriptor changes what renders. The separate `physicsLayer` worker may also feed the GPU sim / the test bridge's `getLayoutStats`. **Task 3 and Task 7 must verify live** that defaulting the descriptor to the user blob actually changes the loaded view (open the page; the load should show clustered rainbow blobs, not the disc). If the rendered default does not change, the descriptor is not the sole render source — STOP and re-investigate the GraphCanvas/physics wiring before proceeding.

## File Structure

- `app/(dashboard)/users/access-analysis/layoutDescriptor.ts` — **modify**: `easeMorph` → progressive; blob descriptor `restXyz` → `loose`; `descriptorTarget` blob lerp `loose→packed`.
- `app/(dashboard)/users/access-analysis/clusterPacking.ts` — **modify**: export `LOOSE_TIGHTNESS` const (the morph's loose endpoint tightness).
- `app/(dashboard)/users/access-analysis/blobDescriptor.ts` — **create**: pure `buildUserBlobDescriptor(features, dim)` builder + its test.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — **modify**: default layout = user blob; blobRestCenters from footprints; remove persistent `ClusterLabels`; drop now-unused imports.
- `app/(dashboard)/users/access-analysis/linkEmphasis.ts` — **modify**: `DEFAULT_LINK_COLORS` base/bright/dim → grey family.
- `app/(dashboard)/users/access-analysis/userProjectCounts.ts` — **create**: `stampUserProjectCounts(features)` + test.
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` — **modify**: add optional `projectCount` to `NodeFeatureSnapshot`.
- `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` + `featureSnapshot.ts` — **modify**: call `stampUserProjectCounts`.
- `app/(dashboard)/users/access-analysis/NodeTooltip.tsx` — **modify**: render project count.
- `tests/e2e/acc-dc-graph.spec.ts` — **modify**: update the two tests that assume the disc default / a Project slider.

## Commit discipline (this WIP branch)

`feat/access-analysis-redesign` carries unrelated uncommitted WIP. **Stage by explicit path only** (`git add -- <path>`), never `-A`/`.`. Before every commit run `git diff --cached --name-only` and confirm ONLY the intended files are staged.

## Test command notes

PowerShell chokes on the literal `(dashboard)` path, so use Vitest **file/name filters**, not raw paths:
- A file: `npx vitest run layoutDescriptor`
- Typecheck: `npx tsc --noEmit`
- Full unit suite: `npm test`
- E2E: `npm run test:e2e`

---

### Task 1: Progressive easing curve

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/layoutDescriptor.ts:42-46`
- Test: `app/(dashboard)/users/access-analysis/layoutDescriptor.test.ts` (add a describe block; create the file if it does not exist)

- [ ] **Step 1: Write the failing test**

Add to `layoutDescriptor.test.ts` (create the file with this content if missing):

```ts
import { describe, it, expect } from "vitest";
import { easeMorph } from "./layoutDescriptor";

describe("easeMorph (progressive curve)", () => {
  it("pins the endpoints exactly", () => {
    expect(easeMorph(0)).toBe(0);
    expect(easeMorph(1)).toBe(1);
  });
  it("is symmetric at the midpoint", () => {
    expect(easeMorph(0.5)).toBeCloseTo(0.5, 6);
  });
  it("is monotonically increasing", () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const v = easeMorph(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("has a GENTLE start — no 0→1 jump (rules out the old ease-out)", () => {
    // ease-out quad gave easeMorph(0.1)=0.19 (a big early jump). A progressive
    // curve must move LESS than linear near 0.
    expect(easeMorph(0.1)).toBeLessThan(0.1);
  });
  it("clamps out-of-range input", () => {
    expect(easeMorph(-1)).toBe(0);
    expect(easeMorph(2)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run layoutDescriptor`
Expected: FAIL on "GENTLE start" — current `easeMorph(0.1)` = `1 - 0.9^2` = `0.19`, which is NOT `< 0.1`.

- [ ] **Step 3: Replace the easing with smoothstep**

In `layoutDescriptor.ts`, replace lines 34-46 (the `EASE_EXP` const + `easeMorph` and its doc comment) with:

```ts
/**
 * Slider value (0..1) → morph progress (0..1), SMOOTHSTEP (ease-in-out): endpoints
 * are exact (0→0, 1→1) and the slope is 0 at both ends, so a small nudge off 0 moves
 * only a little — no 0→1 jump — and motion stays proportional across the whole range.
 * MUST be the single source of the curve — used by both the node morph (descriptorTarget)
 * and any per-frame follow logic so everything stays locked together.
 */
export function easeMorph(s: number): number {
  const t = Math.min(1, Math.max(0, s));
  return t * t * (3 - 2 * t);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run layoutDescriptor`
Expected: PASS (5 tests). `easeMorph(0.1)` = `0.01 * 2.8` = `0.028`.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/layoutDescriptor.ts" "app/(dashboard)/users/access-analysis/layoutDescriptor.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-redesign): progressive smoothstep morph curve (no 0->1 jump)"
```

---

### Task 2: Repoint the blob morph from the rest disc to the loose grouped layout

The morph currently lerps `restXyz` (the ungrouped disc) → `packed` (tight). We change the `s=0` endpoint to the **loose grouped** layout — `packMemberPositions(..., LOOSE_TIGHTNESS, ...)`, where `fillFactor(0)=0.95` fills each footprint (organic). Both endpoints now share fixed footprint centers; only member spread changes.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/clusterPacking.ts` (add `LOOSE_TIGHTNESS` export)
- Modify: `app/(dashboard)/users/access-analysis/layoutDescriptor.ts` (blob type + `descriptorTarget`)
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (blob construction + `blobRestCenters`)
- Test: `app/(dashboard)/users/access-analysis/layoutDescriptor.test.ts`

- [ ] **Step 1: Add the `LOOSE_TIGHTNESS` constant**

In `clusterPacking.ts`, immediately after the `fillFactor` function (after line 29), add:

```ts
/**
 * Morph loose-endpoint tightness (slider = 0). 0 → fillFactor 0.95 = members fill
 * their footprint (clean, organic, just-touching blobs). Visual-UAT tunable: a value
 * >0 starts the load already tighter. (Going beyond the loosest fill — overlapping/
 * blended blobs — would require relaxing the fill<=1 non-overlap clamp; out of scope.)
 */
export const LOOSE_TIGHTNESS = 0;
```

- [ ] **Step 2: Write the failing test for the new morph endpoints**

Add to `layoutDescriptor.test.ts`:

```ts
import { descriptorTarget, type LayoutDescriptor } from "./layoutDescriptor";

function blobFixture(): Extract<LayoutDescriptor, { kind: "blob" }> {
  return {
    kind: "blob",
    dimId: "user",
    clustering: { ids: new Int32Array([0, 0]), labels: ["Ann"], counts: [2] },
    footprints: { cx: new Float32Array([0]), cy: new Float32Array([0]), r: new Float32Array([10]) },
    loose: new Float32Array([-5, 0, 5, 0]), // stride-2, 2 nodes — the s=0 end
    packed: new Float32Array([-1, 0, 1, 0]), // stride-2, 2 nodes — the s=1 end
  };
}

describe("descriptorTarget (blob morphs loose → packed)", () => {
  it("sits at the LOOSE positions at slider 0", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 0 }, out);
    expect([out[0], out[1], out[2]]).toEqual([-5, 0, 0]);
    expect([out[3], out[4], out[5]]).toEqual([5, 0, 0]);
  });
  it("sits at the PACKED positions at slider 100", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 100 }, out);
    expect([out[0], out[1], out[2]]).toEqual([-1, 0, 0]);
    expect([out[3], out[4], out[5]]).toEqual([1, 0, 0]);
  });
  it("interpolates between loose and packed (z stays flat)", () => {
    const out = new Float32Array(2 * 3);
    descriptorTarget(blobFixture(), { user: 50 }, out); // smoothstep(0.5)=0.5
    expect(out[0]).toBeCloseTo(-3, 6); // -5 + (-1 - -5)*0.5
    expect(out[2]).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run layoutDescriptor`
Expected: FAIL — the `blob` descriptor type has `restXyz`, not `loose`; the fixture (and `descriptorTarget`) won't compile/behave.

- [ ] **Step 4: Update the blob descriptor type**

In `layoutDescriptor.ts`, replace the `blob` member of the `LayoutDescriptor` union (lines 22-31) with:

```ts
  | {
      kind: "blob";
      dimId: string;
      clustering: DominantClustering;
      footprints: ClusterFootprints;
      /** Per-node LOOSE grouped position (stride-2, aligned to clustering.ids) — the s=0 end. */
      loose: Float32Array;
      /** Per-node packed clump-core position (stride-2, aligned to clustering.ids) — the s=1 end. */
      packed: Float32Array;
    }
```

- [ ] **Step 5: Update `descriptorTarget` blob case**

In `layoutDescriptor.ts`, replace the `case "blob":` block (lines 73-88) with:

```ts
    case "blob": {
      // s = smoothstep progress 0→1. Morph each node from its LOOSE grouped position
      // (s=0, organic) to its packed clump core (s=1, tight). Both endpoints share the
      // fixed footprint centers, so only member spread changes. Allocation-free.
      const s = easeMorph((live[desc.dimId] ?? 0) / 100);
      const n = desc.clustering.ids.length;
      const loose = desc.loose; // stride-2
      const packed = desc.packed; // stride-2
      for (let i = 0; i < n; i++) {
        const lx = loose[i * 2];
        const ly = loose[i * 2 + 1];
        out[i * 3] = lx + (packed[i * 2] - lx) * s;
        out[i * 3 + 1] = ly + (packed[i * 2 + 1] - ly) * s;
        out[i * 3 + 2] = 0;
      }
      return out;
    }
```

- [ ] **Step 6: Update the Shell's blob construction + blobRestCenters**

In `AccessAnalysisShell.tsx`, add `LOOSE_TIGHTNESS` to the clusterPacking import (line 37):

```ts
import { packMemberPositions, LOOSE_TIGHTNESS } from "./clusterPacking";
```

Replace the blob branch (lines 136-144) inside the `layoutDescriptor` useMemo with:

```ts
    if (activeDims.length === 1) {
      const clustering = buildDominantClusters(features, activeDims[0]);
      const footprints = layoutClusterFootprints(clustering.counts);
      // Two morph endpoints, fixed footprint centers: loose (organic, fills footprints)
      // → packed (tight cores). descriptorTarget lerps loose→packed per frame.
      const loose = packMemberPositions(clustering.ids, footprints, LOOSE_TIGHTNESS, features.length);
      const packed = packMemberPositions(clustering.ids, footprints, 1, features.length);
      return { kind: "blob", dimId: activeDims[0].id, clustering, footprints, loose, packed };
    }
```

Replace `blobRestCenters` (lines 179-197) with — the cluster centroid is now always the footprint center (both endpoints center there), so super-dots/aggregates sit at the footprint centers:

```ts
  // Per-cluster center for the LOD aggregate "super-dots". Loose and packed both center
  // on the footprint, so the cluster center is the footprint center at any tightness.
  const blobRestCenters = useMemo<{ cx: Float32Array; cy: Float32Array } | null>(() => {
    if (layoutDescriptor.kind !== "blob") return null;
    return { cx: layoutDescriptor.footprints.cx, cy: layoutDescriptor.footprints.cy };
  }, [layoutDescriptor]);
```

- [ ] **Step 7: Run unit tests + typecheck**

Run: `npx vitest run layoutDescriptor`  → PASS (8 tests total)
Run: `npx tsc --noEmit`  → exit 0 (no references to the removed blob `restXyz`).

- [ ] **Step 8: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/clusterPacking.ts" "app/(dashboard)/users/access-analysis/layoutDescriptor.ts" "app/(dashboard)/users/access-analysis/layoutDescriptor.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git diff --cached --name-only
git commit -m "feat(acc-redesign): blob morph loose(grouped)->packed, not disc->packed"
```

---

### Task 3: Default the graph to the user blob (organic on load)

Extract a pure descriptor builder and make the Shell ALWAYS use it, so load (User slider at its default 0) shows organic user blobs instead of the rest disc.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/blobDescriptor.ts`
- Test: `app/(dashboard)/users/access-analysis/blobDescriptor.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/users/access-analysis/blobDescriptor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildUserBlobDescriptor } from "./blobDescriptor";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";

function snap(nodeId: string, userName: string): NodeFeatureSnapshot {
  return {
    nodeId,
    nameLower: userName.toLowerCase(),
    emailLower: "",
    userName,
    project: "P",
    role: "R",
    permTier: null,
    isExternal: false,
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "active",
  } as NodeFeatureSnapshot;
}

const USER_DIM = {
  id: "user",
  label: "User name",
  family: "affiliation",
  kind: "categorical",
  source: "test",
  confidence: "high",
  available: true,
  surfaces: ["slider", "color"],
  colorScale: "categorical",
  extract: (f: NodeFeatureSnapshot) => (f.userName ? f.userName : null),
} as unknown as CatalogDimension;

describe("buildUserBlobDescriptor", () => {
  it("always returns a user blob with loose + packed endpoints", () => {
    const features = [snap("u1::p1", "Ann"), snap("u1::p2", "Ann"), snap("u2::p1", "Bob")];
    const d = buildUserBlobDescriptor(features, USER_DIM);
    expect(d.kind).toBe("blob");
    expect(d.dimId).toBe("user");
    expect([...d.clustering.labels].sort()).toEqual(["Ann", "Bob"]);
    expect(d.loose.length).toBe(features.length * 2);
    expect(d.packed.length).toBe(features.length * 2);
  });
  it("groups same-user nodes into the same cluster id", () => {
    const features = [snap("u1::p1", "Ann"), snap("u1::p2", "Ann"), snap("u2::p1", "Bob")];
    const d = buildUserBlobDescriptor(features, USER_DIM);
    expect(d.clustering.ids[0]).toBe(d.clustering.ids[1]); // both Ann
    expect(d.clustering.ids[0]).not.toBe(d.clustering.ids[2]); // Ann ≠ Bob
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run blobDescriptor`
Expected: FAIL — cannot resolve `./blobDescriptor`.

- [ ] **Step 3: Write the builder**

Create `app/(dashboard)/users/access-analysis/blobDescriptor.ts`:

```ts
/**
 * blobDescriptor.ts — Pure builder for the default "blob" layout descriptor. The graph
 * groups every node into one organic blob per the given dimension's value (here: user
 * name), with a loose endpoint (organic, fills footprints) and a packed endpoint (tight
 * cores). descriptorTarget lerps loose→packed off the live slider. No React/DOM/IO.
 */
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprints } from "./clusterForceLayout";
import { packMemberPositions, LOOSE_TIGHTNESS } from "./clusterPacking";
import type { LayoutDescriptor } from "./layoutDescriptor";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildUserBlobDescriptor(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
): Extract<LayoutDescriptor, { kind: "blob" }> {
  const clustering = buildDominantClusters(features, dim);
  const footprints = layoutClusterFootprints(clustering.counts);
  const loose = packMemberPositions(clustering.ids, footprints, LOOSE_TIGHTNESS, features.length);
  const packed = packMemberPositions(clustering.ids, footprints, 1, features.length);
  return { kind: "blob", dimId: dim.id, clustering, footprints, loose, packed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run blobDescriptor`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the Shell to always use the user blob**

In `AccessAnalysisShell.tsx`:

(a) Add the import (after line 39):

```ts
import { buildUserBlobDescriptor } from "./blobDescriptor";
```

(b) Replace the entire `layoutDescriptor` useMemo (lines 134-153) with — always the user blob; the slider only drives tightness:

```ts
  // SINGLE-DIMENSION BUILD: the graph ALWAYS clusters by user. The User-name slider
  // drives only tightness (0 = organic/loose on load, 100 = tight clumps) via the
  // descriptorTarget morph — NOT whether clustering is on. (Other dimensions + the
  // rest/grid layouts are future work; see the spec.)
  const userDim = useMemo<CatalogDimension>(
    () => sliderDims.find((d) => d.id === "user") ?? sliderDims[0],
    [sliderDims],
  );
  const layoutDescriptor = useMemo<LayoutDescriptor>(
    () => buildUserBlobDescriptor(features, userDim),
    [features, userDim],
  );
```

(c) Remove now-unused imports/values to satisfy `tsc`/lint:
- Remove `buildRestLayout` from the import on line 38 and delete `const restXyz = useMemo(() => buildRestLayout(features), [features]);` (line 132).
- Remove `buildGridStructure` from the import on line 39.
- Keep `activeCatalogDims`/`activeDims` (still used by the active-grouping indicator + `colorIds`).

> If `tsc` later flags any other symbol as unused because the rest/grid branches are gone, remove that import too. Do NOT remove the `rest`/`grid` members from the `LayoutDescriptor` union type — `descriptorTarget`/`descriptorNodeCount` still handle them.

- [ ] **Step 6: Typecheck + unit suite**

Run: `npx tsc --noEmit`  → exit 0
Run: `npm test`  → all green

- [ ] **Step 7: Live verification (per the Architecture note)**

Build is risky against a running :3000 (it can 500 the live app). During a quiet window: stop the running app, `npm run build`, restart, open `http://localhost:3000/users/spatial-graph`. CONFIRM: the load shows **clustered rainbow blobs** (organic), not the single grey disc; dragging the **User-name slider** to 100 tightens them into separated clumps, smoothly (no jump off 0). If load still shows the disc, the descriptor is not the sole render source — STOP and re-investigate (see Architecture note) before continuing.

- [ ] **Step 8: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/blobDescriptor.ts" "app/(dashboard)/users/access-analysis/blobDescriptor.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git diff --cached --name-only
git commit -m "feat(acc-redesign): default graph to organic user blobs on load"
```

---

### Task 4: Faint grey same-user lines

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/linkEmphasis.ts:11-16`
- Test: `app/(dashboard)/users/access-analysis/linkEmphasis.test.ts`

- [ ] **Step 1: Update the test for grey defaults**

Open `linkEmphasis.test.ts`. If it asserts the old blue base values (`0.62, 0.72, 0.93`), update those expectations. Add (or adapt) a test asserting the base color is GREY (r≈g≈b) and quiet:

```ts
import { describe, it, expect } from "vitest";
import { computeLinkEmphasisColors, DEFAULT_LINK_COLORS } from "./linkEmphasis";
import type { SameUserEdge } from "./sameUserEdges";

const edge = (userId: string): SameUserEdge => ({ sourceIndex: 0, targetIndex: 1, userId, edgeType: "same-user" });

describe("link colors are faint grey at rest", () => {
  it("base is grey (r≈g≈b) and low-opacity", () => {
    const [r, g, b, a] = DEFAULT_LINK_COLORS.base;
    expect(Math.abs(r - g)).toBeLessThan(0.08);
    expect(Math.abs(g - b)).toBeLessThan(0.08);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0.3);
  });
  it("no focus → every edge gets the base grey", () => {
    const out = computeLinkEmphasisColors([edge("u1")], new Set());
    expect([out[0], out[1], out[2], out[3]]).toEqual([...DEFAULT_LINK_COLORS.base]);
  });
  it("focused user's edge brightens", () => {
    const out = computeLinkEmphasisColors([edge("u1")], new Set(["u1"]));
    expect(out[3]).toBe(DEFAULT_LINK_COLORS.bright[3]); // bright alpha
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run linkEmphasis`
Expected: FAIL — current base is blue (`0.62,0.72,0.93`), so `|r-g|`/`|g-b|` exceed 0.08.

- [ ] **Step 3: Recolor the defaults**

In `linkEmphasis.ts`, replace `DEFAULT_LINK_COLORS` (lines 11-16) with:

```ts
export const DEFAULT_LINK_COLORS: LinkColorOpts = {
  base: [0.6, 0.62, 0.66, 0.14], // faint cool grey — quiet always-on lines
  bright: [0.85, 0.88, 0.95, 0.9], // near-white — a person's lines light up on click/isolate
  dim: [0.6, 0.62, 0.66, 0.04], // nearly invisible when another user is focused
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run linkEmphasis`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/linkEmphasis.ts" "app/(dashboard)/users/access-analysis/linkEmphasis.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-redesign): faint grey same-user links (bright on isolate)"
```

---

### Task 5: Hover-only labels (remove the persistent overlay)

With the user blob now the default, the persistent `ClusterLabels` overlay would always show top-N user names. The spec wants names on hover only (`NodeTooltip`), so remove the overlay.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Remove the ClusterLabels render block**

In `AccessAnalysisShell.tsx`, delete the block at lines 368-382:

```tsx
{/* 1-slider blob labels: pinned to each packed footprint center (2D only). */}
{layoutDescriptor.kind === "blob" && (
  <ClusterLabels
    ...
  />
)}
```

- [ ] **Step 2: Remove the now-dead support code**

- Delete the `ClusterLabels` import (line 33).
- Delete `labelProgress` (the `useCallback` at lines 170-174) — it existed only to feed `ClusterLabels`. (Confirm it has no other reference with a quick search before deleting.)
- Keep `blobRestCenters` and `aggregates` — they drive the LOD super-dots, not labels.

- [ ] **Step 3: Typecheck + unit suite**

Run: `npx tsc --noEmit`  → exit 0 (no unused `ClusterLabels`/`labelProgress`).
Run: `npm test`  → green.

> If a Shell render/integration test asserts a `cluster-labels` / `cluster-label` testid, update it to expect the overlay is gone (hover tooltip is the name surface now). E2E cluster-label assertions are handled in Task 7.

- [ ] **Step 4: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git diff --cached --name-only
git commit -m "feat(acc-redesign): names on hover only (remove persistent cluster labels)"
```

---

### Task 6: Show the user's project count in the hover tooltip

**Files:**
- Create: `app/(dashboard)/users/access-analysis/userProjectCounts.ts`
- Test: `app/(dashboard)/users/access-analysis/userProjectCounts.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts`
- Modify: `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts`
- Modify: `app/(dashboard)/users/access-analysis/NodeTooltip.tsx`

- [ ] **Step 1: Write the failing test for the counter**

Create `app/(dashboard)/users/access-analysis/userProjectCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stampUserProjectCounts } from "./userProjectCounts";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const f = (nodeId: string): NodeFeatureSnapshot => ({ nodeId } as NodeFeatureSnapshot);

describe("stampUserProjectCounts", () => {
  it("stamps each node with how many projects its user is on", () => {
    const fs = [f("u1::p1"), f("u1::p2"), f("u2::p1")];
    stampUserProjectCounts(fs);
    expect(fs[0].projectCount).toBe(2);
    expect(fs[1].projectCount).toBe(2);
    expect(fs[2].projectCount).toBe(1);
  });
  it("handles an empty list", () => {
    const fs: NodeFeatureSnapshot[] = [];
    stampUserProjectCounts(fs);
    expect(fs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run userProjectCounts`
Expected: FAIL — cannot resolve `./userProjectCounts`.

- [ ] **Step 3: Write the counter + add the field**

Create `app/(dashboard)/users/access-analysis/userProjectCounts.ts`:

```ts
/**
 * userProjectCounts.ts — Stamp each feature snapshot with how many projects its user
 * appears on. A node id is "userId::projectId"; the count is the number of nodes that
 * share the userId. Mutates the array in place (called once at snapshot-build time).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function stampUserProjectCounts(features: NodeFeatureSnapshot[]): void {
  const counts = new Map<string, number>();
  for (const f of features) {
    const uid = f.nodeId.split("::")[0];
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  for (const f of features) {
    f.projectCount = counts.get(f.nodeId.split("::")[0]) ?? 0;
  }
}
```

In `interactionTypes.ts`, add to the `NodeFeatureSnapshot` interface (near the other optional fields):

```ts
  /** How many projects this node's user appears on (stamped by stampUserProjectCounts). */
  projectCount?: number;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run userProjectCounts`
Expected: PASS (2 tests).

- [ ] **Step 5: Call the stamper in both snapshot-build paths**

In `graphNodesFromUsers.ts`, add the import and stamp `features` before returning (just before `return { nodeIds, features };`):

```ts
import { stampUserProjectCounts } from "./userProjectCounts";
// ...
  stampUserProjectCounts(features);
  return { nodeIds, features };
```

In `featureSnapshot.ts` (`buildFeatureSnapshot`), add the same import and call `stampUserProjectCounts(<the built features array>)` immediately before that function returns its `NodeFeatureSnapshot[]`. (Find the array it returns; stamp it in place, then return it.)

- [ ] **Step 6: Render the count in the tooltip**

In `NodeTooltip.tsx`, after the Activity `<div>` (line 78-80), add:

```tsx
      {typeof feature.projectCount === "number" && (
        <div>Projects: {feature.projectCount}</div>
      )}
```

- [ ] **Step 7: Typecheck + unit suite**

Run: `npx tsc --noEmit`  → exit 0
Run: `npm test`  → green

- [ ] **Step 8: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/userProjectCounts.ts" "app/(dashboard)/users/access-analysis/userProjectCounts.test.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/NodeTooltip.tsx"
git diff --cached --name-only
git commit -m "feat(acc-redesign): hover tooltip shows the user's project count"
```

---

### Task 7: Update e2e for the new default, run all gates, record debt

Two e2e tests assume the old reality: a **volumetric disc default** and a **Project slider**. The new default is a 2D user-blob and the only slider is **User**.

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts`
- Modify: `.gsd/TECHNICAL_DEBT.md`

- [ ] **Step 1: Fix the "default layout" test (currently lines 186-215)**

This test asserts depth (`zRange > 1` and `zRange > 0.2*max(x,y)` — "not a flat disc"). The new default user-blob is intentionally **flat 2D** (z=0). Replace the depth assertions (lines 202-204) with a flatness + clustering check:

```ts
    expect(stats.xRange, "x spread").toBeGreaterThan(1);
    expect(stats.yRange, "y spread").toBeGreaterThan(1);
    // New default is the 2D organic USER blob — intentionally flat (no depth).
    expect(stats.zRange, "default user-blob is flat (2D)").toBeLessThan(0.05 * Math.max(stats.xRange, stats.yRange));
```

Also update the test title and the stale "volumetric" comment (lines 186-192) to describe the flat user-blob default. Keep the `anyNaN`, `nodeCount === EXPECTED_NODE_COUNT`, and `getPositionsStats` non-runaway assertions.

> If `getLayoutStats` turns out to read the 3D physics worker (still volumetric) rather than the rendered descriptor, this test may still pass as-is — confirm against the real run. If it reads the rendered positions, the edit above is required. Match the assertion to the observed `zRange` for the new default.

- [ ] **Step 2: Fix the "moving the project slider" test (currently lines 217-238)**

The only slider is now **User**. Replace `page.getByLabel("Project thumb")` (line 222) with `page.getByLabel("User thumb")`, and the clustering-score dim (line 230) from `"project"` to `"user"`. Update the title to "moving the user slider tightens clusters (smoke)" and assert tightening:

```ts
    const thumb = page.getByLabel("User thumb");
    await thumb.focus();
    await page.keyboard.press("End"); // Radix slider: End → max (100)
    await page.waitForTimeout(1_500);

    const pos = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getPositionsStats());
    const score = await page.evaluate(() => window.__ACC_GRAPH_TEST__!.getClusteringScore("user").ratio);
    expect(pos.anyNaN, "no NaN after slider change").toBe(false);
    expect(pos.count, "node set intact after slider change").toBe(EXPECTED_NODE_COUNT);
    expect(Number.isFinite(score), "clustering score stays finite").toBe(true);
    await expect(page.locator("canvas").first()).toBeVisible();
    await proofShot(page, testInfo, "after-user-slider");
```

> Verify the User slider's accessible label is exactly "User thumb" (grep the slider component for the `aria-label`/label pattern used by "Project thumb"). Adjust the string to match.

- [ ] **Step 3: Sweep the spec for other stale assumptions**

Grep `acc-dc-graph.spec.ts` for `cluster-label`, `Project thumb`, and any blue link-color expectation. Update or remove cluster-label assertions (the persistent overlay is gone — hover tooltip is the name surface). Leave the edge well-formedness / brighten-on-isolate tests (Tasks 4 kept that behavior; only colors changed).

- [ ] **Step 4: Run the full gates**

Run: `npx tsc --noEmit`  → exit 0
Run: `npm test`  → all green
Run: `npm run test:e2e`  → green (note the known lasso load-flake on a busy machine is not a regression; re-run on an idle machine if it times out).

- [ ] **Step 5: Record the change in the debt doc**

Append an entry to `.gsd/TECHNICAL_DEBT.md` (2026-06-03): `/users/spatial-graph` now defaults to an organic **user**-clustered blob (color=user, faint grey same-user links, hover-only names, one User-name slider 0=organic→100=clustered, smoothstep curve). Note what is **deferred** (other clustering dimensions, color presets + legend, multi-slider stacking, the rest/grid layouts remain in the type union but are no longer produced) and that `restXyz`/`buildRestLayout` is now unused by the default path.

- [ ] **Step 6: Commit**

```bash
git add -- "tests/e2e/acc-dc-graph.spec.ts" ".gsd/TECHNICAL_DEBT.md"
git diff --cached --name-only
git commit -m "test(acc-redesign): e2e for organic user-blob default + record debt"
```

---

## Self-Review

**Spec coverage:**
- §3 default view (group/color/lines/labels) → Task 3 (group), automatic cluster color (verified in Shell colorIds), Task 4 (grey lines), Task 5 (hover-only). ✓
- §4 slider 0=organic→100=clustered, progressive curve → Task 1 (smoothstep) + Task 2 (loose endpoint). ✓
- §5 deltas #1 default clustering → Task 3; #2 slider-0 loose+progressive → Task 1/2; #3 color → automatic (no change); #4 grey edges → Task 4; #5 hover labels → Task 5. ✓
- Tooltip name + project count → Task 6. ✓
- §6 testing (unit TDD + e2e) → every task + Task 7. ✓
- §7 risks (user dim exists — confirmed `id:"user"`; slider-0 endpoint — `fillFactor(0)=0.95`; tooltip count — Task 6) addressed. ✓

**Placeholder scan:** No TBD/TODO; every code step has real code. The two "verify the exact label / verify getLayoutStats source" notes are deliberate live-checks for facts that can only be confirmed at runtime, with concrete fallback instructions — not deferred work.

**Type consistency:** blob descriptor field is `loose` (stride-2) everywhere (type, `descriptorTarget`, Shell construction, `buildUserBlobDescriptor`, test fixture); `packed` stays stride-2; `easeMorph` signature unchanged; `stampUserProjectCounts(features: NodeFeatureSnapshot[])` and `projectCount?: number` match across helper, builders, type, and tooltip.

**Out of scope (do not build):** other dimensions/sliders, color presets + legend, multi-slider stacking, reinstating rest/grid production.
