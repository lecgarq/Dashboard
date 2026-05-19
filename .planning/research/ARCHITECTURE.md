# Architecture Patterns

**Domain:** Multi-dimensional spatial graph slice (Access Analysis)
**Researched:** 2026-05-19
**Confidence:** HIGH — derived directly from existing codebase, schema, and prior redesign decisions

---

## Context: What Is Being Designed

This document describes the **internal architecture of the Access Analysis spatial graph slice** rooted at `app/(dashboard)/users/access-analysis/`. The host app (Next.js App Router, tRPC, Prisma, local Postgres, DuckDB-WASM) is fixed and is not redesigned here.

The core failure mode of the previous iteration: **math leaked into rendering**. Physics config, slider values, and position logic were all mixed into the graph engine component (`AccUsersGraph.tsx`, ~4242 lines). Each fix to one dimension broke another because there was no clean separation. The new architecture enforces hard boundaries so that math is independently testable and the rendering engine is a dumb consumer of Float32Arrays.

---

## Recommended Architecture

Six layers with explicit unidirectional data flow:

```
Postgres (AccProjectMember, AccActivity, AccFolderPermission, AccProjectRole)
    │
    ▼  [tRPC: acc-graph router]
DATA LAYER  ──────────────────────────────────────────────────── lib/graph/dataLayer.ts
    │         Arrow tables registered in DuckDB-WASM
    │         Node feature columns: one row per (user, project) instance
    ▼
MATH LAYER  ──────────────────────────────────────────────────── lib/graph/mathLayer.ts
    │         Pure TypeScript, zero React/engine deps
    │         seedPositions(features[], dims[]) → Vec3[]  (semantic seeds)
    │         blendTargets(seeds[], sliderValues[]) → Vec3[]  (slider composition)
    │         nodePosition(features, weights, sliderValues) → Vec3  (per-node)
    ▼
PHYSICS LAYER  ────────────────────────────────────────────────── lib/graph/physicsLayer.ts
    │         Wraps chosen engine simulation
    │         Drives engine alpha, damping, repulsion from sliderValues[]
    │         Emits positionSnapshot: Float32Array  [x0,y0,x1,y1,...]
    │         Preserves positions across filter/search events (freeze-on-rest)
    ▼
RENDERING LAYER  ──────────────────────────────────────────────── components/graph/GraphCanvas.tsx
    │         Consumes Float32Array positions (no math inside)
    │         2D/3D switch via prop, not remount
    │         Label overlay, color, opacity — purely from node metadata
    ▼
INTERACTION LAYER  ────────────────────────────────────────────── components/graph/GraphInteractions.tsx
    │         Filter, search, lasso, click-isolate
    │         Emits selectedNodeIds: string[]  (never mutates positions)
    │         Filter = alpha mask update only (positions frozen)
    ▼
SELECTION→ANALYTICS BRIDGE  ────────────────────────────────────── components/graph/SelectionBridge.tsx
              selectedNodeIds[] → DuckDB query → ChartDatum[]
              Feeds pie chart + analytics panel
              Isolated: bridge knows nothing about physics
```

---

## Component Boundaries

| Component | Responsibility | Inputs | Outputs | Dependencies |
|-----------|---------------|--------|---------|--------------|
| `dataLayer.ts` | Fetch node features from Postgres; build Arrow tables; register in DuckDB-WASM | tRPC response (BulkAccUser, AccProjectMember, AccActivity) | `NodeFeatureTable: ArrowTable`, registered DuckDB views | tRPC client, apache-arrow, duckdb-wasm |
| `mathLayer.ts` | Semantic seed math; slider composition; per-node position function | NodeFeatureTable, sliderValues[], seed definitions | `targetPositions: Float32Array` (x,y or x,y,z) | ZERO React, ZERO engine imports |
| `physicsLayer.ts` | Run force sim; map sliderValues→physics params; emit position snapshot | targetPositions, sliderValues[], node count | `snapshot: Float32Array`, `isSettled: boolean` | Engine physics API only (no React) |
| `GraphCanvas.tsx` | Draw nodes; handle 2D↔3D; apply alpha mask | snapshot Float32Array, alphaMask Float32Array, `mode: "2d" \| "3d"` | DOM canvas, `onNodeClick`, `onLassoEnd` callbacks | Engine render API, React |
| `GraphInteractions.tsx` | Search highlight, filter toggle, lasso rect, click-isolate | User events, DuckDB filter selections | `alphaMask: Float32Array`, `selectedNodeIds: string[]` | DuckDB-WASM (query only), React |
| `SelectionBridge.tsx` | Convert selected node IDs to analytics | `selectedNodeIds: string[]` | `ChartDatum[]` piped to pie chart | DuckDB-WASM, analyticsQueries.ts |
| `AccessAnalysisPage.tsx` | Orchestrate; hold shared state; wire layers | Session, tRPC, route params | Renders all sub-components | All of the above |

---

## Data Flow Direction

```
Postgres
  └─ AccProjectMember (email, projectId, addedOn, lastSignIn, companyName, products, projectAdmin)
  └─ AccProjectRole   (roleId per member)
  └─ AccFolderPermission (folderId, roleId, permType)
  └─ AccActivity      (userEmail, projectId, rawAction, createdAt)
        │
        │  tRPC: trpc.accGraph.bulkUsers.useQuery()   [existing router, no new endpoints]
        ▼
dataLayer.ts
  buildNodeFeatureTable(users, activities, folderPerms)
    → per-(user,project) row: {
        node_id,        // `${email}::${projectId}`
        user_id,        // email
        project_id,
        activity_count, // COUNT(AccActivity) per user+project
        last_sign_in_ms,
        added_on_ms,
        role_ids[],
        folder_perm_tier, // max permType rank
        is_admin,
        is_external,
        company_role,
        module_ids[]
      }
  registerGraphArrowTables(conn, arrowTable)  →  DuckDB views ready
        │
        ▼
mathLayer.ts
  SEED POSITIONING FUNCTION:
    seedPosition(node, dim) → Vec2 | Vec3
      For each active dimension slider at value > 0:
        - Project node features onto the dimension's axis direction
        - Scale by slider value [0,1]
        - Add scaled contribution to position vector

  SLIDER COMPOSITION (explicit math):
    Let D = number of active dimension sliders
    Let s_d = slider value for dimension d ∈ [0, 1]
    Let f_d(node) = feature score for dimension d ∈ [0, 1]
    Let angle_d = (d / D) * 2π  — evenly distributed seed directions

    seed_d = angle_d → unit vector u_d = (cos(angle_d), sin(angle_d))
    target contribution from dim d: t_d = u_d * f_d(node) * s_d

    finalTarget(node) = Σ_d(t_d) / Σ_d(s_d)   [normalized so 0-slider dims don't shrink canvas]

    When all sliders = 0:  finalTarget = last settled position (organic/diffuse mode)
    When one slider = 1:   nodes cluster toward that dimension's seed direction by feature strength
    When multiple sliders: continuous blend — no jump between regimes

  OUTPUT: targetPositions: Float32Array  [tx0, ty0, tx1, ty1, ...]  (per nodeIds order)
        │
        ▼
physicsLayer.ts
  Maps sliderValues[] → physics parameters:
    totalSliderStrength = max(s_d)  across all d
    alpha      = 0.3 + totalSliderStrength * 0.5   // higher = more energetic convergence
    alphaDecay = 0.02 - totalSliderStrength * 0.01  // slow decay = long settling
    repulsion  = 30 - totalSliderStrength * 20      // less repulsion when clustering
    attraction = totalSliderStrength * 0.15         // pull toward target when sliders active

  Engine receives:
    - targetPositions (from math layer)
    - physics params (from slider values)
    - setAlphaMask mask from interaction layer (does not affect positions)

  Engine emits on each tick:
    - currentPositions: Float32Array  [x0,y0,x1,y1,...]

  POSITION PRESERVATION RULE:
    On filter/search activation:  freeze positions (stop simulation re-layout)
    On filter/search clear:       resume from frozen positions at low alpha
    On slider change:             re-warm simulation with new targetPositions
        │
        ▼
GraphCanvas.tsx
  Receives: currentPositions Float32Array, alphaMask Float32Array, mode "2d"|"3d"
  Renders: nodes at positions, opacity from alphaMask
  2D↔3D continuity:
    - 2D mode: use (x, y) from Float32Array, z = 0
    - 3D mode: use (x, y, z) from Float32Array if 3D sim active, else project (x, y, 0)
    - Switch does NOT remount; passes new coordinate array to running engine
    - Engine selection must support coordinate injection without position reset
        │
        ▼
GraphInteractions.tsx
  Filter: user applies facet filter
    → DuckDB query: SELECT DISTINCT node_id FROM user_projects WHERE <filter>
    → build alphaMask: lit=1.0, dim=0.15
    → pass mask to GraphCanvas (positions UNCHANGED)

  Search: user types name
    → scan nodeIds for matching user_id substring
    → alphaMask: matching=1.0, non-matching=0.15
    → positions UNCHANGED

  Lasso: user draws rect on canvas
    → GraphCanvas fires onLassoEnd(nodeIds[])
    → pass selectedNodeIds up to AccessAnalysisPage

  Click-isolate: user clicks node
    → alphaMask: clicked node + neighbors = 1.0, others = 0.15
    → positions UNCHANGED
        │
        ▼
SelectionBridge.tsx
  Input: selectedNodeIds: string[]  (from lasso or click-isolate)
  Query: DuckDB  SELECT project_id, role_id, COUNT(*) FROM user_projects WHERE node_id IN (...)
  Output: ChartDatum[]  →  PieChartWidget
  Contract: bridge reads from DuckDB views only; never touches physics or positions
```

---

## Patterns to Follow

### Pattern 1: Pure Math Module (no framework imports)
**What:** `mathLayer.ts` exports pure functions: `(number[], number[]) → Float32Array`. No React hooks, no engine references, no DuckDB calls.
**When:** Any time position math is written.
**Why:** Math that doesn't import React can be unit tested in Vitest with no DOM setup. This is the pattern that prevents the patch cycle — when math is isolated, changing it doesn't risk breaking rendering.

```typescript
// lib/graph/mathLayer.ts
export function computeTargetPositions(
  features: NodeFeatures[],
  sliders: DimSlider[],
): Float32Array {
  // Σ(u_d * f_d(node) * s_d) / Σ(s_d)  per node
  // No imports except pure utilities
}
```

### Pattern 2: Float32Array as Layer Boundary Contract
**What:** Layers communicate positions exclusively via typed arrays, not object graphs.
**When:** Between math→physics and physics→rendering.
**Why:** Float32Arrays are zero-copy shareable with engine internals (SharedArrayBuffer / transferable), and they enforce the contract that rendering cannot accidentally read math state.

### Pattern 3: Alpha Mask for Filter/Search (No Re-layout)
**What:** Filtering never triggers a new physics run. It only updates `alphaMask: Float32Array`.
**When:** Any filter, search, or selection event.
**Why:** The patch cycle was caused by filter events resetting physics. The alpha mask pattern decouples visibility from position entirely.

### Pattern 4: Slider-Driven Physics Params (No Mode Switching)
**What:** There is no "organic mode" vs "clustered mode". Slider values continuously parameterize the physics engine. At slider=0 across all dims, physics runs as a free repulsion-only sim. At slider=1 for one dim, attraction toward target is strong. At multiple sliders, forces superpose.
**When:** Any slider interaction.
**Why:** Mode switching causes position jumps. Continuous parameterization gives smooth visual transitions.

### Pattern 5: Freeze-On-Rest Position Cache
**What:** When the simulation settles (isSettled=true), the physicsLayer saves `currentPositions` to DuckDB-WASM `positions` table (existing `positionsCache.ts` pattern) keyed by `hashNodeSet(nodeIds)`.
**When:** After any physics run completes.
**Why:** Filter toggle and search cannot re-trigger layout from scratch; they restore from the frozen cache.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Math Inside Graph Component
**What:** Writing `targetX = sliderValue * someFeature` inside `GraphCanvas.tsx` or a hook that directly calls the engine.
**Why bad:** This is exactly what caused the ~4242-line `AccUsersGraph.tsx` monolith where every patch broke something else. The engine callback runs inside a render loop; math that depends on React state gets re-evaluated on every frame with no unit test surface.
**Instead:** Compute `targetPositions` in `mathLayer.ts` before any engine interaction. Pass as Float32Array.

### Anti-Pattern 2: Filter Triggers Re-layout
**What:** Calling `simulation.restart()` or reinitializing node positions when a user applies a filter.
**Why bad:** Nodes jump to new positions. Users lose spatial context. This was the most complained-about patch-cycle symptom.
**Instead:** Alpha mask only. Positions are frozen at rest.

### Anti-Pattern 3: One Big Context Provider
**What:** Storing sliderValues, positions, selectedNodes, filters, search text, and engine handle all in one React context.
**Why bad:** Any slider move causes the entire graph tree to re-render. This caused performance jitter in the previous iteration.
**Instead:** Split into `SliderContext` (sliderValues only), `SelectionContext` (selectedNodeIds only), and `FilterContext` (filter/search state). Physics state lives outside React (in a ref or the physics layer object).

### Anti-Pattern 4: 2D↔3D as Remount
**What:** Unmounting the 2D canvas and mounting a 3D canvas when the user switches modes.
**Why bad:** Positions are lost on unmount. Users experience a full re-layout.
**Instead:** Pass a `mode` prop to `GraphCanvas.tsx`. The underlying engine receives the same position array; only the projection changes (z=0 in 2D, z from simulation in 3D). The engine must support this without a hard reset.

### Anti-Pattern 5: tRPC Query Inside Physics Loop
**What:** Fetching data from the server during simulation ticks or on slider change.
**Why bad:** Network latency in the animation loop causes visible stutter and frame drops.
**Instead:** All data is loaded into DuckDB-WASM at mount time. Slider changes only trigger math recalculation (pure CPU), not network calls.

---

## Build Order

The dependency graph dictates this order. Each layer must be independently testable before the next layer is built.

```
Phase 1 (no UI, no engine):
  1a. dataLayer.ts + tests
      - Confirm Arrow table schema: node_id, user_id, project_id, feature columns
      - Confirm DuckDB-WASM registration works with existing duckdbClient.ts
  1b. mathLayer.ts + tests
      - Unit test: computeTargetPositions() with mocked features and sliders
      - Unit test: verify slider=0 → zero contribution, slider=1 → full contribution
      - Unit test: verify multi-slider normalization (sum of weights)
      GATE: math tests pass with no React/engine dep → proceed

Phase 2 (physics, no render):
  2a. physicsLayer.ts
      - Integrate chosen engine's simulation API (Cosmograph or alternative)
      - Map sliderValues → {alpha, alphaDecay, repulsion, attraction}
      - Confirm position freeze-on-rest with positionsCache.ts
      - Confirm: filter event → alpha mask only, simulation does NOT restart
      GATE: positions array stable after settle → proceed

Phase 3 (render, no interaction):
  3a. GraphCanvas.tsx (2D first)
      - Consume Float32Array positions
      - Consume Float32Array alphaMask
      - Validate: no math inside component
  3b. 2D↔3D switch
      - mode prop tested without remount
      GATE: visual render matches expected positions → proceed

Phase 4 (interaction):
  4a. GraphInteractions.tsx
      - Filter → alphaMask (no position change)
      - Search → alphaMask (no position change)
      - Lasso → selectedNodeIds callback
      - Click-isolate → alphaMask
  4b. SelectionBridge.tsx
      - selectedNodeIds → DuckDB query → ChartDatum[]
      - Pie chart widget wired
      GATE: lasso → pie chart populated → demo ready

Phase 5 (slider UX + polish):
  5a. Dimension slider UI
      - SliderContext
      - Each slider 0-100 mapped to s_d ∈ [0,1]
      - Real-time: slider move → recompute targetPositions → re-warm physics
  5b. Label overlay, node color by dimension
      GATE: continuous blend visibly correct across all slider combinations
```

---

## Scalability Considerations

The topology is one-node-per-(user, project). A typical LECG deployment has ~50-200 users × ~10-30 projects = 500-6000 nodes. The math and physics layers must stay performant at 6000 nodes on a single Windows machine.

| Concern | At 500 nodes | At 6000 nodes | Mitigation |
|---------|--------------|---------------|------------|
| Arrow table build | <10ms | ~100ms | Async, run once at mount |
| mathLayer computeTargetPositions | <1ms | ~15ms | Pure JS, no allocation on tick |
| Physics sim per tick | <8ms | ~40ms | Use engine's WebGL physics if available |
| DuckDB filter query | <5ms | <20ms | Indexed on user_id, project_id |
| Position cache save | <10ms | ~80ms | Async, on settle only |
| 2D↔3D mode switch | 0ms remount | 0ms remount | Coordinate injection, no restart |

---

## Separation That Prevents Math Leaking Into Rendering

The critical invariant: **rendering layer has no knowledge of slider values**.

```
GraphCanvas.tsx  imports:  Float32Array positions, Float32Array alphaMask, string[] nodeIds
GraphCanvas.tsx  does NOT import:  sliderValues, similarity dimensions, feature columns, physics params
```

This is enforced by the interface contract:

```typescript
interface GraphCanvasProps {
  nodeIds: readonly string[];        // ordered, stable across renders
  positions: Float32Array;           // [x0,y0,...] or [x0,y0,z0,...] — from physicsLayer
  alphaMask: Float32Array;           // [a0,a1,...] — from interactionLayer
  mode: "2d" | "3d";
  onNodeClick: (nodeId: string) => void;
  onLassoEnd: (nodeIds: string[]) => void;
}
```

If a developer needs to express "node X should be more visible because of dimension Y", that logic belongs in `mathLayer.ts` → `physicsLayer.ts` → `alphaMask`. It never enters `GraphCanvas.tsx`.

---

## Key Abstractions

### NodeFeatures (dataLayer output, mathLayer input)
```typescript
interface NodeFeatures {
  nodeId: string;                   // `${email}::${projectId}`
  userId: string;                   // email
  projectId: string;
  activityCount: number;            // COUNT(AccActivity)
  lastSignInMs: number | null;      // epoch ms
  addedOnMs: number | null;
  roleIds: string[];
  folderPermTier: number;           // 0-4 ranked permType
  isAdmin: boolean;
  isExternal: boolean;
  companyRole: string | null;
  moduleIds: string[];
}
```

### DimSlider (mathLayer input)
```typescript
interface DimSlider {
  dim: SimilarityDim;   // reuses existing SimilarityDim type from userSimilarity.ts
  value: number;        // [0, 1]  (UI shows 0-100, mapped before passing to math)
  axisAngle: number;    // radians, assigned at dim registration time  (d / D) * 2π
}
```

### PhysicsTarget (physicsLayer input)
```typescript
interface PhysicsTarget {
  targetPositions: Float32Array;   // from mathLayer
  sliderStrength: number;          // max(s_d) across all active sliders
}
```

---

## Sources

- Codebase: `app/(dashboard)/users/access-analysis/` — existing partial implementation (graphTables, positionsCache, graphSql, CosmosCanvasClient, analyticsQueries, mosaicSelections)
- Codebase: `lib/acc/userSimilarity.ts` — existing SimilarityDim type (11 dims), pairSimilarity pure function (HIGH confidence, current)
- Codebase: `prisma/schema.prisma` — AccProjectMember, AccActivity, AccFolderPermission schema (HIGH confidence, current)
- Codebase: `.planning/PROJECT.md` — topology decision (one node per (user, project)), constraints, known gotchas
- Memory: `project_cosmos_alpha_inversion.md` — Cosmos.gl v3 getSimulationAlpha() inverted; noted in physicsLayer mapping
- Memory: `project_cosmograph_mosaic_redesign.md` — prior DuckDB→Mosaic→frozen-Cosmos pattern (partial; engine choice open)
- Memory: `feedback_similarity_positional_only.md` — similarity dims are positional/clustering only, never visible edges

---

*Architecture analysis: 2026-05-19*
