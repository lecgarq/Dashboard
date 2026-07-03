# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 ACC Graph** - Phases 01-06 (shipped ~2026-05)
- ✅ **v2.0 Workshop UI Overhaul** - Phases 01-07 (shipped 2026-06-19)
- ✅ **Phase 08 — Activity Re-extraction** (interim phase, shipped 2026-06-23)
- ✅ **v2.1 Concerns Hardening** - Phases 09-14 (shipped 2026-07-01)
- ✅ **v2.2 Structural Refactors** - Phases 15-19 (shipped 2026-07-02)
- 🚧 **v2.3 New Graphs** - Phases 20-23 (in progress, opened 2026-07-02)

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

## 🚧 v2.3 New Graphs (In Progress — opened 2026-07-02)

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

- [ ] **Phase 20: Foundation Wins & Engagement Panels** - Permission footprint by role, ingest freshness, issue-fetch coverage donut, and dormant-users-by-sign-in all land with zero shared-query risk
- [ ] **Phase 21: Issue Funnel — Status & Time** - Full-issue-set timeline and status breakdown with cross-filter drill
- [ ] **Phase 22: Issue Type Resolution** - APS issue-type/subtype metadata backfill + local lookup table, then an issues-by-type breakdown chart
- [ ] **Phase 23: Workshop Curation & Milestone Close** - Panel count/grouping review across all new + existing surfaces, full gate sequence, rebuild + owner parity check

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

**Plans**: 4/5 plans executed

Plans:

- [x] 20-01-PLAN.md — PERM-01: permission footprint by role (loader + formatBytes transform + horizontal-bar chart with role→project drill; BigInt→Number server-side)
- [x] 20-02-PLAN.md — ENG-01: dormant users by sign-in recency (**documented deviation**: `AccDcUser.lastSignIn` via `AccDcProjectUser` — the roadmap-named `AccProjectMember.lastSignIn` is live-verified 100% NULL/dead; DC-coverage scope label required)
- [x] 20-03-PLAN.md — ISSUE-01: issue-fetch coverage donut (extends `coordinationByProjectView.ts` in place with additive `issueCoverage`; 4 honest buckets, per-bucket project drill)
- [x] 20-04-PLAN.md — PIPE-01: ingest freshness strip (latest `AccDcIngestRun` + live `AccActivity` count by `ingestRunId`; open-string status badges; ~36h stale flag; account-wide)
- [ ] 20-05-PLAN.md — Wiring + verification: mount 4 panels at locked positions, `mainCharts.tsx` fan-out 8→11, full gates + live-page-load checkpoint (BigInt, Never bucket, load-time spot-check)

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

**Plans**: TBD

**UI hint**: yes

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

**Plans**: TBD

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

**Plans**: TBD

**UI hint**: yes

---

## Progress

**Execution Order (v2.1):** 09 → 10 → 11 → 12 → 13 → 14
**Execution Order (v2.2):** 15 → 16 → 17 → 18 → 19
Note: Phase 18 depends on Phase 15 (shared query) but is independent of Phases 16–17 (monolith splits). The sequences 15→16→17 and 15→18→19 could run in parallel; they are ordered here for risk management on a solo workflow.
**Execution Order (v2.3):** 20 → 21 → 22 → 23 — risk-graded (small/materialized tables → issue funnel → external-call/migration-risk type-resolution → curation/close), not feature-request order; see `.planning/research/SUMMARY.md`.

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
| 20. Foundation Wins & Engagement Panels | 4/5 | In Progress|  |
| 21. Issue Funnel — Status & Time | 0/TBD | Not started | - |
| 22. Issue Type Resolution | 0/TBD | Not started | - |
| 23. Workshop Curation & Milestone Close | 0/TBD | Not started | - |

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
