# Phase 6: 3D spherical graph with gravity at 120fps - Research

**Researched:** 2026-05-11
**Domain:** Real-time 3D graph visualization (react-three-fiber + three.js, GPU-compute physics, GPU picking, deterministic E2E)
**Confidence:** HIGH on stack/patterns; MEDIUM on 120fps at 25k nodes with edges; MEDIUM on deterministic-replay strategy

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sphere topology & gravity**
- Volumetric ball cloud — nodes fill the interior of a sphere; depth, occlusion, and parallax read on camera movement. Not on-surface, not orbital shells.
- Per-cluster gravity wells — each company/role acts as its own gravity well so clusters read as distinct "blobs" within the ball. Edges still apply pairwise attraction between connected nodes.
- No visible sphere shell — sphere is implied by node arrangement only; no wireframe, glow, or translucent surface.
- Composite radial position — distance from ball center is a weighted combination of multiple node parameters (likely activity level, role/seniority, connectedness — exact parameter list and weights to be derived from the schema during research). Not pure-physics, not a single-metric encoding.
- Tight clusters with inter-group breathing room — strong intra-cluster cohesion and strong inter-cluster repulsion.
- Edges: faded-by-depth + hover highlight — all edges drawn at very low opacity by default; edges of the hovered/selected node light up bright.
- Filter changes: smooth animated reflow — filtered-out nodes fade and drift outward; remaining nodes settle into a new equilibrium with animation. No hard re-simulate, no leave-positions-in-place.
- Slow auto-rotation when idle — gentle rotation kicks in after ~3s of no interaction; stops the moment the user touches the scene.

**Rendering engine & performance**
- `react-three-fiber` on top of three.js is the rendering layer. No 3d-force-graph. No raw three.js.
- Custom physics simulation, not a prebuilt force-graph lib.
- GPU compute physics is the target, gated by browser:
  - Primary: WebGL2 transform-feedback (or equivalent ping-pong) physics path so the simulation runs on Chrome + Safari + Firefox.
  - Optional: WebGPU compute-shader fast path layered on top for browsers that support it.
- Cross-browser support is required — Chrome, Safari, Firefox all must work.
- In-place replacement — the existing flat 2D graph in `app/(dashboard)/users/` is removed; the cosmos.gl dependency and `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` are dropped. No feature flag, no parallel routes.
- Parity first, then 3D polish.

**Camera & interaction**
- Orbit-drag around the sphere.
- Dolly zoom — scroll/pinch moves the camera physically closer, including all the way *into* the ball. No FOV-zoom, no hard stop at surface.
- Single-click selection via GPU picking — exact hit-test via render pass that writes node IDs into a pickbuffer.
- Smooth camera-tween on select — camera glides to center the selected node; ball rotates as needed to reveal it.

**Labels & info density at 120fps**
- Camera-distance LOD for labels — only nodes within a distance threshold from the camera show labels.
- 3D billboard labels at the node's 3D position, depth-sorted, occluded by closer nodes. Not 2D DOM overlay.
- Encoding redesigned for 3D — node color/size/glow/animation are not a 1:1 port of the current 2D encoding. Side panel + filter information remains at parity; visualization is new.

**Testing & quality**
- Heavy Playwright E2E for the 3D graph — full interaction flows tested.
- Physics simulation must support a deterministic / replay mode so screenshot-based assertions are stable.
- Unit tests on the math (parameter-to-radius mapping, cluster assignment) live alongside the E2E suite.

### Claude's Discretion

- Dev-only physics tuning panel (sliders for gravity strength, repulsion, radial weights, rotation speed) — build if it accelerates iteration; skip if it slows shipping. Hidden behind `?debug=1` or `NODE_ENV=development` if built.
- Bundle-size posture — likely lazy-load the graph component so three.js/r3f only loads on the Users dashboard route, but defer to existing code-split patterns in `app/(dashboard)/users/`.
- Target node count for 120fps — derive from the actual `accGraphSnapshot` size during research, then target that count comfortably.
- Exact composite-radial weights — choose during planning based on which schema fields are available and which combinations read well visually.
- Repulsion-strength tuning — chosen to produce the "tight clusters, breathing room" feel; tunable parameter.

### Deferred Ideas (OUT OF SCOPE)

- New filter types beyond what the 2D graph offers — separate phase.
- New side-panel content kinds for 3D-specific context — separate phase.
- Mobile-specific touch-gesture redesign beyond orbit/dolly natively — separate phase.
- VR/AR rendering — out of scope.
- Multi-select / lasso — out of scope; single-click parity only.
</user_constraints>

---

## Summary

Phase 6 replaces a working Cosmos.gl 2D GPU graph (25k-node hub validated in v1.0 Phase 02-05) with a 3D volumetric sphere rendered by `react-three-fiber` (r3f) on top of `three` r184 (already in `package.json`). The integration target is the **single existing component** `app/(dashboard)/users/AccUsersGraph.tsx` (the `activeTab === "graph"` mount in `UsersDirectoryClient.tsx`, lines 1168–1178). Its public contract is small: `{ users: BulkAccUser[]; onSelectUser?: (email: string) => void }`. Filter UI, side-panel selection, URL query persistence, and the tRPC data source (`trpc.users.getPrecomputedGraph`) all stay; only the renderer/physics/layout are replaced.

The standard 2026 stack for this is **r3f + drei** (`<Canvas>`, `<OrbitControls>`, `<Billboard>`, `<Text>`, `<Bvh>`, `<Stats>`) with **`THREE.GPUComputationRenderer`** (the official three.js GPGPU helper in `examples/jsm/misc/`) handling the physics loop via ping-pong float-texture FBOs. `GPUComputationRenderer` is the WebGL2-portable equivalent of transform feedback for this exact use-case (boids/N-body) — it runs identically on Chrome/Firefox/Safari with no transform-feedback shader quirks. A separate WebGPU compute path is feasible via three.js TSL `Fn().compute()` but is genuinely optional; recommend deferring it behind a feature-detection branch only if WebGL2 path misses the 120fps target.

**Primary recommendation:** Build the renderer as a new `app/(dashboard)/users/Sphere3DGraph.tsx` that drop-in replaces `AccUsersGraph.tsx` behind the same props. Use r3f `<Canvas frameloop="always">` (we need physics every frame), `GPUComputationRenderer` for position+velocity, `THREE.Points` with a custom `ShaderMaterial` for rendering (NOT `<Instances>` — Points scale to 25k+ at 120fps; instancing of meshes does not). GPU picking via `THREE.WebGLRenderTarget(1,1)` + `camera.setViewOffset` + `renderer.readRenderTargetPixels` is the canonical pattern. Labels via drei `<Billboard><Text/></Billboard>` mounted only for nodes within camera-distance LOD threshold (re-evaluated per frame against a small list, not 25k). Deterministic replay mode via fixed-timestep accumulator + seeded RNG for initial spawn — driven by a `?replay=1` URL flag the E2E harness sets.

---

## Phase Requirements

CONTEXT.md does not surface phase-numbered REQ-IDs (Phase 6 is roadmap-only; the v2.0 REQUIREMENTS file does not contain Phase 6 requirements yet). The phase's success contract derives from CONTEXT decisions. Tag candidates the planner can use:

| ID (proposed) | Description | Research Support |
|----|-------------|-----------------|
| GRAPH3D-01 | Volumetric sphere arrangement with composite-radial encoding | `graphSnapshot.ts` (lines 193–244 `applySemanticNodePositions`) shows existing 2D weighted encoding; the composite scheme generalizes to radial+angular in 3D |
| GRAPH3D-02 | Per-cluster gravity wells (company AND role) with pairwise edge attraction | GPUComputationRenderer two-variable example (boids gltf) demonstrates the cluster+attractor pattern |
| GRAPH3D-03 | 120fps target on Chrome/Firefox/Safari at production node count (25k) | THREE.Points + GPUComputationRenderer is the standard pattern; instanced meshes are too heavy for this count |
| GRAPH3D-04 | Edges faded-by-depth + hover/select bright | `THREE.LineSegments` with per-vertex alpha attribute, recomputed only on hover/select change |
| GRAPH3D-05 | Smooth filter reflow animation (fade-out + reflow) | Re-init target uniforms; alpha attribute lerped on the CPU at low frequency; no full re-sim |
| GRAPH3D-06 | Orbit-drag + dolly camera with into-sphere zoom | drei `<OrbitControls>` with `minDistance=0`, `enableDamping`, no max-zoom-stop |
| GRAPH3D-07 | GPU picking single-click selection | Canonical 1×1 render-target + `camera.setViewOffset` pattern from three.js manual |
| GRAPH3D-08 | Smooth camera-tween on select | r3f `useFrame` lerp of camera position + OrbitControls target |
| GRAPH3D-09 | Camera-distance LOD 3D billboard labels | drei `<Billboard><Text/></Billboard>` mounted only for the small "near camera" set |
| GRAPH3D-10 | Slow auto-rotation after 3s idle, cancel on input | r3f `useFrame` rotates a parent `<group>`; pointer/wheel handlers reset idle timer |
| GRAPH3D-11 | Deterministic replay mode for Playwright | Fixed-timestep + seeded RNG; gate via `?replay=1` URL flag; Playwright `waitForFunction` on a `__graphReady` window flag |
| GRAPH3D-12 | Remove cosmos.gl + drop patch | `package.json` dep `@cosmos.gl/graph`, `patches/@cosmos.gl+graph+3.0.0-beta.9.patch`, `postinstall: prisma generate && patch-package`, plus `cosmosUtils.ts`, `CosmosGraphRenderer` class in `graphRenderers.ts`, and pre-warm `void import("@cosmos.gl/graph")` in `AccUsersGraph.tsx` line 1166 |

---

## Existing Integration Surface (precise contract)

### Component to replace

`app/(dashboard)/users/AccUsersGraph.tsx` (2300+ lines) is the entire current graph. It is mounted exactly once:

```tsx
// app/(dashboard)/users/UsersDirectoryClient.tsx:1170
<AccUsersGraph
  users={mergedAccUsers}
  onSelectUser={(email) => {
    setSelectedPersonEmail(email);
    setActiveTab("general");
  }}
/>
```

**Public props (load-bearing):**
```ts
export interface AccUsersGraphProps {
  users: BulkAccUser[];           // imported from ./AccAnalysisPanel
  onSelectUser?: (email: string) => void;
}
```

The replacement component MUST accept the same `{ users, onSelectUser }` props or `UsersDirectoryClient.tsx` will break. Internally, the existing component subscribes to its own data source (see below); nothing else flows in via props.

### Data source (does NOT change)

`AccUsersGraph.tsx:492` — `const graphQuery = trpc.users.getPrecomputedGraph.useQuery(...)` returns `{ hit, nodes, edges, nodeIds, dataHash, stats, positions }`. The `nodes` array is typed `AccGraphNode[]` from `lib/acc/graphSnapshot.ts` and is the authoritative shape:

```ts
// lib/acc/graphSnapshot.ts
export interface AccGraphInstanceNode {
  kind: "instance";
  id: string;                  // `instance:${email}:${projectId}`
  label: string;               // first-name or initials, ~10 chars
  color: string;               // pre-assigned vibrant hex
  x: number; y: number; vx: number; vy: number;
  email: string;
  name: string;
  projectId: string;
  projectName: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
  lastAddedBucket: string;     // "YYYY-MM" or ""
  individualAccess: boolean;   // roles.length>0 || modules.length>0
  companyRole: string | null;
  lastSignIn: string | null;
}
```

Edges (`AccGraphEdge`): `{ source, target, color, weight, kind: "project"|"role"|"module" }`. NOTE: at the time of writing the precomputed graph emits `edges: []` (see `graphSnapshot.ts:305` — edges array is never appended to; `stats.edgeCount` is always 0). Edge topology in the current implementation is reconstructed client-side via `buildAccTopologyGraph(rawNodes)` from `accGraphOrganicLayout.ts` (line 1438 of `AccUsersGraph.tsx`). Phase 6 will need that same client-side edge reconstruction OR a server-side amendment — call this out at plan time.

### Filter / selection / panel touchpoints to preserve

| Surface | Where lives | Phase 6 obligation |
|---|---|---|
| Filter UI | inline in `AccUsersGraph.tsx` (≈lines 700–1100) | Lift filter panel + URL persistence + `accGraphFilters.ts` predicate into a sibling component so the new 3D canvas only consumes a `visibleIndices` set |
| Selection callback | `onSelectUser?(email)` prop fired on click | Same prop; GPU-picking returns node index → `nodesRef[i].email` |
| Side-panel detail | Already in `UsersDirectoryClient.tsx` (sets `selectedPersonEmail`) | Untouched |
| URL filter persistence | `readFiltersFromUrl` / `writeFiltersToUrl` in `AccUsersGraph.tsx` | Lift into shared filter helper or keep alongside the new canvas |
| Display-mode toggle (`2d`/`3d`) | `readGraphDisplayMode` / `writeGraphDisplayMode` in `accGraph3d.ts`, persisted to `localStorage` | DELETE — CONTEXT mandates in-place replacement, no toggle |
| WebGL2 fallback to Canvas2D | `isWebGL2Available()` → `canvas2d` backend | DELETE — Phase 6 raises floor to WebGL2 (graceful empty-state message if absent) |

### Files to delete in the cosmos.gl removal

1. `app/(dashboard)/users/AccUsersGraph.tsx` — replaced
2. `app/(dashboard)/users/cosmosUtils.ts` (339 lines) + `cosmosUtils.test.ts`
3. `app/(dashboard)/users/graphRenderers.ts` (1391 lines — contains `CosmosGraphRenderer` AND `CanvasGraphRenderer`; latter is dead in WebGL2-only world)
4. `app/(dashboard)/users/threeGraphRenderer.ts` (484 lines — the experimental 3D Points renderer; Phase 6 supersedes it)
5. `app/(dashboard)/users/accGraph3d.ts` (141 lines — 2D-with-depth helpers, no longer needed)
6. `app/(dashboard)/users/accGraphOrganicLayout.ts` + `.worker.ts` (d3-force CPU fallback; the GPU sim subsumes this)
7. `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` — and remove `patch-package` invocation from `postinstall` if no other patches remain (check `patches/` after delete)
8. `package.json`: drop `@cosmos.gl/graph`, `d3-force`, `@types/d3-force`

Keep: `accGraphFilters.ts` (pure predicate, reused), `accGraphTopology.test.ts` (reuse logic for edge build if topology moves into the new path), `folderCluster.ts` (used by ACC analysis, not graph), `AccUserSidePanel.tsx` (used by ACC Analysis tab — different surface, untouched).

### Production node count to size for

- v1.0 Phase 02-05 validated **25k-node** ACC hub interactively. `PROJECT.md:69`: "Graph must handle 25k-node hubs interactively." This is the design target, not 10k.
- `graphSnapshot.ts` emits one node per `(user, project)` instance pair. A user in N projects creates N nodes. The hub today has 25,559 instances (debug log in `02-05-gpu-physics-grey-canvas.md`).
- Phase 6 must comfortably hit 120fps at ~25k nodes on a modern laptop. **This is the load-bearing perf assumption.**

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.184 (already installed) | WebGL renderer + GPUComputationRenderer + math primitives | Already a dep; Phase 6 uses it directly |
| @react-three/fiber | ^9.x (latest stable, React 19 compatible) | React renderer for three.js; declarative scene graph | CONTEXT mandates r3f; r3f v9 is the React 19 line |
| @react-three/drei | ^10.x (latest stable on r3f v9) | OrbitControls, Billboard, Text, Bvh, Stats helpers | The pmndrs-blessed companion to r3f; benchmark 80+ on Context7 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| three-stdlib | ^2.x | Brings `OrbitControls`, `GPUComputationRenderer` typed wrappers (drei depends on it transitively) | Already pulled in by drei; do not add explicitly unless drei v10 changes that |
| seedrandom | ^3.x | Deterministic seeded PRNG for replay mode | Tiny (8KB), one job: stable spawn positions |
| `@react-three/fiber/Canvas` + `useFrame` | (in r3f) | Per-frame ticks for physics step, idle-rotation, camera-tween | Built in |

### Already-in-codebase reuse

| Existing | Repurpose for Phase 6 |
|---|---|
| `lib/acc/graphSnapshot.ts` | UNCHANGED — same node array feeds the 3D layer |
| `app/(dashboard)/users/accGraphFilters.ts` | Pure filter predicate; lift into a shared filter panel |
| `app/(dashboard)/users/folderCluster.ts` | Not used in graph path; ignore |
| `playwright` (already in deps) | E2E harness — no new framework needed |
| `vitest` (already in deps) | Unit tests for radial encoding + cluster assignment |

### Alternatives Considered

| Instead of | Could Use | Tradeoff (why rejected) |
|------------|-----------|----------|
| GPUComputationRenderer (ping-pong FBOs) | Raw WebGL2 transform feedback | Transform feedback in three.js requires hand-rolling; GPUComputationRenderer is the official helper, ships in `three/examples/jsm/misc/`, and is what every boid/N-body three.js demo uses. Same WebGL2 floor, less code. |
| GPUComputationRenderer | WebGPU compute (TSL `Fn().compute()`) | WebGPU is unevenly supported in 2026 (Safari WebGPU is still flag-gated as of last public WebKit blog updates; Firefox is enabled only in Nightly). Use as optional layered fast-path; do not require it. |
| THREE.Points | `<Instances>` (drei InstancedMesh) | r3f docs explicitly recommend instancing for "hundreds of thousands"; however for 25k untextured node dots, plain `THREE.Points` + `ShaderMaterial` is faster (1 draw call, per-vertex attributes), avoids the per-instance matrix4 overhead, and pairs cleanly with the GPU-computed position texture. Choose Instances ONLY if individual node geometry becomes non-trivial (textured glyphs, 3D shapes). |
| `<Billboard><Text/></Billboard>` (drei + troika SDF) | DOM overlay (`<Html>`) | DOM-overlay labels are 2D pixels glued to a 3D anchor — they don't occlude or depth-sort against other nodes, which CONTEXT explicitly requires ("depth-sorted, occluded by closer nodes"). Troika SDF text is true 3D mesh. |
| `THREE.LineSegments` for edges | drei `<Line>` per edge | Per-edge `<Line>` is one draw call per edge — fatal at 10k+ edges. Single `LineSegments` with one buffer is the only viable path. |

**Installation:**
```bash
npm install @react-three/fiber@latest @react-three/drei@latest seedrandom
npm install -D @types/seedrandom
```

NOTE: three.js is already at 0.184; r3f v9 needs three ≥ 0.150. drei v10 requires r3f v9. Verify peer ranges at install time.

---

## Architecture Patterns

### Recommended Project Structure

```
app/(dashboard)/users/
├── Sphere3DGraph.tsx              # Top-level component (replaces AccUsersGraph.tsx) — owns props, data fetch, filter panel
├── sphere3d/
│   ├── SphereCanvas.tsx           # <Canvas>, scene root, lighting (minimal), camera, controls
│   ├── PhysicsCompute.tsx         # GPUComputationRenderer wrapper — owns position+velocity textures
│   ├── NodesPoints.tsx            # THREE.Points with vertex shader that reads from position texture
│   ├── EdgesLines.tsx             # THREE.LineSegments — alpha attribute per vertex, hover-driven
│   ├── BillboardLabels.tsx        # Camera-distance LOD label set
│   ├── GpuPicker.ts               # 1x1 render-target picker, decoupled from r3f
│   ├── AutoRotateGroup.tsx        # <group ref> with idle-rotation logic in useFrame
│   ├── radialEncoding.ts          # composite-radial weight function (pure, unit-tested)
│   ├── clusterAssignment.ts       # cluster-id derivation (company-or-role → integer id)
│   ├── deterministicMode.ts       # seeded RNG + replay flag detection
│   ├── shaders/
│   │   ├── positionStep.frag      # GPGPU position update
│   │   ├── velocityStep.frag      # GPGPU velocity update (cluster gravity + edge spring + repulsion)
│   │   ├── nodeRender.vert        # reads position texture by gl_VertexID, sizes/colors per attribute
│   │   ├── nodeRender.frag        # round-disc + glow
│   │   ├── pickRender.vert        # same position read; outputs id as RGB
│   │   └── pickRender.frag        # passthrough id
│   └── __tests__/
│       ├── radialEncoding.test.ts
│       ├── clusterAssignment.test.ts
│       └── gpgpuShape.test.ts     # asserts texture dimensions, attribute layout
└── accGraphFilters.ts             # KEEP — filter predicate
```

### Pattern 1: r3f Canvas inside Next.js App Router page

**What:** r3f's `<Canvas>` is a client component; it ships a `"use client"` directive transitively. The host page (`page.tsx`) is already server-rendered; the existing `UsersDirectoryClient.tsx` is `"use client"` and dynamically mounts the graph in a tab — meaning Sphere3DGraph CAN be a `"use client"` component imported directly; we do not need `next/dynamic` for SSR avoidance because the tab itself is client-only.

**When to use:** Always for r3f inside Next.js App Router. Do not attempt SSR of `<Canvas>`.

**Example:**
```tsx
// Source: /pmndrs/react-three-fiber docs (your-first-scene.mdx)
"use client";
import { Canvas } from "@react-three/fiber";

export function Sphere3DGraph({ users, onSelectUser }: Props) {
  return (
    <Canvas
      frameloop="always"           // physics every frame
      dpr={[1, 2]}                 // cap DPR for perf
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 30], fov: 42, near: 0.05, far: 500 }}
    >
      <SphereScene users={users} onSelectUser={onSelectUser} />
    </Canvas>
  );
}
```

**Critical:** Add `transpilePackages: ['three']` to `next.config.ts` if not already present (verify before plan). Confirmed by r3f installation docs.

### Pattern 2: GPUComputationRenderer for position + velocity

**What:** Two float-RGBA textures (position, velocity) of size `WIDTH × WIDTH` where `WIDTH = ceil(sqrt(nodeCount))`. Each pixel = one node's (x,y,z,_). Each frame: render position shader (reads prev pos+vel, writes new pos), render velocity shader (reads pos+vel + cluster/edge data, writes new vel). Render pass for nodes reads from position texture in vertex shader via `texelFetch`.

**When to use:** Whenever the simulation is O(n) per node per frame AND n > ~2000. For 25k nodes, this is mandatory.

**Example:**
```javascript
// Source: /mrdoob/three.js examples/webgl_gpgpu_birds_gltf.html
function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture(dtPosition);
  fillVelocityTexture(dtVelocity);
  velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShaderSrc, dtVelocity);
  positionVariable = gpuCompute.addVariable('texturePosition', positionShaderSrc, dtPosition);
  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
  // ... uniforms (time, delta, clusterCenters, edge indices uniform texture)
  const err = gpuCompute.init();
  if (err !== null) console.error(err);
}
// Per frame in useFrame:
gpuCompute.compute();
const posTexture = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
nodeMaterial.uniforms.uPositionTexture.value = posTexture;
```

**Cluster gravity wells:** pre-compute a small uniform array of cluster centroids `vec3 uClusterCenters[K]` and per-node `attribute float aClusterId`. Velocity shader pulls each node toward its cluster center with strength `uClusterGravity`. Inter-cluster repulsion is achieved implicitly because each node only pulls toward its own cluster — clusters drift apart naturally; tune with a per-cluster centroid spring keeping clusters at fixed radii from sphere origin if needed.

**Edge attraction:** edges are too many for shader iteration. Two viable patterns:
1. **Per-frame CPU batch**: collect each frame's edge forces on CPU for visible-only edges; this defeats GPU sim — REJECT.
2. **Encode edges as a 1D texture of (sourceIdx, targetIdx)** sampled by the velocity shader, with a per-node "first-edge-index, edge-count" lookup table. Each node iterates its own edges in the shader. Pattern matches `webgpu_compute_cloth.html` spring forces (vertexParamsBuffer with ptrStart/ptrEnd). RECOMMENDED.

### Pattern 3: GPU Picking single-click selection

**What:** Render the scene to an offscreen 1×1 render target with a "picking" material that writes node-id-as-color. Read back the single pixel. Decode RGB→id.

**When to use:** On click. NOT on hover (readback is a CPU sync — costs a frame). For hover we recommend skipping precise picking and using nearest-neighbor on the small visible-near-camera label set.

**Example:**
```javascript
// Source: /mrdoob/three.js manual/examples/picking-gpu.html
class GPUPickHelper {
  constructor() {
    this.pickingTexture = new THREE.WebGLRenderTarget(1, 1);
    this.pixelBuffer = new Uint8Array(4);
  }
  pick(cssPosition, scene, camera) {
    const { pickingTexture, pixelBuffer } = this;
    const pixelRatio = renderer.getPixelRatio();
    camera.setViewOffset(
      renderer.getContext().drawingBufferWidth,
      renderer.getContext().drawingBufferHeight,
      cssPosition.x * pixelRatio | 0,
      cssPosition.y * pixelRatio | 0,
      1, 1,
    );
    renderer.setRenderTarget(pickingTexture);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    camera.clearViewOffset();
    renderer.readRenderTargetPixels(pickingTexture, 0, 0, 1, 1, pixelBuffer);
    return (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | pixelBuffer[2];
  }
}
```

**Adaptation:** instead of swapping materials, render a separate `<Points>` with a pick-shader (same position-texture lookup, color = `vec3((id>>16)&0xff, (id>>8)&0xff, id&0xff)/255.0`). Mount in a separate scene layer; render only on click.

### Pattern 4: Billboard labels with camera-distance LOD

```jsx
// Source: /pmndrs/drei docs (abstractions/billboard.mdx + abstractions/text.mdx)
import { Billboard, Text } from "@react-three/drei";

function NearCameraLabels({ visibleIndices, positions, names, camera }) {
  // useFrame computes the set of indices within LOD radius; mount only those
  return visibleIndices.map(i => (
    <Billboard key={i} position={positions[i]} follow lockX={false} lockY={false} lockZ={false}>
      <Text fontSize={0.5} color="white" anchorX="center">{names[i]}</Text>
    </Billboard>
  ));
}
```

**Critical:** the LOD set must be SMALL (target ≤50 labels visible). At 25k nodes, mounting/unmounting troika Text every frame is expensive — debounce updates to every 4–8 frames, and recycle a fixed pool of `<Text>` instances (mount N=50 once, update `text` + `position` + `visible`).

### Pattern 5: Deterministic replay mode for Playwright

**What:** Same simulation must produce pixel-identical screenshots across runs.

**How:**
1. **Seeded RNG**: all initial-spawn jitter uses `seedrandom('lecg-phase6')`. No `Math.random()` anywhere in the sim path.
2. **Fixed timestep**: when `?replay=1`, ignore `useFrame` delta; advance physics by a constant `1/60` per frame. Run N warm-up frames (e.g., 240 = 4s) before signaling ready.
3. **Ready flag**: window-global `window.__sphere3dReady = true` set after warm-up so Playwright can `page.waitForFunction(() => window.__sphere3dReady)`.
4. **Disable auto-rotate, hide perf HUD** under `?replay=1`.
5. **Fixed DPR**: force `dpr=1` under replay to neutralize device-pixel-ratio drift between machines.

### Pattern 6: r3f frameloop choice

**Decision:** `frameloop="always"`. CONTEXT requires a continuously-running physics sim + auto-rotation + smooth filter reflow. r3f docs' `frameloop="demand"` is for static scenes — not applicable here.

For idle-rotation suspension after long idle, use a CSS visibility check (Page Visibility API) to pause the canvas — handled separately by r3f's `<Canvas>` `frameloop="never"` toggle if tab inactive (this is already the default behavior via `document.hidden`).

### Anti-Patterns to Avoid

- **Mounting 25k `<mesh>` children**: every JSX element is a real `THREE.Object3D` in the scene graph. 25k objects in scene graph = traversal cost dominates. Use one `<points>` + position texture.
- **`<Line>` per edge**: each `<Line>` is a separate draw + shader bind. Use one `<lineSegments>` with a giant buffer.
- **DOM-overlay labels**: do not use drei `<Html>` for labels. CONTEXT requires depth-sorting/occlusion; only 3D text gives that.
- **Hover-triggered GPU picking on every mouse move**: causes per-frame CPU↔GPU sync; tanks fps. Either picking on click only, OR async picking with `gl.readPixels` on a thread (advanced; skip).
- **CPU-side filter loop reading positions from GPU**: filter changes should set per-node `attribute float aVisible` (0/1) and a CPU-side `targetAlpha`; the shader fades; no positions round-trip.
- **`Math.random()` in the simulation path**: kills determinism.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Camera orbit + dolly | Custom mouse/wheel handlers | drei `<OrbitControls>` | Battle-tested; handles damping, pinch, touch, keyboard, modifier keys |
| Camera-facing label transform | Manual `lookAt` per frame | drei `<Billboard>` | Handles `follow`/`lock*` props correctly; integrates with r3f event system |
| SDF text rendering | Canvas-texture text or DOM | drei `<Text>` (troika SDF) | Crisp at any zoom; mesh-based so it depth-sorts |
| BVH-accelerated raycast (if used) | Manual octree | drei `<Bvh>` | Wraps `three-mesh-bvh`; we likely don't need it (GPU picking obviates raycast) |
| GPGPU ping-pong plumbing | Hand-roll FBOs + render-to-texture | `THREE.GPUComputationRenderer` from `three/examples/jsm/misc/GPUComputationRenderer` | The canonical helper; every reference implementation uses it |
| Performance HUD | Custom fps counter | drei `<Stats>` (dev/`?perf=1` only) | Production-shipped fps overlay |
| LOD switching | Manual conditional rendering | drei `<Detailed distances={[...]}>` for per-node | Skip for labels — too many nodes; use Detailed only if individual nodes ever get LOD'd 3D shapes |
| Idle detection | Custom timer | Plain `setTimeout` + pointer/wheel handlers reset — small enough to inline | (Self-correction: no library needed) |
| Seeded RNG | Custom hash-to-unit (we have one in `accGraph3d.ts`) | `seedrandom` | The existing `hashToUnit` is fine for one-shot derivations; for the per-step RNG used in physics jitter, `seedrandom` gives a long-period stream |

**Key insight:** The r3f + drei + three ecosystem is opinionated and complete for this use case. The temptation is to "use raw three.js for control"; resist it. Every primitive Phase 6 needs is in drei or three's `examples/jsm/`. Hand-rolling reinvents the bugs.

---

## Common Pitfalls

### Pitfall 1: r3f Canvas inside a tab that mounts/unmounts

**What goes wrong:** `UsersDirectoryClient.tsx` toggles `activeTab` between `general`, `analysis`, `graph`. When `activeTab !== "graph"`, the canvas unmounts; WebGL context is destroyed; on re-mount a fresh context + fresh GPU upload (25k × 2 textures, edge buffer, ~6 MB) happens. Cold mount latency could spike to seconds.

**Why it happens:** React tears the subtree.

**How to avoid:**
- Option A: wrap with `style={{ display: activeTab === "graph" ? "block" : "none" }}` instead of conditional render. Keeps the canvas mounted. (Recommended.)
- Option B: r3f exposes `<Canvas frameloop="never">` when hidden; pair with display:none and the canvas stays mounted but doesn't burn cycles.

**Warning signs:** First click on "ACC Users Graph" tab takes >1s after the very first.

### Pitfall 2: Safari WebGL2 float-texture readback / point size

**What goes wrong:** Safari (especially on iOS, but also macOS 15.x ANGLE pipeline) historically required `EXT_color_buffer_float` to be explicitly requested for float render targets used by GPUComputationRenderer. Safari also caps `gl_PointSize` lower than Chrome — at ~64 px on some hardware.

**Why it happens:** Safari implements WebGL2 via ANGLE-to-Metal; extension availability and pipeline state differs.

**How to avoid:**
- Always check `renderer.capabilities.isWebGL2 === true` AND `gl.getExtension('EXT_color_buffer_float')` before init.
- For node sizes, drive size in shader by computing `gl_PointSize = clamp(baseSize * (1.0 / distanceToCamera), minSize, maxSize)` — keep `maxSize ≤ 32` to be safe.
- Test on Safari macOS + iOS BEFORE claiming "120fps cross-browser."

**Warning signs:** Empty canvas only on Safari; or nodes render but appear pixel-sized regardless of zoom.

### Pitfall 3: 120fps target on monitors that refresh at 60Hz

**What goes wrong:** "120fps" is meaningful only on a 120Hz+ display. On 60Hz, `requestAnimationFrame` caps at 60. CONTEXT explicitly names 120fps as a hard target.

**Why it happens:** rAF locks to display refresh.

**How to avoid:** Reinterpret 120fps as "frame budget ≤ 8.3ms" — i.e., the sim+render must complete in 8.3ms even though the display only redraws every 16.6ms on 60Hz. This is the actual perf gate. Measure via `performance.now()` deltas inside `useFrame`, not by counting rAF calls. Use drei `<Stats>` or a custom HUD that reports frame-time, not fps.

**Warning signs:** Confused stakeholder UAT where "it's 60fps on my laptop" is reported as a regression.

### Pitfall 4: Edge buffer size when nodes are filtered out

**What goes wrong:** Filtering hides 80% of nodes; edges that touch hidden nodes should also hide. If the edge `LineSegments` buffer is rebuilt on every filter change, GC churn + GPU upload latency makes filter changes feel sluggish.

**How to avoid:** Allocate the edge alpha buffer at max size once; on filter change, write 0 alpha for hidden-endpoint edges (don't rebuild the buffer). `bufferAttribute.needsUpdate = true` + the existing buffer.

**Warning signs:** Filter changes jank > 100ms; profiler shows large `setAttribute`/`createBufferAttribute` calls.

### Pitfall 5: GPUComputationRenderer texture size != node count

**What goes wrong:** GPUComputationRenderer requires square textures: `WIDTH × WIDTH`. If `nodeCount = 25559`, `WIDTH = ceil(sqrt(25559)) = 160`, capacity = 25600. The 41 extra texels are "ghost" nodes — they MUST be initialized to a position outside the sphere and their cluster id set so they're never rendered, or their stale velocities can perturb cluster centroids if cluster centroids are recomputed from positions.

**How to avoid:** Set `aClusterId = -1` for unused texels and skip them in the velocity shader with an early return. Set `aVisible = 0` so the node shader culls them via `gl_Position = vec4(0,0,2,1)` (outside clip space) + `discard` in fragment.

**Warning signs:** Cluster centers drift toward (0,0,0) over time; mysterious dim points appear at sphere center.

### Pitfall 6: r3f v9 + React 19 + Three.js peer ranges

**What goes wrong:** r3f v9 is the React 19 line. drei v10 is paired. drei v9 requires r3f v8 + React 18. Mixing versions causes "two copies of three" warnings and broken context propagation.

**How to avoid:** Pin to r3f v9.x + drei v10.x at install time; verify only one `three` is in `node_modules` (`npm ls three`). Add `three` to `peerDependenciesMeta` overrides if drei pulls a different minor.

**Warning signs:** Runtime warning "Multiple instances of three.js found"; `<Billboard>` doesn't follow the camera.

### Pitfall 7: Cosmos.gl removal cascade

**What goes wrong:** Deleting `@cosmos.gl/graph` from package.json without also removing the patch and the `postinstall: patch-package` invocation will fail every CI build. The patch references a non-existent `node_modules/@cosmos.gl/graph/dist/index.js` after the dep is gone.

**How to avoid:** Delete in this order: (1) patch file `patches/@cosmos.gl+graph+3.0.0-beta.9.patch`, (2) cosmos imports in code, (3) `@cosmos.gl/graph` from `package.json`, (4) verify `patches/` is empty — if so, remove `&& patch-package` from `postinstall` (or replace with `patch-package` no-op friendly).

### Pitfall 8: Deterministic mode race with auto-rotation

**What goes wrong:** Even with seeded RNG and fixed timestep, the auto-rotation kicks in based on `Date.now()` idle measurement — non-deterministic across machines.

**How to avoid:** Under `?replay=1`, auto-rotation is OFF entirely. Test it under a separate Playwright spec with the flag absent.

---

## Code Examples

Verified patterns from official sources.

### 1. r3f Canvas (Next.js App Router, client component)

```tsx
// Source: /pmndrs/react-three-fiber getting-started + scaling-performance
"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";

export function SphereCanvas({ children }: { children: React.ReactNode }) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 30], fov: 42, near: 0.05, far: 500 }}
    >
      {children}
      <OrbitControls
        enableDamping
        dampingFactor={0.075}
        minDistance={0}
        maxDistance={120}
      />
      {process.env.NODE_ENV === "development" && <Stats />}
    </Canvas>
  );
}
```

### 2. GPUComputationRenderer init (boid-style; adapt for cluster gravity)

```javascript
// Source: /mrdoob/three.js examples/webgl_gpgpu_birds_gltf.html
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";

function initCompute(renderer, nodeCount, edges, clusters) {
  const WIDTH = Math.ceil(Math.sqrt(nodeCount));
  const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  if (!renderer.capabilities.isWebGL2) {
    throw new Error("WebGL2 required for Phase 6");
  }
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture(dtPosition, nodeCount, clusters); // composite-radial seed
  fillVelocityTexture(dtVelocity, nodeCount);            // zeros + small jitter

  const velVar = gpuCompute.addVariable("textureVelocity", velocityShader, dtVelocity);
  const posVar = gpuCompute.addVariable("texturePosition", positionShader, dtPosition);
  gpuCompute.setVariableDependencies(velVar, [posVar, velVar]);
  gpuCompute.setVariableDependencies(posVar, [posVar, velVar]);

  velVar.material.uniforms.uDelta = { value: 0 };
  velVar.material.uniforms.uClusterCenters = { value: clusters.centers }; // vec3[K]
  velVar.material.uniforms.uClusterGravity = { value: 0.6 };
  velVar.material.uniforms.uRepulsion = { value: 0.2 };
  velVar.material.uniforms.uEdgeSpring = { value: 0.4 };
  velVar.material.uniforms.uEdgeIndexTex = { value: edges.indexTexture };
  velVar.material.uniforms.uEdgeLookupTex = { value: edges.lookupTexture };
  velVar.material.defines.NODE_COUNT = nodeCount;

  const err = gpuCompute.init();
  if (err) throw new Error(`GPUComputationRenderer init failed: ${err}`);
  return { gpuCompute, posVar, velVar };
}
```

### 3. THREE.Points reading from position texture (vertex shader sketch)

```glsl
// nodeRender.vert
uniform sampler2D uPositionTexture;
uniform float uTextureWidth;
attribute float aNodeIndex;
attribute float aVisible;
attribute vec3 aColor;
varying vec3 vColor;
varying float vVisible;

void main() {
  float idx = aNodeIndex;
  float u = mod(idx, uTextureWidth) / uTextureWidth;
  float v = floor(idx / uTextureWidth) / uTextureWidth;
  vec4 pos = texture(uPositionTexture, vec2(u, v));
  vec4 mv = modelViewMatrix * vec4(pos.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  // distance-based size, clamped for Safari
  gl_PointSize = clamp(120.0 / -mv.z, 2.0, 24.0);
  vColor = aColor;
  vVisible = aVisible;
}
```

### 4. GPU picking helper (adapt to r3f via `useThree`)

See Pattern 3 above. In r3f:

```tsx
// Source: derived from /mrdoob/three.js manual/examples/picking-gpu.html + r3f useThree
import { useThree } from "@react-three/fiber";

function useGpuPicker(pickScene: THREE.Scene) {
  const { gl, camera, size } = useThree();
  const targetRef = useRef(new THREE.WebGLRenderTarget(1, 1));
  const bufferRef = useRef(new Uint8Array(4));
  return useCallback((cssX: number, cssY: number): number => {
    const dpr = gl.getPixelRatio();
    camera.setViewOffset(gl.domElement.width, gl.domElement.height,
      Math.floor(cssX * dpr), Math.floor(cssY * dpr), 1, 1);
    gl.setRenderTarget(targetRef.current);
    gl.render(pickScene, camera);
    gl.setRenderTarget(null);
    camera.clearViewOffset();
    gl.readRenderTargetPixels(targetRef.current, 0, 0, 1, 1, bufferRef.current);
    const b = bufferRef.current;
    return (b[0] << 16) | (b[1] << 8) | b[2];
  }, [gl, camera, pickScene]);
}
```

### 5. Composite-radial seed function (pure, unit-testable)

```typescript
// sphere3d/radialEncoding.ts
// Per CONTEXT: distance from center = weighted combination of activity, role/seniority, connectedness
import type { AccGraphNode } from "@/lib/acc/graphSnapshot";

const WEIGHTS = {
  activity: 0.4,    // lastSignIn recency → closer-to-center when active
  seniority: 0.3,   // isAdmin or accessLevels.projectAdmin → toward center
  connectedness: 0.3, // projects.length proxy → toward center
};

export function radialDistance(node: AccGraphNode, refNow = Date.now()): number {
  const activity = node.lastSignIn
    ? clamp01(1 - (refNow - new Date(node.lastSignIn).getTime()) / (1000 * 60 * 60 * 24 * 90))
    : 0;
  const seniority = node.isAdmin ? 1 : node.individualAccess ? 0.5 : 0.2;
  // connectedness: needs caller to inject precomputed degree
  const score = activity * WEIGHTS.activity + seniority * WEIGHTS.seniority + 0 * WEIGHTS.connectedness;
  // Map [0..1] → [outerRadius..innerRadius]; tighter cluster as score increases
  const outer = 1.0;
  const inner = 0.15;
  return outer - score * (outer - inner);
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
```

### 6. Auto-rotation with idle reset

```tsx
function AutoRotateGroup({ children, idleMs = 3000, speed = 0.04 }: Props) {
  const ref = useRef<THREE.Group>(null);
  const lastInputRef = useRef(performance.now());
  const { gl } = useThree();
  useEffect(() => {
    const bump = () => { lastInputRef.current = performance.now(); };
    const el = gl.domElement;
    el.addEventListener("pointerdown", bump);
    el.addEventListener("wheel", bump);
    return () => {
      el.removeEventListener("pointerdown", bump);
      el.removeEventListener("wheel", bump);
    };
  }, [gl.domElement]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (performance.now() - lastInputRef.current > idleMs) {
      ref.current.rotation.y += delta * speed;
    }
  });
  return <group ref={ref}>{children}</group>;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2D Cosmos.gl + Canvas2D fallback + experimental three Points | r3f + drei + GPUComputationRenderer | Phase 6 (now) | Single 3D path; remove dual-renderer machinery; drop 2300 LOC of conditional logic |
| `<Instances>` for thousands of objects | `THREE.Points` + position-texture lookup for 10k+ | r3f community has long preferred Points at this scale; r3f docs still recommend Instances "for 100k+ identical" but for untextured graph dots Points is faster | Lower draw count, lower memory |
| WebGL1 + d3-force CPU layout | WebGL2-floor + GPGPU | The codebase's own v1.0 Phase 02-05 already moved physics to GPU (Cosmos native). Phase 6 carries forward GPU-physics floor. | Removes the canvas2d fallback path entirely |
| Auth-style camera offset for picking | Same pattern (still current) | Unchanged | The 1×1 picking-target pattern is still the three.js manual's blessed approach in 2026 |
| `troika-3d-text` direct | drei `<Text>` (wraps troika) | Drei is now the standard | Better SSR/r3f integration |

**Deprecated/outdated:**
- 3d-force-graph wrapper libs — CONTEXT explicitly forbids; insufficient customization.
- React Three's old non-`use-client` patterns — not applicable; the codebase is already client-component-aware.
- `frameloop="demand"` for static scenes — not applicable to a continuous physics + auto-rotate scene.

---

## Open Questions

### 1. Where does cluster identity come from?

**What we know:** CONTEXT says "each company/role acts as its own gravity well." Schema-wise, every node has `companyRole: string | null` and `roles: string[]`. The existing `buildClusterIdsFromNodes(rawNodes, "role")` in `cosmosUtils.ts` returns an integer per node keyed on first role.
**What's unclear:** Should the cluster be company (organizational scope) or role (functional scope)? CONTEXT says "each company/role" — ambiguous. If both, do we need TWO sets of gravity wells (orthogonal axes)?
**Recommendation:** Pick ONE primary clustering axis at plan-time (recommend `companyRole` because it tends to have richer color-already and cleaner counts; fall back to first `role` when null). Document the choice as a tunable param in the dev panel. Defer multi-axis clustering to a follow-up phase.

### 2. Edge-count budget under filters

**What we know:** Snapshot emits `edges: []` server-side; client builds edges via `buildAccTopologyGraph`. The existing `ACC_GRAPH_3D_MAX_EDGES = 1500` was the experimental three3d cap.
**What's unclear:** What's the real edge count at 25k nodes after `buildAccTopologyGraph`? If it's >100k, edge-iteration in the velocity shader is the perf bottleneck.
**Recommendation:** Add a `console.log(topology.links.length)` instrumented run during Plan 1 prototyping. Cap per-node edges to top-N by weight if total > 100k.

### 3. Does the user dashboard tab actually unmount?

**What we know:** `UsersDirectoryClient.tsx` conditionally renders the `<AccUsersGraph>` (Pitfall 1). Cold-mount cost of GPGPU init is non-trivial.
**What's unclear:** Whether users tab-switch often enough to feel this.
**Recommendation:** Render conditionally to display:none, not conditional mount. Confirms in early UAT.

### 4. 120fps target — measurement convention

**What we know:** CONTEXT says 120fps is hard.
**What's unclear:** On a 60Hz monitor, this is impossible; on a 120Hz monitor, it's the rAF cap; on a 240Hz, it's the floor.
**Recommendation:** Operationalize as "frame-time ≤ 8.0ms p95 on a reference rig (M-series Mac or RTX 3060+ desktop) with the production-scale dataset (~25k nodes)." Measure via drei `<Stats>` + manual `performance.now()` deltas; record p50/p95 frame-time in the phase verification doc.

### 5. WebGPU path — when to attempt

**What we know:** CONTEXT marks WebGPU as "optional fast-path."
**What's unclear:** Adoption status of WebGPU on Safari macOS 15.x and current Firefox stable. Safari shipped initial WebGPU support to Safari Technology Preview but stable Safari adoption is ongoing in 2026; Firefox enabled WebGPU on Windows in 2025 but Linux/macOS lag.
**Recommendation:** Ship Phase 6 with WebGL2 path only. Defer WebGPU to a follow-up phase explicitly, after WebGL2 frame-time numbers are known. Add a `feature-detect` stub: `if (navigator.gpu)` log to console; do NOT branch the rendering path.

### 6. Replay-mode warm-up duration

**What we know:** Physics must reach a visually stable state before Playwright screenshots.
**What's unclear:** How many fixed-timestep steps to convergence with cluster gravity + edges + repulsion at 25k nodes.
**Recommendation:** Start with 240 steps (4s @ 60fps); tune empirically via a `bin/sphere3d-warmup-probe.ts` Vitest harness that runs the velocity shader on CPU JS port and reports kinetic-energy half-life.

### 7. Bundle size budget

**What we know:** three @0.184 is already loaded for the experimental 3D path. r3f + drei + GPUComputationRenderer adds ~70–120 KB gzipped.
**What's unclear:** Whether the existing `import("three")` pre-warm in `AccUsersGraph.tsx:1167` ships three on every Users-tab load.
**Recommendation:** Lazy-load the entire `Sphere3DGraph` component via Next.js `dynamic(() => import("./Sphere3DGraph"), { ssr: false })` so three+r3f+drei only loads when the user navigates to `/users`. Already client-rendered, but dynamic() guarantees code-split chunking.

---

## Sources

### Primary (HIGH confidence)

- `/pmndrs/react-three-fiber` (Context7) — getting-started/your-first-scene.mdx, advanced/scaling-performance.mdx, advanced/pitfalls.mdx, getting-started/installation.mdx, API/events.mdx
- `/pmndrs/drei` (Context7) — abstractions/billboard.mdx, abstractions/text.mdx, performances/instances.mdx, performances/bvh.mdx, performances/detailed.mdx, misc/stats.mdx, gizmos/transform-controls.mdx
- `/mrdoob/three.js` (Context7) — examples/webgl_gpgpu_birds_gltf.html (GPUComputationRenderer canonical init), examples/webgpu_compute_cloth.html (spring-force compute pattern, applicable to edge attraction via index buffer), examples/webgpu_compute_particles.html, examples/webgpu_compute_points.html, manual/examples/picking-gpu.html (GPUPickHelper), manual/examples/indexed-textures-picking-and-highlighting.html, manual/en/indexed-textures.html
- Codebase: `app/(dashboard)/users/AccUsersGraph.tsx`, `app/(dashboard)/users/UsersDirectoryClient.tsx`, `app/(dashboard)/users/accGraph3d.ts`, `app/(dashboard)/users/threeGraphRenderer.ts`, `app/(dashboard)/users/cosmosUtils.ts`, `lib/acc/graphSnapshot.ts`, `package.json`, `patches/@cosmos.gl+graph+3.0.0-beta.9.patch`, `.planning/PROJECT.md` (25k node target), `.planning/debug/02-05-gpu-physics-grey-canvas.md` (25,559 confirmed instance count)

### Secondary (MEDIUM confidence)

- Browser WebGL2 / WebGPU adoption status in 2026 (no fresh fetch performed for this research; flagged in Open Question 5 — verify with `caniuse.com/webgl2` and `caniuse.com/webgpu` before WebGPU path is committed).

### Tertiary (LOW confidence)

- None relied upon in this document.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — r3f + drei + GPUComputationRenderer is the documented, official, current-2026 path; Context7 sources are pmndrs/mrdoob first-party.
- Architecture: HIGH for individual patterns (each verified against three.js examples); MEDIUM on integration risk (compositional bugs only surface in the prototype).
- 120fps at 25k nodes: MEDIUM — three.js Points + GPGPU regularly hits 60fps at 100k+ in published demos, but those rarely include cluster gravity + edge springs simultaneously. Real measurement gates this.
- GPU picking: HIGH — pattern unchanged for ~7 years; three.js manual's canonical implementation.
- Pitfalls: HIGH — drawn from official docs + codebase-specific knowledge (cosmos.gl removal cascade, tab unmount, replay determinism).
- Deterministic replay: MEDIUM — pattern is industry-standard but specific warm-up tuning is empirical.

**Research date:** 2026-05-11
**Valid until:** ~2026-08-11 (90 days; r3f/drei minor releases happen monthly but breaking changes only at majors)
