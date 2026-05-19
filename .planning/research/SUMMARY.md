# Project Research Summary

**Project:** LECG Dashboard -- Access Analysis Spatial Graph Redesign
**Domain:** Multi-dimensional force-directed spatial graph (user x project topology)
**Researched:** 2026-05-19
**Confidence:** HIGH

---

## Executive Summary

The Access Analysis graph is being rebuilt from scratch because the prior implementation accumulated incompatible patches: math leaked into the rendering component, filter events triggered full re-layouts, and slider changes caused visible chaos. Research across all four dimensions converges on a single diagnosis -- the prior architecture had no enforced separation between math, physics, and rendering, so every fix created new breakage. The recommended architecture enforces six strict layers (data to math to physics to rendering to interaction to analytics bridge) with Float32Arrays as the inter-layer contract. This makes each layer independently unit-testable and prevents the patch-cycle from recurring.

Engine decision is settled: Cosmograph / cosmos.gl is disqualified. It is 2D-only with no 3D rendering support planned, its GPU-shader physics model cannot support runtime force-weight mutation, its v3 public API has a confirmed alpha-inversion bug documented in project memory, and v3.0.0-beta.9 is pre-release. The replacement is react-force-graph-2d v1.29.1 + react-force-graph-3d v1.29.1 -- both share d3-force-3d physics, expose identical React prop interfaces, and support numDimensions(2|3). 2D/3D switching is a v1 table-stakes requirement per PROJECT.md -- incorrectly classified as deferred in FEATURES.md because that researcher had not seen the Stack file. This summary adopts the Stack recommendation as authoritative.

The critical UX bet is continuous-blend slider math: each dimension (activity count, permission tier, recency, folder role) registers as a named custom force on the d3 simulation, and slider values map directly to force strengths. All sliders compose simultaneously with no mode switching. Filtering and search never restart the simulation; they update an alpha mask only. Positions are frozen to DuckDB-WASM on simulation settle, so any interaction event restores from cache rather than re-running physics. These three patterns (named forces, alpha mask, freeze-on-rest) eliminate the three most expensive bugs in the prior implementation.

---

## Key Findings

### Recommended Stack

The graph engine layer replaces @cosmos.gl/graph with react-force-graph-2d + react-force-graph-3d (both v1.29.1). These packages share d3-force-3d as their physics engine, supporting named force registration, runtime strength mutation, and numDimensions(2|3) -- all required for the slider composition architecture. three.js is already in the project at ^0.184.0; no new install needed for 3D. A custom canvas lasso overlay (~200 lines) replaces any native lasso (react-force-graph issue #520 confirms none exists). d3-force-cluster-3d provides semantic centroid attraction per dimension.

**Core technologies:**
- react-force-graph-2d v1.29.1: Default 2D canvas rendering; nodeCanvasObject for custom lasso overlay; d3Force() API for named composite forces
- react-force-graph-3d v1.29.1: 3D WebGL orbit mode; identical prop interface to 2D; nodeThreeObject for custom sprites; Three.js already present
- d3-force-3d 3.x: Physics simulation shared across both modes; simulation.force() for runtime strength mutation without restart
- d3-force-cluster-3d: Cluster attractor force compatible with 3D coordinate space
- d3-scale 3.x: Parameter normalization -- maps raw DC values to 0-1 force weights

Note on Cosmograph API references in FEATURES.md: setPointPositions maps to graphRef.current.d3Force() plus in-place position mutation on graphData. pointGreyoutOpacity maps to nodeCanvasObject with per-node alpha from the Float32Array mask. pointColorBy/pointSizeBy map to nodeColor and nodeVal props. Only physicsLayer.ts and GraphCanvas.tsx reference engine APIs directly.

### Expected Features

**Must have (table stakes) -- demo fails without these:**
- TS-1: Stable node positioning (no jitter, no flash) -- foundational
- TS-2: Freeze-on-rest position cache to DuckDB-WASM -- prevents re-layout on filter/search
- TS-3: Real-time filtering via alpha mask only (no re-layout)
- TS-4: Real-time search with zoom-to-match via alpha mask only
- TS-5: Alpha mask as the one interaction primitive (Float32Array per-node opacity)
- TS-6 + TS-7: Dimension sliders with continuous-blend math -- all sliders compose simultaneously
- TS-8: Hover detail panel (name, email, project, role, last sign-in, activity count)
- TS-9: Click-isolate (clicked node + same-project neighbors = full alpha; others = 0.15)
- TS-10: Lasso selection to nodeIds[] (custom canvas overlay, not built-in)
- 2D/3D switching (reclassified from DIF-3 deferred to table-stakes per PROJECT.md)

**Should have (ship for demo if time allows):**
- DIF-2: Lasso to pie chart via SelectionBridge (highest visual impact; M complexity)
- DIF-5: Node size + opacity encoding by activity and recency (S complexity)
- DIF-4: Cluster hull overlays via d3-polygon (M complexity; post-physics rendering only)
- DIF-1: Semantic seed positioning on first load (M complexity; same math as slider composition)

**Defer to post-demo:**
- DIF-6: Multi-select via Shift+click
- DIF-7: Toolbar with full mode controls

**Never ship (anti-features):**
- AF-1: Visible similarity edges -- similarity is positional only, never rendered
- AF-2: Manual sync/refresh UI -- sync is automatic via Task Scheduler
- AF-3 through AF-7: Graph undo/history, link rendering, server-side physics, tutorial overlays, UMAP/t-SNE

### Architecture Approach

Six strict layers with unidirectional data flow: Postgres to dataLayer.ts to mathLayer.ts to physicsLayer.ts to GraphCanvas.tsx to GraphInteractions.tsx to SelectionBridge.tsx. The critical invariant is that GraphCanvas.tsx imports nothing except Float32Array positions, Float32Array alphaMask, and string[] nodeIds -- no slider values, no feature columns, no physics params. Math lives exclusively in mathLayer.ts (pure TypeScript, zero React/engine imports) for unit-testing in Vitest without a DOM. The prior ~4242-line AccUsersGraph.tsx monolith violated this by mixing all concerns.

**Major components:**
1. lib/graph/dataLayer.ts -- Fetches from Postgres via tRPC, builds Arrow table one row per (user, project), registers DuckDB-WASM views
2. lib/graph/mathLayer.ts -- Pure TS: computeTargetPositions(features[], sliders[]) -> Float32Array; slider composition math with evenly-distributed axis angles; no React, no engine
3. lib/graph/physicsLayer.ts -- Wraps react-force-graph simulation; maps sliderValues to named d3 force strengths; emits positionSnapshot Float32Array; freeze-on-rest via positionsCache.ts
4. components/graph/GraphCanvas.tsx -- Renders ForceGraph2D or ForceGraph3D based on mode prop; nodeCanvasObject for lasso overlay and alpha mask; never remounts on mode switch
5. components/graph/GraphInteractions.tsx -- Filter/search/lasso/click-isolate; emits alphaMask Float32Array and selectedNodeIds string[]; never touches positions
6. components/graph/SelectionBridge.tsx -- selectedNodeIds[] to DuckDB query to ChartDatum[] to pie chart; fully isolated from physics

2D/3D continuity mechanism: Both ForceGraph2D and ForceGraph3D use d3-force-3d and mutate the same graphData node objects in-place (node.x, node.y, node.z). On switch: freeze positions to fx/fy/fz, mount the other component with the same graphData object reference, then clear fixed constraints after 1 frame. A single stable graphDataRef is the key -- never pass a new object on switch.

### Critical Pitfalls

1. Physics-filter coupling (C-1) -- Filter events that restart the simulation cause the most visible breakage. Prevention: alpha mask only; never change the node array or call simulation restart on filter.

2. Seed positions ignored (C-3) -- Without semantic seeds the graph opens as a hairball and sliders appear broken. Prevention: compute seed positions from DC parameters via mathLayer before engine start; pass with fx/fy pinning, then release.

3. Slider state coupled to physics restart (C-4) -- Mapping slider values directly to physics config causes mid-drag chaos. Prevention: sliders update named force strengths via simulation.force() + d3ReheatSimulation() only -- not a full restart.

4. Non-monotonic slider UX from naive weight normalization (M-6) -- Normalized weights cause one slider to steal from others. Prevention: additive blend -- not normalized to a fixed total force budget.

5. React re-render storms triggering layout reset (M-1) -- Tooltip/filter re-renders cause engine restart. Prevention: engine lives in useRef; tooltip and filter UI in sibling subtree; use SliderContext, SelectionContext, FilterContext separately.

De-prioritized pitfalls (Cosmograph-specific, eliminated by engine switch):
- C-2: Cosmos.gl getSimulationAlpha() inversion -- d3-force-3d uses standard alpha semantics
- C-5 / M-7: setPointPositions rescaling -- react-force-graph uses direct node object mutation
- m-1: Cosmos async graph.ready race -- react-force-graph uses synchronous React ref pattern

---

## Implications for Roadmap

The architecture build order is the roadmap. Each layer must be independently verifiable before the next layer is built.

### Phase 1: Data + Math Foundation (no UI, no engine)
**Rationale:** Math that cannot be unit-tested is the root cause of the prior patch cycle.
**Delivers:** dataLayer.ts (Arrow table from Postgres), mathLayer.ts (slider composition), Vitest suite for all slider state combinations
**Addresses:** TS-6, TS-7, TS-2 (cache schema)
**Avoids:** C-4 (slider-physics coupling), M-6 (normalization interference)
**Gate:** computeTargetPositions() passes all Vitest unit tests with no React/engine deps

### Phase 2: Physics Layer (engine integration, no render)
**Rationale:** Engine selection is decided; wire the physics API. Confirm freeze-on-rest and named force mutation.
**Delivers:** physicsLayer.ts, engine installed (react-force-graph-2d@1.29.1 + react-force-graph-3d@1.29.1), positionsCache.ts confirmed, simulation.force() mutation verified
**Avoids:** C-1 (physics-filter coupling), C-3 (seed positions ignored)
**Gate:** Positions array stable after settle; filter event does NOT restart simulation

### Phase 3: Rendering Layer (2D canvas, then 3D switch)
**Rationale:** Once physics produces a stable Float32Array, wire the renderer as a dumb consumer. 2D first, then confirm 2D/3D switch via shared graphData reference.
**Delivers:** GraphCanvas.tsx (2D), 2D/3D mode switch, custom lasso overlay, alpha mask rendering
**Avoids:** C-6 (position discontinuity on switch), Anti-Pattern 4 (remount on switch)
**Gate:** Mode switch has no flicker; no math inside GraphCanvas

### Phase 4: Interaction Layer
**Rationale:** With stable positions and a working canvas, wire user-facing interactions. All interactions update alpha mask only.
**Delivers:** GraphInteractions.tsx (filter, search, lasso, click-isolate), SelectionBridge.tsx (lasso to DuckDB to pie chart)
**Addresses:** TS-3, TS-4, TS-5, TS-8, TS-9, TS-10, DIF-2
**Avoids:** M-3 (lasso index desync), m-4 (lasso coordinate transform)
**Gate:** Lasso to pie chart populated; filter causes no position change

### Phase 5: Slider UX + Polish
**Rationale:** Slider UI is the last layer; continuous-blend animation is only verifiable when all other layers work.
**Delivers:** SliderContext, per-dimension slider UI (0-100), d3ReheatSimulation() on change, DIF-1 semantic seeds, DIF-4 cluster hulls, DIF-5 node size/opacity encoding
**Addresses:** TS-6, TS-7, DIF-1, DIF-4, DIF-5
**Gate:** Continuous blend visibly correct across all slider combinations; camera-ready demo animation

### Phase Ordering Rationale

- Math before physics before rendering: renderer consumes Float32Array from physics, which consumes targetPositions from math.
- 2D before 3D in Phase 3: 2D is the lasso-capable mode; 3D switch is a prop change on a working component.
- Interactions before polish: lasso to pie chart (DIF-2) is the highest-impact demo feature.
- Vitest gates between phases prevent building on untested foundations.

### Research Flags

Phases with well-documented patterns (skip deeper research):
- Phase 1 (data + math): d3-force-3d API well-documented; slider math explicit in ARCHITECTURE.md
- Phase 2 (physics): react-force-graph API documented in official repo; named force mutation is standard d3
- Phase 5 (polish): Label overlay, node encoding, cluster hulls are standard Canvas 2D / d3-polygon patterns

Phases needing spot research:
- Phase 3 (2D/3D switch): graphData object reference sharing should be prototyped immediately -- highest implementation risk
- Phase 4 (lasso overlay): screen-to-graph-space coordinate transform needs working reference; community gist is MEDIUM confidence only

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Engine disqualification verified via official repos and npm; version numbers confirmed; Three.js already in project |
| Features | HIGH | Derived from PROJECT.md requirements + ARCHITECTURE.md contracts; Cosmograph API refs remapped |
| Architecture | HIGH | Derived from existing codebase analysis; layer boundaries explicit and verified against actual file structure |
| Pitfalls | HIGH | Grounded in first-party failure history; Cosmos-specific pitfalls deprioritized since engine is replaced |

**Overall confidence: HIGH**

### Gaps to Address

- Lasso canvas overlay coordinate transform: screen-to-graph-space under pan/zoom referenced via community gist (MEDIUM confidence). Validate early in Phase 3.
- react-force-graph 2D/3D shared graphData object behavior: internally consistent but not benchmarked at project node count. Prototype at Phase 2/3 boundary.
- DuckDB-WASM main-thread blocking (Pitfall M-2): duckdbClient.ts warmup pattern should be audited for DuckDBSharedWorker. Flag for Phase 1.
- d3-force-cluster-3d version: MEDIUM confidence; verify 3D coordinate space compatibility before Phase 2 install.

---

## Conflict Resolution Record

FEATURES.md vs STACK.md on 3D mode and engine choice:
- FEATURES.md assumed Cosmograph as the engine and classified 2D/3D as DIF-3 deferred (parallel research; did not see Stack file).
- STACK.md disqualified Cosmograph (2D-only confirmed, no runtime force mutation) and recommended react-force-graph-2d + react-force-graph-3d.
- PROJECT.md is authoritative: Seamless 2D spatial to 3D orbit switching is listed under Active requirements, not deferred.
- Resolution adopted: Stack recommendation accepted. 2D/3D switching reclassified as table-stakes. Cosmograph API references remapped to react-force-graph equivalents. Cosmos.gl-specific pitfalls deprioritized.

---

## Sources

### Primary (HIGH confidence)
- react-force-graph GitHub (vasturiano) -- engine API, 2D/3D mechanism, lasso issue #520
- react-force-graph-2d npm v1.29.1 and react-force-graph-3d npm v1.29.1 -- verified current versions
- d3-force-3d GitHub (vasturiano) -- named force API, numDimensions
- .planning/PROJECT.md -- topology, active requirements, constraints (authoritative)
- .planning/research/ARCHITECTURE.md -- layer contracts, slider math formula, build order
- .planning/research/STACK.md -- engine comparison, 2D/3D continuity mechanism
- cosmos.gl/graph GitHub -- 2D-only confirmed, no 3D planned
- Codebase: AccUsersGraph.tsx, positionsCache.ts, graphSql.ts, userSimilarity.ts
- Project memory: cosmos_alpha_inversion, feedback_similarity_positional_only, project_user_project_instances

### Secondary (MEDIUM confidence)
- d3-force-cluster-3d npm -- version compatibility needs validation
- Lasso canvas overlay gist -- reference implementation
- DuckDB-WASM + React main-thread blocking (community article, 2025)
- react-force-graph issue #226 -- re-render triggers layout reset

### Tertiary (LOW confidence / not applicable to chosen stack)
- cosmosgl/graph releases + issues -- historical context; not applicable post-engine-switch
- sigma.js, reagraph, deck.gl, vis.js -- evaluated and rejected; documented in STACK.md

---

*Research completed: 2026-05-19*
*Ready for roadmap: yes*
