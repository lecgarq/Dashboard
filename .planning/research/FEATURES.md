# Feature Landscape

**Domain:** Multi-dimensional spatial graph visualization — user × project access-analysis
**Researched:** 2026-05-19
**Overall confidence:** HIGH — Cosmograph API verified against live docs; d3-force and sigma.js verified via official sources; architecture alignment verified against `.planning/research/ARCHITECTURE.md`

---

## Context: What This Feature Map Is For

This document maps every graph visualization feature the Access Analysis slice needs. Features are categorized by necessity (table stakes vs differentiator vs anti-feature), sized by implementation complexity (S/M/L), and cross-referenced to the six-layer architecture already decided in `ARCHITECTURE.md`.

The architecture already resolves the hardest structural question: math lives in `mathLayer.ts`, rendering in `GraphCanvas.tsx`, interactions in `GraphInteractions.tsx`. Features below map cleanly into that structure without violating its layer contracts.

**Scale context:** One node per (user, project). At LECG: ~50–200 users × ~10–30 projects = 500–6000 nodes. Every feature below is evaluated at this scale, not at millions-of-nodes scale (that's Graphistry's problem, not ours).

---

## Table Stakes

Features without which the demo fails or the graph feels like every other force-directed demo.

---

### TS-1: Stable Node Positioning (No Jitter / No Flash)

**Why expected:** Every prior attempt broke here. Nodes that jitter, flash on filter, or jump on slider change signal a broken implementation to any viewer.
**Complexity:** M
**Architecture layer:** `physicsLayer.ts`
**How it works in this architecture:**
- `freeze-on-rest` pattern: once the simulation settles (`isSettled=true`), `currentPositions` are cached to DuckDB-WASM `positions` table keyed by `hashNodeSet(nodeIds)`
- Filter/search events apply an alpha mask only — they never touch positions or restart the simulation (Pattern 3 from ARCHITECTURE.md)
- Slider changes re-warm the physics from the current frozen positions, not from scratch
**Failure mode if skipped:** Demo unusable. Cannot un-skip.
**Dependencies:** Requires freeze-on-rest cache (TS-2), requires alpha mask pattern (TS-5).

---

### TS-2: Freeze-on-Rest Position Cache

**Why expected:** Without position persistence, every filter toggle causes full re-layout. This was the most-complained-about bug in the previous iteration.
**Complexity:** S
**Architecture layer:** `physicsLayer.ts` → DuckDB-WASM `positions` view
**How it works:**
- On `isSettled=true`, serialize `currentPositions: Float32Array` and write to DuckDB
- Key: `hashNodeSet(nodeIds)` — deterministic hash of the current active node set
- On filter toggle: restore frozen positions from cache, apply new alpha mask
- On slider change: restore frozen positions as starting point, re-warm with new `targetPositions`
**Existing pattern:** `positionsCache.ts` partial scaffolding already exists in `access-analysis/`
**Dependencies:** None. This is foundational.

---

### TS-3: Real-Time Filtering — Dim / Hide Without Re-layout

**Why expected:** Users must be able to narrow to a project, a role tier, or an external/internal dimension and see the graph respond immediately without losing spatial context.
**Complexity:** S
**Architecture layer:** `GraphInteractions.tsx` → `alphaMask: Float32Array`
**UX contract:**
- Filtered-out nodes: `alphaMask[i] = 0.15` (dimmed but spatially present, ghost)
- Filtered-in nodes: `alphaMask[i] = 1.0`
- Zero simulation restart on filter event
- DuckDB query: `SELECT DISTINCT node_id FROM user_projects WHERE <filter>` — executes in <20ms at 6000 nodes
**Filter facets to expose (minimum for demo):**
1. Project (by projectId)
2. Role tier (admin / member / view-only)
3. External vs internal user
4. Activity level (active in last 30/90/180 days)
**Dependencies:** TS-2 (frozen positions). Independently testable from physics layer.

---

### TS-4: Real-Time Search — Highlight + Focus Without Re-layout

**Why expected:** If a user wants to find "Martinez" in a 200-node graph, they type and expect instant highlight. Nodes that move during a search are disorienting.
**Complexity:** S
**Architecture layer:** `GraphInteractions.tsx` → `alphaMask: Float32Array`
**UX contract:**
- Matching nodes: `alphaMask[i] = 1.0`, zoom-to-fit of matching bounding box via `Cosmograph.fitView()` or equivalent
- Non-matching nodes: `alphaMask[i] = 0.15` (dim but present)
- Match logic: case-insensitive substring against `user_id` (email) and display name
- Zero simulation restart on search event
- On search clear: restore full alpha mask, return to previous zoom
**Dependencies:** TS-2 (frozen positions), TS-3 (alpha mask already built).

---

### TS-5: Alpha Mask as the One Interaction Primitive

**Why expected:** This is the architecture's core contract, not a feature the user sees — but without it, every interaction feature regresses to the "restart physics" anti-pattern.
**Complexity:** S
**Architecture layer:** `GraphCanvas.tsx` input contract
**How it works:**
- `alphaMask: Float32Array` with one float per node, range [0.0, 1.0]
- `GraphCanvas.tsx` uses it for node opacity only — no positional meaning
- Cosmograph exposes `pointGreyoutOpacity` for non-selected points; a custom alpha mask overrides per-node opacity where the engine supports it. Where it does not (Cosmos.gl GPU path), the mask maps to the engine's point selection/greyout API
**Dependencies:** None. Must be established before TS-3, TS-4, DIF-5.

---

### TS-6: Dimension Sliders — Continuous Blend Math (0 = Organic / 100 = Clustered)

**Why expected:** This is the core UX bet of the entire redesign. Sliders that feel like mode-switching (snap from one layout to another) will feel broken. Sliders that produce smooth, continuous position blending will feel like a professional tool.
**Complexity:** M
**Architecture layer:** `mathLayer.ts` → `physicsLayer.ts`
**The math contract (verbatim from ARCHITECTURE.md):**

```
Let D = number of active dimension sliders
Let s_d = slider value for dimension d ∈ [0, 1]   (UI 0-100 mapped to 0.0-1.0)
Let f_d(node) = feature score for dimension d ∈ [0, 1]  (normalized feature column)
Let angle_d = (d / D) * 2π   — evenly distributed seed directions on a circle

Seed direction for dim d: u_d = (cos(angle_d), sin(angle_d))
Contribution from dim d: t_d(node) = u_d × f_d(node) × s_d

finalTarget(node) = Σ_d(t_d) / max(Σ_d(s_d), ε)
```

**UX contracts:**
- All sliders at 0 → organic/diffuse mode: physics runs as free repulsion-only sim from last frozen positions
- One slider at 100 → nodes cluster along that dimension's axis by feature strength
- Two sliders at 50 each → continuous blend, nodes pulled toward both axes simultaneously; no jump, no mode switch
- Slider move → re-compute `targetPositions` → re-warm physics from frozen positions at low alpha → settle to new arrangement
**Slider UI specs:**
- Each slider labeled with dim name and feature mapping (e.g. "Activity" → activityCount normalized)
- Range: 0–100 with integer steps
- Debounce: 50ms before re-warm (prevents per-frame re-layout during drag)
- Minimum 4 dims for demo: Activity, Permission Tier, Recency (last sign-in), Admin
**Dependencies:** TS-2 (frozen positions as starting point for re-warm). Requires Vitest unit tests (Pattern 1 from ARCHITECTURE.md).

---

### TS-7: Slider Composition UX Contract (Multiple Sliders Active Simultaneously)

**Why expected:** If two sliders fight each other and produce confusing layouts, the user cannot make sense of the graph. The composition must be perceptually correct.
**Complexity:** M (same layer as TS-6, but the UX contract is its own testable surface)
**Architecture layer:** `mathLayer.ts`
**Composition math verified:**
- Normalization by `Σ(s_d)` means total canvas spread is preserved regardless of how many sliders are active — canvas does not collapse to a point when all sliders are at 50
- Evenly distributed axis angles `(d/D)×2π` means multiple active sliders pull in maximally-different directions — users can read each dimension's spatial axis independently
- A slider at 0 contributes zero force — setting it to 0 is the same as removing the dimension, no discontinuity
**UX validation test:** With two sliders both at 100, all nodes should form two visible clusters pulled to opposite sides of the canvas. Moving one slider from 100 to 0 smoothly resolves the graph to a single-axis layout. This must be demoed live.
**Dependencies:** TS-6. Must share the same `computeTargetPositions()` function — not a separate code path.

---

### TS-8: Hover Detail Panel

**Why expected:** Clicking through a graph with no context about what each node is defeats the purpose.
**Complexity:** S
**Architecture layer:** `GraphCanvas.tsx` → `onNodeHover` callback → tooltip component
**Fields to show on hover:**
- Display name + email
- Project name
- Role(s)
- Last sign-in (relative: "3 days ago")
- Activity count (last 90 days)
- Permission tier label (Admin / Folder Editor / View-only)
**Implementation:** Floating div positioned at cursor, populated from the `NodeFeatures` row for the hovered node ID (already in memory from dataLayer)
**Dependencies:** TS-3 (node IDs must be stable). No physics dependency.

---

### TS-9: Click-Isolate (Node + Neighbors)

**Why expected:** For a user asking "who works with Martinez on Project Alpha?", click-isolate is the minimum viable exploration flow.
**Complexity:** S
**Architecture layer:** `GraphInteractions.tsx`
**UX contract:**
- Single click on node: dim all other nodes to 0.15 alpha; clicked node + same-project neighbors = 1.0
- Click on background: restore full alpha mask
- Does NOT restart simulation or move positions
**"Neighbors" definition:** Nodes sharing the same `project_id` as the clicked node (since we have no visible edges; similarity is positional-only per memory `feedback_similarity_positional_only.md`)
**Dependencies:** TS-5 (alpha mask), TS-2 (frozen positions must be preserved).

---

### TS-10: Lasso Selection → Node Set

**Why expected:** Without selection, the graph is read-only. Lasso is the entry point to all downstream analytics.
**Complexity:** M
**Architecture layer:** `GraphCanvas.tsx` → `onLassoEnd(nodeIds[])` → `SelectionBridge.tsx`
**Engine support verified:** Cosmograph exposes `selectPointsInPolygon()` and `onPolygonSelected()` callback (HIGH confidence, verified against cosmograph.app/docs-lib/api 2026-02-doc). Method formerly called "lasso", renamed to "polygon selection" with lasso kept as deprecated alias.
**UX contract:**
- Hold Shift (or dedicated lasso button in toolbar) to activate lasso mode
- Draw rect or polygon on canvas
- Engine fires `onPolygonSelected()` with selected point indices
- Map indices → `nodeIds[]` → emit `selectedNodeIds` up to `AccessAnalysisPage`
- Selected nodes: alpha = 1.0; non-selected: alpha = 0.15 (visual feedback of selection)
- Clear selection: click background
**Dependencies:** TS-5 (alpha mask for visual feedback), TS-2 (positions unchanged during lasso).

---

## Differentiators

Features that make this graph feel like a professional analysis tool, not a force-directed demo.

---

### DIF-1: Semantic Seed Positioning (Deterministic Initial Layout from Tabular Features)

**Why valuable:** Most force-directed graphs initialize with random positions and produce different layouts each run. A graph that opens with positions already reflecting data semantics (active users toward one quadrant, admins toward another) is immediately interpretable, not a hairball users have to mentally decode each time.
**Complexity:** M
**Architecture layer:** `mathLayer.ts` — `seedPositions(features[], dims[]) → Vec3[]`
**How it works:**
- On first mount (no cached positions), compute `seedPositions` using feature columns only
- This is the same math as `computeTargetPositions` but with sliders set to a "soft default" (e.g. s_activity=0.4, s_permission=0.3, all others 0) instead of all-zero
- d3-force supports `simulation.randomSource()` with a seeded LCG for deterministic initial placement (HIGH confidence, verified from d3-force official docs)
- Cosmograph equivalent: pre-set `x`, `y` coordinates on each point before simulation start
- Result: same data → same initial layout, every time. Users develop spatial memory.
**UX contract:**
- First load: graph opens with positions reflecting default seed configuration
- User adjusts sliders: smooth continuous blend from seed to fully-clustered
- Re-open next session: same initial layout (restored from positionsCache if available, else re-seeded)
**Dependencies:** TS-6 (slider math), TS-2 (cache takes precedence over re-seeding).

---

### DIF-2: Lasso → Pie Chart Downstream Analytics

**Why valuable:** Lasso selection without downstream analytics is just node-counting. The pie chart turns a spatial selection into a statistical breakdown — "I selected this cluster: here's what roles it contains."
**Complexity:** M
**Architecture layer:** `SelectionBridge.tsx` → DuckDB query → `PieChartWidget`
**How it works:**
- `SelectionBridge` receives `selectedNodeIds: string[]` from lasso or click-isolate
- DuckDB query: `SELECT project_id, role_tier, COUNT(*) FROM user_projects WHERE node_id IN (...) GROUP BY project_id, role_tier`
- Results → `ChartDatum[]` → rendered as pie or donut chart in analytics panel
- Chart updates in real-time as user changes lasso region
**Pie breakdown dimensions (selectable via chart control):**
1. By project (which projects are in this cluster?)
2. By role tier (admin / member / view-only breakdown)
3. By internal vs external user
4. By activity level bucket (active / dormant / inactive)
**Dependencies:** TS-10 (lasso selection). DuckDB views must already be populated (TS-1 via dataLayer). Completely isolated from physics — bridge reads DuckDB only.

---

### DIF-3: 2D Spatial ↔ 3D Orbit Switching with Position Continuity

**Why valuable:** 2D is better for lasso and annotation reading. 3D is better for visualizing dense clusters as depth-separated clouds. A toggle that preserves positions (rather than resetting) lets users use both modes as complementary views of the same spatial truth.
**Complexity:** L
**Architecture layer:** `GraphCanvas.tsx` — `mode: "2d" | "3d"` prop
**How it works (from ARCHITECTURE.md):**
- 2D mode: render (x, y) from `Float32Array positions`, z = 0
- 3D mode: same (x, y) + z computed from a secondary feature column (e.g. `lastSignInMs` normalized to [-1, 1] range) or from a third simulation axis if engine supports it
- Switch does NOT remount the canvas — `mode` prop change only; engine receives updated coordinate array
- Engine must support coordinate injection without position reset
**Engine constraint:** Cosmograph (Cosmos.gl) is 2D-only by architecture. If 3D orbit is required for demo, `react-force-graph-3d` (Three.js + d3-force-3d) is the alternative. The architecture's `GraphCanvas.tsx` abstraction allows engine swap without affecting other layers.
**Complexity driver:** The "L" rating reflects that 3D adds a new coordinate axis that must be fed through `mathLayer.ts`, `physicsLayer.ts`, and `GraphCanvas.tsx`. The position continuity contract is achievable but requires care: on switch 2D→3D, inject (x, y, featureZ) into the 3D engine; on switch 3D→2D, read back (x, y) and pass to 2D engine.
**Risk:** If Cosmograph remains the engine, 3D is not available natively. The recommendation is: ship 2D first (for the demo), gate 3D as a follow-up milestone with engine re-evaluation.
**Dependencies:** TS-6 (positions must carry 3-component vectors), DIF-1 (semantic seed must include z-axis assignment). Not required for demo.

---

### DIF-4: Cluster Annotations — Hulls, Labels, Color Bands

**Why valuable:** A graph of 500+ nodes without cluster boundaries is a spatial puzzle. Convex hull overlays + cluster labels turn the spatial arrangement into a readable map ("this region is Project Alpha admins").
**Complexity:** M
**Architecture layer:** SVG overlay on top of `GraphCanvas.tsx` canvas
**How it works:**
- Cluster membership derived from feature columns (e.g. `project_id` = cluster, or `role_tier` = cluster)
- On settled positions: compute convex hull for each cluster using `d3-polygon` (convexHull)
- Render hull as filled SVG `<path>` with low-opacity fill + colored stroke
- Cluster label positioned at hull centroid
- Hulls update only on position settle — never on every tick (performance)
- Color: each project gets a hue from a discrete palette; role-tier clusters use lightness variation
**Cluster modes (switchable):**
1. Cluster by project (default)
2. Cluster by role tier
3. Cluster by company/external vs internal
**Dependencies:** TS-1 (stable positions), TS-6 (sliders drive where clusters form). Hulls are a post-physics rendering concern — no physics dependency.

---

### DIF-5: Confidence / Weight Visualization — Node Size and Opacity by Feature Strength

**Why valuable:** All nodes rendered at the same size treat a user with 1 activity the same as a user with 500 activities. Visual weight encoding encodes the data before the user reads any label.
**Complexity:** S
**Architecture layer:** `GraphCanvas.tsx` — driven by `NodeFeatures` metadata columns
**Encoding scheme:**
- Node size: `activityCount` normalized → `pointSizeRange [2, 12]px` (Cosmograph: `pointSizeBy` column config)
- Node base opacity: `lastSignInMs` recency → more recent = more opaque (partially overridden by `alphaMask`)
- Node color: categorical by project (Cosmograph: `pointColorBy` column)
- Halo / glow: reserved for "admin" flag — admin nodes get a subtle ring (CSS/SVG layer outside canvas)
**Cosmograph API:** `pointSizeBy`, `pointColorBy`, `pointOpacity`, `pointGreyoutOpacity` are all documented configuration options (HIGH confidence, verified).
**Dependencies:** dataLayer must expose the feature columns as Cosmograph `data` columns. No physics dependency.

---

### DIF-6: Multi-Select via Keyboard + Click

**Why valuable:** Lasso is the primary selection tool, but power users want to build a selection by clicking individual nodes while holding Shift.
**Complexity:** S
**Architecture layer:** `GraphInteractions.tsx`
**UX contract:**
- Shift + click: add node to current selection (accumulate `selectedNodeIds[]`)
- Shift + click on selected node: remove from selection
- Escape: clear selection
- Selection drives same `SelectionBridge` as lasso
**Dependencies:** TS-10 (lasso and multi-select share `selectedNodeIds[]` state). TS-9 (click-isolate must be mode-switched off when multi-select is active — cannot both be active simultaneously).

---

### DIF-7: Toolbar with Mode Controls (Lasso / Pan / Zoom / 3D toggle)

**Why valuable:** Mode controls signal to the user that this is an interactive exploration tool, not a static graph image. Without an explicit toolbar, lasso mode is undiscoverable.
**Complexity:** S
**Architecture layer:** UI component, outside graph layers
**Controls:**
1. Pan mode (default): drag to pan
2. Lasso mode: drag draws selection polygon
3. Reset view: `fitView()` call
4. 2D / 3D toggle (if DIF-3 is shipped)
5. Slider panel toggle (collapse/expand the dimension sliders)
**Dependencies:** TS-10 (lasso), DIF-3 (3D toggle). Toolbar itself is trivial; its value is discoverability.

---

## Anti-Features

Things explicitly NOT to build in this milestone.

---

### AF-1: Visible Similarity Edges

**What it is:** Drawing edges between nodes based on the similarity score computed in `userSimilarity.ts`.
**Why it's an anti-feature:** Explicitly ruled out by memory `feedback_similarity_positional_only.md`. Similarity dimensions drive position and clustering — they NEVER render as visible edges or nodes. Drawing them would violate the core design contract.
**What to do instead:** Similarity is expressed through node proximity. Nodes with high mutual similarity end up spatially close when the relevant sliders are active. The spatial arrangement IS the similarity visualization.

---

### AF-2: Manual Sync / Refresh UI

**What it is:** "Sync All" button, "Refresh" button, stale-cache banner in the graph UI.
**Why it's an anti-feature:** Memory `feedback_no_manual_sync_ui.md` — sync is fully automatic via Windows Task Scheduler. Adding manual sync buttons implies fragility and creates a UX expectation that the user manages data freshness manually.
**What to do instead:** Show "last updated: X hours ago" as passive metadata. No action required.

---

### AF-3: Graph-Level Undo / History

**What it is:** Ctrl+Z to undo a filter, a lasso, or a slider position.
**Why it's an anti-feature:** History state is expensive to maintain across the physics/interaction/selection stack. There is no user story that requires it. The cost/benefit is negative at this scale and deadline.
**What to do instead:** All state is immediately reversible without undo: clear lasso (click background), reset slider (drag to 0), clear filter (click facet again). No history needed.

---

### AF-4: Link / Edge Rendering Between (user, project) Nodes

**What it is:** Drawing explicit graph edges (lines) between node pairs.
**Why it's an anti-feature:** The topology is one-node-per-(user, project). There is no meaningful "link" between two (user, project) instances — they are independent data points. Drawing edges would require fabricating a relationship that does not exist in the schema. This is also a Cosmos.gl anti-pattern: the engine is optimized for point clouds, not dense edge meshes.
**What to do instead:** Cluster-by-project hull annotations (DIF-4) visually group nodes that share a project without fabricating links.

---

### AF-5: Server-Side Physics Calculation

**What it is:** Running force simulation on the Node.js server and streaming positions to the client.
**Why it's an anti-feature:** tRPC queries inside the physics tick loop cause network latency in the animation loop (Anti-Pattern 5 in ARCHITECTURE.md). All physics runs client-side in `physicsLayer.ts`. Data is loaded into DuckDB-WASM at mount — slider changes trigger CPU-only recalculation.
**What to do instead:** Client-side physics with WebGL GPU acceleration (Cosmograph/Cosmos.gl path) or WebWorker offloading if main-thread jank appears.

---

### AF-6: Embedded Legend / Tutorial Overlays

**What it is:** On-graph legend boxes, tour tooltips, or instruction overlays within the graph canvas.
**Why it's an anti-feature:** This is an internal tool for a small team (Luis + direct reports). Adding tutorial overlays optimized for first-time external users wastes build time and clutters the UI.
**What to do instead:** Clear slider labels, dim/highlight behavior, and the hover tooltip are self-evident to the audience. Documentation can live in the dashboard's existing help surface, not in the graph.

---

### AF-7: UMAP / t-SNE Pre-Processing on Node Data

**What it is:** Running dimensionality reduction algorithms (UMAP, t-SNE, PCA) on node feature vectors as a pre-processing step, using their embedding coordinates as initial positions.
**Why it's an anti-feature:** UMAP/t-SNE require a Python or WebAssembly runtime (significant bundle cost), take 1–30 seconds to converge at 6000 nodes, and produce positions that cannot be continuously blended against sliders. The slider-composition math in `mathLayer.ts` is explicitly designed as a lightweight alternative that runs in <15ms on the client.
**What to do instead:** The semantic seed positioning (DIF-1) achieves the same "data-grounded starting layout" goal without the compute overhead or the toolchain dependency.

---

## Feature Dependencies Map

```
TS-2 (freeze-on-rest)
  └─ TS-1 (stable positioning)
  └─ TS-3 (filter without re-layout)
  └─ TS-4 (search without re-layout)
  └─ TS-6 (slider re-warm from frozen)
  └─ DIF-1 (seed takes precedence over cache)

TS-5 (alpha mask primitive)
  └─ TS-3 (filter → alpha mask)
  └─ TS-4 (search → alpha mask)
  └─ TS-9 (click-isolate → alpha mask)
  └─ TS-10 (lasso selection → alpha mask feedback)

TS-6 (slider math)
  └─ TS-7 (multi-slider composition — same function)
  └─ DIF-1 (semantic seed — same function with default weights)
  └─ DIF-3 (3D needs third axis from slider math)

TS-10 (lasso → nodeIds)
  └─ DIF-2 (lasso → pie chart via SelectionBridge)
  └─ DIF-6 (multi-select — shared selectedNodeIds[])

DIF-4 (cluster hulls) depends on TS-1 (stable positions), TS-6 (sliders determine clusters)
DIF-5 (node size/opacity encoding) depends on dataLayer feature columns — no physics dep
DIF-7 (toolbar) depends on TS-10, DIF-3

TS-8 (hover tooltip) — no physics dep, standalone
TS-9 (click-isolate) — depends on TS-5 only
DIF-6 (multi-select) — depends on TS-10, TS-9 (mode-switch conflict resolution)
```

---

## MVP Recommendation (Demo 2026-05-19 19:00)

**Must ship (demo fails without these):**
1. TS-1 — Stable positioning (no jitter)
2. TS-2 — Freeze-on-rest cache
3. TS-3 — Filter → alpha mask (no re-layout)
4. TS-4 — Search → alpha mask + zoom-to-match
5. TS-5 — Alpha mask primitive (architectural prerequisite)
6. TS-6 + TS-7 — Dimension sliders with continuous-blend math
7. TS-8 — Hover tooltip
8. TS-9 — Click-isolate
9. TS-10 — Lasso selection

**Ship for demo if time allows:**
- DIF-2 — Lasso → pie chart (highest visual impact, M complexity, needed for "demo" framing)
- DIF-5 — Node size/opacity by activity (S complexity, pure config in Cosmograph)
- DIF-4 — Cluster hull overlays (M complexity, requires d3-polygon post-physics)
- DIF-1 — Semantic seed positioning (M complexity, makes first-load immediately readable)

**Defer post-demo:**
- DIF-3 — 2D↔3D switching (L complexity, engine-choice implications)
- DIF-6 — Multi-select via keyboard (S, but not in demo script)
- DIF-7 — Toolbar (S, but toolbar without 3D toggle is less valuable)

**Never ship (anti-features stand):**
- AF-1 through AF-7 — all explicitly ruled out

---

## Slider Composition: UX Contract Summary

This is the most novel feature of the graph. Its UX contract needs to be explicit enough to test.

| Slider State | Expected Behavior | Visual Signal |
|---|---|---|
| All sliders at 0 | Organic/diffuse: free repulsion, no attraction target | Loose cloud, nodes spread by repulsion |
| One slider at 100 | Single-axis clustering: nodes pull toward dim's seed direction proportional to feature score | Clear gradient along one axis |
| Two sliders at 50 each | Continuous dual-axis blend: nodes pulled in two directions simultaneously | Two loosely-separated groups with overlap zone |
| Two sliders at 100 each | Strong dual-axis clustering | Two distinct clusters at opposite canvas edges |
| Slider dragged from 0 to 100 | Smooth continuous motion of all nodes, no jump, no mode switch | Camera-ready animation |
| Slider set to 0 on active dim | Smooth removal of that axis's contribution | No discontinuity; other dims remain |

**Test gate:** All rows above must pass as Vitest unit tests on `computeTargetPositions()` output before physics layer integration begins.

---

## Sources

- Cosmograph API reference (HIGH confidence): https://cosmograph.app/docs-lib/api/interfaces/CosmographConfig/ (verified 2026-05-19, doc date Feb 2026)
- Cosmograph methods (HIGH confidence): https://cosmograph.app/docs-lib/api/classes/Cosmograph/ (verified 2026-05-19)
- Cosmos.gl GitHub (HIGH confidence): https://github.com/cosmosgl/graph
- d3-force simulation docs (HIGH confidence): https://d3js.org/d3-force/simulation — seeded LCG, phyllotaxis init, randomSource() confirmed
- d3-force determinism discussion (MEDIUM): https://github.com/d3/d3-force/issues/121
- sigma.js 3.0 status (MEDIUM): https://www.ouestware.com/2024/03/21/sigma-js-3-0-en/ — lasso is planned as satellite package, not core
- ARCHITECTURE.md (HIGH): `.planning/research/ARCHITECTURE.md` — slider composition math, layer contracts, anti-patterns
- PROJECT.md (HIGH): `.planning/PROJECT.md` — topology, constraints, out-of-scope decisions
- Memory: `feedback_similarity_positional_only.md` — similarity dims are positional only, never edges
- Memory: `feedback_no_manual_sync_ui.md` — no manual sync UI
- Memory: `project_cosmos_alpha_inversion.md` — Cosmos.gl v3 alpha inversion gotcha (affects physicsLayer tick math)
