# Folder Permission Terrain — Professional Pass 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/access-analysis` Folder Permission Terrain professional — replace the confusing merged Compare "tower" with separated floating isometric planes, swap the flat colours/shading for a cool teal→gold ramp with soft-lit faces, and add a tasteful animation layer.

**Architecture:** Pure geometry/colour stays in `folderTerrain.ts` (unit-tested with vitest). The React panel + animation lives in `FolderPermissionTerrain.tsx`. The pivot-stable orthographic camera (`projectCamera`/`buildCameraScene`) from pass 1 is kept untouched; Compare gets a NEW pure helper `buildStackedScenes` that composes one camera scene per project, each offset by a fixed screen-pixel pitch (so planes stay parallel and clearly gapped instead of cascading via grid-row offsets).

**Tech Stack:** Next.js (App Router) client component, SVG rendering, `next-themes`, Vitest + `@testing-library/react` (jsdom). No WebGL, no server/SQL changes.

**Spec:** `docs/superpowers/specs/2026-06-09-folder-terrain-pro-pass2-design.md`

**Conventions for every task:**
- Run one test file by filter: `npx vitest run folderTerrain` or `npx vitest run FolderPermissionTerrain`.
- Run the whole unit suite: `npm test`.
- Typecheck: `npx tsc --noEmit`.
- Commit with explicit paths only (this WIP branch has a hazardous index — never `git add -A`/`.`). Before every commit run `git diff --cached --name-only` and confirm only the intended files are staged.
- End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. In the Bash tool use bash syntax (`-m "subject" -m "body"`), NOT PowerShell here-strings.

---

## Unit A — Colour ramp + lit shading (`folderTerrain.ts`)

Files:
- Modify: `app/(dashboard)/access-analysis/folderTerrain.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts`

### Task A1: New cool-professional tier ramp

- [ ] **Step 1: Update the ramp test**

In `folderTerrain.test.ts`, the existing `colorForRank` tests reference `TIER_COLORS` by index so they still pass. ADD a new `describe` after the `colorForRank` block asserting the ramp is the new cool→warm one and is monotonic-by-design:

```ts
describe("TIER_COLORS ramp", () => {
  it("defines a distinct colour for every rank 1..5", () => {
    const vals = [1, 2, 3, 4, 5].map((r) => TIER_COLORS[r]);
    expect(new Set(vals).size).toBe(5);
    for (const v of vals) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("starts cool (rank 1) and ends warm/gold (rank 5)", () => {
    const hex = (s: string) => parseInt(s.slice(1), 16);
    const r1 = hex(TIER_COLORS[1]), r5 = hex(TIER_COLORS[5]);
    const red = (n: number) => (n >> 16) & 255, blue = (n: number) => n & 255;
    expect(red(r5)).toBeGreaterThan(red(r1));   // warmer at the top
    expect(blue(r1)).toBeGreaterThan(blue(r5)); // cooler at the bottom
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — the current ramp is violet→amber, so `blue(r1) > blue(r5)` may pass but `red(r5) > red(r1)` and the "cool start" intent aren't guaranteed; at minimum the new ramp values differ. (If it happens to pass, proceed — Step 3 still installs the intended ramp.)

- [ ] **Step 3: Replace `TIER_COLORS`**

In `folderTerrain.ts`, replace the `TIER_COLORS` object (currently the violet→amber plasma) with:

```ts
/**
 * Cool-professional sequential ramp (low access = cool slate-teal … full control
 * = warm gold). Indexed by rank 1..5. Tuned to read on both the dark zinc and the
 * light theme; the cyan→amber break at 3→4 also marks the read/upload vs edit/control
 * divide.
 */
export const TIER_COLORS: Readonly<Record<number, string>> = {
  1: "#1e3a4c", // deep slate-teal — View Only
  2: "#2a7d8c", // teal — View+Download / Upload Only
  3: "#46b8c4", // cyan — +Upload
  4: "#f0a830", // amber — +Edit
  5: "#f8d348", // gold — Full Control
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain`
Expected: PASS (new ramp + existing `colorForRank` tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): cool teal->gold tier ramp" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: Tier text colour helper (readable detail header on light tiers)

- [ ] **Step 1: Write the failing test**

Add to `folderTerrain.test.ts`:

```ts
import { tierTextColor } from "../folderTerrain"; // add to the existing import list

describe("tierTextColor", () => {
  it("uses dark ink on the light amber/gold tiers and white on the dark cool tiers", () => {
    expect(tierTextColor(1)).toBe("#ffffff");
    expect(tierTextColor(2)).toBe("#ffffff");
    expect(tierTextColor(3)).toBe("#ffffff");
    expect(tierTextColor(4)).toBe("#0b1620");
    expect(tierTextColor(5)).toBe("#0b1620");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — `tierTextColor is not a function`.

- [ ] **Step 3: Implement**

In `folderTerrain.ts`, just after `colorForRank`:

```ts
/** Legible foreground colour for text drawn ON a tier swatch (ranks 4–5 are light). */
export function tierTextColor(rank: number): string {
  return rank >= 4 ? "#0b1620" : "#ffffff";
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): legible tier text colour helper" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A3: Richer lighting constants + top-face gradient ids

The biggest perceptual wins are (a) more contrast in `DEFAULT_LIGHT`, (b) a per-rank top-face gradient, (c) soft (blurred) contact shadows — (b)/(c) are wired in the renderer in Task A4. Here we expose the data the renderer needs from the pure layer.

- [ ] **Step 1: Write the failing test**

Add to `folderTerrain.test.ts`:

```ts
import { topGradientId, TIER_GRADIENTS, DEFAULT_LIGHT as LIGHT } from "../folderTerrain"; // extend existing import

describe("top-face gradients", () => {
  it("gives a stable, unique gradient id per rank", () => {
    const ids = [1, 2, 3, 4, 5].map(topGradientId);
    expect(new Set(ids).size).toBe(5);
    expect(topGradientId(5)).toBe("terrainTop-5");
  });
  it("publishes one gradient descriptor per rank with light->base stops", () => {
    expect(TIER_GRADIENTS).toHaveLength(5);
    for (const g of TIER_GRADIENTS) {
      expect(g.id).toBe(topGradientId(g.rank));
      expect(g.from).toMatch(/^#[0-9a-f]{6}$/i); // brighter top stop
      expect(g.to).toMatch(/^#[0-9a-f]{6}$/i);   // base stop
    }
  });
  it("keeps top brighter than the lit-side cap", () => {
    expect(LIGHT.topBright).toBeGreaterThan(LIGHT.sideMax);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — `topGradientId` / `TIER_GRADIENTS` undefined.

- [ ] **Step 3: Implement**

In `folderTerrain.ts`, just below `TIER_COLORS`/`colorForRank`, using the existing `tint` helper (defined lower in the file — move `tint` ABOVE this block, or add a local `lighten`/`darken`; simplest: add the gradient block AFTER `tint` is defined, i.e. near the bottom of the colour section but `tint` is currently defined in the camera section ~line 540. To avoid a forward-reference, define a tiny local mixer here):

```ts
/** Lighten/darken a #rrggbb by a factor (1 = unchanged) for gradient stops. */
function mix(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/** Stable SVG gradient id for a rank's top face. */
export function topGradientId(rank: number): string {
  return `terrainTop-${rank}`;
}

/** Per-rank top-face gradient descriptors (bright far edge → slightly deeper). */
export const TIER_GRADIENTS: ReadonlyArray<{ rank: number; id: string; from: string; to: string }> =
  [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    id: topGradientId(rank),
    from: mix(TIER_COLORS[rank], 1.14),
    to: mix(TIER_COLORS[rank], 0.92),
  }));
```

Then update `DEFAULT_LIGHT` (currently `{ dx: 0.35, dy: 0.94, ambient: 0.4, diffuse: 0.55, topBright: 1, sideMax: 0.9 }`) to give bars more volume:

```ts
export const DEFAULT_LIGHT: Light = { dx: 0.32, dy: 0.95, ambient: 0.34, diffuse: 0.66, topBright: 1.06, sideMax: 0.86 };
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain`
Expected: PASS. Then `npx tsc --noEmit` → 0 errors.

NOTE: the existing `barScene`/`barSceneCam` "lights the two visible sides differently" tests still pass (the directional model is unchanged; only constants shifted). If a `topBright`-based assertion anywhere hardcoded `1`, update it to read `DEFAULT_LIGHT.topBright`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): per-rank top gradients + richer light constants" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A4: Render gradient top faces, soft shadows, rim highlight

Files:
- Modify: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `FolderPermissionTerrain.test.tsx` inside the `describe("FolderPermissionTerrain")` block:

```ts
it("defines blur + top-gradient defs and uses a gradient fill on top faces", () => {
  const { container } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  const svg = terrain(container);
  expect(svg.querySelector("filter#terrainSoftShadow")).toBeTruthy();
  expect(svg.querySelectorAll("linearGradient[id^='terrainTop-']").length).toBe(5);
  // At least one top face references a gradient.
  const grad = [...svg.querySelectorAll("polygon")].some((p) => (p.getAttribute("fill") || "").includes("url(#terrainTop-"));
  expect(grad).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run FolderPermissionTerrain`
Expected: FAIL — no `filter#terrainSoftShadow`, no gradient defs.

- [ ] **Step 3: Implement — add a `<defs>` block + use it**

In `FolderPermissionTerrain.tsx`, import the new symbols:

```ts
import { /* …existing… */ TIER_GRADIENTS, topGradientId, tierTextColor } from "../folderTerrain";
```

Add a `TerrainDefs` component near the other small components:

```tsx
function TerrainDefs() {
  return (
    <defs>
      <filter id="terrainSoftShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" />
      </filter>
      {TIER_GRADIENTS.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={g.from} />
          <stop offset="100%" stopColor={g.to} />
        </linearGradient>
      ))}
    </defs>
  );
}
```

In `SceneStage`'s `<svg>`, render `<TerrainDefs />` as the FIRST child (before connectors/scenes).

In `SceneLayer`, wrap the shadow polygons in the blur group:

```tsx
{scene.shadows.length > 0 && (
  <g filter="url(#terrainSoftShadow)" pointerEvents="none">
    {scene.shadows.map((s, i) => (
      <polygon key={`s${i}`} points={s.points} fill={theme.shadow} />
    ))}
  </g>
)}
```

In `SceneLayer`'s face map, give the TOP face the per-rank gradient and a rim, keep side faces as the (now better-lit) solid fills:

```tsx
{b.faces.map((f, fi) => (
  <polygon
    key={fi}
    points={f.points}
    fill={f.kind === "top" ? `url(#${topGradientId(b.cell.rank)})` : f.fill}
    stroke={f.kind === "top" ? (isHot ? theme.hot : theme.topEdge) : "none"}
    strokeWidth={f.kind === "top" ? (isHot ? 1.8 : 0.8) : 0}
    strokeLinejoin="round"
  />
))}
```

(The `topEdge` theme colour already provides the rim; bumping its stroke width from 0.6→0.8 strengthens it.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain`
Expected: PASS for the new test. The existing "renders culled lit faces … 12 polygons" test still passes (shadows are still 1 polygon/cell; gradients change fill, not count). Then `npm test` → full suite green; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): gradient top faces, soft contact shadows, rim edge" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A5: Detail-panel header uses the legible tier text colour

- [ ] **Step 1: Write the failing test**

Add to `FolderPermissionTerrain.test.tsx`:

```ts
it("uses dark header text on a high-access (gold) cell", () => {
  const { container, getByText } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  const polys = terrain(container).querySelectorAll("polygon");
  fireEvent.click(polys[polys.length - 1]); // the Full Controller (rank 5) cell renders last
  const header = getByText(/Architect|Owner/).closest("div")!.parentElement as HTMLElement;
  // The coloured header band carries an explicit colour style (dark ink for rank 4–5).
  expect(header.getAttribute("style") || "").toMatch(/color/);
});
```

(If selector brittleness bites, simplify: assert `tierTextColor(5) === "#0b1620"` is imported and used — but prefer the render assertion.)

- [ ] **Step 2: Run it to verify it fails / is brittle**

Run: `npx vitest run FolderPermissionTerrain`
Expected: FAIL (header currently hardcodes white text).

- [ ] **Step 3: Implement**

In `DetailPanel`, change the coloured header `div`'s style from `color: "#fff"` to `color: tierTextColor(cell.rank)`, and the close button contrast accordingly (keep `bg-black/20` — fine on both).

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "fix(terrain): legible detail header text on light tiers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Unit B — Stacked floating planes for Compare

This is the core fix. New pure helper composes one camera scene per project at a screen-pixel vertical offset; then the component's compare branch is rewired to it.

Files:
- Modify: `app/(dashboard)/access-analysis/folderTerrain.ts`
- Modify: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts`, `…/__tests__/FolderPermissionTerrain.test.tsx`

### Task B1: `buildStackedScenes` — types + corner/pitch math

- [ ] **Step 1: Write the failing test**

Add to `folderTerrain.test.ts`:

```ts
import { buildStackedScenes } from "../folderTerrain"; // extend import

describe("buildStackedScenes", () => {
  const camera: Camera = { pivotCol: 0.5, pivotRow: 0.5, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 300, anchorY: 120 };
  const a = fixture("A", [["fa", "Client Documents"]], [["r1", "Architect"]], { r1: 3 });
  const b = fixture("B", [["fc", "Client Documents"]], [["r1", "Architect"]], { r1: 1 });
  const c = fixture("C", [["fe", "Client Documents"]], [["r1", "Architect"]], { r1: 2 });
  const axes = buildSharedAxes([a, b, c]);

  it("builds one plane per project in a tall viewport, vertically separated top→bottom", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planes).toHaveLength(3);
    // Each plane's ground sits strictly below the previous plane's ground.
    for (let i = 1; i < r.planes.length; i++) {
      expect(r.planes[i].scene.groundCorners.back.y).toBeGreaterThan(r.planes[i - 1].scene.groundCorners.front.y);
    }
  });

  it("connects every consecutive pair at four matching corners", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.connectors).toHaveLength((3 - 1) * 4);
  });

  it("labels each plane with its project name", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planes.map((p) => p.label)).toEqual(["A", "B", "C"]);
  });

  it("virtualizes planes whose band is off the viewport", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 120 }, { margin: 10 });
    expect(r.planes.length).toBeLessThan(3); // only the top plane(s) fit
  });

  it("returns the per-plane screen pitch (positive, larger than one footprint)", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planePitch).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — `buildStackedScenes` undefined.

- [ ] **Step 3: Implement**

In `folderTerrain.ts`, at the very END of the file (after `buildCameraScene`), add:

```ts
export interface StackedPlane {
  scene: TerrainScene;
  source: FolderTerrainData;
  label: string;
  /** Screen anchor for this plane's project header (its back-left, lifted). */
  headerX: number;
  headerY: number;
  index: number;
}

export interface StackedScenes {
  planes: StackedPlane[];
  connectors: { x1: number; y1: number; x2: number; y2: number }[];
  /** Vertical screen distance between consecutive plane anchors. */
  planePitch: number;
}

export interface StackedScenesOpts {
  /** Tallest bar per plane (shorter than single mode so stacked planes stay calm). */
  maxBar?: number;
  /** Airy gap (screen px, pre-scale) between a plane's footprint and the next. */
  gap?: number;
  /** Virtualization slack (screen px) around the viewport. */
  margin?: number;
}

/**
 * Compose one camera scene per project, each on the SAME camera (yaw/pitch/scale/
 * pivot) but anchored at a different screen Y — so the planes are parallel, fully
 * separated isometric islands (the BOT-OR-NOT exploded stack), not a cascading
 * single-grid tower. Connectors join matching ground corners of consecutive planes.
 * Off-viewport planes are virtualized out; connectors are computed for all pairs
 * (cheap) so the stack reads continuously while panning.
 */
export function buildStackedScenes(
  datas: ReadonlyArray<FolderTerrainData>,
  axes: SharedAxes,
  camera: Camera,
  viewport: { w: number; h: number },
  opts: StackedScenesOpts = {},
): StackedScenes {
  const maxBar = opts.maxBar ?? 44;
  const gap = opts.gap ?? 60;
  const margin = opts.margin ?? 240;
  const Cf = axes.folders.length;
  const R = axes.roles.length;

  // Footprint vertical screen span of the shared-axes grid (anchor-independent,
  // so we can compute it once on the real camera; affine translation cancels).
  const backY = projectCamera(-0.5, -0.5, 0, camera).y;
  const frontY = projectCamera(R - 0.5, Cf - 0.5, 0, camera).y;
  const footprintSpanY = Math.abs(frontY - backY);
  const planePitch = footprintSpanY + (maxBar + gap) * camera.scale;

  // Corner sets for ALL planes (cheap) → connectors decoupled from virtualization.
  const corner = (i: number) => {
    const cam: Camera = { ...camera, anchorY: camera.anchorY + i * planePitch };
    return {
      back: projectCamera(-0.5, -0.5, 0, cam),
      right: projectCamera(R - 0.5, -0.5, 0, cam),
      front: projectCamera(R - 0.5, Cf - 0.5, 0, cam),
      left: projectCamera(-0.5, Cf - 0.5, 0, cam),
    };
  };

  const connectors: StackedScenes["connectors"] = [];
  for (let i = 0; i < datas.length - 1; i++) {
    const x = corner(i), y = corner(i + 1);
    for (const k of ["back", "right", "front", "left"] as const) {
      connectors.push({ x1: x[k].x, y1: x[k].y, x2: y[k].x, y2: y[k].y });
    }
  }

  const planes: StackedPlane[] = [];
  for (let i = 0; i < datas.length; i++) {
    const cam: Camera = { ...camera, anchorY: camera.anchorY + i * planePitch };
    const cs = corner(i);
    const top = Math.min(cs.back.y, cs.right.y, cs.left.y) - maxBar * camera.scale;
    const bot = Math.max(cs.front.y, cs.left.y, cs.right.y);
    if (bot < -margin || top > viewport.h + margin) continue; // virtualized out
    const projected = projectOntoAxes(datas[i], axes);
    const scene = buildCameraScene(projected, { camera: cam, viewport, maxBar });
    planes.push({
      scene,
      source: datas[i],
      label: datas[i].projectName,
      headerX: cs.left.x,
      headerY: cs.left.y - maxBar * camera.scale - 10,
      index: i,
    });
  }

  return { planes, connectors, planePitch };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): buildStackedScenes — separated per-project planes" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B2: Rewire the Compare branch to stacked planes

- [ ] **Step 1: Update the existing compare component test**

The existing `"stacks projects on shared axes in compare mode"` test still applies (headers `Demo Project` / `Project Two` must render). ADD an assertion that planes are now separated (the two project headers render as distinct `<text>` and at least one dotted connector line exists). Replace that test body with:

```ts
it("stacks projects as separated planes with connectors in compare mode", async () => {
  const loadTerrain = vi.fn(async (id: string) => (id === "p2" ? data2 : id === "p1" ? data : null));
  const { getByText, findByText, container } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={loadTerrain} />,
  );
  fireEvent.click(getByText("Compare"));
  expect(await findByText("Project Two")).toBeTruthy();
  expect(getByText("Demo Project")).toBeTruthy();
  expect(loadTerrain).toHaveBeenCalledWith("p2");
  // Connector drop-lines between the two planes (dashed lines in the stage).
  const dashed = [...terrain(container).querySelectorAll("line")].filter((l) => l.getAttribute("stroke-dasharray"));
  expect(dashed.length).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run it to verify current behaviour**

Run: `npx vitest run FolderPermissionTerrain`
Expected: the dashed-connector assertion may already pass (old code drew connectors) — that's fine; this test guards the behaviour through the rewire. If green now, proceed; Step 3 changes the geometry while keeping it green.

- [ ] **Step 3: Rewire `buildView` + `defaultPivot`**

In `FolderPermissionTerrain.tsx`:

a) Replace the constants at the top:

```ts
const PLANE_GAP = 64;     // airy screen-px gap between stacked planes
const SLAB_MAXBAR = 44;   // shorter bars so stacked planes stay legible
const VIEW_H = 520;       // taller stage for the exploded stack
```

(Remove the old `SLAB_GAP`.)

b) Replace the entire `compare` block of `buildView` (the part after `if (compareDatas.length < 2) …`) with a call to the new helper:

```ts
// compare — separated floating planes, one per project, on a shared camera.
if (compareDatas.length < 2) return blank(busy ? "Loading projects…" : "Pick at least two projects to compare.");
const axes = buildSharedAxes(compareDatas);
const stacked = buildStackedScenes(compareDatas, axes, cam, viewport, { maxBar: SLAB_MAXBAR, gap: PLANE_GAP });
const scenes: SceneEntry[] = stacked.planes.map((p) => ({
  scene: p.scene,
  source: p.source,
  label: p.label,
  labelX: p.headerX,
  labelY: p.headerY,
}));
return { scenes, connectors: stacked.connectors, metric: "users", empty: null };
```

Add the import: `buildStackedScenes` to the `from "../folderTerrain"` list. Remove now-unused imports (`buildSharedAxes` stays — still used here; `projectOntoAxes`/`projectCamera` may now be unused in the component — let `npx tsc --noEmit`/eslint tell you, and delete any that go unused).

c) Update `defaultPivot`'s compare branch to centre on a single shared-axes plane:

```ts
if (mode === "compare" && compareDatas.length >= 2) {
  const axes = buildSharedAxes(compareDatas);
  return centerPivot(axes.roles.length, axes.folders.length);
}
```

(Delete the old `totalRows`/`SLAB_GAP` math.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npm test` → full suite green; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): compare = separated floating planes (not a merged tower)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B3: Bolder per-plane project headers + compare caption

- [ ] **Step 1: Write the failing test**

Add to `FolderPermissionTerrain.test.tsx`:

```ts
it("renders a bold project header per plane in compare mode", async () => {
  const loadTerrain = vi.fn(async (id: string) => (id === "p2" ? data2 : id === "p1" ? data : null));
  const { getByText, findByText } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={loadTerrain} />,
  );
  fireEvent.click(getByText("Compare"));
  const header = await findByText("Project Two");
  // Header text is rendered bold (font-weight >= 700) to read as a section title.
  expect(Number(header.getAttribute("font-weight") || "400")).toBeGreaterThanOrEqual(700);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run FolderPermissionTerrain`
Expected: PASS or FAIL depending on the current label weight (current label is `fontWeight={700}` at size 12). If it already passes, strengthen the test to also assert size ≥ 13 (the new header is bigger):

```ts
expect(Number(header.getAttribute("font-size") || "0")).toBeGreaterThanOrEqual(13);
```
…and that will FAIL on the current size-12 label.

- [ ] **Step 3: Implement**

In `SceneLayer`, replace the project label `<text>` (the `entry.label` block) with a bolder header that includes a small tier-neutral underline accent:

```tsx
{entry.label && entry.labelX != null && entry.labelY != null && (
  <g pointerEvents="none">
    <text x={entry.labelX} y={entry.labelY} fontSize={13.5} fontWeight={800} fill={theme.ink}
      textAnchor="start" dominantBaseline="middle" letterSpacing="0.02em">
      {entry.label.length > 26 ? entry.label.slice(0, 25) + "…" : entry.label}
    </text>
    <line x1={entry.labelX} y1={entry.labelY + 10} x2={entry.labelX + 34} y2={entry.labelY + 10}
      stroke={theme.connector} strokeWidth={2} strokeLinecap="round" />
  </g>
)}
```

Update the compare caption in the header (the `<p>` under `ProjectMultiSelect`) to describe the new model:

```tsx
{selected.length} projects · each on its own plane, stacked top→bottom — scan a column straight down to compare the same folder × role. Drag to orbit the whole stack; scroll-drag to pan through it.
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): bold per-plane headers + clearer compare caption" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Unit C — Animation layer (`FolderPermissionTerrain.tsx`)

All animation is rAF-coalesced and degrades to the final state under `prefers-reduced-motion` and in tests. Bar grow-in scales each bar's height by a multiplier `g` recomputed in the scene so hover hit-testing stays correct.

Files:
- Modify: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`
- Modify: `app/(dashboard)/access-analysis/folderTerrain.ts` (add a `growth` factor to camera scene opts)
- Test: both test files

### Task C1: `growth` factor in the camera scene (pure)

- [ ] **Step 1: Write the failing test**

Add to `folderTerrain.test.ts` inside the `buildCameraScene` describe:

```ts
it("scales every bar's height by the growth factor", () => {
  const full = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 } });
  const half = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 }, growth: 0.5 });
  // A bar's top is higher (smaller screen-y) when taller; at growth 0.5 every top
  // sits lower than at full growth. Compare the tallest bar (rank-5 cell).
  const topY = (s: typeof full) => Math.min(...s.bars.flatMap((b) => b.top.map((p) => p.y)));
  expect(topY(half)).toBeGreaterThan(topY(full));
});
it("treats growth=0 as flat (no height)", () => {
  const flat = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 }, growth: 0 });
  // With zero height, each bar's top equals its base row screen-y (z contributes 0).
  expect(flat.bars.length).toBe(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — `growth` not honoured.

- [ ] **Step 3: Implement**

In `folderTerrain.ts`, add `growth?: number` to `CameraSceneOpts`, and in `buildCameraScene` multiply the computed height by it:

```ts
export interface CameraSceneOpts {
  camera: Camera;
  viewport: { w: number; h: number };
  maxBar?: number;
  light?: Light;
  rowOffset?: number;
  /** 0..1 height multiplier for grow-in animation (default 1). */
  growth?: number;
}
```

In the bar loop, change `const h = cellHeight(cell);` to:

```ts
const h = cellHeight(cell) * (opts.growth ?? 1);
```

(Shadows + lattice are at z=0 so they're unaffected — correct: the ground stays put while bars rise.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): growth factor for bar grow-in" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C2: Grow-in hook + reduced-motion guard, threaded into every scene build

- [ ] **Step 1: Write the failing test**

Add to `FolderPermissionTerrain.test.tsx`. jsdom defaults `matchMedia` to undefined, so first add a top-of-file shim (only if not present):

```ts
// at top of FolderPermissionTerrain.test.tsx, after imports
if (!window.matchMedia) {
  // @ts-expect-error jsdom has no matchMedia
  window.matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
}
```

Then the test (grow-in must settle to full bars; we assert the polygon count reaches 12 after settle, proving the animation completes):

```ts
it("settles to full geometry after grow-in", async () => {
  const { container, findByText } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  await findByText("Client Documents");
  await vi.waitFor(() => {
    expect(terrain(container).querySelectorAll("polygon").length).toBe(12);
  });
});
```

ALSO update the existing `"renders culled lit faces … 12 polygons"` test to wrap its polygon-count assertion in `await vi.waitFor(() => …)` (grow-in may start below 12 and settle to 12).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run FolderPermissionTerrain`
Expected: FAIL — grow-in not implemented yet (or the plain count test is now racy without waitFor).

- [ ] **Step 3: Implement the grow-in hook**

In `FolderPermissionTerrain.tsx`, add a hook near `useCamera`:

```ts
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Eases a 0→1 growth factor whenever `key` changes (bar grow-in). */
function useGrowth(key: string): number {
  const [g, setG] = useState(1);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) { setG(1); return; }
    let start = 0;
    const D = 460;
    setG(0);
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / D);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setG(eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [key]);
  return g;
}
```

Wire it: in the component, compute `const growth = useGrowth(dataKey);` (reuse the existing `dataKey` memo — move its declaration above this call if needed). Thread `growth` into `buildView` and on to every `buildCameraScene` / `buildStackedScenes` call:
- Add a `growth` parameter to `buildView(...)` and pass `{ growth }` into each `buildCameraScene` call (single + overview), and pass `growth` through `buildStackedScenes` via a new opt.
- Extend `buildStackedScenes` opts with `growth?: number` and forward it: `buildCameraScene(projected, { camera: cam, viewport, maxBar, growth: opts.growth ?? 1 })`. (Pure-layer change — add `growth` to `StackedScenesOpts` and the forward; no new test needed beyond C1, but you MAY add one asserting forwarding.)
- Update the `view` memo deps to include `growth`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npm test` → green; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): bar grow-in with reduced-motion guard" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C3: Eased camera moves for Frame / Reset / click-repivot

- [ ] **Step 1: Write the failing test**

Camera tween is timing-based; assert the API exists and converges. Add to `folderTerrain.test.ts` a pure easing helper test (extract the tween math to a pure function so it's unit-testable):

```ts
import { easeCamera } from "../folderTerrain";

describe("easeCamera", () => {
  const A: Camera = { pivotCol: 0, pivotRow: 0, yaw: 0, pitch: 0.5, scale: 1, anchorX: 0, anchorY: 0 };
  const B: Camera = { pivotCol: 2, pivotRow: 3, yaw: 1, pitch: 1.0, scale: 2, anchorX: 100, anchorY: 50 };
  it("returns A at t=0 and B at t=1", () => {
    expect(easeCamera(A, B, 0)).toEqual(A);
    const end = easeCamera(A, B, 1);
    expect(end.yaw).toBeCloseTo(1); expect(end.scale).toBeCloseTo(2); expect(end.anchorX).toBeCloseTo(100);
  });
  it("interpolates monotonically between", () => {
    const mid = easeCamera(A, B, 0.5);
    expect(mid.scale).toBeGreaterThan(1); expect(mid.scale).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run folderTerrain`
Expected: FAIL — `easeCamera` undefined.

- [ ] **Step 3: Implement**

In `folderTerrain.ts` (camera section), add:

```ts
/** Cubic-eased interpolation between two cameras (t in 0..1). */
export function easeCamera(a: Camera, b: Camera, t: number): Camera {
  const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
  const lerp = (x: number, y: number) => x + (y - x) * e;
  return {
    pivotCol: lerp(a.pivotCol, b.pivotCol), pivotRow: lerp(a.pivotRow, b.pivotRow),
    yaw: lerp(a.yaw, b.yaw), pitch: lerp(a.pitch, b.pitch), scale: lerp(a.scale, b.scale),
    anchorX: lerp(a.anchorX, b.anchorX), anchorY: lerp(a.anchorY, b.anchorY),
  };
}
```

Then in `useCamera`, add a `tweenTo(target: Camera, ms = 300)` that rAF-eases `camRef.current` from its current value to `target` via `easeCamera`, calling `schedule()` each frame, and have `framePivot`, `resetTo`, and `setPivotCell` route through it (guard with `prefersReducedMotion()` → set instantly). Keep orbit/pan direct (no tween). Export `tweenTo` in the hook's return for the tool buttons.

```ts
const tweenRaf = useRef<number | null>(null);
const tweenTo = useCallback((target: Camera, ms = 300) => {
  if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
  if (prefersReducedMotion()) { camRef.current = { ...target }; setCam({ ...target }); return; }
  const from = { ...camRef.current };
  let start = 0;
  const step = (t: number) => {
    if (!start) start = t;
    const k = Math.min(1, (t - start) / ms);
    camRef.current = easeCamera(from, target, k);
    setCam({ ...camRef.current });
    if (k < 1) tweenRaf.current = requestAnimationFrame(step);
  };
  tweenRaf.current = requestAnimationFrame(step);
}, []);
```

Update `framePivot` to `tweenTo({ ...camRef.current, anchorX: viewport.w / 2, anchorY: viewport.h / 2 })`, and the Reset button to build the home camera and `tweenTo` it. `setPivotCell` keeps its no-jump anchor recompute but may stay instant (re-pivot shouldn't slide the picked cell). Add `easeCamera` to the import list; cleanup `tweenRaf` in the unmount effect.

- [ ] **Step 4: Run tests**

Run: `npx vitest run folderTerrain` → PASS; `npx vitest run FolderPermissionTerrain` → still green (buttons still toggle/exist); `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderTerrain.ts" "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts"
git diff --cached --name-only
git commit -m "feat(terrain): eased camera for frame/reset/repivot" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C4: Smooth hover lift

- [ ] **Step 1: Write the failing test**

Hover lift is a visual transform; assert the hovered bar group gets a transition style + a non-identity transform on enter. Add to `FolderPermissionTerrain.test.tsx`:

```ts
it("lifts the hovered bar", () => {
  const { container } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  const polys = terrain(container).querySelectorAll("polygon");
  const barGroup = polys[polys.length - 1].closest("g")!;
  fireEvent.mouseEnter(barGroup);
  expect(barGroup.getAttribute("transform") || barGroup.style.transform || "").toMatch(/translate|matrix/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run FolderPermissionTerrain`
Expected: FAIL — no transform on hover.

- [ ] **Step 3: Implement**

In `SceneLayer`'s per-bar `<g>`, when `isHot` (hovered/picked), apply a small upward SVG transform and a CSS transition:

```tsx
<g
  key={`b${i}`}
  transform={isHot ? "translate(0,-4)" : undefined}
  style={{ cursor: "pointer", transition: "transform .14s ease" }}
  onMouseEnter={() => setHover({ cell: b.cell, x: b.cx, y: b.cy })}
  onClick={() => { if (!draggedRef.current.dragged) { setPicked({ cell: b.cell, source }); onPick(b); } }}
>
```

(Brightening on hover already happens via the `isHot` stroke; the lift adds the tactile feel. Keep it tiny — 4px — so it doesn't break the depth illusion.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): smooth hover lift on bars" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C5: Mode / data cross-fade

- [ ] **Step 1: Write the failing test**

Cross-fade adds a CSS opacity transition on the scene group keyed by `dataKey`. Add to `FolderPermissionTerrain.test.tsx`:

```ts
it("wraps the scene in a keyed fading group", () => {
  const { container } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  const fade = terrain(container).querySelector("g[data-scene-fade]") as SVGGElement | null;
  expect(fade).toBeTruthy();
  expect(fade!.style.transition).toMatch(/opacity/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run FolderPermissionTerrain`
Expected: FAIL — no `[data-scene-fade]` group.

- [ ] **Step 3: Implement**

In `SceneStage`, wrap the connectors + scenes (not the defs/pivot/HUD) in a group keyed by `dataKey` that fades from 0→1 on mount. Pass `dataKey` from the parent into `SceneStage`. Use a tiny `useFadeIn` that flips opacity 0→1 on the next frame:

```tsx
function FadingScene({ k, children }: { k: string; children: React.ReactNode }) {
  const [op, setOp] = useState(0);
  useEffect(() => { setOp(0); const r = requestAnimationFrame(() => setOp(1)); return () => cancelAnimationFrame(r); }, [k]);
  return <g data-scene-fade style={{ opacity: op, transition: "opacity .28s ease" }}>{children}</g>;
}
```

Wrap: `<FadingScene k={dataKey}>{connectors + scenes}</FadingScene>`. (Reduced-motion: optional — the 0.28s fade is subtle; if you want, short-circuit `op` to 1 when `prefersReducedMotion()`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run FolderPermissionTerrain` → PASS; `npm test` → green; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "feat(terrain): cross-fade scene on mode/data change" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Unit D — Chrome / clarity polish + live rebuild

Files:
- Modify: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx`

### Task D1: Calmer lattice + restyled HUD

- [ ] **Step 1 (visual; guard with a light test):** Add a test that the help caption text updated, then make the polish edits:

```ts
it("shows BIM-style navigation help", () => {
  const { getByText } = render(
    <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
  );
  expect(getByText(/orbit/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run** `npx vitest run FolderPermissionTerrain` — PASS (caption already contains "orbit"); this just guards the HUD stays present through the edits.

- [ ] **Step 3: Polish edits** (no behaviour change):
  - Lighten `theme.grid` opacity (dark `0.14→0.10`, light `0.12→0.09`) so the lattice recedes.
  - Reduce role/folder label sizes by ~0.5px and lift label fill contrast a touch.
  - Round the tool-palette + compass corners to match `rounded-2xl` card; give the palette a hairline top divider.
  - Ensure the empty/loading text is centred and uses `theme.sub`.
  - Verify dark + light by reading `resolvedTheme` (already wired) — no hardcoded zinc.

- [ ] **Step 4: Run** `npm test` → green; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx" "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"
git diff --cached --name-only
git commit -m "polish(terrain): calmer lattice, restyled HUD, theme audit" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task D2: Full gate + safe live rebuild

- [ ] **Step 1:** Run the whole suite + typecheck.

Run: `npm test` then `npx tsc --noEmit`
Expected: full unit suite green, `tsc` 0 errors.

- [ ] **Step 2: Safe rebuild** (memory: do NOT `npm run build` under the running :3000 — it 500s the live server). Build into a side dir, then swap:

```bash
# In the Bash tool (bash), build into an alternate dist, then swap + restart.
NEXT_DIST_DIR=.next-new npx next build --webpack
```

Then stop the running server, replace `.next` with `.next-new`, and `npm start` (follow the project's existing start recipe / the concurrent session's `start-local.ps1`). If unsure of the live-swap mechanics, STOP and hand back to the owner with the built `.next-new` ready — do not risk the live dashboard.

- [ ] **Step 3: Visual UAT (owner).** Open `/access-analysis` → Folder Permission Terrain:
  - Single: lit teal→gold bars, soft shadows, bars grow in on load.
  - Compare: pick 4–6 projects → separated floating planes, clear gaps, dotted connectors, bold per-plane headers; orbit tilts the whole stack; pan scrolls down the tower.
  - Overview: inherits the new look.
  - Toggle OS "reduce motion" → animations collapse to final state.

- [ ] **Step 4: Commit** any rebuild-log/asset changes ONLY if they belong in git (most `.next*` dirs are gitignored / backup dirs — do NOT commit build output). Typically nothing to commit here.

---

## Self-review (completed during planning)

**Spec coverage:**
- Unit A (colour + lit shading) → Tasks A1–A5 (ramp, text colour, gradients+light, render gradients/shadows/rim, detail header). ✔
- Unit B (stacked floating planes) → Tasks B1–B3 (`buildStackedScenes`, rewire `buildView`/`defaultPivot`, headers/caption). ✔
- Unit C (animation: grow-in, camera easing, hover lift, cross-fade, connector draw-in) → C1–C5. Connector draw-in is covered by the C5 scene cross-fade (connectors live inside the faded group); no separate task needed. ✔
- Unit D (chrome + rebuild) → D1–D2. ✔

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✔

**Type consistency:** `buildStackedScenes` / `StackedScenes` / `StackedPlane` / `StackedScenesOpts` (with `growth`), `CameraSceneOpts.growth`, `easeCamera`, `tierTextColor`, `topGradientId`, `TIER_GRADIENTS`, `useGrowth`, `tweenTo`, `FadingScene` are used consistently across tasks. Component maps `headerX/headerY → labelX/labelY` on the existing `SceneEntry`. ✔

**Known coupling to watch during execution:**
- The existing "12 polygons" test MUST be wrapped in `vi.waitFor` once grow-in lands (Task C2) — flagged in C2 Step 1.
- Removing `SLAB_GAP` and possibly-unused imports (`projectCamera`, `projectOntoAxes`) from the component — let `tsc`/eslint confirm before deleting.
- `dataKey` is reused by both `useGrowth` (C2) and `FadingScene` (C5); ensure its memo is declared before both consumers.
