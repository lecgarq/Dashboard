<!-- refreshed: 2026-07-16 -->
# Architecture

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-16 — targeted post-v2.3 (charts/panels) + v2.4 (spatial-graph dimension widening) update; repo-map basis 2026-07-14 (gate passing)

> **In-flight note (2026-07-16):** branch `feat/access-analysis-redesign` carries ~222 uncommitted working-tree entries (a `/users` directory redesign that deletes `PersonCard.tsx`, `PersonRow.tsx`, `PersonDetailModal.tsx`, etc.). This document describes the **committed** architecture; do not treat working-tree deletions/edits as landed.

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
│  accSync      accCoordination  users   project     clash     lod             │
│  gmail/calendar  chat      kpi         workspace   ...       (23 routers)    │
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
- Pages are async RSC. They call `lib/server/*View` helpers directly (no tRPC), then pass data as props into client components. For ACC graph pages they call `lib/server/acc-route-hydration.ts` to prefetch tRPC, then hydrate via `<HydrationBoundary>`.
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

### Hydrated TanStack Page Path (e.g., `/users`, `/users/spatial-graph`)

1. RSC page calls `createAccRouteHelpers()` → `prefetch*RouteData(helpers)` → multiple `helpers.<router>.<proc>.prefetch()`
2. `<HydrationBoundary state={...}>` serializes cache into HTML
3. Client component (`UsersDirectoryClient`, `AccessAnalysisShellClient`) reads from React Query cache — no re-fetch on mount
4. Subsequent user interactions trigger `trpc.<proc>.useQuery()` calls with stale-while-revalidate

**superjson hydration trap (v2.4 PERF-04):** `createServerSideHelpers({ transformer: superjson })` makes `helpers.dehydrate()` return a superjson-**wrapped** `{ json, meta }` envelope (a pages-router idiom). App Router's `<HydrationBoundary>` expects a **raw** `DehydratedState`, so passing the wrapper hydrates nothing and the client silently re-fetches the multi-MB payload on mount. Fix: `superjson.deserialize(dehydrated)` before the boundary, guarded on the `{ json }` shape.
- **Fixed:** `app/(dashboard)/users/spatial-graph/page.tsx` (commit 9fb54cb8)
- **Still raw (live hydration miss):** `app/(dashboard)/layout.tsx` (6 layout-level prefetches) and `app/(dashboard)/users/page.tsx` — both pass `helpers.dehydrate()` straight to `<HydrationBoundary>`

### 3D Physics Graph Path (`/users/spatial-graph` → `AccessAnalysisShell`)

1. Page prefetches `accDcGraph.bulkUsers` (full, with permissionSummary + activityMix) + `accMembers.enrichedUsers` + `accActivity.lastFileActivityByEmailAll`
2. `AccessAnalysisShellClient` dynamic-imports `AccessAnalysisShell` (ssr:false)
3. `AccessAnalysisShell` on mount:
   - Calls `buildGraphNodesFromUsers` (pure, no DuckDB) from hydrated `BulkAccUser[]` → `nodeIds[]` + `features[]`
   - OR calls DuckDB `buildFeatureSnapshot()` from in-browser Arrow tables
   - Builds `dimensionCatalog` from `buildDimensionCatalog(features)` → drives `CatalogSliderSidebar`
   - Creates `PhysicsLayer` (d3-force-3d, pure TS, web worker) → `physicsLayerWorker.ts`
   - Passes `physics` + pre-computed `nodeColors`, `nodeSizes` into `<GraphCanvas>`
4. `GraphCanvas` renders `GraphCanvas3D` (Three.js `InstancedMesh` + OrbitControls) and `GraphCanvas2D` (cosmos.gl) behind CSS visibility swap
5. `GraphInteractions` wraps `GraphCanvas` — owns hover/click via `setEventHandlers`, `LassoOverlay`, `usePredicateEngine`
6. `usePredicateEngine` is the ONLY channel that calls `physics.setMask()` — filter/search/lasso/drill never restart the simulation
7. `SliderContext` (localStorage-persisted) calls `physics.updateSliders(normalized 0..1)` via rAF coalescing

**State Management:**
- `/access-analysis` RSC page: all state local to `AccessAnalysisCharts` via React `useState` (no Zustand)
- `/users` directory: Zustand store (`useUsersDirectoryStore`) for filters + selected row; TanStack Query for server data
- `/users/spatial-graph` graph: `SliderContext` (sliders, persisted), `FilterContext` (chips + search, persisted), `SelectionContext` (lasso result); physics MASK bus is the bridge between filter state and render

## Key Abstractions

**PhysicsLayer + MASK Bus (`physicsLayer.ts`):**
- Purpose: d3-force-3d simulation driving 16k+ node positions as Float32Array. Two independent buses: PHYSICS (simulation) and MASK (alpha/visibility). `setMask()` must never touch the simulation.
- Location: `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- Used by: `AccessAnalysisShell`, `GraphCanvas`, `GraphInteractions`

**DimensionCatalog (`dimensionCatalog.ts`):**
- Purpose: Single source of truth for the full graph dimension vocabulary (structural + ACC taxonomy actions + folder dims). Pure.
- Location: `app/(dashboard)/users/access-analysis/dimensionCatalog.ts`
- Sub-modules: `dimensionCatalog.structural.ts`, `dimensionCatalog.actions.ts`, `dimensionCatalog.folder.ts`, `dimensionCatalog.folderLive.ts`
- Built from: `accTaxonomy.ts` → `accTaxonomyStatic.ts` + `accTaxonomyActions.generated.ts`
- **v2.4 widening:** the catalog preview vocabulary is **208 entries** (pinned by `catalogSliders.test.ts`); v2.4 exposed **205 of 208** already-computed dimensions as user-facing group-by/color-by/slider targets (an unlock, not a rebuild — the prior UI capped at 3 presets: User/Project/Role). Supporting modules: `catalogSliders.ts` (lazy-loaded preview), `catalogSearch.ts`, `catalogTargets.ts`, `groupByDimensions.ts` + `GroupByControls.tsx`, `activeGrouping.ts`, `dimensionCoverage.ts`, `dimensionIdSpace.ts`, `DimensionFilterPopover.tsx`.
- **`dimensionRegistry.ts` / `dimensionGroups.ts` are NOT dead** (resolves prior VERIFY): the registry still owns the runtime slider/physics dimension set — imported by `SliderContext.tsx`, `AccessAnalysisShell.tsx`, `nodeColors.ts`, `featureTargets.ts`, `bucketedColors.ts`, `sliderPresets.ts`, `featureSnapshot.ts`, and `dimensionCatalog.structural.ts` itself. Catalog = full vocabulary; registry = runtime slider subset.

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
- Pattern: RSC prefetch via `prefetchUsersRouteAccData` → `<HydrationBoundary>` → `UsersDirectoryClient` (Zustand + DataTable). Passes raw `helpers.dehydrate()` — known live superjson hydration miss (see Data Flow).

**`/users/spatial-graph` route:**
- Location: `app/(dashboard)/users/spatial-graph/page.tsx`
- Pattern: RSC prefetch via `prefetchAccessAnalysisRouteData` → `superjson.deserialize(helpers.dehydrate())` → `<HydrationBoundary h-screen>` → `AccessAnalysisShellClient` → dynamic `AccessAnalysisShell` (ssr:false). Route-level `loading.tsx` skeleton.

**`/users/access-analysis` route (redirect only):**
- Location: `app/(dashboard)/users/access-analysis/page.tsx`
- Pattern: `redirect("/users/spatial-graph")` — the directory hosts the graph *module* (~150 committed files), but the served route is `/users/spatial-graph`. Do not conflate this directory with the top-level `/access-analysis` charts page.

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
- **No new WebGL on data surfaces:** R3F/Three.js is approved only for `/users` header accent (`HeaderParticleAccent`) and `/forma-proposal` background (`FormaParticleAccent`). The 3D graph on `/users/spatial-graph` is Three.js inside `GraphCanvas3D`, which is the approved existing exception.
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

- **Context:** architecture-summary.md (2026-07-14, gate passing), root.ts, page.tsx/layout.tsx for the workshop routes, `mainCharts.tsx`, and key spatial-graph modules read directly from committed source; 2026-07-16 refresh grounded in v2.3/v2.4 milestone artifacts.
- **Evidence:** All paths, routers, components, and patterns verified from source files (`git ls-files` for committed truth on the WIP-heavy tree). 23 tRPC routers verified from `server/routers/root.ts` (incl. `accCoordination`). superjson hydration state verified per-file (spatial-graph/page.tsx fixed; layout.tsx + users/page.tsx still raw). 208-entry catalog vocabulary verified from `catalogSliders.test.ts`.
- **Constraints:** zinc theme, MASK bus invariant, no-Prisma-in-UI, page scroll ownership documented explicitly.
- **Gates:** No compilation run (map-only artifact). `npx tsc --noEmit` required before any edits.
- **Resolved prior VERIFY:** `dimensionRegistry.ts` / `dimensionGroups.ts` remain actively imported (SliderContext, nodeColors, featureTargets, etc.) — registry is the runtime slider subset, not dead legacy.
- **VERIFY:** the exact 3 unexposed dimensions in the 205-of-208 v2.4 split (count from milestone close; not re-derived from source).

*Architecture analysis: 2026-06-23; targeted refresh 2026-07-16 (post v2.3 New Graphs + v2.4 Spatial Graph Dimensions)*
