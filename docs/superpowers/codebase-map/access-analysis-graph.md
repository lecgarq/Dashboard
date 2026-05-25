# Access-Analysis Graph Subsystem

> The WebGL graph at `/users/access-analysis`. One node per **(user, project)** instance (~16,942 nodes).
> File paths are under `app/(dashboard)/users/access-analysis/` unless noted. Line numbers are evidence at
> authoring time — verify before relying. See [data-pipeline](./data-pipeline.md) for the data half.

## 1. Route / page entry points

- **`page.tsx`** — server component. Calls `createAccRouteHelpers()` + `prefetchAccessAnalysisRouteData()`
  (`lib/server/acc-route-hydration.ts`, which prefetches `accDcGraph.bulkUsers`), wraps in a
  `HydrationBoundary`, renders **`AccessAnalysisShellClient`** inside `<div className="h-screen">`.
- **`AccessAnalysisShellClient.tsx`** — the client boundary that mounts the shell.
- Route file = nav/route surface → **do not edit casually.**

## 2. AccessAnalysisShell

- **`AccessAnalysisShell.tsx`** — the orchestrator. Component tree (per its header comment):
  `Shell → SliderProvider → GraphInteractions(GraphCanvas)`.
- Fetches data:
  ```ts
  // AccessAnalysisShell.tsx:202
  const bulkUsersQuery = trpc.accDcGraph.bulkUsers.useQuery(
    { includePermissionSummary: true, includeActivityMix: true },  // :203
    ...
  );
  ```
  → so the shell requests **both** the permission summary **and** the P5-C activity mix. (The
  `includeActivityMix: true` flag is **landed and T1-owned** — see §10.)
- Holds `graphRef: GraphCanvasHandle`, renders `<GraphCanvas .../>` (`:177`), and surfaces load/error state.

## 3. GraphCanvas2D / GraphCanvas3D

- **`GraphCanvas.tsx`** — the dispatcher. Critical invariant (header comment, `:12-14`):
  **both 2D and 3D containers are ALWAYS mounted**; switching `mode` uses **CSS visibility**, never a
  remount, to avoid WebGL context destruction. Exposes a discriminated `GraphCanvasHandle`
  (`{ mode: "2d", handle } | { mode: "3d", handle }`, `:38-39`).
- **`GraphCanvas2D.tsx`** — cosmos.gl renderer (`@cosmos.gl/graph`). `GraphCanvas2DHandle`.
- **`GraphCanvas3D.tsx`** — three.js renderer. `GraphCanvas3DHandle`. 3D axis labels driven by active dims.
- **`CosmosCanvasClient.ts`** — cosmos.gl client wrapper.
- ⚠️ **Renderers — forbidden casual edit.** A common mistake: "optimizing" `GraphCanvas` to
  conditionally render one canvas — this destroys the WebGL context. Don't.

## 4. graphTestBridge

- **`graphTestBridge.ts`** — installs `window.__ACC_GRAPH_TEST__` (`installGraphTestBridge()`, `:584`),
  flag-gated by `NEXT_PUBLIC_ACC_GRAPH_TEST` (`isGraphTestEnabled()`, `:29`). Because the graph is a single
  WebGL canvas with no per-node DOM, **all e2e assertions read through this bridge** (`GraphTestApi`,
  `:240`): `getRenderedNodeCount`, `getColorStats`, `getLayoutStats`, `getPositionsStats`,
  `getClusteringScore`, `getMode`, `getFrozen`, etc. Also exposes test-only state setters
  (`setShellTestState`, `setInteractionTestState`, `setEdgeTestState`).
- This is the seam that lets humans/tests verify the graph **without devtools**. See
  [testing-and-gates.md](./testing-and-gates.md).

## 5. Dimension model (registry · sliders · targets)

- **`dimensionRegistry.ts`** — single source of truth. `DimensionId` (9): `project`, `role`, `tier`,
  `internalExternal`, `company`, `activity`, `signin`, `isAdmin`, `module` (`:17-26`). Each
  `DimensionDescriptor` carries family / type / availability (`A1`–`A5`) / confidence. Helpers:
  `DIMENSION_REGISTRY`, `getDimension`, `RUNTIME_DIMENSION_IDS`, `RUNTIME_TARGET_DIMENSION_IDS`,
  `MULTI_HOT_DIMENSION_IDS`, `runtimeDefaultSliders`.
  ⚠️ **Trap:** adding a registry descriptor auto-creates a layout target — only add one deliberately.
- **`featureTargets.ts`** — turns a dimension + node features into a layout anchor: `buildFeatureTargets`,
  `computeDimensionTarget`, `computeMultiHotTarget`, `categoryValue`, `TARGET_DIMENSIONS`.
- **`SliderContext.tsx`** — runtime controls state. `SliderProvider` / `useSliders`; persists to
  `localStorage` (`CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1"`), `migratePersistedSliders`,
  `DEFAULT_VALUES`. Slider `0` = "Free" (no force), not a globe.
- **`SliderSidebar.tsx`** / `DimensionSlider.tsx` / `DimensionFilterPopover.tsx` — the UI (grouped +
  preset + search; advanced group collapsed with an active-count badge). `dimensionWeights.ts` derives
  per-dimension weights.

## 6. physicsLayer / layout

- **`mathLayer.ts`** — pure layout math (target blending, positions). Invariant-tested via
  `mathLayer.purity.test.ts`.
- **`physicsLayer.ts`** — the force simulation wrapper: `createPhysicsLayer`, `PhysicsLayer`, `SimNode`,
  `TargetArrays`. Invariant-tested via `physicsLayer.purity.test.ts` + `physicsClustering.test.ts`.
- **`layoutStats.ts`** — `computeClusteringRatio` and layout metrics (used by tests + the diagnostics
  overlay). **`positionsCache.ts`** — caches computed positions.
- ⚠️ **Graph physics — forbidden casual edit.** Changes here need the
  [`access-analysis-graph-development`](../workflows/access-analysis-graph-development.md) §4 layout-math
  validation workflow (0/100 slider behavior, no-NaN, zRange, determinism).

## 7. nodeColors

- **`nodeColors.ts`** — `ColorMode = DimensionId | EXTRA_COLOR_MODES` (`:39`); `COLOR_MODES`,
  `COLOR_MODE_LABELS`, `categoryForColor`, `migrateColorMode`, `buildNodeColors` (`:125`). Categorical =
  hashed hue; ordered = sequential ramp. Color changes must shift the renderer's color-buffer signature
  (asserted via `graphTestBridge.getColorStats`).

## 8. Same-user edges

- **`sameUserEdges.ts`** — `deriveSameUserEdges(nodeIds)` connects instances sharing the same user;
  `parseNodeId` (`userId::projectId`), `toCosmosLinks` (→ `Float32Array` link buffer).
- **`linkEmphasis.ts`** — per-edge emphasis/RGBA for focus states.
- ⚠️ **Edge layers — forbidden casual edit.** New edge types must be clique-capped (hub/top-k/threshold)
  per the graph-development workflow §3.

## 9. Interaction (hover / click / lasso / detail)

- **`GraphInteractions.tsx`** — wires pointer events to the active `GraphCanvasHandle`.
- **`LassoOverlay.tsx`** — lasso selection (dims non-selected via a mask, not physics).
- **`SelectionContext.tsx`** / `SelectionPanel.tsx` / `selectionQueries.ts` — selection state + queries.
- **`UserDetailPanel.tsx`** — per-node detail. **`NodeTooltip.tsx`** — hover tooltip.
- ⚠️ **Lasso, camera, interaction internals, UserDetailPanel — forbidden casual edit.**

## 10. Phase status (P1–P5) and ownership

| Phase | Status | Notes |
|-------|--------|-------|
| **P1** | Closed | Foundation: one node per (user, project); base layout/render. |
| **P2** | Closed | Pure `dimensionRegistry.ts` (9 dims) + snapshot enrichment (isAdmin, moduleSignature). |
| **P3** | Closed | Registry is runtime source of truth (sliders/targets/weights); `isExternal → internalExternal`; per-node confidence×availability weighting. |
| **P4** | Closed | Grouped/preset/search sidebar; `module` promoted to a real slider; registry-derived color modes; slider 0 = "Free". |
| **P5 A→B→D** | Shipped (2026-05-25) | Snapshot enrichment + permission summary; `highActivityHighPerm` deferred until activity landed. |
| **P5-C** | **Landed in tree, T1-owned / ACTIVE** | Per-instance `activityMix` / `activityTotal` / true last-activity, via a grouped `AccActivity` query. Evidence: `acc-dc-graph.ts:24` flag, `acc-hot-cache.ts:167-245` path, `lib/acc/activityAggregate.ts`, shell passes `includeActivityMix: true` (`AccessAnalysisShell.tsx:203`). |

### T1 ownership (do not edit these as docs-only T2)

T1 owns the P5-C AccActivity slice: `activityAggregate.ts`, the `acc-hot-cache.ts` activity query, the
`dcUserAssembly.ts` activity plumbing, the `acc-dc-graph.ts` activity flag, the `graphTables.ts` activity
columns, the `featureSnapshot.ts` activity fields, `AccessAnalysisShell.tsx` `includeActivityMix`,
`interactionTypes.ts` activity fields, and the P5-C tests. See
[active-wip-boundaries.md](./active-wip-boundaries.md).

## Domain companion

For *how to safely change* graph dimensions/edges/layout/renderers, use the existing
[`access-analysis-graph-development`](../workflows/access-analysis-graph-development.md) workflow (data
discovery, dimension addition, edge layers, layout-math validation, renderer regression). This map is the
*what/where*; that workflow is the *how*.
