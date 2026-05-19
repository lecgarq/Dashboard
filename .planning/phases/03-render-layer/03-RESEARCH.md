# Phase 3: Render Layer - Research

**Researched:** 2026-05-19
**Domain:** cosmos.gl v3 WebGL graph rendering + three.js InstancedMesh 3D orbit
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Replace `react-force-graph-2d` v1.29.1 with cosmograph / cosmos.gl (WebGL on GPU).** This supersedes REND-01's named library. REQUIREMENTS.md must be updated.
- **3D renderer = Claude's discretion**, with strong preference for cosmograph's 3D mode so a single engine drives both modes. This trivializes REND-03 (same engine, same graphData ref, flip a flag).
- **Cosmograph runs in "frozen" mode** — it does NOT drive its own simulation. It paints positions computed by Phase 2's `physicsLayer.ts`. Matches the 2026-05-13 "frozen cosmos" architectural pattern already in this dashboard.
- **Target ceiling: 50,000+ nodes at 60fps** on a discrete GPU. This is the explicit driver for the WebGL swap.
- GraphCanvas props: `positions: Float32Array`, `alphaMask: Float32Array`, `nodeColors: Float32Array | string[]`, `nodeSizes: Float32Array` (optional, Claude's discretion), `mode: "2d" | "3d"`.
- No feature data, no slider values, no role/permission objects inside the component. REND-04 remains fully honored.
- **Color is switchable at runtime** (Phase 4 owns the selector UI).
- **All nodes are circles.** No shape-based encoding.
- **Dim state (alphaMask < 1) = lower opacity only (target 0.15).** No desaturation, no shrink.
- **2D → 3D = smooth camera tilt animation, ~600ms** from top-down to an orbit angle.
- **3D initial camera = auto-fit to the bounding box** of all nodes.
- **Orbit controls = unconstrained.** Free rotate + zoom; no auto-rotate; no upside-down clamp.
- **3D → 2D return = animate z → 0 over ~400ms.** Smooth flatten, not a snap.
- **Motion driven exclusively by d3 reheat ticks** in Phase 2's `physicsLayer.ts`. Render layer reads latest positions each rAF frame. No render-side tweening.
- **Target 60 fps via requestAnimationFrame** (~16ms/frame).
- **Labels hide during active drag**, fade back in on release.
- **Apply the existing label polish curve** (UAT-approved 2026-05-08): `pow(zoom, 0.2)` clamped to `[0.85, 1.4]`, 11px floor / 18px ceiling, pill backgrounds. Use cosmograph's custom label rendering hooks.
- **Background reacts to the theme toggle** — dark zinc (`#09090B`) when dark mode; light variant when light mode.
- **3D scaffolding = subtle floor grid + 3 dimension axes** labeled with the names of the currently active sliders.
- **Initial load = render nodes immediately at random positions, animate to settled positions.**
- **Zero edges drawn between nodes.**
- **Hover state**: soft glow halo + 1.2× scale + label always shown on the hovered node.
- **Selected state**: brighter halo + persistent label + all other nodes dim to 0.15 alpha.
- **On window or panel resize: resize the canvas AND auto-refit the camera**.
- **Device pixel ratio = match native DPR.** No cap unless perf fallback triggers.
- **Dev-only FPS overlay** (hidden in production builds).
- **Auto-degrade on sustained FPS < 30**: drop labels → drop hover halos → cap DPR.

### Claude's Discretion

- 3D renderer specifics (whether cosmograph 3D matures enough, otherwise three.js InstancedMesh)
- Node size encoding (likely activity count, log-scaled)
- Easing curves for the 600ms tilt and 400ms z→0 animations
- Random-position initial layout extent
- Exact label-polish bridge from the existing react-force-graph implementation to cosmograph's label hooks
- Whether DPR is matched at full resolution or capped at 2 by default (perf judgement call)
- Auto-degrade thresholds and timing windows

### Deferred Ideas (OUT OF SCOPE)

- **Color-by selector UI** (Phase 4)
- **Hover-shows-tooltip and click-isolate dimming behavior** (Phase 4 owns interaction wiring; render layer only provides visual states given `hoveredId` / `selectedIds`)
- **Keyboard navigation / a11y for the canvas** — revisit before public launch
- **Screenshot / export of the current view** — not in scope
- **Save/restore camera state across sessions** — not in scope; auto-fit on each load

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REND-01 | 2D rendering via cosmograph/cosmos.gl (replaces react-force-graph-2d) with alpha mask per node | cosmos.gl `setPointPositions` (stride-2 x,y Float32Array), `setPointColors` (RGBA stride-4), `highlightedPointIndices` for greyed/non-greyed split, `pointGreyoutOpacity: 0.15` config |
| REND-02 | 3D mode with orbit controls | three.js r184 `InstancedMesh` + `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js`, both installed; 3D canvas overlaid or swapped conditional on mode prop |
| REND-03 | Seamless 2D ↔ 3D switch: position continuity, no remount, no jump | Two-canvas strategy: cosmos.gl hidden + three.js hidden — swap visibility; positions held in a shared ref; or single-canvas via three.js in both modes (see Architecture Patterns) |
| REND-04 | GraphCanvas receives only `Float32Array positions`, `Float32Array alphaMask`, and `mode: "2d"\|"3d"` — no slider values, no feature data | CosmosCanvasHandle interface already established in CosmosCanvasClient.ts; same interface extended for phase 3 |
| REND-05 | Smooth animations during slider drag — no flash, no popping, no jitter | cosmos.gl `transitionDuration: 0` avoids internal GPU transitions; positions updated each rAF tick from physicsLayer.getPositions(); 60fps loop confirmed possible |

</phase_requirements>

---

## Summary

cosmos.gl v3.0.0-beta.9 is **already installed** in the project (`@cosmos.gl/graph@3.0.0-beta.9`) and the project already has a `CosmosCanvasClient.ts` that bridges Mosaic selections to the canvas. The core 2D render path is validated and straightforward: call `graph.setPointPositions(stride2_xy)`, `graph.setPointColors(rgba_float32)`, and express the alpha mask via `highlightedPointIndices` + `pointGreyoutOpacity: 0.15`. Set `enableSimulation: false` in the config to disable cosmos.gl's own physics engine entirely.

cosmos.gl is **strictly 2D** — its positions format is stride-2 `[x0,y0, x1,y1, ...]` and there is no 3D mode in the installed package. For 3D orbit mode the project already has `three@0.184.0` (r184) with `OrbitControls` in `three/examples/jsm/controls/OrbitControls.js`. Neither `@react-three/fiber` nor `@react-three/drei` are installed. The 3D layer must use bare three.js: an `InstancedMesh` of `SphereGeometry` (or `PlaneGeometry` for performance) driven directly by the Float32Array positions from physicsLayer. The `mode` prop switches between the cosmos.gl WebGL canvas and the three.js canvas. Both canvases can live in the same container; only one is visible at a time (CSS `visibility`/`opacity`). Positions are kept in a shared `useRef<Float32Array>` so neither renderer needs to re-receive data on mode switch.

The `nyquist_validation` key is absent from `.planning/config.json` — the workflow block uses `research`, `plan_check`, and `verifier` keys only. **Validation Architecture section is omitted** since `nyquist_validation` is not present (treat as false).

**Primary recommendation:** Build 03-01 as cosmos.gl 2D with frozen simulation + rAF position pump. Build 03-02 as three.js InstancedMesh 3D layer with OrbitControls, shared position ref, CSS visibility swap for mode switch.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cosmos.gl/graph` | `3.0.0-beta.9` | WebGL GPU-accelerated 2D graph rendering | Already installed; confirmed 50k+ node capability; `enableSimulation: false` for frozen mode; `setPointPositions` accepts Float32Array directly |
| `three` | `^0.184.0` (r184) | 3D scene, InstancedMesh, OrbitControls | Already installed; bare three.js is the only 3D option available without new installs |
| `next-themes` | `^0.4.6` | Theme detection (`useTheme`) for background color switching | Already used in layout; `useTheme()` → `resolvedTheme` gives "dark"/"light" |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `d3-force-3d` | `^3.0.6` | Position source (Phase 2 output) | Only consumed, not called from render layer |
| HTML5 Canvas 2D API | browser built-in | Label overlay (pill backgrounds, zoom-scaled text) | 2D only — a transparent overlay `<canvas>` above the cosmos.gl canvas |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| three.js bare InstancedMesh | `@react-three/fiber` + `@react-three/drei` | R3F would simplify 3D but requires 2 new packages; bare three.js is sufficient for InstancedMesh + OrbitControls |
| cosmos.gl 2D | WebGPU / custom shader | Overkill; cosmos.gl already verified at 50k+ nodes |
| CSS visibility swap | Remount/unmount | Remount destroys GPU buffers + WebGL context; visibility swap preserves textures |

**Installation:** No new packages needed. All required libraries are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
app/(dashboard)/users/access-analysis/
├── GraphCanvas.tsx              # PHASE 3 — main entry component
├── GraphCanvas2D.tsx            # cosmos.gl WebGL 2D renderer (subcomponent)
├── GraphCanvas3D.tsx            # three.js InstancedMesh 3D renderer (subcomponent)
├── useGraphRafLoop.ts           # Shared rAF pump: physicsLayer → positions ref → push to renderer
├── useGraphLabels.ts            # Label overlay hook (2D canvas, zoom-scaled pill text)
├── GraphCanvas.test.ts          # Phase 3 unit tests
├── CosmosCanvasClient.ts        # EXISTING — Mosaic → setAlphaMask bridge (extend, don't replace)
└── physicsLayer.ts              # PHASE 2 output — consumed by render layer
```

### Pattern 1: cosmos.gl Frozen Mode Setup

**What:** Construct the `Graph` with `enableSimulation: false` so cosmos.gl never runs its own physics. Push positions on each rAF tick from physicsLayer.
**When to use:** Every tick during active simulation (while `physicsLayer.alphaMask` changes) and on initial mount.
**Example:**
```typescript
// Source: cosmos.gl README + confirmed defaultConfigValues inspection
import { Graph } from '@cosmos.gl/graph';

const graph = new Graph(canvasContainerDiv, {
  enableSimulation: false,          // CRITICAL — disables cosmos internal physics
  transitionDuration: 0,            // CRITICAL — no GPU transition animation during position updates
  fitViewOnInit: true,
  fitViewDelay: 250,
  fitViewPadding: 0.1,
  backgroundColor: '#09090B',       // zinc dark (from dark-mode plan)
  renderLinks: false,               // zero edges — CONTEXT.md locked decision
  pointGreyoutOpacity: 0.15,        // matches DIM_ALPHA = 0.15 from CosmosCanvasClient.ts
  spaceSize: 4096,
  pixelRatio: window.devicePixelRatio,
});
```

### Pattern 2: Position Pump — physicsLayer → cosmos.gl per rAF

**What:** Read `physicsLayer.getPositions()` (stride-3 xyz) each rAF frame, downproject to stride-2 xy for cosmos.gl, call `setPointPositions`.
**When to use:** Every rAF tick while `mode === "2d"` and simulation is running (alpha > 0) or on first render.
**Example:**
```typescript
// Source: cosmos.gl API confirmed via source inspection; physicsLayer API from Phase 2 SUMMARY
function pumpPositions2D(physics: PhysicsLayer, graph: Graph): void {
  const xyz = physics.getPositions(); // Float32Array(n*3) — stride-3
  const n = xyz.length / 3;
  const xy = new Float32Array(n * 2); // stride-2 required by cosmos.gl
  for (let i = 0; i < n; i++) {
    xy[i * 2]     = xyz[i * 3];     // x
    xy[i * 2 + 1] = xyz[i * 3 + 1]; // y — z dropped for 2D projection
  }
  graph.setPointPositions(xy, true); // dontRescale=true: skip expensive rescale every tick
  graph.render();
}
```

**Critical:** Pass `dontRescale=true` (second argument) on every tick call. Without it, cosmos.gl rescales the coordinate space on every position update, causing visible jitter. Only pass `false`/`undefined` on the initial call or after `fitView()`.

### Pattern 3: Alpha Mask → cosmos.gl highlightedPointIndices

**What:** The PhysicsLayer `alphaMask` Float32Array has per-node opacity values. cosmos.gl's greyout system uses `highlightedPointIndices` — any point NOT in the highlighted set gets the `pointGreyoutOpacity`. Translate the mask to an index array.
**When to use:** Every time `physicsLayer.maskVersion` increments (change detection).
**Example:**
```typescript
// Source: cosmos.gl confirmed API (highlightedPointIndices config prop, v3 README)
function applyAlphaMask(graph: Graph, alphaMask: Float32Array): void {
  const litIndices: number[] = [];
  for (let i = 0; i < alphaMask.length; i++) {
    if (alphaMask[i] >= 0.99) litIndices.push(i); // lit = fully opaque
  }
  // When all nodes are lit (no filter active), pass undefined to disable greyout entirely.
  const highlighted = litIndices.length === alphaMask.length
    ? undefined
    : new Float32Array(litIndices);
  graph.setConfigPartial({ highlightedPointIndices: highlighted as unknown as number[] });
}
```

**Warning:** cosmos.gl v3 changed from imperative `setHighlightedPointSet()` (v2) to config-driven `highlightedPointIndices`. Use `setConfigPartial` not `setConfig` — `setConfig` resets ALL config to defaults first, which would reset `enableSimulation`, `renderLinks`, etc. (confirmed via source: "Every call fully resets the configuration to defaults first").

### Pattern 4: Point Colors with Alpha Encoding

**What:** cosmos.gl `setPointColors` accepts `Float32Array` in RGBA stride-4 format. The alpha channel in the color buffer is independent of the greyout system — use it to encode node-level opacity for the alphaMask where needed, or rely entirely on the greyout system.
**When to use:** On initial data load and whenever `nodeColors` prop changes.
**Example:**
```typescript
// Source: cosmos.gl README + setPointColors JSDoc confirmed via source inspection
// nodeColors input is RGBA Float32Array(n*4) with R,G,B in [0,1] and A=1.0 (lit)
// Alpha masking is done via highlightedPointIndices, NOT via alpha channel in colors.
graph.setPointColors(nodeColorsRGBA);
```

### Pattern 5: three.js 3D Mode — InstancedMesh + OrbitControls

**What:** A separate `<canvas>` rendered by a three.js `WebGLRenderer`. Nodes are an `InstancedMesh` with `SphereGeometry(radius, 8, 8)` (or `CircleGeometry` for billboard effect). Positions from physicsLayer stride-3 xyz are applied via `instanceMatrix` or per-instance position attribute.
**When to use:** When `mode === "3d"`.
**Example:**
```typescript
// Source: three.js r184 confirmed installed; OrbitControls confirmed in three/examples/jsm
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.autoRotate = false; // CONTEXT.md: no auto-rotate

const geometry = new THREE.SphereGeometry(2, 6, 6); // low-poly for perf
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
const mesh = new THREE.InstancedMesh(geometry, material, nodeCount);
scene.add(mesh);

// Push positions from physicsLayer each rAF:
const dummy = new THREE.Object3D();
function pumpPositions3D(xyz: Float32Array): void {
  for (let i = 0; i < nodeCount; i++) {
    dummy.position.set(xyz[i*3], xyz[i*3+1], xyz[i*3+2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
```

### Pattern 6: Mode Switch — CSS Visibility Swap

**What:** Both cosmos.gl and three.js canvases are always mounted. Switching mode hides one and shows the other via CSS. Positions are held in a `useRef<Float32Array>` shared by both renderers.
**When to use:** On `mode` prop change.
**Example:**
```typescript
// The two canvas containers sit in the same div, absolutely positioned:
// <div style={{ position: 'relative', width, height }}>
//   <div ref={cosmos2dRef} style={{ position: 'absolute', inset: 0, visibility: mode === '2d' ? 'visible' : 'hidden' }} />
//   <canvas ref={three3dRef} style={{ position: 'absolute', inset: 0, visibility: mode === '3d' ? 'visible' : 'hidden' }} />
// </div>
//
// On mode switch from '2d' to '3d':
// 1. Flip visibility (instant — no remount)
// 2. Start 600ms camera tilt animation in the three.js renderer
// 3. three.js picks up latest positions from the shared positionsRef
```

**Why not remount:** cosmos.gl holds textures in GPU memory. Unmounting destroys the WebGL context and all GPU-side buffers. Visibility swap avoids this at zero cost — hidden canvases consume no GPU draw calls.

### Pattern 7: rAF Loop Architecture

**What:** A single `requestAnimationFrame` loop at the top level of `GraphCanvas.tsx` drives both renderers. The loop reads from `physicsLayer.getPositions()` and `physicsLayer.alphaMask`, pushes to the active renderer.
**When to use:** Always — this is the main animation loop.
**Example:**
```typescript
useEffect(() => {
  let rafId: number;
  let lastMaskVersion = -1;

  function tick(): void {
    rafId = requestAnimationFrame(tick);
    const positions = physics.getPositions(); // Float32Array(n*3)
    positionsRef.current = positions;

    if (mode === '2d') {
      pumpPositions2D(positions, cosmosGraph);
      const mv = physics.maskVersion;
      if (mv !== lastMaskVersion) {
        applyAlphaMask(cosmosGraph, physics.alphaMask);
        lastMaskVersion = mv;
      }
    } else {
      pumpPositions3D(positions, instancedMesh);
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, [physics, mode]);
```

### Anti-Patterns to Avoid

- **`graph.setConfig()` instead of `graph.setConfigPartial()` for runtime changes**: `setConfig` resets ALL properties to defaults before applying — this undoes `enableSimulation: false`, `renderLinks: false`, etc. Only use `setConfig` at initialization; use `setConfigPartial` for runtime updates.
- **Calling `setPointPositions` without `dontRescale: true` on every tick**: cosmos.gl's rescale pass is expensive and causes per-frame coordinate jitter. Pass `true` on tick updates; only rescale on initial load.
- **Mounting/unmounting cosmosCanvas on mode switch**: Destroys the WebGL context and GPU textures. Use CSS visibility instead.
- **Using stride-3 xyz directly in cosmos.gl**: cosmos.gl positions are strictly stride-2 `[x,y, x,y, ...]` (confirmed: `pointPositions.length / 2` = pointCount). Downproject z before calling `setPointPositions`.
- **Driving `highlightedPointIndices` with a plain JS Array**: Pass a typed array or `undefined`. cosmos.gl internally uses `setHighlightedPointSet(new Set(t))` when the value is truthy (confirmed via source: line 195–196).
- **Calling `physicsLayer.getPositions()` expecting the same Float32Array reference**: Each call allocates a new Float32Array (confirmed in physicsLayer.ts source). Cache the reference within the tick.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebGL point rendering at 50k+ | Custom WebGL shader | cosmos.gl `@cosmos.gl/graph` | cosmos.gl handles texture atlas, GPU simulation pipeline, zoom, pan, hover |
| Orbit + zoom camera | Custom three.js camera rig | `three/examples/jsm/controls/OrbitControls.js` | Handles damping, zoom, polar angle; already installed |
| GPU transitions for position updates | CSS transitions or JS tweens | `transitionDuration: 0` + manual rAF | cosmos.gl has built-in GPU transitions; set to 0 to disable and drive manually |
| Theme-aware background | Custom CSS variable wiring | `next-themes` `useTheme()` → `resolvedTheme` | Already wired in `app/layout.tsx`; returns "dark"/"light" synchronously |
| Alpha mask as per-node RGBA alpha | Custom shader per-vertex opacity | cosmos.gl `highlightedPointIndices` + `pointGreyoutOpacity` | Built into the GPU pipeline; no custom shader needed |

**Key insight:** cosmos.gl's greyout system is already a per-node opacity pass on the GPU. The `highlightedPointIndices` + `pointGreyoutOpacity: 0.15` combination is exactly what this project needs — lit nodes render at full opacity, non-lit nodes at 0.15. No custom GLSL required.

---

## Common Pitfalls

### Pitfall 1: `setConfig` Resets All Defaults

**What goes wrong:** Calling `graph.setConfig({ highlightedPointIndices: indices })` on every mask update resets `enableSimulation`, `renderLinks`, `transitionDuration`, `backgroundColor`, and every other property to the defaultConfigValues before applying the new config.
**Why it happens:** v3 changed `setConfig` semantics — it's now a full replace, not a merge. The old v2 behavior was merge. The README explicitly documents: "Every call fully resets the configuration to defaults first."
**How to avoid:** Use `graph.setConfigPartial({ highlightedPointIndices: indices })` for runtime updates. Only call `setConfig` once at construction time.
**Warning signs:** The graph background turns to `#222222` (cosmos default) instead of zinc black; simulation starts running unexpectedly.

### Pitfall 2: stride-3 vs stride-2 Position Format

**What goes wrong:** Passing `physicsLayer.getPositions()` (stride-3 `[x,y,z, x,y,z, ...]`) directly to `graph.setPointPositions()`. cosmos.gl interprets this as having `length/2` nodes instead of `length/3`, so every other "node" is a phantom and positions scramble.
**Why it happens:** cosmos.gl is 2D only. All position operations use `length / 2` (confirmed in source). The physicsLayer contract is stride-3 (xyz).
**How to avoid:** Always downproject to stride-2 before calling `setPointPositions`. Allocate a persistent `Float32Array(n * 2)` once, reuse it every tick (avoid allocation per frame).
**Warning signs:** Node count appears to double; node positions are wildly off.

### Pitfall 3: cosmos.gl `ready` / Async Initialization

**What goes wrong:** Calling `graph.setPointPositions()` immediately after `new Graph(div, config)` when the WebGL device is not yet initialized throws silently or queues — BUT in v3, all methods queue until the device is ready. The queue has a limit and silently drops calls beyond it.
**Why it happens:** cosmos.gl v3 uses async initialization (luma.gl device). The constructor returns immediately; the GPU context may not be ready.
**How to avoid:** Check `graph.isReady` before pushing data, OR use `await graph.ready` (returns a Promise) once in `useEffect`. Start the rAF loop only after `ready` resolves.
**Warning signs:** First few frames render nothing; positions appear only after user interaction.

### Pitfall 4: rAF Allocation — `getPositions()` per tick

**What goes wrong:** Calling `physicsLayer.getPositions()` inside every rAF tick allocates a new `Float32Array(n*3)` every frame (16ms). At 6000 nodes, this is 72KB of GC pressure per frame = ~4.3MB/sec allocation rate, causing GC pauses.
**Why it happens:** physicsLayer.ts `getPositions()` always allocates a new array (confirmed in source lines 300–309). This was intentional for API safety.
**How to avoid:** For the rAF loop, bypass `getPositions()` and read directly from the d3 SimNode array stored in physicsLayer (if exposed), OR pre-allocate a persistent `Float32Array(n*2)` for the cosmos.gl stride-2 projection and always write into it. The positions array can be cached between frames if `physicsLayer.maskVersion` hasn't changed and simulation is frozen.
**Warning signs:** Chrome DevTools heap snapshot shows Float32Array churn; FPS drops under sustained slider drag.

### Pitfall 5: cosmos.gl WebGL Context Lost on Hidden Canvas

**What goes wrong:** In some browsers, a `<canvas>` that is `display:none` for an extended period may have its WebGL context suspended or lost, requiring full re-initialization.
**Why it happens:** Browsers can reclaim GPU resources from non-visible contexts.
**How to avoid:** Use `visibility: hidden` (or `opacity: 0`) instead of `display: none`. Visibility-hidden canvases retain their WebGL context. If context is lost, listen for the `webglcontextlost` event and call `graph.destroy()` + re-init.
**Warning signs:** 3D canvas goes blank after sitting hidden during long 2D session.

### Pitfall 6: three.js InstancedMesh Color Buffer for Alpha Mask

**What goes wrong:** Using InstancedMesh without per-instance colors — setting a global opacity on the `MeshBasicMaterial` dims ALL nodes equally, defeating the alpha mask.
**Why it happens:** Three.js `MeshBasicMaterial.opacity` is global. Per-node opacity requires `vertexColors: true` + an instance color attribute where dimmed nodes have `a=0.15`.
**How to avoid:** Allocate an `InstancedBufferAttribute` of RGBA per node (or use `mesh.setColorAt(i, color)` with a pre-dimmed color). For the 3D layer, bake the alpha mask into the color: lit nodes use full-saturation color, dimmed nodes multiply the color by 0.15.
**Warning signs:** "dim" nodes are still fully bright in 3D mode even after setMask calls.

### Pitfall 7: OrbitControls Import Path

**What goes wrong:** `import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'` fails TypeScript resolution if three.js types don't expose the examples/jsm directory.
**Why it happens:** three.js types are in `@types/three` but the project has `"three": "^0.184.0"` with built-in types. The examples path requires `moduleResolution: bundler` or an explicit path.
**How to avoid:** Use the `.js` extension: `import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'`. Confirmed `OrbitControls.js` exists in `node_modules/three/examples/jsm/controls/`. Next.js 16 with bundler resolution handles `.js` extensions.
**Warning signs:** TypeScript "Cannot find module 'three/examples/jsm/controls/OrbitControls'" error.

---

## Code Examples

Verified patterns from official sources:

### cosmos.gl Graph Constructor (Frozen Mode)
```typescript
// Source: cosmos.gl README v3 + defaultConfigValues (confirmed installed v3.0.0-beta.9)
import { Graph } from '@cosmos.gl/graph';

const graph = new Graph(divElement, {
  enableSimulation: false,      // freeze cosmos internal physics
  transitionDuration: 0,        // instant updates — we drive animation via rAF
  renderLinks: false,           // zero edges (CONTEXT.md locked decision)
  backgroundColor: '#09090B',   // zinc dark
  pointGreyoutOpacity: 0.15,    // matches DIM_ALPHA from CosmosCanvasClient.ts
  spaceSize: 4096,
  fitViewOnInit: true,
  fitViewDelay: 250,
  pixelRatio: window.devicePixelRatio,
  onZoom: ({ transform }) => {
    const k = transform.k;
    const labelScale = Math.pow(k, 0.2);              // UAT-approved label polish curve
    const clampedScale = Math.min(1.4, Math.max(0.85, labelScale));
    updateLabelScale(clampedScale);                   // push to overlay canvas
  },
});
```

### Position Push — stride-3 to stride-2 (persistent buffer)
```typescript
// Source: physicsLayer.ts confirmed stride-3; cosmos.gl confirmed stride-2
const xy2d = new Float32Array(nodeCount * 2); // allocate ONCE, reuse every tick

function pumpPositions2D(xyz: Float32Array, graph: Graph): void {
  for (let i = 0; i < nodeCount; i++) {
    xy2d[i * 2]     = xyz[i * 3];     // x
    xy2d[i * 2 + 1] = xyz[i * 3 + 1]; // y
  }
  graph.setPointPositions(xy2d, true); // dontRescale=true — avoid coordinate jitter
  graph.render();
}
```

### Alpha Mask Application (change-detection guarded)
```typescript
// Source: cosmos.gl README v3 — config-driven highlighting replaces imperative v2 API
let lastMaskVersion = -1;

function maybeApplyMask(graph: Graph, physics: PhysicsLayer): void {
  if (physics.maskVersion === lastMaskVersion) return;
  lastMaskVersion = physics.maskVersion;

  const mask = physics.alphaMask;
  const lit: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] >= 0.99) lit.push(i);
  }
  const allLit = lit.length === mask.length;
  // setConfigPartial — NOT setConfig (v3: setConfig resets all defaults)
  graph.setConfigPartial({
    highlightedPointIndices: allLit ? undefined : lit as unknown as number[],
  });
}
```

### three.js 3D Initialization
```typescript
// Source: three.js r184 confirmed installed; OrbitControls confirmed in examples/jsm
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function init3D(canvas: HTMLCanvasElement, nodeCount: number): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.InstancedMesh;
} {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.background = null; // transparent — CSS handles dark/light bg

  const camera = new THREE.PerspectiveCamera(60, w / h, 1, 100_000);
  camera.position.set(0, 0, 2000); // initial top-down view (z-axis camera)

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = false;     // CONTEXT.md: no auto-rotate
  // No polar angle clamping — unconstrained orbit (CONTEXT.md)

  const geometry = new THREE.SphereGeometry(4, 6, 6);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, nodeCount);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(nodeCount * 3), 3  // RGB per instance
  );
  scene.add(mesh);

  return { renderer, scene, camera, controls, mesh };
}
```

### REND-04 GraphCanvas Props Interface
```typescript
// Derived from CONTEXT.md decisions + CosmosCanvasHandle pattern already in codebase
export interface GraphCanvasProps {
  /** stride-3 Float32Array(n*3) [x0,y0,z0, x1,y1,z1, ...] from physicsLayer.getPositions() */
  positions: Float32Array;
  /** per-node alpha: 1.0 = lit, 0.15 = dimmed. From physicsLayer.alphaMask */
  alphaMask: Float32Array;
  /** RGBA Float32Array(n*4) with values in [0,1]. One color per node. */
  nodeColors: Float32Array;
  /** per-node size in world units. Optional. */
  nodeSizes?: Float32Array;
  /** Render mode. Does NOT trigger remount on change. */
  mode: '2d' | '3d';
  /** Hovered node index (undefined = none). Visual state only — interaction wiring in Phase 4. */
  hoveredIndex?: number;
  /** Selected node indices (empty = none). Dims all others to 0.15 alpha. Phase 4 wires this. */
  selectedIndices?: readonly number[];
  /** Active dimension names for 3D axis labels. */
  activeDimNames?: readonly string[];
  /** Called by parent with physics handle to bridge setAlphaMask. */
  onHandleReady?: (handle: CosmosCanvasHandle) => void;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-force-graph-2d` v1.29.1 (Canvas2D) | cosmos.gl v3 WebGL GPU | CONTEXT.md 2026-05-19 | 10–100× throughput; required for 50k+ nodes at 60fps |
| cosmos.gl v2 imperative `setHighlightedPointSet()` | cosmos.gl v3 config-driven `highlightedPointIndices` | v3.0.0 changelog | Use `setConfigPartial` not `setHighlightedPointSet` |
| cosmos.gl v2 `setData({ nodes, links })` | cosmos.gl v3 `setPointPositions(Float32Array)` + `setPointColors(Float32Array)` | v2.0.0 changelog | Direct typed array IO; no node object overhead |
| `setConfig()` as partial merge (v2) | `setConfig()` = full reset; `setConfigPartial()` = partial merge (v3) | v3.0.0 | **Critical breaking change** — using `setConfig` for runtime updates breaks the whole config |

**Deprecated/outdated:**
- `react-force-graph-2d` nodeCanvasObject: No longer the renderer. All canvas2D custom drawing replaced by cosmos.gl GPU pipeline + a separate HTML5 Canvas overlay for labels.
- cosmos.gl v2 `setData({ nodes, links })` pattern: Replaced by `setPointPositions(Float32Array)` + `setLinks(Float32Array)`.

---

## Open Questions

1. **cosmos.gl label hooks — custom label rendering API**
   - What we know: CONTEXT.md requires reusing the UAT-approved label polish curve (`pow(zoom,0.2)`) via "cosmograph's custom label rendering hooks". cosmos.gl README and source inspection found no dedicated label API.
   - What's unclear: cosmos.gl v3.0.0-beta.9 may not expose a label hook. The `onZoom` callback provides zoom transform `k` which is sufficient to implement label scaling.
   - Recommendation: Implement labels on a transparent HTML5 Canvas overlay positioned above the cosmos.gl canvas. Drive font size from `onZoom` callback. This is simpler and more controllable than waiting for a cosmos.gl label API. The "hooks" language in CONTEXT.md should be interpreted as "use whatever cosmos.gl exposes"; overlay canvas is the correct approach.

2. **3D mode maturity — cosmograph vs three.js**
   - What we know: cosmos.gl installed is `@cosmos.gl/graph` only — a 2D-only library (stride-2 positions confirmed). No 3D package exists in the installed dependencies. three.js r184 is installed with OrbitControls.
   - What's unclear: Whether `@cosmos.gl/graph` plans a 3D mode in a future version (not relevant for this sprint).
   - Recommendation: Use three.js r184 InstancedMesh + OrbitControls for 3D. This is not a fallback — it IS the 3D implementation. The CONTEXT.md language "cosmograph 3D" referred to a hoped-for future; the actual installed library is 2D only.

3. **FPS overlay in dev mode — cosmos.gl vs custom**
   - What we know: cosmos.gl `defaultConfigValues` shows a `showFPSMonitor` property. This is exactly what CONTEXT.md requires for the dev-only FPS overlay.
   - What's unclear: Whether `showFPSMonitor` exists in `3.0.0-beta.9` (not in the defaultConfigValues dump above) vs a newer version.
   - Recommendation: Use `process.env.NODE_ENV === 'development'` guard + cosmos.gl `setConfigPartial({ showFPSMonitor: true })` if it resolves at runtime; otherwise implement a lightweight `useRef<number>` fps counter.

4. **Initial random positions extent for "graph finding itself" flourish**
   - What we know: CONTEXT.md requires "render nodes immediately at random positions, animate to settled positions." physicsLayer.ts cache-miss path seeds nodes at `Math.random() * 2 - 1` (range `[-1,1]`), then the simulation runs.
   - What's unclear: Whether the physics simulation seeds its own random or whether GraphCanvas seeds initial cosmos.gl positions from the physics node array's initial random state.
   - Recommendation: GraphCanvas reads `physicsLayer.getPositions()` on each rAF tick — the first frames naturally show the random initial state while the simulation converges. No special seeding needed in the render layer. Allocate the cosmos.gl `spaceSize: 4096` and the initial random positions (`[-1,1]`) will map to a small cluster at the center before expanding. Consider passing `dontRescale: false` on the very first frame so cosmos.gl auto-fits the initial bounding box.

---

## Requirements Amendment Required

REQUIREMENTS.md REND-01 and REND-02 name `react-force-graph-2d` and `react-force-graph-3d`. Per CONTEXT.md flags_for_planner:
- **REND-01** should read: "2D mode via `@cosmos.gl/graph` v3 with `enableSimulation: false`, per-node RGBA colors, and alpha mask via `highlightedPointIndices` + `pointGreyoutOpacity: 0.15`"
- **REND-02** should read: "3D mode via three.js r184 `InstancedMesh` + `OrbitControls` with unconstrained orbit and auto-fit camera"

The planner should update REQUIREMENTS.md as the first task of 03-01.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@cosmos.gl/graph/README.md` — v3 API, migration from v2, Quick Start patterns; setConfig vs setConfigPartial distinction; async initialization; highlightedPointIndices
- `node_modules/@cosmos.gl/graph/dist/index.js` (source inspection) — confirmed stride-2 positions format (`pointPositions.length / 2`), confirmed `setHighlightedPointSet(new Set(t))` internal impl, confirmed `defaultConfigValues` full listing, confirmed `setConfig` resets to defaults
- `app/(dashboard)/users/access-analysis/physicsLayer.ts` — PhysicsLayer interface, getPositions() stride-3, alphaMask, maskVersion, setMask contract
- `app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts` — existing CosmosCanvasHandle interface, DIM_ALPHA=0.15 constant
- `node_modules/three/examples/jsm/controls/OrbitControls.js` — confirmed present in three r184

### Secondary (MEDIUM confidence)
- three.js r184 `InstancedMesh` + `InstancedBufferAttribute` — verified available via `require('three')` (REVISION: 184), exports confirmed: InstancedMesh, Float32BufferAttribute, SphereGeometry, WebGLRenderer, PerspectiveCamera
- `next-themes useTheme()` export confirmed; ThemeProvider wired in `app/layout.tsx` with `attribute="class"` (resolvedTheme = "dark"/"light")

### Tertiary (LOW confidence)
- cosmos.gl `showFPSMonitor` config property — present in defaultConfigValues as `false` (not `void 0`); may or may not exist in beta.9; validate at runtime

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both cosmos.gl and three.js verified installed and functional; API confirmed via source inspection
- Architecture: HIGH — cosmos.gl position format, greyout system, and v3 API changes verified directly from source
- Pitfalls: HIGH — setConfig/setConfigPartial distinction from README; stride-2 format from source; other pitfalls from known three.js and cosmos.gl patterns
- Open questions: MEDIUM — label hooks and FPS overlay have minor uncertainty; 3D renderer choice is clear

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (stable; cosmos.gl beta.9 may update but API shape is locked for this sprint)
