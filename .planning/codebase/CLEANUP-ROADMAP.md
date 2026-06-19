# Cleanup and Architecture Roadmap

**Analysis Date:** 2026-06-19

**Generated From:**
- `.tools/repo-map/manifest.json`
- `.tools/repo-map/architecture-summary.md`
- `.tools/repo-map/dependency-cruiser.json`
- `.tools/repo-map/ast-grep-report.json`
- `.tools/repo-map/repomix/*.xml` when needed for source context

## 1. Current Architecture Map

This is a Next.js App Router dashboard with:
- UI/routes in `app/`
- Shared UI in `components/`
- tRPC boundary in `server/trpc.ts` and `server/routers/`
- Server/domain helpers in `lib/`
- PostgreSQL persistence through Prisma in `server/db.ts` and `prisma/schema.prisma`
- Operational scripts under `scripts/`
- Python LOD processing under `services/lod-engine/`
- Generated structural intelligence under `.tools/repo-map/`

Expected dependency direction:
- `app/` -> `components/`, `lib/`, server-safe modules
- `components/` -> `lib/`
- `server/` -> `lib/`, `server/db.ts`, external SDKs
- `scripts/` -> durable domain helpers under `lib/` or script-local helpers

Cleanup target directions:
- Avoid `scripts/` -> `app/`
- Avoid `lib/` -> `app/`
- Avoid `components/` -> `app/`
- Avoid client UI -> Prisma/DB helpers

## 2. Main Domains and Features

**ACC/Data Connector:**
- Files: `server/routers/acc-*.ts`, `lib/acc/`, `scripts/acc-*`, `scripts/dc-*`.
- Role: activity ingestion, members, folders, graphing, sync, project/service/product data, issue workflows.
- Cleanup importance: highest.

**Access Analysis and Permission Terrain:**
- Files: `app/(dashboard)/users/access-analysis/`, `app/(dashboard)/access-analysis/`, `app/(dashboard)/template-mty/`.
- Role: user/project graphing, analytics, folders, module/activity analysis, sliders, canvas/WebGL, drill panels.
- Cleanup importance: high, but changes need UAT protection.

**Dashboard Communication:**
- Files: `components/dashboard/`, `lib/google/`, `server/routers/chat.ts`, `server/routers/gmail.ts`, `server/routers/calendar.ts`.
- Role: mail, chat, calendar, notification panels.
- Cleanup importance: medium.

**Forma / Template MTY:**
- Files: `app/(dashboard)/forma-proposal/`, `app/(dashboard)/template-mty/`, `lib/forma/`.
- Role: proposal UI and role/permission modeling.
- Cleanup importance: medium.

**LOD Engine:**
- Files: `components/lod/`, `server/routers/lod.ts`, `services/lod-engine/`.
- Role: LOD graph/search/training UI plus Python image pipeline.
- Cleanup importance: medium, keep service boundary isolated.

**Repo Tooling and UAT Gates:**
- Files: `scripts/repo-map/`, `scripts/uat/`, `tests/e2e/uat-workshop.spec.ts`.
- Role: architecture intelligence and workshop verification.
- Cleanup importance: high as guardrails, but avoid churn.

## 3. Data Flow

**Interactive application flow:**
1. Browser enters `app/(dashboard)/...`.
2. NextAuth checks route authorization through `auth.config.ts`.
3. UI composes route components and shared `components/`.
4. tRPC calls hit `app/api/trpc/[trpc]/route.ts`.
5. `server/trpc.ts` builds context with session, `db`, and project ID.
6. `server/routers/root.ts` dispatches to a domain router.
7. Router calls server/domain helpers and Prisma/external APIs.
8. Results hydrate React Query/UI state.

**Batch/integration flow:**
1. Script in `scripts/` calls provider APIs or domain helpers.
2. `lib/acc/`, `lib/google/`, or `lib/server/` performs transforms and persistence.
3. Prisma writes PostgreSQL records.
4. tRPC routers expose the updated data to UI.

**Graph/analytics flow:**
1. UI fetches bulk ACC/user/activity data.
2. Feature transforms produce graph nodes, snapshots, tables, groups, and chart data.
3. Canvas/WebGL/ECharts/vgplot components render interactive exploration surfaces.
4. UAT gates verify performance, fetch count, contrast, reduced motion, and drill behavior.

## 4. Dependency Boundary Violations

Current repo-map warnings are all `no-scripts-to-app`:

| Source | Target | Recommendation |
|---|---|---|
| `scripts/build-instance-features.ts` | `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` | Move graph node transform to `lib/acc/graph/` or `lib/domain/access-analysis/` |
| `scripts/build-instance-features.ts` | `app/(dashboard)/users/access-analysis/instanceFeatureTokens.ts` | Move feature token helpers with graph transform |
| `scripts/diag-activity-coordination.cjs` | `app/(dashboard)/access-analysis/moduleOverrides.ts` | Move module/action overrides to `lib/acc/activity/` |
| `scripts/diag-activity-module-audit.cjs` | `app/(dashboard)/access-analysis/moduleOverrides.ts` | Same as above |
| `scripts/diag-activity-service-xtab.cjs` | `app/(dashboard)/access-analysis/moduleOverrides.ts` | Same as above |
| `scripts/diag-activity-types.cjs` | `app/(dashboard)/access-analysis/moduleOverrides.ts` | Same as above |

These are not emergency bugs. They are the cleanest first architecture cleanup because the fresh map proves the exact dependency edges.

## 5. Circular Imports and Refactor Plan

Current circular imports: none detected.

Refactor plan:
1. Preserve zero circulars as a hard invariant.
2. Before moving route-owned modules into `lib/`, run `npm run repo-map:check`.
3. Move one logical group at a time.
4. Update imports in scripts and UI.
5. Run targeted tests and `npm run repo-map:check`.
6. Do not update dependency baselines unless the warning is intentionally accepted.

## 6. Files That Are Too Large or Too Coupled

Priority review list from fresh size scan:

| File | Size | Concern |
|---|---:|---|
| `lib/acc/dcIngest.ts` | 57 KB | Ingestion orchestration and data pipeline coupling |
| `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` | 55 KB | UI/data/rendering coupling |
| `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` | 50 KB | Terrain UI and data behavior coupling |
| `app/(dashboard)/access-analysis/folderTerrain.ts` | 49 KB | Folder terrain transform complexity |
| `components/dashboard/MailPanel.tsx` | 43 KB | Communication UI density |
| `scripts/repo-map/generate.cjs` | 41 KB | Tooling monolith, acceptable but watchable |
| `components/trello/CardDialog.tsx` | 40 KB | Complex feature modal |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | 38 KB | Canvas/rendering complexity |
| `app/(dashboard)/users/AccProfileSection.tsx` | 37 KB | User/profile UI density |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | 37 KB | Dashboard state/UI coupling |

Refactor rule: do not split just because a file is large. Split when there is a pure transform, integration boundary, or reusable domain concept that can move with tests.

## 7. Duplicated Responsibilities

**ACC/Data Connector responsibility overlap:**
- Routers, scripts, and `lib/acc/` all participate in ingestion, sync, analysis, and graph logic.
- Target: routers orchestrate requests; `lib/acc/` owns domain transforms/clients; scripts call lib services.

**Access-analysis domain logic inside route folders:**
- Scripts and UI share graph/module/taxonomy logic from route-owned `app/` modules.
- Target: move shared domain data/transforms into `lib/acc/` or `lib/domain/access-analysis/`.

**Communication surfaces across Google/mail/chat/calendar:**
- `lib/google/`, dashboard components, and routers all participate.
- Target: keep provider API logic in `lib/google/` and UI state in components.

**Scripts mix durable jobs and diagnostics:**
- Durable cron/backfill scripts and one-off probes share one folder.
- Target: separate `scripts/jobs/`, `scripts/diagnostics/`, and `scripts/lib/`.

## 8. Dead or Low-Confidence Cleanup Candidates

Do not delete these without manual verification:
- `scripts/scratch/*` - likely one-off diagnostics, but some may encode useful probes.
- `docs/archive/*` - archival planning context; low runtime value but possible historical value.
- `.planning.backup/` - backup state; verify before removing.
- `.next-old/`, `.next-prev-deploy/` - generated deployment/build leftovers; verify no local runbook depends on them.
- Route-local test fixtures under `app/(dashboard)/users/access-analysis/__fixtures__/` - likely useful for tests.
- Large generated repo-map XML under `.tools/repo-map/` - generated and disposable, but useful for analysis.

Conservative rule: only delete when `rg`, imports, tests, scripts, docs, and runbooks all agree the artifact is unused or generated.

## 9. Recommended Folder Structure

Target shape for future cleanup:

```text
app/                          # route shells, pages, API handlers
components/                   # reusable UI and visual widgets
features/                     # optional future feature UI/hook modules when route folders get too dense
server/routers/               # tRPC boundary only
server/services/              # orchestration/business services used by routers/jobs
lib/acc/                      # ACC domain types, taxonomy, transforms, clients
lib/domain/access-analysis/   # pure access-analysis graph/table/selection transforms
lib/integrations/google/      # provider-specific clients
lib/integrations/autodesk/    # APS/ACC provider-specific clients
lib/integrations/uploadthing/ # upload-specific helpers
lib/shared/                   # cross-domain schemas/constants
scripts/jobs/                 # repeatable production/backfill jobs
scripts/diagnostics/          # one-off inspection commands
scripts/lib/                  # script-only helpers
services/lod-engine/          # Python service, isolated behind explicit routes/scripts
```

Do not create this structure wholesale. Migrate into it only when a current dependency warning, duplicate responsibility, or feature change justifies the move.

## 10. Priority Cleanup Roadmap

| Priority | Recommendation | Classification | Proof/Trigger | Verification |
|---:|---|---|---|---|
| 1 | Move `moduleOverrides.ts` out of `app/(dashboard)/access-analysis/` into a domain/lib folder and update four diagnostic scripts plus UI imports | Safe to plan, medium risk to implement | Four `no-scripts-to-app` warnings point to the same target | Targeted tests plus `npm run repo-map:check` |
| 2 | Move `graphNodesFromUsers.ts` and `instanceFeatureTokens.ts` into a shared graph/domain folder | Medium risk | Two `no-scripts-to-app` warnings and script reuse | Existing graph/table tests, script smoke, repo-map gate |
| 3 | Add characterization tests around `lib/acc/dcIngest.ts` seams before splitting ingestion services | Medium risk | Largest domain/orchestrator file | `npm test -- lib/acc/dcIngest.test.ts` and adjacent tests |
| 4 | Extract pure transforms from `HybridAnalyticsSurface.tsx` and `FolderPermissionTerrain.tsx` before UI refactors | Medium risk | Large UI files and UAT sensitivity | Unit tests, `npx tsc --noEmit`, targeted Playwright/UAT |
| 5 | Audit and remove or explicitly justify the single direct-Prisma-in-UI baseline | Needs manual verification | `direct-prisma-in-ui` baseline in `app/(dashboard)/access-analysis/coordinationActions.ts` | repo-map blocking rule goes to 0 or documented exception |
| 6 | Split durable scripts from diagnostics/scratch scripts | Needs manual verification | `scripts/` has 230 mapped files and mixed responsibility | Script runbook review and import search |
| 7 | Add focused dependency-cruiser rules after current warnings are fixed | Safe | Existing baseline mechanism works | `npm run repo-map:check` |
| 8 | Install Graphviz in environments where SVG dependency graph matters | Safe | Manifest reports `graphvizDotAvailable: false` | Fresh `.tools/repo-map/dependency-graph.svg` generated from DOT |
| 9 | Review 123 `console.log` findings and 5 unsafe TODO findings as cleanup queue | Safe | ast-grep report | No production behavior change; targeted tests only if code changes |
| 10 | Keep UAT gate as final approval for workshop-facing UI changes | Safe | Phase 7 runbook and tests are established | `node scripts/uat/run-engineering-gates.cjs` |

## Recommended First Work Slice

Start with the shared route-owned module moves because the dependency graph gives an exact, narrow target:

1. Create a domain location for access-analysis/shared ACC helpers.
2. Move `app/(dashboard)/access-analysis/moduleOverrides.ts`.
3. Update four diagnostic script imports and UI imports.
4. Move tests or add a new test next to the new module if coverage does not move cleanly.
5. Run `npm test -- moduleOverrides` or the nearest existing tests.
6. Run `npm run repo-map:check` and confirm dependency warnings drop from 6 to 2.
7. Repeat for `graphNodesFromUsers.ts` and `instanceFeatureTokens.ts`.
8. Run `npm run repo-map:check` and confirm dependency warnings drop from 2 to 0.

Expected outcome: zero dependency warnings without touching UI behavior.

---

*Roadmap generated from fresh repo-map output on 2026-06-19.*
*Refresh source facts with `npm run repo-map:check` before executing any cleanup phase.*
