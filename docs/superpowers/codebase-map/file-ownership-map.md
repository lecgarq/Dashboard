# File Ownership Map

> Quick lookup: who owns a file, what it does, when it's safe to edit, and what tests cover it. Paths are
> under `app/(dashboard)/users/access-analysis/` unless noted. "Owner subsystem" maps to
> [index](./index.md). For the live boundary, cross-check [active-wip-boundaries](./active-wip-boundaries.md)
> — ownership shifts per session.

| File | Owner subsystem | Purpose | Safe to edit when | Tests |
|------|-----------------|---------|-------------------|-------|
| `AccessAnalysisShell.tsx` | Shell orchestration | Orchestrator; calls `accDcGraph.bulkUsers({ includePermissionSummary, includeActivityMix })`, mounts `GraphCanvas`. | **T1-owned** (passes `includeActivityMix`). Otherwise: shell task with mandate. | `AccessAnalysisPage.test.tsx` |
| `featureSnapshot.ts` | Client data pipeline | DuckDB query → `NodeFeatureSnapshot[]`; bucketers; `computeRiskFlags`. | **T1-owned** (activity fields/risk finalize). Else: snapshot task with data-discovery. | `__tests__/featureSnapshot.test.ts` |
| `graphTables.ts` | Client data pipeline | `BulkAccUser[]` → Arrow `graph_*` tables. | **T1-owned** (activity columns). Else: pipeline task. | `graphTables.test.ts`, `dataLayer.test.ts` |
| `dimensionRegistry.ts` | Dimension model | Source of truth for the 9 dimensions + helpers. | Dimension task only. ⚠️ adding a descriptor auto-creates a layout target. | via `featureTargets.test.ts`, `__tests__/dimensionWeights.test.ts` |
| `SliderContext.tsx` | Dimension model | Runtime slider state; persistence; `useSliders`. | Controls task with mandate. | covered via UI tests |
| `SliderSidebar.tsx` | Dimension model | Grouped/preset/search slider UI. | Controls/UI task with mandate. | `__tests__/Toolbar.test.tsx` (toolbar), UI tests |
| `nodeColors.ts` | Rendering | Color modes; `buildNodeColors`; hashed/sequential. | Color task; must keep `getColorStats` signature behavior. | `chartColors.test.ts` (colors), e2e color asserts |
| `physicsLayer.ts` | Layout engine | Force sim wrapper; `createPhysicsLayer`. | ⛔ **Forbidden casual edit** — needs layout-math validation workflow. | `physicsLayer.purity.test.ts`, `physicsClustering.test.ts` |
| `mathLayer.ts` | Layout engine | Pure layout math / target blend. | ⛔ Forbidden casual edit — invariant-gated. | `mathLayer.test.ts`, `mathLayer.purity.test.ts` |
| `GraphCanvas2D.tsx` | Rendering | cosmos.gl renderer. | ⛔ Forbidden casual edit (WebGL). | `GraphCanvas.test.ts`, e2e |
| `GraphCanvas3D.tsx` | Rendering | three.js renderer. | ⛔ Forbidden casual edit (WebGL). | `GraphCanvas3D.test.ts`, e2e |
| `GraphCanvas.tsx` | Rendering | 2D/3D dispatcher; both always mounted (CSS-visibility switch). | ⛔ Forbidden casual edit — conditional render breaks WebGL ctx. | `GraphCanvas.test.ts` |
| `graphTestBridge.ts` | Test bridge | `window.__ACC_GRAPH_TEST__` observation API. | Test-infra task; keep `GraphTestApi` stable (e2e depends on it). | exercised by `tests/e2e/acc-dc-graph.spec.ts` |
| `featureTargets.ts` | Dimension model | Dimension → layout anchor; `buildFeatureTargets`. | Dimension task; pair with registry + snapshot. | `featureTargets.test.ts` |
| `sameUserEdges.ts` | Edges | `deriveSameUserEdges`, `toCosmosLinks`. | ⛔ Forbidden casual edit — clique-cap rules apply. | `sameUserEdges.test.ts` |
| `linkEmphasis.ts` | Edges | Per-edge emphasis/RGBA. | ⛔ Forbidden casual edit. | `linkEmphasis.test.ts` |
| `LassoOverlay.tsx` | Interaction | Lasso selection (mask, not physics). | ⛔ Forbidden casual edit. | `__tests__/LassoOverlay.test.tsx` |
| `UserDetailPanel.tsx` | Interaction | Per-node detail panel. | ⛔ Forbidden casual edit. | UI tests |
| `interactionTypes.ts` | Client data pipeline | `NodeFeatureSnapshot` + interaction types. | **T1-owned** (activity fields). | type-level; consumers' tests |
| `acc-hot-cache.ts` (`lib/server/`) | Server data pipeline | `getCachedAccDcBulkUsers`; versioned cache; perm + activity queries. | **T1-owned** (activity path). Else: cache task. | `acc-hot-cache.test.ts` |
| `dcUserAssembly.ts` (`lib/acc/`) | Server data pipeline | Pure `assembleDcUsers` → `BulkAccUser[]`. | **T1-owned** (activity plumbing). Else: assembly task. | `dcUserAssembly.test.ts` |
| `acc-dc-graph.ts` (`server/routers/`) | Server data pipeline / router | `bulkUsers` tRPC procedure + input flags. | ⛔ Router — forbidden casual edit; **T1-owned** (activity flag). | `acc-dc-graph.test.ts` |
| `activityAggregate.ts` (`lib/acc/`) | Activity aggregation (P5-C) | `foldActivityRows` grouped rows → per-instance mix. | ⛔ **T1-owned, ACTIVE** — do not edit. | `activityAggregate.test.ts` |
| `activityCategories.ts` (`lib/acc/`) | Activity aggregation | `categorize(rawAction)`. | ⛔ T1-owned area. | `activityCategories.test.ts` |
| `page.tsx` | Route entry | SSR prefetch + hydrate → shell client. | ⛔ Route/nav — forbidden casual edit. | covered via route-hydration tests |
| `acc-route-hydration.ts` (`lib/server/`) | Route entry | Prefetch `bulkUsers` for SSR. | Route task with mandate. | `acc-route-hydration.test.ts` |

## Legend

- **⛔ Forbidden casual edit** — needs an explicit task mandate and (for graph internals) the
  [`access-analysis-graph-development`](../workflows/access-analysis-graph-development.md) workflow.
- **T1-owned** — another terminal is actively working it this session; do not edit (see
  [active-wip-boundaries](./active-wip-boundaries.md)). Ownership is per-session and will change.
- "Tests" lists the primary co-located coverage; e2e (`tests/e2e/acc-dc-graph.spec.ts`) covers the
  integrated render path for renderer/edge/color/layout files.
