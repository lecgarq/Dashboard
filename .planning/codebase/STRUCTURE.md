<!-- refreshed: 2026-07-23 -->
# Codebase Structure

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-23 — post-v2.7 "Activity Universe" **plus the 2D/3D universe arm** (77e55c05..7d1420b9) and the admins-per-project chart (e8541e12), described against **committed HEAD** `7d1420b9` on `feat/access-analysis-redesign`; repo-map basis 2026-07-23 17:43 (gate passing, 1150 modules)

> **In-flight WIP note (2026-07-23):** the working tree still carries the access-analysis redesign. At HEAD the following **exist** but are **deleted in the working tree**: `app/(dashboard)/users/` `PersonCard.tsx`, `PersonRow.tsx`, `PersonRowList.tsx`, `PersonDetailModal.tsx`, `ActivityAuditPanel.tsx`, `CollapsibleGroup.tsx`, `DirectoryListHeader.tsx`, `ModuleBadge.tsx` (all already unused by the DataTable-driven directory shell at HEAD — the WIP prunes dead card/row presentation); also root `CHANGELOG.md`, `GSD-STYLE.md`, `PROJECT_RULES.md`, `docs/runbook.md`, `scripts/scratch/`, and the `docs/archive/planning/2026-05-18/gsd/` archive. **New uncommitted files:** `lib/acc/activityWeeks.ts(+test)`, `lib/acc/issueBackfillAudit.ts(+test)`, `lib/acc/issueListQuery.ts(+test)`, `lib/acc/modelCoordinationGrant.ts(+test)`, `lib/server/uploadthing.ts`, `docs/activity-module-audit.md`. **Uncommitted modifications** concentrate in `app/(dashboard)/access-analysis/`, `app/(dashboard)/users/access-analysis/` (incl. `activity/ActivityUniverseShell.tsx`, `ActivityUniverse3D.tsx`, `ActivityDimensionsPanel.tsx`, `activityGraphData.ts`, `activityTestBridge.ts`), `lib/acc/`, `lib/server/`, and `scripts/build-activity-universe-payload.ts`. This doc describes HEAD; WIP is flagged inline and never carries a commit hash.

## Directory Layout

```
C:/LECG/Dashboard/
├── app/                         # Next.js App Router — route shells + RSC + API routes
│   ├── (auth)/                  # Auth group: login, register, forgot-password
│   ├── (dashboard)/             # Main product group
│   │   ├── layout.tsx           # Auth gate + Sidebar + main overflow-hidden
│   │   ├── access-analysis/     # /access-analysis — RSC charts dashboard (ECharts, 6 tabs, terrain)
│   │   ├── users/               # /users — directory + spatial-graph module (users/access-analysis/ = graph module dir incl. activity/ universe; its page.tsx redirects to /users/spatial-graph)
│   │   ├── template-mty/        # /template-mty — template analytics
│   │   ├── forma-proposal/      # /forma-proposal — folder/org hierarchy editor
│   │   ├── home/                # /home
│   │   ├── clash-detection/     # /clash-detection
│   │   ├── exam/                # /exam
│   │   ├── families/            # /families
│   │   ├── lod-checker/         # /lod-checker
│   │   ├── settings/            # /settings
│   │   ├── sim-automation/      # /sim-automation
│   │   ├── sync-center/         # /sync-center
│   │   ├── tasks/               # /tasks
│   │   └── trello/              # /trello
│   ├── api/                     # Next.js API routes
│   │   ├── trpc/[trpc]/         # tRPC handler mount point
│   │   ├── activity-universe/   # payload/route.ts — serves the binary activity-universe artifact (v2.7)
│   │   ├── auth/                # NextAuth callback
│   │   ├── chat/                # Chat stream/media/upload
│   │   ├── gmail/               # Gmail attachment proxy
│   │   ├── ai/                  # AI description generation
│   │   └── wiki-media/          # Wiki media upload/serve
│   ├── globals.css              # CSS variables + Tailwind base
│   └── layout.tsx               # Root layout: fonts, TRPCProvider, ThemeProvider
├── components/                  # Reusable UI — no Prisma, no app-route internals
│   ├── ui/                      # Shared primitives (EChart, PremiumSurface, DrillSheet, DataTable, motion)
│   ├── auth/                    # Auth shell, credential banner, dual-auth guard
│   ├── clash/                   # WikiEditor + rich text editor infrastructure
│   ├── dashboard/               # ChatPanel, MailPanel, DashboardCalendar + sub-panels
│   ├── families/                # Family card, BIM viewer, APS browser
│   ├── layout/                  # Sidebar, Header, navigation
│   ├── lod/                     # LOD detail panel
│   ├── providers/               # Session, project, navigation, dashboard-auth providers
│   ├── theme/                   # ThemeProvider, ThemeToggle
│   └── trello/                  # Trello card dialog
├── lib/                         # Shared domain, server, integration, and utility code
│   ├── acc/                     # ACC domain types, DC ingest, activity, analytics, similarity
│   │   ├── acc-types.ts         # BulkAccUser + all shared ACC types
│   │   ├── dcIngest.ts          # Data Connector ETL pipeline (57 KB — candidate for atomization)
│   │   ├── cachePolicy.ts       # ACC_SNAPSHOT_STALE_TIME_MS
│   │   ├── positions3Quant.ts   # u16 quantize/dequantize for the 3D activity embedding column (shared: payload builder ↔ ActivityUniverse3D)
│   │   ├── activityWeeks.ts     # UNCOMMITTED WIP — Monday-anchored UTC week math for the scrubber (shared: builder ↔ client), WEEK_UNKNOWN sentinel
│   │   ├── mty-allowlist.json   # MTY project ID allowlist
│   │   ├── template-mty.ts      # TEMPLATE_MTY_ID / TEMPLATE_MTY_NAME constants
│   │   ├── embedding/           # Person-graph feature/layout helpers (buildPersonFeatures, cosineGraph, kmeans, packedLayout[3D], tfidf) — instance-embedding neighborPayload.ts retired in v2.7 (c28cb962)
│   │   └── __tests__/           # Unit tests for acc helpers
│   ├── server/                  # Server-only view builders + integrations
│   │   ├── acc-route-hydration.ts  # createAccRouteHelpers + prefetch helpers for RSC pages
│   │   ├── hydrationState.ts       # deserializeHydrationState — superjson unwrap for <HydrationBoundary> (v2.5 Ph33)
│   │   ├── acc-hot-cache.ts        # In-process BulkAccUser cache
│   │   ├── accessInstanceView.ts   # DC snapshot → AccessInstance[] + mergeRoleNames
│   │   ├── moduleActivityView.ts   # AccActivity → module rows
│   │   ├── activityTimelineView.ts # Timeline aggregation
│   │   ├── activityByActorView.ts  # Per-actor activity
│   │   ├── coordinationByProjectView.ts
│   │   ├── projectCoverageView.ts
│   │   ├── adminsPerProjectView.ts  # e8541e12: AccProjectMember.projectAdmin ∪ AccDcProjectUserProduct('project_admin') deduped by lowercased email (id spaces do NOT overlap)
│   │   ├── folderPermQuery.ts      # Shared owner of AccFolderPermission ⋈ AccRole ⋈ AccFolder join (v2.2 Ph15)
│   │   ├── folderPermissionTerrainView.ts
│   │   ├── folderActivityView.ts / folderActivityByCompanyView.ts   # v2.3 folder drill views
│   │   ├── activityRecencyView.ts / permissionLevelView.ts / permissionUserView.ts  # v2.3 lazy-tab views
│   │   ├── issueFunnelView.ts / workflowToolsView.ts / projectClashView.ts          # v2.3 issue/workflow/clash views
│   │   ├── dcCoverageView.ts / ingestFreshnessView.ts / provisionedModulesView.ts   # v2.3 coverage/freshness views
│   │   ├── unifiedActivitySource.ts # accds-primary + DC-backfill merged activity source
│   │   ├── activityUniversePayload.ts # v2.7: canonical .embedding/ artifact paths + meta reader shared by builder script and /api/activity-universe/payload (+ activityUniverseTestFixture.ts)
│   │   ├── templateView.ts / templateFolderTerrain.ts / templateRoleTree.ts / templateRoleSimilarity.ts
│   │   ├── formaFolderTree.ts
│   │   ├── integrations/         # ai.ts (OpenAI), aps.ts (Autodesk SDK)
│   │   └── __tests__/
│   ├── colors/                  # ECharts theme + Trello label colors
│   │   └── echartsTheme.ts      # ECHARTS_DARK, ECHARTS_LIGHT, mergeEChartsTheme (pure)
│   ├── core/                    # tRPC client setup, providers, utils
│   │   ├── trpc.ts              # trpc client instance
│   │   ├── providers.tsx        # TRPCProvider (wraps TanStack QueryClientProvider)
│   │   └── utils.ts             # cn() (clsx/tailwind-merge)
│   ├── client/                  # Browser-safe client helpers (particle-zones)
│   ├── forma/                   # Forma proposal domain helpers
│   ├── google/                  # Google API clients (Gmail, Calendar, Drive)
│   ├── modules/                 # Shared module type helpers
│   ├── shared/                  # Cross-domain shared schemas
│   ├── trello/                  # Trello API client
│   └── wiki/                    # Wiki access/media helpers
├── server/                      # API boundary — tRPC routers + auth + db
│   ├── routers/
│   │   ├── root.ts              # appRouter — composes all sub-routers (24)
│   │   ├── acc-dc-graph.ts      # accDcGraph: dataVersion, bulkUsers, bulkUser (graphSnapshot/instanceEmbedding/instanceNeighbors/similarityEdges retired in v2.7)
│   │   ├── activity-universe.ts # activityUniverse: projectNames, eventDetail (hover/click detail lookups; the bulk payload goes via /api/activity-universe/payload, not tRPC) (v2.7)
│   │   ├── acc-coordination.ts  # accCoordination: Model Coordination panel data
│   │   ├── acc-activity.ts      # accActivity: lastFileActivityByEmailAll, timeline, coverage
│   │   ├── acc-members.ts       # accMembers: enrichedUsers, kpi
│   │   ├── acc-folders.ts       # accFolders: folder tree, permissions
│   │   ├── acc-graph.ts         # accGraph: layout cache
│   │   ├── acc-person-graph.ts  # accPersonGraph: person graph snapshot
│   │   ├── acc-sync.ts          # accSync: sync orchestration
│   │   ├── users.ts             # users: getDirectory, getOrgDirectory, folderAccess
│   │   │   users/
│   │   │   ├── acc-graph.ts     # users sub-router: ACC graph helpers
│   │   │   ├── acc-profile.ts   # users sub-router: profile panel data
│   │   │   ├── account.ts       # users sub-router: account management
│   │   │   └── shared.ts        # shared procedure helpers
│   │   ├── chat.ts              # chat tRPC procedures
│   │   ├── gmail.ts             # gmail tRPC procedures
│   │   ├── calendar.ts          # calendar tRPC procedures
│   │   ├── kpi.ts               # kpi (home dashboard stats)
│   │   ├── project.ts           # project CRUD
│   │   ├── families.ts          # families module
│   │   ├── clash.ts             # clash detection wiki/tasks
│   │   ├── lod.ts               # LOD checker
│   │   ├── sim.ts               # sim automation
│   │   ├── exam.ts              # Revit exam
│   │   ├── workspace.ts         # workspace
│   │   ├── trello.ts            # Trello boards
│   │   ├── search.ts            # global search
│   │   └── aps-search.ts        # APS model search
│   ├── auth.ts                  # NextAuth handler (Autodesk/Google OAuth + credentials)
│   ├── db.ts                    # PrismaClient singleton (PrismaPg adapter)
│   └── trpc.ts                  # createTRPCContext, adminProcedure, procedure
├── prisma/
│   ├── schema.prisma            # Full Prisma schema (all Acc*, LOD, auth, project models)
│   └── migrations/              # Prisma migrations
├── scripts/                     # Operational, diagnostic, and repo-map tooling
│   ├── repo-map/                # Repo-map generator + checker (generate.cjs, check.cjs)
│   ├── acc-*.cjs                # ACC member/folder sync scripts
│   ├── dc-*.cjs                 # Data Connector extraction scripts
│   ├── compute_activity_embeddings.py  # v2.7 activity-embedding pipeline (replaces the retired instance pipeline). ae195f00 added a 3D PaCMAP pass writing the RAW table "AccActivityEmbedding3D" (id,x,y,z,embeddingRunId) — created with CREATE TABLE IF NOT EXISTS, NOT a Prisma model
│   ├── build-activity-universe-payload.ts  # Builds .embedding/activity-universe.bin + -meta.json after each pipeline run (v2.7 Ph38). ae195f00 joins AccActivityEmbedding3D via to_regclass probe → quantized positions3 column + positions3HalfExtent dict (skipped on row-count mismatch). UNCOMMITTED WIP: also derives the weekId column + weekFloor/weekCount/weekUnknownCount dicts from source event timestamps
│   ├── build-activity-author-attributes.ts # Author-attribute enrichment (WARN: imports graphNodesFromUsers from app/ — no-scripts-to-app, still open)
│   ├── create-activity-embedding-table.ts  # AccActivityEmbedding table setup
│   ├── diag-activity-service-xtab.cjs  # Diagnostic script (app-import WARN resolved in v2.1 Ph10)
│   └── progress-monitor.cjs     # Standalone progress monitor web app (localhost:4321)
├── services/
│   └── lod-engine/              # Python LOD/image processing service
├── tests/
│   └── e2e/                     # Playwright end-to-end tests
├── hooks/                       # Global React hooks (small — 6 files)
├── adapters/                    # External adapter shims (3 files)
├── types/                       # Global TypeScript declarations
│   └── global.d.ts
├── auth.config.ts               # NextAuth config (providers)
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

## Focus Area: `/access-analysis` (`app/(dashboard)/access-analysis/`)

**Purpose:** Account-wide ACC access & activity dashboard. Pure RSC page with server-aggregated data. **v2.3 rebuilt it into a 6-tab layout** (Overview / Roles / Users / Companies / Projects / Compare) with ~23 panels.

**Key files (committed):**
- `page.tsx` — RSC shell; `dynamic = "force-dynamic"`; `<Suspense><MainCharts /></Suspense>` with `DonutSkeletons` fallbacks; owns `h-full overflow-y-auto`
- `mainCharts.tsx` — async RSC; **eager 10-loader `Promise.all`** (`loadInstanceView`, `loadModuleActivity`, `loadActivityByActor`, `loadCoordinationByProject`, `loadProjectCoverage`, `loadTerrainProjects`, `loadActivityTimeline`, `loadDcCoverage`, `loadIngestFreshness`, `loadProvisionedModules`) + passes **lazy server-action function props** (recency, permission-level, permission-users, folder-scoped activity, issue funnel, workflow tools, folder ranking/detail/matrix) fetched on first tab activation. Fan-out warning threshold ~12 (PITFALLS.md Pitfall 4).
- `loading.tsx` — route-level Suspense fallback skeleton
- `components/AccessAnalysisCharts.tsx` — client hub; **state + wiring only** since v2.3; pins `ProjectPicker` + `FilterBanner` above the Radix `<Tabs>` root
- Tab panels: `OverviewTabPanel.tsx`, `RolesTabPanel.tsx`, `UsersTabPanel.tsx`, `CompaniesTabPanel.tsx`, `ProjectsTabPanel.tsx`, `CompareTabPanel.tsx`
- Chart/panel components (`components/`): `RolesPieChart.tsx`, `CompaniesPieChart.tsx`, `ActivityByRolePieChart.tsx`, `CompaniesActivityPieChart.tsx`, `ModulesPieChart.tsx`, `ActivityTimelineChart.tsx`, `ActivityRecencyChart.tsx`, `ProjectActivityDonut.tsx`, `ProvisionedModulesChart.tsx`, `PermissionLevelChart.tsx`, `PermissionUsersDonut.tsx`, `WorkflowToolDonut.tsx` (Reviews/Transmittals/RFIs/Submittals 2x2), `IssueStatusChart.tsx`, `IssueTypeChart.tsx`, `IssueTimelineChart.tsx`, `IssueFetchCoverageDonut.tsx`, `CoordinationByProject.tsx`, `FolderActivityReveal.tsx`, `FolderActivityByRole.tsx`, `FolderActivityByCompanyChart.tsx`, `FolderActionHeatmap.tsx`, `IngestFreshnessPanel.tsx`, `NoActivityBars.tsx`, `AuthorProfileDrawer.tsx`, `PeopleDrillList.tsx`, `ProjectPicker.tsx`, `FilterBanner.tsx`, `CoverageBadges.tsx`, `ActivityCoverageBadge.tsx`, `PillBar.tsx`, `SectionHeaders.tsx`, `DonutSkeletons.tsx`, **`AdminsPerProjectChart.tsx`** (e8541e12 — Projects tab)
- `components/EChart.tsx` — local legacy EChart wrapper, test-only (canonical is `components/ui/EChart.tsx`)
- 3D terrain (v2.2 Ph16 split): `components/FolderPermissionTerrain.tsx` + `TerrainStage.tsx`, `TerrainControls.tsx`, `TerrainReveal.tsx`, `terrainViewModel.ts`, `useFolderPermissionTerrainCamera.ts`
- Terrain math (v2.2 Ph16 split, since **moved to `lib/acc/`** by BND-03 groups 3+4, commit 116941af): `lib/acc/folderTerrain.ts`, `lib/acc/folderTerrainCamera.ts`, `lib/acc/folderTerrainLayout.ts`, `lib/acc/folderTerrainModel.ts`, `lib/acc/folderTerrainScene.ts`; the route keeps a thin `folderTerrain.ts` entry + `folderTerrainActions.ts`

**Pure transform modules (co-located, route-owned):**
- `roleCounts.ts`, `moduleCounts.ts`, `companyActivityCounts.ts`, `roleActivityCounts.ts`, `companyCounts.ts`, `timelineCounts.ts`, `coordinationCounts.ts`, `coverageCounts.ts`, `dormantActivity.ts`, `folderActivityCounts.ts`, `folderActivityByCompanyCounts.ts`, `activityRecencyCounts.ts`, `permissionLevelCounts.ts`, `permissionFootprintCounts.ts`, `provisionedModulesCounts.ts`, `projectActivityCounts.ts`, `issueFunnelCounts.ts`, `issueTypeCounts.ts`, `issueFetchCoverageCounts.ts`, `workflowToolCounts.ts`, `ingestFreshnessCounts.ts`, `projectFilter.ts`, `projectGroups.ts`, `roleColors.ts`
- Note: `timelineCounts.ts` / `coordinationCounts.ts` are 1-line re-export barrels — the pure logic moved to `lib/acc/` in v2.1 Ph10 (BND-03)

**Server actions (RSC-safe, used by MainCharts):**
- `coordinationActions.ts` (thin delegate to `server/routers/acc-coordination.ts` since Ph10 BND-01), `folderTerrainActions.ts`, `folderActivityActions.ts`, `folderActivityByCompanyActions.ts`, `activityRecencyActions.ts`, `permissionLevelActions.ts`, `permissionUserActions.ts`, `issueFunnelActions.ts`, `workflowToolsActions.ts`, `adminsPerProjectActions.ts` (e8541e12 — `auth()`-gated delegate to `lib/server/adminsPerProjectView.ts`; wired `mainCharts.tsx` → `AccessAnalysisCharts.tsx` → `ProjectsTabPanel.tsx`, fetched once on first Projects-tab activation)

**Resolved (was WARN):** the `moduleOverrides.ts` scripts→app violation was fixed in v2.1 Ph10 (BND-02) — pure classification logic now lives in `lib/acc/activityClassification.ts`.

**Data caveat (v2.3):** `accds` never emits `rfi-`/`submittal-` verbs — the workflow-tool donuts source RFIs/Submittals from Data Connector `AccActivity` only; a naive accds+DC merge undercounts ~20x.

**Tests:** `__tests__/` — Vitest unit tests for the pure transform modules plus characterization pins for the terrain/query splits (TEST-02/03). `page.test.tsx` tests the RSC render.

## Focus Area: `/users` (`app/(dashboard)/users/`)

**Purpose:** ACC member directory (DataTable), profile panels, stat cards, and the nested `access-analysis/` graph module served at `/users/spatial-graph` (the activity universe since v2.7).

**In-flight WIP:** the legacy card/row presentation files (`PersonCard.tsx`, `PersonRow.tsx`, `PersonRowList.tsx`, `PersonDetailModal.tsx`, `ActivityAuditPanel.tsx`, `CollapsibleGroup.tsx`, `DirectoryListHeader.tsx`, `ModuleBadge.tsx`) exist at HEAD but are already unused by `UsersDirectoryClient` (DataTable-driven since Plan 04-03; a comment notes DrillSheet replaced `PersonDetailModal`); the working tree deletes them uncommitted. Do not build on them.

**Key files in `app/(dashboard)/users/` (all verified extant):**
- `page.tsx` — RSC shell; TanStack prefetch via `prefetchUsersRouteAccData`; `deserializeHydrationState(helpers.dehydrate())` → `<HydrationBoundary><UsersDirectoryClient />` (v2.5 Ph33 hydration fix)
- `UsersDirectoryClient.tsx` — client shell; Zustand store + DataTable + DrillSheet + PeekPanel; dynamic-imports `UserProfilePanel` and `DashboardSidePanel`
- `useUsersDirectoryData.ts` — data hook; consumes `accDcGraph.bulkUsers` (lean), `accMembers.enrichedUsers`, `users.getDirectory`, `users.getOrgDirectory`, `accActivity.lastFileActivityByEmailAll`. Defines `BULK_USERS_LEAN_INPUT` — must match RSC prefetch.
- `useUsersDirectoryStore.ts` — Zustand store for filter/selection state
- `UserProfilePanel.tsx` — shared profile panel rendered in DrillSheet; consumes `accDcGraph.bulkUser` (full) for per-project roles/modules
- `directoryTableRow.ts` — builds `DirectoryRow` from `BulkAccUser`
- `DirectoryTableColumns.tsx` — TanStack column defs
- `statCardDetails.ts` + `StatCardDetail.tsx` — stat card click → inline donut/admin-list push-down
- `bulkUserToProfileData.ts` — maps BulkAccUser to profile display shape
- `AccProfileSection.tsx` — profile detail section
- `HeaderParticleAccent.tsx` — R3F particle accent (approved /users surface only)

**`app/(dashboard)/users/access-analysis/` — Graph Module (explicit in-scope):**

**Do not conflate with `app/(dashboard)/access-analysis/`** (the top-level ECharts charts page) — this subdirectory (282 committed files, of which the `activity/` subdirectory is 34) hosts the spatial-graph infrastructure. `/users/spatial-graph` and `/users/access-analysis` are **two route aliases onto ONE shell**: this directory's `page.tsx` is `redirect("/users/spatial-graph")` (kept for old links), and `spatial-graph/page.tsx` imports `AccessAnalysisShellClient` back out of this directory. There is no second render tree to keep in sync.

**v2.7 Ph39 retirement (−8,936 lines, committed):** the user×project instance graph is GONE. Deleted at HEAD: `AccessAnalysisShell.tsx`, `GraphCanvas.tsx`, `GraphCanvas3D.tsx` (Three.js renderer), `GraphInteractions.tsx`, `SelectionContext.tsx`, `CatalogSliderSidebar.tsx`, `DimensionSearchBox.tsx`, `PresetBar.tsx`, `similarityWeb.ts`, `SimilarityWebOverlay.tsx`, `NeighborMatchesPanel.tsx`, `RightPanelStack.tsx`, `lasso3d.ts`, `graphTestBridge.ts`. The served surface is the **`activity/` subdirectory** (activity universe). The former 59 KB `HybridAnalyticsSurface.tsx` monolith split (v2.2 Ph17: thin shell + `useHybridAnalytics.ts` + `hybridAnalyticsTransforms.ts` + view/panel modules) survives.

Key structural groups (HEAD):

| Group | Key Files | Purpose |
|-------|-----------|---------|
| Shell | `AccessAnalysisShellClient.tsx`, `AccessAnalysisPage.tsx`, `graphVariant.ts` | Entry: dynamic-imports `ActivityUniverseShell` (default) or opt-in `PersonGraph3D.tsx` projector (`NEXT_PUBLIC_ACC_PERSON_GRAPH=1`) |
| **Activity universe (v2.7, `activity/` — 34 files)** | `ActivityUniverseShell.tsx` (1,754 lines — largest file in the tree), `useActivityUniversePayload.ts`, `ActivityDimensionsPanel.tsx` (479), `ActivityDetailRail.tsx`, `ActivityTooltip.tsx`, `ActivitySelectionPanel.tsx` (178, 7468e132), `activityDimensions.ts` (8 dims: verb, module, objectType, month, role, company, project, author), `activityGroupLayout.ts`, `activityColorBy.ts`, `moduleColors.ts`, `activitySizes.ts`, `activityEventLabels.ts`, `activityTime.ts`, `activitySelectionBreakdown.ts` (80, pure), `lodSample.ts` (`LOD_CAP = 200_000` region flip; `SAMPLE_CAP = 5_000_000` → stride-1 = full corpus since 4f242bb1), `activityMotion.ts` (cosmos-native GPU morph, ambient ≤`AMBIENT_SUBSET_CAP` 100k and refused above `AMBIENT_MAX_N` 250k), `activityGraphData.ts` (`MAX_ACTIVITY_LINKS = 20_000` same-author chains + `buildProjectSelectionMask` / `filterActivityIndices` / `buildAuthorMatch`), `activityTestBridge.ts` | One node per activity event (~4.9M, **all rendered** in both arms); binary payload fetched client-side; time scrubber; e2e `tests/e2e/activity-universe-hard-gate.spec.ts`, `activity-universe-view-toggle.spec.ts`, `activity-payload.spec.ts` |
| **3D arm (`activity/`, 77e55c05..7d1420b9)** | `ActivityUniverse3D.tsx` (615), `activityClump3.ts` (46, `CLUMP_PULL = 0.78`), `activityDepth.ts` (24) | `THREE.Points` + `ShaderMaterial` point cloud, `THREE.LineSegments` same-author links, damped `OrbitControls` + idle auto-orbit, dirty-driven render loop. Positions = true 3D PaCMAP (`positions3`, u16 via `lib/acc/positions3Quant.ts`) with the month-depth space-time cube (`activityDepth.ts`) as the disclosed fallback. Group-by morph is 100% GPU (base + target vertex attributes, `uMix` uniform). `ActivityUniverse3DHandle`: `findPointsInPolygon`, `findNearestPoint`, `setControlsEnabled`, `setSelectedIndices`, `focusPoint` *(uncommitted WIP)*. **Traps:** `buildClumpTargets` must `.slice()` the no-category return (aliasing corrupts base positions); 3D listeners belong on the sibling overlay div, not the covered 2D container |
| Renderer (2D) | `GraphCanvas2D.tsx` (cosmos.gl, 1,153 lines) | 2D graph renderer; **stays mounted (hidden) under the 3D overlay** so the toggle is instant. Frozen-path empirical screen-space fit (cosmos `fitView*` unusable there), `fitViewOnInit` disabled when frozen, forced `resizeCanvas(true)` after init, `linkVisibilityDistanceRange: [80, 1200]`, links ride the GPU morph position texture. `GraphCanvas2DHandle` adds `focusPoint` (→ cosmos `zoomToPointByIndex`), `setSelectedIndices` (outlined + greyout), `setHoveredIndex`, `captureView`/`restoreView`. Middle-mouse pan needs **capture-phase** `mousedown`/`auxclick` `preventDefault` (never `pointerdown`) |
| Interactions | `usePredicateEngine.ts`, `LassoOverlay.tsx`, `NodeTooltip.tsx`, `MapClusterLabels.tsx` | Hover/click/lasso; cluster labels |
| Physics engine (retained, no served live-sim consumer) | `physicsLayer.ts`, `physicsLayerWorker.ts`, `physicsWorkerScript.ts`, `staticLayer.ts` | d3-force-3d + worker bridge; PHYSICS + MASK buses; the activity universe uses the frozen path of `GraphCanvas2D`'s `physics` handle |
| Contexts (retained) | `SliderContext.tsx`, `FilterContext.tsx`, `AccessAnalysisContext.tsx` | Slider/filter state (`SelectionContext.tsx` deleted in Ph39) |
| Data pipeline | `graphNodesFromUsers.ts`, `featureSnapshot.ts`, `graphTables.ts`, `graphSql.ts`, `duckdbClient.ts`, `positionsCache.ts` | BulkAccUser → Arrow tables → DuckDB → features (analytics surfaces) |
| Dimension catalog | `dimensionCatalog.ts` + `.structural.ts` / `.actions.ts` / `.folder.ts` / `.folderLive.ts`, `dimensionCatalog.types.ts` | Full 208-entry catalog vocabulary (pinned by `catalogSliders.test.ts`); primary served consumer (instance sidebar) retired in Ph39 |
| Catalog widening (v2.4) | `catalogSliders.ts`, `catalogSearch.ts`, `groupByDimensions.ts`, `GroupByControls.tsx`, `activeGrouping.ts`, `dimensionCoverage.ts`, `dimensionIdSpace.ts`, `dimensionBands.ts`, `DimensionFilterPopover.tsx`, `curatedSliders.ts` | Group-by/color-by/slider selection over the widened catalog |
| Taxonomy | `accTaxonomy.ts`, `accTaxonomyStatic.ts`, `accTaxonomyActions.generated.ts`, `accTaxonomy.types.ts` | ACC action/module/group taxonomy |
| Layout engines | `catalogTargets.ts`, `featureTargets.ts`, `restLayout.ts`, `gridLayout.ts`, `blobDescriptor.ts`, `clusterPacking.ts`, `clusterForceLayout.ts` | Anchor positions per dimension kind |
| Sidebar UI (retained) | `CatalogCollapse.tsx`, `CatalogTreeSection.tsx`, `DimensionSlider.tsx`, `SliderGroup.tsx`, `Toolbar.tsx` | Per-dimension slider tree pieces (`CatalogSliderSidebar.tsx` deleted) |
| Visual encoding | `nodeColors.ts`, `nodeSizes.ts`, `bucketedColors.ts`, `clusterColors.ts`, `chartColors.ts`, `linkEmphasis.ts`, `sameUserEdges.ts` | Color/alpha/size computation; same-user edge derivation |
| Panels (retained) | `SelectionPanel.tsx`, `RiskAccessPanel.tsx`, `DistributionPanel.tsx`, `HeadlineInsights.tsx`, `PermissionRiskPanel.tsx`, `ComplianceScanPanel.tsx`, `DeferredAnalyticsSection.tsx` | Analytics panels (`RightPanelStack.tsx` / `NeighborMatchesPanel.tsx` deleted) |
| v2.5 survivors | `ambientMotion.ts` (FPS controller reused by `activityMotion.ts`), `whySimilar.ts`, `embeddingBlobDescriptor.ts`, `embeddingFit.ts` | Retained utilities from the Living Graph era |
| Feature export (legacy) | `instanceFeatureNumerics.ts`, `instanceFeatureTokens.ts` | Retained in-tree; their script consumers (`build-instance-features.ts`, `compute_instance_embeddings.py`) were deleted with the instance-embedding retirement (c28cb962) |
| Analytics | `analyticsFindings.ts`, `analyticsQueries.ts`, `accessFacets.ts`, `riskFlags.ts`, `actionBuckets.ts`, `catalogWeights.ts` | Risk/perm analytics on feature snapshots |
| Graph KPI | `ChartPanel.tsx`, `DonutPanel.tsx`, `KpiHeroStrip.tsx` | In-graph chart panels |
| Runtime registry (NOT legacy-dead) | `dimensionRegistry.ts`, `dimensionGroups.ts` | Runtime slider/physics dimension subset; imported by `SliderContext.tsx`, `nodeColors.ts`, `featureTargets.ts`, `bucketedColors.ts`, `sliderPresets.ts`, `featureSnapshot.ts`, `dimensionCatalog.structural.ts` |

**In-flight WIP (uncommitted):** ~17 files in this module carry uncommitted modifications. Two groups:
- *Access-analysis redesign* — `HybridAnalyticsView.tsx`, `useHybridAnalytics.ts`, `hybridAnalyticsTransforms.ts`, `catalogTargets.ts`, `dimensionCatalog.types.ts`, `featureSnapshot.ts`, `graphNodesFromUsers.ts`, `gridLayout.ts`.
- *Universe weeks/filters/focus* — `activity/ActivityUniverseShell.tsx` (week-vs-month scrubber selection via the payload's `weekId` column with a `monthId` fallback; click-to-focus routing per `viewModeRef`), `activity/ActivityDimensionsPanel.tsx` (one-off `RoleFilter` generalized into a reusable `DimFilter` driven by an `ActivityFilterGroup[]` prop; role/verb/month are now three instances), `activity/ActivityUniverse3D.tsx` (`focusPoint` eased orbit flight), `activity/activityGraphData.ts`, `activity/activityTestBridge.ts` (`timeGranularity: "week" | "month"` counter). Companion uncommitted edits: `lib/acc/activityWeeks.ts` (new) and `scripts/build-activity-universe-payload.ts` (emits `weekId`, `weekFloor`, `weekCount`, `weekUnknownCount`).

**`app/(dashboard)/users/spatial-graph/`:**
- `page.tsx` — thin `h-screen` shell rendering `AccessAnalysisShellClient` (imported from `../access-analysis/`). **No tRPC prefetch and no `<HydrationBoundary>` since v2.7** — the graphSnapshot/instanceEmbedding prefetch retired with the instance graph (ACT-03); the activity payload is fetched client-side from `/api/activity-universe/payload`. This is the canonical URL of the alias pair (`/users/access-analysis` redirects here)
- `loading.tsx` — route-level loading skeleton
- The superjson hydration fix (`deserializeHydrationState`, commit e7e14e64) still guards the two remaining boundaries: `app/(dashboard)/layout.tsx` and `app/(dashboard)/users/page.tsx`

**`app/(dashboard)/users/scale-spike/`:** perf-spike route (`ScaleSpikeClient.tsx`, `spikePhysicsStub.ts`, `spikeSynthetic.ts`) — synthetic-scale GraphCanvas2D testbed, not a product surface.

## Focus Area: `/template-mty` (`app/(dashboard)/template-mty/`)

**Key files:**
- `page.tsx` — async RSC; `Promise.all` 5 lib/server helpers; renders `TemplateAnalysisCharts`
- `components/TemplateAnalysisCharts.tsx` — client hub; accordion sections for each analysis type
- `components/TemplateMembersTable.tsx` + `templateMembersTable.ts` — TanStack member table
- `components/RoleAccessPie.tsx`, `ModuleAccessChart.tsx`, `PermissionAccessChart.tsx` — ECharts charts
- `components/RoleSimilarityGraph.tsx` — D3 role similarity force graph
- `components/RoleOverviewSheet.tsx` — DrillSheet for role detail
- `moduleAccess.ts`, `permissionAccess.ts`, `roleSimilarity.ts` — pure transform helpers

**Server helpers (in `lib/server/`):**
- `templateView.ts` — overview + role membership
- `templateFolderTerrain.ts` — folder terrain
- `templateRoleTree.ts` — role hierarchy
- `templateRoleSimilarity.ts` — Jaccard/cosine role similarity
- Source: `AccFolder`, `AccFolderPermission`, `AccProjectMember`, `AccRole`, `AccProjectRole`

## Focus Area: `/forma-proposal` (`app/(dashboard)/forma-proposal/`)

**Key files:**
- `page.tsx` — async RSC; `loadFormaFolderTree()` → `FormaProposalClient`
- `components/FormaProposalClient.tsx` — client shell; ModeSwitch (list/hierarchy); role draft state (`useFormaDraft`)
- `components/HierarchyView.tsx` — main D3-driven org tree (dynamic import, ssr:false)
- `components/HierarchyCanvas.tsx` — canvas render layer for hierarchy
- `components/FormaParticleAccent.tsx` — R3F background accent (approved surface)
- `components/FolderTreeAssign.tsx` — folder-to-role assignment UI
- `components/RoleRail.tsx`, `TierPicker.tsx`, `OrgNode.tsx`, `RoleManagerDialog.tsx` — role/tier management
- `components/useHierarchyLayout.ts` — D3 hierarchy layout hook
- `components/useFormaDraft.ts` — draft state management

**Server helper:** `lib/server/formaFolderTree.ts` — queries `AccFolder` + `AccProject` for template folder tree

## Key File Locations (Cross-cutting)

**tRPC composition:**
- `server/routers/root.ts` — appRouter (all procedures here before naming any)

**Database:**
- `server/db.ts` — PrismaClient singleton
- `prisma/schema.prisma` — full schema (Acc*, auth, LOD, Project models)

**ACC Data Connector ETL:**
- `lib/acc/dcIngest.ts` — main ETL (57 KB); writes `AccDc*` tables
- `scripts/dc-daily-ingest.cjs` — daily cron wrapper
- `scripts/dc-*.cjs` — extraction, backfill, resume scripts

**Key Prisma models for workshop surfaces:**
- `/access-analysis`: `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcUser`, `AccRole`, `AccActivity`, `AccActivityAccds`, `AccFolder`, `AccFolderPermission`, `AccProject`, `AccIssue`, `AccProjectMember` (admins-per-project chart: `AccProjectMember.projectAdmin` ∪ `AccDcProjectUserProduct.accessLevel='project_admin'` → `AccDcUser` for the email)
- `/template-mty`: `AccFolder`, `AccFolderPermission`, `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccProject`
- `/forma-proposal`: `AccFolder`, `AccProject`
- `/users` directory: `AccDcUser`, `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccProjectMember`, `AccRole` (via `accDcGraph.bulkUsers` → `lib/server/acc-hot-cache`)
- `/users/spatial-graph` (activity universe): `AccActivityEmbedding` (2D, `prisma/schema.prisma:930`) **plus the raw `AccActivityEmbedding3D` table** (3D PaCMAP xyz — created by `scripts/compute_activity_embeddings.py`, **absent from `prisma/schema.prisma`**, so `prisma db push`/migrate will not manage it and the payload builder must keep probing with `to_regclass`); both feed the offline `.embedding/` binary artifact. `AccInstanceEmbedding` was **dropped** in v2.7 (migration `2026-07-21-drop-acc-instance-embedding.sql`). Runtime detail lookups go through `activityUniverse.eventDetail` against the activity tables; the opt-in projector uses `AccPersonGraphSnapshot` / `AccGraphLayoutCache`
- **`AccFolderPermissionSummary`** (v2.2 Ph18): materialized per-(projectId, roleId) projection (~22k rows) — `folderCount`, `totalBytes` (BigInt), `permTypes[]`. Serves `includePermissionSummary` in `lib/server/acc-hot-cache.ts`; refreshed by the dc-daily-ingest cron. Since v2.3 it is charted: `lib/server/permissionUserView.ts` joins it for the `/access-analysis` `PermissionUsersDonut`.

**UI primitives (always use these):**
- `components/ui/EChart.tsx` — canonical EChart wrapper
- `components/ui/PremiumSurface.tsx` — card primitive (4 variants)
- `components/ui/DrillSheet.tsx` — right-slide drill panel
- `components/ui/DataTable.tsx` — TanStack table
- `components/ui/motion.ts` — motion variants (fadeUp, etc.) + `useSafeVariants`
- `components/ui/GraphLoadingSkeleton.tsx` — graph loading state

**Color and theming:**
- `lib/colors/echartsTheme.ts` — `ECHARTS_DARK`, `ECHARTS_LIGHT`, `mergeEChartsTheme`
- `app/globals.css` — CSS variable definitions (`--foreground`, `--background`, `--primary`, etc.)

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx`
- Pure helpers / transforms: `camelCase.ts`
- tRPC routers: `kebab-case.ts` under `server/routers/`
- Tests: `*.test.ts` / `*.test.tsx` co-located with source
- Playwright e2e: `tests/e2e/*.spec.ts`
- Scripts: `kebab-case.cjs` (Node CJS) or `kebab-case.ts` (TS, compiled)

**Directories:**
- Route groups: `(auth)/`, `(dashboard)/` (Next.js route group convention)
- Sub-components: `components/` inside route directory
- Tests: `__tests__/` inside route directory or `lib/server/__tests__/`
- Fixtures: `__fixtures__/` (used in graph tests)

## Where to Add New Code

**New workshop page feature (data + UI):**
- Server fetch: `lib/server/<featureName>View.ts` (import `"server-only"`)
- RSC page: update `app/(dashboard)/<route>/page.tsx` to call new view helper
- Client component: add to `app/(dashboard)/<route>/components/<ComponentName>.tsx`
- tRPC procedure (if needed for client-side re-fetch): `server/routers/<acc-router>.ts`, then register in `root.ts`

**New tRPC procedure:**
1. Verify in `server/routers/root.ts` which sub-router owns the domain
2. Add procedure to `server/routers/<router>.ts`
3. No changes to `root.ts` needed if sub-router is already composed
4. Update RSC prefetch in `lib/server/acc-route-hydration.ts` if the page should pre-warm it

**New reusable UI primitive:**
- `components/ui/<ComponentName>.tsx`
- Must not import from `server/`, `lib/server/`, or `app/` route internals

**New ACC domain helper (shared across routes or scripts):**
- `lib/acc/<helperName>.ts` (pure; no Prisma import)
- `lib/server/<helperName>.ts` (server-only; may use `db`)
- Do NOT add to `app/(dashboard)/` route directories — that creates `no-scripts-to-app` violations

**New activity-universe dimension (the served graph):**
- Add to `ACTIVITY_DIMENSIONS` in `app/(dashboard)/users/access-analysis/activity/activityDimensions.ts` (needs a columnar id column + dict in the payload — extend `scripts/build-activity-universe-payload.ts` and `lib/server/activityUniversePayload.ts` meta dicts, then rebuild the artifact)
- To expose it as a **narrowing filter**, push one more `ActivityFilterGroup` into the `filters` array passed to `ActivityDimensionsPanel` — do not write another bespoke filter component *(uncommitted WIP seam)*. Filter identity is the **label**, resolved back to id slots by `buildProjectSelectionMask`, so `options` must stay index-aligned with the dict (dicts with duplicate labels — e.g. role "Unknown" appearing twice — must be deduped before building the Set)
- Trap: after any embedding-table change, the `.embedding/` artifact must be rebuilt or the payload/meta pair goes inconsistent. A 3D-only change means rebuilding `AccActivityEmbedding3D` **and** the artifact

**New catalog graph dimension (analytics surfaces):**
- Add to `dimensionCatalog.structural.ts` (structural) or `dimensionCatalog.folder.ts` / `dimensionCatalog.folderLive.ts`
- Action dims are generated from `accTaxonomyActions.generated.ts` (taxonomy-driven)
- Update `interactionTypes.ts` if new feature field on `NodeFeatureSnapshot`
- Update `featureSnapshot.ts` and `graphNodesFromUsers.ts` to populate the field

**New pure transform for `/access-analysis`:**
- Add `<moduleName>.ts` directly in `app/(dashboard)/access-analysis/`
- Add co-located `__tests__/<moduleName>.test.ts`
- Import in `mainCharts.tsx` or `AccessAnalysisCharts.tsx`

## Special Directories

**`.tools/repo-map/`:**
- Purpose: Repo-map generator outputs (architecture-summary.md, dependency-cruiser.json, ast-grep-report.json, dependency-graph.mmd, repomix/ digests)
- Generated: Yes (`npm run repo-map`)
- Committed: Yes (standing research input)

**`.planning/`:**
- Purpose: Project planning memory (STATE.md, PROJECT.md, MILESTONES.md, codebase maps, phase plans) used by the `.claude/skills/lecg-*` lifecycle skills (GSD framework retired 2026-07-15)
- Generated: By the lecg-* skills (plain markdown, no external runtime)
- Committed: Yes

**`.embedding/` (gitignored):**
- Purpose: Activity-universe binary payload artifacts (`activity-universe.bin` + `activity-universe-meta.json`) plus embedding-pipeline outputs. The Ph38 figure was ~149.7 MB; the artifact has since grown by the u16 `positions3` column (ae195f00) and, in the working tree, the u16 `weekId` column — VERIFY the current size against a fresh build rather than reusing 149.7 MB
- Generated: Yes (`scripts/build-activity-universe-payload.ts` after each `scripts/compute_activity_embeddings.py` run)
- Committed: No — served at runtime by `app/api/activity-universe/payload/route.ts` via `lib/server/activityUniversePayload.ts`

**`public/duckdb-wasm/`:**
- Purpose: Self-hosted DuckDB-Wasm bundles (populated by postinstall)
- Generated: Yes (postinstall)
- Committed: No (generated artifact)

**`services/lod-engine/`:**
- Purpose: Python LOD/image processing microservice. Started via `npm run lod:engine`. Isolated from TypeScript request path.
- Generated: No (source)
- Committed: Yes

---

## Dashboard Self-Check

- **Context:** `.tools/repo-map/architecture-summary.md` (2026-07-23 17:43, gate passing) + `git log 956408d1..HEAD --stat` (12 commits: 1c346714 UX pass, 4c52f3f6 hover/clip fix, 7468e132 selection panel + role filter + middle-mouse pan, 77e55c05 2D/3D toggle, 55625c91 toggle e2e, ae195f00 true-3D PaCMAP, e8541e12 admins-per-project, 8afac7d8 3D lasso, 9db9b622 3D hover/morph, 4f242bb1 full-corpus render, bc3626f0 perf bounds, 7d1420b9 hover-listener fix) + `git status --short` + direct source reads.
- **Evidence:** Every named path verified extant (`git ls-files` = **282** files in `app/(dashboard)/users/access-analysis`, **34** in `activity/`; `ls` enumeration of `activity/` includes `ActivityUniverse3D.tsx`, `activityClump3.ts`, `activityDepth.ts`, `ActivitySelectionPanel.tsx`, `activitySelectionBreakdown.ts`). Line counts measured with `wc -l`. Both route files read in full to confirm the redirect-alias pair. `AccActivityEmbedding` at `prisma/schema.prisma:930`; `AccActivityEmbedding3D` grep-confirmed **only** in `scripts/build-activity-universe-payload.ts` and `scripts/compute_activity_embeddings.py`, never in `prisma/`. New-file wiring traced end to end (`adminsPerProjectView.ts` → `adminsPerProjectActions.ts` → `mainCharts.tsx:131` → `AccessAnalysisCharts.tsx:369` → `ProjectsTabPanel.tsx:204`). WIP deletions/modifications flagged, not treated as landed.
- **Constraints:** No `src/` root. No Prisma in `components/`. Page scroll ownership noted. `app/(dashboard)/access-analysis` (ECharts charts) kept distinct from `app/(dashboard)/users/access-analysis` (graph module) throughout.
- **Gates:** Map artifact only — no compilation.
- **VERIFY:** payload size (~149.7 MB Ph38 baseline, since grown) and author coverage 94.41% are milestone figures, not re-measured — `.embedding/` is gitignored. The admins-per-project coverage numbers (301 / 408 source projects) are the view's own source comments, measured 2026-07-23, not re-derived here. The repo-map summary's Prisma model dump does not list `AccActivityEmbedding3D` because it is not a Prisma model.

*Structure analysis: 2026-06-23; targeted refresh 2026-07-23 (2D/3D activity-universe arm 77e55c05..7d1420b9 + admins-per-project e8541e12; committed HEAD `7d1420b9` primary, week-scrubber / DimFilter / click-to-focus WIP in working tree)*
