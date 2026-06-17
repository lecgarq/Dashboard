<!-- refreshed: 2026-06-17 -->
# Architecture

**Analysis Date:** 2026-06-17

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Browser / Client (React 19)                       │
│     TRPCProvider (httpBatchLink) → QueryClient (React Query 5)              │
├─────────────────────────────────────────────────────────────────────────────┤
│ App Router Pages (Next.js 16)  │  Components (TSX/CSS)   │  Client Hooks   │
│  `app/(auth)/`                  │  `components/`           │  `lib/client/`  │
│  `app/(dashboard)/`             │  UI (shadcn), Layouts   │  TRPC consumer  │
│  Auth guard + Providers         │  Charts, Panels         │  State mgmt     │
├─────────────────────────────────────────────────────────────────────────────┤
│              TRPC API Layer (`/api/trpc/[trpc]/route.ts`)                  │
│         Batched JSON-RPC over HTTP with SuperJSON serialization            │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Server-Side TRPC Routers (`server/routers/`)            │
│   ┌─────────────────┬─────────────────┬─────────────────┬──────────────┐   │
│   │ Core Domain     │ Integrations    │ Analysis/Graphs │ Support      │   │
│   ├─────────────────┼─────────────────┼─────────────────┼──────────────┤   │
│   │ families.ts     │ acc-sync.ts     │ acc-dc-graph.ts │ chat.ts      │   │
│   │ clash.ts        │ aps-search.ts   │ acc-graph.ts    │ gmail.ts     │   │
│   │ exam.ts         │ trello.ts       │ acc-person-graph│ calendar.ts  │   │
│   │ tasks.ts        │ gmail.ts        │ acc-activity.ts │ search.ts    │   │
│   │ sim.ts          │ lod.ts          │ acc-members.ts  │ lod.ts       │   │
│   │ users.ts        │ workspace.ts    │ acc-folders.ts  │ workspace.ts │   │
│   │ project.ts      │                 │                 │              │   │
│   │ kpi.ts          │                 │                 │              │   │
│   └─────────────────┴─────────────────┴─────────────────┴──────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│             Server-Side Business Logic & Data Access Layers                 │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │ Views (load* functions) — Pre-computed aggregates for pages          │  │
│   │ `lib/server/accessInstanceView.ts`       → /access-analysis         │  │
│   │ `lib/server/folderPermissionTerrainView` → Terrain visualization    │  │
│   │ `lib/server/activityByActorView.ts`      → Activity by role donut   │  │
│   │ `lib/server/moduleActivityView.ts`       → Module activity data     │  │
│   │ `lib/server/projectCoverageView.ts`      → Coverage metrics         │  │
│   │ `lib/server/acc-hot-cache.ts`            → Cached graph snapshots   │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │ Business Logic — Domain-specific calculations & transformations     │  │
│   │ `lib/acc/` — Classification, aggregation, activity analysis         │  │
│   │ `lib/shared/` — Shared types and helpers                            │  │
│   │ `server/actions/` — Server-side mutations                           │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Data Persistence Layer                                   │
│   ┌──────────────────────┬──────────────────┬───────────────────────────┐   │
│   │ Prisma ORM           │ External APIs    │ Client Caching            │   │
│   ├──────────────────────┼──────────────────┼───────────────────────────┤   │
│   │ PostgreSQL Local     │ APS (OAuth)      │ DuckDB-WASM (browser)     │   │
│   │ (`prisma/schema.prisma`) │ ACC Data Source │ Client-side analysis   │   │
│   │ Models: User, Project,   │ Gmail API      │                           │   │
│   │ Task, Family, Clash,     │ Google Drive   │                           │   │
│   │ Sim, Module, Activity    │ Trello         │                           │   │
│   └──────────────────────────┴──────────────────┴───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root Layout | Global styles, fonts, theme provider, TRPC provider, sonner toast | `app/layout.tsx` |
| Dashboard Layout | Auth guard, sidebar, main content area, particle effects, chat/mail panels | `app/(dashboard)/layout.tsx` |
| Auth Layout | Login, register, password reset routes | `app/(auth)/` |
| Access Analysis Page | Server-side data aggregation, ECharts dashboard with roles/modules/activity donuts | `app/(dashboard)/access-analysis/page.tsx` |
| Users Graph | 3D physics graph visualization, dimension sliders, profile drawer | `app/(dashboard)/users/` |
| Sidebar | Navigation, project switcher, credential banner | `components/layout/Sidebar.tsx` |
| TRPC Router | All RPC endpoints, auth, integrations, analysis queries | `server/routers/root.ts` |
| Prisma Client | Database connection pool, schema-driven ORM | `server/db.ts` |
| View Loaders | Pre-computed aggregates for /access-analysis and graph pages | `lib/server/*View.ts` |
| ACC Hot Cache | Cached graph snapshots (nodes, edges) with invalidation | `lib/server/acc-hot-cache.ts` |

## Pattern Overview

**Overall:** Server-Driven Hybrid Architecture

**Key Characteristics:**
- **Data Layer:** PostgreSQL (Prisma ORM) + external APIs (APS, Gmail, Google Drive, Trello)
- **API Layer:** TRPC (JSON-RPC over HTTP) with batched requests and SuperJSON serialization
- **Rendering:** Next.js 16 App Router with RSC (Server Components) for data-heavy pages, React for interactive UI
- **State Management:** React Query (client-side caching), Zustand (local UI state in components), RSC hydration boundaries
- **Charts/Visualization:** ECharts (D3-like), cosmos.gl (3D GPU physics), DuckDB-WASM (client-side analytics)
- **Auth:** NextAuth v5 (multi-provider: APS OAuth, Google, Autodesk)

## Layers

**Client Layer (Browser):**
- Purpose: Interactive UI, real-time interactions, client-side analytics
- Location: `app/(dashboard)/`, `components/`, `lib/client/`
- Contains: TSX components, custom hooks (useQuery via TRPC), CSS modules, Tailwind styles
- Depends on: TRPC client (via `lib/core/trpc.ts`), React Query
- Used by: Browser, end users

**API Layer (HTTP):**
- Purpose: JSON-RPC bridge between client and server, request batching, auth middleware
- Location: `app/api/trpc/[trpc]/route.ts`
- Contains: TRPC HTTP handler, SuperJSON transformer
- Depends on: Server routers, auth context
- Used by: Client via httpBatchLink

**Server Router Layer (Business Logic):**
- Purpose: TRPC route handlers, permission checks, data fetching/transformations
- Location: `server/routers/*.ts`
- Contains: `protectedProcedure`, `adminProcedure`, query/mutation logic, validation (Zod)
- Depends on: Database, external APIs, views/helpers
- Used by: TRPC API layer

**View Layer (Pre-computed Data):**
- Purpose: Aggregate complex queries once, serve to pages and routers
- Location: `lib/server/*View.ts`
- Contains: SQL aggregations, data shape transformations (e.g., accessInstanceView → single JOIN across roles/folders)
- Depends on: Prisma client, external APIs
- Used by: Pages (RSC), routers, hot-cache

**Business Logic Layer (Utilities):**
- Purpose: Domain-specific transformations, classifications, calculations
- Location: `lib/acc/`, `lib/shared/`, `server/actions/`
- Contains: Pure functions (classify activity, aggregate counts, merge role names)
- Depends on: Types, data structures
- Used by: Routers, views, pages

**Data Persistence Layer (Storage):**
- Purpose: Store and retrieve persistent state
- Location: PostgreSQL (local), external APIs (APS, Gmail, Google)
- Contains: Prisma models (User, Project, Task, Family, Activity, etc.), third-party data
- Depends on: Network, database credentials
- Used by: All server logic

## Data Flow

### Primary Request Path (Access Analysis Page)

1. User navigates to `/access-analysis` → Next.js routes to `app/(dashboard)/access-analysis/page.tsx` (SSR)
2. Page executes server-side data loaders in parallel (`loadInstanceView`, `loadModuleActivity`, `loadActivityByActor`, etc.)
3. Each loader queries Prisma + external APIs → aggregates data (JOINs, GROUP BY)
4. Loaders return pre-shaped rows (slim ProjectRoleRow[], AccActivity[], etc.)
5. Page renders static `AccessAnalysisCharts` component with props
6. Client-side: Charts hydrate as interactive ECharts instances (click to filter/drill)
7. User clicks donut segment → PeopleDrillList component fetches TRPC query `accMembers.getByProject()`
8. TRPC router executes query, returns people data, client renders drawer

**Files involved:**
- `app/(dashboard)/access-analysis/page.tsx` (RSC, entry)
- `lib/server/accessInstanceView.ts` (view loader)
- `server/routers/acc-members.ts` (TRPC for drill-down)
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (client component wrapper)
- `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` (ECharts consumer)

### Graph Rebuild Flow

1. Page loads `/users/spatial-graph` → `app/(dashboard)/users/spatial-graph/page.tsx` (RSC)
2. Page calls `loadGraphSnapshot()` via TRPC `accGraph.getSnapshot()`
3. Router checks hot-cache (`lib/server/acc-hot-cache.ts`)
4. If cache miss → rebuild from DB: SQL query → structure nodes/edges → cache 10min
5. Page renders `GraphCanvas` (3D cosmos.gl) with frozen snapshot
6. Client slider interaction → TRPC `accGraph.applySliders()` → hot-cache reposition logic
7. Canvas updates 3D positions in real-time, GPU forces compute layout

**Files involved:**
- `server/routers/acc-graph.ts` (TRPC snapshot + slider endpoints)
- `lib/server/acc-hot-cache.ts` (cache layer, rebuild, position recompute)
- `app/(dashboard)/users/spatial-graph/GraphCanvas.tsx` (cosmos.gl 3D renderer)
- `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx` (dimension controls)

### Activity Attribution Flow

1. Cron job or manual trigger calls `accSync.synchronizeProjects(projectId)`
2. Router fetches project's ACC activities via APS SDK
3. Calls `classifyActivity(rawAction)` from `lib/acc/activityCategories.ts`
4. Stores `AccActivity` rows in Postgres via Prisma
5. Later, `/access-analysis` page calls `loadActivityByActor()` which JOINs AccActivity + AccDcProjectUser
6. Activity counts aggregate by actor's roles (via mergeRoleNames) → activity-by-role donut data
7. Client renders donut, user clicks to drill into PeopleDrillList

**Files involved:**
- `server/routers/acc-sync.ts` (sync TRPC endpoint)
- `lib/acc/activityCategories.ts` (pure classification)
- `lib/server/unifiedActivitySource.ts` (merge activity sources)
- `lib/server/activityByActorView.ts` (aggregation view)

**State Management:**
- **Server state:** Prisma models + external API state (APS project data, Gmail folders)
- **Cache state:** Redis (Upstash) for session-ephemeral data, hot-cache for graph snapshots
- **Client state:** React Query (TRPC hooks) for remote data, Zustand stores for UI state (e.g., selected project, slider values)
- **Hydration:** HydrationBoundary in dashboard layout pre-fetches core queries (families, clash sections, kpi)

## Key Abstractions

**View Pattern (lib/server/*View.ts):**
- Purpose: Decouple page queries from raw schema, pre-compute aggregates
- Examples: `loadInstanceView()` → single flat table with 1 row per membership, `loadModuleActivity()` → module-activity counts
- Pattern: Async function that JOINs Prisma models, returns typed array, called during RSC render

**Router Procedure Pattern (server/routers/):**
- Purpose: Declarative RPC endpoints with auth/validation middleware
- Pattern: `router.query('endpoint', protectedProcedure.input(z.object(...)).query(async ({ input, ctx }) => { ... }))`
- Middleware: `protectedProcedure` (require user), `adminProcedure` (require ADMIN role), `publicProcedure` (no auth)

**Component Layering:**
- **Page:** RSC, server-only data loading, minimal state
- **Shell:** Client-side provider (context, Zustand), layout wrapper
- **Panel:** Isolated feature (e.g., RolesPieChart), interactive
- **UI:** Atomic components (Button, Dropdown), reusable

**Dimension Catalog (lib/acc/dimensionCatalog.ts):**
- Purpose: Registry of graph dimensions (Project, Role, User, etc.) with metadata (color, slider range)
- Pattern: Pure data structure (`CatalogDimension[]`) + lookup helpers, drives slider UI and graph positioning

**Activity Classification (lib/acc/activityCategories.ts):**
- Purpose: Map raw APS action strings → business categories (Edit, View, etc.)
- Pattern: Pure function `classifyActivity(rawAction) → ActivityCategory`

## Entry Points

**Web App:**
- Location: `app/layout.tsx` (root), `app/(auth)/login/page.tsx` (auth entry)
- Triggers: HTTP request to `/` or `/login`
- Responsibilities: Setup global providers, render layout tree

**Protected Dashboard:**
- Location: `app/(dashboard)/layout.tsx`
- Triggers: Authenticated HTTP request to any `/dashboard/*` or `/` route
- Responsibilities: Auth guard (`redirect` if no session), prefetch core TRPC queries, render sidebar + main

**API Routes:**
- Location: `app/api/trpc/[trpc]/route.ts` (TRPC RPC handler)
- Triggers: HTTP POST to `/api/trpc/*` (batched JSON-RPC)
- Responsibilities: Deserialize input, auth check, route to procedure, serialize output

**Webhook Routes:**
- Location: `app/api/clash-updates/route.ts`, `app/api/sim-updates/route.ts`
- Triggers: External service POST (ACC webhooks)
- Responsibilities: Parse payload, update database, trigger cron/sync

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop; long-running queries use connection pool (PG_POOL_MAX=32 in production). No worker threads.
- **Global state:** `_cachedProjectId` in `server/trpc.ts` (cached once per process); Prisma client singleton in `server/db.ts`; hot-cache in `lib/server/acc-hot-cache.ts` is process-local (10min TTL, invalidated on write)
- **Circular imports:** None detected; `lib/` is always imported by `app/` or `server/`, never the reverse
- **Build constraints:** `next build` typechecks entire codebase including test files (no ignoreBuildErrors); any tsc error blocks deploy
- **Client-side isolation:** `"use client"` boundary enforced at component level; server-only imports fail at build time
- **Memory constraints:** `lib/server/accessInstanceView.ts` loads ~5M AccFolderPermission rows on first load → 77s OOM risk; mitigated with GROUP BY aggregation (→ 21k rows, 9s load)

## Anti-Patterns

### Blocking Hot-Cache Invalidation

**What happens:** Page writes new AccActivity rows to DB but hot-cache snapshot doesn't clear; next `/users/spatial-graph` load serves stale node/edge counts.

**Why it's wrong:** Graph visualization shows outdated activity recency dimension; user confusion, debugging nightmare.

**Do this instead:** Router endpoint that mutates data MUST call `invalidateSnapshot()` from `lib/server/acc-hot-cache.ts` before returning. Use `await db.$transaction()` for atomicity.

### Bare Prisma Queries in Routes

**What happens:** Router calls `db.activity.findMany({ ... })` directly instead of using `loadActivityByActor()` view.

**Why it's wrong:** Duplicates complex JOINs, hard to maintain consistency, different pages compute different aggregates of the same data.

**Do this instead:** Define view loader in `lib/server/*View.ts`, use it from both pages and routers. View is single source of truth for aggregation logic.

### Mixing Server & Client State

**What happens:** Component has `"use client"` but tries to call `db.query()` or import server-only module.

**Why it's wrong:** Breaks build; Next.js rightfully rejects it. Subtle bugs if you catch imports at load-time instead of compile-time.

**Do this instead:** Keep data fetching in RSC page, pass data via props to `"use client"` panels. If interactive filtering needed, fetch via TRPC hook.

### Unvalidated Input in Routers

**What happens:** `router.query('search', publicProcedure.input(z.string()).query(...))` accepts any string without bounds.

**Why it's wrong:** Query can be large (KB+ string), causes DB query explosion, DOS risk.

**Do this instead:** Always `.max(100)` on string inputs, use `.refine()` for domain validation (e.g., `projectId` must exist in DB).

## Error Handling

**Strategy:** Error boundary + toast notifications + fallback UI

**Patterns:**
- **Auth errors:** `TRPCError({ code: "UNAUTHORIZED" })` thrown by middleware → caught by TRPC client → redirect to `/login` via `DualAuthGuard`
- **Permission errors:** `TRPCError({ code: "FORBIDDEN" })` thrown by `adminProcedure` → client shows toast "Access Denied"
- **Validation errors:** `TRPCError({ code: "BAD_REQUEST" })` from Zod parse failure → client logs validation details
- **Network errors:** React Query retries once, then shows error toast via `onError` callback
- **Component errors:** ErrorBoundary wraps page content, renders fallback UI instead of crashing
- **Server errors:** `TRPCError({ code: "INTERNAL_SERVER_ERROR" })` wraps unexpected exceptions, logged to console (dev) or Sentry (prod)

## Cross-Cutting Concerns

**Logging:** No centralized logger configured; development uses `console.error/warn`, production strips `console.log` via Next.js compiler.

**Validation:** Zod schemas on all TRPC inputs; Prisma schema validates database constraints; no manual runtime validation.

**Authentication:** NextAuth v5 with multi-provider (Autodesk APS, Google, custom email+password); session stored in secure cookie; `auth()` function in `server/auth.ts` is cached per request.

**Authorization:** Role-based access control (`ADMIN`, `EDITOR`, `VIEWER`) enforced in middleware (`protectedProcedure`, `adminProcedure`); per-project scoping via `ctx.projectId` (cached singleton).

**Rate Limiting:** None configured at application level; relies on PostgreSQL connection pool backpressure and external API rate limits (APS: 2 req/s, Gmail: daily quota).

---

*Architecture analysis: 2026-06-17*
