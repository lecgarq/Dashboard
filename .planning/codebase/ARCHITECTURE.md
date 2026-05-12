# Architecture

**Analysis Date:** 2026-05-12

## Pattern Overview

**Overall:** Next.js Full-Stack with tRPC + Prisma + Component-Driven UI

**Key Characteristics:**
- Server-side rendering (SSR) with async layout prefetching
- RPC-style API via tRPC with procedure-based access control
- Role-based middleware (publicProcedure, protectedProcedure, adminProcedure, editorProcedure)
- PostgreSQL database with Prisma ORM and connection pooling
- Next-Auth v5 for session-based authentication
- Client-side data fetching via @tanstack/react-query + tRPC hooks

## Layers

**API Layer (Server):**
- Purpose: Define RPC endpoints with validation and auth checks
- Location: `server/routers/` (25 routers covering families, clash, exam, KPI, users, ACC, etc.)
- Contains: tRPC procedure definitions with Zod input validation
- Depends on: Prisma ORM (`server/db.ts`), auth context, integration services
- Used by: Client via HTTP batch requests to `/api/trpc`

**Business Logic Layer:**
- Purpose: Data processing, external API integration, graph computation
- Location: `lib/server/`, `lib/acc/`, `lib/google/`, `lib/trello/`
- Contains: ACC admin utilities (`acc-admin.ts`), graph rebuild logic (`graph-rebuild.ts`), email service (`email.ts`), APS token fetching (`aps-user-token.ts`)
- Depends on: Database (Prisma), external APIs (APS, Google, Autodesk)
- Used by: Server routers and API routes

**Data Access Layer:**
- Purpose: Database queries and persistence
- Location: `prisma/schema.prisma`, `server/db.ts`
- Contains: Prisma models for User, Project, Family, Tasks, Workspace, ACC entities
- Depends on: PostgreSQL via connection pool
- Used by: All server-side code via injected `ctx.db`

**Presentation Layer:**
- Purpose: React components for UI rendering
- Location: `app/(dashboard)/`, `components/`
- Contains: Page components (layout, home, families, users, etc.), container components (panels, charts), UI primitives (button, input, table)
- Depends on: tRPC hooks (`trpc.useQuery()`), auth providers, context providers
- Used by: Next.js router to render pages

**Middleware & Configuration:**
- Purpose: Auth, logging, providers
- Location: `server/auth.ts` (NextAuth config), `server/trpc.ts` (tRPC context + procedures), `lib/core/providers.tsx` (React providers)
- Contains: Session management, tRPC context setup, role-based guards
- Used by: All layers

## Data Flow

**Server-Side Rendering (Initial Page Load):**

1. User navigates to `/dashboard/{page}`
2. `app/(dashboard)/layout.tsx` checks auth via `auth()`
3. Dashboard layout creates server-side helpers via `createServerSideHelpers()`
4. Helpers prefetch queries (families, clash sections, exams, KPI, tasks, etc.) via Prisma
5. Layout renders with dehydrated state, wraps children in context providers
6. Page component renders with prefetched data available

**Client-Side Data Fetching:**

1. Component calls `trpc.query.{router}.{procedure}.useQuery({input})`
2. React Query manages request lifecycle (staleTime: 5min, gcTime: 1hr)
3. tRPC client batches requests to `/api/trpc` via `httpBatchLink`
4. Server handler (`app/api/trpc/[trpc]/route.ts`) routes to `appRouter`
5. Procedure checks auth via context session, executes via `ctx.db` Prisma queries
6. Response serialized via superjson, returned to client
7. React Query updates component state, re-renders

**State Management:**

- **Server State:** PostgreSQL via Prisma (single source of truth)
- **Session State:** Next-Auth cookies + React context (`DashboardAuthProvider`, `ProjectProvider`)
- **UI State:** React component state, React Query cache
- **Real-time State:** Event streams for notifications (email, chat), webhook receivers for external updates (Trello, clash/sim webhooks)

## Key Abstractions

**tRPC Procedure Pattern:**

Located in `server/trpc.ts`. Provides layered access control:

```typescript
publicProcedure           // No auth required
protectedProcedure        // User authenticated
adminProcedure            // User.role === "ADMIN"
editorProcedure           // User.role in ["EDITOR", "ADMIN"]
```

Each procedure receives `ctx: { session, db, projectId }` and can be chained with `.input(schema).query/mutation`.

Examples: `server/routers/families.ts`, `server/routers/users.ts`

**Module Access Control:**

- `UserModuleAccess` table in Prisma tracks which users can see which modules
- Module visibility controlled via `@/lib/modules/documentation.ts` and router-level checks
- Users without access receive 403 FORBIDDEN

**Graph Computation (ACC Users Tab):**

Located in `lib/acc/`, builds 3D graph of folder hierarchies and user permissions:

- `quick-sync-extraction.ts`: Parses ACC folder/member data into graph nodes/edges
- `folderCrawl.ts`: Recursive folder traversal with permission inheritance
- `userSimilarity.ts`: Positional similarity scoring for clustering
- `graphSnapshot.ts`: Serializes graph state with node positions for rendering
- `accUserSpatialProfile.ts`: User profile computation in spatial graph context

Used by: `server/routers/acc-graph.ts`, `server/routers/users.ts`

**Event System:**

Located in `lib/events/`:

- Modules (user, clash, sim, trello) emit events on mutations
- Example: `user.emit('activity', { userId, action, timestamp })`
- Consumed by: Dashboard analytics, activity feeds, webhooks

**Integration Error Handling:**

`lib/server/integration-errors.ts` wraps external API errors:

- `IntegrationError` with code: `reconnect_required`, `forbidden`, `config_missing`, etc.
- Maps to tRPC codes: UNAUTHORIZED (reconnect) or FORBIDDEN (no privilege)
- Prevents token leaks in error messages

## Entry Points

**Web Application:**

- Location: `app/layout.tsx` (root), `app/(dashboard)/layout.tsx` (authenticated dashboard)
- Triggers: Browser navigation or SSR from Next.js server
- Responsibilities: Auth check, context setup, layout render, prefetch initial data

**API Handler (tRPC):**

- Location: `app/api/trpc/[trpc]/route.ts`
- Triggers: POST/GET to `/api/trpc?batch=...` with JSON-RPC payload
- Responsibilities: Route to tRPC router, execute procedure, return JSON response

**Webhook Receivers:**

- Location: `app/api/events/{trello,users,clash-updates,sim-updates}/route.ts`
- Triggers: External service POST (Trello webhooks, email notifications)
- Responsibilities: Parse payload, validate signature, emit events or update DB

**Authentication Callbacks:**

- Location: `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/callback/trello/route.ts`
- Triggers: OAuth provider redirects or session checks
- Responsibilities: Handle credentials, create sessions, link providers

**Background Tasks:**

- Location: `lib/server/graph-rebuild.ts` (cache invalidation), `services/lod-engine/` (Python image processing)
- Triggers: Cron jobs via Railway scheduler, mutation side-effects
- Responsibilities: Rebuild ACC graph cache, process model derivatives

## Error Handling

**Strategy:** Layered error handling with type-specific catch blocks

**Patterns:**

- **Validation Errors:** Zod schema validation in tRPC input → 400 Bad Request
- **Auth Errors:** Missing/expired session → 401 UNAUTHORIZED
- **Permission Errors:** User lacks role/module access → 403 FORBIDDEN
- **Integration Errors:** External API (APS, Google) failure → IntegrationError wrapper → 500 or user-visible message
- **Database Errors:** Prisma query error → logged, 500 returned
- **Client-side:** React Query retry logic (1 retry, exponential backoff), error boundaries, toast notifications

Examples:
- `server/routers/users.ts`: `toAccRouterError()` converts IntegrationError to tRPC errors
- `app/api/wiki-media/[id]/route.ts`: Catches GoogleIntegrationError, returns 403 or 500

## Cross-Cutting Concerns

**Logging:** 

- `lib/server/logger.ts` wraps console.log with context
- Usage: `const logger = createLogger("module-name"); logger.error("msg", { field: value })`
- Logs sent to stdout (Railway captures for monitoring)

**Validation:**

- Zod schemas in tRPC input blocks prevent invalid data from reaching handlers
- Example: `familyPhaseSchema` enforces phase enum in families router
- Prisma model constraints (unique, required fields) provide secondary layer

**Authentication:**

- Next-Auth handles OAuth/credential flows
- Session stored in cookie, validated on each request
- `createTRPCContext()` loads session via `auth()` (cached via React.cache)
- Protected procedures check `ctx.session?.user` existence and role

**Rate Limiting:**

- Not implemented at application level; delegated to Railway/hosting platform
- tRPC procedures execute synchronously; long-running tasks use background jobs

