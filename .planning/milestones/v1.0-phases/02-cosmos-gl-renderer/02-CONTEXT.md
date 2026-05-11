# Phase 2: Cosmos.gl Renderer - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a GPU-accelerated renderer (Cosmos.gl) that users can switch to on large graphs, with real-time physics simulation controls. Users on browsers without WebGL2 continue to see the Canvas 2D renderer seamlessly. Creating/editing graph data is out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Renderer Toggle
- Located in the toolbar / top bar — always accessible to power users
- Displayed as a labeled button: "Canvas 2D / GPU" — user always knows which mode is active
- Show a loading spinner overlay while the GPU renderer initializes (shaders, data transfer)
- Persist the renderer choice to localStorage — next visit defaults to the last-used renderer
- Detect WebGL2 support at startup; if unsupported, hide the toggle entirely (no disabled state, no explanation shown)

### Physics Controls Panel
- Collapsible side panel / drawer — out of the way when not needed
- Panel is only visible when GPU renderer is active (hidden in Canvas 2D mode)
- Physics slider values (repulsion, link spring, gravity) are persisted to localStorage
- Reset to defaults button: Claude's discretion

### Node & Edge Visual Identity
- Node colors: Match existing Canvas 2D colors exactly — consistent experience when switching renderers
- Edge weight shown via color variation by relationship type (not thickness)
- Node size scales with connection count — larger nodes for higher-degree nodes
- Node labels hidden by default, shown on hover — keeps large graphs readable
- Click interactions same as Canvas 2D (node selection, details panel, etc.)
- Small legend in a corner showing which color corresponds to which node type (User / Project / Role / Module)

### WebGL2 Fallback
- If WebGL2 is unsupported: silently stay on Canvas 2D, hide the GPU toggle — no disruption, no error message
- If WebGL context error occurs mid-session (e.g., GPU out of memory): auto-fall back to Canvas 2D with a brief error toast notification
- WebGL2 detection runs at startup (not deferred to toggle click)

### Claude's Discretion
- Reset to defaults button design and placement in physics panel
- Exact toast message wording for mid-session GPU context failures
- Specific localStorage key naming conventions

</decisions>

<specifics>
## Specific Ideas

- The renderer switch should feel seamless — graph state (zoom, pan, selected nodes) should survive the toggle
- The GPU toggle should be a clear visual affordance in the toolbar, not buried or subtle

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-cosmos-gl-renderer*
*Context gathered: 2026-04-28*
