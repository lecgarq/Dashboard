---
phase: 03-render-layer
plan: "02"
subsystem: render-layer
tags: [three.js, InstancedMesh, OrbitControls, 3D, mode-transition, rAF]
dependency_graph:
  requires: [03-01]
  provides: [GraphCanvas3D, GraphCanvas-3D-slot]
  affects: [04-01]
tech_stack:
  added: []
  patterns:
    - "three.js r184 InstancedMesh with SphereGeometry(4,6,6) for low-poly GPU instanced 3D nodes"
    - "OrbitControls(enableDamping=true, autoRotate=false) unconstrained orbit from three/examples/jsm/controls/OrbitControls.js"
    - "Per-instance alpha baked into RGB color multiplication (lit=1.0, dim=0.15) — MeshBasicMaterial.opacity is global (Pitfall 6)"
    - "Self-driving internal rAF for controls.update() + renderer.render() every frame"
    - "600ms easeInOutCubic camera tilt (2D->3D) + 400ms easeOutCubic z-flatten (3D->2D) via requestAnimationFrame"
    - "fitView() computes bounding box from InstancedMesh matrices before tilt starts"
    - "Cancel in-flight animFrame on rapid mode toggle to prevent animation stacking"
key_files:
  created:
    - app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx
    - app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts
  modified:
    - app/(dashboard)/users/access-analysis/GraphCanvas.tsx
    - .planning/REQUIREMENTS.md
decisions:
  - "three.js r184 InstancedMesh adopted for 3D (cosmograph has no 3D mode — RESEARCH Open Question #2 resolved)"
  - "easeInOutCubic chosen for 600ms 2D->3D tilt (smooth symmetrical entry)"
  - "easeOutCubic chosen for 400ms 3D->2D z-flatten (fast start, gentle land)"
  - "ResizeObserver stubbed globally in test file (not in jsdom) — Rule 3 auto-fix"
  - "next-themes mocked in test file (GraphCanvas depends on useTheme)"
  - "cosmos.gl mocked in test for GraphCanvas-level tests (GraphCanvas always mounts GraphCanvas2D)"
metrics:
  duration_seconds: 587
  duration_human: "~10 min"
  completed_date: "2026-05-19"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 03 Plan 02: Render Layer — GraphCanvas 3D Summary

**One-liner:** three.js r184 InstancedMesh + OrbitControls 3D renderer with easeInOutCubic 600ms tilt / easeOutCubic 400ms z-flatten mode transitions, 12-test behavioral suite, and CSS visibility swap for zero-remount REND-03 compliance.

---

## What Was Built

### GraphCanvas3D.tsx (258 lines)

Three.js r184 3D renderer subcomponent. Returns `null` — no DOM of its own. Creates a `<canvas>` and appends it to `containerRef.current` with absolute fill CSS. Exposes `GraphCanvas3DHandle` via `onHandleReady` callback.

**Handle interface:**
```typescript
export interface GraphCanvas3DHandle {
  pushPositions(xyz: Float32Array): void;
  applyAlphaMask(mask: Float32Array, version: number): void;
  setColors(rgba: Float32Array): void;
  fitView(): void;
  setBackground(color: string): void;
  getCamera(): THREE.PerspectiveCamera;
}
```

**Key implementation details:**
- `WebGLRenderer({ canvas, antialias: true, alpha: true })` + `setPixelRatio(devicePixelRatio)`
- `PerspectiveCamera(60, w/h, 1, 100_000)` initial position `(0, 0, 2000)`
- `OrbitControls(camera, canvas)`: `enableDamping=true`, `dampingFactor=0.08`, `autoRotate=false`. No polar clamping — unconstrained orbit per CONTEXT.md
- `InstancedMesh` of n `SphereGeometry(4, 6, 6)` (low-poly) with `MeshBasicMaterial({ vertexColors: true, transparent: true })`
- `instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n*3), 3)` — RGB per instance (alpha baked in via color multiplication)
- Persistent `dummy = new THREE.Object3D()` reused every tick — zero per-frame allocation
- Self-driving internal rAF calls `controls.update(); renderer.render(scene, camera)` every frame while mounted
- `fitView()` reads all instance matrices, builds Box3, positions camera at `center + distance * 1.5` along z-axis
- `ResizeObserver` on container → `setSize` / `camera.updateProjectionMatrix()` / `fitView()`

**REND-04 purity:** Allowed imports = `react`, `three`, `three/examples/jsm/controls/OrbitControls.js`, `./physicsLayer` (type only). No math/data/dimension-control layer references.

### GraphCanvas.tsx (239 lines, +114 lines delta)

Updated to fill the 3D slot established in Plan 03-01. Key changes:

- Import `GraphCanvas3D` and `GraphCanvas3DHandle`
- `handle3D = useRef<GraphCanvas3DHandle | null>(null)` alongside `handle2D`
- `prevMode = useRef<'2d' | '3d'>(props.mode)` + `animFrame = useRef<number | null>(null)` for transition tracking
- `useGraphRafLoop.onTick3D`: `(xyz) => handle3D.current?.pushPositions(xyz)`
- `onMaskChange` fires to **both** handles so hidden renderer stays in sync
- `useEffect([props.nodeColors])`: sync colors to both handles
- `useEffect([bg])`: sync background to `handle3D`
- Mode transition `useEffect([props.mode])`:
  - 2D→3D: cancel in-flight, `fitView()`, 600ms easeInOutCubic tilt via rAF
  - 3D→2D: cancel in-flight, 400ms easeOutCubic z-flatten via rAF
- `<GraphCanvas3D>` mounted **unconditionally** inside the visibility-toggled container — no `{mode === '3d' && ...}` conditional render (REND-03 compliance)

### GraphCanvas3D.test.ts (683 lines)

12-test jsdom suite. three.js fully mocked with ES6 classes (learned from Plan 03-01's `vi.fn().mockImplementation()` is not a constructor fix).

| Test | REND | Description |
|------|------|-------------|
| 1 | REND-02 | OrbitControls config: enableDamping=true, autoRotate=false |
| 2 | REND-02 | pushPositions writes xyz into per-instance matrices (z preserved) |
| 3 | REND-02 | InstancedMesh count = n from physicsLayer |
| 4 | REND-02 | instanceMatrix.needsUpdate = true after pushPositions |
| 5 | REND-02 | applyAlphaMask: lit × 1.0, dim × 0.15 (0.5 → 0.075) |
| 6 | REND-03 | WebGLRenderer constructed exactly once across 2D↔3D mode switches |
| 7 | REND-03 | Both renderers use same physicsLayer.getPositions() reference |
| 8 | REND-04 | Static purity: no forbidden terms in GraphCanvas3D.tsx |
| 9 | Pitfall 7 | OrbitControls import uses `.js` extension |
| 10 | REND-02 | fitView() call exists in GraphCanvas 2D→3D branch |
| 11 | LOCKED | 600ms tilt + 400ms flatten both proven animated via rAF (≥3 ticks, not snapped) |
| 12 | LOCKED | Rapid toggle: in-flight tilt rAF is cancelled before flatten starts |

---

## Easing Curves Chosen

**Claude's discretion per CONTEXT.md:**

- **2D→3D 600ms tilt**: `easeInOutCubic` — `t < 0.5 ? 4t³ : 1 - (-2t+2)³/2`. Symmetrical slow-start, fast-middle, slow-end. Gives a "camera swooping in" feel appropriate for a spatial mode entry.

- **3D→2D 400ms flatten**: `easeOutCubic` — `1 - (1-t)³`. Fast start (snappy feel of returning to flat), gentle deceleration. Since 2D is the "resting" state, a fast-out is appropriate.

---

## Mocking Strategy

**three.js mock sufficed for the full test suite.** No real headless-gl was needed.

Approach: ES6 class mocks inside `vi.mock('three', async () => { ... })` factory. Key classes: `MockWebGLRenderer`, `MockScene`, `MockPerspectiveCamera`, `MockInstancedMesh`, `MockOrbitControls` (in separate mock), plus pure-TypeScript `FakeVector3`, `FakeMatrix4`, `FakeBox3`, `FakeInstancedBufferAttribute`.

The ES6 class approach was required because `vi.fn().mockImplementation(() => {...})` with arrow functions cannot be called with `new` — the same issue discovered in Plan 03-01 with `MockGraph`.

**jsdom stubs added:**
- `ResizeObserver` — not in jsdom; stubbed with a no-op class via `vi.stubGlobal`
- `@cosmos.gl/graph` — mocked for tests rendering full `GraphCanvas` (which always mounts `GraphCanvas2D`)
- `next-themes` — mocked to return `resolvedTheme: 'dark'`

---

## three.js r184 Quirks Discovered

1. **OrbitControls import requires `.js` extension** (Pitfall 7, already documented in RESEARCH). `three/examples/jsm/controls/OrbitControls.js` — the extension is mandatory for Next.js bundler resolution.

2. **`InstancedBufferAttribute` for instance colors** — must be manually assigned to `mesh.instanceColor`; it is not set automatically by `InstancedMesh` constructor even when `vertexColors: true` is set on the material.

3. **Per-instance alpha via color multiplication** — `MeshBasicMaterial.opacity` is a global property; per-node opacity requires baking into the per-instance RGB color (Pitfall 6). The DIM factor (0.15) matches the cosmos.gl `pointGreyoutOpacity` value for visual consistency between 2D and 3D modes.

4. **fitView() timing** — must be called before the tilt animation starts (so `endPos` is the correctly-fitted camera position, not the pre-fit position). GraphCanvas calls `fitView()` synchronously before scheduling the rAF tilt.

---

## Line Counts

| File | Lines | Status |
|------|-------|--------|
| GraphCanvas3D.tsx | 258 | Created |
| GraphCanvas.tsx | 239 | Modified (+114 delta) |
| GraphCanvas3D.test.ts | 683 | Created |
| .planning/REQUIREMENTS.md | — | REND-02 amended |

---

## Phase 3 Readiness Check for Phase 4

`GraphCanvas.tsx` props interface is stable for Phase 4 (interactions layer):

```typescript
export interface GraphCanvasProps {
  physics: PhysicsLayer;
  nodeColors: Float32Array;
  nodeSizes?: Float32Array;
  mode: "2d" | "3d";
  activeDimNames?: readonly string[];   // typed, accepted, visually unwired — Phase 4
  hoveredIndex?: number;                // typed, accepted, visually unwired — Phase 4
  selectedIndices?: readonly number[];  // typed, accepted, visually unwired — Phase 4
  backgroundColor?: string;
  width?: number;
  height?: number;
}
```

Phase 4 can pass `hoveredIndex`, `selectedIndices`, and `activeDimNames` to `GraphCanvas` today — the props are typed and accepted but not yet wired to visual state changes. Phase 4's job is to implement the hover halo, selection dim, and 3D axis labels.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] REND-04 purity: JSDoc comment mentioned forbidden terms mathLayer/dataLayer**
- **Found during:** Task 1 purity verification
- **Issue:** Comment "NO mathLayer, dataLayer, dimension-control layer references" contained `mathLayer` and `dataLayer` which the purity scanner flagged
- **Fix:** Rephrased to "NO math/data/dimension-control layer references" (same pattern as Plan 03-01 fix)
- **Files modified:** `GraphCanvas3D.tsx`
- **Commit:** `d5859cf`

**2. [Rule 3 - Blocking] ResizeObserver not defined in jsdom**
- **Found during:** Task 3 (Tests 1-6 failed with "ResizeObserver is not defined")
- **Issue:** jsdom does not implement ResizeObserver; GraphCanvas3D.tsx uses it for canvas resize handling
- **Fix:** `vi.stubGlobal("ResizeObserver", FakeResizeObserver)` at the top of the test file with a no-op class
- **Files modified:** `GraphCanvas3D.test.ts`
- **Commit:** `c025087`

**3. [Rule 3 - Blocking] @cosmos.gl/graph not mocked for full-GraphCanvas tests**
- **Found during:** Task 3 (Tests 6, 11, 12 which use `<GraphCanvas>` also render `<GraphCanvas2D>` which imports cosmos.gl)
- **Issue:** Tests 6+ use the full `GraphCanvas` component which always mounts `GraphCanvas2D` (unconditional per REND-03)
- **Fix:** Added `vi.mock("@cosmos.gl/graph", ...)` with a simple `MockGraph` class
- **Files modified:** `GraphCanvas3D.test.ts`
- **Commit:** `c025087`

**4. [Rule 3 - Blocking] next-themes not mocked for GraphCanvas tests**
- **Found during:** Task 3 alongside fix 3
- **Issue:** `GraphCanvas` calls `useTheme()` from next-themes; not available in jsdom
- **Fix:** Added `vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }))`
- **Files modified:** `GraphCanvas3D.test.ts`
- **Commit:** `c025087`

---

## Self-Check: PASSED

All 4 created/modified files verified on disk:
- `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` — exists
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — exists
- `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts` — exists
- `.planning/REQUIREMENTS.md` — REND-02 amended

All 3 task commits verified: `d5859cf`, `27938b0`, `c025087`

Full repo: 568 tests, 68 test files — all passing.
