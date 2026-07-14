# Codebase Architecture Summary

Generated: 2026-07-14T16:47:51.564Z

Inputs:
- Repomix compressed whole-repo snapshot: `.tools/repo-map/repomix-output.xml`
- Repomix architecture slices: `.tools/repo-map/repomix/app.xml`, `components.xml`, `server.xml`, `scripts.xml`, `config.xml`
- dependency-cruiser graph/report: `.tools/repo-map/dependency-cruiser.json`, `.tools/repo-map/dependency-cruiser-report.html`, `.tools/repo-map/dependency-graph.svg`
- ast-grep structural search snapshots: `.tools/repo-map/ast-grep-report.json`
- AI analysis prompt: `.tools/repo-map/AI-ANALYSIS-PROMPT.md`

## Opinionated Takeaways

- Start AI review with the manifest, this summary, dependency-cruiser JSON/report, and ast-grep report. Load Repomix zone files only when the question needs source context.
- Treat `app -> lib`, `app -> components`, `components -> lib`, and `server -> lib` as expected high-traffic edges. Treat `lib -> app`, `server -> components`, `components -> app`, and UI-to-DB imports as design smells.
- The ACC/Data Connector area is the largest domain and should get the first dedicated boundary cleanup pass.
- Large UI files in the users/access-analysis surfaces are the most likely places where data fetching, transformation, visualization, and interaction state are coupled.
- Dependency errors, circular imports, and new blocking ast-grep findings are now quality-gate failures. Dependency warnings and legacy AST findings stay visible but non-blocking.

## Quality Gate Status

| Gate | Status | Count | Fails CI |
|---|---:|---:|---:|
| Circular imports | Pass | 0 | Yes |
| Dependency errors | Pass | 0 | Yes |
| Dependency warnings | Warn | 2 | Growth only |
| AST blocking rules | Pass | 0 / baseline 1 | New only |
| AST warnings/info/hints | Report | 236 | No |
| Baseline file refs | Pass | 0 | Yes |


## 1. App Architecture

This repository is a Next.js App Router dashboard backed by tRPC routers, Prisma/Postgres data access, Autodesk Platform Services integrations, Google APIs, collaborative editing infrastructure, and a Python LOD engine. The main UI surface lives in `app/` and `components/`, shared client/server code lives in `lib/`, request boundaries live in `server/routers/`, database schema lives in `prisma/schema.prisma`, operational scripts live in `scripts/`, and the Python image/LOD service lives in `services/lod-engine/`.

Mapped source density:
- app: 562 mapped files
- lib: 268 mapped files
- scripts: 191 mapped files
- components: 119 mapped files
- server: 43 mapped files
- services: 25 mapped files
- tests: 12 mapped files
- hooks: 6 mapped files
- electron: 1 mapped files
- types: 1 mapped files
- auth.config.ts: 1 mapped files
- instrumentation.ts: 1 mapped files

## 2. Feature Modules

Prominent feature areas in the current tree:
- ACC/Data Connector activity ingestion, members, folders, graphing, and sync: `server/routers/acc-*.ts`, `lib/acc/`, `scripts/acc-*.cjs`, `scripts/dc-*.cjs`
- Access analysis and permission terrain UI: `app/(dashboard)/users/access-analysis/`, `app/(dashboard)/template-mty/`
- Dashboard collaboration and communication surfaces: `components/dashboard/`, `lib/google/`, `server/routers/chat.ts`, `server/routers/gmail.ts`, `server/routers/calendar.ts`
- Forma proposal and role modeling helpers: `lib/forma/`, `tests/e2e/forma-proposal.spec.ts`
- LOD/image processing service: `services/lod-engine/`
- Wiki/media routes and shared module schemas: `app/api/wiki-media/`, `lib/wiki/`, `lib/shared/`

## Ownership Model

| Zone | Owner | Purpose | Import Direction |
|---|---|---|---|
| `app/` | Application routes | UI composition and route entrypoints | May import components, feature modules, and server-safe modules |
| `components/` | Shared UI | Reusable presentational components | Should not import app, prisma, scripts, or server/db directly |
| `lib/server/` | Server infrastructure | Server-only logic, adapters, and integration contracts | May import db, env, services, and provider SDKs |
| `server/` | API boundary | tRPC routers and request orchestration | May import lib/server, lib/domain, prisma/db helpers, and types |
| `prisma/` | Persistence | Database schema and migration-adjacent assets | Should not import UI or runtime app modules |
| `scripts/` | Tooling | Repo automation, diagnostics, backfills, and maintenance | Should be isolated from runtime app modules unless narrowly documented |

tRPC router entries detected from `server/routers/root.ts`:
- accActivity
- accCoordination
- accDcGraph
- accFolders
- accGraph
- accMembers
- accPersonGraph
- accSync
- apsSearch
- calendar
- chat
- clash
- exam
- families
- gmail
- kpi
- lod
- project
- search
- sim
- trello
- users
- workspace

## 3. Data Flow

The primary data flow is browser UI -> Next.js route/component layer -> tRPC router -> server service/helper modules -> Prisma/Postgres or external APIs. Batch and backfill flows enter through `scripts/`, call Autodesk/Google/data connector clients, and write through server/lib database helpers. Python LOD processing is separate from the TypeScript request path and is started through `npm run lod:engine`.

Prisma models detected:
- AccActivity
- AccActivityAccds
- AccDataConnectorJob
- AccDcAccount
- AccDcAccountService
- AccDcBackfillProgress
- AccDcBusinessUnit
- AccDcCompany
- AccDcIngestRun
- AccDcProject
- AccDcProjectCompany
- AccDcProjectProduct
- AccDcProjectRole
- AccDcProjectService
- AccDcProjectUser
- AccDcProjectUserCompany
- AccDcProjectUserProduct
- AccDcProjectUserRole
- AccDcProjectUserService
- AccDcRole
- AccDcUser
- AccFolder
- AccFolderPermission
- AccFolderPermissionSummary
- AccGraphLayoutCache
- AccHubRoleCache
- AccInstanceEmbedding
- AccIssue
- AccIssueFetchRun
- AccIssueProjectFetchResult
- AccIssueType
- AccMemberCache
- AccPersonGraphSnapshot
- AccProject
- AccProjectMember
- AccProjectRole
- AccRole
- Account
- ApprovedEmail
- ClashTask
- ClashWiki
- ExamBuildTask
- ExamResult
- Family
- FamilyAttachment
- FamilyChangelog
- FamilyDeliverable
- LodCategory
- LodEmbedding
- LodFamily
- LodGraphNode
- PasswordResetToken
- PendingRequest
- Project
- RevitExam
- Session
- SimTask
- SimWiki
- SyncMeta
- TaskAttachment
- UnresolvedAttribution
- User
- UserModuleAccess
- UserTask
- VerificationToken

## 4. API Boundaries

- Next.js API routes are under `app/api/`.
- tRPC procedure boundaries are under `server/routers/` and composed by `server/routers/root.ts`.
- External API clients cluster under `lib/google/`, Autodesk/ACC related routers/scripts, and `@aps_sdk/*` dependencies.
- Background/ops entrypoints are command scripts in `scripts/`, not API routes.
- Electron is isolated under `electron/main.cjs`.

## 5. Database Access Layer

Prisma is the central ORM layer, with schema in `prisma/schema.prisma`, client generation in `postinstall`, and server-side DB setup in `server/db.ts`. Direct Prisma access should remain server-only: routers, server helpers, scripts, and migration utilities are expected places. Client components should consume tRPC/API results rather than importing database helpers.

ast-grep structural counts:
- react-use-effect: 146 matches
- router-push: 3 matches
- prisma-access: 61 matches
- fetch-calls: 6 matches

ast-grep rule scan counts:
- large-use-effect: 146 matches
- no-console-log: 88 matches
- unsafe-todo: 2 matches

## 6. Duplicated Responsibilities

Likely duplication or responsibility overlap to audit:
- ACC/Data Connector ingestion and graph concerns appear across `server/routers/acc-activity.ts`, `server/routers/acc-sync.ts`, `server/routers/acc-dc-graph.ts`, `lib/acc/`, and multiple `scripts/acc-*` / `scripts/dc-*` files.
- Permission/access modeling appears in both `app/(dashboard)/template-mty/` and `app/(dashboard)/users/access-analysis/`, with server-side user/folder routers also participating.
- Google communication responsibilities span `lib/google/`, `components/dashboard/MailPanel.tsx`, chat/calendar routers, and dashboard chat panel components.
- Operational diagnostics and production backfill code are mixed in `scripts/`; consider separating durable jobs from one-off diagnostics and scratch scripts.

## 7. Files That Should Be Atomized

Largest source files in the mapped roots:
- tests/e2e/acc-dc-graph.spec.ts (62 KB)
- app/(dashboard)/users/access-analysis/physicsLayer.test.ts (59 KB)
- lib/acc/dcIngest.ts (57 KB)
- scripts/progress-monitor.cjs (52 KB)
- lib/acc/dcIngest.test.ts (47 KB)
- app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts (45 KB)
- components/dashboard/MailPanel.tsx (43 KB)
- scripts/repo-map/generate.cjs (41 KB)
- app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx (41 KB)
- components/trello/CardDialog.tsx (40 KB)
- app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx (38 KB)
- app/(dashboard)/users/AccProfileSection.tsx (37 KB)

These are good first candidates for atomization when they combine fetching, transformation, UI state, and rendering in one module.

## 8. Risky Dependencies

dependency-cruiser findings:
- Modules analyzed: 1111
- Cross-area dependency edges: 25
- Circular dependency edges: 0
- Unresolved dependency edges: 0
- Rule violations: 2
- CI-blocking dependency errors: 0
- Non-blocking dependency warnings: 2

Strongest cross-area dependencies:
- app -> lib: 287 imports
- app -> components: 170 imports
- components -> lib: 122 imports
- scripts -> node core: 96 imports
- server -> lib: 81 imports
- lib -> server: 36 imports
- app -> server: 32 imports
- lib -> node core: 31 imports
- scripts -> lib: 25 imports
- app -> node core: 23 imports

Rule violation summary:
- warn no-scripts-to-app: 2

Dependency warning triage:
| Warning | Classification | Action |
|---|---|---|
| no-scripts-to-app: `scripts/build-instance-features.ts` -> `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` | Technical debt | Move the shared helper into lib/server or scripts/lib, or document a narrow exception |
| no-scripts-to-app: `scripts/build-instance-features.ts` -> `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts` | Technical debt | Move the shared helper into lib/server or scripts/lib, or document a narrow exception |

Circular import edges:
- None detected in the generated data.

High-count cross-area edges are not automatically wrong, but they identify areas where boundaries are doing real work and should have explicit ownership.

## 9. Cleanup Opportunities

- Keep generated artifacts under `.tools/repo-map/` and avoid feeding build caches, screenshots, logs, lockfiles, and local secrets into AI context.
- Split durable operational scripts from diagnostics/scratch scripts so dependency graphs are less noisy.
- Pull shared ACC/Data Connector transformations into small typed modules under `lib/acc/` or `server/services/` and let routers/scripts call those modules.
- Keep browser-facing components from importing server-only helpers directly; enforce this with future dependency-cruiser rules once current usage is baselined.
- Consider adding focused ast-grep rules for direct Prisma usage outside approved folders and client components that call navigation or side-effect hooks in large render modules.

## 10. Recommended Folder Structure

Recommended target shape for future cleanup:
- `app/`: route shells, server components, and thin client entrypoints
- `components/`: reusable UI primitives and dashboard widgets without direct database access
- `features/<feature>/`: feature-specific UI, hooks, and pure transforms when a feature spans many folders
- `server/routers/`: tRPC boundary only
- `server/services/`: orchestration/business logic used by routers and jobs
- `lib/integrations/<provider>/`: Google, Autodesk, OpenAI, Redis, UploadThing, and other external clients
- `lib/domain/<domain>/`: pure domain rules for ACC, Forma, access analysis, modules, and wiki
- `scripts/jobs/`: repeatable production/backfill jobs
- `scripts/diagnostics/`: one-off inspection and verification commands
- `services/lod-engine/`: Python service, kept isolated behind explicit interfaces

## Priority Cleanup Roadmap

1. Safe: keep the stat-card shared types in a pure type module and prevent config/detail modules from importing the ACC profile container.
2. Safe: install Graphviz where available so `dependency-graph.svg` is rendered from DOT instead of the fallback top-level graph.
3. Medium risk: split large ACC/Data Connector transformations into server service modules and keep routers/scripts as entrypoints.
4. Medium risk: enforce the new dependency-cruiser errors once current violations are triaged and either fixed or explicitly allowed.
5. Needs manual verification: evaluate large files for atomization only after checking runtime coupling, UI state ownership, and test coverage.
6. Needs manual verification: treat ast-grep TODO/any/console findings as review queues, not automatic delete-or-rewrite instructions.

## How To Refresh

Run:

```powershell
npm run repo-map:check
```

Primary artifacts:
- `.tools/repo-map/repomix-output.xml`
- `.tools/repo-map/repomix/app.xml`
- `.tools/repo-map/repomix/components.xml`
- `.tools/repo-map/repomix/server.xml`
- `.tools/repo-map/repomix/scripts.xml`
- `.tools/repo-map/repomix/config.xml`
- `.tools/repo-map/dependency-cruiser-report.html`
- `.tools/repo-map/dependency-graph.svg`
- `.tools/repo-map/dependency-cruiser.json`
- `.tools/repo-map/ast-grep-report.json`
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/AI-ANALYSIS-PROMPT.md`
