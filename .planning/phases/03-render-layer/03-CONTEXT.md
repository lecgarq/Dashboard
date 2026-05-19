# Phase 3: Render Layer - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

GraphCanvas renders nodes at the Float32Array positions produced by physicsLayer.ts. It supports a 2D mode and a 3D mode and switches between them via a `mode` prop without remounting or losing position continuity. The component owns no math, no slider state, and no feature data — all visual encoding (color, size) arrives as precomputed typed arrays. Filter UI, lasso, click-isolate logic, search, and pie-chart wiring are explicitly out of scope (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Renderer (REQUIREMENTS REWRITE)
- **Replace `react-force-graph-2d` v1.29.1 with cosmograph / cosmos.gl (WebGL on GPU).** This supersedes REND-01's named library. The planner/researcher must update REQUIREMENTS.md.
- **3D renderer = Claude's discretion**, with strong preference for cosmograph's 3D mode so a single engine drives both modes. This trivializes REND-03 (same engine, same graphData ref, flip a flag).
- **Cosmograph runs in "frozen" mode** — it does NOT drive its own simulation. It paints positions computed by Phase 2's `physicsLayer.ts`. Matches the 2026-05-13 "frozen cosmos" architectural pattern already in this dashboard.
- **Target ceiling: 50,000+ nodes at 60fps** on a discrete GPU. This is the explicit driver for the WebGL swap.

### Render component contract
- GraphCanvas props: `positions: Float32Array`, `alphaMask: Float32Array`, `nodeColors: Float32Array | string[]`, `nodeSizes: Float32Array` (optional, Claude's discretion), `mode: "2d" | "3d"`.
- No feature data, no slider values, no role/permission objects inside the component. REND-04 remains fully honored — color/size selectors live in Phase 4 and just swap the buffers.

### Node visual encoding
- **Color is switchable at runtime** (admin permission tier, role, last sign-in, etc.). The selector UI is Phase 4; the render layer only consumes whatever `nodeColors` buffer is passed.
- **Size encoding = Claude's discretion** (likely activity count, log-scaled).
- **All nodes are circles.** No shape-based encoding.
- **Dim state (alphaMask < 1) = lower opacity only (target 0.15).** No desaturation, no shrink.

### 2D ↔ 3D mode switch
- **2D → 3D = smooth camera tilt animation, ~600ms** from top-down to an orbit angle.
- **3D initial camera = auto-fit to the bounding box** of all nodes.
- **Orbit controls = unconstrained.** Free rotate + zoom; no auto-rotate; no upside-down clamp.
- **3D → 2D return = animate z → 0 over ~400ms.** Smooth flatten, not a snap.

### Slider-drag behavior
- **Motion driven exclusively by d3 reheat ticks** in Phase 2's `physicsLayer.ts`. The render layer reads the latest positions each rAF frame. No render-side tweening.
- **Target 60 fps via requestAnimationFrame** (~16ms/frame).
- **Labels hide during active drag**, fade back in on release.

### Labels & background
- **Apply the existing label polish curve** (UAT-approved 2026-05-08): `pow(zoom, 0.2)` clamped to `[0.85, 1.4]`, 11px floor / 18px ceiling, pill backgrounds. Use cosmograph's custom label rendering hooks.
- **Background reacts to the theme toggle** — dark zinc (`#09090B`, per the dark-mode plan, NOT slate) when dark mode is active; light variant when light mode is active.
- **3D scaffolding = subtle floor grid + 3 dimension axes** labeled with the names of the currently active sliders (the data dimensions the positions encode).
- **Initial load = render nodes immediately at random positions, animate to settled positions.** Instant first paint + visible "graph finding itself" flourish.

### Edges / connections
- **Zero edges drawn between nodes.** Positional clustering is the only visual signal of similarity. Locks in the existing "similarity = positional only" rule.

### Hover & selection visuals
- **Hover state**: soft glow halo + 1.2× scale + label always shown on the hovered node.
- **Selected state**: brighter halo + persistent label on the selected node + all other nodes dim to 0.15 alpha. Matches Phase 4's "click-isolate" success criteria.
- The interaction logic (when does hover/select fire) lives in Phase 4. The render layer just provides the visual states given a `hoveredId` / `selectedIds` input.

### Resize / HiDPI
- **On window or panel resize: resize the canvas AND auto-refit the camera** so the graph stays framed.
- **Device pixel ratio = match native DPR** (sharp on 4K / Retina). No cap unless perf fallback triggers.

### Performance telemetry & fallback
- **Dev-only FPS overlay** (hidden in production builds).
- **Auto-degrade on sustained FPS < 30**, in this order: drop labels → drop hover halos → cap DPR. Graceful, graph stays usable.

### Claude's Discretion
- 3D renderer specifics (whether cosmograph 3D matures enough, otherwise three.js InstancedMesh)
- Node size encoding (likely activity count, log-scaled)
- Easing curves for the 600ms tilt and 400ms z→0 animations
- Random-position initial layout extent
- Exact label-polish bridge from the existing react-force-graph implementation to cosmograph's label hooks
- Whether DPR is matched at full resolution or capped at 2 by default (perf judgement call)
- Auto-degrade thresholds and timing windows

</decisions>

<specifics>
## Specific Ideas

- **Cosmograph + frozen-physics is already the architectural direction** in this dashboard (spec `490b266`, plan `587373b`, 2026-05-13). Phase 3 formalizes that pattern for the access-analysis surface.
- **Label polish curve was UAT-approved 2026-05-08** — reuse it, don't reinvent.
- **Dark palette is zinc, NOT slate.** `#09090B` background. Luis explicitly rejected slate in feedback.
- **GPU acceleration is non-negotiable for the user's expectation** ("use my dedicated graphics card at maximum performance"). The Canvas2D path in REND-01 must be dropped.

</specifics>

<deferred>
## Deferred Ideas

- **Color-by selector UI** (admin permissions / roles / last sign-in switcher) — Phase 4 (interactions). Render layer only consumes the resulting color buffer.
- **Hover-shows-tooltip and click-isolate dimming behavior** — Phase 4 owns the interaction wiring. Render layer owns only the visual states.
- **Keyboard navigation / a11y for the canvas** — not covered in this discussion; revisit before public launch.
- **Screenshot / export of the current view** — not in scope.
- **Save/restore camera state across sessions** — not in scope; auto-fit on each load.

</deferred>

<flags_for_planner>
## Flags for the Planner

1. **REND-01 needs rewriting.** It currently names `react-force-graph-2d v1.29.1`. The decided renderer is cosmograph/cosmos.gl. Either update REQUIREMENTS.md before planning, or have the plan reflect this and trigger a requirements amendment.
2. **REND-02 likely also rewrites** if cosmograph 3D is adopted. Researcher should evaluate cosmograph 3D maturity vs. three.js InstancedMesh fallback.
3. **Cosmograph's "frozen" mode integration with physicsLayer.ts** is non-trivial — researcher should produce a concrete API recipe (how positions get pushed into cosmograph each tick, how the simulation is suppressed inside cosmograph).
4. **Theme-reactive background** needs a contract for the cosmograph canvas: read from the existing theme provider or accept a `backgroundColor` prop.

</flags_for_planner>

---

*Phase: 03-render-layer*
*Context gathered: 2026-05-19*
