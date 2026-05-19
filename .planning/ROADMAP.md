# Roadmap: LECG Dashboard — Access Analysis Spatial Graph Redesign

## Overview

The Access Analysis internals are rebuilt from scratch following a strict six-layer architecture: data, math, physics, render, interactions, and analytics bridge. Each layer is independently testable before the next is built. This eliminates the patch-cycle that broke the prior ~4242-line monolith. Four phases deliver a demo-ready spatial graph by 2026-05-19 19:00.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data + Math Foundation** - Pure TypeScript data and math layers with full Vitest coverage — no UI, no engine
- [ ] **Phase 2: Physics Layer** - d3-force-3d simulation wired to math layer output; freeze-on-rest confirmed; named force mutation verified
- [ ] **Phase 3: Render Layer** - GraphCanvas consuming Float32Array positions; 2D canvas rendering; seamless 2D/3D mode switch
- [ ] **Phase 4: Interactions + Analytics Bridge** - Filter, search, click-isolate, lasso, slider UI, and lasso-to-pie-chart wired

## Phase Details

### Phase 1: Data + Math Foundation
**Goal**: The data and math layers exist as pure TypeScript modules — independently unit-testable with no React, no engine, no DOM — and all Vitest tests pass
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, MATH-01, MATH-02, MATH-03, MATH-04, MATH-05
**Success Criteria** (what must be TRUE):
  1. `dataLayer.ts` builds a valid Arrow table with one row per `(email, projectId)` and all six feature columns (activity count, last sign-in age, role IDs, folder permission tier, isAdmin, isExternal) populated from real Postgres data
  2. `mathLayer.ts` exports `computeTargetPositions(features[], sliders[]) → Float32Array` with zero React or engine imports — `import` graph is verifiable in terminal
  3. Vitest unit tests confirm: slider = 0 contributes zero to position, slider = 1 contributes full, two sliders blend additively and monotonically
  4. Position cache schema exists in DuckDB-WASM and survives a filter change without invalidation (positions keyed by `hashNodeSet(nodeIds)`)
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — dataLayer.ts + Arrow build + DuckDB nodes table + positions cache z/slider key extension
- [ ] 01-02-PLAN.md — mathLayer.ts pure semantic-seed kernel + Vitest invariants + fast-check monotonicity + purity assertion

### Phase 2: Physics Layer
**Goal**: The physics layer drives d3-force-3d with named per-dimension forces, freezes positions on settle, and never restarts the simulation on filter or search events
**Depends on**: Phase 1
**Requirements**: PHYS-01, PHYS-02, PHYS-03, PHYS-04, PHYS-05
**Success Criteria** (what must be TRUE):
  1. `physicsLayer.ts` registers named forces (`simulation.force("dim-activity")`, etc.) and a slider value change calls `force.strength()` + `d3ReheatSimulation()` — not a full restart
  2. After simulation settles, the position Float32Array is frozen to the DuckDB-WASM positions cache and does not change when a filter event fires
  3. A filter event only mutates the `alphaMask Float32Array` — the simulation tick counter does not increment after the mask update
  4. `max(sliderValues)` continuously drives alpha, alphaDecay, repulsion, and attraction — observable by logging physics params across a 0→1 slider sweep
**Plans**: TBD

Plans:
- [ ] 02-01: physicsLayer.ts — named forces, slider→physics param mapping, freeze-on-rest

### Phase 3: Render Layer
**Goal**: GraphCanvas.tsx renders nodes at their Float32Array positions in 2D and switches to 3D orbit view on a prop change — with no math inside the component and no positional discontinuity on mode switch
**Depends on**: Phase 2
**Requirements**: REND-01, REND-02, REND-03, REND-04, REND-05
**Success Criteria** (what must be TRUE):
  1. The graph renders in 2D with nodes at correct positions, opacity driven by `alphaMask`, and no slider values or feature columns imported inside `GraphCanvas.tsx`
  2. Switching from 2D to 3D via the mode prop does not remount the component — nodes remain at their last positions with no jump, no flash, and no re-layout
  3. 3D orbit controls work: user can rotate and zoom; node positions are the same (x, y, z) as the settled simulation
  4. Smooth animations during slider drag — no node popping, no flash between frames
**Plans**: TBD

Plans:
- [ ] 03-01: GraphCanvas.tsx — 2D render via react-force-graph-2d, alpha mask, nodeCanvasObject
- [ ] 03-02: 2D/3D mode switch — shared graphData reference, no remount, position continuity

### Phase 4: Interactions + Analytics Bridge
**Goal**: All user-facing interactions (filter, search, click-isolate, hover, lasso, sliders, 2D/3D toggle) update only the alpha mask or slider state — never positions — and a lasso selection produces a populated pie chart breakdown
**Depends on**: Phase 3
**Requirements**: INTR-01, INTR-02, INTR-03, INTR-04, INTR-05, INTR-06, INTR-07, ANLY-01, ANLY-02
**Success Criteria** (what must be TRUE):
  1. Toggling a dimension filter immediately dims non-matching nodes via alpha mask; node positions do not change — verifiable by pausing the simulation before toggling
  2. Typing in the search box highlights matching nodes within one keystroke; all other nodes dim; positions unchanged
  3. Drawing a lasso on the canvas produces a `selectedNodeIds[]` array and a pie chart renders below (or beside) the graph showing breakdown by role and permission tier for the selection
  4. Clicking a node dims all other nodes to 0.15 alpha; the hovered node surfaces a tooltip with name, email, project, role, last sign-in, and activity count
  5. Moving any dimension slider 0→100 causes the graph to visibly re-cluster toward that dimension's axis direction with continuous, monotonic animation — no jump, no mode switch
**Plans**: TBD

Plans:
- [ ] 04-01: GraphInteractions.tsx — filter, search, click-isolate, hover tooltip, lasso overlay
- [ ] 04-02: Dimension slider UI (SliderContext, per-dim 0–100 sliders, 2D/3D toggle) + SelectionBridge.tsx (lasso→DuckDB→pie chart)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data + Math Foundation | 0/2 | Not started | - |
| 2. Physics Layer | 0/1 | Not started | - |
| 3. Render Layer | 0/2 | Not started | - |
| 4. Interactions + Analytics Bridge | 0/2 | Not started | - |
