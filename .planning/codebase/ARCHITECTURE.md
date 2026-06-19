# Architecture

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/manifest.json`
- `.tools/repo-map/dependency-cruiser.json`
- `server/routers/root.ts`
- `server/trpc.ts`
- `server/db.ts`

## Pattern Overview

**Overall:** Full-stack Next.js modular monolith with tRPC request boundaries, Prisma/PostgreSQL persistence, operational data-ingestion scripts, browser-heavy analytics surfaces, and an isolated Python LOD service.

**Key Characteristics:**
- Next.js App Router owns pages, route handlers, and layout composition under `app/`.
- tRPC is the main typed API boundary, composed in `server/routers/root.ts`.
- Prisma/PostgreSQL is the central persistence layer, configured through `server/db.ts` and `prisma/schema.prisma`.
- ACC/Data Connector is the dominant domain by code volume and coupling.
- Large browser-side visual analytics surfaces live under `app/(dashboard)/users/access-analysis/` and `app/(dashboard)/access-analysis/`.
- Durable jobs, diagnostics, and backfills live under `scripts/`.
- Python image/LOD processing is isolated under `services/lod-engine/`.

## Layers

**Route and Page Layer:**
- Purpose: Compose authenticated routes, server/client page shells, API route handlers, and dashboards.
- Contains: `app/(auth)/`, `app/(dashboard)/`, `app/api/`, `app/layout.tsx`, `app/page.tsx`.
- Depends on: `components/`, `lib/`, `server/` where server-safe, and tRPC client/provider wiring.
- Used by: Browser navigation, API clients, Playwright/UAT tests.

**Shared UI Layer:**
- Purpose: Reusable UI primitives, dashboard widgets, theme/layout components, and feature widgets.
- Contains: `components/ui/`, `components/layout/`, `components/dashboard/`, `components/families/`, `components/trello/`, `components/lod/`.
- Depends on: React, Radix/shadcn, `lib/`, and feature-local types.
- Boundary rule: should not import app route modules, Prisma, or server DB helpers directly.

**Feature Route Modules:**
- Purpose: Feature-specific UI, pure transforms, graph/rendering logic, and collocated tests where a domain grew inside a route directory.
- Examples: `app/(dashboard)/users/access-analysis/`, `app/(dashboard)/access-analysis/`, `app/(dashboard)/template-mty/`, `app/(dashboard)/forma-proposal/`.
- Current risk: Some pure domain data such as taxonomy/module mappings is useful outside the route but still physically lives in route folders.

**API Boundary Layer:**
- Purpose: Validate user/session context and expose typed procedures.
- Contains: `server/trpc.ts`, `server/routers/*.ts`, `app/api/trpc/[trpc]/route.ts`.
- Depends on: `lib/server/`, `lib/acc/`, `server/db.ts`, provider SDKs, Zod/superjson patterns.
- Used by: App Router pages and client components through tRPC.

**Server/Domain Layer:**
- Purpose: Integration contracts, domain transforms, ingestion helpers, cache logic, and shared server-side business rules.
- Contains: `lib/server/`, `lib/acc/`, `lib/google/`, `lib/forma/`, `lib/wiki/`, `lib/shared/`, `server/db.ts`, `server/auth.ts`.
- Depends on: Prisma, external SDKs, Node runtime, typed model helpers.
- Used by: tRPC routers, scripts, API routes, and tests.

**Persistence Layer:**
- Purpose: Database schema, migrations, generated Prisma client, raw migration assets, and ERD.
- Contains: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/migrations-raw/`, `docs/erd.md`.
- Depends on: PostgreSQL.
- Used by: Prisma client via `server/db.ts`, scripts, and server/lib modules.

**Operational Script Layer:**
- Purpose: Repeatable jobs, diagnostics, backfills, sync commands, repo-map tooling, and one-off investigation scripts.
- Contains: `scripts/`, especially `scripts/acc-*`, `scripts/dc-*`, `scripts/repo-map/`, `scripts/uat/`, `scripts/scratch/`.
- Depends on: Node core, `lib/`, Prisma/server helpers, provider SDKs.
- Current risk: Six dependency-cruiser warnings show scripts importing route-owned app modules.

**External Service Layer:**
- Purpose: Provider-specific access for Autodesk/APS, Google, UploadThing, OpenAI, Resend, Redis/Upstash, Trello, and Hocuspocus/Yjs.
- Contains: `lib/google/`, `lib/trello/`, `lib/server/uploadthing.ts`, `scripts/*`, server routers, API route handlers.
- Boundary rule: secrets come from env vars; docs should list names only.

**LOD Service Layer:**
- Purpose: Python LOD/image pipeline and local server.
- Contains: `services/lod-engine/server.py`, `services/lod-engine/img_pipeline/`.
- Used by: `npm run lod:engine` and LOD dashboard components/routers.

## Data Flow

**Interactive Dashboard Request:**
1. User loads a route under `app/(dashboard)/`.
2. NextAuth route guard in `auth.config.ts` decides whether the request is authorized.
3. Page/server/client components compose UI from `components/` and feature modules.
4. Client data requests call tRPC through `app/api/trpc/[trpc]/route.ts`.
5. `server/trpc.ts` creates context with session, Prisma DB client, and project ID.
6. `server/routers/root.ts` dispatches to domain routers.
7. Routers call `lib/server/`, `lib/acc/`, `lib/google/`, Prisma, or provider SDKs.
8. Results return through SuperJSON/tRPC and hydrate React Query/UI state.

**ACC/Data Connector Batch Flow:**
1. A script under `scripts/acc-*` or `scripts/dc-*` is launched manually or by cron.
2. The script calls Autodesk/ACC/Data Connector APIs and helper modules in `lib/acc/`.
3. Ingest/transformation helpers persist normalized records through Prisma.
4. Dashboard routers read the updated PostgreSQL state and expose analysis/graph data.
5. Access-analysis UI consumes results through tRPC and local graph/data transforms.

**Access-Analysis Browser Flow:**
1. `/users` or access-analysis pages fetch bulk user/activity/project/folder datasets.
2. Feature modules under `app/(dashboard)/users/access-analysis/` transform data into graph tables, node snapshots, selections, layouts, and analytics panels.
3. Rendering uses React, canvas/WebGL, Cosmos/Three/D3/vgplot/ECharts, and local state contexts.
4. Playwright UAT verifies canvas limits, reduced-motion behavior, fetch-once behavior, no overflow, and drill affordances.

**Collaboration/Wiki/Chat Flow:**
1. Dashboard components call chat/wiki/media API routes or tRPC routers.
2. Media/upload handlers delegate to UploadThing or local route handlers.
3. Collaborative document state uses TipTap/Yjs/Hocuspocus and database-backed persistence where configured.

**State Management:**
- Server state: React Query/tRPC and Prisma/PostgreSQL.
- Auth state: NextAuth sessions persisted through Prisma.
- UI state: React state, context, and feature stores/hooks.
- Persistent graph/domain state: PostgreSQL models such as `AccActivity`, `AccDc*`, `AccFolder*`, `AccMemberCache`, `AccPersonGraphSnapshot`, `AccInstanceEmbedding`.

## Key Abstractions

**tRPC Router:**
- Purpose: Domain API boundary with auth role checks.
- Examples: `server/routers/users.ts`, `server/routers/acc-activity.ts`, `server/routers/acc-members.ts`, `server/routers/acc-dc-graph.ts`.
- Pattern: Composed router map in `server/routers/root.ts`.

**Procedure Guards:**
- Purpose: Auth and role enforcement at procedure boundary.
- Examples: `protectedProcedure`, `adminProcedure`, `editorProcedure` in `server/trpc.ts`.
- Pattern: tRPC middleware wraps context with authorized session.

**Prisma DB Client:**
- Purpose: Central PostgreSQL access.
- Example: `db` exported from `server/db.ts`.
- Pattern: Global singleton in dev; adapter-backed Prisma client; env-driven pool config.

**Feature-Local Pure Transforms:**
- Purpose: Keep graph/table/analytics math testable outside React rendering.
- Examples: `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`, `app/(dashboard)/users/access-analysis/featureSnapshot.ts`, `app/(dashboard)/access-analysis/moduleOverrides.ts`.
- Current issue: Some transforms are reused by scripts and should move out of route-owned app folders.

**Repo-Map Structural Gate:**
- Purpose: Capture dependency/AST/LLM-context snapshots and ratchet against new regressions.
- Examples: `scripts/repo-map/generate.cjs`, `scripts/repo-map/check.cjs`, `.tools/repo-map/manifest.json`.
- Pattern: `npm run repo-map:check` refreshes artifacts and validates baselines.

## Entry Points

**Next.js Application:**
- `app/layout.tsx` - Root layout.
- `app/page.tsx` - Root page.
- `app/(auth)/` - Auth pages.
- `app/(dashboard)/` - Main authenticated dashboards.

**API Routes:**
- `app/api/trpc/[trpc]/route.ts` - tRPC HTTP boundary.
- `app/api/auth/[...nextauth]/route.ts` - NextAuth route.
- `app/api/uploadthing/route.ts` - Upload route.
- `app/api/chat/*` and `app/api/events/*` - Chat/media/event routes.
- `app/api/wiki-media/*` and `app/api/wiki-collab-token/route.ts` - Wiki/media/collaboration routes.

**Server Composition:**
- `server/routers/root.ts` - Router composition.
- `server/trpc.ts` - tRPC context/procedures.
- `server/db.ts` - DB client.
- `server/auth.ts` - Auth provider setup.

**Operational Commands:**
- `scripts/run_dev_stack.py` - Dev stack wrapper.
- `scripts/start-router.cjs` / `scripts/start-production.cjs` - Production/local start helpers.
- `scripts/repo-map/generate.cjs` - Structural map generator.
- `scripts/uat/run-engineering-gates.cjs` - UAT gate wrapper.
- `services/lod-engine/server.py` - Python LOD engine.

## Error Handling

**Strategy:**
- tRPC routers throw `TRPCError` for authorization and procedure-level failures.
- Server/script utilities generally throw `Error` or return structured result objects.
- Playwright/UAT wrappers throw explicit errors with command output and gate context.

**Patterns:**
- Auth failures use `UNAUTHORIZED` / `FORBIDDEN` in `server/trpc.ts`.
- DB connection configuration fails fast when neither `DATABASE_URL` nor `DIRECT_URL` is set.
- Scripts and gate wrappers print actionable command output and exit non-zero on failed gates.
- Production build strips `console.log` while preserving `console.error` and `console.warn`.

## Cross-Cutting Concerns

**Authentication:**
- NextAuth pages and route authorization in `auth.config.ts`.
- Role-aware tRPC procedure guards in `server/trpc.ts`.

**Validation:**
- tRPC + Zod-style validation patterns in routers.
- Prisma schema enforces persistence constraints and relations.
- Engineering gates enforce TypeScript, repo-map, boundary, and UAT expectations.

**Performance:**
- Browser-heavy graph/analytics code must preserve fetch-once behavior, canvas/GPU limits, reduced motion, and no-overflow UAT requirements.
- `next.config.ts` optimizes package imports for selected UI/runtime packages and aliases DuckDB for browser safety.

**Dependency Boundaries:**
- Current repo-map status: 0 dependency errors, 0 circulars, 6 baseline dependency warnings.
- Known warnings are all `no-scripts-to-app`, where scripts import route-owned modules.
- Treat `app -> lib`, `app -> components`, `components -> lib`, and `server -> lib` as expected high-traffic edges.
- Treat `lib -> app`, `components -> app`, `server -> components`, scripts-to-app imports, and UI-to-DB imports as cleanup targets.

---

*Architecture analysis: 2026-06-19*
*Update when route/API boundaries, data flow, or major service ownership changes.*
