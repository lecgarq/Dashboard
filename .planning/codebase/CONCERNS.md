# Codebase Concerns

**Analysis Date:** 2026-06-17

## Tech Debt

**Large monolithic data-ingest orchestrator:**
- **Issue:** `lib/acc/dcIngest.ts` (1,672 LOC) handles the full Data Connector daily ingestion pipeline — quota, retries, slice polling, activity CSV parsing, admin snapshot ingestion, anomaly checks, progress tracking, and bisection fallback. It is the critical path for nightly sync and has concurrent uncommitted WIP.
- **Files:** `lib/acc/dcIngest.ts`, `lib/acc/dcIngest.test.ts`
- **Impact:** Changes to this file risk breaking the nightly cron schedule and silent data loss. The file blocks refactoring and cleanup until outstanding WIP lands.
- **Fix approach:** Split into smaller domain modules (dcAnomalyChecks, ingestActivityCsv, ingestAdminSnapshot orchestration) and restructure as a pure state machine. Defer until nightly cron is stable and the active-wip branch is merged.

**Telemetry disconnect in AccDcIngestRun:**
- **Issue:** `AccDcIngestRun.rowsByModule` is always recorded as `{admin:0, docs:0, ...}` even when rows are successfully inserted. The daily cron (`scripts/dc-daily-ingest.cjs`) inserts rows directly via `dcActivityCsvIngest.ingestActivityCsv()` but never updates the telemetry field.
- **Files:** `lib/acc/dcIngest.ts:1669-1670` (finalizeRun persists rowsByModule), `lib/acc/dcActivityCsvIngest.ts` (writes directly without telemetry callback)
- **Impact:** Ingest metrics and reporting are unreliable; no observable proof that activity rows are actually being inserted at scale.
- **Fix approach:** Wire a callback from `ingestActivityCsv` to track rows-inserted per module and pass the result back to `finalize()`.

**Clash/Sim module duplication:**
- **Issue:** Clash and Simulator modules share identical domain (permission graphs, user role analysis) but have separate data models (`ClashIssue` vs simulator rows), separate routers (`server/routers/acc-sync.ts` ~795 LOC and related clash logic), and cloned UI components.
- **Files:** `server/routers/acc-sync.ts`, `lib/acc/` clash-specific modules, Clash-specific UI in `app/(dashboard)/clash/`
- **Impact:** Bug fixes must be applied twice; adding a new feature (e.g., filter, export) doubles the effort. DB schema adds rows for both modules and bloats query results.
- **Fix approach:** Merge the two modules under one `moduleKey`-parameterized domain model (e.g., `AccIssue` with `source: 'clash' | 'simulator'`). Requires DB migration, router consolidation, and UI refactor. Needs its own spec and session.

**Taxonomy co-location in access-analysis route:**
- **Issue:** `app/(dashboard)/users/access-analysis/accTaxonomy*` (dimension taxonomy and role/action mappings) live in a route directory but are imported by server-side ingest code and pure lib modules. This tightly couples the UI route to the domain data model.
- **Files:** `app/(dashboard)/users/access-analysis/accTaxonomy*.ts`, imported by `lib/acc/activityCategories.ts`, `lib/acc/activityAggregate.ts`, `server/routers/acc-activity.ts`
- **Impact:** Cannot decommission the old user-graph route without orphaning the taxonomy. The taxonomy should be immutable reference data but lives in a mutable UI route.
- **Fix approach:** Move `app/(dashboard)/users/access-analysis/accTaxonomy*.ts` to `lib/acc/taxonomy/` and update all imports. Requires coordination with active graph-development work.

## Known Bugs

**Data Connector activity ingest drift (2026-05-18 incident, **FIXED in spec, NOT YET DEPLOYED**):**
- **Symptoms:** `AccActivity` table received zero new rows for 5 days (2026-05-13 to 2026-05-18) despite `AccDcIngestRun` reporting `status='success'` for each nightly run.
- **Root cause:** Three compounded bugs:
  - **Bug A:** `lib/acc/dcActivityCsvIngest.ts` writes an `ingestRunId` field to `tx.accActivity.createMany()` but `prisma/schema.prisma` model `AccActivity` has no `ingestRunId` column → every activity insert throws "column does not exist" silently.
  - **Bug B:** `lib/acc/dcIngest.ts:979-994` catches exceptions and continues the slice loop, finalizing the run as `status='success'` with `rowsByModule={}`. No one noticed for 5 days.
  - **Bug C:** `lib/acc/dcIngest.ts:1002-1040` always calls `ingestAdminSnapshot` even for backward-window slices. Backward windows have fewer admin users than forward, triggering the 10% anomaly threshold and rolling back the entire run. The backward-progress update is skipped due to early return before line 1042.
- **Files:** `lib/acc/dcActivityCsvIngest.ts:163-171`, `lib/acc/dcIngest.ts:979-1040`, `prisma/schema.prisma:532-549`
- **Impact:** Activity data is silently dropped; the 5-day backfill window is lost. A similar regression could recur if not fixed.
- **Workaround:** Kill switch `.dc-ingest.disabled` was created at repo root. Cron is disabled until the fix lands.
- **Fix shipped to spec:** Design document at `docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md` specifies:
  1. Add `ingestRunId String?` column to `AccActivity` (migration).
  2. Replace `console.error + continue` with hard abort (`status='failed'`).
  3. Skip `ingestAdminSnapshot` for backward-only slices.
  4. Reset `AccDcBackfillProgress` rows via `scripts/dc-reset-progress.cjs --confirm`.
  5. Verification gate before re-enabling cron (12 step checklist).
  - **Status:** Spec locked; implementation plan `docs/superpowers/plans/*` pending. NOT in tree yet.

**Empty-string `projectId` sentinel silent inclusion:**
- **Symptoms:** Queries filtering `projectId != null` or `projectId IS NOT NULL` silently include admin-user records where `projectId = ''` (the empty-string sentinel for account-level permissions).
- **Files:** `lib/acc/dcAnomalyChecks.ts`, activity tests, any snapshot query relying on `projectId` nullness
- **Impact:** Activity counts and anomaly checks may over-count admin activity or miss admin-only edge cases.
- **Fix approach:** Use `projectId != ''` AND `projectId IS NOT NULL` guards consistently, or refactor to a nullable `projectId` with explicit `NULL` for admin. Requires audit of all projection/filter paths.

**Lasso e2e load flake (intermittent, **not a regression**):**
- **Symptoms:** `tests/e2e/acc-dc-graph.spec.ts` lasso-selection test times out at 120s global Playwright budget under machine load on Luis's PC.
- **Files:** `tests/e2e/acc-dc-graph.spec.ts` (lasso-drag scenario), `app/(dashboard)/users/access-analysis/LassoOverlay.tsx`
- **Impact:** e2e suite fails intermittently under concurrent load; CI/local runs on fast machines pass. Not a code regression.
- **Cause:** The lasso logic is correct (projection+dense OK); timeout is due to machine load and Playwright's global 120s budget, not the implementation.
- **Workaround:** Re-run on idle machine; watch Playwright budget if adding more e2e tests.
- **Fix approach:** None needed unless the test is mission-critical; consider splitting e2e into smaller parallel suites if flakiness impacts CI.

**Chart data aggregation mismatch — user-level vs instance-level:**
- **Symptoms:** `/access-analysis` charts render using `BulkAccUser` (aggregated per user across all projects) instead of per-instance `BulkAccProject` (one row per user/project pair).
- **Files:** `app/(dashboard)/access-analysis/page.tsx`, `lib/server/acc-hot-cache.ts` (bulkUsers query), `app/(dashboard)/access-analysis/ChartPanel.tsx` and related chart consumers
- **Impact:** Activity/role/permission counts in charts are user-wide, not project-specific. This hides project-level outliers and can over/under-represent per-project permission risk.
- **Fix approach:** Refactor chart data fetchers to request per-instance snapshots, or clarify chart semantics (user-wide vs project-scoped) in the UI labels.

## Security Considerations

**APS OAuth refresh-token rotation bug — now fixed:**
- **Risk:** APS v2 refresh tokens are single-use. Calling `refreshUserToken()` replaces the stored token; if the script doesn't persist the new token, the next call fails and breaks dashboard login.
- **Files:** `lib/server/aps-oauth.ts`, `scripts/aps-login.cjs`, `scripts/dc-daily-ingest.cjs`
- **Current mitigation:** The wrapper script `scripts/dc-daily-ingest.cjs` persists the new token. Direct calls to `refreshUserToken()` outside this wrapper risk breakage.
- **Incident:** 2026-06-01 login broke when manual DC-extraction script used `refreshUserToken()` without persisting; recovered via `scripts/aps-login.cjs` (manual re-auth).
- **Recommendations:** Add a typed return value to `refreshUserToken()` that callers MUST use (not just log); audit all callers (cron scripts, manual utilities); add a pre-flight test in CI that exercises the token refresh path.

**Admin project discovery scoped incorrectly:**
- **Risk:** `lib/acc/dcProjectDiscovery.ts:discoverAdminProjects()` uses 2-leg authentication (no user context), which returns ALL account-level projects. The dashboard presents this as "all projects you administer" but luis's account is project-scoped admin (can't grant self Account-Admin), so the set is incomplete.
- **Files:** `lib/acc/dcProjectDiscovery.ts`, `scripts/dc-extract-id-list.cjs`
- **Current mitigation:** The DC Data Connector API only lists projects the authenticated user can extract from. 3-leg user-context auth works (via `refreshUserToken`). 2-leg is permanently blocked by APS (returns 403 for Data Connector scope).
- **Impact:** 724 of 1,152 active projects are locked (403) and unreachable. The UI should clarify this limitation.
- **Recommendations:** 
  1. Document the scoping limit in the UI ("showing only projects you can extract from").
  2. Wire a "needs Account-Admin to unlock" indicator for locked projects.
  3. Update the data-discovery view to surface the unlock path.

**Env variable secrets in committed files:**
- **Risk:** `.env` file contains live API keys and credentials. Although `.env*` is in `.gitignore`, temporary CI/Docker setups may accidentally commit it.
- **Files:** `.env` (not committed, but exists on disk), `docker-compose.yml` (if any)
- **Current mitigation:** `.gitignore` prevents commit; `.env.example` exists with dummy values.
- **Recommendations:**
  1. Audit all `docker-compose.yml` / `Dockerfile` for inline `ENV` or `--env-file` references that might leak into images.
  2. Add a pre-commit hook that refuses any `.env*` commits.
  3. Use external secret management (e.g., Railway Secrets, Vercel Env Vars) for production deployment instead of local `.env` files.

## Performance Bottlenecks

**AccActivity bulk join on email::projectId — no index:**
- **Issue:** `featureSnapshot.ts` joins `AccActivity` rows by `(email, projectId)` to enrich per-node activity data. The table has 623k rows; the join uses no composite index on `(email, projectId)`.
- **Files:** `app/(dashboard)/users/access-analysis/featureSnapshot.ts`, DuckDB query builder
- **Impact:** Cold startup of `/users/access-analysis` can spike query time to 218ms+ for large projects (measured 2026-05-25). Every session hydration runs this query.
- **Measurement:** `bulkUsers` with `includeActivityMix` takes ~218ms on a grouped `AccActivity` query; no index, full-table scan.
- **Fix approach:** Add a composite index `("email", "projectId")` to `AccActivity`. Add a regression test that asserts `bulkUsers` latency < 300ms under a 500k-row dataset.

**Folder terrain rendering lag on large crawl results:**
- **Issue:** `app/(dashboard)/access-analysis/FolderPermissionTerrain.tsx` (1,041 LOC) renders a nested treemap for folder hierarchies. On projects with 10,000+ folders (e.g., Hermosillo), the component re-renders on every scroll and causes 2-3s lag.
- **Files:** `app/(dashboard)/access-analysis/FolderPermissionTerrain.tsx`, `app/(dashboard)/access-analysis/folderTerrain.ts` (1,093 LOC math)
- **Impact:** `/access-analysis` folder panel becomes unresponsive under large crawls.
- **Fix approach:** Memoize the terrain layout (`useMemo` on folder tree), virtualize rows, or debounce scroll events. Measure before/after with Chrome DevTools Profiler.

**Mosaic/DuckDB chart rendering on client browser:**
- **Issue:** Charts on `/access-analysis` run Mosaic + DuckDB-WASM on the client, loading and processing the full dataset in the browser. This blocks the thread during chart rendering (~50-200ms per chart).
- **Files:** `app/(dashboard)/access-analysis/ChartPanel.tsx`, `app/(dashboard)/access-analysis/VgplotFacetChart.tsx`, `app/(dashboard)/access-analysis/components/HistogramPanel.tsx` (Mosaic-based)
- **Impact:** Switching chart tabs or resizing the window causes layout thrashing and brief unresponsiveness.
- **Fix approach:** Pre-aggregate chart data on the server (summary stats, bucketed distributions) and stream it to the client. Mosaic can then query the smaller dataset.

## Fragile Areas

**Dimension registry auto-creates layout targets:**
- **Files:** `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`, `app/(dashboard)/users/access-analysis/featureTargets.ts`
- **Why fragile:** Adding a new `DimensionDescriptor` entry to `DIMENSION_REGISTRY` automatically creates a layout target in the physics simulation. If you add a descriptor without intending it as a force dimension, the layout changes unexpectedly.
- **Safe modification:** Only add descriptors deliberately; every addition should have a corresponding test in `featureTargets.test.ts` that verifies the target is created and positioned correctly.
- **Test coverage:** `featureTargets.test.ts` tests dimension → target mapping; `physicsClustering.test.ts` tests clustering ratio under slider sweeps.

**Node identity keyed on `userId::projectId` — identity contract:**
- **Files:** `app/(dashboard)/users/access-analysis/sameUserEdges.ts:parseNodeId()`, `app/(dashboard)/users/access-analysis/graphTables.ts` (builds `nodeId`), e2e test `EXPECTED_NODE_COUNT`
- **Why fragile:** All edges, selection state, and e2e assertions depend on the exact string format `userId::projectId`. If `graphTables.ts` changes the format (e.g., to `userId|projectId`), all edges and selection logic breaks silently.
- **Safe modification:** If you change node identity format, you MUST update:
  1. `graphTables.ts` (where nodeId is created).
  2. `sameUserEdges.ts` (where nodeId is parsed).
  3. `SelectionContext.tsx` (where nodeId is keyed).
  4. e2e spec `EXPECTED_NODE_COUNT` and any nodeId assertions.
- **Test coverage:** `sameUserEdges.test.ts` tests parsing; e2e asserts the final node count.

**GraphCanvas conditional rendering destroys WebGL context:**
- **Files:** `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` (dispatcher), `GraphCanvas2D.tsx`, `GraphCanvas3D.tsx`
- **Why fragile:** **Both 2D and 3D canvas containers MUST always be mounted.** If you conditionally render one based on `mode`, the WebGL context is destroyed and the graph goes blank.
- **Invariant:** `GraphCanvas.tsx:12-14` documents: "both containers always mounted; CSS visibility switch on mode change."
- **Safe modification:** To switch renderers, use `visibility: hidden` on the inactive canvas, never conditionally unmount it.
- **Test coverage:** `GraphCanvas.test.ts` tests dispatcher; e2e exercises both 2D/3D mode switches.

**Graph physics — force simulation invariants:**
- **Files:** `app/(dashboard)/users/access-analysis/physicsLayer.ts` (1,326 LOC), `mathLayer.ts` (target blending)
- **Why fragile:** The force simulation tuning (spring constants, damping, target weights) is sensitive. Small changes to force coefficients or blend logic cause:
  1. NaN propagation (all nodes vanish).
  2. Divergent simulation (nodes scatter to infinity).
  3. Layout regression (clustering changes unexpectedly).
- **Safe modification:** All changes to `physicsLayer.ts` or `mathLayer.ts` MUST go through the `access-analysis-graph-development` workflow (§4 layout-math validation):
  1. Test invariants: no NaN, determinism, blend sanity (using `mathLayer.purity.test.ts`, `physicsLayer.purity.test.ts`).
  2. Test slider behavior: 0↔100 sweep produces monotonic clustering change (via `physicsClustering.test.ts`).
  3. Visual UAT: verify the 0/50/100 slider positions on real data produce expected layouts.
- **Test coverage:** Extensive pure-function and property tests; e2e asserts layout stats and clustering ratio.

**Edge clique explosion — same-user edges can proliferate:**
- **Files:** `app/(dashboard)/users/access-analysis/sameUserEdges.ts:deriveSameUserEdges()`, `linkEmphasis.ts`
- **Why fragile:** If a user appears in N projects, `deriveSameUserEdges` creates N*(N-1)/2 edges (a clique). For a user with 1000 project instances, that's ~500k edges, overflowing the renderer and causing lag.
- **Safe modification:** New edge types MUST implement clique-capping:
  1. Hub pattern: keep only top K edges (e.g., top 5 projects per user).
  2. Threshold: keep only edges above a similarity threshold.
  3. Manual filter: allow UI to hide certain edge types.
- **Test coverage:** `sameUserEdges.test.ts` asserts edge count doesn't exceed clique bounds; e2e watches render performance.

**AccActivity groupBy query — index missing:**
- **Files:** `lib/server/acc-hot-cache.ts:167-245` (activity groupBy query), `lib/acc/activityAggregate.ts` (fold logic)
- **Why fragile:** The server-side groupBy (`AccActivity` grouped by `email, projectId, rawAction`) runs on a 623k-row table without a composite index. Any cardinality change (new modules, new action types) can spike query time.
- **Safe modification:** Before changing `AccActivity` schema or `activityAggregate` logic, measure the groupBy query latency under realistic data volume (~500k+ rows). Add regression tests in `acc-hot-cache.test.ts`.
- **Test coverage:** `activityAggregate.test.ts` tests fold logic; `acc-hot-cache.test.ts` tests cache hits per flag combination.

**Cache key versioning — stale-cache risk:**
- **Files:** `lib/server/acc-hot-cache.ts:96-115` (cache version logic), `acc-dc-graph.ts:24` (includeActivityMix flag)
- **Why fragile:** The cache key is built from a version string + feature flags. If a new flag (`includeActivityMix`, `includePermissionSummary`) is added but the version string is NOT incremented, the cache returns stale data for old flag combos.
- **Incident:** 2026-05-25: `includeActivityMix` was added; if the version weren't bumped, queries with `{permission: true, activity: true}` would return data from `{permission: true, activity: false}` cache slots.
- **Safe modification:** Every new flag in `bulkUsers` input MUST extend the version ID (e.g., from `"v2"` to `"v3"`), and the change must be tested in `acc-hot-cache.test.ts` (§93+).
- **Test coverage:** `acc-hot-cache.test.ts` tests flag combinations and cache versioning; `acc-dc-graph.test.ts` tests router input/output.

## Scaling Limits

**Data Connector project extraction cap:**
- **Current capacity:** 428 of 1,152 active projects are extractable (the rest are 403-forbidden due to luis's account-scoped admin permissions). Daily quota: 25 requests/UTC-day (APS hard-cap).
- **Limit:** ~50 projects per request (configurable in `dcProgressiveBackfill.ts`); 25 requests = 1,250 projects/day theoretically, but only 428 are accessible.
- **Scaling path:**
  1. Escalate to Account-Admin role (needs Autodesk/Hermosillo enablement).
  2. Implement 3-leg auth workflow for users to grant their own Data Connector permissions.
  3. Partition extraction by user scope (per-user instances, ~200 admin users) and parallelize.

**DuckDB-WASM memory in browser:**
- **Current capacity:** Charts load full datasets into DuckDB-WASM. For 623k activity rows + folder hierarchies (10k+ nodes), browser memory peaks at ~500MB.
- **Limit:** ~2GB addressable by WASM in a 64-bit browser; hitting this causes OOM crashes.
- **Scaling path:**
  1. Server-side aggregation (compute summary stats, bucketed distributions on Postgres, not the browser).
  2. Streaming aggregation (fetch data in chunks, update charts incrementally).
  3. Parquet column storage (compress and prune columns before sending to browser).

**Graph physics simulation on 17k nodes:**
- **Current capacity:** ~17k nodes; simulation runs at 107fps after 2026-06-01 optimization (GPU 2D, CPU 3D). Cold-start: ~5s initial layout.
- **Limit:** 3D physics on CPU is O(n²) pairwise forces; ~50k nodes would run at <1fps.
- **Scaling path:**
  1. GPU-accelerated 3D physics (cosmos.gl v3 GPU mode, or WebGPU).
  2. Spatial partitioning (quadtree/octree for neighbor lookup).
  3. Viewport culling (only simulate visible nodes, LOD for distant clusters).

## Test Coverage Gaps

**dcIngest error paths — exception handling under-tested:**
- **What's not tested:** The 10+ exception paths in `lib/acc/dcIngest.ts` (APS 503 retry, 429 quota exceeded, malformed CSV, file fetch timeout, anomaly check fail, bisect recovery). Only the happy path and one quota-exceeded case are covered in `dcIngest.test.ts`.
- **Files:** `lib/acc/dcIngest.ts`, `lib/acc/dcIngest.test.ts` (1,254 LOC but sparse error coverage)
- **Risk:** A new exception type (e.g., network timeout during file fetch) could silently continue and corrupt data.
- **Priority:** **High** — the ingest path is critical; every exception must be tested for proper `finalize()` behavior.

**Folder terrain rendering on large crawls — no perf regression tests:**
- **What's not tested:** `FolderPermissionTerrain.tsx` has no perf benchmarks. We measure lag anecdotally ("2-3s lag on Hermosillo crawl") but have no automated check that catches regressions.
- **Files:** `app/(dashboard)/access-analysis/FolderPermissionTerrain.tsx`, `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` (144 LOC, snapshot only)
- **Risk:** A future refactor could inadvertently trigger a 10x slowdown without CI catching it.
- **Priority:** **Medium** — add a perf test that renders a 5,000-node tree and asserts `< 1s` time-to-interactive.

**Access-analysis chart aggregation semantics — user-wide vs project-scoped:**
- **What's not tested:** The chart data source is never asserted to be user-wide or project-scoped. If you refactor `BulkAccUser` to `BulkAccProject`, charts may silently change meaning.
- **Files:** `app/(dashboard)/access-analysis/ChartPanel.tsx`, `app/(dashboard)/access-analysis/components/HistogramPanel.tsx` (Mosaic-based charts), `__tests__/` (sparse)
- **Risk:** User-scoped charts over-represent high-volume users; a refactor could flip this and break UA.
- **Priority:** **Medium** — add a unit test that asserts chart data is user-wide (or document the semantic clearly if it's intentional).

**DuckDB-WASM memory leaks under rapid tab switches:**
- **What's not tested:** Switching between `/access-analysis` charts rapidly (e.g., clicking through histogram facets in 1s intervals) can accumulate DuckDB table instances in memory without cleanup. No automated test exercises this.
- **Files:** `app/(dashboard)/access-analysis/MosaicCoordinatorContext.tsx` (state holder), `app/(dashboard)/access-analysis/VgplotFacetChart.tsx` (renderer)
- **Risk:** A 30-minute session could accumulate several GB of uncleaned DuckDB state.
- **Priority:** **Low** — affects long sessions; mitigate by adding a cleanup function on unmount or a session-level memory monitor.

---

*Concerns audit: 2026-06-17*
