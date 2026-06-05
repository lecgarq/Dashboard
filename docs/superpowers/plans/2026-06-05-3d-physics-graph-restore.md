# 3D Physics Graph Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/users/spatial-graph` a 3D-only physics graph — per-dimension sliders driving an organic 3D force layout, color-by-dimension, click-to-profile, all ~17k nodes, plus a new 3D lasso — by peeling the clustering/projector experiments off the existing physics shell.

**Architecture:** Path B "peel back." The physics shell (`AccessAnalysisShell`) already runs `d3-force-3d` over all nodes on current data, and `GraphCanvas3D` already renders `physics.getPositions()` and wires raycaster click-to-profile. In 3D, the renderer already *ignores* the 2D blob `layoutTarget` and uses physics positions, so "peel back" reduces to: (a) make the physics shell the route default, (b) hard-set mode to 3D and remove the 2D toggle, (c) switch node color from forced cluster-id back to semantic color-by-dimension, (d) un-pare the slider set, (e) build a 3D lasso (pure projection helper + overlay reuse + OrbitControls suppression). The projector and 2D code stay in the repo (flag/dormant), not deleted.

**Tech Stack:** Next.js (App Router) client components, React, TypeScript, `three` r184 (InstancedMesh + OrbitControls), `d3-force-3d` (web worker), vitest (unit), Playwright (e2e), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-05-3d-physics-graph-restore-design.md`

**Commands:**
- Single unit file: `npx vitest run <path>`
- Full unit suite: `npm test`
- Types: `npx tsc --noEmit`
- e2e: `npm run test:e2e` (run on an idle machine; lasso e2e has a documented machine-load flake)

> **Do NOT `npm run build` while `:3000` is serving** (it 500s the running instance). Rebuild is the owner's final UAT step.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `app/(dashboard)/users/access-analysis/graphVariant.ts` | Pure: choose physics-shell vs projector from the flag | Create |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx` | Route gate | Modify |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | Shell composition: 3D-only, semantic color, full sliders | Modify |
| `app/(dashboard)/users/access-analysis/Toolbar.tsx` | Remove 2D/3D toggle; enable lasso in 3D | Modify |
| `app/(dashboard)/users/access-analysis/curatedSliders.ts` | Surfaced slider set (un-pare) | Modify |
| `app/(dashboard)/users/access-analysis/lasso3d.ts` | Pure 3D-lasso projection + point-in-polygon | Create |
| `app/(dashboard)/users/access-analysis/lasso3d.test.ts` | Unit tests for the helper | Create |
| `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` | Add `setControlsEnabled` to handle | Modify |
| `app/(dashboard)/users/access-analysis/LassoOverlay.tsx` | Generalize from 2D handle to `hitTest` callback | Modify |
| `app/(dashboard)/users/access-analysis/LassoOverlay.test.tsx` | Update to new API | Modify |
| `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` | Ungate lasso; wire 3D hit-test + controls toggle | Modify |
| `tests/e2e/acc-positioning.spec.ts`, `acc-dc-graph.spec.ts`, `acc-cluster-blobs.spec.ts` | Flip flag guards (run by default) | Modify |
| `tests/e2e/acc-person-graph.spec.ts` | Projector runs only under flag `=1` | Modify |
| `tests/e2e/acc-3d-lasso.spec.ts` | 3D lasso smoke | Create |

---

## Task 1: Route gate — default to physics shell, projector opt-in

**Files:**
- Create: `app/(dashboard)/users/access-analysis/graphVariant.ts`
- Create: `app/(dashboard)/users/access-analysis/graphVariant.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx`

- [ ] **Step 1: Write the failing test**

Create `graphVariant.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chooseGraphVariant } from "./graphVariant";

describe("chooseGraphVariant", () => {
  it("defaults to the physics shell when the flag is unset", () => {
    expect(chooseGraphVariant(undefined)).toBe("physics");
  });
  it("uses the physics shell for the legacy escape-hatch value 0", () => {
    expect(chooseGraphVariant("0")).toBe("physics");
  });
  it("opts into the projector only when the flag is exactly 1", () => {
    expect(chooseGraphVariant("1")).toBe("projector");
  });
  it("treats any other value as the physics shell", () => {
    expect(chooseGraphVariant("true")).toBe("physics");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/graphVariant.test.ts"`
Expected: FAIL — cannot find module `./graphVariant`.

- [ ] **Step 3: Create the implementation**

Create `graphVariant.ts`:

```ts
/**
 * graphVariant.ts — pure flag → variant decision for /users/spatial-graph.
 * Default is the 3D physics shell. The embedding projector is opt-in only
 * (NEXT_PUBLIC_ACC_PERSON_GRAPH=1) and retained as a reference, not the default.
 */
export type GraphVariant = "physics" | "projector";

export function chooseGraphVariant(flag: string | undefined): GraphVariant {
  return flag === "1" ? "projector" : "physics";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/graphVariant.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewire the route gate**

In `AccessAnalysisShellClient.tsx`, replace the body of `AccessAnalysisShellClient` (lines 26–31) and update the comments so the physics shell is the default:

```tsx
import { chooseGraphVariant } from "./graphVariant";

// ...dynamic() imports unchanged...

export function AccessAnalysisShellClient(): React.JSX.Element {
  // Default = the 3D physics shell. The embedding projector is opt-in only.
  if (chooseGraphVariant(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH) === "projector") {
    return <PersonGraph3D />;
  }
  return <AccessAnalysisShell />;
}
```

Also update the two `dynamic()` doc comments (lines 14, 20) to reflect that `AccessAnalysisShell` is now the default and `PersonGraph3D` is the opt-in projector.

- [ ] **Step 6: Flip the e2e flag guards**

The physics-shell specs must run by default; the projector spec must run only under `=1`.

In `tests/e2e/acc-positioning.spec.ts`, `tests/e2e/acc-dc-graph.spec.ts`, and `tests/e2e/acc-cluster-blobs.spec.ts`, change the guard line (line 6 in each) from:

```ts
  test.skip(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH !== "0", "Legacy 2D/3D shell — run with NEXT_PUBLIC_ACC_PERSON_GRAPH=0");
```

to:

```ts
  test.skip(process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "1", "Physics shell is the default; skip only when the projector (=1) is opted in");
```

In `tests/e2e/acc-person-graph.spec.ts`, change line 4 from:

```ts
const LEGACY = process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH === "0";
```

to:

```ts
// Projector is opt-in only; this spec runs when explicitly enabled with =1.
const PROJECTOR_OFF = process.env.NEXT_PUBLIC_ACC_PERSON_GRAPH !== "1";
```

Then update the in-file references that used `LEGACY` to skip: replace `test.skip(LEGACY, ...)` with `test.skip(PROJECTOR_OFF, ...)` (grep the file for `LEGACY`).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add "app/(dashboard)/users/access-analysis/graphVariant.ts" "app/(dashboard)/users/access-analysis/graphVariant.test.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx" tests/e2e/acc-positioning.spec.ts tests/e2e/acc-dc-graph.spec.ts tests/e2e/acc-cluster-blobs.spec.ts tests/e2e/acc-person-graph.spec.ts
git commit -m "feat(acc-3d): default /users/spatial-graph to the physics shell, projector opt-in"
```

---

## Task 2: 3D-only — hard-set mode, remove the 2D/3D toggle, enable lasso in 3D

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Modify: `app/(dashboard)/users/access-analysis/Toolbar.tsx`

- [ ] **Step 1: Hard-set the render mode to 3D in the shell**

In `AccessAnalysisShell.tsx`, the outer `AccessAnalysisShell` component currently has `const [mode, setMode] = useState<"2d" | "3d">("2d");` (line ~399). Replace it with a constant and a no-op setter so the rest of the wiring (which passes `mode`/`setMode` down) stays type-compatible without a toggle:

```tsx
// 3D-only: the 2D cosmos path stays in the repo but is never mounted here.
const mode = "3d" as const;
const setMode = (_m: "2d" | "3d"): void => { /* 3D-only: mode is fixed */ };
```

- [ ] **Step 2: Remove the floating "Go 2D/Go 3D" overlay button**

In `ShellBody` (`AccessAnalysisShell.tsx`), delete the floating mode-switcher block — the entire `<div className="absolute right-4 top-4 z-10">…</div>` containing the `Go {mode === "2d" ? "Go 3D" : "Go 2D"}` button (lines ~359–373).

- [ ] **Step 3: Remove the 2D/3D segmented pill from the Toolbar and enable lasso in 3D**

In `Toolbar.tsx`:

1. Delete the mode-toggle `<div role="group" aria-label="Mode toggle" …>…</div>` block (lines ~182–215).
2. Change the lasso-disabled rule (line 99) from `const lassoDisabled = mode === "3d";` to:

```tsx
// Lasso now works in 3D (screen-space projection), so it is always enabled.
const lassoDisabled = false;
```

3. Simplify the lasso button `title` (lines ~148–154) to drop the "2D mode only" branch:

```tsx
        title={lassoActive ? "Cancel lasso" : "Draw lasso"}
```

Leave the `mode` / `onModeChange` props on `ToolbarProps` in place (still passed by the shell; now effectively constant) to minimize churn.

- [ ] **Step 4: Run the shell/toolbar unit tests**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx"`
Expected: If a test asserts the mode toggle or `data-testid="toolbar-mode-toggle"` exists, it will fail — update that test to assert the toggle is **absent** (`expect(screen.queryByTestId("toolbar-mode-toggle")).toBeNull()`) and that the lasso button is **not** disabled. Re-run until PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/Toolbar.tsx" "app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx"
git commit -m "feat(acc-3d): 3D-only — remove 2D/3D toggle, enable lasso in 3D"
```

---

## Task 3: Peel back — color-by-dimension (drop forced cluster coloring)

In 3D the renderer already uses physics positions (the blob `layoutTarget` is 2D-only), so the only remaining override is `nodeColors`, which `ShellBody` forces to cluster-id via `colorIds`. This task makes color semantic and stops passing the now-unused blob props.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Make node color semantic in `ShellBody`**

In `ShellBody` (`AccessAnalysisShell.tsx`), replace the `nodeColors` memo (lines ~237–243) so color always follows the toolbar color mode:

```tsx
  // 3D-only restore: color follows the toolbar color-mode (color-by-dimension),
  // never cluster-id. (The blob colorIds path is 2D-cluster-era and retired here.)
  const nodeColors = useMemo<Float32Array>(
    () => buildNodeColors(features, colorMode),
    [features, colorMode],
  );
```

- [ ] **Step 2: Stop passing the blob layout/aggregate props to GraphCanvas**

In `ShellBody`'s `<GraphCanvas …>` (lines ~313–325), remove the `layoutTarget`, `aggregateTarget`, `aggregateColors`, and `aggregateSizes` props so the canvas takes the pure physics path (and `clusterActive` stays false). The element becomes:

```tsx
            <GraphCanvas
              ref={graphRef}
              physics={physics}
              nodeColors={nodeColors}
              mode={mode}
              onRendererReady={() => setRendererReady((v) => v + 1)}
              links={links}
              linkColors={baseLinkColors}
            />
```

- [ ] **Step 3: Remove the now-dead blob/descriptor/LOD code in `ShellBody`**

Delete the now-unused blocks (they only fed the removed props), and their now-unused imports:

- `layoutDescriptor`, `targetBufRef`, `layoutTarget` (lines ~134–150)
- `blobRestCenters`, `aggregates`, `aggregateColors`, `aggregateSizes`, `aggBufRef`, `aggregateTarget` (lines ~154–204)
- `colorIds` memo (lines ~218–235)
- `sliderDims`, `activeDims`, `activeKey`, `userDim` (lines ~119–133) **only if** no longer referenced after this task (the grouping chip in Step 4 may still use `userDim`/`activeDims`; see Step 4 before deleting).
- Remove now-unused imports at the top: `buildUserBlobDescriptor`, `descriptorTarget`, `descriptorNodeCount`, `easeMorph`, `LayoutDescriptor`, `clusterColorBuffer`, `colorForCluster`, `buildClusterAggregates`, `aggregatePositions`, `activeCatalogDims`, `buildDominantClusters`.

> Removal discipline: after editing, `npx tsc --noEmit` will name every dangling reference/import. Delete exactly what it flags — do not delete anything still referenced.

- [ ] **Step 4: Simplify the grouping-chip overlay**

The blob grouping chip (lines ~328–357, the `layoutDescriptor.kind !== "rest"` / `GridAxisLabels` block) depended on the removed descriptor. Delete the `GridAxisLabels` block and the grouping-chip block entirely (3D-only physics has no blob/grid grouping indicator). Remove the now-unused `GridAxisLabels` import. This lets you also delete `userDim`/`activeDims`/`activeKey`/`sliderDims` from Step 3 if nothing else references them (confirm via `tsc`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (fix any dangling reference the compiler names by deleting the dead binding/import).

- [ ] **Step 6: Run the shell test suite**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/AccessAnalysisPage.test.tsx"`
Expected: PASS, or update assertions that asserted cluster-coloring/blob behavior to assert semantic coloring. Re-run until green.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(acc-3d): color-by-dimension — drop forced cluster coloring + dead blob overlay"
```

---

## Task 4: Un-pare the slider set

The slider set is pared to `["user"]` by `curatedSliders.ts`. Restore the full surfaced+available catalog so every meaningful dimension is a physics slider. The sidebar already groups Structural (flat) / Activity (collapsible tree = the de-facto "Advanced") / Folder (flat), so un-paring restores the P4-era grouped sidebar with no sidebar-structure change.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/curatedSliders.ts`
- Modify: `app/(dashboard)/users/access-analysis/__tests__/` (whichever test pins `["user"]`, if any)

- [ ] **Step 1: Write/adjust the failing test**

Add a test asserting the surfaced set now includes the meaningful structural dims, not just `user`. Create `app/(dashboard)/users/access-analysis/curatedSliders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { curatedSliderDimensions } from "./curatedSliders";
import { buildDimensionCatalog } from "./dimensionCatalog";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function sampleFeatures(): NodeFeatureSnapshot[] {
  // One minimal node is enough: buildStructuralDimensions marks structural dims
  // available:true regardless of row count, so they surface.
  return [
    {
      nodeId: "u1::p1", userName: "A", project: "p1", role: "r1",
      moduleSignature: [], permissionStrength: 2,
    } as unknown as NodeFeatureSnapshot,
  ];
}

describe("curatedSliderDimensions (un-pared)", () => {
  it("surfaces the meaningful structural dimensions, not just user", () => {
    const catalog = buildDimensionCatalog(sampleFeatures());
    const ids = curatedSliderDimensions(catalog).map((d) => d.id);
    expect(ids).toContain("project");
    expect(ids).toContain("role");
    expect(ids).toContain("user");
    expect(ids).toContain("moduleAccess");
    expect(ids.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/curatedSliders.test.ts"`
Expected: FAIL — only `user` is currently surfaced (`toContain("project")` fails).

- [ ] **Step 3: Un-pare `curatedSliders.ts`**

Replace the file body so `curatedSliderDimensions` returns the full surfaced+available set (the function name is kept so all call sites — shell physics build + sidebar — un-pare together):

```ts
/**
 * curatedSliders.ts — The active slider set. 3D-only restore (2026-06-05): un-pared
 * from the single "user" slider back to the full surfaced+available catalog, so every
 * meaningful dimension is a physics slider. The sidebar groups these into Structural /
 * Activity (collapsible) / Folder, which is the "meaningful + advanced" layout.
 * Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensions } from "./catalogSliders";

/** Surfaced sliders that drive physics: slider-surfaced AND available (have data). */
export function curatedSliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return sliderDimensions(catalog);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/curatedSliders.test.ts"`
Expected: PASS.

- [ ] **Step 5: Run the sidebar test + full slider-related tests**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx" "app/(dashboard)/users/access-analysis/__tests__/SliderGroup.test.tsx"`
Expected: PASS, or update any assertion that pinned the single-`user` curated set to expect the full set. Re-run until green.

- [ ] **Step 6: Verify physics build cost (perf guard)**

`AccessAnalysisShell` (outer) builds `buildCatalogTargets`/`buildCatalogWeights` over `curatedSliderDimensions(catalog)` — now the full set (~200 dims × ~17k nodes). Add a one-off timing log temporarily in the load effect (around line ~453) and confirm in the browser console it builds in well under ~1s on load:

```tsx
        const _t0 = performance.now();
        const targets = buildCatalogTargets(snapshot, sliderDims);
        const dimWeights = buildCatalogWeights(snapshot, sliderDims);
        console.debug(`[acc-3d] catalog targets/weights built in ${(performance.now() - _t0).toFixed(0)}ms for ${sliderDims.length} dims`);
```

If it exceeds ~1s or memory balloons, restrict the surfaced set to a primary list (structural + folder) and defer the activity action dims — note this in the plan deviation log. Remove the temporary `console.debug` before committing.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add "app/(dashboard)/users/access-analysis/curatedSliders.ts" "app/(dashboard)/users/access-analysis/curatedSliders.test.ts"
git commit -m "feat(acc-3d): un-pare sliders to the full surfaced catalog (per-dimension physics)"
```

---

## Task 5: `findPointsIn3DLasso` — pure projection helper

**Files:**
- Create: `app/(dashboard)/users/access-analysis/lasso3d.ts`
- Create: `app/(dashboard)/users/access-analysis/lasso3d.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lasso3d.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import { findPointsIn3DLasso, pointInPolygon } from "./lasso3d";

function centeredCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, 1, 0.1, 100000);
  cam.position.set(0, 0, 1000);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

const W = 800;
const H = 800;
// A square covering the screen center (350,350)–(450,450).
const centerSquare: [number, number][] = [
  [350, 350], [450, 350], [450, 450], [350, 450],
];

describe("pointInPolygon", () => {
  it("includes a point inside and excludes one outside", () => {
    expect(pointInPolygon(400, 400, centerSquare)).toBe(true);
    expect(pointInPolygon(10, 10, centerSquare)).toBe(false);
  });
});

describe("findPointsIn3DLasso", () => {
  it("selects a node projecting to screen center, excludes a far-offset node", () => {
    // index 0 at origin → projects to screen center (400,400) → inside.
    // index 1 far to the right → projects far off-center → outside.
    const positions = new Float32Array([0, 0, 0, 600, 0, 0]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), centerSquare, W, H);
    expect(sel.has(0)).toBe(true);
    expect(sel.has(1)).toBe(false);
  });

  it("returns empty for a degenerate polygon", () => {
    const positions = new Float32Array([0, 0, 0]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), [[1, 1], [2, 2]], W, H);
    expect(sel.size).toBe(0);
  });

  it("excludes nodes behind the camera", () => {
    // Node at z=2000 is behind a camera placed at z=1000 looking toward -z.
    const positions = new Float32Array([0, 0, 2000]);
    const sel = findPointsIn3DLasso(positions, centeredCamera(), centerSquare, W, H);
    expect(sel.has(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/lasso3d.test.ts"`
Expected: FAIL — cannot find module `./lasso3d`.

- [ ] **Step 3: Implement the helper**

Create `lasso3d.ts`:

```ts
/**
 * lasso3d.ts — pure screen-space lasso selection for the 3D graph.
 *
 * Projects each node's world position through the live camera to canvas-local
 * CSS pixels, then runs ray-casting point-in-polygon against the lasso path.
 * No DOM, no scene — unit-testable with a bare three.js camera.
 */
import { Vector3, type PerspectiveCamera } from "three";

/** Ray-casting point-in-polygon on screen-space pixel coords. */
export function pointInPolygon(
  px: number,
  py: number,
  poly: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Select node indices whose projected screen position lies inside the polygon.
 * `positions` is stride-3 world xyz; `camera` must already be world-matrix-updated;
 * `polygon` is the canvas-local CSS-pixel path; `width`/`height` are the canvas CSS size.
 * Nodes behind the camera or beyond the far plane (NDC z > 1) are excluded.
 */
export function findPointsIn3DLasso(
  positions: Float32Array,
  camera: PerspectiveCamera,
  polygon: ReadonlyArray<readonly [number, number]>,
  width: number,
  height: number,
): Set<number> {
  const out = new Set<number>();
  if (polygon.length < 3 || width <= 0 || height <= 0) return out;
  const v = new Vector3();
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    v.project(camera); // → NDC in [-1, 1]
    if (v.z > 1) continue; // behind camera / beyond far plane
    const sx = (v.x * 0.5 + 0.5) * width;
    const sy = (1 - (v.y * 0.5 + 0.5)) * height; // NDC y-up → screen y-down
    if (pointInPolygon(sx, sy, polygon)) out.add(i);
  }
  return out;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/lasso3d.test.ts"`
Expected: PASS (5 assertions across 3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/lasso3d.ts" "app/(dashboard)/users/access-analysis/lasso3d.test.ts"
git commit -m "feat(acc-3d): pure findPointsIn3DLasso screen-space selection helper"
```

---

## Task 6: Wire the 3D lasso (controls toggle + generalized overlay + interactions)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx`
- Modify: `app/(dashboard)/users/access-analysis/LassoOverlay.tsx`
- Modify: `app/(dashboard)/users/access-analysis/LassoOverlay.test.tsx`
- Modify: `app/(dashboard)/users/access-analysis/GraphInteractions.tsx`

- [ ] **Step 1: Add `setControlsEnabled` to the 3D handle**

In `GraphCanvas3D.tsx`:

1. Add to the `GraphCanvas3DHandle` interface (after `getCamera()`, line ~46):

```ts
  /** Enable/disable OrbitControls (used to freeze orbit during a lasso drag). */
  setControlsEnabled(enabled: boolean): void;
```

2. In the handle object literal (`const handle: GraphCanvas3DHandle = {…}`, line ~516), add (near `getCamera: () => camera,`):

```ts
      setControlsEnabled: (enabled: boolean) => { controls.enabled = enabled; },
```

(`controls` is the `OrbitControls` created at line ~131 and is in scope at the handle literal.)

- [ ] **Step 2: Generalize `LassoOverlay` from a 2D handle to a `hitTest` callback**

Replace `LassoOverlay.tsx` props + the two call sites of `graphHandle`. The drawing logic is unchanged; only the source of the matched indices and drag lifecycle hooks change.

New props interface (replace lines 27–34):

```tsx
export interface LassoOverlayProps {
  /** When false: pointer events pass through to the graph canvas. */
  active: boolean;
  /**
   * Hit-test the completed path → selected node indices. The overlay passes its own
   * canvas CSS size so a 3D projector can map world→screen against the same viewport.
   */
  hitTest: (path: [number, number][], width: number, height: number) => number[];
  /** Called once on pointerup with the matched node indices. */
  onComplete: (matchedIndices: number[]) => void;
  /** Fired on pointerdown — disable OrbitControls so the drag selects, not rotates. */
  onDragStart?: () => void;
  /** Fired on pointerup/cancel — re-enable OrbitControls. */
  onDragEnd?: () => void;
}
```

Update the destructure (line ~40) to `{ active, hitTest, onComplete, onDragStart, onDragEnd }` and drop the `GraphCanvas2DHandle` import (line 25).

In `onDown` (after setting `pathRef`), call the drag-start hook:

```tsx
    const onDown = (e: PointerEvent): void => {
      drawingRef.current = true;
      pathRef.current = [[e.offsetX, e.offsetY]];
      onDragStart?.();
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        // jsdom + older browsers: setPointerCapture may throw — safe to ignore.
      }
    };
```

Replace the `onUp` body (lines ~101–115) so it always re-enables controls and uses `hitTest`:

```tsx
    const onUp = (e: PointerEvent): void => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch {
        // see above
      }
      const path = pathRef.current;
      pathRef.current = [];
      clearOverlay();
      onDragEnd?.(); // always re-enable controls, even on a too-short path
      if (path.length < 3) return;
      onComplete(hitTest(path, cv.clientWidth, cv.clientHeight));
    };
```

Add a defensive global finalizer so a pointerup outside the canvas (drag-off-screen) still ends the gesture. After the existing `window.addEventListener("resize", resize);` (line ~121) add:

```tsx
    window.addEventListener("pointerup", onUp);
```

and in the cleanup (after the matching resize removal, line ~128) add:

```tsx
    window.removeEventListener("pointerup", onUp);
```

Update the effect dependency array (line 133) to `[active, hitTest, onComplete, onDragStart, onDragEnd]`.

- [ ] **Step 3: Update `LassoOverlay.test.tsx` to the new API**

Wherever the test passed `graphHandle={…}` with a stub `findPointsInPolygon`, pass `hitTest={(path) => [...]}` instead and assert `onComplete` receives the array returned by `hitTest`. Run:

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/LassoOverlay.test.tsx"`
Expected: update + PASS. (If the test file path differs, grep for `LassoOverlay.test`.)

- [ ] **Step 4: Ungate lasso + wire 3D hit-test in `GraphInteractions`**

In `GraphInteractions.tsx`:

1. Add imports near the top:

```tsx
import { useCallback } from "react";
import { findPointsIn3DLasso } from "./lasso3d";
```

(merge `useCallback` into the existing `react` import.)

2. Replace the "2D-only lasso overlay" section (lines ~216–234) with mode-aware wiring:

```tsx
  // ---- Lasso overlay (2D cosmos hit-test OR 3D screen-space projection) ----
  const hitTest = useCallback(
    (path: [number, number][], width: number, height: number): number[] => {
      const root = graphRef.current;
      if (!root || !root.handle) return [];
      if (root.mode === "3d") {
        const cam = root.handle.getCamera();
        return [...findPointsIn3DLasso(physics.getPositions(), cam, path, width, height)];
      }
      // Dormant 2D path retained for completeness.
      return root.handle.findPointsInPolygon(path);
    },
    [graphRef, physics],
  );

  const onLassoDragStart = useCallback((): void => {
    const root = graphRef.current;
    if (root?.mode === "3d") root.handle?.setControlsEnabled(false);
  }, [graphRef]);

  const onLassoDragEnd = useCallback((): void => {
    const root = graphRef.current;
    if (root?.mode === "3d") root.handle?.setControlsEnabled(true);
  }, [graphRef]);

  const hoveredFeature = hoveredIndex !== null ? features[hoveredIndex] ?? null : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      {lassoActive ? (
        <LassoOverlay
          active={true}
          hitTest={hitTest}
          onComplete={onLassoComplete}
          onDragStart={onLassoDragStart}
          onDragEnd={onLassoDragEnd}
        />
      ) : null}
      <NodeTooltip anchorScreenXY={tooltipAnchor} feature={hoveredFeature} />
    </div>
  );
```

3. Delete the now-unused `graph2DHandle`/`lassoEnabled` bindings (replaced above) and the `GraphCanvas2DHandle` import if no longer referenced (let `tsc` confirm).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Run interaction unit tests**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx"`
Expected: PASS, or update any assertion tied to `mode === "2d"` lasso gating to expect lasso active in 3D. Re-run until green.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx" "app/(dashboard)/users/access-analysis/LassoOverlay.tsx" "app/(dashboard)/users/access-analysis/__tests__/LassoOverlay.test.tsx" "app/(dashboard)/users/access-analysis/GraphInteractions.tsx"
git commit -m "feat(acc-3d): 3D lasso — controls toggle, generalized overlay, screen-space selection"
```

---

## Task 7: e2e smoke + full gates

**Files:**
- Create: `tests/e2e/acc-3d-lasso.spec.ts`

- [ ] **Step 1: Write the 3D-lasso e2e smoke**

Model it on the existing lasso e2e (open `tests/e2e/acc-positioning.spec.ts` / `acc-dc-graph.spec.ts` for the auth/boot helpers, the `NEXT_PUBLIC_ACC_GRAPH_TEST` bridge, and the `__ACC_*` test bridge accessors). Create `tests/e2e/acc-3d-lasso.spec.ts` that:

1. Boots `/users/spatial-graph` with the physics shell default (no `=1` flag).
2. Clicks `data-testid="toolbar-lasso"` to enter lasso mode and asserts the button is **not** disabled.
3. Drags a polygon across the canvas (`data-testid="lasso-overlay"`) with `mouse.move`/`down`/`up`.
4. Asserts a non-empty selection reaches the SelectionPanel (reuse whatever selection-count accessor the existing lasso spec uses on the test bridge).

Use the exact boot/auth/bridge helpers from the sibling spec — do not invent new ones.

- [ ] **Step 2: Run the 3D-lasso spec (idle machine)**

Run: `npm run test:e2e -- tests/e2e/acc-3d-lasso.spec.ts`
Expected: PASS. (If it times out under machine load, re-run on an idle machine — documented flake, not a regression.)

- [ ] **Step 3: Full unit suite + types**

Run: `npm test`
Expected: all green (fix any remaining stragglers from earlier tasks).

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/acc-3d-lasso.spec.ts
git commit -m "test(acc-3d): 3D lasso e2e smoke"
```

- [ ] **Step 5: Owner UAT (manual, after a rebuild)**

Hand off to the owner with this checklist (do NOT rebuild under a running `:3000`):

1. `npm run build` then restart the local server.
2. Open `/users/spatial-graph`. Confirm: a 3D organic point cloud of all nodes (not packed clusters), orbit/zoom is smooth.
3. Raise the **Project** slider → same-project people visibly pull together; lower it → they relax. Repeat for Role/User.
4. Toolbar **Color** picker changes node colors by dimension.
5. Click a node → the profile panel opens.
6. Toolbar **Lasso** → drag a loop → those nodes select (and the camera does not rotate during the drag).

---

## Self-Review

**Spec coverage:**
- 3D-only default → Tasks 1, 2. ✓
- Per-dimension physics sliders → Tasks 3 (physics path), 4 (un-pare). ✓
- Color-by-dimension → Task 3. ✓
- Click-to-profile → already wired (verified); covered by UAT step 5. ✓
- All ~17k nodes → physics path (no aggregation in 3D); UAT step 2. ✓
- 3D lasso → Tasks 5 (helper), 6 (wiring), 7 (e2e). ✓
- Projector + 2D retained, not deleted → Task 1 (opt-in), Task 2 (dormant). ✓
- Advanced-slider weight 0 → satisfied structurally: every slider defaults to 0 (`catalogDefaultSliders`), and `buildCatalogWeights` applies `sliderNorm` live in the physics layer, so an untouched slider contributes no force. ✓
- Physics-at-rest risk → resolved in spec (d3-force-3d `REPULSION_ZERO=-10`); UAT step 2 confirms scatter. ✓

**Placeholder scan:** No TBD/TODO. The e2e spec (Task 7 Step 1) is described against the existing sibling specs rather than transcribed verbatim because the auth/bridge boot helpers are spec-local and must be copied from the live file, not guessed — the step names the exact files and accessors to reuse.

**Type consistency:** `chooseGraphVariant(flag)`, `GraphVariant`, `findPointsIn3DLasso(positions, camera, polygon, width, height) → Set<number>`, `pointInPolygon(px, py, poly) → boolean`, `LassoOverlay` `hitTest(path, width, height) → number[]`, and `setControlsEnabled(enabled)` are used identically across the tasks that define and consume them.

**Scope:** Single feature, one shell. Tasks are independently committable. No decomposition needed.
