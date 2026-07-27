# Codebase Concerns

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-22 — v2.7 milestone-close reconciliation; Phase 37/39 transient
debt resolved or bounded by Phase 41 evidence, standing operational ceilings retained.
**Refreshed:** 2026-07-22 (pm) — post-close perf-fix session (commits 22633278 + c998db1e);
new cosmos.gl patch/fitView/dual-GPU/link-visibility/cadence traps appended at the end.
**Refreshed:** 2026-07-23 — activity-universe full-corpus / 2D-3D session (12 commits
`1c346714`..`7d1420b9` + uncommitted WIP): duplicate-dict-label, headless-WebGL-gate,
two-flag fixture, and embedding-timestamp traps appended as the final section; §8.2/§8.3
and §B/§E figures corrected in place.
**Refreshed:** 2026-07-02 — targeted post-v2.1/v2.2 status update (repo-map basis unchanged, 2026-06-19)
**Refreshed:** 2026-07-16 — post-v2.4 close (d3768490) status sweep; repo-map re-run (`node scripts/repo-map/check.cjs` PASS: 2 dependency-cruiser warnings, 236 ast-grep findings, 0 blocking). See the "2026-07-16 Refresh" section at the end.
**Repo-map date:** 2026-07-14 (ast-grep-report.json `generatedAt`)
**Branch:** feat/access-analysis-redesign (⚠️ still WIP-heavy as of 2026-07-23 — see 2026-07-16 Refresh §D and the 2026-07-23 section §7; the access-analysis redesign WIP plus the current activity-universe work are un-committed)

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
- **Status (2026-07-16): ✅ RESOLVED (v2.1 Ph12, per 12-02-SUMMARY).** `lib/server/accessInstanceView.ts` now emits a `console.warn` on the *effective-empty* merged role map (both `AccDcRole` AND `AccRole` empty — the real silent failure), not on the by-design `AccDcRole`-empty state. Covered by `lib/server/accessInstanceView.test.ts` ("returns true when both AccDcRole and AccRole are empty").

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
- **Guardrail:** Add a `PERF-02` invariant test asserting that frozen layout-control calls do not start/reseed the simulation or upload cluster/anchor/config mutations. Document the `enableSimulation:false` contract at the renderer boundary.
- **Status (2026-07-15): ✅ RESOLVED (v2.4 Phase 27, PERF-02).** The frozen Cosmos handle invariant exercises `applySliders`, `setClustering`, `setClusters`, and `setClusterPositions` with `gpuSimulation:false` and proves zero simulation starts, reseeds, cluster-position writes, anchor writes, or config mutations. The live flag-off layout morph remains on the CPU/rAF static-layer path and never starts the worker simulation.

### 3.3 176+ action catalog entries loaded at graph init

- **Files:** `app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts` (176 action entries); `app/(dashboard)/users/access-analysis/catalogSliders.ts`
- **What it is:** The dimension catalog is generated from 176 ACC action IDs. These are loaded synchronously at graph init when `CatalogSliderSidebar` mounts. The architecture-summary note "Perf watch on ~190 catalog targets at load" refers to this. All 176 actions become dimension slider state entries even if the user never opens the sidebar.
- **Impact:** Initial state tree creation for the slider sidebar is O(n) over 176 entries. Combined with DuckDB warm-up and cosmos.gl init, this contributes to the first-paint budget on the spatial-graph page.
- **Guardrail:** Lazy-load `accTaxonomyActions.generated.ts` only when the slider sidebar is opened (dynamic import or deferred state population). Pre-compute a minimal default state (all-zero) as a static constant rather than iterating the full catalog.
- **Status (2026-07-15): ✅ RESOLVED (v2.4 Phase 26, CAT-02).** The Catalog tab now crosses a `React.lazy` boundary, while initial `SliderProvider` state is built from structural dimensions only. An authenticated production Chromium coverage gate proved the generated action module absent on Grouping first paint and present only after Catalog selection; the persisted slider id set stayed at 9 before and after opening the 208-row preview.

### 3.4 Lasso e2e test — 120s global budget flake

- **File:** `tests/e2e/acc-3d-lasso.spec.ts`
- **What it is:** The 3D lasso Playwright test times out at the 120s global budget under machine load on Luis's PC. The lasso projection logic itself is correct (`findPointsIn3DLasso`), but the test depends on the full physics graph warming up and rendering at `:3100` within the timeout window.
- **Impact:** CI-equivalent runs on a loaded machine will fail intermittently, creating false negatives.
- **Guardrail:** Add a `test.slow()` Playwright annotation or increase the specific test timeout beyond 120s. Pin the test to a smaller node set or use a `NEXT_PUBLIC_ACC_GRAPH_TEST=1` fixture that limits node count, similar to the existing e2e flag pattern.
- **Status (2026-07-20, Phase 34): CLOSED.** E2E-02 raised the inner `gotoGraph` readiness wait 120s→240s (the real trip point; the body already carried a scoped 360s `test.setTimeout`). Three consecutive flag-on passes recorded on the isolated :3100 prod-build harness (44.7s/37.6s/37.9s, commit `c1b78647`). The acc-dc-graph drift noted here was also re-baselined green the same phase (E2E-01: 16 passed / 8 skipped, node pin 22,279).

### 3.8 2D focus session — Escape does not restore the camera (2026-07-20, Phase 34)

- **Files:** `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` (`restoreView`), `app/(dashboard)/users/access-analysis/GraphInteractions.tsx` (reversible focus session)
- **What it is:** Isolating a node runs a deliberate camera focus session (`focusPoint` → cosmos `zoomToPointByIndex`, scale 2.25). On Escape, `restoreView` calls cosmos `setZoomTransformByPointPositions(view.center, duration, view.zoom, 0, false)` but the camera stays at the focused level — measured live on the e2e harness: zoom 1.000 (pre-focus) → 0.265 (focused) → 0.252 (after Escape). Isolation state itself clears correctly.
- **Impact:** Presenter must manually re-zoom after every node inspection; the "reversible" half of the focus-session contract is unimplemented in effect. The re-baselined e2e (Phase 34) deliberately does NOT assert restore — a fix should re-add that assertion.
- **Guardrail seed:** verify the cosmos.gl `setZoomTransformByPointPositions` argument semantics (center/scale/padding) against the installed 3.3.0 API; `fitViewByPointPositions` with the captured spread may be the correct restore primitive.
- **Status (2026-07-22, v2.7 close): SUPERSEDED.** The user-instance focus interaction
  was retired by ACT-03. Activity-node clicks now open the event detail rail without a
  camera-focus session, so there is no restore contract on the shipped route.

### 3.9 Default e2e dev-server harness broken; verify-config is the real path (2026-07-20, Phase 34)

- **Files:** `playwright.config.ts` (webServer `next dev --webpack` on :3100), `playwright.verify.config.ts`
- **What it is:** The default config's dev webServer 500s on `/login` (the documented webpack-dev `pg` bundling trap), so `npm run test:e2e` cannot boot its own server. Every real verification run (2026-07-14 dep update, Phase 34) uses `playwright.verify.config.ts` + an out-of-band isolated prod build (`NEXT_DIST_DIR=.next-e2e` + `NEXT_PUBLIC_*` flags at BUILD time) served by `next start` on :3100.
- **Impact:** `npm run test:e2e` is a dead path; new contributors/agents lose a webServer boot cycle (300s timeout) before discovering the verify harness.
- **Guardrail seed:** either fix the dev-server 500 or repoint the default config/`test:e2e` script at the prod harness; at minimum TESTING.md already documents the working invocation.

### 3.10 Cluster-label chips are flag-ON-only after the redesign (2026-07-20, Phase 34)

- **Files:** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (`blobDesc` gated on `ACC_3D_GRAPH_ENABLED`), `MapClusterLabels.tsx`
- **What it is:** `blobDesc` is only built when the 3D flag is on, so `MapClusterLabels` receives empty labels and renders nothing on the default flag-OFF embedding map — even with grouping active at full strength. The e2e assertion was deleted accordingly (E2E-01).
- **Impact:** If the owner expects named cluster chips on the default map (they shipped there pre-redesign), this is a silent feature regression of the uncommitted redesign branch, not an e2e problem.
- **Status (2026-07-22, v2.7 close): SUPERSEDED.** ACT-03 removed the instance-map flag
  path. DIM-07 now supplies activity-native cluster labels during group morphs through
  `ActivityUniverseShell` → `MapClusterLabels`, independent of the retired 3D flag.

### 3.11 Instance-era sidebar closeout audit (2026-07-21, Phase 40; resolved Phase 41)

- **Files:** `app/(dashboard)/users/access-analysis/` — `GroupByControls.tsx` (+test), `SliderContext.tsx`, `sidebarWidth.ts` (+test), `SelectionPanel.tsx`, `SelectionContext.tsx`, `groupByDimensions.ts`, `dimensionCoverage.ts`; WIP-carrying: `catalogTargets.ts`, `dimensionCatalog.types.ts`, `catalogTargets.test.ts`
- **Resolution:** Phase 41 re-audited every named file. Only `SelectionContext.tsx` was clean with zero importers and was deleted; every other candidate still has a source importer and was retained. The dirty catalog trio was preserved unchanged. `AccInstanceEmbedding` had no runtime consumer, so its table, Prisma model, create SQL/script, stale mocks, and ERD block were retired. The last clean E2E targeting the removed catalog sidebar was deleted after the live probe proved its selectors obsolete.
- **Status:** ✅ RESOLVED. No unproved instance-embedding runtime path or casually deleted WIP remains.

### 3.12 Ambient full-buffer upload cadence (2026-07-21, Phase 40; resolved Phase 41)

- **Files:** `app/(dashboard)/users/access-analysis/activity/activityMotion.ts`
- **Measured impact:** The first binding headed D3D11 sample ran 12.002 s / 574 frames at 47.8238 fps and demoted Tier 0→2, confirming the full rendered-buffer upload cadence as a blocker.
- **Resolution:** `activityMotion.ts` now emits new ambient targets at bounded cadence (Tier 0 10 Hz, Tier 1 5 Hz) while cosmos performs GPU interpolation between targets. The rebuilt full-artifact sample ran 12.004 s / 807 frames at 67.225 fps with ambient active and Tier 0→0 across 490,489 rendered / 4,904,886 resident events.
- **Status:** ✅ RESOLVED by Phase 41 REND-04 evidence.
- **Cadence update (2026-07-22, c998db1e):** the 10 Hz / 5 Hz figures above are superseded — `TIER_0_TARGET_MS = 250`, `TIER_1_TARGET_MS = 450` (4 Hz / ~2.2 Hz). See the 2026-07-22 perf-fix section item 5 for the measured rationale and the test pin.

### 3.5 Hydration-key mismatch history — prefetch cache miss

- **Files:** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`; `app/(dashboard)/users/access-analysis/AccessAnalysisShellClient.tsx`
- **What it is:** A prior hydration-key mismatch (server prefetch returned `undefined` for `{permSummary, activityMix}` while the client expected a real shape) caused a redundant heavy refetch on mount (fixed per memory 2026-06-03). The fix was applied but there are no regression tests to guard against a re-introduction of mismatched prefetch keys.
- **Impact:** If a new tRPC query is added to the shell with a different prefetch shape than the server component returns, the silent cache miss re-triggers the 77s+ OOM-risk query path.
- **Guardrail:** Add a Vitest unit test that asserts the prefetch input shapes for `accMembers.getBulkUsers` and `accFolders.getMatrix` match the client query inputs exactly (same `select` fields, same `where` clauses). Document the prefetch contract in a comment at the top of `AccessAnalysisShell.tsx`.
- **Status (2026-07-16): 🔁 REFRAMED by v2.4 Ph28.1.** The historical "hydration-key mismatch" was root-caused as the app-wide superjson-wrapped-dehydrate bug (see the Ph28.1 section below): `createServerSideHelpers({transformer: superjson}).dehydrate()` returns `{json, meta}`, which `<HydrationBoundary>` cannot hydrate, so *every* prefetch on affected routes silently refetched. Fixed on `app/(dashboard)/users/spatial-graph/page.tsx` only (commit 9fb54cb8). This §3.5 regression-guard seed is subsumed by the Ph28.1 item: fix the two remaining call sites and add a shared `deserializeHydrationState` helper with a test.

### 3.6 PaCMAP projection tuned at package defaults (2026-07-16, Phase 29)

- **Files:** `scripts/compute_instance_embeddings.py`
- **What it is:** Phase 29 shipped the hybrid PaCMAP embedding with `MN_ratio`/`FP_ratio` at pacmap 0.9.1 defaults (0.5/2.0). The tight-islands look landed and the trustworthiness gate passed (0.9388 → 0.9597) without tuning.
- **Impact:** None today. If the owner's eyeball UAT asks for tighter/looser cluster separation, these two knobs are the intended lever — record any change against the same trustworthiness gate.
- **Guardrail:** Gate is built into the pipeline (exits 1 before upsert on trustworthiness regression); any re-tune re-runs it for free.

### 3.7 Embedding python entrypoint needs env vars in-process (2026-07-16, Phase 29)

- **Files:** `scripts/compute_instance_embeddings.py`, `scripts/build-instance-features.ts`
- **What it is:** The TS feature builder self-loads `.env`/`.env.local`; the python projector does not — it reads `DIRECT_URL`/`DATABASE_URL` from the process env. The nightly `dc-daily-ingest.cjs` path works (execSync inherits ingest's env); bare manual `python scripts/compute_instance_embeddings.py` fails fast with "DIRECT_URL or DATABASE_URL must be set".
- **Impact:** Manual-run friction only; failure is loud and non-destructive.
- **Guardrail:** Run manually with env pre-loaded (or via the ingest wrapper). Adding a dotenv loader to the python script is a 10-line fix if the friction recurs.

---

## 4. `/users` — Lean Payload Trap

### 4.1 Bulk user payload empties per-project roles and modules

- **Files:** `server/routers/acc-members.ts` (`bulkUsers` / lean payload path); `app/(dashboard)/users/access-analysis/dataLayer.ts` (two `TODO` comments at lines 41, 112)
- **What it is:** The `/users` lean bulk call intentionally strips per-project roles and modules to keep the payload manageable. Consumers that expect roles or modules (e.g., `lastActivity`, per-project role displays) must source from separate endpoints (`lastFileActivityByEmailAll`, `bulkUser`, hover-prefetch). Two `TODO` comments in `dataLayer.ts` explicitly defer the "Replace with activity_in_module / total_activity once DC CSV join is wired" fix.
- **Impact:** New features that consume `bulkUsers` and expect populated `roles` or `modules` fields will silently receive empty arrays. This has bitten previous phases (lean payload trap, memory 2026-06-18).
- **Guardrail:** Add a TypeScript type comment on the `bulkUsers` return type marking `roles` and `modules` as `never[] // lean payload — always empty; use bulkUser or hover-prefetch for per-project data`. Resolve the two `dataLayer.ts` TODOs when DC CSV join is available.
- **Status (2026-07-16): still open.** Both TODOs confirmed at `app/(dashboard)/users/access-analysis/dataLayer.ts` lines 41 and 112. These are the likely source of the 2 remaining `unsafe-todo` ast-grep findings (baseline was 5; VERIFY exact finding locations if it matters).

### 4.2 `accGraphFilters.ts` — compile-time assert deferred

- **File:** `app/(dashboard)/users/accGraphFilters.ts` line 15
- **What it is:** A `TODO` comment notes that if two union types ever drift, a compile-time assert helper should be added. No assert exists. If the filter type unions diverge, the mismatch is silent at compile time.
- **Impact:** Low — only affects type safety in the filter composition path. Not a runtime risk.
- **Guardrail:** Add a `type AssertExtends<A, B extends A> = B` or `satisfies` narrowing assertion when the next change touches `accGraphFilters.ts`.
- **Status (2026-07-16): ✅ RESOLVED (v2.1 Ph13 TYPE-02, commit 965993fd).** One-directional subset drift assert added to `accGraphFilters.ts`; the TODO is gone.

---

## 5. APS / ACC Integration Risks

### 5.1 ACCDS session token — cookie-based, no automatic rotation

- **Files:** `lib/acc/accdsToken.ts`; `scripts/accds-login.cjs` (VERIFY: path)
- **What it is:** ACCDS API access uses a Playwright-recorded browser session (`storageState` cookies). The `fetchFreshToken()` function refreshes the short-lived access token from the cookie, but the cookie itself is not automatically renewed — it must be re-captured by running `scripts/accds-login.cjs` manually. A `SessionExpiredError` from ACCDS stops all Phase 8 activity crawls silently unless the cron log is inspected.
- **Impact:** Activity extraction fails silently if the session expires. There is no alerting or health-check endpoint that surfaces ACCDS session health.
- **Guardrail:** Add a ACCDS session health check to the progress monitor (`scripts/progress-monitor.cjs`). Emit a log warning (`[WARN] ACCDS session expires in <N> hours`) before the token refresh path is attempted. VERIFY: what the cookie TTL is for autodesk.com ACC sessions.
- **Status (2026-07-16): 🟡 PARTIALLY ADDRESSED.** `scripts/progress-monitor.cjs` now surfaces ACCDS session health (reads `accdsToken.ts`, renders a session-health panel, reports "ACCDS session health could not be read" on failure) — the localhost:4321 monitor is the alerting surface. Proactive expiry-in-N-hours warning and cookie-TTL knowledge remain open (`VERIFY:` TTL).

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
- **Status (2026-07-16): ✅ RESOLVED (v2.1 Ph12 OBS-03, commit 72b4079d).** Stale `TODO[02.5]` diagnostics removed. Path correction: the file is `lib/server/acc-admin.ts` (not `lib/acc/`); it now contains zero TODOs.

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
- **Status (2026-07-16): still open.** Current sizes: `physicsLayer.test.ts` 1,346 lines, `GraphCanvas3D.test.ts` 1,218 lines, `GraphCanvas.test.ts` 928 lines — still the largest test files under `app/`.
- **Status (2026-07-23): half resolved by deletion, half unchanged.** `GraphCanvas3D.test.ts` and `GraphCanvas.test.ts` no longer exist (removed with the retired instance graph in v2.7 ACT-03 / Phase 41). `app/(dashboard)/users/access-analysis/physicsLayer.test.ts` is still 1,346 lines and is now the largest test file under `app/` — and it exercises `physicsLayer.ts`, which is part of the kept-but-unmounted instance machinery (no live route mounts it). Deleting the pair together is the lazy fix if the instance physics path is never revived; do not refactor the test in place first.

### 8.3 `acc-dc-graph.spec.ts` e2e test is 62 KB

- **File:** `tests/e2e/acc-dc-graph.spec.ts` (62 KB)
- **What it is:** Largest single e2e file. Likely covers the full graph surface including node selection, cluster transitions, 3D lasso, and filter interaction.
- **Impact:** High-maintenance; any refactor of the graph surface requires touching a 62 KB test file. Test failures are hard to isolate.
- **Guardrail:** Split into topical spec files by interaction surface: `acc-graph-clusters.spec.ts`, `acc-graph-filters.spec.ts`, `acc-graph-3d.spec.ts`. Keep each under 500 lines.
- **Status (2026-07-16): still open, and drifted.** File is 63,741 bytes; the 2026-07-14 dependency-update run recorded 14 pre-existing failures in this suite (node count 16,942→22,279 drift + physics-shell sidebar testids gone). The suite needs a re-baseline pass before it can gate anything.
- **Status (2026-07-23): ✅ RESOLVED by the E2E-03 re-baseline.** `tests/e2e/acc-dc-graph.spec.ts` is now **170 lines** — the 62 KB instance-era suite was replaced with activity-universe assertions driven through `window.__ACTIVITY_UNIVERSE_TEST__`. The splitting guardrail above is moot; the live risk moved to the fixture-flag trap (2026-07-23 §3).

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

**Status (2026-07-10): still deferred.** These 5 edges (plus
`acc-route-hydration → useUsersDirectoryData`) are now the ONLY remaining
lib→app edges after the group (3)/(4) cleanup below.

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

**Status (2026-07-10): ✅ RESOLVED (commit 116941af, structure cleanup).** The
Phase-16 folderTerrain split had already cleared the blocker; this cleanup moved
the 14 pure shared modules to `lib/acc/` (`accessInstanceTypes.ts`,
`moduleCatalog.ts`, `projectFilter.ts`, `projectGroups.ts`, `roleCounts.ts`,
`coordinationClash.ts`, `folderInheritance.ts`, `folderTerrainModel/Layout/
Scene/Camera.ts`, `roleSimilarity.ts`, `moduleAccess.ts`, `permissionAccess.ts`)
with thin `export *` compatibility barrels left at every old `app/` path, and
repointed the 7 `lib/server` view importers + `lib/acc/template-mty-roster.ts`.
Gates: tsc clean, 2,118 targeted tests green, repo-map quality gate passed
(dependency-cruiser warnings 6→2, both remaining = the deferred
`scripts/build-instance-features.ts` spatial-graph edges).

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

**Status (2026-07-10): ✅ RESOLVED (commit 116941af).** `coordinationClash.ts`
moved to `lib/acc/coordinationClash.ts` in the same group-(3) cleanup; barrel
left at the old path. Also fixed in the same session (commit 8dba5f70): the 4
`no-circular` dependency-cruiser errors — `HybridAnalyticsView.tsx` ⇄
Posture/Rankings sections type-import cycles, broken by extracting
`hybridAnalyticsViewTypes.ts`.

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

- §2.4 `AccDcRole` empty — monitoring/warning still missing (fallback documented only). *(2026-07-16: RESOLVED — effective-empty warning shipped in Ph12; see §2.4.)*
- §3.1, §3.4, §3.5 `/users/spatial-graph` performance and fragility (DuckDB warm-up, lasso e2e flake, prefetch regression guard) — Phase 28 owns §3.1/§3.4; §3.5 remains a future regression-hardening seed. §3.2 closed in Phase 27. *(2026-07-16: §3.4 still open; §3.5 reframed into the Ph28.1 hydration item.)*
- §4.1/§4.2 lean-payload trap and filter-type assert. *(2026-07-16: §4.1 still open; §4.2 RESOLVED — Ph13 TYPE-02, 965993fd.)*
- §5.1 ACCDS session expiry alerting; §5.2 DC 403 coverage (DC-01/DC-02); §5.3 stale TODO guards in `acc-admin.ts` (VERIFY: whether Ph12 observability work removed these). *(2026-07-16: §5.1 partially addressed via progress-monitor session health; §5.2 still open; §5.3 RESOLVED — Ph12 OBS-03, 72b4079d.)*
- §8.2/§8.3 oversized physics/e2e test files. *(2026-07-16: both still open; §8.3 additionally has 14 pre-existing failures from post-dep-update drift.)*

### New concerns introduced or made visible by v2.2 (2026-07-02)

1. **`AccFolderPermissionSummary` freshness is cron-coupled.** The projection only refreshes in the dc-daily-ingest success branch (Ph19 PROJ-03). If the ingest cron fails or is disabled, `/access-analysis` permission summaries silently age; staleness bound is documented in `INTEGRATIONS.md`. No UI staleness indicator exists.
2. **Terrain still reads the live `folderPermQuery` `$queryRaw`.** Scoped out of v2.2 with evidence; the per-folder terrain projection is a deferred seed if terrain read cost becomes a concern.
3. **Planning retention was normalized during repository cleanup.** The working tree retains active-milestone artifacts only; completed milestone evidence remains available from tags and git history. New docs must not rely on removed phase/archive paths.

### Dashboard Self-Check (2026-07-02 refresh)

- **Context:** `.planning/STATE.md`, `PROJECT.md`, `ROADMAP.md` (v2.2 close, `5974d6f2`), v2.1/v2.2 phase artifacts from git history, current source tree (post-split line counts read from disk), `prisma/schema.prisma`.
- **Evidence:** Resolution claims map to recorded phase requirements (DB-01..03, BND-01..04, TRUTH-02..04, QUERY-01, SPLIT-01..04, PROJ-01..03, TEST-01..03) and their commits in ROADMAP.md/STATE.md.
- **Constraints:** Statuses appended, original findings preserved; no code changed by this refresh.
- **Gates:** Docs-only update; no build/tsc gates applicable.
- **VERIFY:** current DC covered-project count (~550/1,153 per Ph11 correction); whether §5.3 TODO guards were removed by Ph12.

### New concerns from v2.4 Phase 25 (2026-07-15, phase-tagged)

1. **[Ph25] Coverage denominator VERIFY still open.** `dimensionCoverage.ts` ships node-derived `covered/total` and marks provenance ("DC-sourced"/"folder-crawl"), but whether AccDcProject 550 / AccProject 1,153 is the correct *project-level* denominator for DC-sourced dims was never verified. If a future phase wants project-coverage figures in the pickers, verify the denominator first — do not display 550/1,153 unverified.
2. **[Ph25] Retired legacy filter ids drop silently on rehydrate.** Persisted filters keyed `tier`/`activity`/`signin`/`module` (old `SliderContext.DIMENSIONS` ids) are ignored by the new aperture key gate in `FilterContext.tsx` — a one-time migration loss, invisible to the user. Acceptable now; if users report "my saved filter vanished", this is why.
3. **[Ph25] `featureValueForDim` legacy switch is near-dead but plan-locked.** After the aperture migration only `role`/`project` (drill-down pies) and harness paths hit the legacy 6-id switch; `tier`/`activity`/`signin` cases survive mostly for the migration-guard tests. Candidate for deletion when SelectionPanel's drill goes aperture-native.
4. **[Ph25] `SliderContext.DIMENSIONS` has lost its last live UI consumer.** Toolbar/FilterContext/DimensionFilterPopover no longer read it; remaining importers are `featureTargets.ts`/`physicsClustering` (flag-ON physics path) and tests. Fold into the catalog or delete alongside the parked registry-color path in a future cleanup.

### New concerns from v2.4 Phase 26 (2026-07-15, phase-tagged)

1. **[Ph26] Catalog availability counts are snapshot-derived.** The isolated production run observed 110 available / 98 unavailable rows across the 208-entry preview, rather than the roadmap's approximate 189 / 19 split. Never hardcode the observed counts: Phase 27 activation must recompute availability from the loaded feature snapshot so missing action activity remains disclosed truthfully.

### New concerns from v2.4 Phase 27 (2026-07-15, phase-tagged)

1. **[Ph27→Ph28] First Dimensions activation still needs a measured hitch budget.** Generated action targets are intentionally built and registered only when the user first opens Dimensions, over the loaded 22,279 membership-node snapshot. Production Playwright and authenticated browser gates passed, but Phase 27 did not isolate main-thread time for that first activation. Phase 28 should measure it alongside the first-paint closeout before claiming workshop responsiveness.
2. **[Ph27] Historical embedding residue is maintenance-only.** The current embedding join covered all 22,279 loaded membership nodes; 983 additional stored embedding rows were stale historical residue and are ignored by the node-id join. This has no current layout correctness impact, but a future embedding maintenance job may prune them.

### New concerns from v2.4 Phase 28.1 (2026-07-16, phase-tagged)

1. **[Ph28.1] App-wide SSR-hydration miss — only the spatial-graph route is fixed.** Root cause of PERF-04: `createServerSideHelpers({ transformer: superjson }).dehydrate()` returns a superjson-**wrapped** `{ json, meta }` state (a Pages-Router idiom), but the App Router passes it straight to `<HydrationBoundary state={…}>`, which expects a raw `DehydratedState` — so the boundary hydrates nothing and every prefetched query refetches on mount wherever it is consumed. Fixed only in `app/(dashboard)/users/spatial-graph/page.tsx` (`superjson.deserialize` before the boundary, guarded on the `{ json }` wrapper). **The same bug still affects `app/(dashboard)/layout.tsx` (families/kpi/clash/sim/exam/trello prefetches) and `app/(dashboard)/users/page.tsx`** — their prefetched queries silently refetch wherever read. Candidate for a shared `deserializeHydrationState(helpers)` helper applied at all `HydrationBoundary` call sites in a dedicated pass. Superseded/explains the "hydration-key mismatch" note in `project_spatial_graph_load_speed` and the deferred `project_users_data_freshness_phase4` caching debt.
2. **[Ph28.1] The `dynamic()` shell-chunk parse gap (~4 s) is the remaining time-to-graph cost.** After the hydration fix, median time-to-graph-rendered is 4360 ms (well under gate); the dominant remaining stage is downloading+parsing the large `AccessAnalysisShell` chunk (cosmos.gl, framer-motion, duckdb client, ~60 static imports) before the shell mounts. Not pursued (gate met, higher risk); a future perf pass could code-split heavy static imports out of the shell's initial chunk.

---

## 2026-07-16 Refresh — post-v2.4 close, pre-redesign baseline

All evidence below re-verified against the working tree on 2026-07-16 (v2.4 closed at d3768490; branch `feat/access-analysis-redesign`).

### A. SSR-hydration miss — CONFIRMED STILL LIVE at two call sites

The Ph28.1 bug (superjson-wrapped `dehydrate()` passed raw to `<HydrationBoundary>`, so prefetched queries silently refetch) remains unfixed at:

- `app/(dashboard)/layout.tsx` line 45 — `<HydrationBoundary state={helpers.dehydrate()}>` (helpers created with `transformer: superjson` at line 29; prefetches families/kpi/clash/sim/exam/trello per Ph28.1 notes)
- `app/(dashboard)/users/page.tsx` line 13 — same raw `helpers.dehydrate()` pattern

The fixed reference implementation lives in `app/(dashboard)/users/spatial-graph/page.tsx` lines 22–26 (commit 9fb54cb8): `superjson.deserialize` guarded on the `{ json }` wrapper. Fix seed: extract a shared `deserializeHydrationState(helpers)` helper and apply at all three call sites.

### B. Repo-map status (re-run 2026-07-16)

`node scripts/repo-map/check.cjs` → PASS. Composition:

- **2 dependency-cruiser warnings**, both `no-scripts-to-app` from `scripts/build-instance-features.ts` → `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` and `.../instanceFeatureTokens.ts`. These are the known deferred spatial-graph edges (BND-03 group 2 family); down from 6 at the 2026-06 baseline.
- **236 ast-grep findings** (report generated 2026-07-14): `large-use-effect` 146 (baseline 143 — +3 drift), `no-console-log` 88 (baseline 121 — improved), `unsafe-todo` 2 (baseline 5 — likely the two `dataLayer.ts` TODOs, see §4.1), `direct-prisma-in-ui` 0 (the only blocking rule; baseline 1, cleared by BND-01).
- The 5 documented-deferred `lib → app` edges (BND-03 group 2) are unchanged: `lib/acc/activityAggregate.ts`, `lib/acc/activityClassification.ts` (×2 targets), `lib/acc/dcUserAssembly.ts`, `lib/server/acc-route-hydration.ts` — all importing route-owned modules under `app/(dashboard)/users/access-analysis/` or `app/(dashboard)/users/`. Still blocked on spatial-graph scope; the redesign in flight (§D) may be the window to move `accTaxonomy.ts` / `accNormalize.ts` / `internalDomains.ts` to `lib/acc/`.

**Update (2026-07-23, re-verified against the current tree — supersedes the two bullets above):**

- **dependency-cruiser: 1 warning**, not 2 — `scripts/build-activity-author-attributes.ts → app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts` (`no-scripts-to-app`). `scripts/build-instance-features.ts` is gone (deleted with the instance pipeline), which retired its two edges; the Phase-38 author-attributes builder re-created the same coupling against the same route-owned module. **The pattern, not the file, is the durable trap:** every new activity/embedding build script that needs node/feature helpers reaches into `app/(dashboard)/users/access-analysis/`. Moving `graphNodesFromUsers.ts` (and `accTaxonomy.ts` / `accNormalize.ts` / `internalDomains.ts`) into `lib/acc/` with barrels at the old paths is the one-time fix.
- **ast-grep (report regenerated 2026-07-23): 220 findings** — `large-use-effect` **153** (up from 146; the activity shell's many `useEffect` blocks are the growth), `no-console-log` **65** (down from 88), `unsafe-todo` **2** (unchanged, still the `dataLayer.ts` pair per §4.1), `direct-prisma-in-ui` **0** (still clean — the only blocking rule).
- **`lib`/`server` → `app` edges: 7 total** (grepped `from "@/app/`): 4 into the spatial-graph route (`activityAggregate.ts`, `activityClassification.ts` ×2, `dcUserAssembly.ts`) and 3 into the ECharts charts page (`lib/server/folderActivityView.ts` ×2 → `folderActivityCounts.ts`/`folderActionTypes.ts`, `lib/server/provisionedModulesView.ts` → `modules.ts`). The `acc-route-hydration → useUsersDirectoryData` edge from the old list is **gone** (Ph33 moved `BULK_USERS_LEAN_INPUT` to `lib/acc/cachePolicy.ts`).

### C. Two distinct "access-analysis" surfaces — do not conflate

**TRAP (recurring):** `app/(dashboard)/access-analysis/` is the ECharts **charts page** (donuts, terrain, coordination panels). `app/(dashboard)/users/access-analysis/` is the **spatial-graph shell** (cosmos.gl graph, DuckDB, catalog sliders) served at `/users/spatial-graph` (route split in 4cb09b97). They share nothing but the name. Any concern, plan, or grep that says "access-analysis" must state which surface it means. The current redesign branch (§D) touches BOTH surfaces.

### D. Working tree — redesign in flight; committed state is this doc's baseline

`git status --short` = **222 entries**: 74 modified, 120 deleted, 28 untracked. Notably the deletions include the `/users` directory-list component family: `PersonCard.tsx`, `PersonRow.tsx`, `PersonRowList.tsx`, `PersonDetailModal.tsx`, `ActivityAuditPanel.tsx`, `CollapsibleGroup.tsx`, `DirectoryListHeader.tsx`, `ModuleBadge.tsx` (all under `app/(dashboard)/users/`), plus root docs (`CHANGELOG.md`, `GSD-STYLE.md`, `PROJECT_RULES.md`). This is the access-analysis redesign in progress — **every file-level claim in this document is verified against the committed tree (HEAD d3768490), not the WIP**. Line counts and paths may shift when the redesign lands; re-verify before acting on any §2/§3 file reference.

### E. Large-module hotspots (current line counts, committed tree)

Post-v2.2 splits, no file exceeds 1,700 lines, but a second generation of large modules has grown:

| File | Lines | Note |
|---|---|---|
| `lib/acc/dcIngest.ts` | 1,672 | largest source file in repo; DC CSV ingest state machine |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | 1,150 | UI monolith |
| `lib/acc/quick-sync-extraction.ts` | 1,021 | |
| `lib/google/chat.ts` | 979 | |
| `app/(dashboard)/users/AccProfileSection.tsx` | 979 | modified in WIP — likely shrinking/moving |
| `lib/server/acc-hot-cache.ts` | 972 | central cache; high blast radius |
| `lib/server/email.ts` | 850 | |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | 792 | |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | 774 | also the Ph28.1 chunk-size culprit |

None currently blocks work; `dcIngest.ts` and `acc-hot-cache.ts` are the two where a bug has the widest blast radius (ingest correctness, all cached analytics). Flag, don't split speculatively.

**Update (2026-07-23 — measured over `git ls-files` + working tree; the table above is stale):**

| File | Lines | Note |
|---|---|---|
| `app/(dashboard)/users/access-analysis/activity/ActivityUniverseShell.tsx` | **1,754** (1,558 at HEAD) | now the **largest source file in the repo**; see 2026-07-23 §6 |
| `lib/acc/dcIngest.ts` | 1,672 | unchanged; widest ingest blast radius |
| `components/dashboard/MailPanel.tsx` | 1,353 | |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | 1,153 | was 792 (2026-07-16) → 1,042 (07-22) → 1,153; still growing |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | 1,150 | |
| `lib/acc/quick-sync-extraction.ts` | 1,021 | |
| `lib/server/acc-hot-cache.ts` | 972 | unchanged; all cached analytics |
| `app/(dashboard)/users/access-analysis/activity/ActivityUniverse3D.tsx` | 615 | new in v2.7+; three.js/OrbitControls overlay |

`AccessAnalysisShell.tsx` dropped off the list (the instance shell was retired). Still: flag, don't split speculatively — but see 2026-07-23 §6 for why the activity shell is the one genuinely at risk.

### F. ACC / DC / accds data-coupling ceilings (unchanged, restated as standing constraints)

These are *source* ceilings, not bugs — new analytics must disclose them rather than hide them:

- **accds ingest coverage:** crawls only ~236/957 projects (`VERIFY:` current count — memory-sourced, see `project_accds_ingest_coverage_trap`); accds never emits `rfi-`/`submittal-` verbs, so DC `AccActivity` is the sole source for those donuts (naive merge undercounts ~20×).
- **DC retention wall:** APS DC retains only ~18 months; historical backfill is moot (proven).
- **DC access universe:** ~724 of ~1,152 projects return 403 (luis is project-scoped, not Account Admin) — §5.2 remains open; VERIFY current covered count (~550/1,153 per Ph11) before surfacing any coverage figure in UI.
- **`AccActivity.service` ignored:** `classifyActivity()` still derives module from `rawAction` only (~40.7% disagreement with Autodesk's own attribution); UI-labeled (§2.5) but the SVC-01 refinement stays deferred.
- **`AccDcRole` permanently empty:** by design (DC never sends `admin_roles.csv`); role names come from the `AccRole` merge, with the effective-empty warning now guarding the real failure mode (§2.4 resolved).

### Dashboard Self-Check (2026-07-16 refresh)

- **Context:** committed tree at d3768490 + `git status` snapshot; `.tools/repo-map/dependency-cruiser.json`, `ast-grep-report.json` (2026-07-14), `baselines/ast-grep-baseline.json`; `app/(dashboard)/layout.tsx`, `app/(dashboard)/users/page.tsx`, `app/(dashboard)/users/spatial-graph/page.tsx`; `lib/server/accessInstanceView.ts` + test; `lib/server/acc-admin.ts`; `scripts/progress-monitor.cjs`; `tests/e2e/acc-3d-lasso.spec.ts`; `git log` for resolution commits (72b4079d, 965993fd, 9fb54cb8, 116941af).
- **Evidence:** dependency-cruiser warnings extracted directly from the JSON (2 edges, both named above); ast-grep counts from `ruleScan.ruleCounts`; hydration call sites grepped with line numbers; line counts from `wc -l` over `git ls-files`.
- **Gates:** docs-only update; repo-map check re-run (PASS); no code changed.
- **VERIFY (carried + new):**
  - accds crawled-project count (236/957 is memory-sourced).
  - Current DC covered-project count before any UI display (~550/1,153 per Ph11).
  - Exact file locations of the 2 remaining `unsafe-todo` findings (presumed `dataLayer.ts:41,112`).
  - ACCDS session cookie TTL (for §5.1 proactive expiry warning).
  - Account Admin provisioning status (§5.2).

## Phase 30 debt roll-forward (2026-07-16 — Similarity Intelligence)

- **[Ph30] Stale AccInstanceEmbedding rows never pruned.** 983 rows carry
  old-shape (bare-array) neighbors and nodeIds absent from the current 22,279-row
  snapshot (leftovers from a prior larger run). Harmless today —
  `normalizeNeighborsPayload` tolerates them and they match no client feature —
  but the pipeline upsert never deletes; add a prune step (delete rows whose
  nodeId is not in the current run's set) next time the pipeline is touched.
- **[Ph30] e2e slider selectors dead.** `tests/e2e/acc-dc-graph.spec.ts` drives
  "User name thumb" — v2.4's GroupByControls replaced curated sliders (real path:
  `group-by-select` + "Grouping strength thumb", proven by the 30-04 morph smoke).
  Fold into the standing e2e re-baseline (STATE Deferred #4).
- **[Ph30] Panel "100%" scores for near-identical distinct profiles.** Cosine
  0.99995+ renders as 100% next to genuinely distinct matches; if workshop UAT
  reads it as "clone", show one more decimal in Phase 31's panel polish.

## Phase 32 debt roll-forward (2026-07-16 — Ambient Life & Link Expression)

- **[Ph32→Ph33] Full moving Canvas web exhausts the workshop frame budget.**
  Before live-link position tracking, the 22,279-node ambient layer sustained
  60.04 fps in Tier 0. On the final shipped path, redrawing 14,200 curved links
  at ~30 Hz while those nodes move measured 20.68 fps over 10.009 seconds and
  the required controller visibly degraded Tier 0→1→2 (static). This is safe and
  satisfies LIFE-03's explicit degradation clause, but means full ambient life is
  not sustained with live links on the workshop machine. Phase 33 should profile
  the Canvas projection/stroke cost alongside its chunk closeout before changing
  update cadence, edge density, or renderer architecture; do not quote the
  pre-link 60.04 fps as final shipped performance.

## Phase 33 debt roll-forward (2026-07-20 — Perf Closeout & Verification)

- **[Ph28.1(1)] RESOLVED.** App-wide SSR-hydration miss fixed at the shared
  boundary: `lib/server/hydrationState.ts` `deserializeHydrationState()` at
  all three call sites (layout.tsx, users/page.tsx, spatial-graph/page.tsx),
  pinned by `lib/server/hydrationState.test.ts`. Authenticated `:3100` network
  evidence: zero prefetched-query refetches on `/users` and
  `/users/spatial-graph` (33-BASELINE.md). Included root-cause fix:
  `BULK_USERS_LEAN_INPUT` moved from the `"use client"`
  `useUsersDirectoryData.ts` to directive-free `lib/acc/cachePolicy.ts` —
  server imports of client-module exports are RSC client-reference proxies,
  which silently broke the /users prefetch input since PERF-03 (v2.4).
- **[Ph28.1(2)] RESOLVED.** Graph-first code split (`Toolbar`,
  `RightPanelStack`, `NeighborMatchesPanel` via `next/dynamic` behind
  geometry-matched placeholders): shell chunk −18.3% (164,154→134,108 B,
  framer-motion evicted), time-to-graph median 5,116→3,914 ms (−23.5%;
  −10.2% vs the 28.1 reference median).
- **[Ph32→Ph33] CLOSED into a v2.6 candidate.** LINK-PERF profiling proved
  the ceiling is Canvas2D rasterization (~40 ms/frame for the 14.2k-bezier
  web; JS tick 1.4 ms), not JS path building. Shipped: ambient-only ~10 Hz
  redraw throttle + empty-stroke skip → 21.35→41.33 fps (+94%) at the full
  sample; tier controller still degrades below 50 fps as designed. **v2.6
  candidate:** OffscreenCanvas worker rasterization, cosmos-native links, or
  zoom-based edge decimation if Tier-0-with-full-links ≥50 fps becomes a
  requirement (33-BASELINE.md "LINK-PERF (after)").
- **[Ph33 → CLOSED Ph34 2026-07-20] guard-bash powershell-wrap gap.** GUARD-01
  shipped: `.claude/hooks/guard-bash.cjs` now inspects `powershell`/`pwsh`
  `-Command` payloads un-stripped (isolatedDist exemption honored inside the
  wrapper, `$env:`-in-double-quotes trap documented at the rule), with a 10-case
  unit test at `tests/hooks/guard-bash.test.ts` (commits `50dd815c`+`63ef0aca`).
  Out of scope, recorded: `-File`/`-EncodedCommand` forms and `-c` shorthand.
- **[NEW Ph33] `.tools/repo-map/architecture-summary.md` /ARCHITECTURE line
  stale:** "BULK_USERS_LEAN_INPUT … defined in useUsersDirectoryData.ts" —
  home is now `lib/acc/cachePolicy.ts` (re-exported for client consumers).
  Correct at the next codebase-map refresh.
- **[Ph33 note] BND-03 group-2 `scripts→app` dep-cruiser family is 3 edges**
  (33-01 ratcheted the baseline for the Phase-29 `instanceFeatureNumerics`
  edge); §B's "down from 6 / 2 warnings" note is superseded.
- **[NEW Ph37 2026-07-21] fps-measurement SwiftShader trap.** Playwright headless
  Chromium silently falls back to SwiftShader software rasterization — a first
  scale-spike run recorded 0.4–1 fps that had nothing to do with the workshop
  GPU. `tests/e2e/scale-spike.spec.ts` now runs HEADED with `--use-angle=d3d11`
  and hard-fails on a SwiftShader renderer string (`assertHardwareRenderer`).
  Every future fps-bearing spec (REND-04 close gate, E2E-03 re-baseline) must
  carry the same guard.
- **[NEW Ph37] L2 ambient path is unbuilt physics.** Owner locked ladder rung L2
  (all 4.86M resident, LOD-decimated rendering). Evidence: cosmos.gl's own GPU
  force sim is NOT viable ambient at scale (20.4 fps @500k, 2.2 @4.86M); CPU
  full-set push dead ≥250k. Phase 40 must ship custom GPU-shader displacement
  or bounded-subset (~100k class, 73 fps proven) ambient — decided from
  37-BASELINE.md, not re-measured assumptions.
  **Status (2026-07-22): RESOLVED.** Phase 40 shipped the bounded ≤100k ambient subset;
  Phase 41 bounded target uploads to 10 Hz at Tier 0 / 5 Hz at Tier 1 and measured
  67.225 fps with ambient active and Tier 0→0.
- **[NEW Ph37] faiss flat-index projection slower than full fit.** IndexFlatL2
  kNN projection measured 840 rows/s (~77 min for the 3.86M remainder) vs ~34 min
  extrapolated full-corpus PaCMAP fit. If Phase 38 wants sample-fit+projection
  (incremental refresh), benchmark IVF/HNSW first; otherwise full-fit. Full-fit
  RSS extrapolates ~6 GB — estimate, measure before productionizing (EMB-07).
- **[NEW Ph37] scale-spike surface lifecycle.** `/users/scale-spike` +
  `/api/scale-spike/payload` are committed, flag-gated (`NEXT_PUBLIC_ACC_SCALE_SPIKE`),
  404/dead without the flag. Remove or re-gate at v2.7 milestone close.
  **Close decision (2026-07-22): RETAIN.** The existing production-off flag is the
  smallest reusable workshop-machine regression harness; live production proved the API
  404 with the flag off. Remove only if the scale gate is permanently retired.

## Phase 38 debt roll-forward (2026-07-21 — Activity Data Pipeline & Embedding)

- **[NEW Ph38 2026-07-21] 🔑 psycopg3 implicit-transaction savepoint rollback
  trap.** In psycopg3 non-autocommit mode, the FIRST execute on a connection
  opens an implicit transaction; a later `with conn.transaction()` then creates
  a SAVEPOINT, not a top-level transaction, and `conn.close()` without
  `commit()` rolls back EVERYTHING — while same-connection post-write SELECTs
  still see the rows. Run #2 of `compute_activity_embeddings.py` printed "COPY
  wrote 4904886 rows … DONE" and left a durably empty table (cost: one ~112-min
  pipeline run). Fix pattern (now in the script): explicit `conn.commit()`
  before close + a row-count on a FRESH connection. Same family as v2.6's
  "counters aren't visual proof": in-session verification can lie — verify from
  outside the session. Applies to any future psycopg writer.
- **[NEW Ph38] Full-fit pipeline economics.** Measured: 50 min per full-corpus
  PaCMAP fit (×2 for the determinism proof → ~102 min total), peak RSS 15.7 GB
  (24 GB cap, owner-approved), COPY 84 s. The 37-BASELINE ~34-min/~6-GB figures
  were extrapolations — superseded. If reruns become frequent (owner decision
  currently: manual only), revisit single-fit + stored-checksum determinism or
  IVF/HNSW incremental projection.
- **[NEW Ph38] Activity-grain trustworthiness baseline is 0.8085** (k=10,
  n=5000) vs ~0.9+ at instance grain — first baseline, gate enforces monotone
  non-regression. Phase 40 dimension tuning may motivate feature-weight work;
  change the 71-dim layout deliberately (it invalidates the baseline).
- **[Ph38 note] Payload route buffers 149.7 MB per non-304 request**
  (`ponytail:` comment in `app/api/activity-universe/payload/route.ts`).
  Fine single-user; stream if concurrency ever matters. ETag/304 keyed by
  embeddingRunId keeps repeat loads cheap.
- **[Ph38 note] Folder labels intentionally absent from payload meta** (132k
  distinct folders — int codes only). Phase 39 hover fetches folder/object
  strings on-demand per node; a folder DIMENSION label surface in Phase 40
  would need its own bounded lookup, not a 132k-entry dict in the meta.

- **[NEW Ph39 2026-07-21] Instance-graph e2e suite is EXPECTEDLY red until
  Phase 41.** The ACT-03 sweep deleted the instance shell + the
  `__ACC_GRAPH_TEST__` bridge; `acc-dc-graph.spec.ts`,
  `spatial-graph-baseline.spec.ts`, lasso/cluster-labels/ambient specs assert
  the retired 22,279-node universe. E2E-03 re-baselines them against
  `window.__ACTIVITY_UNIVERSE_TEST__` (`isReady()`/`getState()`); do NOT
  "fix" them piecemeal before that.
  **Status (2026-07-22): RESOLVED.** E2E-03 replaced the retired bridge with the
  deterministic activity fixture; both route aliases, time, dimensions, reduced motion,
  and lasso passed 4/4 on the isolated production harness.
- **[NEW Ph39] Region-LOD viewport filter is an O(4.9M) JS scan per debounced
  interaction-end** (`activity/lodSample.ts` viewportIndices, ~10–30 ms class).
  Fine single-user/static; Phase 41's time-to-graph + fps measurements decide
  whether it needs a spatial index or GPU mask.
  **Close evidence:** no index needed at the shipped scale: navigation-ready median
  1,699.7 ms and the binding renderer gate held 67.225 fps. Revisit only if corpus growth
  or interaction-end latency regresses.
- **[NEW Ph39] eventDetail index→id depends on artifact/meta consistency.**
  Row order = build-time ORDER BY id; meta idAnchors are recorded at build.
  After any table change, REBUILD the payload artifact
  (`build-activity-universe-payload.ts`, ~70 s) or clicks answer
  `{stale: "project mismatch…"}` (honest, not wrong). The nightly staleness
  log block in dc-daily-ingest.cjs is the drift beacon.
- **[Ph39 note] Kept-but-unmounted instance machinery (~40 files:
  CatalogSliderSidebar, DimensionSlider, GroupByControls, RightPanelStack,
  physics layer, MapClusterLabels…) is deliberate Phase-40 inventory** (owner
  decision 2). If Phase 40 rebuilds activity-native instead of reusing, sweep
  the leftovers at milestone close. `AccInstanceEmbedding` TABLE drop is also
  a milestone-close item.
  **Status (2026-07-22): RESOLVED.** Phase 40 removed the clean retired sidebar shell;
  Phase 41 re-audited the remainder, deleted only zero-importer `SelectionContext`, and
  dropped the dead instance-embedding table/model/scripts/mocks while preserving WIP.
- **[Ph39 note] Stale Prisma comment:** `AccActivityEmbedding.id` doc says
  `"a:"/"d:"` — real spaces are `"accds:"+accdsActivityId` / plain
  AccActivity cuid (see compute_activity_embeddings.py). Fix with the next
  schema-touching change.
  **Status (2026-07-22): RESOLVED.** The schema now documents the real
  `"accds:"+accdsActivityId | AccActivity.id` convention.

---

## 2026-07-22 Perf-fix session (post-v2.7-close, commits 22633278 + c998db1e)

These commits post-date the v2.7 close (88704d88). All claims below verified
against the working tree 2026-07-22 pm. Surface: `app/(dashboard)/users/access-analysis/`
(spatial-graph shell) — NOT the ECharts charts page (§C trap still applies).

1. **cosmos.gl 3.3.0 patch now carries FOUR LECG hunks** — any cosmos version
   bump must re-port all four and rerun the activity hard gate ×3.
   `patches/@cosmos.gl+graph+3.3.0.patch` (verified hunk-by-hunk):
   - `GraphData.update()` memoized by input identity + count (`__lecgUpdateMemo`)
     so per-frame `render()` calls with unchanged data skip the
     adjacency/degree/color/size rebuilds. Unpatched, `render()` rebuilds ALL
     derived state per call — 60–140 ms main-thread stalls per ambient tick.
   - Same-count `setPointPositions` upload skips the unrelated GPU-buffer
     invalidation (colors/sizes/shapes/links/cluster/force flags stay valid
     when only positions change).
   - `createDevice` gets `powerPreference: "high-performance"` (dual-GPU hint,
     see item 3).
   - The prior position-shader clamp removal (`clamp(pointPosition, 0, spaceSize)`
     commented out).

2. **cosmos `fitView`-family APIs are UNUSABLE on the activity/frozen path.**
   `store.scaleX/scaleY` are corrupted by a racing first rescale, so
   `fitView`/`fitViewByPointPositions`/`zoomToPointByIndex`-style camera calls
   land off-center at speck zoom. `GraphCanvas2D.tsx` instead does an empirical
   screen-space fit: probe `spaceToScreenPosition` over sample points, then a
   d3 `scaleBy`/`translateBy` sign-learning loop in a 450 ms `setTimeout`
   (lines ~341–524), plus forced `resizeCanvas(true)`. Anyone "simplifying"
   this back to `fitView*` reintroduces the off-center-speck bug.

3. **Dual-GPU adapter lottery ⇒ bimodal fps.** Workshop machine has Intel iGPU
   + RTX 5070 Ti; Chrome picks the WebGL adapter per launch, so identical
   builds measure ~30 fps (Intel floor) or 55–77 fps (NVIDIA). The
   `powerPreference` patch hunk hints high-performance but Windows may ignore
   it. **Perf verification must run ×3 launches; single runs lie.** This also
   retro-explains variance in past single-run fps evidence.

4. **cosmos default `linkVisibilityDistanceRange` starts at 50 px** (default
   `[50, 150]`) and multiplies with `linkOpacity`, silently fading long links
   to near-invisible (~7% effective alpha at prior settings). The activity
   path overrides in `GraphCanvas2D.tsx` (lines ~298–305):
   `linkVisibilityDistanceRange: [80, 1200]`, `linkVisibilityMinTransparency: 0.35`,
   `linkOpacity: 0.42`, `linkWidth: 0.7`. Dropping these overrides makes user
   links look "missing" at normal zoom.

5. **Ambient tier-0 cadence is 250 ms** (`TIER_0_TARGET_MS = 250`,
   `TIER_1_TARGET_MS = 450` in `activity/activityMotion.ts`) — halved from
   10 Hz because each position upload costs ~90 ms of synchronous GPU-blocked
   work against a busy GPU (measured 2026-07-22: idle 31 fps with 30 long
   tasks/6 s at 100 ms cadence). `activity/activityMotion.test.ts` pins the
   cadence (targets at 0/256/512 ms; morph `durationMs === 270`). Lowering the
   cadence without re-measuring reintroduces the jank; supersedes the §3.12
   10 Hz / 5 Hz resolution figures.

6. **Working-tree / doc-drift notes.** `GraphCanvas2D.tsx` is now 1,042 lines
   (committed) — the §E table's 792 is stale; it has crossed the 1,000-line
   hotspot threshold and joins the watch list (flag, don't split speculatively).
   The ~223-entry uncommitted redesign WIP (§D) is unchanged in character:
   `Person*.tsx`/directory-list deletions under `app/(dashboard)/users/` and
   modified chart modules under `app/(dashboard)/access-analysis/` remain
   un-committed — file-level claims in this doc are still verified against
   HEAD, not the WIP.

### Dashboard Self-Check (2026-07-22 pm refresh)

- **Context:** `patches/@cosmos.gl+graph+3.3.0.patch` (all 4 hunks read),
  `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx`,
  `app/(dashboard)/users/access-analysis/activity/activityMotion.ts` + `.test.ts`,
  `node_modules/@cosmos.gl/graph/dist/index.js` (default link range),
  `git show --stat 22633278 c998db1e`, `git status` (223 entries).
- **Evidence:** patch hunks quoted from the patch file; link-config values and
  empirical-fit mechanics grepped with line numbers; cadence constants and the
  270 ms test pin read from source.
- **Gates:** docs-only update; no code changed; no build/tsc gates applicable.
- **VERIFY (new):** none — all session claims resolved against the tree. The
  ~90 ms-per-upload and 60–140 ms-stall figures are session-measured (recorded
  in the patch comments/memory), not re-measurable from static source.

---

## 2026-07-23 Activity Universe — full corpus, 2D/3D, weeks & filters

Commits `1c346714`..`7d1420b9` (12) plus uncommitted working-tree changes. Surface:
`app/(dashboard)/users/access-analysis/activity/` — the **activity-universe shell**,
NOT the ECharts charts page at `app/(dashboard)/access-analysis/` (§C trap still
applies, and both trees are dirty right now). Every figure below re-verified against
the current tree; items marked **uncommitted WIP** have no commit hash by design.

### 1. 🔑 The `role` dict contains "Unknown" TWICE — dict labels are NOT unique

- **Evidence:** `.embedding/activity-universe-meta.json` → `dicts.role` has **91**
  entries with `"Unknown"` appearing **2×** (slot-0 sentinel + a real ACC role of
  that name). Every other dict is duplicate-free: `verb` 116, `objectType` 14,
  `module` 7, `project` 957, `author` 2,328, `company` 347 — all unique.
- **Why it bites:** filter selection state is **label-keyed** (`Set<string>`), while
  the mask builder walks **slots**. `buildProjectSelectionMask`
  (`activity/activityGraphData.ts`, used for project *and* role *and* verb *and*
  month) returns `null` — the all-selected fast path — only when every slot's label
  is in the set. With a duplicated label, the picker renders one option for two
  slots, so `selected.size` can never reach `options.length`; the user cannot get
  back to "all selected", the mask stays non-null, and `filterActivityIndices`
  runs a **full 4,904,886-row two-pass scan on every mount and every filter tick**
  instead of short-circuiting to `null`.
- **Second failure mode:** a label-keyed count map built with `map.set(label, …)`
  **overwrites** instead of summing, so one slot's event count is reported for both
  same-label slots.
- **Fixed in the working tree (uncommitted WIP)** by two small helpers in
  `activity/ActivityUniverseShell.tsx`: `distinctLabels()` (`Array.from(new Set(dict))`,
  feeding the picker options) and `countBySlot()` (per-slot `Uint32Array` tally,
  then `map.set(label, (map.get(label) ?? 0) + perSlot[i])`). The **mask still walks
  the full dict**, so every slot sharing a selected label is kept — do not "simplify"
  the mask to iterate distinct labels.
- **Durable rule:** the dict *shape* is permanent (it comes from
  `mergeRoleNames`-derived ACC role names, which legitimately include a role literally
  named "Unknown"). **Any new dict-backed filter must dedupe its options and sum its
  counts per label.** Do not assume a fresh dict is unique — check.

### 2. 🔑 Headless WebGL is NOT a valid gate for pointer-driven graph behaviour

Extends the Ph37 SwiftShader fps trap: it is not only fps that headless invalidates.

- **Mechanism (verified in source):** the 32 px magnet
  (`MAGNET_RADIUS_PX = 32`, `ActivityUniverseShell.tsx`) converts screen radius to
  space radius with a **two-probe `handle.screenToSpace` call** at the pointer
  (`screenToSpace([sx,sy])` vs `screenToSpace([sx+32,sy])`), then rejects anything
  outside `radiusSq`. Under headless Chromium the software rasterizer leaves cosmos's
  camera transform degenerate, both probes return effectively the same point,
  `radiusSq ≈ 0`, and **nothing ever snaps** — session probe: 35 points swept, zero
  hits. `pointermove` events still arrive and the handler still runs, so it presents
  as a product bug rather than a harness artifact.
- **Compounding:** headless also reports `prefers-reduced-motion: reduce`, and the
  hover ring is rendered only when `!reducedMotion` (`data-testid="activity-hover-ring"`),
  so the element a hover assertion looks for is suppressed for a second, unrelated
  reason.
- **Rule:** any spec asserting hover/snap/click-through-magnet must run **headed**
  (`headless: false`, `--use-angle=d3d11`) exactly like
  `tests/e2e/activity-universe-hard-gate.spec.ts` and `scale-spike.spec.ts` already do,
  and should assert the reduced-motion state it expects rather than inheriting it.
  A headless "0 hits" result is **not evidence of a bug**.
- **Real bug this masked (`7d1420b9`, committed):** the 3D overlay `<div>` is a
  **sibling** of `containerRef` stacked above it (`absolute inset-0 z-10`), so pointer
  events over the 3D canvas bubble to the common parent and never reach `containerRef`
  — where the 3D magnet/click listeners were attached. Ring, tooltip, and
  click-to-open were dead in 3D. Listeners now attach to `overlay3Ref`. **Whenever a
  new overlay is stacked over the canvas, re-check which element owns the listeners.**

### 3. 🔑 The activity payload fixture needs TWO flags, and the default e2e config sets only one

- `app/api/activity-universe/payload/route.ts`:
  `NEXT_PUBLIC_ACC_GRAPH_TEST === "1" && ACC_ACTIVITY_TEST_FIXTURE === "1"`.
  Either flag alone → the route silently serves the **real 196.2 MB artifact**
  (`.embedding/activity-universe.bin`, 4,904,886 rows) and every fixture assertion
  fails as `Expected 180, Received 4904886` (`ACTIVITY_TEST_FIXTURE_COUNT = 180` in
  `lib/server/activityUniverseTestFixture.ts`).
- **The trap is live in-repo:** `playwright.config.ts`'s `webServer.env` sets
  `NEXT_PUBLIC_ACC_GRAPH_TEST: "1"` but **not** `ACC_ACTIVITY_TEST_FIXTURE`. The flags
  are also read at different times — `NEXT_PUBLIC_*` is inlined at **build** time for
  the client, `ACC_ACTIVITY_TEST_FIXTURE` at **request** time on the server — so an
  isolated prod build (`NEXT_DIST_DIR=.next-e2e`) must carry the first at build and the
  second at `next start`. `scripts/measure-spatial-graph-baseline.cjs` deliberately
  does the inverse (`Remove-Item Env:ACC_ACTIVITY_TEST_FIXTURE`) so its perf numbers
  come from the real corpus — do not "fix" that.
- The failure message names a count, not a flag; recognizing it costs a whole rebuild
  cycle if you don't know this.

### 4. 🔑 `AccActivityEmbedding` has NO timestamp — finer-than-month time joins back to source

- **Schema (`prisma/schema.prisma` ~930):** `AccActivityEmbedding` stores
  `id, x, y, verbId, objectTypeId, moduleId, monthId, roleId, companyId, projectId,
  authorId, folderId, embeddingRunId, updatedAt`. `monthId` ("months since corpus
  floor") is the **only** time signal the Python pipeline keeps; `updatedAt` is a
  write-time column, not the event time.
- **Consequence:** the week scrubber could not be computed from the embedding table.
  `scripts/build-activity-universe-payload.ts` (uncommitted WIP) joins the source rows
  back by primary key across **both id spaces**:
  ```
  LEFT JOIN "AccActivity"      a  ON a.id = e.id
  LEFT JOIN "AccActivityAccds" ac ON ac."accdsActivityId" = substr(e.id, 7)
  ...  COALESCE(a."createdAt", ac."createdAt") AS ts
  ```
  `substr(e.id, 7)` strips the literal `"accds:"` prefix — the id convention is
  `"accds:"+accdsActivityId | AccActivity.id` (documented on the model since the Ph39
  fix). Both sides index-seek; ~2 s per 200k chunk.
- **Scale of the two spaces:** artifact total **4,904,886**; `AccActivityAccds` census
  **4,862,301** (measured 2026-07-20, `.planning/REQUIREMENTS.md`) ⇒ the `AccActivity`
  (DC backfill + admin) remainder is **42,585**. VERIFY: the 42,585 is arithmetic from
  those two figures, not a direct `COUNT(*)`.
- **Derived columns are build-time, so the artifact must be rebuilt:** `weekId` is
  filled inline during the stream (`weekFloor 2024-11-25`, **87 buckets**,
  `weekUnknownCount 0` — every row resolved a source timestamp). Any change to the
  source tables, the embedding table, or the week math requires re-running the builder
  (~70 s) — the same rebuild rule the Ph39 `eventDetail` idAnchors note already
  carries, now with a second reason.
- **Do not add a timestamp column to the embedding table casually:** it is written by
  `compute_activity_embeddings.py` via COPY, and that writer carries the psycopg3
  savepoint-rollback trap (Ph38).

### 5. Full-corpus rendering — the thresholds that are now permanently crossed

`SAMPLE_CAP = 5_000_000` in `activity/lodSample.ts` (owner decision 2026-07-23:
"render EVERYTHING") sits **above** the 4.9M corpus, so the "uniform sample" is
stride-1 = every event. That silently flips several bounded-mode behaviours into
their large-set branch permanently. All still true, re-verified:

- **Ambient motion is OFF at full corpus.** `AMBIENT_MAX_N = 250_000`
  (`activity/activityMotion.ts`); `startAmbient()` returns early above it, because each
  cadence tick uploads the FULL working buffer (~39 MB at 4.9M every 250 ms). The
  Ph41 "67.2 fps with ambient active" evidence was measured at 490,489 rendered — it
  does **not** describe the shipped full-corpus path. `AMBIENT_SUBSET_CAP = 100_000`
  and the 250/450 ms tier cadence (§2026-07-22 item 5) still govern the bounded case.
- **Morph commits throttle above 1M points.** `MORPH_BIG_SET_POINTS = 1_000_000`,
  `MORPH_BIG_SET_THROTTLE_MS = 250` (`ActivityUniverseShell.tsx`): slider drags fire on
  a trailing `setTimeout` that reads the **latest** `strengthRef` when it lands, instead
  of the small-set `requestAnimationFrame` path. Under 1M points behaviour differs — a
  test written at fixture scale (180 rows) never exercises the shipped branch.
- **3D drops supersampling above 1M points.** `ActivityUniverse3D.tsx`:
  `pixelRatio = min(devicePixelRatio, n > 1_000_000 ? 1.5 : 2)` — ~44% fewer fragments,
  fill-rate relief. Changing it changes measured fps, not just sharpness.
- **The magnet's scan is strided at full density.** `step = max(1, round(n / LOD_CAP))`
  with `LOD_CAP = 200_000` ⇒ ~stride 25 at 4.9M, so the 2D snap may pick a
  near-nearest neighbour (documented, visually identical in a dense cloud). Zoomed-in
  region sets are under the cap, so step = 1 there. Do not "fix" this into an exhaustive
  scan without measuring.
- **The region-LOD viewport scan is now genuinely O(4.9M) per interaction-end**
  (`viewportIndices`, debounced). The Ph39 note that closed this ("no index needed")
  was evidenced at the smaller rendered set — treat it as re-opened if interaction-end
  latency regresses.

### 6. Activity-universe traps carried forward — still live, re-verified 2026-07-23

- **`buildClumpTargets` must return a COPY.** `activity/activityClump3.ts`: the
  no-categories / misaligned-input branch returns `base3.slice()`, not `base3`. The 3D
  view wraps base and target in **separate GPU attributes** and later overwrites the
  target attribute in place; an aliased return corrupts the base positions on the first
  group-by switch. The comment is in the source — keep it there.
- **The 2D LOD wheel seam must gate off while the 3D overlay is up.** `applyLod()`
  returns early on `viewModeRef.current !== "2d"`. Without the gate it scans 4.9M
  positions per zoom settle (visible jank on a hidden canvas) **and clobbers
  `renderedToFullRef`**, which the 3D view pins to `sampleIdx` for hover/lasso index
  mapping — selections would resolve to the wrong events.
- **`commitMorph` is suspended in 3D** (`viewModeRef.current === "3d"` → return): 3D
  owns its morph on the GPU via the `uMix` uniform + `aTarget` attribute; the 2D canvas
  would burn ~39 MB uploads while hidden. The view-flip effect re-syncs 2D on return
  (`commitMorph(MORPH_COMMIT_MS)`) and re-pins `renderedToFullRef`. Removing either
  half leaves 2D silently out of sync with the slider.
- **cosmos `fitView*` remains unusable on the activity path** (corrupted `scaleX` from
  a racing first rescale) — the empirical screen-space fit in `GraphCanvas2D.tsx`
  stands. See 2026-07-22 item 2; unchanged.
- **Dual-GPU adapter lottery still applies** — verify fps ×3 launches. See 2026-07-22
  item 3; unchanged.

### 7. Standing structural concerns — moved, not resolved

- **`ActivityUniverseShell.tsx` is 1,754 lines in the working tree (1,558 at HEAD) —
  the largest source file in the repository**, past `lib/acc/dcIngest.ts` (1,672). It
  owns payload decode, six filter states, week/month scrubbing, project picker, 2D↔3D
  view switching, magnet hover, lasso, morph commit, LOD seam, and the detail rail, and
  it is the main contributor to the `large-use-effect` count rising 146→153. Its
  interlocking refs (`renderedToFullRef` / `viewModeRef` / `strengthRef` /
  `restoreSampleRef`) are exactly the state that §6's traps are about — a naive split
  along component lines would scatter them. **Flag, don't split speculatively**; if it
  must be split, extract *pure* modules (the `activity/*.ts` files already model this
  well: 30 sibling modules, all small and separately tested) rather than slicing the
  effect graph.
- **Route-owned shared logic under `app/(dashboard)/users/access-analysis/` is
  unchanged in character** — see §B's 2026-07-23 update: 7 `lib`/`server` → `app` edges
  and 1 `scripts` → `app` warning, all reaching into the same route folder. The instance
  graph's retirement removed some importers and Phase 38's builder immediately added a
  new one. The one-time fix (move `graphNodesFromUsers.ts`, `accTaxonomy.ts`,
  `accNormalize.ts`, `internalDomains.ts` to `lib/acc/` with barrels) is still unmade.
- **ACC/DC/accds coupling ceilings (§F) are unchanged** — accds ~12-month floor, DC
  ~18-month retention wall, 403 coverage gap, `AccActivity.service` ignored,
  `AccDcRole` empty by design. The activity universe inherits all of them: it is built
  from the accds-primary + DC-backfill union, so its 4.9M events carry exactly the same
  coverage caveats and the same `957`-project dict (the `project` dict length matches
  the accds crawl universe, **not** the ~1,153 ACC project census — a universe view
  showing "957 projects" is disclosing a source ceiling, not counting ACC).

### Dashboard Self-Check (2026-07-23 refresh)

- **Context:** `git log 956408d1..HEAD --stat` (12 commits) + `git status --short`;
  `app/api/activity-universe/payload/route.ts`; `lib/server/activityUniverseTestFixture.ts`;
  `app/(dashboard)/users/access-analysis/activity/` (`ActivityUniverseShell.tsx`,
  `ActivityUniverse3D.tsx`, `activityGraphData.ts`, `activityMotion.ts`,
  `activityClump3.ts`, `lodSample.ts`); `scripts/build-activity-universe-payload.ts`;
  `prisma/schema.prisma` (`AccActivityEmbedding`); `playwright.config.ts` +
  `tests/e2e/*.spec.ts` launch options; `.embedding/activity-universe-meta.json` and
  `-dicts.json`; `.tools/repo-map/dependency-cruiser.json` + `ast-grep-report.json`
  (regenerated 2026-07-23); `wc -l` over `git ls-files`.
- **Evidence:** dict duplication computed directly from the meta JSON (role 91 entries,
  `"Unknown"` ×2; all other dicts unique). Fixture count, flag conjunction, ambient/morph/
  pixel-ratio thresholds, `substr(e.id, 7)` join, and week fields (`floor 2024-11-25`,
  87 buckets, 0 undated) read from source/artifact. Line counts measured, not recalled.
- **Constraints:** docs-only; no code, theme, or WebGL-scope claims changed. The 3D
  overlay is pre-existing approved v2.7 scope, not new WebGL on a data surface.
- **Gates:** no build/tsc gates applicable to a docs refresh; repo-map artifacts were
  already regenerated by this mapping session (dependency-cruiser 1 warning, ast-grep
  `direct-prisma-in-ui` 0).
- **VERIFY (new):**
  - `AccActivity`-space row count **42,585** is arithmetic (4,904,886 artifact total −
    4,862,301 accds census), not a direct `COUNT(*)`.
  - The headless magnet/reduced-motion behaviour is session-measured (35 probes, 0 hits,
    headed launch fixes it); the *mechanism* is verified in source, the *headless
    numbers* are not re-derivable statically.
  - Carried forward and still open: accds crawled-project count (236/957 memory-sourced;
    the payload `project` dict is 957), current DC covered-project count before any UI
    display, ACCDS cookie TTL, Account Admin provisioning status.
