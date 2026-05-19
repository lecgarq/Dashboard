# Phase 4: Interactions + Analytics Bridge - Research

**Researched:** 2026-05-19
**Domain:** Canvas-graph interaction layer (filter/search/click/hover/lasso) + DuckDB analytics bridge to pie chart
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Lasso + pie chart bridge**
- Activation: Dedicated toolbar button toggles lasso mode on/off; cursor changes to crosshair while active; Esc or clicking the toggle again exits.
- Shape: Freehand drag — user holds left mouse and draws any closed curve; release auto-closes the loop.
- Panel location: Right-side panel that slides in from the right when a lasso completes; overlays whatever right-side panel was previously showing (sliders by default).
- Breakdown content: Two pie charts side-by-side inside the panel — one for role, one for permission tier.
- Slice click behavior: Clicking a pie slice acts as a drill-down filter on the current selection — graph dims everyone in the selection who doesn't match that slice; click the slice again to clear the drill-down.
- Selection persistence across filters: Lasso members stay selected when global filters change; the pie chart recomputes from only the still-visible subset of the selection.
- Multi-lasso: Single lasso only for v1 — drawing a new lasso replaces the previous selection.
- Panel chrome: Header shows "N users selected" count + an explicit "Clear selection" button.

**Filter + search surface**
- Location: Top toolbar (horizontal row above the graph) — search box + filter group buttons + lasso toggle + 2D/3D segmented control all share this bar.
- Filter style (categorical): Chip toggles per value (role, permission tier, project, isExternal). Active chips highlighted; click to add/remove.
- Filter style (numeric): Bucket chips for activity count and last sign-in age. Pre-defined buckets (Activity: Low / Med / High / None; Sign-in: <7d / <30d / <90d / >90d).
- Dimensions covered: All six dimensions get BOTH a filter AND a slider — categorical via value chips, numeric via bucket chips, plus a 0–100 slider per dim.
- Chip overflow: Six dimension group buttons (Role ▾, Tier ▾, Project ▾, Activity ▾, Sign-in ▾, External ▾) open popovers containing the chips.
- Search match style: Prefix match on name + email only.
- Search visual effect: Highlight matches + dim non-matches via the SAME alpha-mask channel used by filters.
- Clear-all: Subtle "Clear all" link at right edge of toolbar, visible only when any filter is non-default.

**Slider UI + 2D/3D toggle**
- Slider location: Right sidebar, always visible by default. Six sliders stacked vertically. This is the right-side panel's "home state."
- Slider value display: 0–100 scale with a numeric badge next to each dim's label (e.g., "Activity 73").
- Reset behavior: BOTH a global "Reset" button at the top of the slider panel resets all six to 0, AND double-clicking any individual slider thumb resets just that one.
- Slider persistence: Slider values + active filters persist to localStorage and restore on reload.
- 2D/3D toggle UI: Segmented "2D | 3D" pill control in the top toolbar.
- 2D/3D animation: Smooth ~600ms tween of camera + z-axis on switch — already implemented by Phase 3.

**Click-isolate + hover tooltip**
- Single-click action: Isolate the clicked node (others drop to ~0.15 alpha) AND open a right-side user-detail panel with the full record.
- Isolate mechanism: SAME alpha-mask channel as filters/search.
- Exit isolate: Three exits — click empty background, press Esc, OR click another node (re-isolates to that node).
- Tooltip content: Full six-field tooltip — name, email, project, role, last sign-in, activity count.
- Tooltip position: Anchored to hovered node's screen position with a small above-right offset; flips sides / clamps to viewport edges.
- User-detail panel scope: Shows ALL projects and roles for the clicked user, regardless of current filters.

**Right-side panel coordination (cross-cutting)**
- Three panels can occupy the right side: sliders (default home), lasso pie (on lasso complete), user detail (on node click).
- Rule: One panel at a time. Latest action wins; closing the active overlay returns to the panel underneath (ultimately the sliders).
- Right side never splits or stacks — single z-stack of overlays over the slider home state.

### Claude's Discretion
- Exact pixel widths, padding, font sizing for toolbar, sliders, popovers, tooltip, right-side panel.
- Specific colors / hover / active states for chips, slider tracks, segmented control.
- Bucket thresholds for numeric filters (Activity Low/Med/High, Sign-in <7d / <30d / <90d / >90d) — pick sensible defaults from Hermosillo data distribution.
- Pie chart palette and legend layout inside the lasso side panel.
- Lasso path rendering style (color, dash, thickness, animated marching ants vs static).
- Empty-state messaging when filters return zero nodes.
- Animation easing curves and exact durations beyond the 600ms 2D/3D target.
- Keyboard shortcut for the search box (Ctrl/Cmd+K is sensible default).
- Whether the lasso draws on the 2D canvas only or also works in 3D — RECOMMENDATION: 2D only for v1; disable lasso button when in 3D mode.

### Deferred Ideas (OUT OF SCOPE)
- Additive / subtractive multi-lasso (Shift = add, Alt = subtract).
- Saved views / shareable URLs for filter + slider state.
- Export selection (CSV of lasso members).
- Search autocomplete / recent searches dropdown.
- Keyboard shortcuts beyond Esc and Ctrl/Cmd+K.
- Lasso in 3D mode.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTR-01 | Real-time filter — togglable dimension filters update alphaMask immediately; positions preserved | `physics.setMask(predicate)` already implemented; filter chips compute a per-index predicate from `{ activeChips: Map<dimId, Set<value>> }` and a derived `NodeFeatureSnapshot[]` kept in parent state |
| INTR-02 | Real-time search — text input highlights matches; positions preserved | Same `physics.setMask` channel; predicate becomes `(i) => (matchesFilters[i] && matchesSearch[i]) ? 1 : 0.15`. Debounce input by 80–120ms to avoid mask churn on each keystroke |
| INTR-03 | Click-isolate — clicking a node dims everything else | cosmos.gl `onClick(index, pos, event)` callback in 2D; three.js `Raycaster.intersectObject(mesh)` returning `instanceId` in 3D. Both write `physics.setMask`. Selected index also stored in component state to drive `focusedPointIndex` (ring) |
| INTR-04 | Hover detail — tooltip with node feature snapshot | cosmos.gl `onPointMouseOver(index, pointPosition, event)` + `onPointMouseOut`; three.js raycast on `pointermove`. Render tooltip as a portal `<div>` positioned via `spaceToScreenPosition()` (2D) or projected mesh position (3D) |
| INTR-05 | Lasso tool — freehand polygon selection over canvas → `selectedNodeIds[]` | cosmos.gl exposes `findPointsInPolygon(path: [number,number][])` returning indices, AND `screenToSpacePosition([sx,sy])` for converting drawn screen pixels to space coords. Overlay `<canvas>` captures `pointerdown/move/up`, draws the path, then calls `findPointsInPolygon` on `pointerup` |
| INTR-06 | Dimension sliders UI — one slider per dim with 0–100 range and live value readout | Radix UI is installed (`radix-ui` 1.4.3) — `@radix-ui/react-slider` primitive. SliderContext holds `Record<dimId, number>`; debounces `physics.updateSliders(values/100)` calls to ≤30Hz |
| INTR-07 | 2D / 3D toggle button — single click switches mode | Already implemented in Phase 3 (`GraphCanvas.mode` prop). Phase 4 only needs the segmented pill UI that flips it |
| ANLY-01 | Lasso selection → DuckDB aggregation → pie chart breakdown | `selectedNodeIds[]` → `WHERE node_id IN (...)` against `user_projects` view (Phase 1) joined with `folder_permissions`; group by `role_id` and by `permission_tier`. Two queries run via existing `useMosaicCoordinator` connector. Results shape: `{ label, value }[]` matches existing `DonutPanel` `DonutSlice` API |
| ANLY-02 | Pie chart updates in real time as lasso selection changes; uses canonical `ChartDatum[]` shape | Use existing in-house `DonutPanel.tsx` (already in this folder) — pure SVG, zero new deps. `DonutSlice = { label: string; value: number; color: string }` IS the canonical shape used in this codebase |

</phase_requirements>

---

## Summary

Every API needed to satisfy INTR-01..07 + ANLY-01..02 is already available in installed code. cosmos.gl v3 exposes `findPointsInPolygon`, `screenToSpacePosition`, `onClick`, `onPointMouseOver`, `onPointMouseOut`, and `focusedPointIndex` — exactly the interaction surface this phase requires. The Phase 2 `physicsLayer.setMask(predicate)` API already implements the alpha-mask channel; Phase 3 wires it through `GraphCanvas2D.applyAlphaMask` (cosmos.gl `highlightedPointIndices` + `pointGreyoutOpacity: 0.15`) and `GraphCanvas3D.applyAlphaMask` (per-instance color × 0.15). Phase 4's job is to build the UI surface (toolbar + slider sidebar + tooltip portal + lasso overlay + pie panel) and route every user gesture into either `physics.setMask` (filter/search/click/lasso) or `physics.updateSliders` (sliders) — **never** touching positions, geometry, or the simulation directly.

The lasso → DuckDB → pie path uses the existing Mosaic coordinator (`MosaicCoordinatorContext.tsx`) and the existing `user_projects` + `folder_permissions` views (`graphSql.ts`). For role aggregation, `user_projects.role_ids` is a string-array column (Arrow list) — DuckDB `UNNEST` flattens it for `GROUP BY`. The pie chart uses the project's existing in-house `DonutPanel.tsx` SVG component (already in `app/(dashboard)/users/access-analysis/`) with `DonutSlice[]`. **Do not pull in `@nivo/pie`** even though it's installed — `DonutPanel` is the canonical pattern in this folder, requires zero new deps, and matches the project's terse SVG style.

Radix UI (`radix-ui` 1.4.3) provides the slider, popover (chip overflow), tooltip, and dialog primitives — all already installed. `next-themes` (resolvedTheme) is already wired for theme-driven colors. No new packages are needed.

**Primary recommendation:** Build 04-01 as the interaction layer (`GraphInteractions.tsx` + lasso overlay canvas + tooltip portal + click-isolate) routing all gestures through `physics.setMask`. Build 04-02 as the chrome (`Toolbar.tsx` with filter chips + search + 2D/3D pill + lasso toggle, `SliderSidebar.tsx` + `SliderContext`, `SelectionPanel.tsx` with two `DonutPanel`s fed from a DuckDB aggregation query). localStorage hydration on mount. Lasso disabled while `mode === "3d"` for v1.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cosmos.gl/graph` | `3.0.0-beta.9` | 2D event source: `onClick`, `onPointMouseOver/Out`, `findPointsInPolygon`, `screenToSpacePosition`, `focusedPointIndex` | Already wired in Phase 3 (`GraphCanvas2D.tsx`) — v3 README + dist/config.d.ts confirm all needed APIs exist |
| `three` | `0.184.0` | 3D event source: `Raycaster.intersectObject(InstancedMesh)` → `instanceId` for click/hover in 3D | Already wired in Phase 3 (`GraphCanvas3D.tsx`); standard three.js pattern for InstancedMesh hit-testing |
| `radix-ui` | `^1.4.3` | Slider, Popover (chip dropdowns), Tooltip, Dialog primitives | Already installed; project's standard headless UI library (used throughout `components/ui/`) |
| `@uwdata/mosaic-core` + `@uwdata/mosaic-sql` | `^0.25.0` | Coordinator + Query/sql builder for lasso → DuckDB aggregation | Already wired in `MosaicCoordinatorContext.tsx` and `CosmosCanvasClient.ts` |
| `@duckdb/duckdb-wasm` | `^1.33.1-dev45.0` | In-browser SQL engine — runs lasso aggregation queries on `user_projects` + `folder_permissions` | Already initialized via `duckdbClient.ts`; Phase 1 registered `user_projects` view |
| `next-themes` | `^0.4.6` | `useTheme().resolvedTheme` for theme-aware chip/slider/panel colors | Already wired in `GraphCanvas.tsx`; consistent with project layout |

### Supporting (in-house — already in the access-analysis folder)

| Module | Path | Purpose |
|--------|------|---------|
| `DonutPanel.tsx` | `app/(dashboard)/users/access-analysis/DonutPanel.tsx` | Pure SVG donut chart — use directly for the role + permission tier breakdowns. `DonutSlice = { label, value, color }` is canonical |
| `physicsLayer.ts` | same folder | `setMask(predicate)` (filter/search/lasso/click target), `updateSliders(values)` (slider target). Both mutate independent buses |
| `GraphCanvas.tsx` | same folder | Mode-managed render layer. Phase 4 wraps this with `GraphInteractions` |
| `MosaicCoordinatorContext.tsx` | same folder | DuckDB → Mosaic Coordinator + `Selection.crossfilter()`. Use `useMosaicCoordinator()` to issue ad-hoc queries; OR bypass Mosaic and call `getDuckDbClient()` for one-shot aggregations |
| `graphSql.ts` | same folder | `GRAPH_ANALYTICS_SOURCE_TABLES.userProjects = "graph_user_projects"`, `.folderPermissions = "graph_folder_permissions"`. View names for aggregation queries |
| `dataLayer.ts` | same folder | `NormalizedNodeRow` shape — drives the per-index feature snapshot used by filter predicates |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-house `DonutPanel.tsx` | `@nivo/pie` (installed) | Nivo adds React-tree weight + theming wiring; `DonutPanel` is 148 lines of pure SVG and already matches project style. Nivo only justified if interactive hover/click was needed beyond what slice click can deliver via `onClick` |
| Mosaic `Selection.crossfilter()` for the lasso pie | One-shot `connection.query(sql)` via `getDuckDbClient()` | Mosaic shines for many coordinated clients sharing one selection; the lasso pie is one consumer of one selection — direct DuckDB SQL is simpler. RECOMMEND: direct query. Mosaic stays in use for `CosmosCanvasClient` only |
| Custom slider | `@radix-ui/react-slider` (via `radix-ui` 1.4.3) | Radix gives a11y + keyboard + double-click reset hookable via `onPointerDown` — no reason to hand-roll |
| Custom tooltip positioning | `@radix-ui/react-tooltip` | Tooltip primitive triggers on hover of a target element. For canvas-rendered nodes there is no DOM element to attach to — must hand-roll position via `spaceToScreenPosition`. Tooltip primitive does NOT fit; render a styled `<div>` in a portal at computed coords |
| Custom event-throttled mask updates | `requestAnimationFrame` coalescing | Use rAF coalescing — multiple keystrokes in one frame collapse to a single `setMask` call. Standard React pattern |

**Installation:** No new packages. All required libraries are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
app/(dashboard)/users/access-analysis/
├── GraphInteractions.tsx           # PHASE 4-01 — wraps GraphCanvas; owns click/hover/lasso wiring
├── LassoOverlay.tsx                # PHASE 4-01 — transparent <canvas> over GraphCanvas; freehand path capture
├── NodeTooltip.tsx                 # PHASE 4-01 — portal <div> tooltip; receives anchor coords + feature snapshot
├── Toolbar.tsx                     # PHASE 4-02 — top bar: search + dimension group popovers + lasso toggle + 2D/3D pill + clear-all
├── DimensionFilterPopover.tsx      # PHASE 4-02 — chip popover for one dimension
├── SliderSidebar.tsx               # PHASE 4-02 — right-sidebar home state; six Radix sliders + reset button
├── SliderContext.tsx               # PHASE 4-02 — Record<dimId, number> state + localStorage hydration
├── FilterContext.tsx               # PHASE 4-02 — Record<dimId, Set<value>> + search string + localStorage hydration
├── SelectionPanel.tsx              # PHASE 4-02 — right-side overlay; two DonutPanels (role + tier); slice drill-down
├── selectionQueries.ts             # PHASE 4-02 — DuckDB SQL for selection → role/tier aggregation
├── UserDetailPanel.tsx             # PHASE 4-02 — right-side overlay opened by click-isolate
├── RightPanelStack.tsx             # PHASE 4-02 — z-stack manager: sliders (home) ← user-detail ← lasso-pie
├── usePredicateEngine.ts           # PHASE 4-01 — composes filter chips + search + lasso + click-isolate + drill-down into ONE predicate fed to physics.setMask
├── GraphCanvas.tsx                 # PHASE 3 — unchanged
├── physicsLayer.ts                 # PHASE 2 — unchanged
└── *.test.ts(x)                    # Vitest tests per file
```

### Pattern 1: One Predicate Engine, One `setMask` Call

**What:** Every interaction (filter chips, search, click-isolate, lasso, drill-down) collapses into a single predicate `(nodeIndex: number) => 0.15 | 1.0` that is recomputed and pushed via `physics.setMask` whenever ANY input changes.

**When to use:** Always. There is exactly ONE alpha-mask channel; layering masks independently leads to phase-ordering bugs.

**Example:**
```typescript
// usePredicateEngine.ts
import { useEffect } from "react";
import type { PhysicsLayer } from "./physicsLayer";

interface PredicateInputs {
  physics: PhysicsLayer;
  features: ReadonlyArray<NodeFeatureSnapshot>;   // length = nodeCount
  activeFilters: Readonly<Record<string, ReadonlySet<string>>>;
  searchQuery: string;                            // lowercased, prefix
  lassoSelection: ReadonlySet<number> | null;     // null = inactive
  drillDown: Readonly<Record<string, string>> | null; // pie slice click within selection
  isolatedNodeIndex: number | null;               // click-isolate target
}

export function usePredicateEngine(inputs: PredicateInputs): void {
  useEffect(() => {
    const {
      physics, features, activeFilters, searchQuery,
      lassoSelection, drillDown, isolatedNodeIndex,
    } = inputs;

    // CRITICAL: closure captures all inputs; setMask reruns over all indices.
    physics.setMask((i: number): number => {
      const f = features[i];

      // 1. Click-isolate wins — dim everything except the isolated node.
      if (isolatedNodeIndex !== null) return i === isolatedNodeIndex ? 1.0 : 0.15;

      // 2. Global filter chips — categorical AND numeric buckets.
      for (const [dim, allowedSet] of Object.entries(activeFilters)) {
        if (allowedSet.size === 0) continue;          // empty set = "any"
        if (!allowedSet.has(f.bucketByDim[dim])) return 0.15;
      }

      // 3. Search prefix match.
      if (searchQuery && !f.nameLower.startsWith(searchQuery) && !f.emailLower.startsWith(searchQuery)) {
        return 0.15;
      }

      // 4. Lasso selection AND drill-down — only filters WITHIN the lasso.
      if (lassoSelection) {
        if (!lassoSelection.has(i)) return 0.15;
        if (drillDown) {
          for (const [dim, value] of Object.entries(drillDown)) {
            if (f.bucketByDim[dim] !== value) return 0.15;
          }
        }
      }

      return 1.0;
    });
  }, [
    inputs.physics,
    inputs.features,
    inputs.activeFilters,
    inputs.searchQuery,
    inputs.lassoSelection,
    inputs.drillDown,
    inputs.isolatedNodeIndex,
  ]);
}
```

**Why single predicate:** Phase 2's `physicsLayer.setMask` overwrites — it does not compose. Maintaining multiple independent mask layers would require a reducer and version tracking. Recompute-from-truth is simpler and runs in <0.5ms for 10k nodes.

### Pattern 2: Lasso Capture via Transparent Overlay Canvas

**What:** A transparent `<canvas>` absolutely positioned over `GraphCanvas` captures `pointerdown / pointermove / pointerup` events. Path drawn as 2D Canvas path. On `pointerup`, the SCREEN-space polygon is converted to SPACE-space via `cosmos.gl#screenToSpacePosition`, then `findPointsInPolygon(spacePolygon)` returns the matched indices.

**When to use:** v1 lasso (2D mode only — CONTEXT.md). When `mode === "3d"`, the lasso toggle button is disabled.

**Example:**
```typescript
// LassoOverlay.tsx — pseudocode
const overlayRef = useRef<HTMLCanvasElement>(null);
const pathRef = useRef<[number, number][]>([]);

function onPointerDown(e: PointerEvent): void {
  pathRef.current = [[e.offsetX, e.offsetY]];
  overlayRef.current!.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (pathRef.current.length === 0) return;
  pathRef.current.push([e.offsetX, e.offsetY]);
  drawPath(overlayRef.current!, pathRef.current); // canvas-2d strokeStyle="#3b82f6"; line dash for marching ants
}

function onPointerUp(e: PointerEvent): void {
  const screenPath = pathRef.current;
  pathRef.current = [];
  if (screenPath.length < 3) { clearOverlay(); return; }

  // Convert screen pixels to cosmos.gl space coordinates
  const spacePath: [number, number][] = screenPath.map(
    ([sx, sy]) => cosmosGraph.screenToSpacePosition([sx, sy])
  );

  // cosmos.gl returns matched point indices in O(n)
  const matched = cosmosGraph.findPointsInPolygon(spacePath);
  onLassoComplete(matched);
  clearOverlay();
}
```

**Critical:** `screenToSpacePosition` must be called AFTER cosmos.gl `ready` resolves, and the screen coordinates must be in the cosmos.gl canvas's local coordinate space (not page). Use `event.offsetX/offsetY` against the overlay canvas, which is positioned identically to the cosmos.gl canvas (`inset: 0` over the same parent).

### Pattern 3: Click + Hover Wired via cosmos.gl Callbacks (NOT in setConfigPartial)

**What:** Wire `onClick`, `onPointMouseOver`, `onPointMouseOut` at cosmos.gl construction (passed in the initial config). For runtime changes (e.g. lasso mode toggle disables click), use a ref-indirect handler so the latest closure is invoked.

**When to use:** Mount time only. The callbacks are stable; they delegate to ref-stored handlers.

**Example:**
```typescript
// In GraphCanvas2D mount effect — extends Phase 3 init
const handlersRef = useRef<{
  onPointClick: (i: number) => void;
  onPointHover: (i: number, screenPos: [number, number]) => void;
  onPointHoverEnd: () => void;
}>(noopHandlers);

g = new Graph(div, {
  enableSimulation: false,
  transitionDuration: 0,
  renderLinks: false,
  backgroundColor: props.backgroundColor,
  pointGreyoutOpacity: 0.15,
  // ... existing Phase 3 config ...
  onClick: (index, pointPos, event) => {
    if (index !== undefined) handlersRef.current.onPointClick(index);
    else handlersRef.current.onPointHoverEnd(); // background click closes isolate
  },
  onPointMouseOver: (index, pointPosition, _ev, _isH, _isO) => {
    // pointPosition is space-coords; need screen for tooltip placement
    const screenPos = g!.spaceToScreenPosition(pointPosition);
    handlersRef.current.onPointHover(index, screenPos);
  },
  onPointMouseOut: () => handlersRef.current.onPointHoverEnd(),
});

// Expose a setter on the handle:
handle.setEventHandlers = (h) => { handlersRef.current = h; };
```

**Why ref-indirect:** cosmos.gl reads its config once at construction (or on `setConfigPartial`). Re-issuing `setConfigPartial` on every React re-render would be wasteful and could reset other config. A ref ensures the latest React closure runs without re-configuring cosmos.gl.

### Pattern 4: 3D Click/Hover via Raycaster

**What:** three.js `Raycaster` against `InstancedMesh` returns `intersection.instanceId` — the per-node index.

**When to use:** Only when `mode === "3d"`. Attach `pointerdown` / `pointermove` listeners to the three.js canvas; convert event coords to NDC.

**Example:**
```typescript
// Inside GraphCanvas3D mount; expose via handle
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAtPointerEvent(e: PointerEvent): number | null {
  const rect = canvas.getBoundingClientRect();
  ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(mesh)[0];
  return hit?.instanceId ?? null;
}

canvas.addEventListener("click", (e) => {
  const i = pickAtPointerEvent(e);
  handlersRef.current.onPointClick(i);
});

canvas.addEventListener("pointermove", (e) => {
  const i = pickAtPointerEvent(e);
  if (i !== null) {
    const screenPos: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
    handlersRef.current.onPointHover(i, screenPos);
  } else {
    handlersRef.current.onPointHoverEnd();
  }
});
```

**Performance note:** Raycast against `InstancedMesh` is O(instances) per call. At 10k nodes, a `pointermove`-driven hover raycast can drop frames. Throttle to ~16ms via `requestAnimationFrame` coalescing OR check pointer-delta minimum before raycasting.

### Pattern 5: Tooltip via Portal + spaceToScreenPosition

**What:** A `<div>` rendered in a `ReactDOM.createPortal` to `document.body`, positioned via inline style at the hovered node's screen coordinates. cosmos.gl returns space coords on `onPointMouseOver`; convert to screen with `spaceToScreenPosition`.

**Example:**
```typescript
// NodeTooltip.tsx
interface TooltipProps {
  anchorScreenXY: [number, number] | null;
  feature: NodeFeatureSnapshot | null;
}

export function NodeTooltip({ anchorScreenXY, feature }: TooltipProps) {
  if (!anchorScreenXY || !feature) return null;
  const [sx, sy] = anchorScreenXY;

  // Above-right offset, clamped to viewport
  const left = Math.min(window.innerWidth - 280, sx + 12);
  const top  = Math.max(8, sy - 8 - 140);

  return createPortal(
    <div style={{ position: "fixed", left, top, /* zinc styles */ }}>
      <div className="font-semibold">{feature.name}</div>
      <div className="text-xs text-muted-foreground">{feature.email}</div>
      <div>{feature.project}</div>
      <div>{feature.role}</div>
      <div>Last sign-in: {feature.lastSignInRel}</div>
      <div>Activity: {feature.activityCount}</div>
    </div>,
    document.body,
  );
}
```

**Critical:** Cosmos returns `spaceToScreenPosition` in cosmos canvas-local pixels. To position relative to the viewport, add the canvas's `getBoundingClientRect().left/top` OR use `position: fixed` and add the rect offsets explicitly.

### Pattern 6: Lasso → DuckDB Aggregation Query

**What:** Direct DuckDB SQL via `getDuckDbClient()` — single-shot aggregation, NOT a Mosaic client. Mosaic shines for many coordinated views; the lasso pie is one consumer.

**Example:**
```typescript
// selectionQueries.ts
import { getDuckDbClient } from "./duckdbClient";

export async function aggregateSelectionByRole(
  selectedNodeIds: readonly string[],
): Promise<DonutSlice[]> {
  const { connection } = await getDuckDbClient();

  // node_id is concat(user_id, '::', project_id) per CosmosCanvasClient.ts
  // graph_user_projects.role_ids is an Arrow list — UNNEST flattens it.
  const idList = selectedNodeIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(",");
  if (idList.length === 0) return [];

  const sql = `
    WITH sel AS (
      SELECT * FROM graph_user_projects
      WHERE concat(user_id, '::', project_id) IN (${idList})
    )
    SELECT role_id AS label, COUNT(*) AS value
    FROM sel, UNNEST(role_ids) AS t(role_id)
    GROUP BY role_id
    ORDER BY value DESC
  `;

  const result = await connection.query(sql);
  const rows = result.toArray() as Array<{ label: string; value: bigint }>;

  return rows.map((r, i) => ({
    label: r.label || "(no role)",
    value: Number(r.value),
    color: paletteForIndex(i),
  }));
}

export async function aggregateSelectionByTier(
  selectedNodeIds: readonly string[],
): Promise<DonutSlice[]> {
  // Similar — JOIN graph_user_projects ↔ graph_folder_permissions on (user_id, project_id),
  // GROUP BY permission_tier
}
```

**Critical:** DuckDB returns `COUNT(*)` as `BigInt` in JS. Always `Number(r.value)` before passing to `DonutPanel` (SVG arc math fails on `BigInt`).

**Critical:** Parameterized queries are preferred but DuckDB-WASM's `prepare`/`bind` is awkward; for an `IN (...)` list of node IDs the safe approach is escape `'` → `''` as shown. Node IDs are server-derived (email + projectId) so injection surface is small but non-zero — sanitize.

### Pattern 7: Slider → Physics with rAF Coalescing

**What:** Multiple slider changes in one frame collapse into ONE `physics.updateSliders(values)` call via `requestAnimationFrame`.

**Example:**
```typescript
// SliderContext.tsx
const pendingValuesRef = useRef<Record<string, number> | null>(null);
const rafIdRef = useRef<number | null>(null);

function setSliderValue(dimId: string, value0to100: number) {
  setState((s) => ({ ...s, [dimId]: value0to100 }));

  pendingValuesRef.current = { ...stateRef.current, [dimId]: value0to100 };
  if (rafIdRef.current === null) {
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const v = pendingValuesRef.current!;
      // Normalize 0-100 → 0-1 before sending to physics
      const normalized = Object.fromEntries(
        Object.entries(v).map(([k, n]) => [k, n / 100]),
      );
      physics.updateSliders(normalized);
    });
  }
}
```

**Why coalesce:** Drag events can fire 100Hz on high-refresh monitors. `physics.updateSliders` walks every named force, mutates strength, and reheats — coalescing to 60Hz max prevents redundant work.

### Pattern 8: localStorage Persistence

**What:** Filter state + slider state hydrated from `localStorage` on mount, persisted with debounced writes.

**Example:**
```typescript
const STORAGE_KEY = "lecg.access-analysis.controls.v1";

interface PersistedState {
  sliders: Record<string, number>;
  filters: Record<string, string[]>; // Set serialized as array
  searchQuery: string;
}

function loadPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null; // SSR guard
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function savePersisted(s: PersistedState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}
```

**Critical:** SSR guard (`typeof window === "undefined"`) — Next.js will server-render the page. Hydration mismatch is the #1 bug when localStorage is read during render.

**Critical:** Wrap in `try/catch` — Safari private mode and quota-exceeded both throw.

### Pattern 9: Right-Side Panel Z-Stack

**What:** Three possible right-side panels (sliders home / lasso pie / user detail). Single z-stack — latest action wins; close returns to underneath panel.

**Example:**
```typescript
// RightPanelStack.tsx
type RightPanelLayer =
  | { kind: "sliders" }
  | { kind: "lasso-pie"; selection: ReadonlySet<number> }
  | { kind: "user-detail"; userIndex: number };

// Stack is implicit: top layer = latest non-null among lasso + user-detail; fall back to sliders.
function getTopLayer(
  lasso: ReadonlySet<number> | null,
  userIndex: number | null,
): RightPanelLayer {
  if (userIndex !== null) return { kind: "user-detail", userIndex };
  if (lasso) return { kind: "lasso-pie", selection: lasso };
  return { kind: "sliders" };
}
```

**Slide-in animation:** `framer-motion` (installed) `<motion.div>` with `initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}` and `AnimatePresence`.

### Anti-Patterns to Avoid

- **Calling `physics.setMask` from multiple effect hooks independently**: The mask is overwritten by the last call, not composed. Use ONE predicate engine.
- **Touching the simulation from a filter handler**: PHYS-04 invariant — filter/search/lasso/click events must NEVER reach `sim.alpha` or `sim.restart()`. The mask bus is structurally separate.
- **Using cosmos.gl `setConfig` for runtime event handler updates**: `setConfig` resets all defaults (Phase 3 Pitfall 1). Use ref-indirection for handler updates; `setConfigPartial` only if you must.
- **Storing the lasso polygon as React state during the drag**: Pointer events fire 60+ Hz; React state updates trigger re-renders. Draw to canvas-2d in the event handler directly; only commit `selectedNodeIds[]` to state on `pointerup`.
- **Querying DuckDB on every pointer-move during lasso drag**: Only query on `pointerup`. The drag visual is purely canvas-2d.
- **Re-rendering `DonutPanel` on every search keystroke when lasso is not active**: Memoize the panel; only refetch when `selectedNodeIds[]` changes.
- **Forgetting the BigInt cast from DuckDB `COUNT(*)` results**: `Number(r.value)` always. `BigInt + 0` throws.
- **Allowing lasso in 3D mode for v1**: CONTEXT.md defers 3D lasso. Disable the toggle button when `mode === "3d"`; show a tooltip "Lasso available in 2D mode only."

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon point-in-test for lasso | Custom ray-casting / winding-number algorithm in TypeScript | cosmos.gl `graph.findPointsInPolygon(spacePath)` | GPU-friendly, O(n), already implemented; correct under pan/zoom because `screenToSpacePosition` handles the transform |
| Screen ↔ space coordinate transform | Manual zoom/pan matrix math | cosmos.gl `graph.screenToSpacePosition()` + `spaceToScreenPosition()` | Cosmos owns the transform internally; reproducing it is exactly the kind of "patch bug" the rewrite is meant to prevent |
| Slider primitive | Custom range input with drag handlers | `@radix-ui/react-slider` (via installed `radix-ui` 1.4.3) | Keyboard a11y + ARIA + multi-thumb support out of the box |
| Popover for chip overflow | Custom positioning + click-outside | `@radix-ui/react-popover` (via `radix-ui`) | Floating UI positioning + focus management built in |
| Pie chart | Pull in `@nivo/pie` | `DonutPanel.tsx` already in this folder | 148 lines of pure SVG, zero new deps, project-canonical style |
| 3D hover/click on InstancedMesh | Custom GPU pick buffer | three.js `Raycaster.intersectObject(mesh)` → `instanceId` | Standard pattern, no custom shader required, ~5ms at 10k nodes |
| Selection broadcast to multiple panels | Custom event emitter | Single React Context (`SelectionContext`) with `useSelectionMembers()` hook | Cleanest React pattern; coalesces re-renders naturally |
| Selection-aware aggregation queries | Mosaic Selection.crossfilter | One-shot `connection.query(sql)` for the pie panel | Mosaic adds reactive plumbing that isn't justified by one consumer; direct SQL is 10 lines |
| Panel slide-in animation | CSS transitions on transform | `framer-motion` `<motion.div>` + `AnimatePresence` | Already installed; correct exit animation handling |
| String prefix matching for search | Custom Trie | `String.prototype.toLowerCase().startsWith()` over the feature snapshot | At <10k nodes, linear scan is <0.5ms; Trie is over-engineering |

**Key insight:** Every meaningful piece of this phase has a corresponding API call in code already installed in this repo. The phase is wiring, not algorithm work. Treat any "let's build a fresh X" instinct as a red flag.

---

## Common Pitfalls

### Pitfall 1: Lasso Coordinate Transform Under Pan/Zoom

**What goes wrong:** Drawing the lasso path in screen pixels and passing those pixels (un-transformed) to `findPointsInPolygon` works at default zoom but selects the wrong nodes after the user has panned or zoomed.

**Why it happens:** `findPointsInPolygon` operates in cosmos.gl's space-coordinate system (the layout-units coordinates of `setPointPositions`). The screen-space path the user drew is a different coordinate system once the user zooms or pans.

**How to avoid:** Always convert each screen path point to space coords via `graph.screenToSpacePosition([sx, sy])` BEFORE calling `findPointsInPolygon`. Use `event.offsetX/offsetY` (relative to the overlay canvas which is `inset: 0` over the cosmos canvas) so coordinates align.

**Warning signs:** Lasso "feels right" at first load but starts selecting visibly off-screen nodes after a few zoom/pan interactions. STATE.md Phase 4 risk explicitly flags this as MEDIUM confidence.

### Pitfall 2: `BigInt` Pollution from DuckDB COUNT

**What goes wrong:** `result.toArray()` returns `{ label, value: BigInt }` for `COUNT(*)`. Passing `BigInt` into `DonutPanel.value` (used in arithmetic) throws `TypeError: Cannot mix BigInt and other types`.

**Why it happens:** DuckDB-WASM `COUNT(*)` returns INT64 → JavaScript `BigInt`.

**How to avoid:** Map results immediately: `Number(row.value)`. Or cast in SQL: `CAST(COUNT(*) AS INTEGER)`.

**Warning signs:** Console error `Cannot mix BigInt and other types` deep inside `DonutPanel`.

### Pitfall 3: Hydration Mismatch from localStorage

**What goes wrong:** Reading `localStorage` during the render pass of a Next.js client component throws "Hydration failed because the server rendered HTML didn't match the client" — server has no localStorage, returns defaults; client reads stored values, renders different markup.

**Why it happens:** `app/(dashboard)/users/access-analysis/` is server-rendered first by Next.js 16, even with `"use client"`. The component renders ONCE on the server with default state, then hydrates on the client.

**How to avoid:** Two-pass mount — render with default state, then in a `useEffect` (which runs only client-side) read localStorage and `setState`. Accept the brief flash of defaults.

**Warning signs:** Console warning about hydration mismatch on first page load.

### Pitfall 4: Search Re-Runs Mask Every Keystroke

**What goes wrong:** Typing "Luis" fires four mask recalculations in ~200ms; each setMask walks every index and triggers a Phase 3 rAF that pushes `highlightedPointIndices` to cosmos.gl. At 10k nodes this is fine; at 50k it's noticeable.

**Why it happens:** `usePredicateEngine` depends on `searchQuery`; React re-runs the effect on every change.

**How to avoid:** Debounce `searchQuery` by 80–120ms before passing to the predicate engine. CONTEXT.md says "within one keystroke" — 80ms is well below human perception.

**Warning signs:** Search input feels laggy on fast typing.

### Pitfall 5: cosmos.gl Event Callbacks Capture Stale Closures

**What goes wrong:** Passing `onClick: (i) => setSelected(i)` directly in the cosmos config means the FIRST `setSelected` is captured. Subsequent prop updates don't propagate.

**Why it happens:** cosmos.gl reads the config once at construction. The callback closure is frozen.

**How to avoid:** Ref-indirection (Pattern 3) — config has `onClick: (i) => handlersRef.current.onPointClick(i)`. The handle exposes a `setEventHandlers(h)` method.

**Warning signs:** Click works once, then nothing happens. OR clicks consistently update with stale state.

### Pitfall 6: Raycaster Performance on InstancedMesh

**What goes wrong:** A `pointermove` listener calls `raycaster.intersectObject(mesh)` 60–120 times per second. At 10k instances this is ~5ms/call × 100 calls/sec = 50% of frame budget.

**Why it happens:** Three.js raycasts walk every instance.

**How to avoid:** Throttle via rAF coalescing — store the latest `pointermove` event, only raycast once per frame. OR check pointer delta against a 3px threshold before raycasting.

**Warning signs:** FPS counter dips to 30–40 only while moving the mouse.

### Pitfall 7: `findPointsInPolygon` Requires `graph.ready`

**What goes wrong:** Calling `findPointsInPolygon` during the cosmos.gl async init window throws or returns `[]` silently. Phase 3 Pitfall 3 documented this for setPointPositions; the same applies to ALL graph methods.

**Why it happens:** cosmos.gl v3 queues method calls until the luma.gl device is ready, but `findPointsInPolygon` is a query that must execute synchronously and returns immediately.

**How to avoid:** Ensure the lasso toggle button is disabled until `graph.isReady === true` OR the `ready` promise has resolved. Phase 3 already gates init behind this; Phase 4 must propagate readiness to the toolbar.

**Warning signs:** First lasso after page load returns empty selection; subsequent lassos work.

### Pitfall 8: `pointerup` Outside the Canvas

**What goes wrong:** User draws lasso, releases mouse outside the canvas — `pointerup` never fires on the overlay, leaving the drag state stuck open.

**Why it happens:** Pointer events without `setPointerCapture` only fire on the element where pointerdown occurred IF the cursor remains over it.

**How to avoid:** Call `overlay.setPointerCapture(e.pointerId)` on `pointerdown`. Now all subsequent pointer events for that pointer go to the overlay regardless of cursor position. Always release via `releasePointerCapture` on `pointerup`.

**Warning signs:** Lasso path keeps drawing after user releases mouse outside the graph area.

### Pitfall 9: DuckDB `IN (...)` List Size Limit

**What goes wrong:** A lasso of 50,000 nodes generates a 1MB SQL string. DuckDB-WASM parses it, but it's slow.

**Why it happens:** Inlining a large `IN` clause is a known anti-pattern.

**How to avoid:** For selections >1000, insert the selection into a temporary Arrow table and JOIN. For Phase 4 v1 (10k node target), inline `IN (...)` is acceptable; document the threshold for v2.

**Warning signs:** Pie chart takes >500ms to update on huge lasso.

### Pitfall 10: Numeric Filter Buckets Diverge from Slider Semantics

**What goes wrong:** "Activity: High" chip filter, "Activity slider = 60" position — the user expects these to be related but they operate independently. If the chip filters nodes OUT via mask AND the slider clusters nodes, the result feels inconsistent.

**Why it happens:** Sliders mutate positions (clustering), filters mutate visibility (alpha). They're orthogonal mechanics.

**How to avoid:** Document explicitly in UI tooltips — "Filter hides nodes; slider clusters nodes." The phase invariant (filter ≠ positions) is correct architecturally; the UX just needs to communicate it.

**Warning signs:** UAT confusion: "I set Activity=High but the bottom-left cluster is still showing low-activity users." Answer: the bottom-left cluster is still there because positions are frozen; the chip just dimmed those nodes. The slider would have rearranged the cluster.

---

## Code Examples

### cosmos.gl Event Wiring (extends GraphCanvas2D)

```typescript
// Source: @cosmos.gl/graph dist/config.d.ts (verified) + Phase 3 GraphCanvas2D.tsx
//
// Extend the existing Phase 3 mount effect with onClick/onPointMouseOver/onPointMouseOut.
// The handle exposes setEventHandlers for ref-indirect updates (Pattern 3 + Pitfall 5).

g = new Graph(div, {
  // ... existing Phase 3 config ...
  onClick: (index, _pointPos, _ev) => {
    handlersRef.current.onPointClick(index);  // index === undefined means background
  },
  onPointMouseOver: (index, pointPosition, _ev, _isH, _isO) => {
    const screenPos = g!.spaceToScreenPosition(pointPosition);
    handlersRef.current.onPointHover(index, screenPos);
  },
  onPointMouseOut: () => {
    handlersRef.current.onPointHoverEnd();
  },
});

// Extend GraphCanvas2DHandle:
interface GraphCanvas2DHandle {
  // ... existing methods ...
  setEventHandlers(h: {
    onPointClick: (index: number | undefined) => void;
    onPointHover: (index: number, screenPos: [number, number]) => void;
    onPointHoverEnd: () => void;
  }): void;
  /** Find points in a SPACE-coordinate polygon. */
  findPointsInPolygon(spacePath: [number, number][]): number[];
  /** Screen pixels (relative to cosmos canvas) → space coords. */
  screenToSpace(screenXY: [number, number]): [number, number];
}
```

### Lasso Overlay Component (skeleton)

```typescript
// Source: HTML Pointer Events spec + cosmos.gl API confirmed above
// LassoOverlay.tsx

interface LassoOverlayProps {
  active: boolean;
  graphHandle: GraphCanvas2DHandle | null;
  onComplete: (matchedIndices: number[]) => void;
}

export function LassoOverlay({ active, graphHandle, onComplete }: LassoOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d")!;

    function resize() {
      cv.width  = cv.clientWidth  * window.devicePixelRatio;
      cv.height = cv.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();

    const onDown = (e: PointerEvent) => {
      drawingRef.current = true;
      pathRef.current = [[e.offsetX, e.offsetY]];
      cv.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      pathRef.current.push([e.offsetX, e.offsetY]);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const p = pathRef.current;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    };
    const onUp = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      cv.releasePointerCapture(e.pointerId);
      const path = pathRef.current;
      pathRef.current = [];
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (path.length < 3 || !graphHandle) return;
      const spacePath: [number, number][] = path.map(
        ([sx, sy]) => graphHandle.screenToSpace([sx, sy])
      );
      const matched = graphHandle.findPointsInPolygon(spacePath);
      onComplete(matched);
    };

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", resize);
    return () => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", resize);
    };
  }, [active, graphHandle, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
    />
  );
}
```

### Radix Slider per Dimension

```typescript
// Source: radix-ui 1.4.3 (Slider primitive) — already installed
import * as Slider from "@radix-ui/react-slider";

interface DimensionSliderProps {
  dimId: string;
  label: string;
  value: number; // 0..100
  onChange: (v: number) => void;
  onReset: () => void;
}

export function DimensionSlider({ dimId, label, value, onChange, onReset }: DimensionSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider.Root
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="relative flex h-5 w-full select-none items-center"
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-800">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-4 rounded-full border-2 border-blue-500 bg-zinc-900"
          onDoubleClick={onReset}
          aria-label={`${label} slider`}
        />
      </Slider.Root>
    </div>
  );
}
```

### DuckDB Aggregation (canonical pattern)

```typescript
// Source: graphSql.ts + duckdbClient.ts existing pattern; DuckDB-WASM 1.33 confirmed
// selectionQueries.ts

import type { DonutSlice } from "./DonutPanel";
import { getDuckDbClient } from "./duckdbClient";
import { GRAPH_ANALYTICS_SOURCE_TABLES } from "./graphSql";

// Stable color palette — Claude's discretion (Tailwind tokens recommended for theme parity)
const PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316","#64748b"];
const colorForIndex = (i: number) => PALETTE[i % PALETTE.length];

export async function aggregateSelectionByRole(
  selectedNodeIds: readonly string[],
): Promise<DonutSlice[]> {
  if (selectedNodeIds.length === 0) return [];
  const { connection } = await getDuckDbClient();

  const idList = selectedNodeIds
    .map((id) => `'${id.replaceAll("'", "''")}'`)
    .join(",");

  const userProjectsView = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects; // "graph_user_projects"

  const sql = `
    WITH sel AS (
      SELECT user_id, project_id, role_ids
      FROM ${userProjectsView}
      WHERE concat(user_id, '::', project_id) IN (${idList})
    )
    SELECT
      COALESCE(role_id, '(no role)')  AS label,
      CAST(COUNT(*) AS INTEGER)       AS value
    FROM sel, UNNEST(role_ids) AS t(role_id)
    GROUP BY 1
    ORDER BY value DESC
  `;

  const table = await connection.query(sql);
  const rows = table.toArray() as Array<{ label: string; value: number }>;
  return rows.map((r, i) => ({
    label: r.label,
    value: Number(r.value),
    color: colorForIndex(i),
  }));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Imperative `setHighlightedPointSet(new Set(indices))` (cosmos v2) | Config-driven `highlightedPointIndices` via `setConfigPartial` (cosmos v3) | cosmos v3.0.0 | Already handled by Phase 3 `GraphCanvas2D.applyAlphaMask`; Phase 4 just feeds the predicate engine |
| Custom hand-rolled polygon point-in-polygon test | cosmos.gl `findPointsInPolygon(spacePath)` | cosmos v3.0 | Eliminates an entire class of pan-zoom transform bugs |
| Mouse events via React `onClick` on a `<canvas>` | cosmos.gl `onClick(index, pos, event)` config callback | cosmos v2 (index-based) | Index is delivered directly — no DOM-coord-to-node lookup needed |
| Per-dimension separate alpha masks composed at render | One predicate → one mask | Pattern locked here | Eliminates mask-ordering bugs; <0.5ms recompute time at 10k nodes |
| `@nivo/pie` as the default pie chart for new panels | In-house `DonutPanel.tsx` | 2026-05-19 (this folder convention) | Consistent terse SVG style; zero deps |

**Deprecated/outdated:**
- cosmos v2 `setHighlightedPointSet()` API: replaced by `highlightedPointIndices` config.
- `setConfig` as a partial-merge (v2): now full-replace in v3 — never use for runtime updates.

---

## Open Questions

1. **Permission tier source for the second pie chart**
   - What we know: `graph_folder_permissions` view exists (`graphSql.ts`); `NormalizedNodeRow.permTier` is `string | null` and Phase 1 left it null pending a folder-permission join. The view has been registered but population of `permTier` per (user, project) may still be incomplete.
   - What's unclear: Whether `graph_folder_permissions` is currently populated with per-(user,project) tier rows, or whether the join is pending.
   - Recommendation: 04-01 must verify by running `SELECT COUNT(*), COUNT(DISTINCT user_id) FROM graph_folder_permissions` during dev. If empty, this is a data-layer gap to be filed against Phase 1, not Phase 4. Provide a graceful "(no tier data)" fallback in the pie chart for v1.

2. **Bucket thresholds for numeric filters**
   - What we know: CONTEXT.md says "pick sensible defaults from real Hermosillo data distribution" — Claude's discretion. Activity: Low/Med/High/None; Sign-in: <7d / <30d / <90d / >90d.
   - What's unclear: Exact activity thresholds — should "High" be activity > log1p-scaled 0.66, > raw 100, > 90th percentile?
   - Recommendation: Use the existing `user_activity_buckets` view pattern (`graphSql.ts:78`) — already uses 30d / 90d windows for sign-in. For activity, use raw count: None=0; Low=1–10; Med=11–100; High=101+. Validate against Hermosillo distribution in dev; adjust if heavily skewed.

3. **NodeFeatureSnapshot — full shape and source of truth**
   - What we know: The predicate engine needs `{ nameLower, emailLower, project, role, activityBucket, signinBucket, isExternal, permTier }` per node, in the same index order cosmos.gl uses.
   - What's unclear: Whether to derive this from the Arrow `graph_user_projects` table at mount (snapshot) or from React Query (live).
   - Recommendation: Snapshot at mount — read once from DuckDB via `SELECT ... FROM graph_user_projects ORDER BY user_id, project_id` (same order Phase 1 used for node IDs), build a `NodeFeatureSnapshot[]`, store in a ref. Re-snapshot only when sync data updates (rare in v1 — sync is cron-driven). This avoids React Query re-render storms.

4. **Selection persistence across `physics.updateSliders`**
   - What we know: CONTEXT.md: "Lasso members stay selected when global filters change." Sliders don't change the lasso set, but they do change positions — meaning the screen-space location of the selected nodes changes.
   - What's unclear: Whether re-running the polygon test after a slider settle is needed. RECOMMENDATION: NO — lasso captures a node-INDEX set, not a geographic region. The selection persists by index regardless of position.

5. **Toolbar layout when filter chip popovers stack**
   - What we know: Six dimension popovers + search + lasso + 2D/3D pill + clear-all is many controls. CONTEXT.md says popover-per-dimension keeps the bar clean.
   - What's unclear: Whether all six dim popovers fit on a 1280px-wide viewport without wrapping.
   - Recommendation: Group buttons should be compact (~80px each + chevron). 6 × 80 = 480px for dim groups; +280 search +60 lasso +80 toggle +60 clear-all = ~960px. Fits 1280 cleanly. If wrapped on narrower viewports, allow horizontal scroll on the toolbar.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@cosmos.gl/graph/README.md` — v3 API including `onClick`, `onPointMouseOver`, `findPointsInRect`, `findPointsInPolygon`, `screenToSpacePosition`, `spaceToScreenPosition`, `focusedPointIndex`
- `node_modules/@cosmos.gl/graph/dist/index.d.ts` — confirmed method signatures for `findPointsInPolygon`, `screenToSpacePosition`, `spaceToScreenPosition`, `setZoomTransformByPointPositions`, `fitView`
- `node_modules/@cosmos.gl/graph/dist/config.d.ts` — confirmed callback signatures: `onClick`, `onPointMouseOver(index, pointPosition, event, isHighlighted, isOutlined)`, `onPointMouseOut`
- `app/(dashboard)/users/access-analysis/physicsLayer.ts` — `setMask(predicate)`, `updateSliders(values)`, `getPositions()`, `alphaMask`, `maskVersion` API
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — Phase 3 handle interface to extend; existing `applyAlphaMask` via `highlightedPointIndices`
- `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` — three.js InstancedMesh pattern; per-instance color buffer; ResizeObserver handling
- `app/(dashboard)/users/access-analysis/DonutPanel.tsx` — pure SVG; `DonutSlice = { label, value, color }`
- `app/(dashboard)/users/access-analysis/graphSql.ts` — `graph_user_projects`, `graph_folder_permissions` views; `user_activity_buckets` bucketing pattern
- `app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts` — Mosaic + alpha-mask alignment (`DIM_ALPHA = 0.15`)
- `app/(dashboard)/users/access-analysis/MosaicCoordinatorContext.tsx` — Coordinator setup; `useMosaicCoordinator`; `useMosaicSelection`
- `package.json` — confirmed installed: `@cosmos.gl/graph@3.0.0-beta.9`, `three@^0.184.0`, `radix-ui@^1.4.3`, `@duckdb/duckdb-wasm`, `@uwdata/mosaic-core`, `next-themes`, `framer-motion`, `@nivo/pie` (available but not used here)

### Secondary (MEDIUM confidence)
- HTML Pointer Events spec — `setPointerCapture` / `releasePointerCapture` (browser-standard)
- three.js r184 `Raycaster.intersectObject` returning `intersection.instanceId` for InstancedMesh hit-tests (standard pattern, confirmed in three docs)
- Radix UI `@radix-ui/react-slider`, `@radix-ui/react-popover` patterns (standard headless UI)

### Tertiary (LOW confidence)
- Exact `findPointsInPolygon` performance characteristics at 50k nodes — cosmos docs state GPU-accelerated; not load-tested in this repo
- Whether `graph_folder_permissions` is currently populated with per-(user,project) tier rows (Open Question 1)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every required library is installed and APIs verified via source/dist inspection
- Architecture: HIGH — single-predicate pattern is the natural fit for `physicsLayer.setMask`'s overwrite semantics; lasso → `findPointsInPolygon` chain is cosmos's intended use case
- Pitfalls: HIGH — pan/zoom transform (#1), BigInt (#2), hydration (#3), stale closures (#5) are all standard footguns in this exact stack
- Open questions: MEDIUM — Open Question #1 (permTier population) is the only material data-layer dependency

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (cosmos.gl beta.9 API surface is locked for this sprint; Radix and three.js APIs are stable)
