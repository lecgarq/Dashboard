# Codebase Structure

**Analysis Date:** 2026-06-17

## Directory Layout

```
dashboard/
├── app/                                 # Next.js 16 App Router
│   ├── layout.tsx                       # Root layout (fonts, providers, Toaster)
│   ├── page.tsx                         # Index redirect
│   ├── globals.css                      # Tailwind + CSS variables
│   ├── (auth)/                          # Unscoped auth routes
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (dashboard)/                     # Protected dashboard routes
│   │   ├── layout.tsx                   # Dashboard layout (sidebar, providers, hydration)
│   │   ├── page.tsx                     # Home redirect
│   │   ├── home/page.tsx                # Dashboard home
│   │   ├── access-analysis/             # ECharts dashboard (roles, modules, activity)
│   │   │   ├── page.tsx                 # RSC: loads views, renders AccessAnalysisCharts
│   │   │   ├── loading.tsx              # Skeleton during SSR
│   │   │   ├── components/              # Chart components
│   │   │   │   ├── AccessAnalysisCharts.tsx    # Main wrapper
│   │   │   │   ├── RolesPieChart.tsx           # ECharts donut
│   │   │   │   ├── ModulesPieChart.tsx
│   │   │   │   ├── ActivityByRolePieChart.tsx
│   │   │   │   ├── ActivityTimelineChart.tsx
│   │   │   │   ├── CompaniesPieChart.tsx
│   │   │   │   ├── CompaniesActivityPieChart.tsx
│   │   │   │   ├── CoordinationByProject.tsx
│   │   │   │   ├── FolderPermissionTerrain.tsx
│   │   │   │   ├── PeopleDrillList.tsx  # Drill-down people list
│   │   │   │   ├── CoverageBadges.tsx
│   │   │   │   ├── NoActivityBars.tsx
│   │   │   │   ├── ProjectPicker.tsx
│   │   │   │   ├── AuthorProfileDrawer.tsx
│   │   │   │   └── EChart.tsx            # ECharts wrapper with theme
│   │   │   ├── __tests__/               # Unit tests (co-located)
│   │   │   │   ├── AccessAnalysisCharts.test.tsx
│   │   │   │   ├── RolesPieChart.test.tsx
│   │   │   │   ├── ...
│   │   │   │   ├── page.test.tsx
│   │   │   │   └── *.test.ts            # Pure function tests
│   │   │   ├── page.test.tsx
│   │   │   ├── types.ts                 # Local types (ProjectRoleRow, etc.)
│   │   │   ├── *.ts                     # Pure functions (counts, filters, helpers)
│   │   │   │   ├── companyActivityCounts.ts
│   │   │   │   ├── companyCounts.ts
│   │   │   │   ├── coordinationActions.ts
│   │   │   │   ├── coordinationCounts.ts
│   │   │   │   ├── roleCounts.ts
│   │   │   │   ├── roleActivityCounts.ts
│   │   │   │   ├── moduleOverrides.ts
│   │   │   │   ├── modules.ts
│   │   │   │   ├── projectFilter.ts
│   │   │   │   ├── projectGroups.ts
│   │   │   │   ├── timelineCounts.ts
│   │   │   │   ├── dormantActivity.ts
│   │   │   │   ├── folderTerrain.ts
│   │   │   │   ├── folderTerrainActions.ts
│   │   │   │   └── relativeTime.ts
│   │   ├── users/                       # User directory & graph pages
│   │   │   ├── dashboard/               # User list + stats
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   ├── spatial-graph/           # 3D physics graph + sliders
│   │   │   │   ├── page.tsx             # RSC: loads snapshot
│   │   │   │   ├── GraphCanvas.tsx      # cosmos.gl 3D renderer
│   │   │   │   ├── GraphLoadingSkeleton.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   └── ...
│   │   │   ├── access-analysis/         # Dimension sidebar + sliders
│   │   │   │   ├── page.tsx             # Redirects to /users/spatial-graph
│   │   │   │   ├── AccessAnalysisShell.tsx
│   │   │   │   ├── AccessAnalysisShellClient.tsx
│   │   │   │   ├── CatalogSliderSidebar.tsx
│   │   │   │   ├── CatalogTreeSection.tsx
│   │   │   │   ├── CatalogCollapse.tsx
│   │   │   │   ├── DimensionSearchBox.tsx
│   │   │   │   ├── DimensionFilterPopover.tsx
│   │   │   │   ├── ActiveFiltersBar.tsx
│   │   │   │   ├── AccessEventsChart.tsx
│   │   │   │   ├── ChartPanel.tsx
│   │   │   │   ├── dimensionCatalog.ts
│   │   │   │   ├── dimensionCatalog.structural.ts
│   │   │   │   ├── *.test.ts
│   │   │   │   └── ...
│   │   ├── families/
│   │   ├── clash-detection/
│   │   ├── sim-automation/
│   │   ├── tasks/
│   │   ├── lod-checker/
│   │   ├── exam/
│   │   ├── sync-center/
│   │   ├── trello/
│   │   ├── settings/users/
│   │   ├── account/setup/
│   │   └── template-mty/
│   └── api/                             # HTTP endpoints
│       ├── trpc/[trpc]/route.ts         # TRPC JSON-RPC handler (batched)
│       ├── auth/[...nextauth]/route.ts  # NextAuth callback
│       ├── auth/callback/trello/route.ts
│       ├── health/route.ts
│       ├── chat/
│       │   ├── stream/route.ts
│       │   ├── upload/route.ts
│       │   └── media/route.ts
│       ├── gmail/
│       │   └── attachment/route.ts
│       ├── clash-updates/route.ts       # Webhook receiver
│       ├── sim-updates/route.ts
│       ├── events/
│       │   ├── users/route.ts
│       │   └── trello/route.ts
│       ├── connect/[provider]/route.ts
│       ├── debug/auth/route.ts
│       ├── dev/prewarm-acc/route.ts
│       ├── lod-img/[fileId]/route.ts
│       ├── wiki-collab-token/route.ts
│       ├── wiki-media/route.ts
│       ├── uploadthing/
│       │   ├── core.ts
│       │   └── route.ts
│       └── ...
├── components/                          # React components (UI + layout)
│   ├── layout/
│   │   ├── Sidebar.tsx                  # Main navigation sidebar
│   │   ├── Header.tsx
│   │   └── ...
│   ├── auth/
│   │   ├── DualAuthGuard.tsx            # Client-side auth check + redirect
│   │   ├── CredentialsBanner.tsx
│   │   └── ...
│   ├── dashboard/
│   │   ├── ChatPanelWrapper.tsx         # Floating chat panel
│   │   ├── MailPanelWrapper.tsx         # Floating mail panel
│   │   ├── chat-panel/
│   │   │   ├── ChatPanel.tsx
│   │   │   └── ...
│   │   ├── calendar/
│   │   └── ...
│   ├── providers/
│   │   ├── dashboard-auth-provider.tsx
│   │   ├── project-provider.tsx
│   │   ├── navigation-provider.tsx
│   │   └── ...
│   ├── theme/
│   │   ├── ThemeProvider.tsx            # next-themes wrapper
│   │   ├── ThemeToggle.tsx
│   │   └── ...
│   ├── ui/                              # shadcn/ui primitives
│   │   ├── Button.tsx
│   │   ├── Dropdown.tsx
│   │   ├── ParticleBackground.tsx
│   │   ├── PageTransition.tsx
│   │   └── ... (30+ shadcn components)
│   ├── families/
│   ├── clash/
│   │   └── wiki-editor/                 # TipTap rich editor
│   │       ├── WikiEditor.tsx
│   │       ├── table-node/
│   │       ├── slash-menu/
│   │       └── drag-handle/
│   ├── exam/
│   ├── modules/
│   ├── projects/
│   ├── sync-center/
│   ├── tasks/
│   ├── trello/
│   ├── lod/
│   └── ... (one dir per feature)
├── lib/                                 # Shared logic & utilities
│   ├── core/
│   │   ├── providers.tsx                # TRPCProvider, QueryClient setup
│   │   ├── trpc.ts                      # TRPC React client factory
│   │   └── ...
│   ├── client/                          # Browser-only helpers
│   │   ├── particle-zones.ts            # Canvas particle system
│   │   ├── emptyDuckDbNode.ts           # Webpack alias for DuckDB
│   │   └── ...
│   ├── server/                          # Server-only helpers & data loaders
│   │   ├── db.ts                        # Shared database connection
│   │   ├── auth.ts                      # NextAuth config (also in server/)
│   │   ├── accessInstanceView.ts        # Load: flat table of memberships
│   │   ├── moduleActivityView.ts        # Load: module activity counts
│   │   ├── activityByActorView.ts       # Load: activity by actor (role)
│   │   ├── projectCoverageView.ts       # Load: coverage metrics
│   │   ├── activityTimelineView.ts      # Load: activity over time
│   │   ├── coordinationByProjectView.ts # Load: model coordination issues
│   │   ├── folderPermissionTerrainView.ts # Load: folder hierarchy + perms
│   │   ├── acc-hot-cache.ts             # Cached graph snapshots
│   │   ├── acc-route-hydration.ts       # Pre-fetch helpers for pages
│   │   ├── unifiedActivitySource.ts     # Merge activity sources
│   │   ├── aps-oauth.ts                 # APS token refresh
│   │   ├── aps-user-token.ts            # User APS token extraction
│   │   ├── acc-admin.ts                 # ACC admin helpers
│   │   ├── email.ts                     # Email composition + sending
│   │   ├── google-service-auth.ts       # Google service account
│   │   ├── logger.ts                    # Logging setup
│   │   ├── integrations/                # External service clients
│   │   │   ├── aps-sdk.ts
│   │   │   ├── gmail.ts
│   │   │   └── ...
│   │   ├── __tests__/                   # Server-side unit tests
│   │   └── ...
│   ├── acc/                             # ACC data models & logic
│   │   ├── acc-types.ts                 # TS types (AccActivity, etc.)
│   │   ├── accessAnalysisTypes.ts
│   │   ├── activityCategories.ts        # Pure: classify activity
│   │   ├── activityAttribution.ts       # Pure: link activity to user
│   │   ├── activityAggregate.ts         # Pure: sum counts
│   │   ├── activityActorClassification.ts
│   │   ├── activeUserTiers.ts
│   │   ├── dimensionCatalog.ts          # Registry: graph dimensions
│   │   ├── mty-allowlist.json           # Data: Mexico City office allowlist
│   │   ├── embedding/                   # TF-Embedding vectors
│   │   │   └── ...
│   │   ├── __tests__/                   # Unit tests
│   │   │   └── ...
│   │   └── ... (70+ files)
│   ├── shared/                          # Shared types & helpers
│   │   ├── types.ts                     # Common TS types
│   │   ├── constants.ts
│   │   └── ...
│   ├── colors/                          # Color scheme logic
│   │   ├── palette.ts
│   │   └── ...
│   ├── modules/                         # Modules feature helpers
│   ├── google/                          # Google API helpers
│   ├── wiki/                            # Wiki/collaboration helpers
│   ├── trello/                          # Trello integration
│   ├── forma/                           # Forma (Autodesk tool) integration
│   ├── events/                          # Event bus / webhooks
│   ├── auth-env.ts                      # Parse auth config from env
│   └── redis.ts                         # Upstash Redis client
├── server/                              # Backend server logic
│   ├── auth.ts                          # NextAuth v5 config
│   ├── db.ts                            # Prisma client singleton
│   ├── trpc.ts                          # TRPC context & procedures
│   ├── routers/                         # All TRPC endpoints
│   │   ├── root.ts                      # Router composition
│   │   ├── families.ts
│   │   ├── clash.ts
│   │   ├── exam.ts
│   │   ├── kpi.ts
│   │   ├── tasks.ts
│   │   ├── search.ts
│   │   ├── users.ts
│   │   ├── project.ts
│   │   ├── trello.ts
│   │   ├── sim.ts
│   │   ├── calendar.ts
│   │   ├── chat.ts
│   │   ├── lod.ts
│   │   ├── aps-search.ts
│   │   ├── gmail.ts
│   │   ├── workspace.ts
│   │   ├── acc-sync.ts                  # ACC sync endpoint (webhooks)
│   │   ├── acc-activity.ts              # Activity query endpoints
│   │   ├── acc-folders.ts               # Folder endpoints
│   │   ├── acc-members.ts               # Member endpoints
│   │   ├── acc-graph.ts                 # 3D graph snapshot + sliders
│   │   ├── acc-dc-graph.ts              # DC-only graph endpoints
│   │   ├── acc-person-graph.ts
│   │   ├── *.test.ts                    # Router tests
│   │   └── ...
│   └── actions/                         # Server-side mutations
│       └── ...
├── prisma/
│   ├── schema.prisma                    # ORM schema (User, Project, Activity, etc.)
│   ├── migrations/                      # Database migration history
│   └── ...
├── scripts/
│   ├── run_dev_stack.py                 # Start Next.js + PostgreSQL
│   ├── patch-env.js                     # Env variable patching
│   ├── postgres-local.js                # Local PG start/stop
│   ├── start-router.cjs                 # Production server launcher
│   ├── copy-duckdb-wasm.cjs             # Copy WASM files to public/
│   ├── dc-extract-id-list.cjs           # List extractable projects
│   ├── dc-daily-ingest.cjs              # Daily cron ingestion wrapper
│   ├── migrate-lod-data.cjs             # LOD data migration
│   ├── yjs-server.mjs                   # Hocuspocus YJS server
│   ├── run-tunnel.js                    # ngrok tunnel setup
│   └── ... (data diagnostics, helpers)
├── public/                              # Static assets (favicon, DuckDB WASM)
│   ├── favicon.ico
│   └── duckdb.wasm                      # Copied by postinstall
├── docs/
│   ├── superpowers/                     # Developer guides
│   │   └── codebase-map/                # This codebase map
│   ├── erd.md                           # Prisma ERD diagram
│   ├── activity-attribution-audit.md
│   ├── aps-reference.md
│   ├── CRON_SETUP.md
│   ├── runbook.md
│   └── ... (research, audit docs)
├── .planning/
│   └── codebase/                        # GSD codebase analysis docs
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├── .claude/
│   ├── settings.json
│   ├── projects/
│   │   └── C--LECG-Dashboard/
│   │       └── memory/
│   │           ├── MEMORY.md            # Persistent project memory
│   │           └── *.md                 # Topic files
│   └── keybindings.json
├── .agents/                             # GSD agent framework
├── .env                                 # Local env config (DB, APIs, secrets)
├── .env.example                         # Template
├── package.json                         # npm scripts, dependencies
├── tsconfig.json                        # TypeScript compiler config
├── next.config.ts                       # Next.js build config
├── vitest.config.ts                     # Unit test config
├── playwright.config.ts                 # E2E test config
├── eslint.config.mjs                    # ESLint rules
├── postcss.config.mjs
├── tailwind.config.ts                   # Tailwind CSS config
├── auth.config.ts                       # Auth config file
└── prisma.config.ts
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js 16 App Router pages and API routes
- Contains: Page components (RSC), layouts, loading states, API endpoints
- Key files: `layout.tsx`, `(dashboard)/layout.tsx`, `(dashboard)/access-analysis/page.tsx`

**`app/(dashboard)/access-analysis/`:**
- Purpose: ECharts-based access dashboard (roles, modules, activity donuts)
- Contains: Page.tsx (data loader), chart components, pure helpers (counts, filters), tests
- Key files: `page.tsx` (RSC), `components/AccessAnalysisCharts.tsx`, `roleCounts.ts`

**`app/(dashboard)/users/`:**
- Purpose: User directory + 3D physics graph + dimension sliders
- Contains: User list page, spatial graph page, slider sidebar, graph canvas
- Key files: `spatial-graph/page.tsx`, `access-analysis/CatalogSliderSidebar.tsx`

**`app/api/`:**
- Purpose: HTTP endpoints (TRPC, webhooks, auth callbacks)
- Contains: Route handlers, no rendering
- Key files: `trpc/[trpc]/route.ts`, `auth/[...nextauth]/route.ts`

**`components/`:**
- Purpose: Reusable React components (UI + layout)
- Contains: TSX files organized by feature, mostly client-side interactive
- Key files: `layout/Sidebar.tsx`, `dashboard/ChatPanelWrapper.tsx`, `ui/` (shadcn)

**`lib/server/`:**
- Purpose: Server-side only helpers and data loaders
- Contains: View loaders (accessInstanceView, etc.), cache (acc-hot-cache), integrations
- Key files: `*View.ts` (async data aggregation), `acc-hot-cache.ts` (snapshot cache), `auth.ts`

**`lib/acc/`:**
- Purpose: ACC-specific data models, types, and business logic
- Contains: Activity classification, aggregation, dimension registry, types
- Key files: `activityCategories.ts` (pure), `dimensionCatalog.ts` (registry), `acc-types.ts`

**`lib/client/`:**
- Purpose: Browser-only utilities
- Contains: Particle system, DuckDB WASM, hooks
- Key files: `particle-zones.ts`

**`server/routers/`:**
- Purpose: TRPC RPC endpoints (queries + mutations)
- Contains: Procedure handlers with auth, validation, data fetching
- Key files: `root.ts` (composition), `acc-sync.ts`, `acc-activity.ts`, `acc-graph.ts`

**`server/`:**
- Purpose: Backend configuration and setup
- Contains: Auth config, database client, TRPC context
- Key files: `auth.ts` (NextAuth), `db.ts` (Prisma), `trpc.ts` (procedures)

**`prisma/`:**
- Purpose: Database schema and migrations
- Contains: ORM schema (models), migration SQL
- Key files: `schema.prisma`

**`scripts/`:**
- Purpose: Utility scripts (dev server, cron, data import)
- Contains: Python/Node scripts for setup, import, monitoring
- Key files: `run_dev_stack.py`, `dc-daily-ingest.cjs`

**`docs/`:**
- Purpose: Developer documentation and audit reports
- Contains: Architecture guides, API reference, data audits
- Key files: `erd.md`, `aps-reference.md`, `superpowers/codebase-map/`

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout (global setup)
- `app/(auth)/login/page.tsx`: Auth entry
- `app/(dashboard)/layout.tsx`: Protected dashboard entry
- `app/api/trpc/[trpc]/route.ts`: TRPC API entry

**Configuration:**
- `tsconfig.json`: TypeScript compiler options (path alias `@/*`)
- `next.config.ts`: Next.js build, webpack aliases (DuckDB), server packages
- `vitest.config.ts`: Unit test environment (node, globals)
- `playwright.config.ts`: E2E test browser setup
- `prisma/schema.prisma`: Database models
- `package.json`: Dependencies, npm scripts
- `server/auth.ts`: NextAuth v5 providers + callbacks

**Core Logic:**
- `server/routers/root.ts`: TRPC router composition (19 routers mounted)
- `server/routers/acc-sync.ts`: ACC sync endpoint (webhooks, activity ingestion)
- `server/routers/acc-activity.ts`: Activity query endpoints
- `server/routers/acc-graph.ts`: 3D graph snapshot + slider logic
- `lib/server/acc-hot-cache.ts`: Cached graph snapshots (10min TTL)
- `lib/server/accessInstanceView.ts`: Membership data aggregation
- `lib/acc/activityCategories.ts`: Classify activity (pure function)
- `lib/acc/dimensionCatalog.ts`: Graph dimension registry

**Testing:**
- `app/(dashboard)/access-analysis/__tests__/`: Co-located unit tests
- `server/routers/*.test.ts`: Router-level tests
- `lib/server/__tests__/`: Server logic tests
- `playwright.config.ts`: E2E test config (runs against `:3100`)

## Naming Conventions

**Files:**
- Page routes: `page.tsx` (Next.js convention)
- Loaders: `*View.ts` (e.g., `accessInstanceView.ts`)
- Components: `PascalCase.tsx` (e.g., `RolesPieChart.tsx`)
- Utilities: `camelCase.ts` (e.g., `roleCounts.ts`)
- Tests: `*.test.ts` or `*.test.tsx` (co-located or in `__tests__/`)
- Routes: `route.ts` for API, `page.tsx` for pages

**Directories:**
- Feature domains: singular noun (e.g., `access-analysis`, `users`, `families`)
- Grouping: PascalCase or kebab-case (e.g., `chat-panel`, `wiki-editor`)
- Internal structure: lowercase (e.g., `__tests__`, `components`)

**Variables/Functions:**
- camelCase for functions and variables (e.g., `loadInstanceView()`, `classifyActivity()`)
- UPPER_SNAKE_CASE for constants (e.g., `PG_POOL_MAX`)
- PascalCase for React components and types (e.g., `RolesPieChart`, `ProjectRoleRow`)

## Where to Add New Code

**New Feature (e.g., new dashboard page):**
- Primary code: Create `app/(dashboard)/my-feature/` with `page.tsx`, `components/`, `*.ts` utilities
- Tests: Add `__tests__/` directory alongside components and pure functions
- TRPC endpoint: If needs backend API, add `server/routers/my-feature.ts` and mount in `server/routers/root.ts`
- Styles: Use Tailwind classes in TSX, no separate CSS files (unless shared theme tokens)

**New Component/Module:**
- Implementation: `components/my-module/MyComponent.tsx`
- Sub-components: `components/my-module/SubComponent.tsx` (co-located)
- Styles: Tailwind (inline) or CSS modules if complex
- Tests: `components/my-module/__tests__/MyComponent.test.tsx`

**Utilities & Helpers:**
- Client-side: `lib/client/myHelper.ts`
- Server-side: `lib/server/myHelper.ts`
- Shared logic: `lib/shared/myHelper.ts`
- Feature-specific: `app/(dashboard)/my-feature/myHelper.ts`
- Pure functions: Near where used, or in `lib/acc/` if ACC-related

**New TRPC Router:**
1. Create `server/routers/my-router.ts` with `router()` and `export const myRouter = ...`
2. Import in `server/routers/root.ts` and add to composition: `myRouter: myRouter`
3. Procedures use `protectedProcedure` (default), `adminProcedure` (ADMIN only), or `publicProcedure`
4. Add `.input(z.object(...))` for validation
5. Add `.query()` or `.mutation()` with async handler

**New Database Model:**
1. Edit `prisma/schema.prisma` (add model, relations, indexes)
2. Run `npx prisma migrate dev --name my_migration` (creates migration SQL)
3. Use `db.myModel.findMany()` etc. in routers/views

**New API Route:**
1. Create `app/api/my-endpoint/route.ts` with `export async function GET/POST(request: Request) { ... }`
2. Return `Response` or `NextResponse`
3. For webhook: validate signature, parse payload, update DB, return 200

## Special Directories

**`.next/`:**
- Purpose: Next.js build output (compiled code, type definitions)
- Generated: Yes (by `npm run build`)
- Committed: No (in `.gitignore`)

**`prisma/migrations/`:**
- Purpose: Database migration history (SQL files)
- Generated: By `npx prisma migrate dev`
- Committed: Yes (part of version control)

**`.env`:**
- Purpose: Local environment variables (DATABASE_URL, API keys, secrets)
- Generated: No (manually created from `.env.example`)
- Committed: No (in `.gitignore` — secrets safety)

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: By `/gsd-map-codebase` skill
- Committed: Yes (reference for future tasks)

**`docs/superpowers/`:**
- Purpose: Developer workflows and team playbooks
- Generated: By `/gsd-docs-update` skill
- Committed: Yes (team knowledge base)

**`scripts/`:**
- Purpose: Utility scripts for development, deployment, data operations
- Generated: Manual creation or scaffolding
- Committed: Yes (team tooling)

---

*Structure analysis: 2026-06-17*
