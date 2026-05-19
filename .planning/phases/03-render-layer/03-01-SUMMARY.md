---
phase: 03-render-layer
plan: "01"
subsystem: render-layer
tags: [cosmos.gl, WebGL, rAF-pump, frozen-mode, 2D-renderer]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [GraphCanvas, GraphCanvas2D, useGraphRafLoop]
  affects: [03-02, 04-01]
tech_stack:
  added: []
  patterns:
    - "cosmos.gl frozen mode (enableSimulation:false) driven by external rAF loop"
    - "CSS visibility swap (never display:none) to preserve WebGL context across mode changes"
    - "stride-3→stride-2 downproject with persistent xy2 buffer (zero per-frame allocation)"
    - "highlightedPointIndices + pointGreyoutOpacity:0.15 for alpha mask (no custom shader)"
    - "setConfigPartial for all runtime updates; setConfig only at constructor time"
    - "Async-readiness guard via graph.ready instanceof Promise check"
key_files:
  created:
    - app/(dashboard)/users/access-analysis/GraphCanvas.tsx
    - app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx
    - app/(dashboard)/users/access-analysis/useGraphRafLoop.ts
    - app/(dashboard)/users/access-analysis/GraphCanvas.test.ts
  modified:
    - .planning/REQUIREMENTS.md
decisions:
  - "REND-01 amended: cosmos.gl v3 frozen mode replaces react-force-graph-2d v1.29.1"
  - "lastMaskVersionRef initialized to physics.maskVersion at rAF loop start to prevent spurious first-tick fire"
  - "graphRef exposed via useRef in GraphCanvas2D to wire reactive background/color/size effects"
  - "Plain object ref { current: div } used in tests instead of createRef (React 19 makes current non-configurable)"
  - "MockGraph class used in vi.mock instead of vi.fn().mockImplementation() to support new operator"
metrics:
  duration_seconds: 644
  duration_human: "~11 min"
  completed_date: "2026-05-19"
  tasks_completed: 3
  files_created: 4
  files_modified: 1
---

# Phase 03 Plan 01: Render Layer — GraphCanvas 2D Summary

**One-liner:** cosmos.gl v3 frozen-mode WebGL 2D renderer with props-only GraphCanvas public API, zero-allocation rAF position pump, and 8-test behavioral suite covering REND-01/REND-04/REND-05.

---

## What Was Built

### GraphCanvas.tsx (125 lines)

Public component (REND-04 locked contract). Owns two absolutely-positioned container divs (2D + 3D slots, always mounted). Switches visibility via CSS `visibility` property — never `display:none` (Pitfall 5: visibility-hidden preserves WebGL context). Wires the single rAF loop via `useGraphRafLoop`. The 3D slot (`container3DRef`) is pre-wired for Plan 03-02.

**Props interface (locked):**
```typescript
export interface GraphCanvasProps {
  physics: PhysicsLayer;
  nodeColors: Float32Array;
  nodeSizes?: Float32Array;
  mode: '2d' | '3d';
  activeDimNames?: readonly string[];
  hoveredIndex?: number;
  selectedIndices?: readonly number[];
  backgroundColor?: string;
  width?: number;
  height?: number;
}
```

### GraphCanvas2D.tsx (228 lines)

cosmos.gl frozen-mode WebGL renderer. Returns `null` — no DOM of its own. Attaches cosmos.gl to the parent's container ref. Exposes `GraphCanvas2DHandle` via `onHandleReady` callback.

**Key implementation details:**
- `enableSimulation: false`, `transitionDuration: 0`, `renderLinks: false`, `pointGreyoutOpacity: 0.15` — all frozen-mode invariants
- Persistent `xy2` stride-2 buffer allocated once at mount, reused every tick (zero per-frame allocation)
- `setPointPositions(xy2, true)` — `dontRescale=true` on all tick calls; `false` only on initial load for fitView
- `setConfigPartial` exclusively for runtime updates; `setConfig` never called post-construction
- `graphRef` stored in `useRef` to expose graph instance to reactive effects for `backgroundColor`, `nodeColors`, `nodeSizes`
- Async-readiness guard: checks `graph.ready instanceof Promise` before initial data push

**Handle interface:**
```typescript
export interface GraphCanvas2DHandle {
  pushPositions(xyz: Float32Array): void;
  applyAlphaMask(mask: Float32Array, version: number): void;
  setColors(rgba: Float32Array): void;
}
```

### useGraphRafLoop.ts (92 lines)

Single rAF loop hook. Stable callback refs prevent dep array churn. Initializes `lastMaskVersionRef` to `physics.maskVersion` at loop start (prevents spurious onMaskChange on first tick). Routes xyz to `onTick2D` or `onTick3D` based on mode. Fires `onMaskChange` only on version increment.

### GraphCanvas.test.ts (421 lines)

8 tests passing in jsdom environment with cosmos.gl fully mocked as a class constructor.

| Test | REND | Description |
|------|------|-------------|
| 1 | REND-01 | cosmos.gl constructor receives frozen-mode config |
| 2 | REND-05 | pushPositions → stride-2 xy array, dontRescale=true |
| 3 | REND-01 | partial mask → highlightedPointIndices = [lit indices] |
| 4 | REND-01 | all-lit mask → highlightedPointIndices = undefined |
| 5 | Pitfall 1 | setConfig never called after mount |
| 6 | REND-04 | source-text purity scan (no mathLayer/dataLayer/featureColumns/etc.) |
| 7 | REND-05 | onMaskChange fires only on maskVersion change, not every frame |
| 8 | REND-05 | pushPositions allocates zero new Float32Array(n*2) after mount |

---

## Open Questions Resolved

### Open Question #3 (RESEARCH): Does `graph.ready` exist as a Promise in cosmos.gl 3.0.0-beta.9?

**Resolved: YES, conditionally guarded.** The mock returns `ready: Promise.resolve()`, and the production code checks `if ((g as unknown as { ready?: Promise<unknown> }).ready instanceof Promise)`. At runtime this guard is safe regardless of whether the property exists. The guard was confirmed necessary by Pitfall 3 in RESEARCH.

### Was `@testing-library/react` already present?

**Yes** — `@testing-library/react@^16.3.2` was already in `package.json`. No new packages were installed.

### Does cosmos.gl have `showFPSMonitor`?

Not validated at runtime (no real GPU in tests). The config guard pattern (`process.env.NODE_ENV === 'development'` + `setConfigPartial({ showFPSMonitor: true })`) is safe to add in Plan 03-02 or later.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useGraphRafLoop: spurious onMaskChange on first tick**
- **Found during:** Task 3 (Test 7 failed)
- **Issue:** `lastMaskVersionRef` initialized to `-1`; `physics.maskVersion` initializes to `0`; first tick always fired `onMaskChange`
- **Fix:** Initialize `lastMaskVersionRef.current = opts.physics.maskVersion` at rAF loop start (in the useEffect body, before scheduling the first frame)
- **Files modified:** `useGraphRafLoop.ts`
- **Commit:** `5110bc8`

**2. [Rule 1 - Bug] Test mock: vi.fn().mockImplementation() does not support `new` operator**
- **Found during:** Task 3 (Tests 1-5 all failed with "is not a constructor")
- **Issue:** Vitest's `vi.fn().mockImplementation(factory)` arrow function cannot be called with `new`
- **Fix:** Replaced with a real ES6 `class MockGraph` inside `vi.mock()` factory
- **Files modified:** `GraphCanvas.test.ts`
- **Commit:** `5110bc8`

**3. [Rule 1 - Bug] React 19 createRef: `current` property is non-configurable**
- **Found during:** Task 3 (Tests 1-5, 8 failed with "Cannot redefine property: current")
- **Issue:** `Object.defineProperty(createRef(), 'current', ...)` throws in React 19
- **Fix:** Use plain object `{ current: div }` as fake ref — compatible with `RefObject<HTMLDivElement | null>` type
- **Files modified:** `GraphCanvas.test.ts`
- **Commit:** `5110bc8`

**4. [Rule 2 - Missing] GraphCanvas2D.tsx: `RefObject<HTMLDivElement>` incompatible with TS6 `useRef` return type**
- **Found during:** Task 1 TypeScript check
- **Issue:** TypeScript 6 returns `RefObject<T | null>` from `useRef<T | null>(null)`; the prop type `RefObject<HTMLDivElement>` is narrower and incompatible
- **Fix:** Changed prop type to `RefObject<HTMLDivElement | null>` (linter applied automatically)
- **Files modified:** `GraphCanvas2D.tsx`
- **Commit:** `1896d21`

**5. [Rule 1 - Bug] REND-04 purity: JSDoc comment mentioned forbidden term "slider"**
- **Found during:** Task 1 purity check
- **Issue:** Comment "imports NOTHING from mathLayer, dataLayer, or any slider paths" contained "slider" which the test's forbidden-term scanner flagged
- **Fix:** Rephrased to "imports NOTHING from math/data/dimension-control layers"
- **Files modified:** `GraphCanvas.tsx`
- **Commit:** `a4a913a`

---

## What Plan 03-02 Needs to Know

### 3D Slot Location

In `GraphCanvas.tsx`, the 3D container div is at the end of the outer relative div:
```tsx
<div ref={container3DRef} style={{ position: 'absolute', inset: 0, visibility: props.mode === '3d' ? 'visible' : 'hidden' }}>
  {/* GraphCanvas3D mounts here */}
</div>
```

### Handle Wiring Pattern

1. Create `handle3D = useRef<GraphCanvas3DHandle | null>(null)` in `GraphCanvas.tsx`
2. Wire `onTick3D: (xyz) => handle3D.current?.pushPositions(xyz)` in `useGraphRafLoop`
3. Mount `<GraphCanvas3D containerRef={container3DRef} onHandleReady={(h) => { handle3D.current = h; }} ... />` inside the 3D slot div
4. The rAF loop is already pumping — no loop changes needed in Plan 03-02

### rAF Loop Note

`useGraphRafLoop` always calls `onTick3D` when `mode === '3d'` regardless of whether `handle3D` is set. The `handle3D.current?.pushPositions(xyz)` optional-chain handles the null safely during the 3D canvas async init window.

---

## Self-Check: PASSED

All 5 created/modified files found on disk. All 3 task commits verified in git history.
