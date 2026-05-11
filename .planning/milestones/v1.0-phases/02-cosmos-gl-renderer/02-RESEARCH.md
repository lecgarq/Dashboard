# Phase 2: Cosmos.gl Renderer - Research

**Researched:** 2026-04-28
**Domain:** GPU-accelerated graph rendering with @cosmos.gl/graph, WebGL2 feature detection, React integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Renderer Toggle**
- Located in the toolbar / top bar — always accessible to power users
- Displayed as a labeled button: "Canvas 2D / GPU" — user always knows which mode is active
- Show a loading spinner overlay while the GPU renderer initializes (shaders, data transfer)
- Persist the renderer choice to localStorage — next visit defaults to the last-used renderer
- Detect WebGL2 support at startup; if unsupported, hide the toggle entirely (no disabled state, no explanation shown)

**Physics Controls Panel**
- Collapsible side panel / drawer — out of the way when not needed
- Panel is only visible when GPU renderer is active (hidden in Canvas 2D mode)
- Physics slider values (repulsion, link spring, gravity) are persisted to localStorage
- Reset to defaults button: Claude's discretion

**Node & Edge Visual Identity**
- Node colors: Match existing Canvas 2D colors exactly — consistent experience when switching renderers
- Edge weight shown via color variation by relationship type (not thickness)
- Node size scales with connection count — larger nodes for higher-degree nodes
- Node labels hidden by default, shown on hover — keeps large graphs readable
- Click interactions same as Canvas 2D (node selection, details panel, etc.)
- Small legend in a corner showing which color corresponds to which node type (User / Project / Role / Module)

**WebGL2 Fallback**
- If WebGL2 is unsupported: silently stay on Canvas 2D, hide the GPU toggle — no disruption, no error message
- If WebGL context error occurs mid-session (e.g., GPU out of memory): auto-fall back to Canvas 2D with a brief error toast notification
- WebGL2 detection runs at startup (not deferred to toggle click)

### Claude's Discretion
- Reset to defaults button design and placement in physics panel
- Exact toast message wording for mid-session GPU context failures
- Specific localStorage key naming conventions

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REND-01 | User can switch to GPU-accelerated Cosmos.gl renderer for graphs with 500+ nodes — `CosmosGraphRenderer` class implementing the existing `GraphRenderer` interface | `@cosmos.gl/graph` Graph class wraps into the existing `GraphRenderer` interface; `setPointPositions` + `setLinks` feed data from `GraphRenderFrame`; `setConfigPartial` enables live physics updates |
| REND-02 | User can adjust physics simulation parameters (repulsion, link spring, gravity) in real-time via sliders — bound to Cosmos.gl `setConfigPartial()` live | `setConfigPartial({ simulationRepulsion, simulationLinkSpring, simulationGravity })` applies immediately without restarting the simulation; maps directly to slider state |
| REND-03 | User can visually distinguish User, Project, Role, and Module nodes and their relationship types — four node colors, three edge color/weight mappings | `setPointColors(Float32Array)` with per-node RGBA values; `setLinkColors(Float32Array)` with per-edge RGBA values; colors match existing Canvas 2D palette |
| REND-04 | User receives a working Canvas 2D graph when the browser does not support WebGL2 — existing `CanvasGraphRenderer` remains as fallback; dual-canvas pattern preserved | WebGL2 detection via `canvas.getContext('webgl2')`; if null, hide toggle and stay on Canvas 2D — no Cosmos.gl import needed in that code path |
</phase_requirements>

---

## Summary

The existing codebase already has a clean `GraphRenderer` interface (`backend`, `draw(frame)`, `destroy()`) and a dual-canvas DOM pattern in `AccUsersGraph.tsx`. The `WebGpuGraphRenderer` stub (currently returns `null` immediately) needs to be replaced by a real `CosmosGraphRenderer` that wraps `@cosmos.gl/graph`. The renderer toggle, physics panel, and WebGL2 detection are all new UI pieces sitting on top of this existing architecture.

`@cosmos.gl/graph` v2.6.1 (latest stable, npm package `@cosmos.gl/graph`) accepts data via `setPointPositions(Float32Array)` for node positions, `setPointColors(Float32Array)` for per-node RGBA colors, `setLinks(Float32Array)` for edges as flat index pairs, and `setLinkColors(Float32Array)` for per-edge RGBA. Physics can be tuned live via `setConfigPartial({ simulationRepulsion, simulationLinkSpring, simulationGravity })` without restarting the simulation. The library is async-init but queues all method calls until ready, so the wrapper pattern is straightforward.

The key integration challenge is that Cosmos.gl owns its own canvas and render loop, which conflicts with the existing RAF-driven `draw(frame)` pattern. The `CosmosGraphRenderer` must either (a) disable Cosmos's own RAF loop and drive it manually from the existing loop, or (b) let Cosmos render autonomously and only push data updates on change. Pattern (b) is recommended — Cosmos manages GPU rendering, the React component pushes data diffs. The existing `backend` check (`renderBackend === "webgpu"`) and opacity toggling between the two canvases is already in the JSX and just needs the string changed to `"cosmos"`.

**Primary recommendation:** Implement `CosmosGraphRenderer` as a thin adapter class that owns a Cosmos `Graph` instance, feeds it data on every `draw()` call delta-checking for changes, and exposes `setPhysicsConfig()` for live slider updates. Detect WebGL2 at startup with `document.createElement('canvas').getContext('webgl2')` — if `null`, mark the class as unavailable before installing.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @cosmos.gl/graph | 2.6.1 (latest stable) | GPU-accelerated WebGL2 force graph rendering | Official package; v2.6.1 is the latest stable release; v3.0 is in beta (v3.0.0-beta.8 on main) — avoid beta for production |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | All other UI components use existing stack | Tailwind, Radix, framer-motion already available for panel UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @cosmos.gl/graph v2.6.1 | v3.0.0-beta.8 | v3 has luma.gl + async init improvements but is pre-release; v2.6.1 is stable and the STATE.md already referenced v2.6.4 as target (which does not exist — v2.6.1 is the ceiling) |
| @cosmos.gl/graph | @cosmograph/react | Out of scope per REQUIREMENTS.md: "Last published 7 months ago, no React 19 compatibility statement" |
| @cosmos.gl/graph | sigma.js or cytoscape | Cosmos is the locked decision; do not explore alternatives |

**Installation:**
```bash
npm install @cosmos.gl/graph
```

> Note: STATE.md mentions "Confirm `@cosmos.gl/graph` v2.6.4 package version" — v2.6.4 does not exist on npm; latest stable is **v2.6.1** (released November 15, 2024). Install `@cosmos.gl/graph@2.6.1` explicitly to pin the version.

---

## Architecture Patterns

### Recommended Project Structure
```
app/(dashboard)/users/
├── graphRenderers.ts          # ADD: CosmosGraphRenderer class here (replaces WebGpuGraphRenderer stub)
├── AccUsersGraph.tsx          # MODIFY: toggle UI, physics panel, WebGL2 detection, localStorage
├── accGraphOrganicLayout.ts   # UNTOUCHED: physics types reused as slider labels/defaults
├── accGraphOrganicLayout.worker.ts  # UNTOUCHED: d3-force worker still drives CanvasGraphRenderer
└── cosmosUtils.ts             # NEW: hex-to-RGBA conversion, WebGL2 detection helper
```

The worker-driven d3-force physics is for the Canvas 2D renderer. Cosmos.gl has its own built-in GPU physics. The two physics systems are independent — the worker is paused/ignored when Cosmos renderer is active.

### Pattern 1: CosmosGraphRenderer Adapter Class

**What:** A class implementing `GraphRenderer` that wraps a `Graph` instance from `@cosmos.gl/graph`.

**When to use:** When `renderBackend === "cosmos"` is active.

```typescript
// Source: https://github.com/cosmosgl/graph/blob/main/README.md
import { Graph } from '@cosmos.gl/graph'
import type { GraphRenderer, GraphRenderFrame, GraphDrawResult } from './graphRenderers'

export class CosmosGraphRenderer implements GraphRenderer {
  readonly backend = 'cosmos' as const

  private graph: Graph
  private lastPointCount = 0
  private lastLinkCount = 0

  constructor(canvas: HTMLCanvasElement) {
    this.graph = new Graph(canvas, {
      enableSimulation: true,
      fitViewOnInit: false,          // we control zoom/pan externally
      backgroundColor: '#F8F7F4',
      simulationRepulsion: 1.0,
      simulationLinkSpring: 1.0,
      simulationGravity: 0.25,
      simulationFriction: 0.85,
    })
  }

  draw(frame: GraphRenderFrame): GraphDrawResult {
    const pointCount = frame.nodes.length

    if (pointCount !== this.lastPointCount) {
      // Rebuild all GPU buffers on node count change
      this.graph.setPointPositions(frame.positions)          // [x0,y0,x1,y1,...]
      this.graph.setPointColors(buildPointColors(frame))     // Float32Array RGBA per node
      this.graph.setPointSizes(buildPointSizes(frame))       // Float32Array size per node
      this.lastPointCount = pointCount
    }

    if (frame.links && frame.links.sources.length !== this.lastLinkCount) {
      const linkBuffer = buildLinkBuffer(frame.links)        // Float32Array [s0,t0,s1,t1,...]
      this.graph.setLinks(linkBuffer)
      this.graph.setLinkColors(buildLinkColors(frame))
      this.lastLinkCount = frame.links.sources.length
    }

    // Cosmos runs its own RAF; no continuous redraw needed from our loop
    return { needsContinuousRedraw: false }
  }

  setPhysicsConfig(partial: { repulsion?: number; linkSpring?: number; gravity?: number }) {
    this.graph.setConfigPartial({
      simulationRepulsion: partial.repulsion,
      simulationLinkSpring: partial.linkSpring,
      simulationGravity: partial.gravity,
    })
  }

  destroy(): void {
    // @cosmos.gl/graph does not expose a documented destroy() in v2 — nullify ref
    this.graph = null as unknown as Graph
  }
}
```

### Pattern 2: WebGL2 Detection at Startup

**What:** Synchronous probe before any Cosmos import, gates toggle visibility.

**When to use:** On component mount, before renderer initialization.

```typescript
// Source: MDN https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL
function detectWebGL2(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2')
    return ctx !== null
  } catch {
    return false
  }
}

// Usage: run once, store in state
const [webgl2Available] = useState(() => detectWebGL2())
```

### Pattern 3: setPointColors / setLinkColors Float32Array Format

**What:** Per-node and per-edge RGBA values as a flat Float32Array with normalized [0,1] components.

```typescript
// Source: https://github.com/cosmosgl/graph — README setPointColors example
// Each node: [r, g, b, alpha] — values 0.0 to 1.0
function buildPointColors(frame: GraphRenderFrame): Float32Array {
  const buf = new Float32Array(frame.nodes.length * 4)
  for (let i = 0; i < frame.nodes.length; i++) {
    const hex = frame.nodes[i].color  // e.g. "#E63946"
    const [r, g, b] = hexToRGBNorm(hex)
    buf[i * 4 + 0] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = 1.0
  }
  return buf
}
```

### Pattern 4: setConfigPartial for Live Physics

**What:** Updating a single physics parameter without resetting others or restarting the simulation.

```typescript
// Source: https://github.com/cosmosgl/graph — README setConfigPartial
// setConfig() resets ALL values to defaults first — NEVER use for live slider updates
// setConfigPartial() updates only the specified keys — USE THIS for sliders
graph.setConfigPartial({ simulationRepulsion: 1.5 })
graph.setConfigPartial({ simulationLinkSpring: 0.8 })
graph.setConfigPartial({ simulationGravity: 0.1 })
```

### Pattern 5: Renderer Backend String

The existing `renderBackend` state uses `"canvas2d" | "webgpu"`. Since the stub is replaced, change the union to `"canvas2d" | "cosmos"` throughout `AccUsersGraph.tsx` and `graphRenderers.ts`. The `GraphRenderer.backend` field needs the same update.

### Pattern 6: Preserving Graph State on Toggle

The context decision requires zoom/pan/selected nodes to survive renderer toggle. Strategy:
- Before switching to Cosmos: read `view.current` (already a ref)
- After Cosmos initializes: call `graph.zoom()` with equivalent viewport transform
- On switch back to Canvas 2D: restore `view.current` from a snapshot

### Anti-Patterns to Avoid

- **Using `setConfig()` for slider updates:** Resets all physics values to defaults every call. Always use `setConfigPartial()` for incremental changes.
- **Calling `setPointPositions` every RAF tick:** Cosmos owns its render loop. Only push data when node count changes or positions are externally modified (e.g., worker tick). Calling GPU transfer methods at 60fps causes excessive VRAM writes.
- **Importing @cosmos.gl/graph at the module top-level:** The canvas detection must run first. Use a dynamic `import('@cosmos.gl/graph')` inside the async initialization path so SSR (Next.js server render) never tries to instantiate a WebGL context.
- **Sharing the worker physics with Cosmos:** d3-force runs in the worker and drives `posRef.current` for Canvas 2D. When Cosmos is active, the worker should be paused (send `{ type: "pause", paused: true }`) so two physics engines don't fight over positions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GPU instanced node rendering | Custom WebGL shader for node circles | `@cosmos.gl/graph` GPU point rendering | Cosmos uses fragment/vertex shaders with luma.gl — 500k nodes at 60fps; hand-rolled WebGL2 for this is months of work |
| Force-directed layout on GPU | Custom GPGPU repulsion shader | Cosmos built-in physics (`simulationRepulsion`, `simulationLinkSpring`, `simulationGravity`) | Cosmos runs force simulation in shaders — reimplementing is the entire library |
| RGBA hex conversion | String parsing in renderer hot path | Pre-build `Float32Array` once when data changes | Color buffers should be computed once and cached, not per-frame |
| WebGL2 context loss recovery | Custom context-lost/restored event handler | The existing `fallBackToCanvas` pattern already in `AccUsersGraph.tsx` | Extend the existing pattern; don't build a parallel recovery system |

**Key insight:** Cosmos.gl does all the hard GPU work. The implementation task is data plumbing — converting the existing `GraphRenderFrame` flat arrays into the format Cosmos expects — not graphics programming.

---

## Common Pitfalls

### Pitfall 1: v2.6.4 Does Not Exist
**What goes wrong:** STATE.md lists "Confirm `@cosmos.gl/graph` v2.6.4" as a concern. v2.6.4 is not a released version. Installing `@cosmos.gl/graph` without pinning pulls v2.6.1 (latest stable).
**Why it happens:** The version number was speculative in the planning notes.
**How to avoid:** Pin to `@cosmos.gl/graph@2.6.1` explicitly in package.json.
**Warning signs:** `npm install @cosmos.gl/graph@2.6.4` returns 404.

### Pitfall 2: setConfig vs setConfigPartial
**What goes wrong:** Using `graph.setConfig({ simulationRepulsion: 1.5 })` for a slider update resets ALL other physics properties to their defaults on every slider change.
**Why it happens:** `setConfig()` is a full-replace operation (documented behavior since v2.2.0 rebranding).
**How to avoid:** Always use `graph.setConfigPartial()` for incremental updates from sliders.
**Warning signs:** Graph springs to default layout after first slider interaction.

### Pitfall 3: SSR Import of WebGL Library
**What goes wrong:** Importing `@cosmos.gl/graph` at the top of `graphRenderers.ts` (which is `"use client"`) still gets processed by Next.js server-side module resolution during build, potentially failing because `document` and WebGL are absent.
**Why it happens:** Next.js 16 / webpack 5 may try to statically analyze all imports even in client components during SSR.
**How to avoid:** Use dynamic import inside the async factory — `const { Graph } = await import('@cosmos.gl/graph')` — inside the `CosmosGraphRenderer.create()` static async factory (mirroring the existing `WebGpuGraphRenderer.create()` pattern).
**Warning signs:** Build error referencing `document is not defined` in server context.

### Pitfall 4: Two Physics Engines in Conflict
**What goes wrong:** The d3-force Web Worker continues sending `tick` messages with updated positions while Cosmos.gl is running its own GPU physics, causing position flicker.
**Why it happens:** The worker is initialized in a `useEffect` that runs independently of the renderer backend state.
**How to avoid:** When switching to Cosmos backend, immediately post `{ type: "pause", paused: true }` to the worker. Restore `paused: false` when switching back to Canvas 2D.
**Warning signs:** Nodes jitter/snap back to unexpected positions periodically.

### Pitfall 5: Canvas Ownership Conflict
**What goes wrong:** Cosmos `new Graph(canvas, config)` takes full ownership of the canvas element, setting its own dimensions and attaching its own event listeners.
**Why it happens:** Cosmos is designed as a standalone renderer that manages its own canvas.
**How to avoid:** Give Cosmos the `webgpuCanvasRef` (now renamed conceptually to `cosmosCanvasRef`) as its container. Cosmos attaches to a `<div>` container (not the canvas directly per README), so ensure the canvas is inside a dedicated `<div>` wrapper. The existing `webgpuCanvasRef` element should be replaced with a `<div ref={cosmosContainerRef}>` and Cosmos creates its own canvas inside it.
**Warning signs:** Canvas resizes incorrectly or pointer events stop working on the active canvas.

### Pitfall 6: Graph State Loss on Toggle
**What goes wrong:** Switching from Canvas 2D to Cosmos loses zoom level and pan position; switching back loses the Cosmos view state.
**Why it happens:** The two renderers have independent view representations.
**How to avoid:** On toggle activation, read `view.current` and translate it to a `graph.zoom()` call. On toggle deactivation, read the Cosmos camera position and write it back to `view.current`/`targetView.current`. The CONTEXT.md specifies this as a hard requirement.
**Warning signs:** Graph snaps to default zoom after toggle.

### Pitfall 7: Async Initialization Spinner Timing
**What goes wrong:** The loading spinner is shown but `graph.isReady` never becomes `true` if the canvas is not attached to the DOM yet when `new Graph()` is called.
**Why it happens:** Cosmos initializes luma.gl device against the DOM element — if the container is hidden (`opacity-0`) or not rendered yet, device creation may fail silently.
**How to avoid:** Mount the Cosmos container in the DOM before calling `new Graph()`. The existing pattern of `opacity-0 pointer-events-none` is fine for visibility — the element is in the DOM. Confirm `containerRef.current` is non-null before creating the Graph instance. Use `graph.ready` (a Promise) rather than polling `graph.isReady`.
**Warning signs:** Loading spinner shows indefinitely; `graph.isReady` stays false.

---

## Code Examples

Verified patterns from official sources:

### Graph Constructor with Config
```typescript
// Source: https://github.com/cosmosgl/graph/blob/main/README.md
import { Graph } from '@cosmos.gl/graph'

const graph = new Graph(containerDiv, {
  simulationRepulsion: 1.0,       // repulsion between nodes
  simulationLinkSpring: 1.0,      // spring constant for edges
  simulationGravity: 0.25,        // gravity pulling to center
  simulationFriction: 0.85,       // 0 = high friction, 1 = none
  simulationDecay: 5000,          // simulation cooling time (ms)
  backgroundColor: '#F8F7F4',
  fitViewOnInit: false,
  enableSimulation: true,         // init-only — set once
})
```

### Setting Points and Links
```typescript
// Source: https://github.com/cosmosgl/graph/blob/main/README.md
// pointPositions: Float32Array [x0, y0, x1, y1, ...]
graph.setPointPositions(pointPositions)

// pointColors: Float32Array [r0, g0, b0, a0, r1, g1, b1, a1, ...] values 0.0–1.0
graph.setPointColors(pointColors)

// links: Float32Array [sourceIdx0, targetIdx0, sourceIdx1, targetIdx1, ...]
graph.setLinks(links)

// linkColors: Float32Array [r, g, b, a] per link
graph.setLinkColors(linkColors)

// Kick Cosmos rendering
graph.render()
```

### Live Physics Update via setConfigPartial
```typescript
// Source: https://github.com/cosmosgl/graph/blob/main/README.md
// CORRECT: use setConfigPartial for slider updates — does not reset other values
graph.setConfigPartial({ simulationRepulsion: 1.5 })

// WRONG: resets ALL properties to defaults then applies only the one specified
// graph.setConfig({ simulationRepulsion: 1.5 })
```

### Async Initialization Pattern
```typescript
// Source: https://github.com/cosmosgl/graph/blob/main/README.md
const graph = new Graph(containerDiv, config)
// All method calls queue until device is ready
await graph.ready   // Promise resolves when GPU device is initialized
// OR check synchronously:
if (graph.isReady) { /* safe to call methods */ }
```

### WebGL2 Detection (No Library Required)
```typescript
// Source: MDN https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL
function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}
```

### Converting Existing Hex Colors to Cosmos RGBA Float32Array
```typescript
// Project-specific helper — no library needed
function hexToRGBNorm(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

function buildNodeColorBuffer(nodes: readonly GraphRenderNode[]): Float32Array {
  const buf = new Float32Array(nodes.length * 4)
  for (let i = 0; i < nodes.length; i++) {
    const [r, g, b] = hexToRGBNorm(nodes[i].color)
    buf[i * 4 + 0] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = 1.0  // full opacity
  }
  return buf
}
```

### Converting Existing Int32Array Links to Cosmos Float32Array
```typescript
// Source: GraphRenderFrame shape in graphRenderers.ts
// Existing: frame.links.sources: Int32Array, frame.links.targets: Int32Array
// Cosmos wants: Float32Array [s0, t0, s1, t1, ...]
function buildLinkBuffer(links: { sources: Int32Array; targets: Int32Array }): Float32Array {
  const count = links.sources.length
  const buf = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    buf[i * 2 + 0] = links.sources[i]
    buf[i * 2 + 1] = links.targets[i]
  }
  return buf
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@cosmograph/cosmos` + `setData()` (accessor functions) | `@cosmos.gl/graph` + `setPointPositions()` / `setLinks()` Float32Arrays | v2.0.0 Dec 2023 | Direct typed array API — no per-node accessor function overhead |
| `setConfig()` for all updates | `setConfigPartial()` for incremental updates, `setConfig()` for full reset | v2.2.0 Jul 2024 | Must use `setConfigPartial()` for live slider changes |
| `restart()` to unpause simulation | `unpause()` | v2.5.0 Sep 2024 | `restart()` is deprecated — use `unpause()` |
| `pointColor` / `linkColor` config keys | `pointDefaultColor` / `linkDefaultColor` | v2.6.1 Nov 2024 | Old keys are deprecated — use new names |
| `WebGpuGraphRenderer` stub in codebase | `CosmosGraphRenderer` (this phase) | Phase 2 | Replaces the disabled stub with the real implementation |

**Deprecated/outdated:**
- `setData()`: replaced by `setPointPositions()` + `setLinks()` in v2.0
- `restart()`: replaced by `unpause()` in v2.5.0
- `pointColor` / `linkColor` config keys: renamed to `pointDefaultColor` / `linkDefaultColor` in v2.6.1
- `@cosmograph/react` wrapper: excluded by REQUIREMENTS.md ("no React 19 compatibility statement")

---

## Open Questions

1. **Does `@cosmos.gl/graph` v2.6.1 support `destroy()` for cleanup?**
   - What we know: README shows `graph.destroy?.()` with optional chaining in the React example, suggesting it may not be guaranteed
   - What's unclear: Whether the method exists without optional chaining in v2.6.1
   - Recommendation: Always call `graph.destroy?.()` with optional chaining; nullify the ref after calling it

2. **Cosmos container: `<div>` or `<canvas>`?**
   - What we know: README quick start passes a `div` element; the existing codebase passes a `<canvas>` to `CanvasGraphRenderer`
   - What's unclear: Whether Cosmos v2.6.1 accepts a `<canvas>` directly or requires a `<div>` container that it injects a canvas into
   - Recommendation: Pass a `<div>` wrapper as the Cosmos container to be safe (matching README pattern); keep the existing `<canvas>` elements for Canvas 2D only. Adjust the JSX in `AccUsersGraph.tsx` to add a `<div ref={cosmosContainerRef}>` alongside the Canvas 2D element.

3. **Node size scaling by connection count — does Cosmos accept per-node sizes?**
   - What we know: `setPointSizes(Float32Array)` is referenced in v2.4.0+ release notes as a data method
   - What's unclear: The exact method name is `setPointSizes` but not confirmed in the extracted README
   - Recommendation: Check the TypeScript types from the installed package — the README references "Per-point size arrays"; method likely `setPointSizes(Float32Array)`

4. **Cosmos view/camera API for preserving zoom/pan on toggle**
   - What we know: `setZoomTransformByPointPositions()` exists for fitting; `graph.zoom()` is mentioned in API summary
   - What's unclear: The exact signature for setting an arbitrary zoom/pan state matching the existing `{ x, y, scale }` view ref format
   - Recommendation: During Wave 0 or early implementation, read the TypeScript types from `node_modules/@cosmos.gl/graph` to find the zoom setter signature

---

## Sources

### Primary (HIGH confidence)
- https://github.com/cosmosgl/graph — Official repository README, config.ts source, release history
- https://github.com/cosmosgl/graph/releases/latest — v2.6.1 confirmed as latest stable (Nov 15, 2024)

### Secondary (MEDIUM confidence)
- https://github.com/cosmosgl/graph/releases — Full release history v2.0.0 through v2.6.1 with API evolution
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL — WebGL2 detection pattern

### Tertiary (LOW confidence — validate during implementation)
- WebSearch: `setPointSizes` method name — referenced in release notes but not confirmed in extracted README
- WebSearch: Cosmos `destroy()` method availability — optional chaining in example suggests uncertainty
- WebSearch: Cosmos container as `<div>` vs `<canvas>` — README example uses `div` but not tested with canvas directly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version confirmed from GitHub releases, npm package name confirmed
- Architecture: HIGH — existing `GraphRenderer` interface and dual-canvas DOM pattern confirmed from source code
- Physics API: HIGH — `simulationRepulsion`, `simulationLinkSpring`, `simulationGravity`, `setConfigPartial` confirmed from config.ts source
- Color buffer API: HIGH — `setPointColors(Float32Array)` RGBA format confirmed from release notes + README
- Pitfalls: HIGH — `setConfig` vs `setConfigPartial` distinction confirmed from official docs; worker conflict is a known architectural issue
- Open questions: LOW (3 items) — flagged for implementation-time validation from installed types

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable library; 30 days window reasonable)
