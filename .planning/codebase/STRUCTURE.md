# Codebase Structure

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/manifest.json`
- `rg --files` source inventory
- Top-level directory inspection

## Directory Layout

```text
Dashboard/
├── app/                    # Next.js App Router pages and API route handlers
│   ├── (auth)/             # Login/register/password flows
│   ├── (dashboard)/        # Authenticated product surfaces
│   └── api/                # Route handlers, tRPC, auth, uploads, streams
├── components/             # Shared React components and UI primitives
│   ├── ui/                 # shadcn/Radix-style primitives and tests
│   ├── dashboard/          # Mail/chat/calendar/dashboard surfaces
│   ├── layout/             # App shell/navigation/header components
│   └── */                  # Feature widgets
├── hooks/                  # Shared React hooks
├── lib/                    # Shared domain, server, integration, and client helpers
│   ├── acc/                # ACC/Data Connector domain and ingestion helpers
│   ├── google/             # Google API helpers
│   ├── server/             # Server-only helpers and integration glue
│   └── shared/             # Shared schemas/constants
├── server/                 # tRPC setup, auth/db boundary, routers
│   └── routers/            # Domain routers composed into appRouter
├── prisma/                 # Prisma schema and migrations
├── scripts/                # Jobs, diagnostics, repo-map, UAT, sync/backfill scripts
│   ├── repo-map/           # Structural map generator/checker
│   ├── uat/                # Engineering gate wrapper
│   └── scratch/            # One-off diagnostics/probes
├── services/               # Non-Next services
│   └── lod-engine/         # Python LOD/image service
├── tests/                  # Playwright E2E/UAT specs and helpers
├── types/                  # Type augmentation
├── electron/               # Desktop shell entry point
├── docs/                   # Project docs, ERD, specs, references
├── .planning/              # GSD planning and codebase map artifacts
├── .tools/repo-map/        # Generated repo-map artifacts
├── package.json            # Scripts, dependencies, Node engine
├── tsconfig.json           # TypeScript config and @/* path alias
├── next.config.ts          # Next.js runtime/build config
├── vitest.config.ts        # Vitest config
└── playwright.config.ts    # E2E config
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js routes, pages, layouts, and route handlers.
- Contains: Route groups, page components, API route handlers, feature-local modules/tests for large dashboard surfaces.
- Key files: `app/layout.tsx`, `app/page.tsx`, `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...nextauth]/route.ts`.
- Important subtrees: `app/(dashboard)/users/access-analysis/`, `app/(dashboard)/access-analysis/`, `app/(dashboard)/template-mty/`, `app/(dashboard)/forma-proposal/`.

**`components/`:**
- Purpose: Reusable UI, feature widgets, and dashboard panel components.
- Contains: React components, collocated tests, UI primitives, layout shell, dashboard/chat/mail/calendar views.
- Key files: `components/ui/DataTable.tsx`, `components/ui/EChart.tsx`, `components/layout/Sidebar.tsx`, `components/dashboard/MailPanel.tsx`.

**`hooks/`:**
- Purpose: Shared React hooks for roles, debounce, event source, mail/chat notifications.
- Contains: `use-*.ts` / `use-*.tsx` hooks and occasional collocated tests.

**`lib/`:**
- Purpose: Shared non-route logic, domain models, server helpers, integrations, and pure utilities.
- Contains: `lib/acc/`, `lib/server/`, `lib/google/`, `lib/forma/`, `lib/trello/`, `lib/wiki/`, `lib/shared/`.
- Key risk: code that is domain or script-safe should prefer `lib/` over `app/(dashboard)/...`.

**`server/`:**
- Purpose: tRPC and server boundary.
- Contains: `server/trpc.ts`, `server/db.ts`, `server/auth.ts`, `server/routers/*.ts`.
- Key files: `server/routers/root.ts` composes 23 routers.

**`prisma/`:**
- Purpose: Database schema, migrations, and migration-adjacent SQL.
- Contains: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/migrations-raw/`.
- Generated artifact: ERD output at `docs/erd.md`.

**`scripts/`:**
- Purpose: Developer tools, sync jobs, ACC/Data Connector backfills, diagnostics, repo-map, UAT gates, and operational commands.
- Key files: `scripts/repo-map/generate.cjs`, `scripts/repo-map/check.cjs`, `scripts/uat/run-engineering-gates.cjs`, `scripts/run_dev_stack.py`.
- Current boundary issue: Six scripts import route-owned modules under `app/`.

**`services/lod-engine/`:**
- Purpose: Python image/LOD service and pipeline.
- Contains: `server.py`, `README.md`, `img_pipeline/`, provider helpers, model/tool binaries.

**`tests/`:**
- Purpose: Playwright E2E/UAT specs.
- Contains: `tests/e2e/*.spec.ts`, `tests/e2e/uat-helpers.ts`, `playwright/global-setup.ts`.

**`.tools/repo-map/`:**
- Purpose: Generated structural intelligence.
- Contains: `manifest.json`, `architecture-summary.md`, dependency-cruiser reports, ast-grep reports, and Repomix source slices.
- Committed status: Generated/local artifacts; use as context, not as source code.

**`.planning/`:**
- Purpose: GSD planning workspace and codebase map.
- Contains: `PROJECT.md`, `STATE.md`, `ROADMAP.md`, phase docs, and `.planning/codebase/*.md`.

## Key File Locations

**Entry Points:**
- `app/layout.tsx` - Root Next layout.
- `app/page.tsx` - Root route.
- `app/api/trpc/[trpc]/route.ts` - tRPC HTTP entry point.
- `server/routers/root.ts` - tRPC router map.
- `server/trpc.ts` - tRPC context/procedure definitions.
- `server/db.ts` - Prisma DB client.
- `electron/main.cjs` - Electron desktop entry point.
- `services/lod-engine/server.py` - Python LOD service entry point.

**Configuration:**
- `package.json` - npm scripts, dependencies, Node engine.
- `tsconfig.json` - TypeScript compiler config, strict mode, `@/*` alias.
- `next.config.ts` - Next runtime/build settings.
- `vitest.config.ts` / `vitest.setup.ts` - Unit test config/setup.
- `playwright.config.ts` / `playwright.verify.config.ts` - E2E/UAT config.
- `eslint.config.mjs` - ESLint ignore config.
- `sgconfig.yml` - ast-grep rule config.
- `.dependency-cruiser.cjs` - dependency boundary config.
- `repomix.config.json` - Repomix output config.

**Core Logic:**
- `server/routers/*.ts` - API procedure modules.
- `lib/acc/*.ts` - ACC/Data Connector domain and ingestion logic.
- `lib/server/*.ts` - Server-only integration/business helpers.
- `app/(dashboard)/users/access-analysis/*.ts*` - Access-analysis graph and interaction logic.
- `app/(dashboard)/access-analysis/*.ts*` - Access-analysis charts/terrain modules.

**Testing:**
- `*.test.ts` / `*.test.tsx` - Collocated unit/component tests.
- `components/ui/__tests__/` - UI component tests.
- `tests/e2e/*.spec.ts` - Playwright E2E/UAT tests.
- `scripts/uat/run-engineering-gates.cjs` - Scripted UAT gate runner.

**Documentation and Generated Maps:**
- `.planning/codebase/*.md` - Human-readable GSD codebase map.
- `.tools/repo-map/architecture-summary.md` - Generated source-density and boundary summary.
- `.tools/repo-map/manifest.json` - Machine-readable repo-map run manifest.
- `docs/erd.md` - Prisma ERD.

## Naming Conventions

**Files:**
- PascalCase `.tsx` for React component modules: `MailPanel.tsx`, `FolderPermissionTerrain.tsx`.
- camelCase `.ts` for pure utilities and feature helpers: `graphNodesFromUsers.ts`, `moduleOverrides.ts`.
- kebab-case `.cjs` / `.mjs` for scripts: `start-router.cjs`, `repo-map/generate.cjs`.
- `*.test.ts` / `*.test.tsx` for unit/component tests.
- `*.spec.ts` for Playwright E2E tests.
- Route files follow Next conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `route.ts`.

**Directories:**
- Feature directories generally use kebab-case or domain names: `access-analysis`, `template-mty`, `sync-center`.
- Shared component/domain directories are plural or domain-scoped: `components/`, `server/routers/`, `lib/acc/`.
- Test directories use `__tests__/` where tests are grouped instead of collocated.

**Special Patterns:**
- `server/routers/<domain>.ts` exports `<domain>Router`.
- `app/api/**/route.ts` defines Next route handlers.
- Route-group parentheses are Next.js only: `app/(auth)/`, `app/(dashboard)/`.
- Generated repo-map outputs live under `.tools/repo-map/` and should not become hand-edited source.

## Where to Add New Code

**New Dashboard Route:**
- Route/page shell: `app/(dashboard)/<route>/page.tsx`.
- Loading state: `app/(dashboard)/<route>/loading.tsx` if needed.
- Shared widgets: `components/<domain>/` or `components/ui/`.
- Server data: `server/routers/<domain>.ts` plus `lib/server/` or `lib/<domain>/` helpers.
- Tests: collocated `*.test.tsx` for components and `tests/e2e/*.spec.ts` for browser flows.

**New tRPC Procedure:**
- Router: existing `server/routers/<domain>.ts` or a new router included in `server/routers/root.ts`.
- Domain logic: `lib/server/` or `lib/<domain>/`.
- DB access: server-side only through `server/db.ts`/Prisma.
- Tests: router/unit tests near the router or helper.

**New ACC/Data Connector Logic:**
- Pure domain helpers: `lib/acc/`.
- Server orchestration: `lib/server/` or `server/routers/acc-*.ts`.
- Scripts/jobs: `scripts/acc-*`, `scripts/dc-*`, or future `scripts/jobs/`.
- Avoid placing reusable domain transforms in `app/(dashboard)/...`.

**New UI Primitive:**
- Implementation: `components/ui/`.
- Tests: `components/ui/__tests__/`.
- Styles: Tailwind/shadcn conventions and `app/globals.css` where global tokens are needed.

**New Operational Script:**
- Durable job/backfill: `scripts/` now; target cleanup shape is `scripts/jobs/`.
- Diagnostics/probes: `scripts/scratch/` now; target cleanup shape is `scripts/diagnostics/`.
- Shared script helpers: `scripts/lib/` or `lib/<domain>/`, not route-owned `app/`.

## Special Directories

**`.tools/repo-map/`:**
- Purpose: Generated structural map from `npm run repo-map:check`.
- Source: `scripts/repo-map/generate.cjs`.
- Contents: Repomix XML, dependency-cruiser JSON/HTML/Mermaid/DOT/SVG, ast-grep JSON, manifest, summary.
- Hand-edit: No.

**`.planning/codebase/`:**
- Purpose: Human-readable GSD map derived from source and repo-map artifacts.
- Source: maintained by codebase mapping workflow.
- Hand-edit: Yes, but refresh with `npm run repo-map:check` first.

**`.next*`, `playwright-report/`, `test-results/`, `.tmp/`:**
- Purpose: build/test/generated outputs.
- Hand-edit: No.

**`services/lod-engine/img_pipeline/bin/`:**
- Purpose: local binary/model assets for image processing.
- Hand-edit: No, unless updating the LOD toolchain.

---

*Structure analysis: 2026-06-19*
*Update when folders move or ownership boundaries change.*
