# Domain Pitfalls: Multi-Dimensional Spatial Graph

**Domain:** Force-directed spatial graph with continuous-blend dimension sliders, 2D/3D mode, lasso+pie, Cosmos.gl v3, DuckDB-WASM, React
**Researched:** 2026-05-19
**Project:** LECG Access Analysis Redesign

These pitfalls are drawn from three sources: (1) the documented failure history in this codebase (`.planning/codebase/CONCERNS.md`, `AccUsersGraph.tsx`), (2) cosmos.gl/cosmosgl release notes and GitHub issues, and (3) broader force-directed graph and React WebGL community findings. Each pitfall maps to a phase or architectural layer.

---

## Critical Pitfalls

Mistakes that cause rewrites or major regressions.

---

### Pitfall C-1: Physics State Coupled to Filter/Render State

**What goes wrong:** Filter changes (hide a user, toggle a project) trigger a full layout recompute — the simulation restarts from scratch, positions flash, jitter, or reset to random. This was the proximate cause of the prior AccUsersGraph rewrite mandate.

**Why it happens:** The natural React pattern is: filter changes → new nodes array → pass to graph component → graph re-initializes. Most graph wrappers (react-force-graph, early Cosmos integration) treat a new nodes prop as a full re-mount. The simulation does not distinguish "same topology, fewer visible nodes" from "brand new graph."

**Consequences:** Every filter toggle costs 2-5 seconds of jitter. Users perceive the graph as broken. Alpha/warmup tricks get bolted on top, creating the patch stack. The codebase already has `loadOrComputePositions` + `hashNodeSet` + `positionsCache` as a symptom of this — all workaround infrastructure.

**Warning signs:**
- You add a `warmupMs` parameter to anything.
- You write a `hashNodeSet` function to decide when to skip re-layout.
- You find yourself storing positions in DuckDB to avoid re-running the sim.
- Filter changes cause the graph to flash white or jump to center.

**Prevention:**
- Separate topology (which nodes/links exist) from visibility (which are shown). The sim runs on the full topology. Filtering sets `pointOpacity` / `pointSize` to 0 for hidden nodes — it never changes the node/link arrays passed to Cosmos.
- In Cosmos.gl v3, use `graph.setPointColors()` and `graph.setPointSizes()` for filter state. Never call `graph.setPointPositions()` or re-pass `points` on a filter change.
- Lock positions before filtering: call `graph.pause()` once layout converges; after that, filtering is purely a color/size buffer update.

**Phase:** Layout engine layer (Phase 1 of any rewrite). Must be the architectural foundation — everything else builds on this.

---

### Pitfall C-2: Inverted Alpha Semantics in Cosmos.gl v3

**What goes wrong:** `graph.getSimulationAlpha()` returns `1 - progress`. At simulation start, it returns ~1.0, dropping toward 0.0 as the sim converges — the **opposite** of d3-force's alpha, which starts high and decays. Code written against d3 intuition (`alpha < 0.01` means "converged") reads as `getSimulationAlpha() < 0.01`, which is **never true at start and always true when converged**. Dim/highlight animations tied to this value invert or never fire.

**Why it happens:** Cosmos.gl renamed the internal concept: their "alpha" is "how much energy is left." But v3's public API surface exposes `getSimulationAlpha()` which maps to 1 - internal progress — confirmed by memory `project_cosmos_alpha_inversion` and verified against cosmosgl release notes.

**Consequences:** Highlight-on-hover dims the graph permanently. Lasso selection highlights the wrong set. "Simulation done" detection fires on frame 1 instead of after convergence.

**Warning signs:**
- Labels or dim effects are inverted (everything dark on load, everything bright after settle).
- `onSimulationTick` callbacks that use alpha to gate effects trigger at the wrong time.
- "isSimulationRunning" logic reads backwards.

**Prevention:**
```typescript
// CORRECT: alpha approaches 0 as sim converges (1 - progress pattern)
const isConverged = graph.getSimulationAlpha() < 0.05;

// WRONG (d3-force intuition):
// const isConverged = graph.getSimulationAlpha() < 0.01; // fires immediately
```
Add a single constant: `const COSMOS_CONVERGED_THRESHOLD = 0.05` and document the inversion. Never inline the comparison without a comment.

**Phase:** Simulation control layer. Verify on day one before any alpha-gated logic is written.

---

### Pitfall C-3: Seed Positions Ignored — All-D3-Force Default

**What goes wrong:** The graph engine is initialized without providing semantic seed positions, so every node starts at `(random, random)` within the simulation space. Force-directed physics then converges to a local energy minimum that has no relationship to the actual user-project structure. The result looks "random" because it is — the layout reflects graph connectivity, not the business dimensions (activity level, permission tier, last sign-in) that the sliders are meant to express.

**Why it happens:** It is easier to pass `nodes` and let physics run than to precompute seed coordinates. The d3-force/Cosmos default works visually for small graphs with clear community structure. For this project's heterogeneous user-project instances, connectivity alone produces misleading clusters.

**Consequences:** Clusters look arbitrary. Slider changes (e.g. "increase Activity dimension") don't produce visible movement because physics starts from a position that already "settled" without the dimensional guidance. Users conclude the sliders are broken.

**Warning signs:**
- Changing a slider from 0 to 100 produces subtle jitter rather than a visible cluster migration.
- Reloading the page produces a visually different layout each time.
- You add a `seed` parameter to the RNG but positions still feel arbitrary.

**Prevention:**
- Compute semantic seed positions before handing data to the graph engine. For this project: place nodes using a weighted combination of the DC parameters (activity count, permission tier, last-sign-in recency) mapped to 2D coordinates.
- Pass seeds via `graph.setPointPositions(seeds, { dontRescale: true })` before calling `graph.start()`. This sets the starting positions; physics then refines from there.
- The seed coordinate space must match the simulation space. Cosmos will auto-rescale if `rescalePositions: true` is set, but this overwrites your intentional geometry. Verify by logging `graph.getPointPositionsFloat32()` before and after `start()`.

**Phase:** Math/seed layer. Must be defined before engine selection is locked.

---

### Pitfall C-4: Slider State Coupled to Physics State (The Patch Stack Attractor)

**What goes wrong:** Each slider (Activity, Roles, Permissions, ...) triggers a physics config change: `graph.setConfig({ repulsion: newVal })`. The sim restarts (or receives a new alpha kick), positions scramble, and the user watches the graph re-settle after every slider move. With 11 sliders, any interaction produces visible chaos.

**Why it happens:** The temptation is to map slider → physics parameter directly. This is the minimum-viable implementation, so it always gets built first. Then patches get added: debounce, pause/unpause guards, "warmup then freeze" — each patch adds coupling surface.

**Consequences:** Sliders fight each other (moving Slider A kicks the sim, moving Slider B before it converges produces a sum of two restarts). Layout state becomes path-dependent: the final position depends on which sliders were moved in which order, not on the declared dimensional weights. This is the documented "patches stacking on patches" failure from the project brief.

**Warning signs:**
- You add debounce to a slider handler.
- You add a `useRef` that tracks "last layout config hash" to avoid redundant restarts.
- Changing two sliders in quick succession produces different layouts than changing them one at a time.
- You find yourself adding a `setTimeout` before calling `graph.pause()`.

**Prevention:**
- Decouple slider state from the physics sim entirely. Sliders define weights for a **position computation function** — not physics parameters.
- Architecture: `sliderWeights → computeSeedPositions(weights, dcData) → graph.setPointPositions(newSeeds)`. The sim is paused (frozen) after initial warmup; slider changes compute new target positions and animate them via `graph.setPointPositions()` directly, bypassing force physics.
- If physics must be used (for organic refinement), only re-kick alpha for the specific nodes whose positions changed significantly. Never restart the full sim from a slider change.

**Phase:** Math layer + slider composition layer. Must be architected before any slider UI is wired.

---

### Pitfall C-5: `setPointPositions` Coordinate Rescaling Silently Corrupts Semantic Seeds

**What goes wrong:** Cosmos.gl v3 (and v2.1+) auto-rescales coordinates to fit within the simulation space when `rescalePositions: true` (config default varies by version). Semantic seeds computed in screen/data space get uniformly scaled — which preserves relative positions — but if any seeds fall outside the simulation boundary, the rescaling distorts the intended geometry.

**Why it happens:** The simulation space is a fixed 2D rectangle (roughly -1 to 1 normalized, or a pixel-based box). Seeds derived from data features (e.g. activity count 0→1000 mapped to x) may span a much wider range. Cosmos detects the out-of-bounds condition and clamps/rescales.

**Consequences:** Nodes that should be far apart (high activity vs. zero activity) are placed close together after rescaling. The dimensional geometry is compressed. Sliders appear to have weak effect.

**Warning signs:**
- Nodes cluster toward the center despite varied seed values.
- `graph.getPointPositionsFloat32()` returns values in a much smaller range than the seeds you passed.
- Disabling `rescalePositions` causes nodes to disappear (they're outside the viewport).

**Prevention:**
```typescript
// Map seeds to [-0.8, 0.8] normalized space before passing to Cosmos:
const norm = (v: number, min: number, max: number) => 
  -0.8 + (v - min) / (max - min) * 1.6;

// Then pass with dontRescale to prevent double-transformation:
graph.setPointPositions(normalizedSeeds, { dontRescale: true });
```
Verify seed range at the math layer before integration with the engine.

**Phase:** Math/seed layer. Verify immediately after first engine integration test.

---

### Pitfall C-6: 2D↔3D Switch Causes Position Discontinuity and Camera Disorientation

**What goes wrong:** Switching from 2D to 3D (or back) reassigns the `z` coordinate — either setting all z=0 (losing depth) or randomly distributing z (nodes teleport). The camera resets to default position. The user loses spatial context and has to re-orient after every mode switch.

**Why it happens:** 2D and 3D graph engines are typically separate components (e.g. `ForceGraph2D` vs `ForceGraph3D` in react-force-graph). Switching components unmounts/remounts, discarding position state. Even within a single engine, the z-axis projection is not preserved across mode changes.

**Consequences:** Users perceive the 2D and 3D views as showing different graphs. The switch feels broken. Adding a fade-transition mask does not solve the underlying position discontinuity — it just hides the flash.

**Warning signs:**
- You add a CSS transition or opacity fade to mask the switch.
- You store positions in a ref and try to restore them after re-mount.
- The camera position resets to `(0, 0, defaultDistance)` after every mode toggle.

**Prevention:**
- Maintain a single canonical `positions: Float32Array` (x,y pairs) in the math layer, outside the graph engine.
- On 2D→3D: project 2D positions to 3D by setting `z = 0` for all nodes. Preserve x and y exactly.
- On 3D→2D: project back by discarding z. Store the last 3D camera state and restore it on next 3D switch.
- Use a single graph engine that supports both modes if possible (react-force-graph's `numDimensions` prop, or Cosmos with a 3D extension) rather than two separate components.
- Camera: compute the bounding box of node positions and frame the camera to contain all nodes after any mode switch. Never reset to a hardcoded default.

**Phase:** Engine selection and 2D/3D bridge layer.

---

### Pitfall C-7: Modularity/Community Detection Lying About Cluster Structure

**What goes wrong:** A community detection algorithm (Louvain, greedy modularity) is run on the graph edges, colors are assigned by detected community, and the layout appears to show natural clusters. In practice, force-directed layouts are mathematically equivalent to modularity optimization — the "clusters" the algorithm finds are the same clusters that the physics already creates. Coloring by computed community on top of a force-directed layout is circular and tells the user nothing new.

**Why it happens:** Community detection is the obvious next step after a force layout "looks like it has clusters." The algorithm is easy to run, the colors look convincing, and the demo reads well. The conceptual error is invisible.

**Consequences:** Users trust cluster labels that reflect graph connectivity (which edges exist), not the business dimensions they care about (which projects are functionally similar, which users have overlapping access). Cluster labels get named ("Engineering team?") based on visual proximity that may be spurious.

**Warning signs:**
- Cluster colors are computed from edge structure after layout, not from the DC parameters.
- Cluster labels change when you add/remove a single user (instability of modularity at small N).
- The same cluster boundary appears regardless of which slider dimensions are active.

**Prevention:**
- In this project: clusters are **dimensional groupings**, not detected communities. A cluster is "users with high activity in Docs module" — defined by the DC parameters, not by graph edges.
- Color nodes by their dimensional bucket (e.g. high/mid/low on the primary active slider), not by a post-hoc community detection result.
- If community detection is used at all, run it on the DC feature vectors (k-means on the parameter space), not on the graph edge topology.

**Phase:** Math layer / cluster annotation layer. Must be decided before any cluster coloring is implemented.

---

## Moderate Pitfalls

---

### Pitfall M-1: React Re-Render Storms Triggering Layout Reset

**What goes wrong:** A React state update (tooltip hover, filter dropdown, search input) triggers a re-render of the component tree that contains the graph engine. The engine receives new props, detects a "data change," and restarts the simulation. Documented in react-force-graph issue #226: even `useMemo` on the nodes array doesn't prevent this if the memo dependency chain includes any frequently-changing state.

**Prevention:**
- The graph engine must live in a `useRef` (not in React state). Mount once; communicate via imperative API calls (`graph.setPointColors()`, `graph.setPointSizes()`), not prop updates.
- Wrap the canvas element in a stable `div` with a constant key. Never let React unmount/remount the canvas.
- Tooltip and UI state must live in a sibling subtree, not in an ancestor of the graph canvas.
- Warning sign: you find yourself adding `key={stableId}` to the graph component to prevent re-mounts that shouldn't happen.

**Phase:** React integration layer (Phase 1 architecture).

---

### Pitfall M-2: DuckDB-WASM Queried Inside Render or Effect Without Worker Isolation

**What goes wrong:** A `useEffect` or event handler calls `await duckdbConnection.query(sql)` synchronously on the main thread. For small datasets this is fast. At scale (full DC backfill: 46 CSV files × 2 years), a query blocks the main thread for 200-800ms — the graph freezes, animations stutter, and the browser reports a long task.

**Why it happens:** The DuckDB-WASM client is async and "feels" non-blocking because it returns a Promise. But WASM execution is not automatically threaded — without SharedArrayBuffer + Web Workers, it runs on the main thread.

**Prevention:**
- Run DuckDB-WASM in a dedicated Web Worker. Use `@duckdb/duckdb-wasm`'s `AsyncDuckDB` with `DuckDBSharedWorker` or `DuckDBWorkerModule`.
- The positions cache (`positionsCache.ts`) already uses DuckDB — verify it runs in the worker, not on the main thread.
- Warning sign: the graph animation stutters exactly when a filter dropdown closes (the query fires on close).
- Use `performance.mark` around DuckDB queries in dev to measure main-thread time.

**Phase:** DuckDB/data layer. Verify before demo; fix before production.

---

### Pitfall M-3: Lasso Selection State Desync with Graph Node State

**What goes wrong:** The lasso captures node indices at selection time. If the node array is re-ordered or re-filtered after the lasso fires, the indices no longer map to the original nodes. The pie chart shows data for the wrong users.

**Why it happens:** `selectPointsInPolygon` in Cosmos returns indices into the current point array. If the array is mutated (e.g. filtered nodes removed from the array), the same index resolves to a different node.

**Prevention:**
- Never use array index as node identity. Maintain a stable `nodeId → arrayIndex` map. When lasso returns indices, resolve them to nodeIds immediately using the current map.
- Keep the full node array stable (filter via opacity/size, not by removing elements from the array). Then lasso indices are always valid.
- Pie chart recomputation must be triggered only by an explicit user action (lasso release, not by filter state changes).

**Phase:** Lasso + pie integration layer.

---

### Pitfall M-4: Label Overlay Perf Degrading at Scale

**What goes wrong:** A Canvas 2D overlay (drawn via `requestAnimationFrame`) is used to render node labels on top of the WebGL Cosmos canvas. At every frame, the overlay clears and redraws all visible labels. With 300+ nodes at full zoom, this produces a measurable FPS drop — the overlay redraw alone can cost 8-15ms per frame.

**Why it happens:** The naive approach is to draw all labels every frame. This worked with fewer nodes. The `AccUsersGraph` already implements a label overlay (`ClusterAnnotations`) — the pattern is known to be performance-sensitive.

**Prevention:**
- Only draw labels for nodes within the current viewport.
- Apply a zoom-gated threshold: below a zoom level, show no labels; above it, show the N nearest to the viewport center.
- Cache the label bounding boxes; only redraw the overlay when zoom or pan changes, not on every rAF tick.
- The existing `pow(zoom, 0.2)` clamped font-size curve (UAT-approved 2026-05-08, per memory `project_label_polish_curve`) should be preserved.
- Warning sign: Chrome DevTools shows the overlay canvas as the top frame-time consumer.

**Phase:** Rendering / label layer.

---

### Pitfall M-5: WebGL Context Not Disposed on Component Unmount

**What goes wrong:** Navigating away from the graph route leaves an active WebGL context. Returning creates a second context. Browsers cap WebGL contexts at 8-16 per page (Chrome: 16). After several navigations, the browser forcibly loses older contexts, causing a black canvas or CONTEXT_LOST_WEBGL error.

**Prevention:**
- Call `graph.destroy()` (Cosmos API) in the React cleanup function of the `useEffect` that mounts the engine.
- If using Three.js: call `renderer.dispose()` + `geometry.dispose()` + `texture.dispose()` explicitly.
- Warning sign: returning to the graph route after navigating away shows a black or blank canvas.

**Phase:** Engine integration layer.

---

### Pitfall M-6: Continuous Slider Blend — Non-Monotonic UX from Naive Weight Normalization

**What goes wrong:** Eleven sliders each produce a weight. Weights are summed and normalized so the total dimensional pull sums to 1.0. When one slider is raised from 0 to 100, it dilutes all other sliders' contributions — the clusters driven by other dimensions visually shrink even though those sliders didn't move. Users perceive this as sliders interfering with each other, not as mathematically correct normalization.

**Prevention:**
- Use unnormalized additive blending, not normalized. Each slider's contribution is additive to the position vector, not a fraction of a fixed total force budget.
- Formula: `position = basePosition + Σ(weight_i * dimensionAxis_i * sliderValue_i / 100)`, not `position = Σ((weight_i / Σweights) * dimensionAxis_i)`.
- Test: raising Slider A from 0 to 100 should visibly increase clustering along Dimension A's axis. Other sliders at constant settings should produce constant, unchanging cluster geometry for their dimensions.
- Warning sign: setting one slider to 100 and all others to 50 produces a completely different layout than all sliders at 50. This is the normalization interference symptom.

**Phase:** Math / slider composition layer. Must be unit-tested with Vitest before integration.

---

### Pitfall M-7: `rescalePositions` and Simulation Space Size Mismatch After `setPointPositions`

**What goes wrong:** After the first layout is computed, a slider change calls `graph.setPointPositions(newSeeds)`. If `rescalePositions` is `true` (the config-level default), Cosmos rescales the new positions to fit the simulation space — which may produce a different scale factor than the previous positions. Nodes appear to jump scale between slider states.

**Prevention:**
- Set `rescalePositions: false` globally.
- Pre-normalize all seed positions to the simulation space manually (see Pitfall C-5).
- Always pass `{ dontRescale: true }` to `setPointPositions()` calls.

**Phase:** Math/seed layer + engine integration.

---

## Minor Pitfalls

---

### Pitfall m-1: Cosmos.gl v3 Async Init — Method Calls Before `graph.isReady`

**What goes wrong:** Cosmos.gl v3's constructor returns synchronously but the underlying WebGL device initializes asynchronously. Calling `graph.setPointPositions()` or `graph.start()` before `await graph.ready` silently queues the calls — but if the component has re-rendered and the graph ref has changed in the meantime, the queued calls execute against a stale instance.

**Prevention:**
- Always `await graph.ready` before any API call.
- Store the graph instance in a `useRef`; after `await ready`, check the ref still points to the same instance before calling methods.

**Phase:** Engine initialization layer.

---

### Pitfall m-2: `getSimulationAlpha()` / `getTrackedPointPositionsMap()` Return Stale Values During Pause

**What goes wrong:** After calling `graph.pause()`, `getTrackedPointPositionsMap()` returns a `ReadonlyMap` (changed in v2.4.0). Code that stored a reference to the returned Map and then mutated it directly fails silently in v2.4+.

**Prevention:**
- Always snapshot: `const snapshot = new Map(graph.getTrackedPointPositionsMap())`.
- Do not cache the Map reference across frames.

**Phase:** Layout snapshot / cache layer.

---

### Pitfall m-3: DuckDB-WASM Cold Start Blocking First Render

**What goes wrong:** The first query to DuckDB-WASM on a cold tab compiles the WASM module, initializes the worker, and loads any registered Parquet files. This can take 1-3 seconds. If the positions cache read is on the critical path before the graph renders, the canvas is blank for several seconds on first load.

**Prevention:**
- Initiate DuckDB warmup in a non-blocking background effect on route mount, not inline with graph initialization.
- Render the graph with default/random positions immediately; replace with cached positions once DuckDB resolves.
- The existing `canInitializeDuckDbInBrowser()` gate is a good pattern — extend it to also fire a background warmup call early.

**Phase:** Data layer / cold-start path.

---

### Pitfall m-4: Lasso Polygon Accumulates with Stale Graph Transform

**What goes wrong:** The lasso polygon is drawn in screen space. The graph engine applies its own pan/zoom transform. If the canvas has been panned or zoomed after a previous lasso, the screen-space polygon from the new lasso maps to different graph-space coordinates than intended.

**Prevention:**
- Always convert lasso screen coordinates to graph-space coordinates using the engine's current transform before calling `graph.selectPointsInPolygon()`.
- In Cosmos, the correct pattern is to pass screen-space polygon directly to the API — Cosmos handles the transform internally. Verify this is still true in the version in use; the API changed between v1 and v2.

**Phase:** Lasso integration layer.

---

### Pitfall m-5: Similarity Edges Accidentally Rendered as Visible Edges

**What goes wrong:** User-similarity links (kind: `"user-similarity"`) are used for clustering force only. If a code path passes all links to the engine without filtering by kind, similarity edges render as visible lines — making the graph look like a fully-connected hairball.

**This already happened** in the prior implementation (enforced via `rgba(0,0,0,0)` color hack in `colorForTopologyLink()`).

**Prevention:**
- Do not pass similarity links to the rendering engine at all. Pass them only to the physics/force computation.
- If the engine requires a single links array for both physics and rendering, set their color to fully transparent AND their width to 0, not just transparent color (transparent lines still consume GPU draw calls).
- Add a Vitest test that asserts `linkKind !== 'user-similarity'` for every entry in the rendered link array.

**Phase:** Engine integration / link layer.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Engine selection | Choosing Cosmos without verifying scale at user×project node count | Benchmark with N=500+ nodes before committing |
| Seed position math | Seeds ignored or rescaled away | Normalize to [-0.8, 0.8] sim space; verify via `getPointPositionsFloat32()` |
| Slider composition | Normalized weights cause interference | Use additive blend, unit-test with Vitest |
| Filter wiring | Full re-layout on filter change | Filter via opacity/size only; never mutate node array |
| 2D↔3D bridge | Position discontinuity on switch | Single canonical Float32Array outside the engine |
| Label overlay | FPS drop at scale | Viewport-gated rendering, zoom threshold |
| Lasso + pie | Index desync after re-filter | Resolve indices to nodeIds immediately on lasso release |
| DuckDB positions cache | Cold start blocking render | Background warmup, render immediately with fallback positions |
| Cosmos init | Method calls before `graph.isReady` | Always `await graph.ready` before any API call |
| Cluster coloring | Post-hoc community detection lying about structure | Color by DC parameter buckets, not edge-topology communities |
| WebGL cleanup | Context leak on route navigation | `graph.destroy()` in useEffect cleanup |
| Cosmos alpha | `getSimulationAlpha()` inversion | Document the `1 - progress` semantic; use named constant for threshold |

---

## Sources

- cosmosgl/graph releases: https://github.com/cosmosgl/graph/releases (HIGH confidence — official changelog)
- cosmosgl/graph issues: https://github.com/cosmosgl/graph/issues (MEDIUM confidence — open issues)
- react-force-graph issue #226 (re-render on node color change): https://github.com/vasturiano/react-force-graph/issues/226 (MEDIUM confidence)
- "Modularity clustering is force-directed layout" (Noack 2009): https://arxiv.org/pdf/0807.4052 (HIGH confidence — peer-reviewed)
- DuckDB-WASM + React main-thread blocking: https://medium.com/@hadiyolworld007/react-duckdb-wasm-at-60-fps-a00cafad3271 (MEDIUM confidence — community article, 2025)
- SVG vs Canvas vs WebGL label performance: https://dev.to/vitalf/svg-vs-canvas-vs-webgl-for-diagram-viewers-tradeoffs-bottlenecks-and-how-to-measure-34n7 (MEDIUM confidence)
- Codebase history: `.planning/codebase/CONCERNS.md`, `AccUsersGraph.tsx`, and memory notes (HIGH confidence — first-party evidence of actual failures)
- Cosmos alpha inversion: memory `project_cosmos_alpha_inversion` (HIGH confidence — confirmed in prior development cycle)
