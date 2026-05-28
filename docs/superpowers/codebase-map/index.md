# Codebase Map — Index

> **Status:** Durable reference. Read this **first** whenever you don't understand a subsystem before
> editing it. Built from repo evidence (file paths + line numbers cited in the subsystem maps).
> **Companion:** the process docs in [`../workflows/`](../workflows/index.md). This package is the *map*;
> the workflows are the *rules of the road*.

## If you are confused, read this first

1. **Don't edit code you don't understand.** Open the relevant subsystem map below, then the file.
2. Cross-check the **[file-ownership-map](./file-ownership-map.md)** — it says when each file is safe to edit
   and which tests cover it.
3. Check **[active-wip-boundaries](./active-wip-boundaries.md)** — another terminal (T1) may own the file.
4. For data-shaped changes, follow [`../workflows/data-discovery-workflow.md`](../workflows/data-discovery-workflow.md) first.
5. Verify any claim here against the live tree — maps reflect the repo at authoring time and can drift.

## The maps

| Map | Read it when |
|-----|--------------|
| [repo-architecture.md](./repo-architecture.md) | You need the lay of the land — top-level folders, where app/server/lib/tests/docs live, what's generated, what not to touch. |
| [access-analysis-graph.md](./access-analysis-graph.md) | Working on the graph UI: route → shell → canvas → dimensions → physics → colors → edges. Includes phase status P1–P5 + T1 ownership. |
| [data-pipeline.md](./data-pipeline.md) | Following data from Postgres → tRPC → cache → assembly → Arrow → DuckDB → snapshot → renderer. |
| [testing-and-gates.md](./testing-and-gates.md) | Before claiming done: unit / typecheck / e2e, the :3100 Playwright server, the graphTestBridge, what each gate proves. |
| [active-wip-boundaries.md](./active-wip-boundaries.md) | Anytime two terminals share the tree, or before staging — ownership, baseline-WIP rule, forbidden areas. |
| [file-ownership-map.md](./file-ownership-map.md) | Quick "who owns this file, when is it safe to edit, what tests it" lookup. |
| [dependency-map.md](./dependency-map.md) | Understanding import/data flow and avoiding circular imports or breaking a fragile seam. |
| [codebase-map.json](./codebase-map.json) | Machine-readable: subsystems, files, dependencies, tests, forbidden-during-P5C, active owners. |

## Subsystem list (the graph feature)

| Subsystem | Core files | Map section |
|-----------|------------|-------------|
| Route entry | `page.tsx`, `AccessAnalysisShellClient.tsx`, `acc-route-hydration.ts` | access-analysis-graph §1 |
| Shell orchestration | `AccessAnalysisShell.tsx`, `GraphInteractions.tsx` | access-analysis-graph §2 |
| Server data pipeline | `acc-dc-graph.ts`, `acc-hot-cache.ts`, `dcUserAssembly.ts`, `acc-types.ts` | data-pipeline §2–4 |
| Client data pipeline | `graphTables.ts`, `duckdbClient.ts`, `featureSnapshot.ts`, `interactionTypes.ts` | data-pipeline §5–7 |
| Dimension model | `dimensionRegistry.ts`, `featureTargets.ts`, `SliderContext.tsx`, `SliderSidebar.tsx` | access-analysis-graph §5 |
| Layout engine | `mathLayer.ts`, `physicsLayer.ts`, `previewLayer.ts`, `layoutStats.ts`, `positionsCache.ts` | access-analysis-graph §6 |
| Rendering | `GraphCanvas.tsx`, `GraphCanvas2D.tsx`, `GraphCanvas3D.tsx`, `nodeColors.ts`, `CosmosCanvasClient.ts` | access-analysis-graph §3,7 |
| Edges | `sameUserEdges.ts`, `linkEmphasis.ts` | access-analysis-graph §8 |
| Interaction | `GraphInteractions.tsx`, `LassoOverlay.tsx`, `SelectionContext.tsx`, `UserDetailPanel.tsx` | access-analysis-graph §9 |
| Activity aggregation (P5-C, **T1-owned**) | `activityAggregate.ts`, `activityCategories.ts` | data-pipeline §8 |
| Test bridge | `graphTestBridge.ts` | testing-and-gates |

> `previewLayer.ts` — pure target-field + lerp module driving 2D preview override (B.2).

## Rule for agents

**When you are confused about a subsystem, you MUST consult this index and the relevant subsystem map
before editing code.** This rule is mirrored in the workflows
([repo-development-workflow](../workflows/repo-development-workflow.md),
[subagent-development-workflow](../workflows/subagent-development-workflow.md)).
