# Phase 3: Graph UI Completion - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the existing graph UI so the three remaining gaps close:
1. Node labels reveal at the right zoom level (UI-01)
2. The physics simulation visibly signals when it has settled and the worker drops to near-zero CPU (UI-02)
3. The filter panel and the node detail side panel coexist on a 1280px-wide screen without one hiding the other (UI-03)

This phase is finishing touches on the existing graph chrome. New graph capabilities (search, alternative layouts, clustering modes, graph keyboard navigation, etc.) are out of scope and belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Label visibility behavior (UI-01)
- **Reveal style:** Fade range (opacity 0 → 1 across a zoom range), not a hard cutoff
- **Zoom range:** Late-zoom band (target ~2.5x → ~4x — Claude tunes exact values to the renderer's current zoom extents)
- **Coverage:** Once past the threshold, every visible node gets its label (no top-N gating during normal display)
- **Label text:** Node name only (no secondary metric)
- **Collision handling:** When two labels would overlap, hide the lower-priority one — Claude's discretion on the priority criterion (degree, size, or cluster representative — picked based on what's available on the node model)
- **Hover/select override:** Hovered or selected nodes always show their label, bypassing the zoom threshold
- **Font size:** Claude's discretion (fixed pixel size vs. zoom-scaled — pick based on the renderer)

### Stability detection (UI-02)
- **Settle definition:** Alpha threshold + sustained time — alpha drops below threshold AND stays below for ~500ms before declaring stable
- **Worker behavior on stable:** Drop to near-zero CPU but keep the message channel open and subscribed. Do NOT terminate. Resume instantly when re-triggered.
- **Re-trigger actions (reheat sim, hide badge):**
  - Drag a node
  - Filter change (graph membership changed)
  - Search / select a node
- **Non-triggering actions (must NOT reheat):**
  - Pan / zoom (view transforms only — graph membership unchanged)
- **Reheat threshold:** Claude's discretion — tune based on observed alpha behavior so the badge feels responsive without flickering on numerical residuals

### Stable badge UX
- **Position:** Top-right of the graph canvas (floating overlay)
- **Style:** Subtle pill with icon + text (e.g., ✓ + "Stable") — muted/success-tinted color, matches existing design system
- **Transitions:** Fade in / fade out (~200ms). When prefers-reduced-motion is set, transitions are instant.
- **Interaction:** Clickable — opens a small diagnostics tooltip/popover (alpha value, node count, etc.). Claude's discretion on exact diagnostics surface and whether tooltip vs. popover

### Panel coexistence at 1280px (UI-03)
- **Layout:** Both panels docked. Filter panel docked-left and collapsible; detail panel docked-right (fixed width when open)
- **Default state at 1280px:** Filter open, detail closed (detail opens only when a node is selected)
- **Widths:** Claude's discretion — leave the graph canvas at least ~720px of horizontal space at 1280px viewport
- **Collapse behavior:** Filter panel collapses to a thin icon rail (~40–48px) with an expand affordance, NOT to nothing. Always-visible affordance.
- **Detail panel:** Closes back to nothing when dismissed (it's selection-driven, not always-on)

### Reduced motion / accessibility
- **prefers-reduced-motion:** Honored for UI chrome (label fades, badge fades, panel collapse animations become instant). Graph physics motion is preserved (it's the core feature, pragmatic compromise).
- **Keyboard navigation scope:** Tab reaches filter inputs and panel collapse buttons. No graph-canvas keyboard navigation in this phase (deferred).
- **Stable badge ARIA:** `aria-live=polite` announces state changes to screen readers ("Graph stable" / "Graph updating" or equivalent). Claude picks exact wording.
- **Focus styles:** Match the dashboard's existing focus ring styles — do not introduce new focus visuals.

### Empty / loading states
- **Empty filter result (zero nodes):** Centered message ("No nodes match these filters") + a "Clear filters" reset action
- **Initial physics warm-up:** Animated nodes from start — render at initial positions and let physics animate them into place. No separate skeleton or spinner state.
- **Filter change recompute:** Animate in-place (fade adds/removes; physics reheats). No overlay or spinner.
- **Graph load failure (worker error or data fetch fail):** Centered error message + retry button. Details collapsed under a "Show details" link.

### Label rendering performance cap
- **Hard cap:** Yes — never render more than ~200 labels simultaneously, regardless of zoom. The same priority criterion used for collision resolution decides which 200.
- **Overflow handling:** Silently drop lower-priority labels when over cap. No "+N more" indicator.
- **Frame budget:** Claude's discretion — pick based on renderer (Cosmos/WebGL behaves differently from Canvas/SVG).

### Claude's Discretion (summary)
- Exact zoom-range fade values within the late-zoom band
- Collision/overflow priority criterion (degree vs. size vs. cluster)
- Font size policy (fixed vs. zoom-scaled)
- Reheat threshold tuning
- Panel widths within the ≥720px graph constraint
- Diagnostics tooltip/popover content and surface for the Stable badge
- Frame-rate / throttling strategy for label rendering

</decisions>

<specifics>
## Specific Ideas

- "Stable" badge should feel like a quiet status indicator (think the kind of small pill used near editor canvases in design tools), not a flashy success toast.
- Re-triggering must feel tight on user actions (drag/filter/select) but must not flicker on tiny numerical alpha residuals.
- Collapsed filter panel must keep an icon rail — users need an always-visible affordance to expand again, not a hidden floating button.
- Reduced-motion users still see physics animation; only the chrome (fades, slides) goes instant.

</specifics>

<deferred>
## Deferred Ideas

- Full graph-canvas keyboard navigation (arrow-keys to move selection, Enter to open detail) — its own future phase
- UI state persistence (URL deep-linking for selected node and active filters; persisting collapsed panel state across reloads) — deferred, did not discuss this phase
- Detail panel content/structure improvements (sections, edit affordances) — out of scope for this polish phase
- User-facing label-cap configuration — internal constant only in this phase; no user-facing setting

</deferred>

---

*Phase: 03-graph-ui-completion*
*Context gathered: 2026-05-06*
