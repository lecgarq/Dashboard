# Phase 3: Graph UI Completion - Research

**Researched:** 2026-05-06
**Domain:** Canvas 2D graph rendering (label overlay), d3-force Web Worker stability detection, React panel layout (Tailwind CSS)
**Confidence:** HIGH — all findings are grounded in the live codebase; no speculative library assumptions needed

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Label visibility behavior (UI-01)**
- Reveal style: Fade range (opacity 0 → 1 across a zoom range), not a hard cutoff
- Zoom range: Late-zoom band (target ~2.5x → ~4x — Claude tunes exact values to the renderer's current zoom extents)
- Coverage: Once past the threshold, every visible node gets its label (no top-N gating during normal display)
- Label text: Node name only (no secondary metric)
- Collision handling: When two labels would overlap, hide the lower-priority one — Claude's discretion on the priority criterion
- Hover/select override: Hovered or selected nodes always show their label, bypassing the zoom threshold
- Font size: Claude's discretion (fixed pixel size vs. zoom-scaled)
- Hard cap: Never render more than ~200 labels simultaneously; overflow silently drops lower-priority labels

**Stability detection (UI-02)**
- Settle definition: Alpha threshold + sustained time — alpha drops below threshold AND stays below for ~500ms before declaring stable
- Worker behavior on stable: Drop to near-zero CPU but keep message channel open and subscribed; do NOT terminate
- Re-trigger actions (reheat sim, hide badge): drag a node, filter change (graph membership changed), search / select a node
- Non-triggering actions (must NOT reheat): pan / zoom (view transforms only)
- Reheat threshold: Claude's discretion

**Stable badge UX**
- Position: Top-right of the graph canvas (floating overlay)
- Style: Subtle pill with icon + text (e.g., check + "Stable") — muted/success-tinted, matches existing design system
- Transitions: Fade in / fade out (~200ms); prefers-reduced-motion → instant
- Interaction: Clickable — opens a small diagnostics tooltip/popover (alpha value, node count, etc.)

**Panel coexistence at 1280px (UI-03)**
- Layout: Both panels docked. Filter panel docked-left and collapsible; detail panel docked-right (fixed width when open)
- Default state at 1280px: Filter open, detail closed (detail opens only when a node is selected)
- Widths: Claude's discretion — leave the graph canvas at least ~720px of horizontal space at 1280px viewport
- Collapse behavior: Filter panel collapses to a thin icon rail (~40–48px) with an expand affordance, NOT to nothing
- Detail panel: Closes back to nothing when dismissed

**Reduced motion / accessibility**
- prefers-reduced-motion honored for UI chrome (fades, badge, panel collapse) — graph physics preserved
- Tab reaches filter inputs and panel collapse buttons
- Stable badge uses aria-live=polite
- Focus styles match existing dashboard focus ring styles

**Empty / loading states**
- Empty filter result: Centered message ("No nodes match these filters") + "Clear filters" button (already implemented)
- Graph load failure: Centered error message + retry button, details collapsed under "Show details" link
- Filter change recompute: Animate in-place, no overlay

**Label rendering performance cap**
- Hard cap: Never render more than ~200 labels simultaneously
- Overflow: Silently drop lower-priority labels
- Frame budget: Claude's discretion based on renderer

### Claude's Discretion
- Exact zoom-range fade values within the late-zoom band
- Collision/overflow priority criterion (degree vs. size vs. cluster)
- Font size policy (fixed vs. zoom-scaled)
- Reheat threshold tuning
- Panel widths within the ≥720px graph constraint
- Diagnostics tooltip/popover content and surface for the Stable badge
- Frame-rate / throttling strategy for label rendering

### Deferred Ideas (OUT OF SCOPE)
- Full graph-canvas keyboard navigation
- UI state persistence (URL deep-linking for selected node and active filters; persisting collapsed panel state across reloads)
- Detail panel content/structure improvements
- User-facing label-cap configuration
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | User can read node labels when zoomed in, with no labels cluttering the overview zoom level — zoom-threshold label rendering in `CanvasGraphRenderer.draw()` using existing `label` field | Canvas 2D draw loop confirmed in graphRenderers.ts; `view.scale` is the zoom scalar; node `name` is available on SimNode; no existing label code in draw() — pure addition |
| UI-02 | User can see when the physics simulation has stabilized — Web Worker auto-pauses when `averageVelocity < 0.0005` for 5+ consecutive seconds; UI shows "Stable" badge | Worker already posts `averageVelocity` in every `tick` message; AccUsersGraph reads it via `motionMetric` state; timer and stopTimer() already exist in worker; Cosmos path has `getSimulationAlpha()` |
| UI-03 | User can access the filter panel and side detail panel simultaneously on screens ≤1280px wide — layout fix prevents both panels from occupying the same top-right position | Both panels currently use `absolute top-3 right-3` — confirmed overlap; filter is inside the graph canvas container as absolute positioned overlay |
</phase_requirements>

---

## Summary

Phase 3 is entirely surgical work inside one file (`AccUsersGraph.tsx`) and one renderer (`graphRenderers.ts`). No new libraries are needed. All three requirements address gaps in the existing graph chrome, and the codebase already contains the hooks and data needed to implement each.

**UI-01 (zoom labels):** The Canvas 2D renderer's `draw()` method in `graphRenderers.ts` renders nodes but has zero label code. Node names live on `SimNode.name` and flow into `GraphRenderFrame` via `nodes[i]`. The current `view.scale` starts at 600 on a fresh load and fits to content. The zoom range [2.5x→4x] in the CONTEXT.md refers to a *multiplier relative to fit-to-content* scale, not an absolute pixel scale. The Canvas 2D path needs a label pass added after node drawing; the Cosmos path has hover labels via `onPointMouseOver` but no persistent zoom-triggered labels.

**UI-02 (stable badge):** The d3-force worker already computes `averageVelocity` per tick and posts it to `AccUsersGraph`. The existing `motionMetric` state captures this. The worker already has a `stopTimer()` path (it self-pauses when `active` is false). What's missing: (a) a sustained-time debounce on the main thread (500ms below threshold), (b) the badge React component, (c) re-heat wiring on drag/filter/select but NOT on pan/zoom. For the Cosmos GPU-physics path, `cosmosRendererRef.current.getSimulationAlpha()` is the equivalent alpha signal.

**UI-03 (panel layout):** The filter panel is an absolute overlay inside the graph container (`absolute top-12 left-3 bottom-3 w-64`). The side detail panel is also absolute inside the same container (`absolute top-3 right-3 bottom-3 z-20 w-72`). These do not fight each other currently — the detail panel is right-anchored and the filter is left-anchored. The overlap was noted in the REQUIREMENTS as a bug affecting 1280px screens, where the graph canvas itself is too narrow when both are open. The real fix is to restructure the outer layout from `flex h-full` (graph takes flex-1) to a three-column flex where filter panel and detail panel are siblings of the canvas, not absolute children.

**Primary recommendation:** Implement all three features as surgical additions to `AccUsersGraph.tsx` and `graphRenderers.ts` with no new dependencies. Do not restructure the entire component — targeted additions suffice for each requirement.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @cosmos.gl/graph | 3.0.0-beta.8 (pinned) | GPU graph renderer | Already in prod; Cosmos path is primary |
| d3-force | (via worker) | Canvas 2D physics | Already in worker; averageVelocity signal from here |
| React | (Next.js 16) | Component state for badge, panel collapse | Already in use |
| Tailwind CSS v4 | @import "tailwindcss" | Styling | Project uses Tailwind v4 with @theme inline |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cn() utility | already imported | Conditional class merging | All new JSX elements |
| lucide-react | already in deps | Icons for badge check icon and panel toggle | Badge icon, collapse button |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom collision detection for labels | rbush spatial index | Custom is fine at 200-label cap; rbush adds dependency with no benefit at this scale |
| CSS transition for badge | Framer Motion | CSS transition at 200ms is sufficient; no motion library needed |
| Separate ResizeObserver for panel widths | CSS only | CSS flex layout is simpler and more robust |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Current File Layout

```
app/(dashboard)/users/
├── AccUsersGraph.tsx          # Main component — all graph chrome lives here
├── graphRenderers.ts          # CanvasGraphRenderer.draw() + CosmosGraphRenderer
├── accGraphOrganicLayout.worker.ts  # d3-force Web Worker
├── accGraphOrganicLayout.ts   # Worker message types, topology builder
├── accGraphFilters.ts         # Filter logic (pure module, Vitest-tested)
├── AccUserSidePanel.tsx        # Node detail panel (currently fixed/right)
└── cosmosUtils.ts             # Cosmos helper utilities
```

### Pattern 1: Zoom-gated Label Rendering in CanvasGraphRenderer.draw()

**What:** After the existing node-draw pass, add a label pass that checks `view.scale` against a threshold, computes per-label screen bounds, resolves collisions, and calls `ctx.fillText()`.

**When to use:** Only in the Canvas 2D path. Cosmos path uses `onPointMouseOver` for hover labels; for Cosmos persistent labels at zoom, `setConfigPartial({ pointLabelField: ... })` may exist in v3 — but this is LOW confidence and should be verified at implementation time. For now, plan for Canvas 2D only.

**Key implementation notes from codebase:**
- `view.scale` default on fresh load is `600` (from `loadSavedView()`, line 203). `fitScale` is computed as `(width / graphWidth) * 0.80` — for typical data this yields ~600–2000.
- The "late zoom band 2.5x → 4x" from CONTEXT.md should be interpreted as a *multiplier of the fit-scale*, not absolute pixels. Reasonable starting values: label fully visible when `view.scale > fitScale * 3.5`; fade starts at `view.scale > fitScale * 2.0`.
- **Problem:** `draw()` does not receive `fitScale` as a parameter. Options: (a) track the last `fitScale` in a class field, (b) use absolute scale thresholds tuned empirically (e.g., fade 1500→2500 on typical data), or (c) add a `labelThreshold` param to `GraphRenderFrame`. Option (c) is cleanest — add the field to the frame interface and compute it in `AccUsersGraph`.
- Nodes already available via `frame.nodes[i].id` — name is on `SimNode`, not `GraphRenderNode`. `GraphRenderNode` needs a `label?: string` field added so the renderer can access it without knowing about `SimNode`.
- Node positions are in world-space `[0,1]` normalized coords for Canvas 2D. Screen-space collision check: multiply by `view.scale`, subtract `view.x * view.scale`, add `cssWidth / 2`.
- Canvas 2D label text should use `ctx.fillText()` after resetting transform back to screen space, or use the world transform with a font size of `12 / view.scale` so labels stay a fixed pixel size.
- Collision check: for each candidate label, compute screen bounding box and check against all previously-drawn labels. At 200-label cap this is O(200²) = 40,000 comparisons — negligible.
- Priority criterion: use degree (connection count). `frame.nodes[i]` does not carry degree; the worker tracks it. Simplest approach: add an optional `degree?: number` field to `GraphRenderNode` and populate it from `nodeConnections` in `CosmosGraphRenderer` or from link data in `AccUsersGraph`.

**Example (pseudocode):**
```typescript
// In CanvasGraphRenderer.draw() — after node draw pass
ctx.resetTransform();
ctx.scale(dpr, dpr);
ctx.font = "11px sans-serif";
ctx.textAlign = "center";
ctx.fillStyle = "#111827";

const fadeStart = frame.labelFadeStartScale ?? 1500;
const fadeEnd = frame.labelFadeEndScale ?? 2500;
const opacity = Math.min(1, Math.max(0, (frame.view.scale - fadeStart) / (fadeEnd - fadeStart)));
if (opacity <= 0) return { needsContinuousRedraw: false };

ctx.globalAlpha = opacity;
const drawnBounds: [number, number, number, number][] = []; // [x, y, w, h] in screen px
let labelCount = 0;

// Sort candidates by priority descending
const candidates = [...prioritySortedVisibleNodes]; // degree desc
for (const { index, priority } of candidates) {
  if (labelCount >= 200) break;
  const wx = frame.positions[index * 2];
  const wy = frame.positions[index * 2 + 1];
  // world → screen
  const sx = (wx - frame.view.x) * frame.view.scale + frame.cssWidth / 2;
  const sy = (wy - frame.view.y) * frame.view.scale + frame.cssHeight / 2;
  if (sx < -50 || sx > frame.cssWidth + 50 || sy < -20 || sy > frame.cssHeight + 20) continue;
  // Hover/select override: always draw if hovered or selected
  const isOverride = index === frame.selectedNodeIndex || hoveredNodeIndices.has(index);
  if (!isOverride) {
    const textWidth = ctx.measureText(label).width + 4;
    const box: [number, number, number, number] = [sx - textWidth/2, sy - 16, textWidth, 14];
    if (overlapsAny(box, drawnBounds)) continue;
    drawnBounds.push(box);
  }
  ctx.fillText(label, sx, sy - 8 / dpr); // above the node dot
  labelCount++;
}
ctx.globalAlpha = 1;
```

### Pattern 2: Stability Badge — Main Thread Debounce

**What:** Watch `motionMetric.averageVelocity` in `AccUsersGraph`. When it stays below a threshold for 500ms, set `isStable = true`. On reheat triggers (drag, filter, select), set `isStable = false` immediately.

**Key implementation notes from codebase:**
- `motionMetric` is already a React state (`const [motionMetric, setMotionMetric] = useState({ averageVelocity: 0, linkCount: 0 })`), updated at most every 250ms.
- The worker already auto-stops its timer when `active = false` (line 428: `if (!active) stopTimer()`). The worker's `SETTLE_VELOCITY = 0.00008` is already the auto-stop threshold. The badge threshold can match or be slightly looser: `averageVelocity < 0.0001` for 500ms.
- For Cosmos GPU-physics path, stability signal comes from `cosmosRendererRef.current.getSimulationAlpha()` — alpha < 0.005 AND `isSimulationRunning() === false` constitutes stable.
- Pan/zoom must NOT reheat. The `isDragging` ref controls pan; zoom is via `handleWheel`. Neither sends a message to the worker — keep it that way. Badge logic must be purely reactive to `motionMetric` and explicit reheat events, not to view state changes.
- Re-trigger on select: when `setSelectedNode` is called with a non-null value, set badge to unstable. This matches the CONTEXT requirement "search / select a node" reheats.
- Re-trigger on filter: when `setFilters` is called with a change that alters visible nodes, set badge to unstable. This is already handled because filter changes call `rebuildVisibleIndices()` → `rebuildSimulation()` in the worker → emits hot tick messages.

**Badge component pattern (using existing design tokens):**
```tsx
// Tailwind classes matching existing design system
<div
  role="status"
  aria-live="polite"
  aria-label={isStable ? "Graph stable" : "Graph updating"}
  className={cn(
    "absolute top-12 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border shadow-sm transition-opacity duration-200",
    "bg-white/90 border-emerald-200 text-emerald-700",
    isStable ? "opacity-100" : "opacity-0 pointer-events-none",
  )}
>
  <Check size={10} className="shrink-0" />
  <span>Stable</span>
</div>
```

### Pattern 3: Panel Layout Restructure (UI-03)

**What:** The current structure has both the filter panel and node-detail panel as `absolute`-positioned overlays inside the graph canvas container. The filter is left-anchored; the detail panel is right-anchored. The problem: at 1280px viewport, with the filter open (w-64 = 256px) and the detail panel open (w-72 = 288px), the graph canvas gets squeezed.

**Root cause from codebase:**
```
Line 1602: <div className="flex h-full">       ← outer wrapper
Line 1604:   <div ref={containerRef} ... className="flex-1 relative ..."> ← graph container (flex-1)
Line 1774:     <div className="absolute top-12 left-3 bottom-3 z-10 w-64 ...">  ← filter (INSIDE canvas)
Line 2027:     <div className="absolute top-3 right-3 bottom-3 z-20 w-72 ...">  ← detail (INSIDE canvas)
```

Both panels are absolute children of the same container. The graph canvas DOES fill 100% of screen width minus the dashboard sidebar. At 1280px with the sidebar (~240px), the graph container is ~1040px. Filter (256px) + graph space (720px) + detail (288px) = 1264px — that's technically fine if they're siblings. But as absolute overlays, they visually overlap the graph canvas rather than shrinking it.

**Fix approach:** Extract the filter panel and detail panel from inside the graph container and make them sibling flex children of the outer `flex h-full` wrapper.

```
Before:
  <div class="flex h-full">
    <div class="flex-1 relative" ref={containerRef}>   ← graph container
      ... canvas ...
      <div class="absolute ... w-64">filter panel</div>   ← absolute overlay
      <div class="absolute ... w-72">detail panel</div>   ← absolute overlay
    </div>
  </div>

After:
  <div class="flex h-full">
    <div class="relative flex-shrink-0 transition-all duration-200" style={{ width: filterCollapsed ? 44 : 256 }}>
      filter panel (no longer absolute)
    </div>
    <div class="flex-1 relative min-w-[720px]" ref={containerRef}>   ← graph canvas
      ... canvas, overlays, badges (no filter/detail panels) ...
    </div>
    {selectedNode && (
      <div class="relative flex-shrink-0 w-72">
        detail panel (no longer absolute)
      </div>
    )}
  </div>
```

This approach gives the graph canvas exactly the remaining space and the panels never overlap it. At 1280px with sidebar: (1280 - 240 sidebar) = 1040px content. Filter at 256px + detail at 288px = 544px panels, leaving 496px for graph — too narrow! So widths need trimming. Filter at 220px (w-[220px]) + detail at 256px (w-64) = 476px, leaving 564px for graph — still under the 720px target. Better widths: filter 200px + detail 240px = 440px, graph 600px — still under 720px.

**Key insight:** At 1280px total viewport, assuming a sidebar of ~240px, the usable content area is ~1040px. With 720px minimum graph space, only 320px remains for both panels combined. The filter panel must collapse by default at 1280px.

**Recommended width constants:**
- Filter expanded: 240px (matches current w-64 = 256px, slightly narrower)
- Filter collapsed (icon rail): 44px (~40px content + padding)
- Detail panel: 280px (w-70 or custom width)
- Graph minimum: 720px
- At 1280px with sidebar=240px: content=1040px; filter=240px + graph=760px + detail=0px (closed) = 1040px exactly. When detail opens: graph shrinks to 520px — under 720px.
- **Resolution:** When detail panel is open AND screen is ≤1280px, auto-collapse the filter panel to icon rail. This satisfies "both accessible simultaneously" — the filter is accessible via the icon rail's expand affordance.

**Alternative:** Wider filter icon rail (44px) is always-visible, so even when both panels show, graph space = 1040 - 44 - 280 = 716px (just under 720px — round up filter to 40px: 1040-40-280=720px). This is the cleanest approach: at any screen width, when the detail panel opens, filter auto-collapses to icon rail, preserving ≥720px graph.

### Anti-Patterns to Avoid

- **Absolute-position overlapping panels:** Never keep both filter and detail as absolute children inside the graph container. They'll overlap the canvas and each other at narrow widths.
- **Hard-coding scale thresholds as pixel absolutes:** `view.scale` depends on the data spread. Use `labelFadeStartScale`/`labelFadeEndScale` fields computed relative to the last fit scale.
- **Terminating the physics worker on stability:** The CONTEXT.md is explicit — keep the message channel open, only pause the setInterval timer. The worker already does this via `stopTimer()`.
- **Reheating on pan/zoom:** Pan (`isDragging`) and zoom (`handleWheel`) must not send reheat signals. Badge logic should be purely reactive to `motionMetric` state.
- **Using `setConfig` instead of `setConfigPartial` on Cosmos:** Documented trap in Phase 2 — `setConfig` resets all keys including event callbacks. Always use `setConfigPartial`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Label collision detection | Custom quadtree or kd-tree | Simple O(n²) AABB check (n≤200) | At the 200-label hard cap, O(40k) comparisons runs in <1ms per frame |
| Stability timer | `setInterval` polling | `useRef` debounce + React effect watching `motionMetric` | `motionMetric` updates at 250ms cadence; a `useRef` timer tracking duration below threshold is the correct pattern |
| Panel animation | Framer Motion or react-spring | CSS `transition-all duration-200` on width | Tailwind transition handles width collapse; no motion library needed |
| Popover/tooltip for badge diagnostics | Custom floating UI | Radix UI `Popover` (already in project via shadcn) | Already available; handles portal, focus trap, positioning |

**Key insight:** All three features are DOM/CSS/canvas operations, not library problems. The codebase already has everything needed.

---

## Common Pitfalls

### Pitfall 1: Scale Threshold Calibration

**What goes wrong:** Hardcoding `view.scale > 2000` as the label threshold causes labels to appear at wrong zoom levels because `view.scale` is data-dependent. With 25k nodes, fit-scale might be 200; with 50 nodes it could be 8000.

**Why it happens:** `view.scale` is a pixels-per-world-unit value where "world" is [0,1] normalized. The same scene at different data densities produces different fit scales.

**How to avoid:** Compute `labelFadeStartScale = lastFitScale * 2.0` and `labelFadeEndScale = lastFitScale * 3.5` in `AccUsersGraph` and pass through `GraphRenderFrame`. Track `lastFitScale` in a ref when `zoomToFit()` runs. Initialize to `view.current.scale` from `loadSavedView()`.

**Warning signs:** Labels appear immediately on page load without zooming in, OR labels never appear no matter how much you zoom.

### Pitfall 2: Stability Badge Flickering on Alpha Residuals

**What goes wrong:** The badge flickers "Stable" / "Updating" because the physics never fully reaches zero — it oscillates just above/below the threshold.

**Why it happens:** d3-force's `alphaDecay` never reaches exactly 0; the worker reports tiny residual velocities.

**How to avoid:** Two-condition stability: velocity must be below threshold AND stay below for 500ms consecutively. Use a `stableStartedAtRef = useRef<number | null>(null)`. When velocity drops below threshold, record the timestamp. In the next render effect, if `Date.now() - stableStartedAtRef.current > 500`, mark stable. If velocity spikes, reset to null.

**Warning signs:** Badge appears and disappears rapidly within 1-2 seconds of the simulation warming up.

### Pitfall 3: Detail Panel Layout Breaking the Canvas ResizeObserver

**What goes wrong:** Moving the detail panel outside the graph container `div` breaks the `ResizeObserver` that watches `containerRef` for canvas resizing, causing the canvas to not resize when the detail panel opens/closes.

**Why it happens:** The ResizeObserver is attached to `containerRef` (the graph container div). If that div now shrinks when the detail panel opens, ResizeObserver will fire correctly — this is actually the desired behavior. But if the canvas inside doesn't re-read its container's new dimensions, the WebGL viewport becomes mismatched.

**How to avoid:** The existing ResizeObserver callback already calls `markGraphDirty()`, which triggers a re-render. After restructuring, verify that opening/closing the detail panel fires the ResizeObserver and the canvas redraws at the correct size.

**Warning signs:** Graph canvas appears cut off or shows black bars after opening/closing the detail panel.

### Pitfall 4: Label Rendering Disrupting the Cosmos Path

**What goes wrong:** Label code is added to `CanvasGraphRenderer.draw()` but the Cosmos path (GPU renderer) also calls `draw()` — leading to an attempt to draw Canvas 2D labels over a Cosmos WebGL canvas.

**Why it happens:** Both renderers implement the same `GraphRenderer.draw()` interface. `CosmosGraphRenderer.draw()` is a separate class method that does not draw to the Canvas 2D context. Label code in `CanvasGraphRenderer.draw()` is isolated. But if a dev accidentally copies the label code to `CosmosGraphRenderer.draw()` it would fail silently (no 2D context).

**How to avoid:** Label rendering belongs ONLY in `CanvasGraphRenderer.draw()`. For Cosmos, hover labels are already handled via `onPointMouseOver`. Zoom-triggered persistent labels on Cosmos would require Cosmos's `pointLabelField` API (verify in v3 docs at implementation time — LOW confidence this exists).

### Pitfall 5: Stability Badge Appearing During Initial Warm-Up

**What goes wrong:** The badge briefly appears as "Stable" before the simulation has even begun warming up, because velocity = 0 before the first tick arrives.

**Why it happens:** `motionMetric.averageVelocity` starts at 0. The 500ms debounce would fire before the worker sends its first tick.

**How to avoid:** Add a guard: stability is only possible after `isReady` is true AND at least one tick message has been received from the worker (track a `hasReceivedTickRef = useRef(false)` flag set to true on first tick).

### Pitfall 6: Filter Panel Collapse Not Remembered Across Interactions

**Note:** CONTEXT.md explicitly defers "persisting collapsed panel state across reloads." But within a session, the filter collapsed state should persist across node selections and filter changes. Use React `useState` for `isFilterCollapsed`, not URL state or localStorage.

---

## Code Examples

### UI-01: GraphRenderFrame Extension

```typescript
// In graphRenderers.ts — extend GraphRenderFrame
export interface GraphRenderFrame {
  // ... existing fields ...
  /** Zoom scale at which label fade starts (0 below, 1 above labelFadeEndScale) */
  labelFadeStartScale?: number;
  /** Zoom scale at which labels are fully opaque */
  labelFadeEndScale?: number;
  /** Hover-only label override: these indices always show labels regardless of zoom */
  labelOverrideIndices?: ReadonlySet<number>;
}
```

### UI-01: GraphRenderNode Label Field

```typescript
// In graphRenderers.ts — add label to GraphRenderNode
export interface GraphRenderNode {
  kind: "user" | "project" | "role" | "module";
  id: string;
  color: string;
  radius?: number;
  label?: string;     // node.name — populated by AccUsersGraph when building renderNodes
  degree?: number;    // connection count — used for collision priority
}
```

### UI-02: Stability Debounce Hook Pattern

```typescript
// Inside AccUsersGraph component body
const stableStartedAtRef = useRef<number | null>(null);
const hasReceivedTickRef = useRef(false);
const [isSimStable, setIsSimStable] = useState(false);

useEffect(() => {
  if (!isReady || !hasReceivedTickRef.current) return;
  const v = motionMetric.averageVelocity;
  const STABLE_THRESHOLD = 0.0001;
  const STABLE_DURATION_MS = 500;

  if (v < STABLE_THRESHOLD) {
    if (stableStartedAtRef.current === null) {
      stableStartedAtRef.current = Date.now();
    } else if (Date.now() - stableStartedAtRef.current >= STABLE_DURATION_MS) {
      setIsSimStable(true);
    }
  } else {
    stableStartedAtRef.current = null;
    setIsSimStable(false);
  }
}, [motionMetric.averageVelocity, isReady]);
```

### UI-02: Stable Badge JSX

```tsx
// Source: project design system tokens (globals.css, existing component patterns)
<div
  role="status"
  aria-live="polite"
  aria-label={isSimStable ? "Graph stable" : "Graph updating"}
  className={cn(
    "absolute top-12 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full",
    "text-[11px] font-medium border shadow-sm cursor-pointer select-none",
    "bg-white/90 border-emerald-200 text-emerald-700",
    "transition-opacity duration-200 motion-reduce:transition-none",
    isSimStable ? "opacity-100" : "opacity-0 pointer-events-none",
  )}
  onClick={() => setShowStableDiagnostics((v) => !v)}
>
  <Check size={10} className="shrink-0" />
  <span>Stable</span>
</div>
```

### UI-03: Outer Layout Skeleton

```tsx
// Replace the existing <div className="flex h-full"> wrapper in AccUsersGraph return
<div className="flex h-full overflow-hidden">
  {/* Filter panel — docked left, collapsible to icon rail */}
  <div
    className={cn(
      "relative flex-shrink-0 flex flex-col border-r border-border/30 bg-white/95 backdrop-blur-sm",
      "transition-all duration-200 motion-reduce:transition-none overflow-hidden",
    )}
    style={{ width: isFilterCollapsed ? 44 : 240 }}
  >
    {/* collapse toggle button at top */}
    {/* icon rail when collapsed */}
    {/* full filter content when expanded */}
  </div>

  {/* Graph canvas — takes remaining space, min 720px enforced by siblings */}
  <div
    ref={containerRef}
    className="flex-1 relative rounded-none border-border/30 overflow-hidden"
    style={{ background: GRAPH_BACKGROUND, minWidth: 0 }}
  >
    {/* All canvas, overlays, badges — no panels */}
  </div>

  {/* Detail panel — docked right, only when node selected */}
  {selectedNode && !polygonSelection && (
    <div className="relative flex-shrink-0 w-64 border-l border-border/30 overflow-y-auto">
      <SidePanel state={selectedNode} onClose={...} />
    </div>
  )}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| d3-force on main thread | d3-force Web Worker (already done) | Phase 2 | Worker averageVelocity is the stability signal |
| Canvas 2D only renderer | CosmosGraphRenderer (GPU) as primary | Phase 2 | Label rendering targets Canvas 2D draw(); Cosmos uses hover labels |
| D3-force driving GPU | Cosmos native GPU physics | Phase 2 (TD-005) | getSimulationAlpha() is the stability signal for Cosmos path |
| Overlay panels inside canvas | Sibling panels in flex layout | Phase 3 (this work) | Proper non-overlapping layout |

**Known non-deprecated patterns in use:**
- `graph.setConfigPartial()` (not `setConfig`) — documented trap from Phase 2 that MUST be preserved
- `start() + render()` pairing for Cosmos re-heat — also documented trap; do not simplify to just `render()`
- Dynamic import of `@cosmos.gl/graph` to prevent SSR — keep the pattern

---

## Open Questions

1. **Cosmos persistent zoom labels (UI-01 Cosmos path)**
   - What we know: Cosmos v3 (`@cosmos.gl/graph@3.0.0-beta.8`) has `onPointMouseOver` hover labels — confirmed in live code
   - What's unclear: Whether Cosmos v3 exposes a `pointLabelField` or equivalent API for persistent labels at zoom thresholds
   - Recommendation: Scope UI-01 to Canvas 2D only for this phase. Cosmos already has hover labels via `onPointMouseOver`. Persistent zoom labels on Cosmos would require verifying the v3 API at implementation time; defer if not trivially available.

2. **Stable badge positioning when perf HUD is active**
   - What we know: Perf HUD is at `absolute top-2 right-2 z-50` inside the graph container
   - What's unclear: After restructuring to sibling panels, the HUD stays inside the canvas container. Badge also targets `top-12 right-3` inside the canvas container. No conflict.
   - Recommendation: No change needed — badge goes at `top-3 right-3` inside the canvas container (below the HUD which is `top-2`), adjusting if needed so they don't collide.

3. **AccUserSidePanel vs inline SidePanel**
   - What we know: `AccUserSidePanel.tsx` uses `fixed top-0 right-0 bottom-0 w-[400px]` — it's a full-page fixed overlay with a backdrop. The graph's inline `SidePanel` is a different component rendered inside AccUsersGraph (not the same file as AccUserSidePanel).
   - What's unclear: Whether UI-03 affects `AccUserSidePanel` (fixed full-page panel) or only the inline side panel inside the graph component.
   - Recommendation: UI-03 targets the inline graph side panel (`absolute top-3 right-3 bottom-3 z-20 w-72` in AccUsersGraph.tsx). `AccUserSidePanel.tsx` is used by the Users directory tab, not by the graph — it is NOT affected by UI-03.

---

## Sources

### Primary (HIGH confidence)

- Live codebase — `app/(dashboard)/users/AccUsersGraph.tsx` (2150 lines read directly)
- Live codebase — `app/(dashboard)/users/graphRenderers.ts` (886 lines read directly)
- Live codebase — `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` (535 lines read directly)
- Live codebase — `app/(dashboard)/users/AccUserSidePanel.tsx` (layout behavior confirmed)
- Live codebase — `app/globals.css` (Tailwind tokens, motion variables confirmed)
- `.planning/phases/03-graph-ui-completion/03-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — UI-01/02/03 requirement text and acceptance criteria
- `.planning/ROADMAP.md` — success criteria for Phase 3
- `.planning/STATE.md` — Phase 2 Cosmos API traps (setConfigPartial, start+render pairing)

### Tertiary (LOW confidence)

- Cosmos.gl v3 `pointLabelField` API — not verified in live code or Context7; flagged as open question

---

## Metadata

**Confidence breakdown:**
- Current rendering architecture: HIGH — read directly from source
- Worker stability signal (averageVelocity): HIGH — confirmed in worker source and AccUsersGraph.tsx
- Panel layout conflict root cause: HIGH — confirmed by reading JSX structure
- Zoom scale ranges: MEDIUM — the [0,1] world space and scale=600 default are confirmed; exact "comfortable" zoom thresholds need empirical tuning
- Cosmos persistent label API: LOW — not confirmed in source or docs

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (stable codebase; 30-day window appropriate)
