# Dependency Map

> Import/data/test dependency flow for the access-analysis graph, plus the seams that break if you wire
> them wrong. Text diagrams (no tooling needed). See [data-pipeline](./data-pipeline.md) for the
> annotated pipeline and [file-ownership-map](./file-ownership-map.md) for per-file detail.

## Data dependencies (value flow, source → screen)

```
Postgres AccDc* / AccActivity / AccRole
        │
        ▼  (Prisma, server)
acc-dc-graph.ts  bulkUsers(input flags)
        │
        ▼
acc-hot-cache.ts  getCachedAccDcBulkUsers
        ├── (includePermissionSummary) folder-permission queries
        ├── (includeActivityMix) AccActivity groupBy → activityAggregate.foldActivityRows   [P5-C / T1]
        └── dcUserAssembly.assembleDcUsers ──► BulkAccUser[]   (types: acc-types.ts)
        │
        ▼  (tRPC over the wire / SSR hydration via acc-route-hydration.ts)
AccessAnalysisShell  (React Query: bulkUsers.useQuery)
        │
        ▼
graphTables.buildGraphArrowTables ──► Arrow tables
        │
        ▼  (duckdbClient.ts)
DuckDB-WASM  graph_* tables
        │
        ▼
featureSnapshot.buildFeatureSnapshot ──► NodeFeatureSnapshot[]   (type: interactionTypes.ts)
        │
        ├──► featureTargets.buildFeatureTargets ──► physicsLayer.createPhysicsLayer ──► positions
        ├──► nodeColors.buildNodeColors ──► color buffers
        ├──► sameUserEdges.deriveSameUserEdges + linkEmphasis ──► edge buffers
        └──► GraphCanvas2D / GraphCanvas3D  (render)
```

## Runtime dependencies (import direction)

```
page.tsx
  └─ acc-route-hydration.ts ─ (prefetch) → acc-dc-graph router → acc-hot-cache → dcUserAssembly → acc-types
  └─ AccessAnalysisShellClient
       └─ AccessAnalysisShell
            ├─ SliderContext (SliderProvider/useSliders)  ← dimensionRegistry, dimensionWeights
            ├─ SliderSidebar / DimensionSlider            ← SliderContext, dimensionRegistry
            ├─ GraphInteractions
            │    └─ GraphCanvas  ──► GraphCanvas2D / GraphCanvas3D
            │         (consumes positions, colors, edges)
            ├─ graphTables ─→ duckdbClient ─→ featureSnapshot ─→ interactionTypes (NodeFeatureSnapshot)
            ├─ featureTargets ← dimensionRegistry, interactionTypes
            ├─ physicsLayer / mathLayer / layoutStats / positionsCache
            ├─ nodeColors ← dimensionRegistry, interactionTypes
            ├─ sameUserEdges / linkEmphasis
            └─ graphTestBridge (installed when NEXT_PUBLIC_ACC_GRAPH_TEST=1)
```

Key shared leaf modules (depended on by many; change with care):
- **`dimensionRegistry.ts`** — imported by `featureTargets`, `nodeColors`, `SliderContext`,
  `dimensionWeights`. The 9 `DimensionId`s are a contract.
- **`interactionTypes.ts`** (`NodeFeatureSnapshot`) — imported by every client consumer.
- **`acc-types.ts`** (`BulkAccUser`/`BulkAccProject`) — the server↔client data contract.

## Test dependencies

```
unit (vitest, co-located)
  ├─ pure modules tested directly: activityAggregate, dcUserAssembly, featureTargets,
  │  nodeColors/chartColors, sameUserEdges, linkEmphasis, mathLayer(.purity), physicsLayer(.purity),
  │  physicsClustering, internalDomains, dataLayer, dimensionWeights
  ├─ router/cache: acc-dc-graph.test (mocks db), acc-hot-cache.test
  └─ snapshot: __tests__/featureSnapshot.test

e2e (playwright, tests/e2e/acc-dc-graph.spec.ts)
  └─ depends on: NEXT_PUBLIC_ACC_GRAPH_TEST=1  →  graphTestBridge  →  reads render state
     (renderers, physics, colors, edges, count) without DOM
```

The e2e suite has a **hard dependency on `graphTestBridge`**: if the `GraphTestApi` surface changes, the
spec breaks. Treat the bridge API as a tested contract.

## Do not create circular imports

- **`dimensionRegistry` must stay leaf-ish.** It defines `DimensionId` and descriptors; do not import
  runtime/UI modules into it. `featureTargets`/`nodeColors`/`SliderContext` depend on it, not vice versa.
- **`acc-types.ts` is a pure type module.** Don't import runtime/DuckDB code into it. P5-C deliberately
  typed `BulkAccProject.activityMix` as a loose `Record<string, number>` to **avoid an import cycle** with
  `activityAggregate`/`interactionTypes` (which hold the strong `ActivityCategory` typing). Keep that split.
- **`interactionTypes.ts`** is the shared type home — types flow *out* of it; runtime flows *in* to its
  consumers.
- **server vs client:** `lib/server/**` and `server/**` are server-only; do not import them into client
  components. The boundary is the tRPC procedure (`acc-dc-graph`) and the React Query hook.

## Known fragile seams

| Seam | Why it's fragile | Guard |
|------|------------------|-------|
| Cache key ↔ flags (`acc-hot-cache`) | A new flag that doesn't extend both the version spec **and** the cache id leaks stale data across flag combos. | `acc-hot-cache.test.ts`; add `act`/`sum`/`ctx`-style id parts. |
| Node identity `userId::projectId` | Edges, selection, e2e count all key off it. | `sameUserEdges.test.ts`, e2e `EXPECTED_NODE_COUNT`. |
| Empty-string sentinel (`projectId=''`=admin) | `not null` filters silently include admin rows. | `dcAnomalyChecks`, activity tests. |
| Arrow ↔ DuckDB table swap | Non-atomic `CREATE TABLE` previously crashed; fixed with `CREATE OR REPLACE TABLE`. | keep atomic swap. |
| `GraphCanvas` mount model | Conditional-rendering a canvas destroys the WebGL context. | both always mounted; CSS-visibility switch. |
| `graphTestBridge` API | e2e reads through it; renaming methods breaks the suite. | treat `GraphTestApi` as a contract. |
| Registry descriptor → target | Adding a `DIMENSION_REGISTRY` entry auto-creates a layout target. | only add deliberately; covered by target tests. |
