---
phase: 04-interactions-analytics-bridge
plan: 01
subsystem: ui
tags: [cosmos.gl, three.js, raycaster, lasso, react-portal, predicate-engine, alpha-mask, duckdb]

requires:
  - phase: 02-physics-layer
    provides: physics.setMask single alpha-mask channel + PHYS-04 invariant
  - phase: 03-render-layer
    provides: GraphCanvas2D/3D handles + applyAlphaMask + mode-toggle scaffolding
provides:
  - Single predicate engine that collapses filter/search/lasso/drill/isolate into ONE physics.setMask call
  - cosmos.gl event wiring (onClick + onPointMouseOver/Out) with ref-indirect handlers
  - three.js Raycaster wiring (click + rAF-coalesced pointermove) for 3D pick
  - LassoOverlay component: setPointerCapture + screen→space conversion + findPointsInPolygon
  - NodeTooltip portal anchored to canvas-local screen coords with viewport clamping
  - NodeFeatureSnapshot[] builder from DuckDB graph_user_projects (BigInt-safe, bucketed)
  - GraphCanvasHandle discriminated union exposed via forwardRef for downstream consumers
affects: [04-02-chrome, 05-analytics-bridge]

tech-stack:
  added: []
  patterns:
    - "Ref-indirect event handlers — cosmos.gl + three.js callbacks delegate to handlersRef so React closure updates take effect without re-issuing config (Pitfall 5)"
    - "Single predicate engine — one usePredicateEngine effect ≡ one physics.setMask call (Pattern 1)"
    - "Transparent overlay canvas for freehand lasso, gated by active && mode==='2d'"
    - "rAF-coalesced raycast for 3D hover — pointermove writes pendingEvent, frame callback raycasts once (Pitfall 6)"
    - "Discriminated handle (GraphCanvasHandle) — { mode, handle } union so consumers pick 2D-only primitives safely"

key-files:
  created:
    - app/(dashboard)/users/access-analysis/interactionTypes.ts
    - app/(dashboard)/users/access-analysis/featureSnapshot.ts
    - app/(dashboard)/users/access-analysis/usePredicateEngine.ts
    - app/(dashboard)/users/access-analysis/LassoOverlay.tsx
    - app/(dashboard)/users/access-analysis/NodeTooltip.tsx
    - app/(dashboard)/users/access-analysis/GraphInteractions.tsx
    - app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts
    - app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx
    - app/(dashboard)/users/access-analysis/__tests__/LassoOverlay.test.tsx
    - app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx
  modified:
    - app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx
    - app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx
    - app/(dashboard)/users/access-analysis/GraphCanvas.tsx

key-decisions:
  - "Predicate engine touches NO simulation symbols — verified by automated grep test (PHYS-04 invariant)"
  - "Search debounce 100ms via local useDebounced hook inside GraphInteractions — single source of truth"
  - "Lasso disabled in 3D for v1 — LassoOverlay only renders when mode==='2d' && lassoActive"
  - "GraphCanvas now uses forwardRef + useImperativeHandle exposing discriminated union — chosen over cloneElement injection for cleaner ref ownership"
  - "Feature snapshot built once at mount via DuckDB; held in caller-owned ref (Open Q#3 resolution)"
  - "Activity buckets: None=0, Low=1-10, Med=11-100, High=101+; signin buckets <7d/<30d/<90d/>90d"
  - "BigInt from DuckDB cast to Number on read (Pitfall 2) — featureSnapshot.ts handles activity_count and last_signin_days"
  - "Tooltip rendered via createPortal to document.body so it escapes any overflow:hidden parent"

patterns-established:
  - "ref-indirect handlers: cosmos.gl + three.js never see updated React closures; replace handlersRef.current instead"
  - "single-predicate-engine: every interaction surface writes ONE field of PredicateInputs; effect collapses to one setMask call"
  - "discriminated GraphCanvasHandle union: lasso primitives are typed-out of the 3D variant"
  - "DuckDB BigInt→Number cast pattern (featureSnapshot.ts) reusable for selectionQueries (04-02 ANLY-01)"
  - "jsdom test stubs: HTMLCanvasElement.getContext mock + own-property offsetX/Y events for pointer-driven canvas components"

requirements-completed:
  - INTR-01
  - INTR-02
  - INTR-03
  - INTR-04
  - INTR-05

duration: ~45min
completed: 2026-05-19
---

# Phase 4 Plan 01: Interactions + Analytics Bridge Summary

**Single predicate engine routes filter/search/lasso/click-isolate/drill-down through one physics.setMask call; cosmos.gl + three.js event wiring + LassoOverlay + NodeTooltip + DuckDB feature snapshot land with 135 tests green and PHYS-04 invariant structurally enforced.**

## Performance

- **Duration:** ~45 min (Task 1 already committed in 8cea0bc before this session)
- **Started:** 2026-05-19T17:26:00Z
- **Completed:** 2026-05-19T17:33:00Z
- **Tasks:** 3
- **Files modified:** 13 (10 new, 3 modified)

## Accomplishments

- usePredicateEngine collapses 5 interaction surfaces into ONE physics.setMask call; verified by source-level grep (zero sim symbols)
- GraphCanvas2D + GraphCanvas3D handles now expose setEventHandlers / findPointsInPolygon / screenToSpace / spaceToScreen / setEventHandlers (3D) via ref-indirect plumbing — no setConfig re-issues
- LassoOverlay with setPointerCapture, devicePixelRatio scaling, dash-pattern stroke; emits matched indices on pointerup
- NodeTooltip portal rendering with 6-field content and viewport clamping
- GraphInteractions wrapper: routes events, owns hover/tooltip state, Esc-clears-isolate, 100ms search debounce
- featureSnapshot.ts (already shipped in 8cea0bc): DuckDB → NodeFeatureSnapshot[] in cosmos order, BigInt-safe, bucketed

## Task Commits

1. **Task 1: Interaction contracts + featureSnapshot** — `8cea0bc` (feat) [pre-session commit; 7 tests]
2. **Task 2: Canvas handles extended with click/hover/lasso primitives** — `188252d` (feat) [3 files modified; 20 Phase 3 tests still green]
3. **Task 3: Predicate engine + Lasso + Tooltip + GraphInteractions + tests** — `4f125ee` (feat) [7 files; 15 new assertions]

**Plan metadata commit:** (follows this summary write)

## Files Created/Modified

**Created:**
- `app/(dashboard)/users/access-analysis/interactionTypes.ts` — pure types (NodeFeatureSnapshot, GraphEventHandlers, PredicateInputs, GraphInteractionState)
- `app/(dashboard)/users/access-analysis/featureSnapshot.ts` — DuckDB → NodeFeatureSnapshot[] in cosmos order
- `app/(dashboard)/users/access-analysis/usePredicateEngine.ts` — single setMask channel; featureValueForDim helper
- `app/(dashboard)/users/access-analysis/LassoOverlay.tsx` — overlay canvas + path capture + polygon hit-test
- `app/(dashboard)/users/access-analysis/NodeTooltip.tsx` — portal-rendered 6-field tooltip
- `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` — wrapper component routing all events
- `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts` — Task 1 coverage (7 tests)
- `app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx` — Task 3 coverage (8 assertions; PHYS-04 grep guard)
- `app/(dashboard)/users/access-analysis/__tests__/LassoOverlay.test.tsx` — Task 3 coverage (4 assertions)
- `app/(dashboard)/users/access-analysis/__tests__/GraphInteractions.test.tsx` — Task 3 coverage (3 assertions)

**Modified:**
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — added handlersRef + setEventHandlers/findPointsInPolygon/screenToSpace/spaceToScreen on handle; onClick/onPointMouseOver/Out config wiring
- `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` — Raycaster click + rAF-coalesced pointermove; setEventHandlers on handle
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` — forwardRef + useImperativeHandle exposes GraphCanvasHandle discriminated union

## Final Exported Types (for 04-02 consumption)

From `interactionTypes.ts`:
- `NodeFeatureSnapshot` — per-node feature record in cosmos index order
- `GraphEventHandlers` — `{ onPointClick, onPointHover, onPointHoverEnd }`
- `PredicateInputs` — bundle consumed by usePredicateEngine
- `GraphInteractionState` — local interaction state shape

From `GraphCanvas.tsx`:
- `GraphCanvasHandle = { mode: "2d"; handle: GraphCanvas2DHandle | null } | { mode: "3d"; handle: GraphCanvas3DHandle | null }`

From `usePredicateEngine.ts`:
- `usePredicateEngine(inputs: PredicateInputs): void`
- `featureValueForDim(f, dim): string` — single source of truth for filter dim → feature value mapping

## Final GraphInteractions Prop Shape (04-02 chrome targets)

```typescript
interface GraphInteractionsProps {
  physics: PhysicsLayer;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  mode: "2d" | "3d";
  graphRef: RefObject<GraphCanvasHandle | null>;
  activeFilters: Record<string, ReadonlySet<string>>; // ← Toolbar produces
  searchQuery: string;                                 // ← Toolbar search input
  lassoActive: boolean;                                // ← Toolbar lasso toggle
  onLassoComplete: (selectedIndices: number[]) => void; // ← RightPanelStack
  isolatedNodeIndex: number | null;                    // ← UserDetailPanel
  onIsolate: (i: number | null) => void;
  lassoSelection: ReadonlySet<number> | null;          // ← SelectionPanel
  drillDown: Record<string, string> | null;            // ← Pie-slice click
  children: ReactNode;                                  // ← <GraphCanvas ref={graphRef} ... />
}
```

## Decisions Made

- **forwardRef on GraphCanvas chosen over cloneElement.** Cleaner type signature; GraphInteractions accepts a `RefObject<GraphCanvasHandle | null>` prop that callers create via `useRef(null)`.
- **Tooltip uses fixed positioning + viewport clamp instead of Radix Tooltip.** Canvas-rendered nodes have no DOM anchor; Radix Tooltip primitive doesn't fit.
- **useDebounced local hook (5 lines) instead of useDeferredValue.** Deterministic 100ms timing — predictable in tests; useDeferredValue has implementation-defined latency.
- **Lasso path stored in useRef[<number[]>]() not React state.** RESEARCH anti-pattern explicit warning — pointer events fire 60+Hz; state updates would re-render the graph on every move.

## Deviations from Plan

None - plan executed exactly as written.

Test infrastructure required two jsdom adjustments inside test files only (no production code change):
1. `HTMLCanvasElement.getContext` stubbed in LassoOverlay.test.tsx (jsdom doesn't implement 2D context).
2. Event `offsetX/offsetY` defined as own properties via Object.defineProperty (jsdom inherits read-only getters).

These are test-only adapters and are recoverable from the existing pattern library; logged here for traceability.

## Issues Encountered

- **GraphInteractions effect needed eager-ref initialization in tests.** Initial harness assigned `graphRef.current` inside `useEffect`, which fired AFTER the GraphInteractions mount effect — handlers never installed. Fixed by lazy-initializing the harness ref synchronously before render. Production usage is unaffected because real callers populate the ref via React's ref callback during the GraphCanvas render pass.

## Self-Check: PASSED

All claimed files exist on disk:
- interactionTypes.ts, featureSnapshot.ts, usePredicateEngine.ts, LassoOverlay.tsx, NodeTooltip.tsx, GraphInteractions.tsx — VERIFIED
- 4 test files in __tests__/ — VERIFIED
- GraphCanvas2D.tsx, GraphCanvas3D.tsx, GraphCanvas.tsx modifications committed in 188252d — VERIFIED

Commit hashes verified via `git log`:
- 8cea0bc (Task 1) — FOUND
- 188252d (Task 2) — FOUND
- 4f125ee (Task 3) — FOUND

PHYS-04 invariant: `Grep` for getPositions|sim\.|\.restart\(|\balpha\( inside usePredicateEngine.ts — ZERO matches. PASSED.

Full test suite: 26 files, 135 tests passing (4.27s). PASSED.

## Next Phase Readiness

Plan 04-02 (chrome) can begin immediately. All prop targets exposed by GraphInteractions are documented above. Toolbar + SliderSidebar + SelectionPanel + UserDetailPanel just need to feed React state into these props — no further interaction wiring required.

Open question from RESEARCH #1 (graph_folder_permissions population) remains a data-layer concern for ANLY-01 in plan 04-02; not a blocker for 04-01.

---
*Phase: 04-interactions-analytics-bridge*
*Completed: 2026-05-19*
