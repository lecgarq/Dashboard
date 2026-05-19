# Technology Stack: Spatial Graph Engine

**Project:** LECG Dashboard — Access Analysis Graph Redesign
**Researched:** 2026-05-19
**Dimension:** Graph engine + math + rendering layer only (host app stack is fixed)

---

## Recommendation: react-force-graph (ForceGraph2D + ForceGraph3D)

**Primary engine:** `react-force-graph` v1.48.2 / `react-force-graph-2d` v1.29.1 / `react-force-graph-3d` v1.29.1

**Confidence: HIGH** (verified via npm, GitHub, official README)

---

## Recommended Stack

### Core Graph Engine

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-force-graph-2d | 1.29.1 | Default 2D canvas rendering | HTML5 Canvas; custom `nodeCanvasObject` for lasso overlay; `d3Force()` API for composite forces |
| react-force-graph-3d | 1.29.1 | 3D WebGL orbit mode | ThreeJS/WebGL; identical prop interface to 2D; `nodeThreeObject` for custom sprites |
| d3-force-3d | 3.x | Physics simulation (shared) | Drop-in replacement for d3-force; supports `numDimensions(2|3)`; composable named forces |
| d3-force-cluster-3d | latest | Cluster attractor force | Semantic seed positioning — pulls nodes toward cluster centroid by weight |

### Math and Layout

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| d3-force-3d | 3.x | All force simulation | `simulation.force("name", fn)` — add/remove/reweight named forces at runtime without restart |
| d3-scale | 3.x | Parameter normalization | Map raw DC values (activity counts, last sign-in days, file ops) to 0–1 force weights |
| d3-force-cluster-3d | — | Cluster attractors | Compatible with d3-force-3d's 3D coordinate space |

### Lasso Selection

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom canvas overlay | n/a | Freehand lasso on ForceGraph2D | `onBackgroundClick` + mousedown/mousemove on the canvas element; polygon-in-point test (`ray casting`) against frozen `node.x/y` positions |
| d3-lasso (reference) | — | Optional reference impl | Observable example exists; not a required dep — roll 200-line canvas overlay instead |

> Lasso is NOT natively in react-force-graph (issue #520, open as of 2026). Custom overlay on the Canvas 2D context is the correct path. In 3D mode lasso is replaced by an orbit camera + click selection list.

### Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| HTML5 Canvas (ForceGraph2D) | browser native | 2D mode rendering | `nodeCanvasObject` callback gives direct 2D ctx access — pixel-perfect lasso, custom ring highlights |
| Three.js (ForceGraph3D) | 0.184.0 | 3D mode rendering | Already in the project (`three@^0.184.0` in package.json); no extra install |
| react-force-graph-3d | 1.29.1 | React wrapper for ThreeJS graph | Identical API to 2D; three-forcegraph under the hood |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| d3-scale-chromatic | 3.x | Node color mapping | Role/permission tier color encoding |
| gl-matrix | 3.x | Optional vec2/vec3 math | Only if custom force math needs SIMD-style ops; d3-force-3d is sufficient otherwise |

---

## Alternatives Considered and Rejected

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Graph engine | react-force-graph | **cosmos.gl / @cosmos.gl/graph** | **2D ONLY** — confirmed no 3D rendering support (v2.6.1, v3.0). The project's 2D↔3D switch requirement is a hard blocker. Also: `getSimulationAlpha()` inversion bug (1 - progress) is already a known cost. Switching away removes that gotcha |
| Graph engine | react-force-graph | **sigma.js + graphology** | 2D only — sigma.js explicitly has no 3D mode. Docs themselves say "use react-force-graph if you need 3D." Lasso also custom. Good library, wrong dimension set |
| Graph engine | react-force-graph | **reagraph** v4.30.8 | Has 2D + 3D + native lasso. BUT: built on @react-three/fiber v9.5+; adds large peer-dep surface (r3f + drei + zustand) to a codebase that doesn't use r3f. Custom force weighting is constrained — `edgeWeightInfluence` only; no direct `simulation.force()` access for composite dimension blending. Less control for the slider math layer |
| Graph engine | react-force-graph | **deck.gl** | Not a force-directed graph engine — it's a geospatial layer renderer. Requires building physics simulation from scratch on top. No force layout out-of-the-box |
| Graph engine | react-force-graph | **vis.js Network** | Canvas/SVG hybrid; documented performance issues with large node counts; React integration via deprecated react-vis-network. No 3D. Avoid |
| Graph engine | react-force-graph | **Custom Three.js + d3-force-3d** | Maximum flexibility but 4–8x more implementation work. The slider/force composition layer is the same (d3-force-3d) — react-force-graph wraps Three.js already so you get both without the boilerplate |
| Physics engine | d3-force-3d | **ngraph.forcelayout3d** | Barnes-Hut O(n log n) is faster for 100k+ nodes. At our target of ~5–10k (user×project instances), d3-force-3d is within budget. ngraph's API is less ergonomic for runtime force weight mutation — the slider math requires dynamically adjusting named force strengths mid-simulation |
| Lasso | Custom canvas | **Built-in react-force-graph lasso** | Does not exist (issue #520 unresolved as of 2026-05-19) |

---

## 2D ↔ 3D Continuity — Concrete Path

This is the most architecturally critical decision. Here is the **exact mechanism**, not hand-waving:

### How react-force-graph stores positions

The `graphData` object is mutated by the d3-force-3d simulation. After stabilization, each node object carries:
```
node.x, node.y          // 2D (and 3D planar projection)
node.z                  // 3D only (undefined in 2D mode)
node.vx, node.vy, node.vz   // velocities
node.fx, node.fy, node.fz   // fixed positions (override simulation)
```

These are written **in-place** on the same node objects that were passed to `graphData.nodes`. The object reference is preserved across React renders.

### Switch procedure

```
1. Start in ForceGraph2D with graphData reference stored in React state/ref.
2. On "Switch to 3D" click:
   a. Call graphRef.current.pauseAnimation()  (ForceGraph2D method)
   b. Copy node.x → fx, node.y → fy for every node  (freeze positions)
   c. Initialize node.z = 0 (or a seeded z from a DC parameter)
   d. Mount ForceGraph3D with the SAME graphData object reference
   e. Wait 1 frame, then clear fx/fy/fz → let 3D simulation warm up
      from the preserved x/y as initial positions (z = 0 spread)
   f. After 3D settles (onEngineStop), positions become the 3D home positions.

3. On "Switch to 2D" click:
   a. Freeze 3D positions: fx = node.x, fy = node.y, fz = node.z
   b. Mount ForceGraph2D — nodes land exactly where they were in 3D (projected)
   c. Optionally re-heat simulation to re-flatten z drift
```

### Key insight

Because both ForceGraph2D and ForceGraph3D use d3-force-3d internally, and because they both mutate the same node objects, node identity is preserved by JavaScript object reference — no mapping, no ID lookup, no flicker. The position data lives on the node objects themselves.

### What NOT to do

Do not unmount/remount with a new `graphData` object — this resets all positions. Keep a single `graphDataRef` and pass the same reference to whichever component is currently mounted.

---

## Dimension Slider Math — How Composite Forces Work

### Architecture

Each dimension (activity, last-sign-in, file-ops, folder-tier, permission-tier) is a **named custom force** registered with the d3 simulation:

```typescript
// Pseudocode — full implementation in graph math layer
simulation
  .force('cluster-activity',    forceCluster(centroids.activity)    .strength(sliderActivity    * WEIGHT_SCALE))
  .force('cluster-signin',      forceCluster(centroids.signIn)      .strength(sliderSignIn      * WEIGHT_SCALE))
  .force('cluster-fileops',     forceCluster(centroids.fileOps)     .strength(sliderFileOps     * WEIGHT_SCALE))
  .force('cluster-foldertier',  forceCluster(centroids.folderTier)  .strength(sliderFolderTier  * WEIGHT_SCALE))
  .force('cluster-permission',  forceCluster(centroids.permission)  .strength(sliderPermission  * WEIGHT_SCALE))
  .force('charge',              d3.forceManyBody().strength(-30))   // repulsion baseline
  .force('center',              d3.forceCenter())
```

### Slider update (no restart)

```typescript
function onSliderChange(dimension: string, value: number) {
  const force = graphRef.current.d3Force(`cluster-${dimension}`)
  if (force) {
    force.strength(value * WEIGHT_SCALE)
    graphRef.current.d3ReheatSimulation()  // re-heat alpha, not a full restart
  }
}
```

This is continuous blending — all forces compose at every tick. Setting activity slider to 100 and sign-in slider to 50 means both forces act simultaneously at their respective strengths. No modal switching. Physics settles to the weighted superposition.

### Semantic seed positions

Centroid positions are derived from DC parameters pre-computed via DuckDB-WASM queries (already wired in graphSql.ts). Each cluster centroid is a 2D/3D point computed from the distribution of DC values.

Example: nodes with high activity counts get a centroid placed in a region of the canvas determined by ranking; the cluster force pulls them toward that centroid proportional to slider weight.

---

## Performance Ceiling for ~10k Nodes

| Scenario | Expected FPS | Notes |
|----------|-------------|-------|
| 2D, 5k nodes, settled (cooldown) | 60 fps | Canvas draws only dirty region; no simulation cost once frozen |
| 2D, 5k nodes, active simulation | 20–40 fps | d3-force-3d O(n log n) with Barnes-Hut; acceptable during physics warmup |
| 2D, 10k nodes, active simulation | 10–20 fps | Noticeable but workable — use `warmupTicks` to pre-run off-screen |
| 3D, 5k nodes, settled | 60 fps | Three.js WebGL; GPU bound, not CPU |
| 3D, 10k nodes, active simulation | 15–30 fps | Three.js geometry overhead; use `nodeThreeObject` with instanced meshes |
| 3D, 10k nodes + custom sprites | 10–20 fps | Acceptable; upgrade to ngraph if this becomes a blocker |

**Confidence: MEDIUM** (no direct benchmark run; based on documented cosmos.gl "hundreds of thousands on GPU" vs react-force-graph community reports of 10k being workable on d3-force-3d)

**Mitigation strategies:**
- Use `cooldownTicks: 150` + `warmupTicks: 50` — pre-run simulation, render only after settling
- Freeze positions when simulation finishes (`onEngineStop`) — zero CPU cost at rest
- Filter nodes before passing to graphData (DuckDB-WASM WHERE clause) — keep active set < 5k
- If 10k nodes + active simulation proves too slow: switch to `forceEngine: 'ngraph'` (drop-in swap in react-force-graph via the `forceEngine` prop) — no architecture change required

---

## Why NOT Cosmograph / cosmos.gl

The incumbent engine (currently `@cosmos.gl/graph@3.0.0-beta.9`) has two disqualifying limitations for this project:

1. **2D only** — cosmos.gl is a GPU-accelerated 2D-only renderer. No 3D support exists or is planned (confirmed from official docs and GitHub). The 2D↔3D switching requirement is a stated must-have and cosmos.gl cannot satisfy it.

2. **No direct simulation API** — cosmos.gl runs its force simulation entirely on the GPU in GLSL shaders. You cannot inject named custom forces or adjust their strengths at runtime. Implementing the dimension sliders requires mutation of force strengths per tick — impossible in the GPU-shader model without recompiling shaders.

3. **Known inversion bug cost** — `getSimulationAlpha()` returns `1 - progress` (opposite of d3 alpha). This gotcha is already documented in project memory (cosmos_alpha_inversion) and cost real debugging time. Switching eliminates this class of bug.

4. **Beta stability** — v3.0.0-beta.9 is pre-release. The project needs stable production behavior for a demo deadline.

---

## Installation

```bash
# Remove incumbent
npm uninstall @cosmos.gl/graph

# Install graph engine
npm install react-force-graph-2d@1.29.1 react-force-graph-3d@1.29.1

# d3-force-3d (likely already present transitively; pin explicitly)
npm install d3-force-3d

# Cluster force for semantic positioning
npm install d3-force-cluster-3d

# three is already in package.json at ^0.184.0 — no action needed
```

> Note: `react-force-graph` (the meta-package) re-exports all four variants. Install `react-force-graph-2d` and `react-force-graph-3d` directly to avoid importing all four.

---

## Next.js App Router Compatibility

Both ForceGraph2D and ForceGraph3D are browser-only (Canvas / WebGL). They must live inside a `'use client'` component. Pattern:

```typescript
// app/(dashboard)/users/access-analysis/SpatialGraph.tsx
'use client'
import dynamic from 'next/dynamic'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })
```

This is identical to how the existing cosmos.gl component is gated. No architecture change needed for Next.js integration.

---

## Sources

- [react-force-graph GitHub (vasturiano)](https://github.com/vasturiano/react-force-graph) — HIGH confidence, official repo
- [react-force-graph npm (v1.48.2)](https://www.npmjs.com/package/react-force-graph) — HIGH confidence, verified current version
- [react-force-graph-2d npm (v1.29.1)](https://www.npmjs.com/package/react-force-graph-2d) — HIGH confidence
- [react-force-graph-3d npm (v1.29.1)](https://www.npmjs.com/package/react-force-graph-3d) — HIGH confidence
- [Lasso tool issue #520 (open, unresolved)](https://github.com/vasturiano/react-force-graph/issues/520) — HIGH confidence, confirmed gap
- [cosmos.gl graph GitHub — 2D only confirmed](https://github.com/cosmosgl/graph) — HIGH confidence
- [d3-force-3d GitHub (vasturiano)](https://github.com/vasturiano/d3-force-3d) — HIGH confidence
- [reagraph npm (v4.30.8)](https://www.npmjs.com/package/reagraph) — HIGH confidence, verified
- [sigma.js — no 3D, use react-force-graph for 3D](https://www.sigmajs.org/) — HIGH confidence, docs confirm
- [Lasso implementation reference (gist)](https://gist.github.com/lorenzopub/a6d1c38ce650322da807432b3cd6e68a) — MEDIUM confidence
- [d3-force-cluster-3d npm](https://www.npmjs.com/package/d3-force-cluster-3d) — MEDIUM confidence (verify version before install)
- Project memory: cosmos_alpha_inversion — HIGH confidence (first-hand experience)

---

*Research complete: 2026-05-19*
