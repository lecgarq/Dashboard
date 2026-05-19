# Codebase Structure

## Top-Level Layout

```
C:/LECG/Dashboard/
├── app/                  # Next.js App Router (routes + pages + RSC)
│   ├── (auth)/           # Auth route group (sign-in, etc.)
│   ├── (dashboard)/      # Authenticated dashboard route group
│   └── api/              # REST endpoints + tRPC HTTP handler
├── server/               # Server-only code (tRPC + actions + auth + db)
│   ├── routers/          # tRPC routers (one per domain)
│   ├── actions/          # Server actions
│   ├── auth.ts           # NextAuth config
│   ├── db.ts             # Prisma client + Postgres pool
│   └── trpc.ts           # tRPC procedure builders
├── lib/                  # Shared domain logic + utilities
│   ├── acc/              # Autodesk ACC ingest, graph, analytics
│   ├── client/           # Client-only helpers
│   ├── core/             # Core domain types
│   ├── events/           # Event bus / pub-sub
│   ├── google/           # Google Drive / Gmail integration
│   ├── modules/          # Feature modules
│   ├── server/           # Server-only helpers
│   ├── shared/           # Isomorphic helpers
│   ├── trello/           # Trello integration
│   └── wiki/             # Internal wiki helpers
├── components/           # React components (organized by feature)
│   ├── auth/             # Auth UI
│   ├── clash/            # Clash detection UI
│   ├── dashboard/        # Dashboard shell + nav
│   ├── exam/             # Exam mode
│   ├── families/         # Revit families browser
│   ├── layout/           # Layout primitives
│   ├── lod/              # LOD checker
│   ├── modules/          # Module-scoped widgets
│   ├── projects/         # Project pickers, etc.
│   ├── providers/        # Context providers
│   ├── sync-center/      # Sync status panel
│   ├── tasks/            # Task UI
│   ├── theme/            # Theme switcher
│   ├── trello/           # Trello UI
│   └── ui/               # shadcn/ui primitives
├── prisma/               # Prisma schema + migrations
├── scripts/              # CLI scripts (CJS/MJS/TS/Python/PowerShell)
├── APS_DOCS/             # Autodesk Platform Services reference (vendored docs)
├── docs/                 # Internal architecture docs + specs
├── electron/             # Electron desktop wrapper
├── adapters/             # External-system adapters
├── hooks/                # Reusable React hooks
├── public/               # Static assets
├── patches/              # patch-package patches
└── services/             # Python sidecar services (e.g. lod-engine)
```

## Route Groups (Next.js App Router)

`app/(dashboard)/` — main authenticated app:
- `account/` — user account
- `clash-detection/` — clash UI
- `exam/` — exam mode
- `families/` — Revit families
- `home/` — landing
- `lod-checker/` — LOD checks
- `settings/`
- `sim-automation/`
- `sync-center/` — ACC sync status
- `tasks/`
- `trello/`
- `users/` — user directory + access analysis (heavy graph UI)
  - `access-analysis/` — Cosmograph + DuckDB/Mosaic redesign target

## Key Locations

| Concern | Location |
|---|---|
| tRPC routers (domain APIs) | `server/routers/*.ts` (acc-activity, acc-folders, acc-graph, acc-members, acc-sync, aps-search, calendar, chat, clash, exam, families, gmail, kpi, lod, project, search, sim, tasks, trello, users, workspace) |
| Root tRPC router | `server/routers/root.ts` |
| tRPC HTTP handler | `app/api/trpc/[trpc]/route.ts` |
| NextAuth config | `server/auth.ts`, `auth.config.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Database client | `server/db.ts` |
| ACC ingest engine | `lib/acc/dcIngest.ts` (~1239 lines), `lib/acc/dcActivityCsvIngest.ts`, `lib/acc/dcAdminCsvIngest.ts` |
| ACC graph rendering | `app/(dashboard)/users/AccUsersGraph.tsx` (~4242 lines) |
| User directory | `app/(dashboard)/users/UsersDirectoryClient.tsx` (~2526 lines) |
| Scheduled jobs (Windows) | `scripts/dc-daily-cron.ps1`, `scripts/dc-daily-ingest.cjs` |
| Local Postgres helper | `scripts/postgres-local.js` |
| Dev stack runner | `scripts/run_dev_stack.py` |
| Electron entry | `electron/main.cjs` |
| APS reference docs | `APS_DOCS/` (read-only vendor docs) |

## Naming Conventions

- **Files:** kebab-case for routes (`acc-activity.ts`), PascalCase for React components (`AccUsersGraph.tsx`), camelCase for utility modules (`dcIngest.ts`, `csvExport.ts`).
- **Tests:** co-located, `*.test.ts` / `*.test.tsx` next to the module under test.
- **tRPC routers:** one file per domain in `server/routers/`, named after the domain (`users.ts`, `kpi.ts`).
- **Scripts:** prefix by purpose — `dc-*` for Data Connector, `check-*` for diagnostics, `fix-*` for one-off repairs.
- **Route groups:** parenthesized folders (`(auth)`, `(dashboard)`) don't affect URL paths.

## Where Domain Logic Lives

- **ACC / Autodesk Data Connector pipeline:** `lib/acc/` (ingest, normalization, analytics) + `server/routers/acc-*.ts` (API surface) + `scripts/dc-*` (CLI/cron drivers)
- **User access analysis graph:** `app/(dashboard)/users/access-analysis/` (DuckDB/Mosaic/Cosmograph redesign in progress)
- **Auth + identity:** `server/auth.ts` + `lib/auth-env.ts` + Prisma adapter
- **Background jobs:** Windows Task Scheduler → `.ps1` → `.cjs` (Railway cron config retained in `railway.cron.toml` but unused since trial expired)

## APS_DOCS Layout

Vendored Autodesk Platform Services reference. Read-only, used by humans + AI when implementing APS integrations.

```
APS_DOCS/
├── APS_MASTER_REFERENCE.md          # Top-level index
├── ACC (FORMA) API/                 # ACC REST API (_index.json, REST API/, Tutorials/, Other/)
├── APS_REFERENCE/                   # General APS reference
├── AUTHENTICATION API/              # OAuth 2-leg + 3-leg flows
├── BIM 360 API/                     # Legacy BIM 360 endpoints
├── DATA MANAGEMENT API/             # Hubs, projects, folders, items
├── DESIGN AUTOMATION API/
├── HOW TO/                          # Task-specific recipes
│   ├── HOW_TO_Extract_Activity_Logs.md
│   ├── HOW_TO_Extract_All_Files_and_Folders.md
│   ├── HOW_TO_Extract_All_Roles.md
│   ├── HOW_TO_Extract_Folder_Role_Permissions.md
│   ├── HOW_TO_Extract_Last_Sign_In.md
│   ├── HOW_TO_Extract_Last_User_File_Activity.md
│   ├── HOW_TO_Extract_Project_Info.md
│   ├── HOW_TO_Extract_Project_Members.md
│   └── HOW_TO_Extract_Recent_User_Additions.md
├── MANUFACTURING DATA MODEL API/
├── MODEL DERIVATIVE API/
└── VIEWER API/
```

When implementing APS-facing code, consult `APS_DOCS/HOW TO/` first — these are recipe-grade and reflect what actually works against the live API.
