<!-- refreshed: 2026-07-22 -->
# Architecture

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-22 — post-v2.7 "Activity Universe" (phases 37–41: activity-event graph replaces the user×project instance graph, binary payload artifact, 8-dimension sidebar, GPU morph, exact-month scrubber, same-author links) + activity-graph perf fix (c998db1e); repo-map basis 2026-07-21 (gate passing)

> **In-flight WIP note (2026-07-22):** this document describes the **committed architecture at HEAD** (`c998db1e` on `feat/access-analysis-redesign`). The working tree carries ~224 uncommitted entries (an access-analysis redesign in flight): `app/(dashboard)/users/` `PersonCard.tsx`, `PersonRow.tsx`, `PersonRowList.tsx`, `PersonDetailModal.tsx`, `ActivityAuditPanel.tsx`, `CollapsibleGroup.tsx`, `DirectoryListHeader.tsx`, `ModuleBadge.tsx` are **deleted in the working tree only** (at HEAD they exist but are already unused by the DataTable-driven directory shell); many `app/(dashboard)/access-analysis/*` and `app/(dashboard)/users/access-analysis/*` files carry uncommitted modifications. Where the WIP materially diverges it is flagged inline; everything else below is HEAD-verified.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js App Router (React 19, app/ route shells)                  │
│                                                                              │
│  /(auth)/*              /(dashboard)/*                                       │
│   login/register         layout.tsx  ← auth + sidebar + panel wrappers      │
│   ┌──────────┐  ┌────────────────┬───────────────┬──────────────────────┐   │
│   │/users    │  │/access-analysis│ /template-mty │ /forma-proposal      │   │
│   │directory │  │ RSC dashboard  │  RSC analytics│  folder/org editor   │   │
│   │+ /spatial│  │                │               │                      │   │
│   │-graph    │  │                │               │                      │   │
│   └──────────┘  └────────────────┴───────────────┴──────────────────────┘   │
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │ tRPC + TanStack React-Query (hydration / streaming)
┌─────────────────────────▼────────────────────────────────────────────────────┐
│  API Boundary (server/routers/ — tRPC App Router handler)                    │
│                                                                              │
│  accDcGraph   accActivity  accMembers  accFolders  accGraph  accPersonGraph  │
│  accSync      accCoordination  activityUniverse    users     project         │
│  clash  lod   gmail/calendar   chat    kpi         workspace ... (24 routers)│
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │ server-only imports
┌─────────────────────────▼────────────────────────────────────────────────────┐
│  Server Domain Layer (lib/server/*  +  lib/acc/*  +  lib/forma/*)           │
│                                                                              │
│  lib/server/acc-route-hydration.ts   ← tRPC prefetch helpers (RSC)          │
│  lib/server/accessInstanceView.ts    ← DC snapshot → AccessInstance[]        │
│  lib/server/moduleActivityView.ts    ← AccActivity → module rows             │
│  lib/server/activityTimelineView.ts  ← timeline aggregation                 │
│  lib/server/coordinationByProjectView.ts                                     │
│  lib/server/projectCoverageView.ts                                           │
│  lib/server/folderPermissionTerrainView.ts                                   │
│  lib/server/templateView.ts / templateFolderTerrain.ts / templateRoleTree.ts │
│  lib/server/formaFolderTree.ts                                               │
│  lib/server/acc-hot-cache.ts         ← in-process BulkAccUser cache         │
│  lib/acc/dcIngest.ts                 ← Data Connector ETL (57 KB)           │
│  lib/acc/acc-types.ts                ← BulkAccUser + shared types           │
└─────────────────────────┬────────────────────────────────────────────────────┘
                          │ Prisma client (db)
┌─────────────────────────▼────────────────────────────────────────────────────┐
│  Persistence (server/db.ts  →  PrismaClient + PrismaPg adapter)              │
│  Schema: prisma/schema.prisma   PostgreSQL (local, port 5432)                │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root layout | Global providers: TRPCProvider, ThemeProvider, Toaster | `app/layout.tsx` |
| Dashboard layout | Auth gate, Sidebar, main overflow-hidden, ChatPanel/MailPanel wrappers | `app/(dashboard)/layout.tsx` |
| tRPC handler | Next.js API route that mounts the appRouter | `app/api/trpc/[trpc]/route.ts` |
| appRouter | Composes all sub-routers, exports AppRouter type | `server/routers/root.ts` |
| db singleton | Prisma + PrismaPg pool, global dev singleton | `server/db.ts` |
| acc-hot-cache | In-process BulkAccUser cache keyed by input flags | `lib/server/acc-hot-cache.ts` |
| acc-route-hydration | Creates server-side helpers; prefetches tRPC for RSC pages | `lib/server/acc-route-hydration.ts` |
| EChart (canonical) | theme-aware ReactECharts wrapper (resolvedTheme + mergeEChartsTheme) | `components/ui/EChart.tsx` |
| PremiumSurface | 4-variant card primitive (base/float/glass/inset) | `components/ui/PremiumSurface.tsx` |
| DrillSheet | Right-slide 480px panel shell for all four workshop pages | `components/ui/DrillSheet.tsx` |
| DataTable | TanStack Table wrapper with virtualization | `components/ui/DataTable.tsx` |
| mergeEChartsTheme | Pure fn — injects zinc palette into EChartsOption | `lib/colors/echartsTheme.ts` |

## Pattern Overview

**Overall:** Next.js App Router RSC → async server fetch → client boundary hydration

**Key Characteristics:**
- Pages are async RSC. They call `lib/server/*View` helpers directly (no tRPC), then pass data as props into client components. `/users` (and the dashboard layout) call `lib/server/acc-route-hydration.ts` to prefetch tRPC, then hydrate via `<HydrationBoundary>`; `/users/spatial-graph` instead fetches one binary payload client-side (v2.7).
- tRPC routers (`server/routers/`) are the request boundary for all client-side data. Client components call `trpc.<router>.<procedure>` via React Query.
- The dashboard layout owns `overflow-hidden` on `<main>`; individual pages own `h-full overflow-y-auto` (or `h-screen`) for their own scroll context.
- No direct Prisma imports in `components/`. The last legacy exception (`coordinationActions.ts`) was removed in v2.1 Ph10 (BND-01); the ast-grep rule `direct-prisma-in-ui` now returns **0 matches**.

## Layers

**Route Shell Layer:**
- Purpose: Page composition, `metadata`, `dynamic`, and auth
- Location: `app/(dashboard)/<route>/page.tsx`
- Contains: `async` RSC, server data fetch, `<Suspense>` boundaries, `<HydrationBoundary>`
- Depends on: `lib/server/`, tRPC helpers, client boundary components
- Used by: Next.js router

**Client Boundary Layer:**
- Purpose: Interactive UI, React state, tRPC queries
- Location: `app/(dashboard)/<route>/` client components; `components/`
- Contains: `"use client"` components, hooks, `trpc.` calls via React Query
- Depends on: `components/ui/`, `lib/core/trpc`, `lib/colors/`
- Used by: Route shells

**tRPC Router Layer:**
- Purpose: Request boundary, validation (Zod), orchestration
- Location: `server/routers/`
- Contains: `adminProcedure` / `procedure` handlers calling `lib/server/*` or Prisma directly
- Depends on: `server/db.ts`, `lib/server/*`, `lib/acc/*`
- Used by: Client components (React Query), RSC prefetch via `createServerSideHelpers`

**Server Domain Layer:**
- Purpose: Data assembly, transformation, view construction from Prisma
- Location: `lib/server/`, `lib/acc/`
- Contains: `"server-only"` helpers, view builders, hot cache, APS OAuth
- Depends on: `server/db.ts`, `@prisma/client`, `lib/acc/acc-types.ts`
- Used by: tRPC routers, RSC page helpers

**Persistence Layer:**
- Purpose: PostgreSQL access via Prisma
- Location: `server/db.ts`, `prisma/schema.prisma`, `prisma/migrations/`
- Contains: PrismaClient singleton, PrismaPg adapter
- Used by: server domain layer only

## Data Flow

### Primary RSC Page Path (e.g., `/access-analysis`)

1. `app/(dashboard)/access-analysis/page.tsx` renders `<Suspense><MainCharts /></Suspense>`
2. `MainCharts` (RSC) runs a **10-loader eager `Promise.all`** of `lib/server/*View` helpers (instance view, module activity, activity-by-actor, coordination, coverage, terrain projects, timeline, dcCoverage, ingestFreshness, provisionedModules) — each queries Prisma directly
3. **Lazy per-tab loaders** (v2.3): activity-recency, permission-level, permission-users, folder-scoped-activity, issue-funnel, workflow-tools, folder-ranking/detail/action-matrix are passed to the client as server-action **function props** and fetched on first tab activation, keeping first paint on the eager fan-out only
4. Props passed into `<AccessAnalysisCharts>` (client boundary), which owns state + wiring and renders a **6-tab Radix `<Tabs>` layout** (Overview / Roles / Users / Companies / Projects / Compare) — each tab is a sibling `*TabPanel` component
5. Drill interactions open `<DrillSheet>` with `<PeopleDrillList>` or `<FolderPermissionTerrain>`

### Hydrated TanStack Page Path (`/users` — and the dashboard layout)

1. RSC page calls `createAccRouteHelpers()` → `prefetchUsersRouteAccData(helpers)` → multiple `helpers.<router>.<proc>.prefetch()`
2. `<HydrationBoundary state={...}>` serializes cache into HTML
3. Client component (`UsersDirectoryClient`) reads from React Query cache — no re-fetch on mount
4. Subsequent user interactions trigger `trpc.<proc>.useQuery()` calls with stale-while-revalidate

**v2.7 change:** `/users/spatial-graph` is **no longer on this path**. `prefetchAccessAnalysisRouteData` was retired with the instance graph (Ph39 ACT-03) — the activity universe fetches its payload client-side as one binary artifact (see below). Only two `<HydrationBoundary>` call sites remain: `app/(dashboard)/layout.tsx` and `app/(dashboard)/users/page.tsx`.

**superjson hydration trap (v2.4 PERF-04 → v2.5 PERF-05 closed everywhere):** `createServerSideHelpers({ transformer: superjson })` makes `helpers.dehydrate()` return a superjson-**wrapped** `{ json, meta }` envelope (a pages-router idiom). App Router's `<HydrationBoundary>` expects a **raw** `DehydratedState`, so passing the wrapper hydrates nothing and the client silently re-fetches the multi-MB payload on mount.
- **Fixed at the shared boundary (v2.5 Ph33, commit e7e14e64):** `lib/server/hydrationState.ts` exports `deserializeHydrationState()` (guards on the `{ json }` shape). Both surviving call sites use it: `app/(dashboard)/layout.tsx` and `app/(dashboard)/users/page.tsx` (the spatial-graph boundary was removed with the instance graph in v2.7). Any NEW `<HydrationBoundary>` must wrap `helpers.dehydrate()` in `deserializeHydrationState()`.

### Activity Universe Path (`/users/spatial-graph` → `ActivityUniverseShell`) — v2.7, SHIPPED

The v2.5/v2.6 user×project **instance graph was retired in v2.7 Ph39** (−8,936 lines: `AccessAnalysisShell.tsx`, `GraphCanvas.tsx`, `GraphCanvas3D.tsx`, `GraphInteractions.tsx`, `SelectionContext.tsx`, `CatalogSliderSidebar.tsx`, `similarityWeb.ts`, `SimilarityWebOverlay.tsx`, `NeighborMatchesPanel.tsx`, `RightPanelStack.tsx`, `lasso3d.ts` all deleted). The served spatial-graph surface is now the **activity universe**: one node per extracted activity event (~4.9M events, author coverage 94.41%).

1. `app/(dashboard)/users/spatial-graph/page.tsx` is a thin shell — **no tRPC prefetch, no `<HydrationBoundary>`** — rendering `AccessAnalysisShellClient`
2. `AccessAnalysisShellClient` dynamic-imports `ActivityUniverseShell` (`activity/ActivityUniverseShell.tsx`, ssr:false). `PersonGraph3D` (3D embedding projector) survives as an opt-in variant behind `NEXT_PUBLIC_ACC_PERSON_GRAPH=1` (`graphVariant.ts`)
3. `useActivityUniversePayload.ts` fetches the payload client-side as **one binary columnar artifact** from `/api/activity-universe/payload` (`?meta=1` first, then the bin; one fetch per mount lifetime). Artifact pair lives under gitignored `.embedding/` (`activity-universe.bin` + `-meta.json`, ~149.7 MB), owned by `lib/server/activityUniversePayload.ts` and (re)built by `scripts/build-activity-universe-payload.ts` after each embedding-pipeline run
4. **LOD tiering** (`activity/lodSample.ts`, pure): far zoom renders a deterministic uniform stride sample capped at `LOD_CAP = 200_000` of the 4.9M rows; zooming in flips to exact viewport membership when the visible region fits the cap. Every rendered-subset builder returns the renderedIndex→fullIndex mapping so hover/click/lasso resolve against the full corpus
5. **8-dimension sidebar** (`activity/ActivityDimensionsPanel.tsx` over `activity/activityDimensions.ts`): verb, module, objectType, month, role (author role), company (author company), project, author — group-by layout via `activityGroupLayout.ts`, color-by via `activityColorBy.ts`/`moduleColors.ts`
6. **GPU morph is cosmos-native** (`activity/activityMotion.ts`): cosmos.gl v3.3's built-in transition (`render(undefined, durationMs)`; config `transitionDuration` stays 0) morphs the current set; ambient idle motion animates a decimated subset only (`AMBIENT_SUBSET_CAP = 100_000`, reuses `ambientMotion.ts`'s FPS controller; reduced-motion → fully static). Ambient is stopped BEFORE any point-set flip and suspended during morphs
7. **Exact-month temporal scrubber** (Ph41, f2c7bad8): month selection keeps the payload resident and swaps only the current full-index set; "All" is explicit `null`, never a fake month id; autoplay honors reduced-motion
8. **Same-author links** (22633278): `activity/activityGraphData.ts` builds bounded same-author chains in rendered-index space; `GraphCanvas2D` draws them from the interpolated position texture so links **ride GPU morphs**; `linkVisibilityDistanceRange` is widened to `[80, 1200]` (cosmos's default hides long links)
9. Rendering is `GraphCanvas2D` (cosmos.gl) + `LassoOverlay` + `MapClusterLabels`; detail via `ActivityTooltip` + `ActivityDetailRail`; e2e state bridge via `activity/activityTestBridge.ts` (`tests/e2e/activity-universe-hard-gate.spec.ts`)

**GraphCanvas2D frozen-path framing (c998db1e):** on the activity/frozen path, cosmos `fitView*` APIs are **unusable** (corrupted store scales — stale GPU bbox). `GraphCanvas2D` disables `fitViewOnInit` when `physics.frozen`, forces `resizeCanvas(true)` after init, and owns an **empirical screen-space fit**: probe the rendered screen bbox and correct the camera from measurements, never from cosmos's fit tween.

**Surviving v2.5 pieces:** `ambientMotion.ts` (FPS controller consumed by `activityMotion.ts`), `whySimilar.ts`, `physicsLayer.ts`/worker + `SliderContext`/`FilterContext`/`usePredicateEngine` (retained in-tree; no longer wired to a served graph shell — `GraphCanvas2D` still accepts a `physics` handle and the frozen path is what the activity universe uses). Instance embeddings are fully retired (c28cb962): `accDcGraph` is down to `dataVersion`/`bulkUsers`/`bulkUser`, the `AccInstanceEmbedding` model is dropped from `prisma/schema.prisma` (migration `2026-07-21-drop-acc-instance-embedding.sql`), and `scripts/build-instance-features.ts` / `compute_instance_embeddings.py` are deleted. The offline pipeline is now activity-based: `scripts/compute_activity_embeddings.py` + `AccActivityEmbedding` model + `scripts/build-activity-author-attributes.ts`.

**State Management:**
- `/access-analysis` RSC page: all state local to `AccessAnalysisCharts` via React `useState` (no Zustand)
- `/users` directory: Zustand store (`useUsersDirectoryStore`) for filters + selected row; TanStack Query for server data
- `/users/spatial-graph` activity universe: local React state inside `ActivityUniverseShell` (selected month, group-by dimension, color-by, author search/selection, lasso, LOD tier) over the resident columnar payload — no context providers, no Zustand

## Key Abstractions

**PhysicsLayer + MASK Bus (`physicsLayer.ts`):**
- Purpose: d3-force-3d simulation driving node positions as Float32Array. Two independent buses: PHYSICS (simulation) and MASK (alpha/visibility). `setMask()` must never touch the simulation.
- Location: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Used by: `GraphCanvas2D` (accepts a `physics` handle; the activity universe uses the **frozen** path), `SliderContext`, `usePredicateEngine`. Its former shell consumers (`AccessAnalysisShell`, `GraphCanvas`, `GraphInteractions`) were deleted in v2.7 Ph39 — the live simulation path has no served page consumer at HEAD.

**DimensionCatalog (`dimensionCatalog.ts`):**
- Purpose: Single source of truth for the full graph dimension vocabulary (structural + ACC taxonomy actions + folder dims). Pure.
- Location: `app/(dashboard)/users/access-analysis/dimensionCatalog.ts`
- Sub-modules: `dimensionCatalog.structural.ts`, `dimensionCatalog.actions.ts`, `dimensionCatalog.folder.ts`, `dimensionCatalog.folderLive.ts`
- Built from: `accTaxonomy.ts` → `accTaxonomyStatic.ts` + `accTaxonomyActions.generated.ts`
- **v2.4 widening:** the catalog preview vocabulary is **208 entries** (pinned by `catalogSliders.test.ts`); v2.4 exposed **205 of 208** already-computed dimensions as user-facing group-by/color-by/slider targets. Supporting modules survive at HEAD: `catalogSliders.ts`, `catalogSearch.ts`, `catalogTargets.ts`, `groupByDimensions.ts` + `GroupByControls.tsx`, `activeGrouping.ts`, `dimensionCoverage.ts`, `dimensionIdSpace.ts`, `DimensionFilterPopover.tsx`. **v2.7 note:** the catalog's primary served consumer (the instance-graph `CatalogSliderSidebar`) was deleted in Ph39 — the served activity universe uses its own much smaller 8-dimension vocabulary (`activity/activityDimensions.ts`), and the 208-entry catalog remains in-tree for the analytics surfaces.
- **`dimensionRegistry.ts` / `dimensionGroups.ts` are NOT dead:** the registry still owns the runtime slider/physics dimension set — imported at HEAD by `SliderContext.tsx`, `nodeColors.ts`, `featureTargets.ts`, `bucketedColors.ts`, `sliderPresets.ts`, `featureSnapshot.ts`, `dimensionSearch.ts`, `dimensionWeights.ts`, and `dimensionCatalog.structural.ts` itself (the deleted `AccessAnalysisShell.tsx` importer is gone). Catalog = full vocabulary; registry = runtime slider subset.

**accTaxonomy (`accTaxonomy.ts`):**
- Purpose: ACC action/module/group taxonomy canonical lookups. Source of truth for 9 modules, ~176 actions. `GENERATED_ACTIONS` come from `accTaxonomyActions.generated.ts`.
- Location: `app/(dashboard)/users/access-analysis/accTaxonomy.ts`

**NodeFeatureSnapshot (`interactionTypes.ts`):**
- Purpose: Per-node typed record (activityBucket, membershipBucket, recencyBucket, riskFlags, moduleIds, permTier, etc.) built from BulkAccUser or DuckDB. Fed to predicate engine and dimension catalog.
- Location: `app/(dashboard)/users/access-analysis/interactionTypes.ts`

**buildFeatureSnapshot / graphNodesFromUsers:**
- Purpose: `buildFeatureSnapshot` reads Arrow tables from DuckDB-Wasm; `buildGraphNodesFromUsers` builds the same snapshot from hydrated BulkAccUser (no DuckDB). Both produce aligned `nodeIds[] + features[]`.
- Files: `featureSnapshot.ts`, `graphNodesFromUsers.ts`

**FilterContext / MASK bus:**
- Purpose: Client-side multi-dim filter state (chips, search, drillDown). Persisted in localStorage. Drives `usePredicateEngine` which calls `physics.setMask()`.
- Location: `app/(dashboard)/users/access-analysis/FilterContext.tsx`
- VERIFY: accessFacets (risk/perm facets) are seeded into FilterContext but do not have CatalogDimension descriptors — P7 pattern.

**AccessAnalysisCharts (cross-filter hub):**
- Purpose: Owns all `/access-analysis` page state — cross-filters, `selected` project set, active tab, drill sheet. Since v2.3 it is **state + wiring only**: rendering is delegated to six sibling tab panels (`OverviewTabPanel`, `RolesTabPanel`, `UsersTabPanel`, `CompaniesTabPanel`, `ProjectsTabPanel`, `CompareTabPanel`) under a Radix `<Tabs>` root, with `ProjectPicker` + `FilterBanner` pinned above.
- Location: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`

**PremiumSurface / DrillSheet / EChart (UI primitives):**
- `PremiumSurface` (`components/ui/PremiumSurface.tsx`): 4-variant depth card. RSC-safe.
- `DrillSheet` (`components/ui/DrillSheet.tsx`): shared right-slide panel for all four pages.
- `EChart` (`components/ui/EChart.tsx`): canonical theme-aware wrapper — reads `resolvedTheme` via `useTheme()`, calls `mergeEChartsTheme` (pure), forces canvas remount on theme change.
- Local EChart at `app/(dashboard)/access-analysis/components/EChart.tsx` is the legacy location; canonical is `components/ui/EChart.tsx`.

**acc-hot-cache / BulkAccUser:**
- Purpose: In-process cache of assembled DC snapshot users, keyed by input flags (leanProjects, includePermissionSummary, includeActivityMix). Avoids repeated multi-table Prisma joins on tRPC procedure calls.
- Location: `lib/server/acc-hot-cache.ts`
- Source: `accDcGraph.bulkUsers` tRPC procedure → `getCachedAccDcBulkUsers(db, input)`
- **v2.2 update (Ph18/Ph19):** `includePermissionSummary` now reads the materialized `AccFolderPermissionSummary` projection (per project×role: `folderCount`, `totalBytes`, `permTypes[]`) instead of aggregating the ~6M-row `AccFolderPermission` table. The raw `includePermissionContexts` path **throws** unless `ACC_ALLOW_RAW_PERMISSION_SCAN=1`. The projection refreshes in the dc-daily-ingest cron success branch (Ph19 PROJ-03).

**folderPermQuery (shared join owner, v2.2 Ph15):**
- Purpose: Single owner of the base `AccFolderPermission ⋈ AccRole ⋈ AccFolder` join for terrain/role analytics. `loadFolderPermRows(projectId, {l2Only?})` with two byte-identical tagged-template branches: all-folders (template-mty consumers) and `l2Only` (access-analysis terrain). Single-use queries must not be added here.
- Location: `lib/server/folderPermQuery.ts`
- Used by: `lib/server/folderPermissionTerrainView.ts`, `templateFolderTerrain.ts`, `templateRoleTree.ts`, `templateRoleSimilarity.ts`, `templateView.ts`

**Post-split module families (v2.2 Ph16–17):**
- `/access-analysis` 3D terrain: `FolderPermissionTerrain.tsx` (thin, 212 lines) + `TerrainStage.tsx`, `TerrainControls.tsx`, `TerrainReveal.tsx`, `terrainViewModel.ts`, `useFolderPermissionTerrainCamera.ts`; terrain math split into `folderTerrainCamera.ts` / `folderTerrainLayout.ts` / `folderTerrainModel.ts` / `folderTerrainScene.ts` (all ≤400 lines).
- `/users/access-analysis`: `HybridAnalyticsSurface.tsx` reduced to a thin shell over `useHybridAnalytics.ts` (data/queries) + `hybridAnalyticsTransforms.ts` (pure transforms) + view/panel/drilldown modules.
- All splits are pinned by byte-identical characterization tests (v2.1 Ph14 + TEST-02/03).

**DuckDB-Wasm client (`duckdbClient.ts`):**
- Purpose: Browser-side DuckDB singleton for Arrow table queries (featureSnapshot, graphSql). Self-hosted WASM bundles under `/public/duckdb-wasm/`.
- Location: `app/(dashboard)/users/access-analysis/duckdbClient.ts`

## Entry Points

**`/access-analysis` route (ECharts charts page — NOT the spatial graph):**
- Location: `app/(dashboard)/access-analysis/page.tsx`
- Pattern: async RSC (`dynamic = "force-dynamic"`) → `<Suspense><MainCharts /></Suspense>` → 10 eager parallel `lib/server/*View` helpers + lazy per-tab server-action loaders → `AccessAnalysisCharts` client component (6-tab layout)

**`/users` route:**
- Location: `app/(dashboard)/users/page.tsx`
- Pattern: RSC prefetch via `prefetchUsersRouteAccData` → `deserializeHydrationState(helpers.dehydrate())` → `<HydrationBoundary>` → `UsersDirectoryClient` (Zustand + DataTable). Hydration miss fixed in v2.5 Ph33 (see Data Flow).

**`/users/spatial-graph` route (activity universe since v2.7):**
- Location: `app/(dashboard)/users/spatial-graph/page.tsx`
- Pattern: thin `h-screen` shell → `AccessAnalysisShellClient` → dynamic `ActivityUniverseShell` (ssr:false). **No tRPC prefetch, no `<HydrationBoundary>`** — the 4.9M-event payload arrives as one binary artifact via `GET /api/activity-universe/payload` (`app/api/activity-universe/payload/route.ts`). Route-level `loading.tsx` skeleton. Opt-in `PersonGraph3D` projector variant behind `NEXT_PUBLIC_ACC_PERSON_GRAPH=1`.

**`/users/access-analysis` route (redirect only):**
- Location: `app/(dashboard)/users/access-analysis/page.tsx`
- Pattern: `redirect("/users/spatial-graph")` — the directory hosts the graph *module* (~274 committed files incl. the `activity/` subdirectory), but the served route is `/users/spatial-graph`. Do not conflate this directory with the top-level `/access-analysis` charts page.

**`/template-mty` route:**
- Location: `app/(dashboard)/template-mty/page.tsx`
- Pattern: async RSC → `Promise.all([loadTemplateOverview, loadTemplateFolderTerrain, loadTemplatePermissionAccess, loadTemplateRoleTree, loadTemplateRoleSimilarity])` → `TemplateAnalysisCharts`

**`/forma-proposal` route:**
- Location: `app/(dashboard)/forma-proposal/page.tsx`
- Pattern: async RSC → `loadFormaFolderTree()` → `FormaProposalClient` (hierarchy/org editor, d3 layout, R3F accent)

## Architectural Constraints

- **Page scroll ownership:** Dashboard `<main>` is `overflow-hidden`. Pages own their own scroll via `h-full overflow-y-auto` (or `h-screen` for spatial-graph). Never use `min-h-screen` on page content.
- **ECharts theme resolution:** `resolvedTheme` from `useTheme()` must be read in the client wrapper; `mergeEChartsTheme` (pure) injects palette. Use `key={resolvedTheme}` to force canvas remount on switch.
- **No Prisma in UI:** `components/` and client-rendered `app/` components must not import `server/db.ts` or `@prisma/client`. Data comes via tRPC or RSC props.
- **No new WebGL on data surfaces:** R3F/Three.js is approved only for `/users` header accent (`HeaderParticleAccent`) and `/forma-proposal` background (`FormaParticleAccent`). The approved existing graph exceptions on `/users/spatial-graph` are cosmos.gl (WebGL) inside `GraphCanvas2D` and the opt-in Three.js `PersonGraph3D` projector (`GraphCanvas3D` was deleted in v2.7 Ph39).
- **MASK bus invariant:** `physics.setMask()` must never call `sim.restart()` or modify the d3-force-3d simulation. Violating this causes filter chips to reheat the graph.
- **BULK_USERS_LEAN_INPUT:** The exact same input object reference is shared between RSC prefetch and client query to guarantee React Query cache hits. Defined in `app/(dashboard)/users/useUsersDirectoryData.ts`.
- **AccDcRole is permanently empty:** DC never delivers `admin_roles.csv`. Role names must be sourced from `AccRole` (live API) via `mergeRoleNames` in `lib/server/accessInstanceView.ts`.
- **Thread model:** Single-threaded event loop for all UI. Physics runs in a web worker via `physicsLayerWorker.ts`. DuckDB-Wasm runs in a web worker via its own bundle.

## Anti-Patterns

### Route-owned shared logic — ✅ resolved (v2.1 Ph10 BND-02)
**What happened:** `moduleOverrides.ts` was imported by diagnostic `scripts/`. The pure classification logic now lives in `lib/acc/activityClassification.ts` and scripts import from `lib/`. Keep new shared logic in `lib/` from the start; a subset of lib→app edges remains documented-deferred in `CONCERNS.md` (BND-03 groups 2–3).

### Direct Prisma in UI — ✅ resolved (v2.1 Ph10 BND-01)
**What happened:** The single `direct-prisma-in-ui` match (`app/(dashboard)/access-analysis/coordinationActions.ts`) was moved behind `server/routers/acc-coordination.ts`. The rule now returns 0 matches — keep it that way.

### Expanding lean payload
**What happens:** `accDcGraph.bulkUsers` with `leanProjects:true` empties per-project `roles[]` and `modules[]`; new consumers that need those fields unknowingly get empty arrays.
**Why it's wrong:** Silently produces zero counts for roles/modules in profile panels.
**Do this instead:** New consumers that need full per-project data must call `accDcGraph.bulkUser` (single user, full) or use the non-lean endpoint.

## Error Handling

**Strategy:** Suspense + error boundaries at route and component level.

**Patterns:**
- RSC pages wrap async children in `<Suspense fallback={<SkeletonComponent />}>` (see `access-analysis/page.tsx`, `users/page.tsx`)
- `components/ui/panel-error-boundary.tsx` provides per-panel boundaries for chart sections
- tRPC procedure errors surface via React Query `error` state; no global error toast for data failures

## Cross-Cutting Concerns

**Logging:** `lib/server/logger.ts` (server-only). Client uses `console.*` (no-console-log ast-grep matches are a review queue, not auto-delete; 123 was the 2026-06-19 point-in-time count — v2.1 Ph12 observability work removed the stale `TODO[02.5]` guards).
**Validation:** Zod schemas on tRPC procedure inputs (`z.object(...)` in each router).
**Authentication:** NextAuth.js (`server/auth.ts`). Dashboard layout redirects unauthenticated requests. `DualAuthGuard` provides in-tree session guard. APS OAuth is separate (`lib/server/aps-oauth.ts`, `lib/server/aps-user-token.ts`).
**Theme:** `next-themes` `ThemeProvider` in root layout. CSS variables (`--foreground`, `--background`, `--primary`, etc.) on `:root` / `.dark`. Background anchor is `#09090B` in dark mode (zinc-950). Components must use semantic vars, not hardcoded zinc values.

---

## Dashboard Self-Check

- **Context:** architecture-summary.md (2026-07-21, gate passing), `git show HEAD:` for root.ts / spatial-graph page / AccessAnalysisShellClient / ActivityUniverseShell / GraphCanvas2D / activityDimensions / lodSample / activityMotion / activityUniversePayload / acc-dc-graph / schema.prisma; v2.7 commit log f2c7bad8..c998db1e; `git status --short` for the working-tree WIP.
- **Evidence:** All paths and routers verified at HEAD via `git ls-files` / `git cat-file -e` / `git grep` — 24 tRPC routers from `root.ts` (incl. `activityUniverse`); Ph39 deletions confirmed per-file (AccessAnalysisShell, GraphCanvas/3D, GraphInteractions, SelectionContext, CatalogSliderSidebar, similarityWeb, SimilarityWebOverlay, NeighborMatchesPanel, RightPanelStack, lasso3d all GONE at HEAD); `LOD_CAP = 200_000` and `AMBIENT_SUBSET_CAP = 100_000` read from source; 8 activity dimensions enumerated from `activityDimensions.ts`; `linkVisibilityDistanceRange: [80, 1200]` and empirical-fit comments read from `GraphCanvas2D.tsx`; two remaining `deserializeHydrationState` boundaries confirmed by grep; `AccInstanceEmbedding` absent from HEAD schema, `AccActivityEmbedding` present.
- **Constraints:** zinc theme, MASK bus invariant, no-Prisma-in-UI, page scroll ownership documented explicitly.
- **Gates:** No compilation run (map-only artifact). `npx tsc --noEmit` required before any edits.
- **VERIFY:** the exact 3 unexposed dimensions in the 205-of-208 v2.4 split (count from milestone close; not re-derived from source). Payload size 149.7 MB and coverage 94.41% are from the Ph38 milestone record (`.embedding/` artifacts are gitignored, not re-measured here).

*Architecture analysis: 2026-06-23; targeted refresh 2026-07-22 (post v2.7 Activity Universe Ph40–41 + perf fix c998db1e; committed HEAD primary, access-analysis redesign WIP in working tree)*
