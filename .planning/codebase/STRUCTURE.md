# Directory Structure

**Analysis Date:** 2026-05-12

## Top-Level Layout

```
Dashboard/
├── app/                # Next.js App Router (routes, layouts, API)
├── components/         # React components (organized by domain)
├── lib/                # Business logic, utilities, integrations
├── server/             # tRPC routers, server actions, db client, auth
├── prisma/             # Schema, migrations, seed
├── services/           # Cron/background workers (Railway services)
├── adapters/           # External system adapters
├── hooks/              # React hooks
├── scripts/            # Dev tooling, migrations, utilities
├── public/             # Static assets
├── types/              # Shared TypeScript types
├── docs/               # Project documentation
├── APS_DOCS/           # Autodesk APS reference docs
├── patches/            # patch-package overrides (cosmos.gl, server-only)
├── .planning/          # GSD planning artifacts (roadmap, phases, codebase map)
├── .gsd/               # GSD framework files (TECHNICAL_DEBT.md, etc.)
└── .claude/            # Claude Code settings, hooks, scheduled tasks
```

## Key Locations

### Routes & Pages — `app/`
- `app/(auth)/` — Sign-in / sign-out route group (no layout chrome)
- `app/(dashboard)/` — Authenticated dashboard route group
  - `app/(dashboard)/users/` — User-graph experience (AccUsersGraph, AccProfileSection, cosmosUtils)
  - `app/(dashboard)/projects/` — Project pages
  - `app/(dashboard)/clash/` — Clash detection UI
  - `app/(dashboard)/tasks/`, `app/(dashboard)/exam/`, `app/(dashboard)/families/`, etc.
- `app/api/` — Next.js Route Handlers (auth callbacks, webhooks, tRPC entrypoint)
  - `app/api/trpc/[trpc]/route.ts` — tRPC fetch adapter
  - `app/api/auth/[...nextauth]/` — NextAuth handler
  - `app/api/webhooks/` — Trello, clash, sim webhooks
- `app/layout.tsx` — Root layout (providers, theme, fonts)
- `app/page.tsx` — Landing page

### Components — `components/`
Organized by domain rather than by component type.
- `components/ui/` — shadcn/radix primitives (button, dialog, tabs, popover, …)
- `components/auth/` — Login/session UI
- `components/dashboard/` — Cross-feature dashboard chrome (sidebar, header, widgets)
- `components/clash/` — Clash review widgets
- `components/projects/` — Project list / detail components
- `components/tasks/`, `components/exam/`, `components/families/`, `components/lod/`, `components/modules/`, `components/trello/`, `components/wiki/`
- `components/layout/` — Page-level layout primitives
- `components/providers/` — Context providers (Theme, TRPC, QueryClient)
- `components/theme/` — Theme switching

### Business Logic — `lib/`
Heavy domain logic lives here; routers stay thin.
- `lib/acc/` — Autodesk Construction Cloud domain
  - Sync (`acc-sync.ts`, `quick-sync-extraction.ts`, `ingestActivityZip.ts`)
  - Graph (`graphSimulation.ts`, `graphSnapshot.ts`, `accUserSpatialProfile.ts`)
  - Similarity (`userSimilarity.ts`, `nameSimilarity.ts`, `attributeInviter.ts`)
  - Folder topology (`folderCrawl.ts`, `folderHubCollapse.ts`, `compactionAnalysis.ts`)
  - Analytics (`activeUserTiers.ts`, `dashboardAnalytics.ts`, `orphanDetection.ts`, `kpi.ts`)
  - Permissions (`permissionMapping.ts`, `activityCategories.ts`)
  - I/O (`csvExport.ts`)
- `lib/google/` — Google APIs (Gmail, Sheets, Drive, Calendar, Forms, Chat)
- `lib/trello/` — Trello integration
- `lib/wiki/` — Wiki/notes domain
- `lib/modules/` — Module registry
- `lib/events/` — Event bus / pub-sub
- `lib/server/` — Server-only helpers (marked with `server-only`)
- `lib/client/` — Client-only helpers
- `lib/shared/` — Isomorphic helpers (safe on both sides)
- `lib/core/` — Cross-cutting core utilities
- `lib/redis.ts` — Upstash Redis client
- `lib/auth-env.ts` — Auth env-var helpers

### Server — `server/`
- `server/routers/` — tRPC routers (one file per domain)
  - `root.ts` — Aggregates all routers into `appRouter`
  - `users.ts`, `project.ts`, `tasks.ts`, `clash.ts`, `exam.ts`, `families.ts`, `lod.ts`, `gmail.ts`, `calendar.ts`, `chat.ts`, `trello.ts`, `sim.ts`, `kpi.ts`, `workspace.ts`, `search.ts`, `module-router.ts`
  - ACC: `acc-sync.ts`, `acc-folders.ts`, `acc-graph.ts`, `acc-members.ts`, `acc-activity.ts`, `aps-search.ts`
- `server/actions/` — Next.js Server Actions
- `server/auth.ts` — NextAuth config (providers, callbacks)
- `server/db.ts` — Prisma client singleton
- `server/trpc.ts` — tRPC context, procedures (publicProcedure, protectedProcedure)

### Database — `prisma/`
- `prisma/schema.prisma` — Single-file schema (ACC, auth, modules, tasks, exam, families, LOD, clash, sim)
- `prisma/migrations/` — Auto-tracked SQL migrations
- `prisma/seed.ts` — Optional seed script

### Background Workers — `services/`
- Cron jobs (Quick Sync, folder crawl, etc.) run as separate Railway services
- Triggered by `railway.cron.toml`, `railway.yjs.toml`, `railway.submitter.toml`

### Planning & Process — `.planning/`, `.gsd/`
- `.planning/STATE.md` — Current project state (live)
- `.planning/ROADMAP.md` — Milestone & phase plan
- `.planning/phases/<phase>/` — Per-phase PLAN.md, RESEARCH.md, SUMMARY.md
- `.planning/codebase/` — This codebase map
- `.gsd/TECHNICAL_DEBT.md` — Active tech debt log

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g. `AccUsersGraph.tsx`, `FolderPermissionsWidget.tsx`)
- Hooks: `camelCase.ts` starting with `use` (e.g. `useCosmosGraph.ts`)
- Libs / domain modules: `camelCase.ts` (e.g. `userSimilarity.ts`, `folderCrawl.ts`)
- tRPC routers: `kebab-or-camelCase.ts` matching domain (e.g. `acc-sync.ts`, `users.ts`)
- Tests: colocated `<source>.test.ts` (e.g. `userSimilarity.test.ts`)
- Route groups: `(group)` parens; private folders: `_folder` underscore
- Config: `*.config.ts` / `*.config.mjs`

**Symbols:**
- Components, types, enums: `PascalCase`
- Functions, variables, hooks: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` for env-derived / module-level constants
- Prisma models: `PascalCase` singular (e.g. `AccUser`, `AccProjectMember`)
- Feature flags / env keys: `SCREAMING_SNAKE_CASE` (e.g. `FOLDER_CRAWL_IN_RELEASE`)

**tRPC procedures:**
- Queries: noun phrases (`listProjects`, `getProfile`, `usersForGraph`)
- Mutations: verb phrases (`createTask`, `runQuickSync`, `assignRole`)

## Where to Add New Code

| Adding…                                 | Goes in…                                  |
|-----------------------------------------|-------------------------------------------|
| New page                                | `app/(dashboard)/<feature>/page.tsx`      |
| New API webhook                         | `app/api/webhooks/<name>/route.ts`        |
| New tRPC procedure                      | Existing `server/routers/<domain>.ts`     |
| New tRPC router                         | New `server/routers/<domain>.ts` + register in `root.ts` |
| New ACC analysis                        | `lib/acc/<analysis>.ts` + `.test.ts`      |
| New cross-domain shared util            | `lib/shared/<util>.ts`                    |
| New server-only helper                  | `lib/server/<helper>.ts` (with `server-only` import) |
| New React component                     | `components/<domain>/<Component>.tsx`     |
| New shadcn primitive                    | `components/ui/<primitive>.tsx`           |
| New Prisma model                        | `prisma/schema.prisma` + `npx prisma migrate dev` |
| New background job                      | `services/<job>.ts` + matching `railway.<job>.toml` |
| New phase plan                          | `.planning/phases/<NN-name>/`             |

## Special Directories

- `(auth)`, `(dashboard)` — Next.js route groups (no URL segment)
- `app/api/` — Server-side route handlers (NOT page routes)
- `patches/` — `patch-package` overrides applied via `postinstall`
- `scratch/`, `tmp/`, `400` — Local scratch space (not shipped)
- `.next/` — Build artifacts (gitignored)
- `APS_DOCS/` — Reference docs from Autodesk, not source

---

*Structure analysis: 2026-05-12*
