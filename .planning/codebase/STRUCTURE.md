<!-- refreshed: 2026-07-02 -->
# Codebase Structure

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-02 — targeted post-v2.1/v2.2 update (monolith splits, shared query owner, projection model)

## Directory Layout

```
C:/LECG/Dashboard/
├── app/                         # Next.js App Router — route shells + RSC + API routes
│   ├── (auth)/                  # Auth group: login, register, forgot-password
│   ├── (dashboard)/             # Main product group
│   │   ├── layout.tsx           # Auth gate + Sidebar + main overflow-hidden
│   │   ├── access-analysis/     # /access-analysis — RSC dashboard (ECharts, donuts, terrain)
│   │   ├── users/               # /users — directory + /access-analysis graph + /spatial-graph
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
│   │   ├── mty-allowlist.json   # MTY project ID allowlist
│   │   ├── template-mty.ts      # TEMPLATE_MTY_ID / TEMPLATE_MTY_NAME constants
│   │   ├── embedding/           # Instance embeddings + similarity edge set
│   │   └── __tests__/           # Unit tests for acc helpers
│   ├── server/                  # Server-only view builders + integrations
│   │   ├── acc-route-hydration.ts  # createAccRouteHelpers + prefetch helpers for RSC pages
│   │   ├── acc-hot-cache.ts        # In-process BulkAccUser cache
│   │   ├── accessInstanceView.ts   # DC snapshot → AccessInstance[] + mergeRoleNames
│   │   ├── moduleActivityView.ts   # AccActivity → module rows
│   │   ├── activityTimelineView.ts # Timeline aggregation
│   │   ├── activityByActorView.ts  # Per-actor activity
│   │   ├── coordinationByProjectView.ts
│   │   ├── projectCoverageView.ts
│   │   ├── folderPermissionTerrainView.ts
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
│   │   ├── root.ts              # appRouter — composes all sub-routers
│   │   ├── acc-dc-graph.ts      # accDcGraph: bulkUsers, bulkUser, instanceEmbedding, instanceNeighbors
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
│   ├── build-instance-features.ts  # Snapshot builder (WARN: imports from app/ route — move to lib/)
│   ├── diag-activity-*.cjs      # Diagnostic scripts (WARN: import moduleOverrides from app/)
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

**Purpose:** Account-wide ACC access & activity dashboard. Pure RSC page with server-aggregated data.

**Key files (post v2.2 Ph16 split — no file exceeds ~640 lines):**
- `page.tsx` (58 lines) — RSC shell; `<Suspense><MainCharts /></Suspense>`; owns `h-full overflow-y-auto`
- `mainCharts.tsx` (80) — async RSC; `Promise.all` of 8 `lib/server/*View` calls; passes props to `AccessAnalysisCharts`
- `loading.tsx` — route-level Suspense fallback skeleton
- `components/AccessAnalysisCharts.tsx` (640) — client hub; owns `sliceFilters`, `selected` project set, drill state; renders all chart sub-components; cross-filter drives every donut + timeline
- `components/EChart.tsx` — local legacy EChart wrapper, test-only (canonical is `components/ui/EChart.tsx`)
- Chart panels (`components/`): `RolesPieChart.tsx` (341), `CompaniesPieChart.tsx` (335), `ActivityByRolePieChart.tsx` (343), `CompaniesActivityPieChart.tsx` (340), `ModulesPieChart.tsx` (311), `ActivityTimelineChart.tsx` (178), `CoordinationByProject.tsx` (322), `FolderActivityReveal.tsx` (177) + `FolderActivityByRole.tsx` (163), `ProjectPicker.tsx` (359), `FilterBanner.tsx` (91)
- 3D terrain (split in Ph16 from the former 50 KB monolith): `components/FolderPermissionTerrain.tsx` (212) + `TerrainStage.tsx` (392), `TerrainControls.tsx` (252), `TerrainReveal.tsx` (68), `terrainViewModel.ts` (121), `useFolderPermissionTerrainCamera.ts` (154)
- Terrain math (split in Ph16 from the former 49 KB `folderTerrain.ts`): `folderTerrainCamera.ts` (387), `folderTerrainLayout.ts` (279), `folderTerrainModel.ts` (270), `folderTerrainScene.ts` (260)

**Pure transform modules (co-located, route-owned):**
- `roleCounts.ts`, `moduleCounts.ts`, `companyActivityCounts.ts`, `roleActivityCounts.ts`, `companyCounts.ts`, `timelineCounts.ts`, `coordinationCounts.ts`, `coverageCounts.ts`, `dormantActivity.ts`, `folderActivityCounts.ts`, `projectFilter.ts`, `projectGroups.ts`
- Note: `timelineCounts.ts` / `coordinationCounts.ts` are 1-line re-export barrels — the pure logic moved to `lib/acc/` in v2.1 Ph10 (BND-03)

**Server actions (RSC-safe, used by MainCharts):**
- `coordinationActions.ts` (thin delegate to `server/routers/acc-coordination.ts` since Ph10 BND-01), `folderTerrainActions.ts`, `folderActivityActions.ts`

**Resolved (was WARN):** the `moduleOverrides.ts` scripts→app violation was fixed in v2.1 Ph10 (BND-02) — pure classification logic now lives in `lib/acc/activityClassification.ts`.

**Tests:** `__tests__/` — Vitest unit tests for every pure transform module plus characterization pins for the terrain/query splits (TEST-02/03). `page.test.tsx` tests the RSC render.

## Focus Area: `/users` (`app/(dashboard)/users/`)

**Purpose:** ACC member directory (DataTable), profile panels, stat cards, and the nested `/access-analysis` physics graph and `/spatial-graph` view.

**Key files in `app/(dashboard)/users/`:**
- `page.tsx` — RSC shell; TanStack prefetch via `prefetchUsersRouteAccData`; `<HydrationBoundary><UsersDirectoryClient />`
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

**`app/(dashboard)/users/access-analysis/` — Physics Graph Module (explicit in-scope):**

This subdirectory (~180 files) hosts the full 3D physics graph and ALL graph infrastructure. It is currently served at `/users/spatial-graph` via `AccessAnalysisShellClient`. The former 59 KB `HybridAnalyticsSurface.tsx` monolith was split in v2.2 Ph17 (SPLIT-03/04) into a thin shell + `useHybridAnalytics.ts` (data/queries) + `hybridAnalyticsTransforms.ts` (pure transforms) + view/panel/drilldown modules, all ≤400 lines.

Key structural groups:

| Group | Key Files | Purpose |
|-------|-----------|---------|
| Shell | `AccessAnalysisShell.tsx`, `AccessAnalysisShellClient.tsx`, `AccessAnalysisPage.tsx` | Graph page composition, context wiring |
| Contexts | `SliderContext.tsx`, `FilterContext.tsx`, `SelectionContext.tsx` | Slider state (physics), filter chips, lasso selection |
| Physics engine | `physicsLayer.ts`, `physicsLayerWorker.ts`, `physicsWorkerScript.ts`, `staticLayer.ts` | d3-force-3d simulation + web worker bridge; PHYSICS + MASK buses |
| Renderers | `GraphCanvas.tsx`, `GraphCanvas3D.tsx` (Three.js), `GraphCanvas2D.tsx` (cosmos.gl) | CSS-visibility swap; no remount on mode change |
| Interactions | `GraphInteractions.tsx`, `usePredicateEngine.ts`, `LassoOverlay.tsx`, `lasso3d.ts`, `NodeTooltip.tsx` | Click/hover/lasso; MASK bus channel |
| Data pipeline | `graphNodesFromUsers.ts`, `featureSnapshot.ts`, `graphTables.ts`, `graphSql.ts`, `duckdbClient.ts`, `positionsCache.ts` | BulkAccUser → Arrow tables → DuckDB → features |
| Dimension catalog | `dimensionCatalog.ts` + `.structural.ts` / `.actions.ts` / `.folder.ts` / `.folderLive.ts`, `dimensionCatalog.types.ts` | Full catalog; replaces legacy registry |
| Taxonomy | `accTaxonomy.ts`, `accTaxonomyStatic.ts`, `accTaxonomyActions.generated.ts`, `accTaxonomy.types.ts` | ACC action/module/group taxonomy |
| Layout engines | `catalogTargets.ts`, `featureTargets.ts`, `restLayout.ts`, `gridLayout.ts`, `blobDescriptor.ts`, `clusterPacking.ts`, `clusterForceLayout.ts` | Anchor positions per dimension kind |
| Sidebar UI | `CatalogSliderSidebar.tsx`, `CatalogCollapse.tsx`, `CatalogTreeSection.tsx`, `DimensionSlider.tsx`, `DimensionSearchBox.tsx`, `PresetBar.tsx` | Per-dimension slider tree |
| Visual encoding | `nodeColors.ts`, `nodeSizes.ts`, `bucketedColors.ts`, `clusterColors.ts`, `chartColors.ts`, `linkEmphasis.ts` | Color/alpha/size computation |
| Right panels | `RightPanelStack.tsx`, `SelectionPanel.tsx`, `RiskAccessPanel.tsx`, `DistributionPanel.tsx`, `HeadlineInsights.tsx` | Post-selection and analytics panels |
| Analytics | `analyticsFindings.ts`, `analyticsQueries.ts`, `accessFacets.ts`, `riskFlags.ts`, `actionBuckets.ts`, `catalogWeights.ts` | Risk/perm analytics on feature snapshots |
| Graph KPI | `ChartPanel.tsx`, `DonutPanel.tsx`, `KpiHeroStrip.tsx` | In-graph chart panels |
| Legacy | `dimensionRegistry.ts`, `dimensionGroups.ts` | Being replaced by dimensionCatalog; still imported by SliderContext + FilterContext for legacy surfaces |

**`app/(dashboard)/users/spatial-graph/`:**
- `page.tsx` — prefetches `accDcGraph.bulkUsers` (full) + embedding + enrichedUsers; renders `AccessAnalysisShellClient`
- `loading.tsx` — route-level loading skeleton

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
- `/access-analysis`: `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcUser`, `AccRole`, `AccActivity`, `AccActivityAccds`, `AccFolder`, `AccFolderPermission`, `AccProject`, `AccIssue`
- `/template-mty`: `AccFolder`, `AccFolderPermission`, `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccProject`
- `/forma-proposal`: `AccFolder`, `AccProject`
- `/users` directory: `AccDcUser`, `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccProjectMember`, `AccRole` (via `accDcGraph.bulkUsers` → `lib/server/acc-hot-cache`)
- `/users/spatial-graph`: same as /users directory + `AccInstanceEmbedding`, `AccGraphLayoutCache`, `AccPersonGraphSnapshot`, `AccFolderPermission` (for folder-reach dims)
- **`AccFolderPermissionSummary`** (new in v2.2 Ph18): materialized per-(projectId, roleId) projection — `folderCount`, `totalBytes` (BigInt), `permTypes[]`. Serves `includePermissionSummary` in `lib/server/acc-hot-cache.ts`; refreshed by the dc-daily-ingest cron. Not yet charted on any surface (v2.3 graph candidate).

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

**New graph dimension:**
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
- Purpose: GSD planning artifacts (STATE.md, PROJECT.md, codebase maps, phase plans)
- Generated: By GSD commands
- Committed: Yes

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

- **Context:** repo-map architecture-summary.md + direct source reads for all 4 workshop routes + component directory + lib structure.
- **Evidence:** All paths verified from `find` output and file reads. No invented paths.
- **Constraints:** No `src/` root. No Prisma in `components/`. Page scroll ownership noted.
- **Gates:** Map artifact only — no compilation.
- **VERIFY:** Whether `dimensionRegistry.ts` / `dimensionGroups.ts` are removed or still active (SliderContext still imported SLIDER_DIMENSION_IDS from dimensionGroups at time of the 2026-06-23 read).

*Structure analysis: 2026-06-23; targeted refresh 2026-07-02 (post v2.2 splits — line counts read from disk)*
