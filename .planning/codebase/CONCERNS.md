# Codebase Concerns

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-02 — targeted post-v2.1/v2.2 status update (repo-map basis unchanged, 2026-06-19)
**Repo-map date:** 2026-06-19 (architecture-summary.md)
**Branch:** feat/access-analysis-redesign

> **Reading note (2026-07-02):** v2.1 Concerns Hardening (Phases 09–14) and
> v2.2 Structural Refactors (Phases 15–19) were built directly against this
> document and closed most of §1, §2, §6, §7, and §8.1. Each resolved item
> keeps its original text with a dated **Status** line. Still-open concerns
> (§3 spatial-graph, §4, §5, §8.2–8.3) are seeds for future milestones. See
> the "v2.1/v2.2 Resolution Summary" section at the end for the roll-up and
> the new current concerns.

---

## 1. Prisma / Database Layer

### 1.1 AccFolderPermission — raw 5M-row scan path still reachable

- **Files:** `lib/server/acc-hot-cache.ts` lines 262–325; callers in `server/routers/acc-members.ts` lines 592–671; `lib/server/folderPermissionTerrainView.ts`, `lib/server/templateFolderTerrain.ts`, `lib/server/templateRoleSimilarity.ts`, `lib/server/templateView.ts`, `lib/server/templateRoleTree.ts`, `lib/acc/deepFindings.ts`
- **What it is:** `AccFolderPermission` holds ~5M rows. The OOM/77s-load bug was fixed for the `getKpiSummary` / `bulkUsers` path by switching the `includePermissionSummary` branch to a SQL `GROUP BY` aggregate (→ ~13k rows). However, the `includePermissionContexts: true` path still issues a raw `db.accFolderPermission.findMany` that materialises all matching rows into Node heap. Any caller that sets `includePermissionContexts: true` re-opens the OOM window.
- **Impact:** Heap exhaustion and 60-90s load on any request that exercises the contexts path. Currently no production caller is confirmed to use `includePermissionContexts: true`; but the path is structurally live and undocumented for new contributors.
- **Guardrail:** Add a comment block to the `includePermissionContexts` branch warning of the row-count risk. Add a `VERIFY:` note that the contexts path has no active callers before enabling any feature that needs per-folder grant details. Long-term: materialise a `AccFolderPermissionSummary` view or indexed projection table.
- **Status (2026-07-02): ✅ RESOLVED (v2.2 Ph18 PROJ-01/REF-03 + Ph19 PROJ-02).** The long-term guardrail shipped: `AccFolderPermissionSummary` projection materialized (22,082 rows, reconciliation PASS), `includePermissionSummary` now reads the projection via `lib/server/acc-hot-cache.ts`, and `includePermissionContexts` **throws** unless `ACC_ALLOW_RAW_PERMISSION_SCAN=1`. Raw-scan path is hard-guarded, refreshed daily by the dc-daily-ingest cron success branch (Ph19 PROJ-03).

### 1.2 AccFolderPermission missing index on `roleId`

- **File:** `prisma/schema.prisma` lines 529–539
- **What it is:** `AccFolderPermission` has `@@index([folderId])` and `@@unique([folderId, roleId])`, but no standalone `@@index([roleId])`. Queries that filter or join by `roleId` alone (e.g., permission-terrain views, template-role-tree) require a full index scan on `folderId` first.
- **Impact:** Template and terrain queries joining `AccFolderPermission` by `roleId` are slower than necessary at 5M rows.
- **Guardrail:** Add `@@index([roleId])` to `AccFolderPermission` and run `prisma migrate dev` after validating with `EXPLAIN ANALYZE` on the terrain query.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph09 DB-01).** `@@index([roleId])` added to `AccFolderPermission`.

### 1.3 `scripts/count-acc-data.cjs` — `ssl:{rejectUnauthorized:false}` fossil

- **File:** `scripts/count-acc-data.cjs` line 14
- **What it is:** This diagnostic script creates a raw `pg.Client` with `ssl: { rejectUnauthorized: false }`, a Supabase-era workaround. The dashboard migrated to local trust-auth Postgres (2026-05-18); local connections do not use SSL at all. This flag silently succeeds on local Postgres but would accept a spoofed certificate on any TLS-enabled server.
- **Impact:** Low operational risk (diagnostic-only script, local machine), but the pattern is a fossil that could be copy-pasted into a production script. The Prisma adapter path (`server/db.ts`) is unaffected and correct.
- **Guardrail:** Remove the `ssl` option from `scripts/count-acc-data.cjs` line 14 and replace the raw `pg.Client` with the project Prisma client or a pool that inherits `DATABASE_URL`.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph09 DB-02).** The `ssl:{rejectUnauthorized:false}` fossil was removed.

### 1.4 PG pool ceiling not documented as a tuning knob

- **File:** `server/db.ts` lines 28–29
- **What it is:** `PG_POOL_MAX` defaults to `5` in production and `10` in development. The `.env` sets it to `32` (verified: `.env` line references in memory). There is no `.env.example` entry or in-code comment explaining why 32 was chosen or what the Postgres server's `max_connections` ceiling is.
- **Impact:** If `.env` is not carried forward after a machine re-provision, the pool silently reverts to 5 concurrent connections — under-serving the parallel tRPC calls the access-analysis page fires at load (at least 5 concurrent queries observed in `HybridAnalyticsSurface.tsx`).
- **Guardrail:** Add `PG_POOL_MAX=32` to `.env.example` with a comment. Document the local Postgres `max_connections` setting and the formula (pool × workers ≤ max_connections).
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph09 DB-03).** `PG_POOL_MAX` documented in `.env.example`.

### 1.5 Heap configuration via `NODE_OPTIONS` not tracked in repo

- **Files:** `.env` (not in repo), `package.json` start scripts
- **What it is:** The `--max-old-space-size=8192` flag was added to prevent OOM during AccFolderPermission / bulkUsers loads (memory note: "8GB heap"). There is no `NODE_OPTIONS` entry in `.env.example` or in `package.json` scripts to ensure this is reproduced on rebuild.
- **Impact:** On a fresh machine or after `.env` loss, the process starts with the default ~1.5GB heap and can OOM on large access-analysis or bulkUsers requests.
- **Guardrail:** Add `NODE_OPTIONS=--max-old-space-size=8192` to `.env.example` with a `# required for access-analysis at scale` comment.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph09 DB-03).** `NODE_OPTIONS` heap flag documented in `.env.example`.

---

## 2. `/access-analysis` Route — Module Density and Boundary

### 2.1 Direct Prisma access in a Server Action (boundary violation)

- **File:** `app/(dashboard)/access-analysis/coordinationActions.ts` lines 1–30
- **What it is:** This Server Action imports `db` from `@/server/db` directly, bypassing the tRPC router layer. Confirmed by `ast-grep` rule `direct-prisma-in-ui` (1 match, baseline 1). The action itself is a well-scoped `accIssue.findMany` gated by `auth()`, so there is no immediate security hole, but the pattern breaks the boundary rule that Prisma access belongs in `server/routers/` or `lib/server/`.
- **Impact:** Cross-layer coupling. If auth logic evolves or Prisma logging/middleware is added at the router layer, this action is bypassed.
- **Guardrail:** Move the query into `server/routers/acc-members.ts` or a new `server/routers/acc-coordination.ts` procedure, and call it via `trpc.accMembers.getProjectClashes.query()` from the Server Action or a client hook.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph10 BND-01).** Query moved behind `server/routers/acc-coordination.ts` (`getProjectClashes`); `coordinationActions.ts` is now a thin delegate (19 lines). The `direct-prisma-in-ui` ast-grep rule returns 0 matches.

### 2.2 `moduleOverrides.ts` imported directly by four diagnostic scripts (scripts→app boundary)

- **Files:** `scripts/diag-activity-coordination.cjs`, `scripts/diag-activity-module-audit.cjs`, `scripts/diag-activity-service-xtab.cjs`, `scripts/diag-activity-types.cjs` — all import from `app/(dashboard)/access-analysis/moduleOverrides.ts`
- **What it is:** Four `scripts/` files cross the `no-scripts-to-app` dependency boundary (all 6 dependency-cruiser warnings involve `app/` imports from `scripts/`). The other 2 warnings are from `scripts/build-instance-features.ts` importing `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` and `instanceFeatureTokens.ts`.
- **Impact:** `moduleOverrides.ts` cannot be safely moved or refactored without updating these scripts. Any change to its import graph (e.g., adding a Next.js-only module) breaks script execution. Currently non-blocking in CI but flagged as growth-gated warnings.
- **Guardrail:** Extract the pure classification logic (`classifyActivity`, `donutModules`, `n()`, `CATEGORY_LABELS`) from `moduleOverrides.ts` into `lib/acc/activityClassification.ts` and re-export from `moduleOverrides.ts` for the UI. Scripts import from `lib/`. Similarly, move `graphNodesFromUsers` and `instanceFeatureTokens` to `lib/acc/` or `lib/server/`.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph10 BND-02).** Classification logic extracted to `lib/acc/activityClassification.ts`; diagnostic scripts import from `lib/`.

### 2.3 Large monolithic files in `/access-analysis`

- **Files:**
  - `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` — 1,041 lines (50 KB)
  - `app/(dashboard)/access-analysis/folderTerrain.ts` — 1,093 lines (49 KB)
  - `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` — 1,326 lines (55 KB)
- **What it is:** These files combine data fetching, pure transforms, GPU/canvas interaction, and UI rendering in single modules. `HybridAnalyticsSurface.tsx` alone fires at least 6 tRPC queries, manages DuckDB-Wasm state, and owns filter/selection state (confirmed from import + hook scan).
- **Impact:** Changes to data shape, rendering, or filter logic all land in the same file, creating high merge-conflict risk. Test isolation is poor — unit tests must mock many layers at once.
- **Guardrail:** Before any refactor, add characterization tests at the tRPC boundary (`server/routers/acc-members.ts` procedure outputs) and for pure transform functions. Split data-fetch hooks into `useAccessAnalysisData.ts`, transforms into `lib/acc/accessAnalytics.ts`, and keep `HybridAnalyticsSurface.tsx` as a thin composition shell.
- **Status (2026-07-02): ✅ RESOLVED (v2.2 Ph16–17 SPLIT-01–04, after v2.1 Ph14 characterization tests).** All three monoliths split with byte-identical output pins held:
  - `FolderPermissionTerrain.tsx` 1,041 → 212 lines + `TerrainStage.tsx` (392), `TerrainControls.tsx` (252), `TerrainReveal.tsx` (68), `terrainViewModel.ts` (121), `useFolderPermissionTerrainCamera.ts` (154)
  - `folderTerrain.ts` 1,093 → `folderTerrainCamera.ts` (387), `folderTerrainLayout.ts` (279), `folderTerrainModel.ts` (270), `folderTerrainScene.ts` (260)
  - `HybridAnalyticsSurface.tsx` 1,326 → thin shell + `useHybridAnalytics.ts`, `hybridAnalyticsTransforms.ts`, view/panel/drilldown modules (8 files ≤400 lines)

### 2.4 `AccDcRole` permanently empty — role analytics rely on fallback join

- **Files:** `lib/server/accessInstanceView.ts` lines 20–35; `server/routers/acc-dc-graph.ts` lines 11–12; `lib/server/acc-hot-cache.ts` (`mergeRoleNames` call)
- **What it is:** Autodesk's Data Connector has never delivered `admin_roles.csv`, so `AccDcRole` has 0 rows in production. Role names are resolved via `mergeRoleNames()` which falls back to `AccRole` (live API-synced, 13,711 matches). If the DC ever starts sending role data, the merge will silently prefer DC names over live names on conflict — which may or may not be correct.
- **Impact:** Silent data correctness risk. If `AccRole` sync breaks, role counts drop to 0 with no user-visible error. No alert or monitoring exists for `AccRole` row count.
- **Guardrail:** Add an observable to `acc-hot-cache.ts` that logs a warning when `AccDcRole` is still empty after a cache refresh. Document the fallback in `INTEGRATIONS.md`. VERIFY: whether `AccRole` sync (APS account-roles API) runs on a reliable schedule.
- **Status (2026-07-02): 🟡 PARTIALLY ADDRESSED (v2.1 Ph11 TRUTH-04).** The fallback is documented in `INTEGRATIONS.md`. Row-count monitoring / empty-`AccDcRole` warning remains open.

### 2.5 Activity `service` field ignored — module donut misattribution

- **Files:** `app/(dashboard)/access-analysis/moduleOverrides.ts` (classifyActivity); `scripts/diag-activity-service-xtab.cjs` (diagnostic)
- **What it is:** `AccActivity.service` is Autodesk's own product attribution field. `classifyActivity()` derives module from `rawAction` only and ignores `service`. According to the diagnostic scripts, ~40.7% of rows have a `service` value that disagrees with the `rawAction`-derived module. The Model Coordination donut category is intentionally excluded and redirected to Data Management, but Autodesk's own Build/Model Coordination boundary is ambiguous for ~966 clash-issue rows. The `service` refinement is noted as a deferred surgical fix.
- **Impact:** Module-activity donuts on `/access-analysis` may overcount Data Management and undercount Build for clash/issue workflows. Labeled as a data-truthfulness limitation, not a bug, but not communicated to the user in the UI.
- **Guardrail:** Add a tooltip or footnote to the module-activity donut explaining that classification is based on `rawAction` and that Autodesk's service attribution is not yet reconciled. Track the `service`-override refinement as a deferred phase item.
- **Status (2026-07-02): ✅ RESOLVED — UI labeling (v2.1 Ph11 TRUTH-02).** The classification caveat is labeled in the UI. The underlying `service`-override refinement itself remains deferred as **SVC-01** (next-milestone candidate).

### 2.6 ACCDS ~12-month history floor not labeled in UI

- **Files:** `lib/server/activityByActorView.ts` lines 24–28; `lib/server/activityTimelineView.ts`; `lib/server/moduleActivityView.ts`; `lib/server/unifiedActivitySource.ts`
- **What it is:** The unified activity source (`AccActivityAccds` + `AccActivity` DC backfill) has a practical history floor of approximately 12 months for the ACCDS-fed portion (confirmed in Phase 8 memory: "~12mo history floor"). The union correctly avoids double-counting via the `astart` CTE, but activity timeline charts do not display a data-floor caveat to the user.
- **Impact:** A user viewing the timeline for a project fully covered by ACCDS will see activity only back to ~12 months ago, with no indication this is a source limitation rather than actual inactivity.
- **Guardrail:** Add a `dataFloor` field to the activity timeline API response and display a "Data available from [date]" footnote on timeline charts. VERIFY: exact per-project `MIN(createdAt)` from `AccActivityAccds` to confirm the floor.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph11 TRUTH-03).** `ActivityTimelineChart.tsx` now renders `dataFloor` / `floorByProject` captions.

---

## 3. `/users/spatial-graph` — Performance and Fragility

### 3.1 Client-side DuckDB-Wasm on the render critical path

- **Files:** `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` lines 12, 565–607; `app/(dashboard)/users/access-analysis/duckdbClient.ts` (VERIFY: exact path)
- **What it is:** DuckDB-Wasm is eagerly warmed in a `useEffect` at mount time (`canInitializeDuckDbInBrowser()` + `getDuckDbClient()`). When DuckDB is not available the component falls back to server-computed distributions, but the warm-up attempt blocks the Worker thread budget and contributes to the sub-second threshold miss. The memory note records "True sub-second still needs server-precomputed snapshot (client DuckDB on critical path)."
- **Impact:** First meaningful paint is delayed by Wasm module fetch + instantiation on cold loads. Slow machines and throttled connections will see noticeable lag before charts resolve.
- **Guardrail:** Move DuckDB warm-up to an `idle` callback (via `requestIdleCallback`) rather than a synchronous `useEffect`. Consider pre-computing distribution data server-side and shipping it as part of the page payload, reserving DuckDB for interactive drill-downs.
- **Note (2026-07-02):** File references changed — `HybridAnalyticsSurface.tsx` was split in v2.2 Ph17 (SPLIT-03/04); the data/warm-up logic now lives in `useHybridAnalytics.ts` + `hybridAnalyticsTransforms.ts`. The concern itself (client DuckDB on the critical path) remains **open**, deferred to a future spatial-graph milestone.

### 3.2 cosmos.gl GPU simulation reheat fight on slider change

- **Files:** `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (imports `@cosmos.gl/graph`); `app/(dashboard)/users/access-analysis/clusterTransitionLayer.ts`; `app/(dashboard)/users/access-analysis/physicsLayer.ts`
- **What it is:** The 2D cosmos.gl renderer runs in frozen mode (`enableSimulation:false`) but can be accidentally reheated when `applySliders` or `setClustering` is called without guarding against the `clusterActive` flag. The bug was patched (commits `95187af`, `e9dcaed`, `b2e4098`) but `clusterTransitionLayer.ts` still has EPSILON and TAU tuning comments that reveal the mechanism is fragile around reheat timing. The `SKIP_THRESHOLD` was reduced from `0.02` to `0.005` to fix dead zones.
- **Impact:** Single-step slider input may still produce visible lag or frozen frames on lower-end GPUs. The lasso e2e test has a documented 120s timeout flake under machine load.
- **Guardrail:** Add a `PERF-01` invariant test asserting that `applySliders` with a delta < `SKIP_THRESHOLD` does not call `setClusterPositions` or trigger a GPU upload. Document the `enableSimulation:false` + `setConfigPartial`-only contract in a code comment at the top of `GraphCanvas2D.tsx`.

### 3.3 176+ action catalog entries loaded at graph init

- **Files:** `app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts` (176 action entries); `app/(dashboard)/users/access-analysis/catalogSliders.ts`
- **What it is:** The dimension catalog is generated from 176 ACC action IDs. These are loaded synchronously at graph init when `CatalogSliderSidebar` mounts. The architecture-summary note "Perf watch on ~190 catalog targets at load" refers to this. All 176 actions become dimension slider state entries even if the user never opens the sidebar.
- **Impact:** Initial state tree creation for the slider sidebar is O(n) over 176 entries. Combined with DuckDB warm-up and cosmos.gl init, this contributes to the first-paint budget on the spatial-graph page.
- **Guardrail:** Lazy-load `accTaxonomyActions.generated.ts` only when the slider sidebar is opened (dynamic import or deferred state population). Pre-compute a minimal default state (all-zero) as a static constant rather than iterating the full catalog.

### 3.4 Lasso e2e test — 120s global budget flake

- **File:** `tests/e2e/acc-3d-lasso.spec.ts`
- **What it is:** The 3D lasso Playwright test times out at the 120s global budget under machine load on Luis's PC. The lasso projection logic itself is correct (`findPointsIn3DLasso`), but the test depends on the full physics graph warming up and rendering at `:3100` within the timeout window.
- **Impact:** CI-equivalent runs on a loaded machine will fail intermittently, creating false negatives.
- **Guardrail:** Add a `test.slow()` Playwright annotation or increase the specific test timeout beyond 120s. Pin the test to a smaller node set or use a `NEXT_PUBLIC_ACC_GRAPH_TEST=1` fixture that limits node count, similar to the existing e2e flag pattern.

### 3.5 Hydration-key mismatch history — prefetch cache miss

- **Files:** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`; `app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx`
- **What it is:** A prior hydration-key mismatch (server prefetch returned `undefined` for `{permSummary, activityMix}` while the client expected a real shape) caused a redundant heavy refetch on mount (fixed per memory 2026-06-03). The fix was applied but there are no regression tests to guard against a re-introduction of mismatched prefetch keys.
- **Impact:** If a new tRPC query is added to the shell with a different prefetch shape than the server component returns, the silent cache miss re-triggers the 77s+ OOM-risk query path.
- **Guardrail:** Add a Vitest unit test that asserts the prefetch input shapes for `accMembers.getBulkUsers` and `accFolders.getMatrix` match the client query inputs exactly (same `select` fields, same `where` clauses). Document the prefetch contract in a comment at the top of `AccessAnalysisShell.tsx`.

---

## 4. `/users` — Lean Payload Trap

### 4.1 Bulk user payload empties per-project roles and modules

- **Files:** `server/routers/acc-members.ts` (`bulkUsers` / lean payload path); `app/(dashboard)/users/access-analysis/dataLayer.ts` (two `TODO` comments at lines 41, 112)
- **What it is:** The `/users` lean bulk call intentionally strips per-project roles and modules to keep the payload manageable. Consumers that expect roles or modules (e.g., `lastActivity`, per-project role displays) must source from separate endpoints (`lastFileActivityByEmailAll`, `bulkUser`, hover-prefetch). Two `TODO` comments in `dataLayer.ts` explicitly defer the "Replace with activity_in_module / total_activity once DC CSV join is wired" fix.
- **Impact:** New features that consume `bulkUsers` and expect populated `roles` or `modules` fields will silently receive empty arrays. This has bitten previous phases (lean payload trap, memory 2026-06-18).
- **Guardrail:** Add a TypeScript type comment on the `bulkUsers` return type marking `roles` and `modules` as `never[] // lean payload — always empty; use bulkUser or hover-prefetch for per-project data`. Resolve the two `dataLayer.ts` TODOs when DC CSV join is available.

### 4.2 `accGraphFilters.ts` — compile-time assert deferred

- **File:** `app/(dashboard)/users/accGraphFilters.ts` line 15
- **What it is:** A `TODO` comment notes that if two union types ever drift, a compile-time assert helper should be added. No assert exists. If the filter type unions diverge, the mismatch is silent at compile time.
- **Impact:** Low — only affects type safety in the filter composition path. Not a runtime risk.
- **Guardrail:** Add a `type AssertExtends<A, B extends A> = B` or `satisfies` narrowing assertion when the next change touches `accGraphFilters.ts`.

---

## 5. APS / ACC Integration Risks

### 5.1 ACCDS session token — cookie-based, no automatic rotation

- **Files:** `lib/acc/accdsToken.ts`; `scripts/accds-login.cjs` (VERIFY: path)
- **What it is:** ACCDS API access uses a Playwright-recorded browser session (`storageState` cookies). The `fetchFreshToken()` function refreshes the short-lived access token from the cookie, but the cookie itself is not automatically renewed — it must be re-captured by running `scripts/accds-login.cjs` manually. A `SessionExpiredError` from ACCDS stops all Phase 8 activity crawls silently unless the cron log is inspected.
- **Impact:** Activity extraction fails silently if the session expires. There is no alerting or health-check endpoint that surfaces ACCDS session health.
- **Guardrail:** Add a ACCDS session health check to the progress monitor (`scripts/progress-monitor.cjs`). Emit a log warning (`[WARN] ACCDS session expires in <N> hours`) before the token refresh path is attempted. VERIFY: what the cookie TTL is for autodesk.com ACC sessions.

### 5.2 APS 2-leg client credentials — Data Connector locked to 428/1152 projects

- **Files:** `lib/acc/dcIngest.ts`; `scripts/dc-daily-ingest.cjs` (VERIFY: path)
- **What it is:** The production APS `client_id` is project-scoped admin only (not Account Admin). 724 of 1,152 active projects return 403 from the Data Connector API. The bisect-on-403 helper (`lib/acc/dcProgressiveBackfill.ts`, flag `DC_403_BISECT`) salvages good projects from a forbidden batch, but the fundamental coverage gap requires Account Admin provisioning.
- **Impact:** ~63% of projects are permanently excluded from DC activity data. Analytics for those projects default to null/zero, which is not labeled in the UI.
- **Guardrail:** Surface the 428/1,152 covered-project count on the `/access-analysis` data freshness panel. Label any metric derived from DC data with "Based on X of Y projects with Data Connector access." VERIFY: Account Admin provisioning status.
- **Update (2026-07-02):** Still **open** (the Account Admin provisioning blocker is unchanged — DC-01/DC-02 next-milestone candidates). Note the v2.1 Ph11 data-truthfulness work rejected the "428 of 1,152" headline figure; VERIFY the current covered-project count before surfacing it in any UI (~550/1,153 per Ph11 correction).

### 5.3 `lib/acc/acc-admin.ts` — stale field-name TODO guards from sync 02.5

- **File:** `lib/acc/acc-admin.ts` lines 51, 207
- **What it is:** Two `TODO[02.5]` comments mark temporary defensive logging that was supposed to be removed "after first sync confirms field names." These are AST `unsafe-todo` findings from the repo-map scan. The sync has run; the guards are stale.
- **Impact:** Extra logging noise per admin sync run. Low risk, but clutters the signal when diagnosing real sync issues.
- **Guardrail:** Remove the two `TODO[02.5]` guards after confirming the live field names match the expected shape (a one-time manual check).

---

## 6. `/template-mty` — Shared Logic Concentration

### 6.1 Template and access-analysis share permission-terrain logic across two routes

- **Files:** `lib/server/templateFolderTerrain.ts`, `lib/server/templateView.ts`, `lib/server/templateRoleSimilarity.ts`, `lib/server/templateRoleTree.ts` (template-mty sources); `lib/server/folderPermissionTerrainView.ts` (access-analysis source); `app/(dashboard)/access-analysis/folderTerrain.ts` (1,093 lines)
- **What it is:** Both `/template-mty` and `/access-analysis` derive their folder-permission terrain from `AccFolderPermission`. The server logic is split across four `lib/server/template*.ts` files and one `lib/server/folderPermissionTerrainView.ts`. The client-side terrain in `folderTerrain.ts` (1,093 lines) duplicates some aggregation logic that also exists server-side.
- **Impact:** Schema changes to `AccFolderPermission` (e.g., adding `roleId` index, new columns) must be reconciled in at least six files. The shared SQL pattern is repeated rather than composed from a single helper.
- **Guardrail:** Extract a shared `lib/server/folderPermQuery.ts` that owns the base `AccFolderPermission` join pattern, filtered by `folderCrawlStatus`. Both template and access-analysis server helpers import from it. This reduces the blast radius of schema changes.
- **Status (2026-07-02): ✅ RESOLVED (v2.2 Ph15 QUERY-01/REF-02).** `lib/server/folderPermQuery.ts` now owns the shared join (`loadFolderPermRows`, two static branches: all-folders and `l2Only`); both template and access-analysis server helpers consume it. Byte-identical characterization tests (TEST-02/03, 9/9) pin the outputs. The client-side `folderTerrain.ts` monolith was separately split in Ph16 (see §2.3).

---

## 7. Architecture Boundary Warnings

### 7.1 `lib -> app` reverse dependency (20 imports flagged)

- **Source:** `architecture-summary.md` section 8 — `lib -> app: 20 imports`
- **What it is:** 20 edges flow from `lib/` into `app/`, the reverse of the expected direction (`app -> lib`). The exact modules were not individually enumerated in the repo-map output but the count is flagged as a boundary smell. One confirmed example: `lib/acc/dcUserAssembly.ts` imports from `app/(dashboard)/users/access-analysis/internalDomains.ts`.
- **Impact:** Any `lib/` code that imports from `app/` creates a coupling that prevents `lib/` from being tested or reused outside of the Next.js app context.
- **Guardrail:** Run `node scripts/repo-map/check.cjs` to enumerate all `lib -> app` edges. Move pure modules like `internalDomains.ts` to `lib/acc/` and update all importers. Target: 0 `lib -> app` edges.
- **Status (2026-07-02): ✅ AUDITED &amp; RESOLVED IN SCOPE (v2.1 Ph10 BND-03).** Full enumeration and classification recorded in the "BND-03 / BND-04 Resolution" section below. Note: the "Phase-14 monolith" blocker cited there for deferred group (3) was cleared when `folderTerrain.ts` was split in v2.2 Ph16, but those edges were not migrated in v2.2 (out of scope) — they remain future-cleanup candidates.

### 7.2 `app -> server` direct imports (29 edges)

- **Source:** `architecture-summary.md` section 8 — `app -> server: 29 imports`
- **What it is:** 29 edges import directly from `server/` in `app/`. This is expected for Server Components and Server Actions that call tRPC procedures or `auth()`, but some may be importing server utilities directly rather than going through the tRPC boundary.
- **Impact:** Direct `server/` imports in client components bypass tRPC type-safety and error handling middleware.
- **Guardrail:** VERIFY: which of the 29 edges are from Server Components/Actions (acceptable) vs. client components (violation). Use `rg -n "from.*@/server" app/ --include="*.tsx"` and filter for files without `"use server"` or `"use client"` (server component convention) at the top.
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph10 BND-04).** Audit verdict: **zero `"use client"` violations** — all edges are route handlers, Server Actions, or RSCs (the legitimate Next.js boundary pattern). See the BND-04 section below.

---

## 8. Test Coverage Gaps

### 8.1 No integration tests for AccFolderPermission aggregate query

- **Files:** `lib/server/acc-hot-cache.ts` lines 295–325 (SQL GROUP BY aggregate)
- **What it not tested:** The SQL `GROUP BY` aggregate that replaced the OOM `findMany` has no Vitest test. If the query is accidentally reverted or the SQL is corrupted, the OOM regression is invisible until production load.
- **Priority:** High — this was the dominant production failure mode.
- **Guardrail:** Add a Vitest test using a Prisma `$queryRaw` mock or a small in-memory Postgres (e.g., `pg-mem`) that verifies the aggregate returns ≤ `n_roles × n_projects` rows (not raw permissions).
- **Status (2026-07-02): ✅ RESOLVED (v2.1 Ph14 characterization tests + v2.2 Ph18 TEST-01).** The aggregate path is pinned by characterization tests; the TEST-01 OOM-guard suite (12/12) covers the `AccFolderPermissionSummary` projection path that now serves `includePermissionSummary`.

### 8.2 Spatial-graph physics layer tests are large and slow

- **Files:** `app/(dashboard)/users/access-analysis/physicsLayer.test.ts` (59 KB); `app/(dashboard)/users/access-analysis/GraphCanvas3D.test.ts` (45 KB)
- **What it is:** Two test files together exceed 100 KB. They are the largest test files in the repo. They likely mock the cosmos.gl and Three.js internals and test the physics simulation loop, making them slow and fragile to upstream library changes.
- **Impact:** Slow test suite iteration; any cosmos.gl upgrade risks breaking large swaths of tests that test library internals rather than Dashboard logic.
- **Guardrail:** Profile test runtime with `--reporter=verbose`. Refactor to test only the pure physics math (force computation, position deltas) with no canvas/GPU mocking. Move canvas-dependent tests to the existing Playwright e2e suite.

### 8.3 `acc-dc-graph.spec.ts` e2e test is 62 KB

- **File:** `tests/e2e/acc-dc-graph.spec.ts` (62 KB)
- **What it is:** Largest single e2e file. Likely covers the full graph surface including node selection, cluster transitions, 3D lasso, and filter interaction.
- **Impact:** High-maintenance; any refactor of the graph surface requires touching a 62 KB test file. Test failures are hard to isolate.
- **Guardrail:** Split into topical spec files by interaction surface: `acc-graph-clusters.spec.ts`, `acc-graph-filters.spec.ts`, `acc-graph-3d.spec.ts`. Keep each under 500 lines.

---

## Dashboard Self-Check

- **Context:** `architecture-summary.md` (2026-06-19), `prisma/schema.prisma`, `server/db.ts`, `lib/server/acc-hot-cache.ts`, `lib/server/accessInstanceView.ts`, `app/(dashboard)/access-analysis/coordinationActions.ts`, `app/(dashboard)/access-analysis/moduleOverrides.ts`, `lib/acc/dcUserAssembly.ts`, `app/(dashboard)/users/access-analysis/internalDomains.ts`, `scripts/count-acc-data.cjs`, `lib/acc/accdsToken.ts`, AST grep rules JSON, dependency-cruiser JSON.
- **Evidence:** All file paths verified via Bash/Read against the working tree. Prisma model names verified from `prisma/schema.prisma`. Query patterns verified from source. AccDcRole empty status verified from `server/routers/acc-dc-graph.ts` and `lib/server/accessInstanceView.ts` comments. `ssl:rejectUnauthorized:false` verified at `scripts/count-acc-data.cjs` line 14.
- **Constraints:** Zinc theme, no new WebGL on data surfaces, Prisma as analytics source, `npx tsc --noEmit` before rebuilds — all preserved; no UI or theme claims in this document.
- **Gates:** Read-only analysis; no code changes. No gates triggered.
- **VERIFY:**
  - `PG_POOL_MAX=32` in `.env` confirmed by rg match on `.env` line — value `n=32` appeared in a grep; confirm this is `PG_POOL_MAX` and not another env var named `n`.
  - ACCDS session cookie TTL duration (for session expiry alerting recommendation).
  - Account Admin provisioning status for Data Connector 403 coverage gap.
  - Exact list of `lib -> app` reverse-dependency edges (need `npm run repo-map` or `node scripts/repo-map/check.cjs` output for full enumeration). **RESOLVED in Phase 10 — see BND-03 section below.**
  - Whether `includePermissionContexts: true` has any active production caller.
  - `AccRole` sync schedule / reliability (for AccDcRole fallback risk).

---

## BND-03 / BND-04 Resolution (Phase 10 — 2026-06-23)

Phase 10 (Plans 10-01 through 10-03) resolved the `lib -> app` and `app -> server`
boundary warnings conservatively. The full gate sequence passed after all changes
(see §7.1/7.2 updates below for original concern; this section records the verdict).

### BND-03 — `lib -> app` Reverse Dependencies

**Audit command:** `node scripts/repo-map/check.cjs` (after `npm run repo-map`).
**Fresh enumeration date:** 2026-06-23 (post-wave-2, dependency-cruiser.json rebuilt).
**Edge count after Phase 10:** 21 total (was 20 before Phase 10 started;
wave-1/2 added 3 new edges from extracted modules, removed 3 via this plan's moves).

#### (1) FIXED IN PHASE 10

Three `lib/server/*View.ts` files had their row-type imports pointing into `app/`.
Each was resolved by moving the pure type/aggregation module to `lib/acc/` and
leaving a `export *` re-export barrel at the original `app/` path (so all UI
importers remain unchanged):

| Edge removed | Fixed by | Plan |
|---|---|---|
| `lib/server/coordinationByProjectView.ts → app/.../coordinationCounts.ts` | `lib/acc/coordinationCounts.ts` + barrel | 10-03 Task 1 |
| `lib/server/activityTimelineView.ts → app/.../timelineCounts.ts` | `lib/acc/timelineCounts.ts` + barrel | 10-03 Task 1 |
| `lib/server/moduleActivityView.ts → app/.../moduleCounts.ts` | `lib/acc/moduleCountsTypes.ts` + type re-export in `moduleCounts.ts` | 10-03 Task 1 |

#### (2) DEFERRED — SPATIAL-GRAPH-COUPLED (out of v2.1 scope)

These edges are rooted in the `/users/spatial-graph` surface or its data pipeline.
`internalDomains.ts` is explicitly excluded by REQUIREMENTS. All are documented-deferred
until the spatial-graph surface enters scope (currently out of v2.1 per locked decision).

| Edge | Source file | Target |
|---|---|---|
| dcUserAssembly → internalDomains | `lib/acc/dcUserAssembly.ts` | `app/(dashboard)/users/access-analysis/internalDomains.ts` |
| activityAggregate → accTaxonomy | `lib/acc/activityAggregate.ts` | `app/(dashboard)/users/access-analysis/accTaxonomy.ts` |
| acc-route-hydration → useUsersDirectoryData | `lib/server/acc-route-hydration.ts` | `app/(dashboard)/users/useUsersDirectoryData.ts` |
| activityClassification → accTaxonomy | `lib/acc/activityClassification.ts` | `app/(dashboard)/users/access-analysis/accTaxonomy.ts` |
| activityClassification → accNormalize | `lib/acc/activityClassification.ts` | `app/(dashboard)/users/access-analysis/accNormalize.ts` |

The last two edges (activityClassification → accTaxonomy/accNormalize) were introduced
by Plan 10-02 when the pure classification logic was moved from `moduleOverrides.ts` to
`lib/acc/`. The taxonomy/normalize modules live under `/users/access-analysis/` and are
spatial-graph-coupled — moving them requires the spatial-graph surface to be in scope.
Documented per checker execution-time note #1.

#### (3) DEFERRED — PHASE-14 MONOLITH (REF-01, folderTerrain.ts split required)

`app/(dashboard)/access-analysis/folderTerrain.ts` is a 1,093-line monolith that is
imported by multiple `lib/server/` view files. Moving any of these cleanly requires
splitting `folderTerrain.ts` first (characterization tests ship in Phase 14 per REF-01).
Moving them now would either violate the zero-behavior-change contract or pull Phase 14
forward — both violate the locked Conservative scope decision.

| Edge | Source file | Target |
|---|---|---|
| folderPermissionTerrainView → folderTerrain | `lib/server/folderPermissionTerrainView.ts` | `app/.../folderTerrain.ts` |
| folderPermissionTerrainView → folderInheritance | `lib/server/folderPermissionTerrainView.ts` | `app/.../folderInheritance.ts` (imports folderTerrain) |
| folderPermissionTerrainView → projectGroups | `lib/server/folderPermissionTerrainView.ts` | `app/.../projectGroups.ts` (imports ./projectFilter) |
| templateFolderTerrain → folderTerrain | `lib/server/templateFolderTerrain.ts` | `app/.../folderTerrain.ts` |
| templateFolderTerrain → folderInheritance | `lib/server/templateFolderTerrain.ts` | `app/.../folderInheritance.ts` |
| templateRoleTree → folderTerrain | `lib/server/templateRoleTree.ts` | `app/.../folderTerrain.ts` |
| templateView → folderTerrain | `lib/server/templateView.ts` | `app/.../folderTerrain.ts` |
| templateView → roleCounts | `lib/server/templateView.ts` | `app/.../roleCounts.ts` |
| templateView → permissionAccess | `lib/server/templateView.ts` | `app/(dashboard)/template-mty/permissionAccess.ts` (imports folderTerrain TIER_LEGEND) |
| templateView → moduleAccess | `lib/server/templateView.ts` | `app/(dashboard)/template-mty/moduleAccess.ts` |
| templateRoleSimilarity → roleSimilarity | `lib/server/templateRoleSimilarity.ts` | `app/(dashboard)/template-mty/roleSimilarity.ts` |
| accessInstanceView → modules | `lib/server/accessInstanceView.ts` | `app/(dashboard)/access-analysis/modules.ts` |
| accessInstanceView → types | `lib/server/accessInstanceView.ts` | `app/(dashboard)/access-analysis/types.ts` |
| template-mty-roster → types | `lib/acc/template-mty-roster.ts` | `app/(dashboard)/access-analysis/types.ts` |
| folderActivityView → folderActivityCounts | `lib/server/folderActivityView.ts` | `app/(dashboard)/access-analysis/folderActivityCounts.ts` |

#### (4) NOTED — CLEAN EDGE (not deferred, not a violation)

One additional lib→app edge is a clean, type-only import of a pure module that has NO
imports of its own (`coordinationClash.ts` has zero import statements). This is a
legitimate structuring choice — the type shapes live in `app/` because the data mapper
also lives there; the `lib/server` view imports only the pure interface. Per the Phase 10
Conservative scope decision, this is documented rather than moved:

| Edge | Source | Target | Classification |
|---|---|---|---|
| projectClashView → coordinationClash | `lib/server/projectClashView.ts` | `app/(dashboard)/access-analysis/coordinationClash.ts` | Clean type import, zero-import target — low-priority, movable in future cleanup (NOT spatial-graph, NOT monolith) |

Introduced by Plan 10-01. Checker execution-time note #1 documented this edge.

**Rationale for not moving coordinationClash.ts now:** The Conservative decision locks
scope to "remove only edges fixable outside spatial-graph AND outside the Phase-14
monolith." Moving coordinationClash.ts to lib/ would be safe but expands the plan's
surface. Deferring it keeps the commit boundary minimal.

---

### BND-04 — `app -> server` Direct Imports Audit

**Audit command:** `rg -n 'from "@/server' app/ -g "*.ts" -g "*.tsx"`
**Count post-10-01:** 28 edges (was 29 at baseline; 10-01 removed
`coordinationActions.ts → @/server/db`; the `@/server/auth` edge in
`coordinationActions.ts` was removed by delegation to the helper, so the net
from coordinationActions went from 2→0, but other files account for the 28 total).
**Date confirmed:** 2026-06-23.

**Verdict: ZERO "use client" violations.** All 28 edges originate from:

- `app/api/**/route.ts` route handlers (all API routes — 15 files, ~20 edges)
- `"use server"` Server Actions:
  - `app/(dashboard)/access-analysis/folderActivityActions.ts`
  - `app/(dashboard)/access-analysis/folderTerrainActions.ts`
  - `app/(dashboard)/template-mty/templateTerrainActions.ts`
- `app/(dashboard)/layout.tsx` — RSC layout (no `"use client"` directive)

No `app/` file with `"use client"` imports from `@/server/`. The direct
`server/` imports at the RSC/Action/route layer are the expected, legitimate Next.js
boundary pattern: Server Components and Server Actions may import from `server/`
because they run only on the server. BND-04's deliverable is this documented verdict;
no code fix is required.

**Classification method for reproducibility:**
1. `rg -n 'from "@/server' app/ -g "*.ts" -g "*.tsx"` — enumerate all import lines.
2. For each file: check first line for `"use client"` (client component = violation),
   `"use server"` (Server Action = acceptable), or neither (RSC or route = acceptable).
3. Files under `app/api/` are always route handlers (acceptable).
4. `app/(dashboard)/layout.tsx` is always an RSC (acceptable).

---

## v2.1 / v2.2 Resolution Summary and Current Concerns (2026-07-02)

### Resolved by milestone

| Concern | Resolved by |
|---|---|
| §1.1 raw 5M-row scan path | v2.2 Ph18 (projection) + Ph19 (consumer switch + `ACC_ALLOW_RAW_PERMISSION_SCAN` hard guard) |
| §1.2 missing `@@index([roleId])` | v2.1 Ph09 DB-01 |
| §1.3 `count-acc-data.cjs` ssl fossil | v2.1 Ph09 DB-02 |
| §1.4/§1.5 pool/heap knobs undocumented | v2.1 Ph09 DB-03 (`.env.example`) |
| §2.1 direct Prisma in Server Action | v2.1 Ph10 BND-01 (`acc-coordination.ts`) |
| §2.2 scripts→app `moduleOverrides` imports | v2.1 Ph10 BND-02 (`lib/acc/activityClassification.ts`) |
| §2.3 three monoliths (1,041/1,093/1,326 lines) | v2.2 Ph16–17 SPLIT-01–04 (all modules now ≤~640 lines, most ≤400) |
| §2.5 module-donut misattribution unlabeled | v2.1 Ph11 TRUTH-02 (UI label; SVC-01 refinement still deferred) |
| §2.6 ACCDS ~12-mo floor unlabeled | v2.1 Ph11 TRUTH-03 (`dataFloor` captions) |
| §6.1 duplicated terrain query | v2.2 Ph15 QUERY-01/REF-02 (`lib/server/folderPermQuery.ts`) |
| §7.1/§7.2 boundary edge audits | v2.1 Ph10 BND-03/BND-04 |
| §8.1 untested aggregate query | v2.1 Ph14 + v2.2 Ph18 TEST-01 |

### Still open (future-milestone seeds)

- §2.4 `AccDcRole` empty — monitoring/warning still missing (fallback documented only).
- §3.1–3.5 `/users/spatial-graph` performance and fragility (DuckDB warm-up, cosmos.gl reheat, 176-action catalog, lasso e2e flake, prefetch regression guard) — deferred spatial-graph milestone.
- §4.1/§4.2 lean-payload trap and filter-type assert.
- §5.1 ACCDS session expiry alerting; §5.2 DC 403 coverage (DC-01/DC-02); §5.3 stale TODO guards in `acc-admin.ts` (VERIFY: whether Ph12 observability work removed these).
- §8.2/§8.3 oversized physics/e2e test files.

### New concerns introduced or made visible by v2.2 (2026-07-02)

1. **`AccFolderPermissionSummary` freshness is cron-coupled.** The projection only refreshes in the dc-daily-ingest success branch (Ph19 PROJ-03). If the ingest cron fails or is disabled, `/access-analysis` permission summaries silently age; staleness bound is documented in `INTEGRATIONS.md`. No UI staleness indicator exists.
2. **Terrain still reads the live `folderPermQuery` `$queryRaw`.** Scoped out of v2.2 with evidence; the per-folder terrain projection is a deferred seed if terrain read cost becomes a concern.
3. **`.planning/` is mid-migration.** `MILESTONES.md`, `RETROSPECTIVE.md`, `milestones/`, and phase dirs 01–08 are deleted in the working tree (history retained in git HEAD); archival is deliberately deferred. Docs referencing those paths (e.g., the retrospective format pointer in the project skill) will not resolve until `/gsd:complete-milestone` regenerates them.

### Dashboard Self-Check (2026-07-02 refresh)

- **Context:** `.planning/STATE.md`, `PROJECT.md`, `ROADMAP.md` (v2.2 close, `5974d6f2`), phase artifacts 09–19, current source tree (post-split line counts read from disk), `prisma/schema.prisma`.
- **Evidence:** Resolution claims map to recorded phase requirements (DB-01..03, BND-01..04, TRUTH-02..04, QUERY-01, SPLIT-01..04, PROJ-01..03, TEST-01..03) and their commits in ROADMAP.md/STATE.md.
- **Constraints:** Statuses appended, original findings preserved; no code changed by this refresh.
- **Gates:** Docs-only update; no build/tsc gates applicable.
- **VERIFY:** current DC covered-project count (~550/1,153 per Ph11 correction); whether §5.3 TODO guards were removed by Ph12.
