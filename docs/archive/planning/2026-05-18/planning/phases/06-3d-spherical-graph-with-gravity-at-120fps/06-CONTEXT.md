# Phase 6: 3D spherical graph with gravity at 120fps - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing flat 2D `cosmos.gl` graph in the Users dashboard (`app/(dashboard)/users/`) with a true 3D spatial visualization. Nodes are arranged in a volumetric sphere held together by clustered gravity-style forces, rendered at a 120fps target. Filters, selection, and side-panel behavior reach parity with the current 2D graph; visual encoding is redesigned for 3D.

Out of scope: new filter types, new node-data sources, new side-panel content kinds, new dashboard tabs.

</domain>

<decisions>
## Implementation Decisions

### Sphere topology & gravity
- **Volumetric ball cloud** — nodes fill the interior of a sphere; depth, occlusion, and parallax read on camera movement. Not on-surface, not orbital shells.
- **Per-cluster gravity wells** — each company/role acts as its own gravity well so clusters read as distinct "blobs" within the ball. Edges still apply pairwise attraction between connected nodes.
- **No visible sphere shell** — sphere is implied by node arrangement only; no wireframe, glow, or translucent surface.
- **Composite radial position** — distance from ball center is a weighted combination of multiple node parameters (likely activity level, role/seniority, connectedness — exact parameter list and weights to be derived from the schema during research). Not pure-physics, not a single-metric encoding.
- **Tight clusters with inter-group breathing room** — strong intra-cluster cohesion and strong inter-cluster repulsion, so companies/roles read as distinct.
- **Edges: faded-by-depth + hover highlight** — all edges drawn at very low opacity by default; edges of the hovered/selected node light up bright. Prevents 3D spaghetti.
- **Filter changes: smooth animated reflow** — filtered-out nodes fade and drift outward; remaining nodes settle into a new equilibrium with animation. No hard re-simulate, no leave-positions-in-place.
- **Slow auto-rotation when idle** — gentle rotation kicks in after ~3s of no interaction; stops the moment the user touches the scene.

### Rendering engine & performance
- **`react-three-fiber` on top of three.js** is the rendering layer. No 3d-force-graph (insufficient customization for clustered wells + composite radial). No raw three.js.
- **Custom physics simulation, not a prebuilt force-graph lib.**
- **GPU compute physics is the target**, gated by browser:
  - Primary: WebGL2 transform-feedback physics path so the simulation runs on Chrome + Safari + Firefox.
  - Optional: WebGPU compute-shader fast path layered on top for browsers that support it.
- **Cross-browser support is required** — Chrome, Safari, Firefox all must work.
- **In-place replacement** — the existing flat 2D graph in `app/(dashboard)/users/` is removed; the cosmos.gl dependency and `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` are dropped. No feature flag, no parallel routes.
- **Parity first, then 3D polish** — filters, selection, and side-panel hooks must work in 3D before visual polish lands. No regression in functional capabilities (encoding redesign is the one exception — see below).

### Camera & interaction
- **Orbit-drag around the sphere** — click-and-drag rotates the view around ball center. Industry-standard 3D viz controls.
- **Dolly zoom** — scroll/pinch moves the camera physically closer, including all the way *into* the ball so users can see nodes from the inside. No FOV-zoom, no hard "stop at surface."
- **Single-click selection via GPU picking** — exact hit-test using a render pass that writes node IDs into a pickbuffer. Matches current 2D click-to-select behavior; no hover-then-click, no lasso.
- **Smooth camera-tween on select** — when a node is selected, the camera glides to center it; the ball rotates as needed to reveal it. Cinematic focus, helps users orient after selection.

### Labels & info density at 120fps
- **Camera-distance LOD for labels** — only nodes within a distance threshold from the camera show labels. Labels reveal progressively as the user dollies in. Keeps frame budget intact.
- **3D billboard labels** — labels live at the node's 3D position but always rotate to face the camera. Depth-sorted, occluded by closer nodes. Not 2D DOM overlay.
- **Encoding redesigned for 3D** — node color/size/glow/animation are *not* a 1:1 port of the current 2D encoding. The phase redesigns the visual language to take advantage of 3D capabilities (e.g. emissive glow for active users, depth-revealed metadata). The information *available* in the side panel and via filters remains at parity; the *visualization* is new.

### Testing & quality
- **Heavy Playwright E2E** for the 3D graph — full interaction flows tested. Implies the physics simulation must support a **deterministic / replay mode** so screenshot-based assertions are stable. Unit tests on the math (parameter-to-radius mapping, cluster assignment) live alongside the E2E suite.

### Claude's Discretion
- **Dev-only physics tuning panel** (sliders for gravity strength, repulsion, radial weights, rotation speed) — build if it accelerates iteration; skip if it slows shipping. Hidden behind `?debug=1` or `NODE_ENV=development` if built.
- **Bundle-size posture** — likely lazy-load the graph component so three.js/r3f only loads on the Users dashboard route, but defer to existing code-split patterns in `app/(dashboard)/users/`.
- **Target node count for 120fps** — derive from the actual `accGraphSnapshot` size during research, then target that count comfortably. No fixed "must support 10K" mandate.
- **Exact composite-radial weights** — choose during planning based on which schema fields are available and which combinations read well visually.
- **Repulsion-strength tuning** — chosen to produce the "tight clusters, breathing room" feel; tunable parameter.

</decisions>

<specifics>
## Specific Ideas

- "Looks like a sphere with gravity, not just flat like it is now" — the visual identity is unambiguously a volumetric ball, not a flat disk, not a globe-surface, not an orbit diagram.
- The composite-radial encoding ("It has to do with all the parameters combined") is meant to make a node's position itself glanceable — a user reads "this node is close to center" as a meaningful, multi-dimensional health/role signal without needing to read a label or open the side panel.
- 120fps is a hard target, not aspirational — it's part of the phase name. Implies a meaningful perf budget, deterministic-replay E2E, and GPU-based simulation.

</specifics>

<deferred>
## Deferred Ideas

- New filter types beyond what the 2D graph offers — separate phase.
- New side-panel content kinds for 3D-specific context (e.g. "neighbors in 3D space") — separate phase.
- Mobile-specific touch-gesture redesign beyond what orbit/dolly natively supports — separate phase if Mobile is a real audience.
- VR/AR rendering — out of scope.
- Multi-select / lasso — out of scope; single-click parity only.

</deferred>

---

*Phase: 06-3d-spherical-graph-with-gravity-at-120fps*
*Context gathered: 2026-05-11*
