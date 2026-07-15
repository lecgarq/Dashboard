# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 ACC Graph** - Phases 01-06 (shipped ~2026-05)
- ✅ **v2.0 Workshop UI Overhaul** - Phases 01-07 (shipped 2026-06-19)
- ✅ **Phase 08 — Activity Re-extraction** (interim phase, shipped 2026-06-23)
- ✅ **v2.1 Concerns Hardening** - Phases 09-14 (shipped 2026-07-01)
- ✅ **v2.2 Structural Refactors** - Phases 15-19 (shipped 2026-07-02)
- ✅ **v2.3 New Graphs** - Phases 20-23 (shipped 2026-07-14)
- 🚧 **v2.4 Spatial Graph Dimensions** - Phases 24-28 (in progress, opened 2026-07-14)

---

## ✅ v2.1 Concerns Hardening (Complete — 2026-07-01)

**Milestone goal:** Close the 22 mapped concerns in `.planning/codebase/CONCERNS.md` —
harden the DB/config layer, repair layering boundaries, surface data-truthfulness labels
on the workshop pages, add integration-health observability, and backfill the highest-value
tests. Spatial-graph concerns (§3, §8.2/8.3) and monolith splits (§2.3/§6.1) are deferred;
this milestone ships their characterization tests and warning comments.

**Source requirements:** `.planning/REQUIREMENTS.md` (v2.1, 20 requirements, DB/BND/TRUTH/OBS/TYPE/TEST categories)

## Phases

- [x] **Phase 09: DB & Config Hardening** - Add `roleId` index + migration, remove SSL fossil, document heap/pool env vars, guard raw-scan path, and ship the OOM-regression aggregate test — COMPLETE 2026-06-23
- [x] **Phase 10: Layering & Boundary Fixes** - Move direct-Prisma Server Action into tRPC, extract activity classification to `lib/acc`, eliminate non-spatial-graph lib→app and client app→server violations (completed 2026-06-23)
- [x] **Phase 11: Data-Truthfulness Labels** - Surface DC 428/1,152 coverage, ACCDS ~12-month data floor, module-donut service caveat, and AccDcRole fallback docs on `/access-analysis` (completed 2026-06-30)
- [x] **Phase 12: Integration Health & Observability** - ACCDS session health in progress monitor, AccDcRole-empty warning in cache, remove stale TODO[02.5] guards (completed 2026-06-30)
- [x] **Phase 13: Type-Safety Guards** - Mark `bulkUsers` lean-payload fields as `never[]`, add `accGraphFilters` compile-time drift assert (completed 2026-06-30)
- [x] **Phase 14: Characterization Tests** - Pin access-analysis monolith tRPC boundaries and shared terrain query output so deferred splits are safe (completed 2026-06-30)

## Phase Details

### Phase 09: DB & Config Hardening

**Goal**: The DB schema is correctly indexed, the SSL fossil is removed, heap/pool configuration is documented in the repo, the OOM-risk path carries a warning, and the AccFolderPermission aggregate has a Vitest regression guard.
**Depends on**: Phase 08 (data extraction complete)
**Requirements**: DB-01, DB-02, DB-03, DB-04, TEST-01
**Success Criteria** (what must be TRUE):

  1. A standalone `@@index([roleId])` is added to `AccFolderPermission` and applied via a raw `CREATE INDEX acc_folder_permission_role_id_idx` migration registered with `prisma migrate resolve` (NOT `prisma migrate dev` — the pgvector `Unsupported` column makes `migrate dev` choke); `EXPLAIN ANALYZE` on a role-joined terrain query shows "Index Scan using acc_folder_permission_role_id_idx" in the plan
  2. `scripts/count-acc-data.cjs` no longer contains `ssl:` or `rejectUnauthorized`; it uses the project Prisma client or `DATABASE_URL` pool
  3. `.env.example` contains `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192`, each with a comment explaining the scaling rationale
  4. `lib/server/acc-hot-cache.ts` `includePermissionContexts:true` branch carries a warning comment about ~5M-row heap risk and a `VERIFY:` note on active callers
  5. `npm test` includes a Vitest test that mocks or exercises the `AccFolderPermission` `GROUP BY` aggregate and asserts returned rows ≤ `n_roles × n_projects` (not raw permission rows), guarding the dominant OOM regression

**Plans**: 2 plans
Plans:

- [x] 09-01-PLAN.md — DB-free code/doc/test changes: remove SSL fossil (DB-02), document PG_POOL_MAX/NODE_OPTIONS (DB-03), raw-scan warning comment (DB-04), OOM aggregate regression test (TEST-01) — COMPLETE 2026-06-23 (commits 66c9f404..64311fac)
- [x] 09-02-PLAN.md — Live-DB index: add `@@index([roleId])` + raw CREATE INDEX migration + `prisma migrate resolve`, EXPLAIN ANALYZE Index-Scan proof, tsc gate + rebuild on :3000 (DB-01) — COMPLETE 2026-06-23 (commit 8d517adb)

### Phase 10: Layering & Boundary Fixes

**Goal**: The `direct-prisma-in-ui` ast-grep rule returns 0 matches, the four scripts→app `moduleOverrides` dependency-cruiser warnings are cleared, and non-spatial-graph `lib→app` and client `app→server` violations are eliminated.
**Depends on**: Phase 09
**Requirements**: BND-01, BND-02, BND-03, BND-04
**Success Criteria** (what must be TRUE):

  1. `ast-grep` rule `direct-prisma-in-ui` returns 0 matches — `coordinationActions.ts` no longer imports `@/server/db` directly; the clash query runs through a tRPC procedure
  2. `scripts/diag-activity-*.cjs` (all four) import classification logic from `lib/acc/activityClassification.ts`; `node scripts/repo-map/check.cjs` shows 0 `scripts→app` warnings for the `moduleOverrides` path
  3. All `lib→app` reverse-dependency edges NOT rooted in `/users/spatial-graph` are removed; `node scripts/repo-map/check.cjs` output lists only spatial-graph-coupled edges as deferred
  4. All `app→server` direct imports from client components (not Server Components/Actions) are corrected; acceptable server-component edges are documented in a comment or CONCERNS note

**Plans**: 3/3 plans complete
Plans:

- [x] 10-01-PLAN.md — BND-01: move clash drill query to `lib/server/projectClashView.ts` + new `acc-coordination` tRPC procedure + thin Server Action; `direct-prisma-in-ui` → 0 (wave 1) — COMPLETE 2026-06-23 (commits 4392637d + e400ef61)
- [x] 10-02-PLAN.md — BND-02: extract classifier to `lib/acc/activityClassification.ts`, re-export from `moduleOverrides.ts`, repoint 4 diag scripts; clears 4 `scripts→app` warnings (wave 1) — COMPLETE 2026-06-23 (commits 226b9bbf + 2b838711)
- [x] 10-03-PLAN.md — BND-03/BND-04: move 3 clean type modules to `lib/acc`, audit + document deferred `lib→app` (spatial-graph + Phase-14 monolith) and `app→server` edges in CONCERNS.md; full gate sequence + rebuild checkpoint (wave 2, depends on 10-01/10-02)

### Phase 11: Data-Truthfulness Labels

**Goal**: `/access-analysis` honestly labels its data coverage for the workshop — activity/DC coverage, ACCDS date floor, module-donut caveat, and role-fallback docs are all visible or recorded.
**Depends on**: Phase 09
**Requirements**: TRUTH-01, TRUTH-02, TRUTH-03, TRUTH-04
**Success Criteria** (what must be TRUE):

  1. A restrained muted header line on `/access-analysis` leads with the free-crawl activity coverage (~956 of 1,153 projects, live DB count) and labels DC-metadata-derived metrics with their own (~550 of 1,153) coverage; coverage is metric-specific, not one blanket number (owner correction: the stale "428 of 1,152 DC" framing is rejected as the headline). The existing per-chart `ActivityCoverageBadge`s are kept; the "Folder Activity by Role" view shows project names or "Unknown project", never raw GUIDs.
  2. Activity-timeline charts display a "Data available from [Mon YYYY]" caption sourced from a `dataFloor` field on the `loadActivityTimeline()` RSC response (`MIN(createdAt)` from `AccActivityAccds`, month-year only) plus a per-project floor in the hover tooltip; the caption respects the zinc theme and uses semantic CSS-variable colors
  3. The module-activity donut on `/access-analysis` carries a hover/focus-only ⓘ tooltip (not an always-on caption) stating that classification is `rawAction`-based and that Autodesk's `service` attribution is not yet reconciled (~40.7% disagreement)
  4. `.planning/codebase/INTEGRATIONS.md` documents the `AccDcRole`-empty → `AccRole` fallback and the DC-conflict behavior

**Plans**: 4/4 plans executed — Phase 11 COMPLETE
Plans:

- [x] 11-01-PLAN.md — TRUTH-04: document the `AccDcRole`-empty → `AccRole` role-name fallback + DC-conflict behavior in INTEGRATIONS.md (pure doc, wave 1)
- [x] 11-02-PLAN.md — TRUTH-01 (folded-in GUID fix): merge `AccProject` names into `loadFolderActivityProjects`, "Unknown project" fallback, never a raw GUID; pure resolver unit-pinned (wave 1)
- [x] 11-03-PLAN.md — TRUTH-02: add `dataFloor`/`floorByProject` to the `loadActivityTimeline()` RSC + "Data available from [Mon YYYY]" caption + per-project hover floor; migrate both callers (wave 1)
- [x] 11-04-PLAN.md — TRUTH-01 + TRUTH-03: live coverage header line (activity ~956/1,153 leads, DC ~550) + module-donut ⓘ Radix tooltip caveat + aligned INTEGRATIONS.md service note (wave 2, depends on 11-03)

**UI hint**: yes

### Phase 12: Integration Health & Observability

**Goal**: ACCDS session expiry is visible before crawl failures, `AccDcRole`-empty is a logged warning rather than a silent condition, and stale TODO[02.5] guards are removed.
**Depends on**: Phase 11
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):

  1. `scripts/progress-monitor.cjs` outputs `[WARN] ACCDS session expires in <N> hours` (or "session expired") before the token-refresh path runs; the health status is visible in the progress monitor web app on `localhost:4321`
  2. `lib/server/acc-hot-cache.ts` emits a `console.warn` (or equivalent structured log) when `AccDcRole` is still empty after a cache refresh, making a silent `AccRole`-sync failure observable in the server log
  3. `lib/acc/acc-admin.ts` no longer contains the two `TODO[02.5]` defensive-logging guards at lines 51 and 207; field names are confirmed against the live schema before removal

**Plans**: 2 plans

- [x] 12-01-PLAN.md — OBS-01: `getSessionHealth()` helper in `lib/acc/accdsToken.ts` + crawl-side startup `[WARN]` preflight in `scripts/accds-activity-ingest.cjs` + always-on session-health line on the `:4321` monitor (`scripts/progress-monitor.cjs`); local cookie-expiry read, <12h threshold, estimate-labeled (wave 1) — COMPLETE 2026-06-30
- [x] 12-02-PLAN.md — OBS-02 + OBS-03: effective-empty `[ACC-ROLES]` warn at the real role-resolution boundary `loadInstanceView()` in `lib/server/accessInstanceView.ts` (NOT acc-hot-cache.ts); remove stale `TODO[02.5]` diagnostics from `lib/server/acc-admin.ts` (verified path; fields confirmed code-grounded) (wave 1) — COMPLETE 2026-06-30, commits cac1a07e + 72b4079d

**Note**: OBS-02/OBS-03 paths corrected from the roadmap success criteria — verified injection point is `lib/server/accessInstanceView.ts` (`acc-hot-cache.ts` does not reference `AccDcRole`), verified diagnostics location is `lib/server/acc-admin.ts` (not `lib/acc/`). OBS-02 fires on effective-empty (both sources zero), not the by-design `AccDcRole`-empty state.

### Phase 13: Type-Safety Guards

**Goal**: `bulkUsers` lean-payload consumers cannot silently expect populated roles/modules arrays, and the `accGraphFilters` union types cannot drift without a compile-time failure.
**Depends on**: Phase 10
**Requirements**: TYPE-01, TYPE-02
**Success Criteria** (what must be TRUE):

  1. The `bulkUsers` return type in `server/routers/acc-members.ts` marks `roles` and `modules` as `never[]` (or equivalent) with an explicit "lean payload — always empty" comment; `npx tsc --noEmit` passes
  2. `app/(dashboard)/users/accGraphFilters.ts` contains a `satisfies` or `AssertExtends` compile-time assert that fails if the two filter union types drift; `npx tsc --noEmit` confirms the assert compiles

**Plans**: 1/1 plans complete

- [x] 13-01-PLAN.md — TYPE-01: type the lean `bulkUsers` return `roles`/`modules` as `never[]` at the verified construction site `lib/server/acc-hot-cache.ts` (`getCachedAccDcBulkUsers` lean branch) — NOT `acc-members.ts`, which has no `bulkUsers` proc; + TYPE-02: one-directional subset drift assert (`SimilarityDimKey` ⊆ `SimilarityDim`) with a type-only import in `app/(dashboard)/users/accGraphFilters.ts` (wave 1)

### Phase 14: Characterization Tests

**Goal**: The access-analysis monoliths and the shared terrain query have pinning tests that make the deferred splits safe; the monolith files carry split-pending warning comments.
**Depends on**: Phase 10
**Requirements**: TEST-02, TEST-03
**Success Criteria** (what must be TRUE):

  1. Vitest characterization tests exist for the tRPC-boundary outputs and pure transforms of `FolderPermissionTerrain.tsx`, `folderTerrain.ts`, and/or `HybridAnalyticsSurface.tsx`; the tests cover at least the primary transform entry points and assert stable output shapes
  2. Each of the three monolith files (`FolderPermissionTerrain.tsx`, `folderTerrain.ts`, `HybridAnalyticsSurface.tsx`) carries a `// SPLIT-PENDING:` warning comment at the top referencing REF-01
  3. A characterization test pins the shared `AccFolderPermission` terrain query output (the join pattern used by both `/template-mty` and `/access-analysis`); the test asserts stable column count and row-bound; the test file references REF-02 as the deferred extraction target
  4. `npm test` passes with all new characterization tests included

**Plans**: 2/2 plans complete

- [x] 14-01-PLAN.md — TEST-02: golden-master `loadFolderPermissionTerrain` / `loadFolderPermissionOverview` (+ `loadTerrainProjects` shape pin) in `lib/server/__tests__/folderPermissionTerrainView.test.ts`; add `// SPLIT-PENDING:` REF-01 comments to the three monoliths + REF-02 comment on `folderPermissionTerrainView.ts` (wave 1)
- [x] 14-02-PLAN.md — TEST-03: pin the shared `AccFolderPermission` terrain-query contract (5-column set + row-bound + project scope, references REF-02) via `loadTemplateFolderTerrain` in `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts`; add `// SPLIT-PENDING:` REF-02 comment on `templateFolderTerrain.ts` (wave 1)

---

## ✅ v2.2 Structural Refactors (Complete — 2026-07-02)

**Milestone goal:** Execute the deferred structural refactors now safe behind v2.1's golden-master tests — extract the shared `AccFolderPermission` join to `lib/server/folderPermQuery.ts`, split the three access-analysis monoliths (`folderTerrain.ts`, `FolderPermissionTerrain.tsx`, `HybridAnalyticsSurface.tsx`) into data-hook / pure transform / thin-view modules, and materialise an `AccFolderPermissionSummary` projection to retire the raw ~5M-row scan path — with zero change to what the workshop pages show.

**Source requirements:** `.planning/REQUIREMENTS.md` (v2.2, 8 requirements: QUERY-01, SPLIT-01–04, PROJ-01–03)

**Overarching guardrail:** behavior-preserving. Characterization tests (TEST-01, TEST-02, TEST-03) stay green and byte-identical after every phase; `/access-analysis`, `/template-mty`, and `/users/access-analysis` render identically; `/users/spatial-graph` is not touched.

## Phases

- [x] **Phase 15: Shared Query Extraction** - Extract the base `AccFolderPermission` join to `lib/server/folderPermQuery.ts`; both terrain routes import from it; TEST-03 contract passes byte-identical — COMPLETE 2026-07-01
- [x] **Phase 16: folderTerrain Monolith Split** - Split `folderTerrain.ts` (1,096 lines) and `FolderPermissionTerrain.tsx` (1,044 lines) into data-hook / pure transform / thin-view modules; TEST-02 golden masters pass byte-identical; `/access-analysis` renders identically (completed 2026-07-01)
- [x] **Phase 17: HybridAnalyticsSurface Split** - Widen the `HybridAnalyticsSurface` characterization net to pin the DuckDB-Wasm main path (SPLIT-03), then split the 1,328-line file (SPLIT-04); all characterization tests pass byte-identical; `/users/access-analysis` renders identically (completed 2026-07-02, test-basis parity — no live mount)
- [x] **Phase 18: AccFolderPermissionSummary Foundation** - Add `AccFolderPermissionSummary` Prisma model + migration + backfill script + reconciliation proof that projection matches the live aggregate; no consumer switched yet — COMPLETE 2026-07-02 (reconciliation PASS; phase-goal verifier PASSED 6/6, `18-VERIFICATION.md`)
- [x] **Phase 19: Raw Scan Retirement & Refresh** - Switch the `includePermissionSummary` consumer to `AccFolderPermissionSummary`, hard-guard the `includePermissionContexts:true` raw-scan branch, and wire a refresh mechanism into the ingest cron; document staleness bound in INTEGRATIONS.md (COMPLETE 2026-07-02: 19-01 PROJ-02 + 19-02 PROJ-03; terrain correctly scoped OUT with evidence — stays on `folderPermQuery.ts`; owner visual parity on /access-analysis + /template-mty APPROVED after :3000 rebuild; gsd-verifier PASSED 10/10)

## Phase Details

### Phase 15: Shared Query Extraction

**Goal**: The base `AccFolderPermission` join lives in a single owned module (`lib/server/folderPermQuery.ts`), both terrain routes import from it instead of duplicating the SQL, and TEST-03 (`templateFolderTerrain.sharedQuery.test.ts`) passes byte-identical with no changes to the test file.
**Depends on**: Phase 14
**Requirements**: QUERY-01
**Success Criteria** (what must be TRUE):

  1. `lib/server/folderPermQuery.ts` exists and owns the 5-column `AccFolderPermission` join (row-bound, project-scoped, null-path handling) previously duplicated across `templateFolderTerrain.ts` and `folderPermissionTerrainView.ts`
  2. Both `lib/server/templateFolderTerrain.ts` and `lib/server/folderPermissionTerrainView.ts` import the base join from `lib/server/folderPermQuery.ts`; no duplicated join SQL remains in either source file
  3. `templateFolderTerrain.sharedQuery.test.ts` (TEST-03) passes byte-identical — zero changes to the test file itself; `npm test` is green
  4. `npx tsc --noEmit` exits with 0 errors after the extraction
  5. `/template-mty` and `/access-analysis` render identically to pre-phase (owner visual check)

**Plans**: 1 plan

Plans:

- [x] 15-01-PLAN.md — QUERY-01: create `lib/server/folderPermQuery.ts` (shared base join via `loadFolderPermRows(projectId, { l2Only })`), rewire `templateFolderTerrain.ts` (all-folders) + `folderPermissionTerrainView.ts` (l2Only), verify TEST-02/TEST-03 byte-identical, tsc clean, owner visual parity — COMPLETE 2026-07-01 (commit a4d923ca)

### Phase 16: folderTerrain Monolith Split

**Goal**: `folderTerrain.ts` (1,096 lines) and `FolderPermissionTerrain.tsx` (1,044 lines) are each decomposed into a pure transform module and a thin orchestrator/view; no single resulting file exceeds ~400 lines; TEST-02 golden masters (`loadFolderPermissionTerrain`, `loadFolderPermissionOverview`, `loadTerrainProjects`) pass byte-identical; `/access-analysis` renders identically.
**Depends on**: Phase 15
**Requirements**: SPLIT-01, SPLIT-02
**Success Criteria** (what must be TRUE):

  1. `app/(dashboard)/access-analysis/folderTerrain.ts` is replaced by a pure transform module and a thin orchestrator; no single resulting file exceeds ~400 lines
  2. `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` is replaced by a data-hook, a pure transform module, and a thin presentational view; no single resulting file exceeds ~400 lines
  3. `folderPermissionTerrainView.test.ts` (TEST-02) golden masters (`loadFolderPermissionTerrain`, `loadFolderPermissionOverview`, `loadTerrainProjects`) pass byte-identical after the split — zero changes to the test file
  4. `FolderPermissionTerrain.test.tsx` and all terrain golden masters remain green; `npm test` passes
  5. `npx tsc --noEmit` exits clean; `/access-analysis` renders identically to pre-phase (owner visual check)

**Plans**: 2/2 plans complete — owner visual parity CONFIRMED 2026-07-01 (both pages verified on fresh :3000 build `224519a4`); phase-goal verifier PASSED 12/12

Plans:

- [x] 16-01-PLAN.md — SPLIT-01: split the pure `folderTerrain.ts` (1,096 lines) into `folderTerrainModel` / `folderTerrainLayout` / `folderTerrainScene` / `folderTerrainCamera` + a thin barrel; direct pins `folderTerrain.test.ts` + TEST-02 byte-identical, tsc clean, no file > ~400 lines, owner parity on /access-analysis + /template-mty (wave 1)
- [x] 16-02-PLAN.md — SPLIT-02: fixed the 2 pre-existing `FolderPermissionTerrain.test.tsx` WIP failures first (root-cause: folder-label over-pruning + a ground-plane polygon miscount), then split the 1,046-line component into `useFolderPermissionTerrainCamera` (hook) + `terrainViewModel` (pure transforms) + `TerrainStage` + `TerrainControls` (presentational) + thin shell; `FolderPermissionTerrain.test.tsx` fully green (13/13) + byte-identical, TEST-02 green, tsc clean, all 5 files ≤ ~400 lines — commits `0dbae11f`/`40126798`/`224519a4`; owner parity on /access-analysis + /template-mty CONFIRMED 2026-07-01 (fresh :3000 rebuild) (wave 2, depends on 16-01)

### Phase 17: HybridAnalyticsSurface Split

**Goal**: The main DuckDB-Wasm query path in `HybridAnalyticsSurface.tsx` is pinned by a characterization test before any code is moved (SPLIT-03 gate), then the 1,328-line file is split into a DuckDB-client data-hook / pure transform / thin view (SPLIT-04); all characterization tests pass byte-identical; `/users/access-analysis` renders identically.
**Depends on**: Phase 16
**Requirements**: SPLIT-03, SPLIT-04
**Success Criteria** (what must be TRUE):

  1. A new or expanded characterization test covering `HybridAnalyticsSurface.tsx`'s main DuckDB-Wasm query path is committed and `npm test` is green BEFORE any split begins — SPLIT-03 gate is met at this point
  2. `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` is split into a DuckDB-client data-hook + a pure transform module + a thin view; no single resulting file exceeds ~400 lines
  3. The SPLIT-03 DuckDB-Wasm characterization test AND `HybridAnalyticsSurface.fallback.test.tsx` both pass byte-identical after the split — zero changes to either test file
  4. `npx tsc --noEmit` exits clean after the split
  5. `/users/access-analysis` renders identically to pre-phase (owner visual check); `/users/spatial-graph` is not touched

**Plans**: 2/2 plans complete — parity accepted on the byte-identical-DOM-golden-test basis (no live route mounts the surface; owner visual review remains open)

Plans:

- [x] 17-01-PLAN.md — SPLIT-03 (wave 1, autonomous): add `HybridAnalyticsSurface.mainQuery.test.tsx` pinning the DuckDB-Wasm READY path (getDuckDbClient resolves + runGraphAnalyticsQueries returns `ready` → DuckDB-Wasm badge + Mosaic panels); keep the fallback pin byte-identical; commit green baseline BEFORE any split — COMPLETE 2026-07-02 (commit b6084f5f)
- [x] 17-02-PLAN.md — SPLIT-04 (wave 2, depends_on 17-01): split `HybridAnalyticsSurface.tsx` (1,328 lines) into `useHybridAnalytics.ts` (DuckDB-client hook, 311L) + `hybridAnalyticsTransforms.ts` (pure, 229L) + presentational view/drilldown/panels (`hybridAnalyticsPanels.tsx`, `HybridAnalyticsView.tsx`, `HybridAnalyticsPostureSection.tsx`, `HybridAnalyticsRankingsSection.tsx`, `HybridAnalyticsDrilldown.tsx`) + thin shell (196L, still exports zero-arg `HybridAnalyticsSurface()`); both pinning tests byte-identical + green (4/4), every file ≤ ~400 lines, tsc clean, repo-map boundary check passed — COMPLETE 2026-07-02 (commits `e0bb6e66`/`da2f230b`). Parity accepted on the byte-identical-DOM-golden-test basis (how-to-verify step 3) because no live route mounts the surface (`/users/access-analysis` redirects to `/users/spatial-graph`); owner visual sign-off did NOT occur and remains open for later review.

### Phase 18: AccFolderPermissionSummary Foundation

**Goal**: An `AccFolderPermissionSummary` Prisma model is live in the local PostgreSQL database, populated by a backfill script, and a reconciliation script confirms the projection matches the live `includePermissionSummary` GROUP BY aggregate (row counts + spot-checked keys) — no consumer is switched in this phase; behavior is unchanged.
**Depends on**: Phase 15
**Requirements**: PROJ-01
**Success Criteria** (what must be TRUE):

  1. `AccFolderPermissionSummary` Prisma model + migration exists; the migration applies cleanly to the local PostgreSQL database (via `prisma migrate dev` or a manual raw migration registered with `prisma migrate resolve`)
  2. A backfill script populates `AccFolderPermissionSummary` from `AccFolderPermission` without OOM or timeout; TEST-01 (OOM aggregate guard) passes throughout the backfill run
  3. A reconciliation script confirms projection row counts + spot-checked folder/role/project keys match the live `includePermissionSummary` GROUP BY aggregate; the reconciliation result (match/mismatch summary) is recorded in a script log or planning note
  4. No consumer of `includePermissionSummary` or `includePermissionContexts` is changed in this phase — zero behavior change to `/access-analysis` or `/template-mty`
  5. `npx tsc --noEmit` exits clean after the model and script additions

**Plans**: 1/1 plan complete — reconciliation PASS (22,082 == 22,082 rows, 0 mismatches, 20/20 spot-checks); phase-goal verifier PASSED 6/6 (`18-VERIFICATION.md`, all gates independently re-run) — Phase 18 CLOSED 2026-07-02

Plans:

- [x] 18-01-PLAN.md — PROJ-01: add `AccFolderPermissionSummary` Prisma model + migration (pgvector-safe raw + `migrate resolve` fallback), server-side `INSERT...SELECT...GROUP BY` backfill (`folderCrawlStatus IN ('ok','partial')`, OOM-safe, TEST-01 green), and a reconciliation script proving projection == live aggregate (row counts + 0 mismatches + spot-checked keys) recorded in `18-RECONCILIATION.md`; no consumer switched; tsc clean — COMPLETE 2026-07-02 (commits `77909b10`/`9d55539c`/`fb8ba765`) (wave 1)

### Phase 19: Raw Scan Retirement & Refresh

**Goal**: All terrain consumers and the permission-summary path read from `AccFolderPermissionSummary`; the `includePermissionContexts:true` raw-scan branch in `lib/server/acc-hot-cache.ts` is retired or hard-guarded; a refresh mechanism keeps the projection current; TEST-01 and all terrain golden masters pass; `/access-analysis` and `/template-mty` render identically.
**Depends on**: Phase 18
**Requirements**: PROJ-02, PROJ-03
**Success Criteria** (what must be TRUE):

  1. All `includePermissionSummary` consumers in `lib/server/acc-hot-cache.ts` and terrain files read from `AccFolderPermissionSummary`; the `includePermissionContexts:true` raw-scan branch is removed or behind a hard guard that throws on activation
  2. TEST-01 (OOM aggregate guard) and all terrain golden masters (TEST-02) pass after the consumer switch; `npm test` is green
  3. `/access-analysis` and `/template-mty` render identically to pre-phase (owner visual check)
  4. A refresh mechanism is wired into the `dc-daily-ingest.cjs` cron path or documented as an explicit rebuild step; the staleness bound is documented in `.planning/codebase/INTEGRATIONS.md`
  5. `npx tsc --noEmit` exits clean after all consumer and cron/refresh changes

**Plans**: 2/2 plans complete (19-02 Task 2 owner visual parity APPROVED 2026-07-02 after fresh :3000 rebuild)

Plans:

- [x] 19-01-PLAN.md — PROJ-02 (wave 1, autonomous): switch the `includePermissionSummary` aggregate in `getCachedAccDcBulkUsers` to read `AccFolderPermissionSummary` (byte-identical Map); hard-guard the `includePermissionContexts:true` raw scan to throw unless `ACC_ALLOW_RAW_PERMISSION_SCAN=1`; update the 3 summary/contexts tests; TEST-02 terrain golden masters stay byte-identical (terrain scoped OUT — it needs per-folder tier the rollup lacks; evidence in plan). Gates: tsc + npm test + `verify-folder-perm-summary.cjs` PASS.
- [x] 19-02-PLAN.md — PROJ-03 (wave 2, depends_on 19-01, checkpoint): wire a non-fatal refresh (reuse `scripts/backfill-folder-perm-summary.cjs`) into the `dc-daily-ingest.cjs` success branch, ordered before `build-instance-features.ts`; document the ≤1-ingest-cycle staleness bound + folder-crawl caveat + manual fallback in `.planning/codebase/INTEGRATIONS.md`; owner visual parity on `/access-analysis` + `/template-mty` after a fresh :3000 rebuild. **Task 1 DONE (commit `e34ec7e7`); Task 2 (checkpoint:human-verify) APPROVED 2026-07-02 (commit `a92ffe0d`) — tsc 0, `npm run build` 0, task restarted, /api/health 200, workshop routes 307, owner confirmed identical render.**

**Boundary note (planner, evidence-backed):** SC#1's "terrain files read from `AccFolderPermissionSummary`" is a conflation — the terrain views read PER-FOLDER tier via `folderPermQuery.ts`, whereas the projection is a per-`(projectId,roleId)` rollup with no per-folder detail. Forcing terrain onto the projection would lose granularity and break TEST-02. PROJ-02 therefore switches only the summary aggregate the projection genuinely mirrors; terrain stays on `folderPermQuery.ts`. A per-folder terrain projection is a future-milestone seed, not Phase 19.

---

## ✅ v2.3 New Graphs (Shipped — 2026-07-14)

**Milestone goal:** Add new truthful charts to `/access-analysis` (and `/template-mty` only
where a genuine non-duplicative fit exists) from existing-but-unvisualized Prisma data,
following the established panel registration pattern (`lib/server/<name>View.ts` loader →
pure `*Counts.ts` transform with a co-located test → `"use client"` chart via
`@/components/ui/EChart` → `AccessAnalysisCharts.tsx` `<Reveal><PremiumSurface>`) — no new
npm dependencies, no new WebGL, honest coverage labels throughout.

**Source requirements:** `.planning/REQUIREMENTS.md` (v2.3, 8 requirements: ISSUE-01–05, PERM-01, ENG-01, PIPE-01)

**Research:** `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md` (2026-07-02,
confidence HIGH). Build order is risk-graded (small/materialized tables first, the one
external-call + migration-risk item isolated in its own phase, workshop curation last) —
not feature-request order. 5 of the original 9 seed candidates were promoted into this
milestone's 8 requirements (one seed — "issues over time/by status/by type" — split into
ISSUE-02/03/05 plus the new ISSUE-04 GUID-resolution requirement); the remaining 4 seeds
are deferred (see `REQUIREMENTS.md` "Future Requirements").

**Overarching guardrail:** every panel follows the registration pattern; `AccDcIngestRun.rowsByModule`
is never charted (confirmed always-zero telemetry gap); `AccFolderPermissionSummary.totalBytes`
(BigInt) is converted to `Number`/a formatted string server-side before the RSC→client boundary;
the "Never signed in" (`lastSignIn: null`) bucket is always labeled, never silently dropped;
issue type/subtype GUIDs never render raw — unresolved IDs get an honest fallback label
("Unknown type"); aggregates over `AccActivityAccds`/`AccActivity`/`AccFolder`-scale tables use
server-side SQL/`groupBy`, never `findMany` + JS reduce; existing characterization tests
(TEST-01/02/03) stay green and byte-identical; `/users/spatial-graph` is untouched.

## Phases

- [x] **Phase 20: Foundation Wins & Engagement Panels** - Permission footprint by role, ingest freshness, issue-fetch coverage donut, and dormant-users-by-sign-in all land with zero shared-query risk (completed 2026-07-03)
- [x] **Phase 20.1: Access-Analysis IA Redesign & Panel Semantics (INSERTED)** - 6-tab IA, activity-recency/permission-volume semantic pivots, terrain on global picker, company-folder graph, scroll-jump fix; all six owner UAT items closed (completed 2026-07-04)
- [x] **Phase 21: Issue Funnel — Status & Time** - Full-issue-set timeline and status breakdown with cross-filter drill (completed 2026-07-06)
- [x] **Phase 21.1: Overview Tab UAT Follow-ups (INSERTED)** - Provisioned-modules chart, service-first attribution fix (+5-correction owner taxonomy review), activity-share-by-project donut; all 3 owner UAT items live, owner-approved (completed 2026-07-06)
- [x] **Phase 22: Issue Type Resolution** - APS issue-type/subtype metadata backfill + local lookup table, then an issues-by-type breakdown chart
- [x] **Phase 23: Workshop Curation & Milestone Close** - Panel count/grouping review across all new + existing surfaces, full gate sequence, rebuild + owner parity check

## Phase Details

### Phase 20: Foundation Wins & Engagement Panels

**Goal**: Four low-risk, high-value panels land on `/access-analysis` — permission reach by role, ingest freshness/throughput, issue-fetch coverage, and dormant-users-by-sign-in-recency — each reading an already-small or already-materialized table with zero shared-query risk, establishing the BigInt-conversion and honest-labeling conventions the rest of v2.3 reuses. These four requirements are grouped in one phase because they share almost no file surface beyond `mainCharts.tsx`/`AccessAnalysisCharts.tsx` (per ARCHITECTURE.md), so sequencing/grouping them avoids repeated merge contention on those two files across four separate phases.
**Depends on**: Phase 19 (v2.2, shipped) — first phase of v2.3, no intra-milestone dependency
**Requirements**: ISSUE-01, PERM-01, ENG-01, PIPE-01
**Success Criteria** (what must be TRUE):

  1. User can see a permission-reach-by-role chart (folder count + human-readable bytes, e.g. "42.3 GB") sourced from the already-materialized `AccFolderPermissionSummary` (22,082 rows); `totalBytes` is converted from `BigInt` to `Number`/a formatted string inside the server loader, verified by an actual live page load showing no serialization error (not just `tsc --noEmit`, which won't catch this).
  2. User can see a compact, visually secondary ingest-freshness panel showing the latest `AccDcIngestRun` (started/ended, status, duration, projects processed) with throughput measured from live `AccActivity` row counts grouped by `ingestRunId` — never from `rowsByModule` (confirmed always-zero); the panel does not live-poll (static per-page-load read).
  3. User can see an issue-fetch coverage donut with all 4 honest status buckets (`ok` / `zero_issues` / `forbidden` / `error`) sourced from the latest `AccIssueFetchRun`/`AccIssueProjectFetchResult` run, positioned so it frames trust ahead of the issue metrics rendered beside it (coverage precedes metric).
  4. User can see dormant users bucketed by `AccProjectMember.lastSignIn` recency bands (<30d / 30–90d / 90–365d / >365d), with an explicit, labeled "Never signed in" bucket for `null` values verified against at least one real project with a never-signed-in member — not silently dropped.
  5. All four panels render inside the zinc theme via `@/components/ui/EChart` with theme-resolved colors; `npx tsc --noEmit` passes; `mainCharts.tsx`'s `Promise.all` fan-out is reviewed for the +4 new entries (consolidated per data domain where sensible, not four independent top-level additions) and `/access-analysis` load time is spot-checked before/after.

**Plans**: 5/5 plans complete

Plans:

- [x] 20-01-PLAN.md — PERM-01: permission footprint by role (loader + formatBytes transform + horizontal-bar chart with role→project drill; BigInt→Number server-side)
- [x] 20-02-PLAN.md — ENG-01: dormant users by sign-in recency (**documented deviation**: `AccDcUser.lastSignIn` via `AccDcProjectUser` — the roadmap-named `AccProjectMember.lastSignIn` is live-verified 100% NULL/dead; DC-coverage scope label required)
- [x] 20-03-PLAN.md — ISSUE-01: issue-fetch coverage donut (extends `coordinationByProjectView.ts` in place with additive `issueCoverage`; 4 honest buckets, per-bucket project drill)
- [x] 20-04-PLAN.md — PIPE-01: ingest freshness strip (latest `AccDcIngestRun` + live `AccActivity` count by `ingestRunId`; open-string status badges; ~36h stale flag; account-wide)
- [x] 20-05-PLAN.md — Wiring + verification: mount 4 panels at locked positions, `mainCharts.tsx` fan-out 8→11, full gates + live-page-load checkpoint (BigInt, Never bucket, load-time spot-check)

**UI hint**: yes

### Phase 20.1: Access-Analysis IA Redesign & Panel Semantics (INSERTED)

**Goal:** `/access-analysis` is reorganized into 6 themed storytelling tabs (Overview · Roles · Users · Companies · Projects · Compare) behind ONE global project picker/FilterBanner, with the owner's Phase-20 UAT semantics delivered: activity-recency-by-role replaces sign-in recency, permission-volume-by-level replaces the byte footprint, the terrain folds into the Compare tab driven by the main search bar, a new folder-activity-by-company graph lands in the Companies tab, and the role-click scroll-jump is reproduced-then-fixed. Ph21-22 issue charts inherit an obvious home (Projects tab).
**Requirements**: UAT-2, UAT-3, UAT-4, UAT-5, UAT-6, UAT-7 (the six verbatim owner-UAT items from `20-05-SUMMARY.md` "UAT Feedback / Follow-ups"; no formal REQ-IDs — inserted urgent phase)
**Depends on:** Phase 20
**Plans:** 7/7 plans complete

Plans:

- [x] 20.1-01-PLAN.md — UAT-2 ENG-01 pivot: activityRecencyView loader + bands transform + role-stacked chart (unmounted)
- [x] 20.1-02-PLAN.md — UAT-3 PERM-01 reframe: permissionLevelView GROUP BY (verbatim permType) + top-10 stacked transform + chart (unmounted)
- [x] 20.1-03-PLAN.md — UAT-6 Folder activity by company: bounded two-pass loader (headline + lazy per-company folder drill) + chart (unmounted)
- [x] 20.1-04-PLAN.md — UAT-4 terrain externalSelectedIds/hidePickers props with 0/1/2+ mode derivation (backward-compatible)
- [x] 20.1-05-PLAN.md — UAT-7/UAT-4 tab IA: shell split into 6 tab panels, global picker pinned above tab strip, terrain in Compare tab, 33-test migration
- [x] 20.1-06-PLAN.md — Integration: mount the 3 new panels lazily per tab, remove sign-in/footprint panels + dead loaders, mainCharts fan-out 11→9
- [x] 20.1-07-PLAN.md — UAT-5 scroll-jump browser repro → minimal fix → Playwright regression pin + owner UAT re-check checkpoint (all six items)

**UI hint**: yes

### Phase 21: Issue Funnel — Status & Time

**Goal**: The full `AccIssue` set (17,360 issues, not just the coordination-classified subset) is visualized as a timeline and status breakdown on `/access-analysis`, reusing the trust-precedes-metric framing the Phase 20 coverage donut establishes.
**Depends on**: Phase 20 (issue-fetch coverage donut establishes the honest-coverage framing this funnel sits beside; also lets the fan-out review from Phase 20 land before adding a 5th loader)
**Requirements**: ISSUE-02, ISSUE-03
**Success Criteria** (what must be TRUE):

  1. User can see issues over time as a histogram/timeline (`date_trunc('month', "createdAt")`) covering the full issue set for the selected project(s), following the existing activity-timeline visual pattern (including a coverage caption sourced from the Phase 20 issue-fetch coverage loader, never a hardcoded figure).
  2. User can see issues by status — all 8 verified live statuses (open, closed, completed, in_review, draft, pending, not_approved, in_progress) — as a chart supporting the existing `onSliceClick`/`activeSlice` cross-filter/drill convention, matching the current pie/donut drill pattern.
  3. Both charts render an explicit "No issues for this view" empty state for a project with zero issues, rather than a blank or broken chart.
  4. `npm test` stays green including a new aggregate-bound Vitest test for the issue-funnel loader (asserting output row count is bounded by `n_status × n_projects`/`n_months × n_projects`, not raw issue rows); `npx tsc --noEmit` passes.

**Plans**: 4/4 plans executed — PHASE COMPLETE

Plans:

- [x] 21-01-PLAN.md — Server layer: issueFunnelView loader (month + status aggregate cuts, full issue set) + aggregate-bound test + lazy auth-gated action
- [x] 21-02-PLAN.md — Pure transforms: summarizeIssueStatus (8 fixed statuses + honest overflow) + deriveIssueCoverageCaption + unit tests
- [x] 21-03-PLAN.md — Components: IssueTimelineChart (monthly area line, no YoY) + IssueStatusChart (local-drill donut) + jsdom tests, unmounted
- [x] 21-04-PLAN.md — Wiring: lazy fetch-once Projects-tab branch, mount both charts below the coverage donut, full gates + owner live checkpoint — APPROVED live on :3100 preflight (.next-uat-21)

**UI hint**: yes

### Phase 21.1: Overview tab UAT follow-ups (INSERTED)

**Goal:** The 3 owner UAT items from the 21-04 checkpoint land on the `/access-analysis` Overview tab: (1) a provisioned-modules chart (member×project module access grants from `AccProjectMember.products` via `reduceModules` — full live-project coverage, NOT the DC subset), (2) the "Activity by module" attribution bug fixed service-first (`AccActivityAccds.serviceGroup`/`AccActivity.service` win where decisive, verb taxonomy falls back; ⓘ caveat states the live attribution split; quantified before/after evidence for the owner — honest framing: real movement is small, the stale "~966 Model Coordination" figure was already fixed by commit `6164cfae`), and (3) an "Activity share by project" donut (top-10 + Other, click-to-drill module breakdown, Account-level bucket excluded) derived from the already-loaded `loadModuleActivity` rows with zero new loader. Two new panels mount as a 2-up row between "Activity by module" and "Ingest freshness".
**Requirements**: UAT-21.1-01 ✅, UAT-21.1-02 ✅, UAT-21.1-03 ✅ — ALL 3 COMPLETE, owner-approved live on `:3100` 2026-07-06 (final verdict: "approved BUT move sheets and friends to the Build module" — applied as gap-closure correction 5; see `21.1-04-SUMMARY.md`). (The 3 verbatim owner items from `21-04-SUMMARY.md` "UAT Feedback / Follow-ups"; no formal REQ-IDs — inserted urgent phase)
**Depends on:** Phase 21
**Plans:** 4/4 plans complete

Plans:

- [x] 21.1-01-PLAN.md — UAT-21.1-02 service-first attribution fix: classifyActivity(rawAction, service) narrow override + union SQL preserves serviceGroup/service + ModuleSummary attribution counters + live before/after delta note (wave 1)
- [x] 21.1-02-PLAN.md — UAT-21.1-01 provisioned modules: AccProjectMember loader (aggregate-bound) + summarizeProvisionedModules + horizontal-bar chart with project drill, unmounted (wave 1)
- [x] 21.1-03-PLAN.md — UAT-21.1-03 activity share by project: summarizeProjectActivity (top-10+Other, Account-level excluded) + local-drill donut, zero new loader, unmounted (wave 1)
- [x] 21.1-04-PLAN.md — Wiring + owner checkpoint: mainCharts fan-out 9→10, picker-only memos, 2-up Overview row, live-split caveat copy, full gates + `:3100` preflight checkpoint (wave 2)

### Phase 22: Issue Type Resolution

**Goal**: Issue type/subtype GUIDs resolve locally to human-readable names via a one-time APS issue-types metadata backfill into a new Prisma lookup table, and issues-by-type renders as a top-N + "other" breakdown chart — never a raw GUID. This phase is kept isolated because it is the only v2.3 phase carrying external-API-call + Prisma-migration risk (per ARCHITECTURE.md/PITFALLS.md); ISSUE-04 (backfill + lookup table) must land and be verified before ISSUE-05 (the chart) is built.
**Depends on**: Phase 21 (issues-by-status/time established; type breakdown is the remaining issue cut, and this phase's higher risk is deliberately sequenced after the safer funnel work)
**Requirements**: ISSUE-04, ISSUE-05
**Success Criteria** (what must be TRUE):

  1. A new Prisma lookup table exists, populated by a one-time APS issue-types metadata backfill (existing 3-leg auth, `acc-issues-backfill.cjs` pattern) covering the verified 316 type / 515 subtype GUIDs; the backfill and lookup table are additive — no edit to `AccIssue`'s existing columns or any existing issue query.
  2. ISSUE-04 (backfill + lookup table, committed and verified) lands as a separate, earlier plan than ISSUE-05 (the chart) within this phase — the migration/backfill risk is resolved before the chart is built on top of it.
  3. User can see issues by type as a breakdown chart (top-N + "other" bucketing) with every `issueTypeId` resolved to a human-readable name via the new lookup table.
  4. Any `issueTypeId`/`issueSubtypeId` not resolved by the lookup table renders an honest fallback label ("Unknown type") — never a raw GUID — verified against at least one live unresolved ID if one exists in the dataset.
  5. `npm test` stays green (existing suite + any new lookup-table/transform tests); `npx tsc --noEmit` passes.

**Plans**: 3/3 plans executed

Plans:

- [x] 22-01-PLAN.md — ISSUE-04: `AccIssueType` Prisma model + migration (migrations-raw fallback armed), `scripts/acc-issue-types-backfill.cjs` clone (3-leg auth, --dry-run field-shape validation), live run + resolved/total GUID evidence (wave 1)
- [x] 22-02-PLAN.md — ISSUE-05 data layer: `loadIssueFunnel()` third cut (2nd groupBy + lookup findMany joined in JS — preserves the queryRaw single-call test pin) + `issueTypeCounts.ts` top-N/Other transform with distinct "Unknown type"/"No type set" buckets (wave 2)
- [x] 22-03-PLAN.md — ISSUE-05 UI: `IssueTypeChart.tsx` (horizontal bars, expand-in-place Other, local per-project drill, live coverage captions) mounted below IssueStatusChart (wave 3). Code shipped 2026-07-10 (`a01872fd`, `65871f56`); closed 2026-07-14 on live-`:3000` evidence — the `:3100` preflight checkpoint was never run, see 22-03-SUMMARY.md

**UI hint**: yes

### Phase 23: Workshop Curation & Milestone Close

**Goal**: All new v2.3 panels are reviewed as a whole against the existing `/access-analysis` panel surface for count, grouping, and above-the-fold priority, and the full gate sequence (tests, typecheck, rebuild) confirms the milestone is workshop-ready. This phase carries no new v1 requirement of its own — it is the milestone's mandatory curation + verification gate (PITFALLS.md Pitfall 7: shipping all new panels flat/always-visible dilutes the workshop narrative) that collectively closes out ISSUE-01–05, PERM-01, ENG-01, and PIPE-01.
**Depends on**: Phase 20, Phase 21, Phase 22 (all new panels must exist before the cumulative count/grouping question can be answered concretely)
**Requirements**: None new (milestone-closing gate — see Goal)
**Success Criteria** (what must be TRUE):

  1. `/access-analysis`'s total panel count and grouping is explicitly reviewed against the pre-v2.3 baseline (15 panels); the 7 new panels from Phases 20–22 (permission footprint, ingest freshness, issue coverage, dormant users, issue timeline, issue status, issue type) are grouped or made expandable/collapsible where the review finds the page would otherwise read as an undifferentiated wall of charts, rather than shipped flat by default.
  2. Owner visual parity/sign-off is captured on `/access-analysis` (and `/template-mty` if any v2.3 panel landed there) after a fresh `:3000` rebuild — Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart → `/api/health` 200 check.
  3. `npm test` is green — all existing characterization tests (TEST-01/02/03) stay byte-identical, plus every v2.3 aggregate-bound test added in Phases 20–22; `npx tsc --noEmit` exits 0.
  4. `git diff`/`node scripts/repo-map/check.cjs` confirms no new WebGL was introduced on `/access-analysis` and `/users/spatial-graph` was not touched by any v2.3 phase.

**Planner note (2026-07-14, evidence-backed — reinterprets SC#1):** SC#1 was written
2026-07-02, BEFORE Phase 20.1 (inserted) built the 6-tab IA. The tab IA **is** the answer to
the wall-of-charts risk, so SC#1 is a review-and-confirm item, not a build item — no
grouping/collapse scheme is manufactured, tab order does not change, panel counts are not
rebalanced, and no panel is cut (all REJECTED goals per `23-CONTEXT.md`). Curation is
within-tab ordering only, and a **zero-diff curation result is a legitimate PASS**. SC#1's
"7 new panels" count is also stale: the live inventory is **23 panels** (Overview 5, Roles 6,
Users 2, Companies 3, Projects 6, Compare 1), recounted from source in `23-RESEARCH.md` §A.
Sign-off scope is the FULL four-page workshop surface at graded depth (owner decision):
`/access-analysis` deep, `/users` deep (verify-only), `/template-mty` short functional,
`/forma-proposal` short visual.

**Plans**: 5/5 plans executed — PHASE COMPLETE, MILESTONE CLOSED
Plans:

- [x] 23-01-PLAN.md — Rebuild + deploy `:3000` via the MANUAL sequence (Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart → `/api/health` 200). MUST be first: `.next/BUILD_ID` (2026-07-13 16:13) predates HEAD (2026-07-14 09:31) and the workflow-tools donuts commit — the live surface is stale (wave 1)
- [x] 23-02-PLAN.md — Panel recount from source (23, not 22 — Roles has 6) + per-tab lead-panel verdict + the graph-by-graph owner review checklist (`23-REVIEW-CHECKLIST.md`), caveat column grounded in real honesty labels with file:line citations (wave 2)
- [x] 23-03-PLAN.md — **Owner sign-off checkpoint (blocking human gate)**: full four-page surface, graded depth, `IssueTypeChart` given explicit attention (only v2.3 panel with zero prior UAT). Findings triaged AT THE MOMENT RAISED — fix-now (no loader, no data) vs v2.4 seed. No Phase 23.1 (wave 3)
- [x] 23-04-PLAN.md — Gates + scope fence: refresh the stale repo-map dependency-cruiser baseline (currently exits 1 on 3 deleted-script refs from `b95bf5c7`), `npm test` + `npx tsc --noEmit`, TEST-01/02/03 byte-identical vs `v2.2`, no-new-WebGL + spatial-graph-untouched proofs, `23-VERIFICATION.md`, flip Phase 22 + 23 checkboxes (wave 4)
- [x] 23-05-PLAN.md — Milestone close: restored `.planning/MILESTONES.md` FIRST (tracked but deleted — v2.0/v1.0 history preserved, v2.3 entry appended), final `gsd-self-gate.cjs --phase 23 --route /users --rebuild` (rebuild+health+route checks PASS; only the known pre-existing STATE-count mismatch failed), `milestone complete v2.3` + manual STATE repair (frontmatter corruption live-reproduced again this run, repaired by hand — `state record-session` never invoked), PROJECT.md Active→Validated, ROADMAP v2.4 seeds, config reset (wave 5)

**UI hint**: yes

---

## 🚧 v2.4 Spatial Graph Dimensions (Active — opened 2026-07-14)

**Milestone goal:** Make every access-analysis dimension selectable on the spatial graph
(`/users/spatial-graph`, rendered by `AccessAnalysisShellClient` under
`app/(dashboard)/users/access-analysis/`), and make selecting one actually restructure the
graph — by unlocking dimension machinery that is already built, computed on every page
load, and currently discarded. No new data source, no new Prisma table, no new loader, no
new npm dependency.

**Source requirements:** `.planning/REQUIREMENTS.md` (v2.4, 18 requirements: DIM-01–06,
CAT-01–04, LAY-01–04, PERF-01–04)

**⚠️ Name collision:** `app/(dashboard)/access-analysis/` is the 23-panel charts page (v2.3's
surface, unchanged by v2.4). `app/(dashboard)/users/access-analysis/` is the **spatial-graph
shell** this milestone touches. `/users/spatial-graph` and `/users/access-analysis` render the
same UI.

**Overarching guardrail:** every phase preserves the zinc theme and resolves ECharts colors
from it, adds no new WebGL (the spatial graph already runs cosmos.gl — reviving its force
engine is not "new" WebGL, and no other data surface gains WebGL), and keeps under-covered
dimensions labeled, never hidden. `npx tsc --noEmit` before any rebuild; existing
characterization tests (TEST-01/02/03) stay green throughout.

## Phases

- [x] **Phase 24: Baseline & Dimension ID Unification** - Measure the honest first-paint baseline before anything else changes, then unify the catalog/registry dimension id-spaces so DIM-01/02 have one source to widen (completed 2026-07-14)
- [x] **Phase 25: Dimension Aperture — Group, Color & Filter** - Group-by, Color-by, and the filter chip toolbar all draw from the full available-dimension set, each with an honest coverage label (completed 2026-07-15; deployed BUILD_ID Vl7pXM_h_j5j2UrFGYd5Z)
- [ ] **Phase 26: Catalog Slider Wall** - The 208-dim `CatalogSliderSidebar` renders in production decoupled from the dead 3D flag, lazy-loads, is searchable, and greys unavailable dimensions with a reason
- [ ] **Phase 27: Layout Engine — Force-Anchor Revival & Reheat Guard** - Selecting a dimension restructures the graph organically via the previously-discarded force-anchor engine, with a reheat guard landing first as the safety net for the fragile cosmos.gl mechanism it reaches into
- [ ] **Phase 28: Performance Closeout & Verification** - DuckDB warm-up moves off the critical path, the lasso e2e test passes reliably (fixing the standing dev-server infra bug if it blocks the run), and first paint is re-measured against the Phase 24 baseline to prove no regression

## Phase Details

### Phase 24: Baseline & Dimension ID Unification

**Goal**: A first-paint baseline is captured before any other v2.4 change lands (the honest
number this milestone will be judged against), and the two divergent dimension id-spaces —
`groupByDimensions.ts`'s catalog ids and `nodeColors.ts`'s registry ids — resolve from one
unified source, so Phase 25's widening doesn't double the divergence it would otherwise
create.
**Depends on**: Phase 23 (v2.3, shipped) — first phase of v2.4, no intra-milestone dependency
**Requirements**: DIM-03, DIM-06
**Success Criteria** (what must be TRUE):

  1. A first-paint timing measurement for `/users/spatial-graph` is taken and recorded BEFORE any other v2.4 phase touches the surface, explicitly re-measuring rather than reusing the stale pre-milestone ~0.46s figure — this is the baseline Phase 28's PERF-04 regression check compares against.
  2. Group-by (`groupByDimensions.ts:10` `PRESETS`) and Color-by (`nodeColors.ts:62` `COLOR_MODES`) resolve their dimension option lists from a single unified id-space — the catalog-id/registry-id divergence described in REQUIREMENTS.md's "TWO ID-SPACES, NOT ONE" warning no longer exists as two independently-maintained arrays.
  3. `dimensionRegistry.ts`'s doc comment at `:317-322` no longer falsely claims `RUNTIME_DIMENSION_IDS` is "the single source of truth for what the runtime uses" — it either accurately states its real scope (color + filter chips, not grouping/sliders) or the registry/catalog split is collapsed entirely.
  4. `npx tsc --noEmit` passes; `npm test` stays green with no regression to existing dimension-related tests.

**Plans**: 2/2 plans complete

Plans:

- [x] 24-01-PLAN.md — Baseline measurement: committed script + spec measure first-paint and time-to-graph-rendered on isolated :3100 prod build (median-of-5), record committed as 24-BASELINE.md (wave 1)
- [x] 24-02-PLAN.md — Id-space unification: dimensionIdSpace.ts becomes the single source both pickers resolve from (catalog ids of record), pixel-identical UI, dimensionRegistry doc claim corrected (wave 2)

### Phase 25: Dimension Aperture — Group, Color & Filter

**Goal**: A user standing at `/users/spatial-graph` can Group-by, Color-by, and filter by
any of the already-computed node dimensions — not just the three hardcoded strings each
control was limited to before this milestone — and every dimension states its real data
coverage instead of pretending to be complete.
**Depends on**: Phase 24 (DIM-01/02 widen the now-unified id-space; widening two still-divergent
lists first was the explicitly-flagged trap)
**Requirements**: DIM-01, DIM-02, DIM-04, DIM-05
**Success Criteria** (what must be TRUE):

  1. User can group the spatial graph by any of the ~14 already-computed node dimensions from `featureSnapshot.ts:127-235` (company, permission tier, permission strength, folder breadth, activity volume, activity recency, sign-in recency, membership tenure, risk score, module signature, internal/external, admin/member, dominant activity mix) in addition to role/project/user.
  2. User can color the spatial graph by the same expanded dimension set via the Color-by control.
  3. User can filter the graph by any available dimension from the toolbar chips — the chip list no longer reads the separate 12-dim `SliderContext.DIMENSIONS` array; it draws from the same unified aperture Group-by/Color-by use.
  4. Every exposed dimension states its coverage honestly at the point of selection (tooltip/label) — DC-sourced dimensions show their ~550/1,153-project coverage, banded dimensions show their boundaries, and no under-covered dimension is silently presented as complete.

**Plans**: 3/3 plans complete

Plans:
- [x] 25-01-PLAN.md — Banded aperture + coverage foundation: add owner-palette dims to the catalog, label continuous tiers, node-derived coverage (wave 1)
- [x] 25-02-PLAN.md — Widen the shared aperture; Group-by + Color-by themed pickers, banded swatches + shared legend, inline coverage + active-dim caveat badge (wave 2)
- [x] 25-03-PLAN.md — Add-a-chip filter over the unified aperture: multi-select values-to-keep, retire SliderContext.DIMENSIONS, coverage in the dimension menu (wave 3)

**UI hint**: yes

### Phase 26: Catalog Slider Wall

**Goal**: The 208-dimension catalog sidebar — already written, tested, and never rendered
in production — actually shows up on `/users/spatial-graph`, independent of the dead 3D
flag that currently gates it, without becoming a first-paint cost or an unsearchable wall
of 189 sliders.
**Depends on**: Phase 24 (unified id-space so the sidebar, Group-by, and Color-by share one
dimension vocabulary)
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04
**Success Criteria** (what must be TRUE):

  1. `CatalogSliderSidebar.tsx` renders in production on `/users/spatial-graph`, decoupled from `NEXT_PUBLIC_ACC_3D_GRAPH` — that flag no longer gates the slider wall, only the still-parked 3D graph (`RightPanelStack.tsx:180-186`, `AccessAnalysisShell.tsx:492`).
  2. The 176-action catalog (`accTaxonomyActions.generated.ts`) is not iterated or initialized into slider state until the user actually opens the sidebar — verified by profiling initial render, not just code inspection — closing CONCERNS.md §3.3.
  3. User can search the ~189 available catalog dimensions by name in the sidebar and the list narrows to matches.
  4. The 19 `available:false` catalog dimensions render visibly greyed with a stated reason (never silently dropped from the list).

**Plans**: 2/2 plans complete

Plans:
- [x] 26-01-PLAN.md — Production rail seam: Grouping default + explicit Catalog preview, independent of the 3D flag (wave 1)
- [x] 26-02-PLAN.md — Lazy browse-only 208-entry wall: deferred actions, search, and inline unavailable reasons (wave 2)
**UI hint**: yes

**Plan-sequencing note (locked):** CAT-01 (flag decouple + production render) must land as
an earlier plan than CAT-02/03/04 in this phase — nothing else in this phase's scope is
observable in the live UI until the sidebar actually renders, per REQUIREMENTS.md's explicit
prerequisite note.

### Phase 27: Layout Engine — Force-Anchor Revival & Reheat Guard

**Goal**: Selecting a dimension physically restructures the spatial graph via the
force-anchor engine that is already computed every page load and currently thrown away —
and it does so without accidentally reheating the frozen cosmos.gl simulation, the
known-fragile mechanism this phase deliberately reaches into.
**Depends on**: Phase 25 (dimensions must be selectable before selecting one can
restructure anything), Phase 26 (the catalog slider wall is the primary control surface
driving `catalogTargets`/`catalogWeights`)
**Requirements**: LAY-01, LAY-02, LAY-03, LAY-04, PERF-02
**Success Criteria** (what must be TRUE):

  1. Selecting a dimension in Group-by/Color-by or a catalog slider restructures the graph organically via force anchors — nodes physically move toward dimension-based clumps/axes, not merely recolor a static projection.
  2. `catalogTargets`/`catalogWeights` (built every load at `AccessAnalysisShell.tsx:575-579`, currently discarded at the `:611-632` early return) are consumed by the live render path — dead compute becomes live compute.
  3. Dimension slider changes morph the layout continuously between structures (lerp), with no teleport and no frozen single-frame jumps.
  4. The layout stays organic at every slider position and dimension combination — never a fixed grid, at any point (standing owner constraint, previously violated and corrected).
  5. A slider change or clustering call cannot accidentally reheat the frozen cosmos.gl simulation (`enableSimulation:false` contract) — guarded by an explicit invariant check, closing CONCERNS.md §3.2 specifically because this phase's LAY-01/LAY-02 work reaches directly into that fragile mechanism.

**Plans**: TBD
**UI hint**: yes

**Plan-sequencing note (locked, risk mitigation):** build the PERF-02 reheat guard as an
early plan in this phase — a safety net landing before or alongside the LAY-01/LAY-02
force-anchor wiring, not after it and not in a separately-executed phase. LAY-01/LAY-02 and
PERF-02 touch the same fragile reheat mechanism (CONCERNS.md §3.2); splitting them across
independently-executed phases risks the two fighting each other.

### Phase 28: Performance Closeout & Verification

**Goal**: The remaining deferred spatial-graph performance debt closes out, and the
milestone proves — with a real re-measurement, not an assumption — that widening the
dimension surface across Phases 25–27 did not cost the page its first paint.
**Depends on**: Phase 27 (the finished layout/dimension feature set is what PERF-01/03/04
must be verified against)
**Requirements**: PERF-01, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):

  1. DuckDB-Wasm warm-up no longer blocks the render critical path — moved to idle-time (`requestIdleCallback`) or server-precomputed, not a blocking mount-time `useEffect` — closing CONCERNS.md §3.1.
  2. The 3D lasso e2e test (`tests/e2e/acc-3d-lasso.spec.ts`) passes reliably within its time budget on the owner's machine — closing CONCERNS.md §3.4. If the standing `next dev --webpack`/`--turbopack` infra bug blocks the run, that bug is fixed inside this phase first; this is called out as a phase-level risk, not assumed away.
  3. Spatial-graph first paint is re-measured after all v2.4 changes (Phases 24–27) and shown not to regress against the Phase 24 baseline — a real before/after comparison, not the stale pre-milestone ~0.46s figure.
  4. `npx tsc --noEmit` and `npm test` are green; existing characterization tests (TEST-01/02/03) remain byte-identical.

**Plans**: TBD

**Phase-level risk (flagged, not resolved by this roadmap):** PERF-03 may be blocked by the
standing Playwright/dev-server infra bug (`next dev --webpack` 500s every request on this
machine; `--turbopack` corrupts CSS on ~50% of cold boots — see REQUIREMENTS.md "Future
Requirements" and the v2.5 Seed Pool below). If the lasso e2e cannot run at all, PERF-03
cannot be verified until that infra bug is fixed — plan for the fix as a possible first task
in this phase.

---

## Progress

**Execution Order (v2.1):** 09 → 10 → 11 → 12 → 13 → 14
**Execution Order (v2.2):** 15 → 16 → 17 → 18 → 19
Note: Phase 18 depends on Phase 15 (shared query) but is independent of Phases 16–17 (monolith splits). The sequences 15→16→17 and 15→18→19 could run in parallel; they are ordered here for risk management on a solo workflow.
**Execution Order (v2.3):** 20 → 20.1 (inserted) → 21 → 21.1 (inserted) → 22 → 23 — risk-graded (small/materialized tables → issue funnel → external-call/migration-risk type-resolution → curation/close), not feature-request order; see `.planning/research/SUMMARY.md`.
**Execution Order (v2.4):** 24 → 25 → 26 → 27 → 28 — id-space unification and the honest first-paint baseline land first (foundation both later phases depend on); dimension aperture (25) and the catalog slider wall (26) both widen off that unified id-space and can be planned independently of each other, but the layout engine (27) needs both — something to select (25) and a control surface to select it from (26) — before it can restructure anything; the cosmos.gl reheat guard (PERF-02) is bundled into 27, not split out, because it protects the exact mechanism 27 reaches into; perf closeout (28) runs last because PERF-01/03/04 must be verified against the finished feature set, not a partial one.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 09. DB & Config Hardening | 2/2 | Complete | 2026-06-23 |
| 10. Layering & Boundary Fixes | 3/3 | Complete | 2026-06-23 |
| 11. Data-Truthfulness Labels | 4/4 | Complete | 2026-06-30 |
| 12. Integration Health & Observability | 2/2 | Complete | 2026-06-30 |
| 13. Type-Safety Guards | 1/1 | Complete | 2026-06-30 |
| 14. Characterization Tests | 2/2 | Complete | 2026-06-30 |
| 15. Shared Query Extraction | 1/1 | Complete    | 2026-07-01 |
| 16. folderTerrain Monolith Split | 2/2 | Complete    | 2026-07-01 |
| 17. HybridAnalyticsSurface Split | 2/2 | Complete (test-basis parity) | 2026-07-02 |
| 18. AccFolderPermissionSummary Foundation | 1/1 | Complete | 2026-07-02 |
| 19. Raw Scan Retirement & Refresh | 2/2 | Complete | 2026-07-02 |
| 20. Foundation Wins & Engagement Panels | 5/5 | Complete    | 2026-07-03 |
| 20.1. Access-Analysis IA Redesign & Panel Semantics (inserted) | 7/7 | Complete | 2026-07-04 |
| 21. Issue Funnel — Status & Time | 4/4 | Complete    | 2026-07-06 |
| 21.1. Overview Tab UAT Follow-ups (inserted) | 4/4 | Complete | 2026-07-06 |
| 22. Issue Type Resolution | 3/3 | Complete (live-evidence close) | 2026-07-14 |
| 23. Workshop Curation & Milestone Close | 5/5 | Complete | 2026-07-14 |
| 24. Baseline & Dimension ID Unification | 2/2 | Complete    | 2026-07-14 |
| 25. Dimension Aperture — Group, Color & Filter | 0/TBD | Not started | - |
| 26. Catalog Slider Wall | 0/TBD | Not started | - |
| 27. Layout Engine — Force-Anchor Revival & Reheat Guard | 0/TBD | Not started | - |
| 28. Performance Closeout & Verification | 0/TBD | Not started | - |

---

## 📦 v2.3 Seed Pool — Consumed (2026-07-02)

The full 9-candidate inventory and the panel registration pattern used to scope v2.3 are
now recorded in `.planning/REQUIREMENTS.md` (v2.3 section + "Future Requirements"), which
is the authoritative source going forward — this section is retired to a pointer.

5 of the 9 original seeds were promoted into the phases above (Phase 20-23): permission
footprint by role, ingest freshness/throughput, issue-fetch coverage donut, dormant users
by sign-in recency, and "issues over time/by status/by type" (split into ISSUE-02/03/05
plus the new ISSUE-04 GUID-resolution requirement).

4 seeds are deferred — see `REQUIREMENTS.md` "Future Requirements" for the per-item
deferral reason: folder storage treemap, permission tier × folder-depth heatmap, activity
verb/object-type breakdown, and provisioned-vs-active module coverage.

### Carried-forward deferred candidates (from v2.2 close, still deferred)

- **SVC-01** — `service`-override classification refinement (~966 clash-issue rows).
- **Spatial-graph milestone** — CONCERNS.md §3 + §8.2/8.3 items.
- **DC-01 / DC-02** — Account Admin provisioning unlock + DC CSV `activity_in_module` join.
- **Per-folder terrain projection** — only if terrain read cost becomes a concern (Ph19 boundary note).

---

## 📦 v2.5 Seed Pool (opened at v2.4 planning, 2026-07-14)

Candidates for the milestone after v2.4. v2.4 absorbed the spatial-graph performance/
fragility debt CONCERNS.md §3.1–3.4 into its own scope (Phases 27–28) — the old "Spatial-graph
milestone" entry from the prior seed pool is retired here, since it is now this milestone.
Everything below is either newly deferred by the v2.4 requirements pass (Tier 3 + pre-existing
findings from the v2.4 source audit, both recorded in `REQUIREMENTS.md` "Future Requirements")
or carried forward unresolved from v2.2/v2.3.

**Tier 3 — graph dimensions needing new data plumbing (deferred at v2.4 scoping):**

- **ISSUE-GRAPH-01** — slice the spatial graph by issue status/type/coordination flag.
  Blocked on measurement: `AccIssue.createdBy` (`prisma/schema.prisma:849`, `String?`) has no
  bridge to `AccDcUser` and an unmeasured resolution rate; needs a resolution-rate spike
  before it can be scheduled.

- **TIME-01** — temporal scrubber (activity/issues by month) on the spatial graph. Time is
  not a node attribute; needs a new interaction concept, not a dimension slot.

**Spatial-graph test debt (CONCERNS.md §8.2/8.3, deliberately still not in v2.4):**

- **TEST-SPLIT-01** — split the two >100KB spatial-graph physics/e2e test files
  (`physicsLayer.test.ts` 59KB, `GraphCanvas3D.test.ts` 45KB, `acc-dc-graph.spec.ts` 62KB).
  v2.4 scoped in §3.1–3.4 only, not §8.2/8.3.

**Pre-existing, surfaced during the v2.4 source audit (not introduced by it):**

- **COMPANY-GRAIN-01** — `accessInstanceView.ts:140` reads `AccDcProjectUserCompany`
  (per-membership) while `activityRecencyView.ts:139` reads `AccDcUser.companyId`
  (per-user, global); they disagree for any user whose company differs across projects.
  Affects `/access-analysis` panels 9/13 vs 14/15/16.

- **ORPHAN-01** — dead code imported by nothing live: `PresetBar.tsx`, `SliderGroup.tsx`,
  `SliderSidebar`, `dimensionSearch.ts`, `dimensionWeights.ts`; `SliderContext.applyPreset`
  is a stub calling `resetAll()`; `activePreset` hardcoded `null`; `nodeColors` branches 2–3
  unreachable. v2.4 may delete or revive some of these incidentally — whatever it touches
  should not leave new orphans, but a dedicated sweep is still a future candidate.

**Carried-forward v2.2/v2.3 candidates (standing, still deferred):**

- **SVC-01** — `service`-override classification refinement (~966 clash-issue rows).
- **DC-01 / DC-02** — unlock the 724 Data-Connector-403 projects via APS Account Admin
  provisioning; wire per-project roles/modules once the DC CSV `activity_in_module` /
  `total_activity` join lands.

- **Per-folder terrain projection** — the `AccFolderPermissionSummary` projection is a
  per-`(projectId,roleId)` rollup; a separate per-folder materialised projection could
  retire the terrain views' raw `$queryRaw` scan too — only if terrain read cost becomes a
  concern (Ph19 boundary note).

- **Folder storage treemap** — `AccFolder` rollups; needs depth-cap/leaf-rollup UX design
  (unreadable-treemap failure mode).

- **Permission tier × folder-depth heatmap** — new aggregation against the OOM-hardened
  `folderPermQuery.ts` path; needs its own perf regression test before scheduling.

- **Activity verb/object-type breakdown** — `AccActivityAccds` facets; needs top-N
  bucketing design; must carry the ~12-mo ACCDS floor label; must read raw columns (not
  spatial-graph taxonomy helpers — BND-03 boundary risk).

- **Provisioned-vs-active module coverage** — needs module-key vocabulary alignment
  (`products` Json vs activity module labels) or the "gap" is a labeling artifact;
  strictly no $-cost framing.

**Infra/tooling seeds (found during v2.3; the Playwright entry may be resolved by v2.4's
PERF-03 — verify at v2.4 close before re-listing):**

- **Playwright/dev-server infra fix** (carried from `20.1-07/deferred-items.md`):
  `playwright.config.ts`'s `webServer.command` and `package.json`'s `dev:next` script
  hardcode `next dev --webpack`, which 500s on every request on this machine/Next 16.2.6
  combination; `next dev --turbopack` is the only working dev-server option, but is itself
  deterministically flaky against `app/globals.css` (~50% of fresh-cache boots fail to
  parse CSS with garbled-Unicode Tailwind arbitrary-value selector errors). v2.4's Phase 28
  (PERF-03) may fix this as an in-phase prerequisite — if it does, retire this entry at v2.4
  close instead of carrying it forward again.

- **Phase 17 SPLIT-04 owner visual sign-off** (carried from v2.2 close, still open) —
  `HybridAnalyticsSurface.tsx`'s split was accepted on a byte-identical DOM-golden-test
  basis only; no production route mounts the surface (`/users/access-analysis` redirects
  to `/users/spatial-graph`). Revisit if/when the surface ever gets a live, unflagged mount.

- **MILESTONES.md v2.1/v2.2 backfill** — both v2.1 and v2.2 shipped but were never logged
  to `.planning/MILESTONES.md` before the v2.3 close restored the file. Low priority — both
  are fully recoverable from the `v2.1`/`v2.2` git tags and `PROJECT.md`'s "Shipped
  Milestone" history.

- **`.planning/` phase-directory archival** — deliberately deferred at the v2.3 close
  because the `.planning/` tree is mid-migration on this branch with ~450 files of
  unrelated dirty WIP. All 6 v2.3 phase directories remain at `.planning/phases/`.
