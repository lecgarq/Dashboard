# Architecture

**Analysis Date:** 2026-05-19

## Pattern Overview

**Overall:** Next.js 16 Full-Stack Application with Server-Side Rendering + tRPC Backend

**Key Characteristics:**
- Hybrid rendering (SSR for authenticated pages, Client for interactive dashboards)
- Type-safe RPC communication via tRPC with React Query
- PostgreSQL database via Prisma ORM with local PG 18 support
- Multi-tenant per-project design with granular permission scoping
- Event-driven architecture for real-time sync and notifications
- OAuth 2.0 multi-provider auth (Google, Autodesk 3-legged, Credentials)

## Layers

**Presentation Layer:**
- Purpose: React components, pages, layouts, UI interactions
- Location: `app/` (Next.js App Router), `components/`
- Contains: Page components, layout wrappers, form controls, visualizations
- Depends on: tRPC client hooks, React Query, next-auth session
- Used by: Browser/client requests

**API/tRPC Layer:**
- Purpose: Type-safe RPC endpoints bridging client and server
- Location: `server/routers/`, `app/api/trpc/[trpc]/route.ts`
- Contains: Router definitions, procedure definitions (public/protected/admin/editor), context builders
- Depends on: Database (Prisma), external integrations, authentication
- Used by: Client-side tRPC hooks

**Business Logic Layer:**
- Purpose: Domain-specific algorithms, data transformations, business rules
- Location: `lib/acc/` (ACC/Autodesk logic), `lib/server/` (server utilities), `lib/modules/` (feature modules)
- Contains: Data ingest pipelines, graph algorithms, permission mapping, DC API abstraction
- Depends on: Database models, external APIs
- Used by: Routers, scheduled jobs

**Database Layer:**
- Purpose: Data persistence and modeling
- Location: `prisma/schema.prisma`, `server/db.ts`
- Contains: User auth models, project/family/task entities, activity logs, sync state
- Depends on: PostgreSQL 18 (local or pooled)
- Used by: Prisma Client in all server code

**Authentication Layer:**
- Purpose: Session management, OAuth flows, permission checking
- Location: `server/auth.ts`, `lib/auth-env.ts`, `types/next-auth.d.ts`
- Contains: NextAuth config, Prisma adapter, provider callbacks, JWT/session lifecycle
- Depends on: Google OAuth, Autodesk API, Credentials DB, environment variables
- Used by: All protected routes and API endpoints

## Data Flow

**Authentication & Session Flow:**

1. User navigates to `/login`
2. OAuth provider selection (Google, Autodesk, Credentials)
3. Provider callback to `app/api/auth/[...nextauth]/route.ts`
4. `server/auth.ts` signIn callback:
   - Finds or creates User record in DB
   - Upserts Account (OAuth identity) linked to User
   - Emits user-linked event
5. JWT token created with user role, providers, moduleAccess
6. Session available client-side via `useSession()` and server-side via `auth()`

**Request Data Flow (Client → Server):**

1. Client calls `trpc.router.procedure.useQuery()` or `.useMutation()`
2. React Query batch-sends to `/api/trpc/[trpc]` endpoint
3. `createTRPCContext()` builds context: { db, auth session, projectId, user }
4. Router procedure checks access via `protectedProcedure`, `adminProcedure`, etc.
5. Business logic in `lib/acc/`, `lib/server/` executes
6. Prisma queries database
7. Response serialized via SuperJSON (handles Date, Map, Set)
8. Client receives typed data via React Query

**ACC Activity Data Ingest:**

1. Scheduled job (cron) or manual trigger calls `dcIngest.ts`
2. Fetches activity CSVs from APS Data Connector API (3-legged auth)
3. Parses CSV into activity objects via `dcActivityCsvIngest.ts`
4. Schema mapping: CSV columns → AccActivity model columns (real schema per `dcIngest.ts`)
5. Batch insert/update via Prisma `accActivity.createMany()` or upserts
6. Sync progress tracked in `SyncCenterState` model
7. Activity data available in graphs, exports, dashboards

**Graph Rebuild & User Similarity:**

1. Trigger: sync completion event or manual request
2. `lib/server/graph-rebuild.ts` orchestrates rebuild
3. Query all AccActivity records for date range
4. `userSimilarity.ts` calculates user-to-user similarity (positional clustering only)
5. `quick-sync-extraction.ts` builds node/edge data from activities
6. Cosmos.gl graph frozen snapshot created in database
7. Frontend fetches snapshot, renders via `@cosmos.gl/graph` with custom styling

## State Management

**Server State:**
- Prisma models (single source of truth)
- User auth state in NextAuth JWT
- Sync progress and control flags in DB

**Client State:**
- React Query cache (managed via TRPCProvider)
- Session state via SessionProvider (next-auth)
- Component local state (React hooks)
- ParticleZoneProvider for UI effects

**Real-Time Updates:**
- Event emitters for user login, activity changes
- WebSocket via Yjs collaboration (tiptap rich text, live editing)
- Manual refetch via React Query invalidation on button clicks
- No real-time subscriptions (polling pattern used instead)

## Key Abstractions

**TRPC Router:**
- Purpose: Type-safe RPC definition, access control
- Examples: `server/routers/families.ts`, `server/routers/users.ts`, `server/routers/acc-sync.ts`
- Pattern: `router({ procedure: protectedProcedure.input().query() })`

**Prisma Models:**
- Purpose: ORM schema with relations, constraints, indexes
- Examples: `User`, `Project`, `Family`, `AccActivity`, `UserModuleAccess`
- Pattern: Relations cascade on delete, indexes on frequently queried columns (phase, dueDate, updatedAt)

**Auth Context (JWT Token):**
- Purpose: Carry user identity, role, permissions across requests
- Data: `id`, `email`, `role`, `isPrimaryAdmin`, `moduleAccess[]`, `providers[]`
- Pattern: Decoded server-side via NextAuth, available in tRPC context

**Project Context:**
- Purpose: Multi-tenancy boundary
- Data: `projectId` stored in session during ProjectProvider wrap
- Pattern: `ctx.projectId` used in all family/clash/sim queries to enforce data isolation

**Logger (Structured):**
- Purpose: JSON logging for debugging
- Location: `lib/server/logger.ts`
- Pattern: `createLogger("domain").debug/info/warn/error(msg, metadata)`

## Entry Points

**Server Bootstrap:**
- Location: `app/layout.tsx` → `TRPCProvider` → `lib/core/providers.tsx`
- Triggers: Application startup
- Responsibilities: Initialize React Query client, tRPC client with httpBatchLink, set up superjson transformer

**Dashboard Layout:**
- Location: `app/(dashboard)/layout.tsx`
- Triggers: Any authenticated navigation
- Responsibilities:
  - Call `auth()` to get session, redirect if missing
  - Prefetch critical queries via `createServerSideHelpers` (families, exams, tasks, KPI)
  - Wrap with SessionProvider, DashboardAuthProvider, ProjectProvider
  - Render Sidebar, MainContent area, ChatPanel, MailPanel

**API tRPC Endpoint:**
- Location: `app/api/trpc/[trpc]/route.ts`
- Triggers: Client tRPC calls to `/api/trpc`
- Responsibilities: Create context, route to appropriate procedure, handle errors

**Scheduled Jobs:**
- Locations: `scripts/dc-daily-ingest.cjs`, `scripts/folder-crawl-cron.cjs`
- Triggers: Railway cron (production) or Task Scheduler (local)
- Responsibilities: Ingest data, rebuild graphs, sync state

## Error Handling

**Strategy:** Explicit error objects + logging, graceful client fallback

**Patterns:**

**tRPC Procedures:**
```typescript
protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const item = await ctx.db.family.findUnique({ where: { id: input.id } });
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  })
```

**Server-Side Helpers:**
```typescript
try {
  const result = await someAsyncOperation();
} catch (err) {
  logger.error("Operation failed", { err });
  throw new Error("User-facing message");
}
```

**Client-Side Handling:**
```typescript
const { data, isLoading, error } = trpc.router.procedure.useQuery();
if (error) return <ErrorBoundary error={error.message} />;
```

## Cross-Cutting Concerns

**Logging:** 
- Centralized via `lib/server/logger.ts`
- Structured JSON format with metadata
- Applied in routers, auth, integrations, scheduled jobs

**Validation:**
- Input: Zod schemas in every tRPC procedure `.input()`
- Database: Prisma constraints (unique, required, defaults)
- Output: Type-safe via TypeScript and tRPC response types

**Authentication:**
- Session-based via NextAuth JWT
- Multi-provider (Google, Autodesk, Credentials)
- Role-based access: ADMIN, EDITOR, VIEWER, VIEWER_READONLY
- Module-level scoping: `UserModuleAccess` model tracks per-user feature access

**Authorization:**
- Protected procedures: `protectedProcedure` requires valid session
- Admin procedures: `adminProcedure` requires `role === "ADMIN"`
- Editor procedures: `editorProcedure` requires edit-level role
- Project scoping: Queries filtered by `ctx.projectId` from session

**External API Integration:**
- Abstracted in `lib/server/integrations/` (APS, Google APIs)
- OAuth tokens stored in Account model, refreshed on-demand
- Rate limits handled per service (APS DC has ~25 req/day quota)
- Fallback patterns for failed integrations (sync state tracking)

---

*Architecture analysis: 2026-05-19*
