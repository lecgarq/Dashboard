# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 ACC Graph** - Phases 01-06 (shipped ~2026-05)
- ✅ **v2.0 Workshop UI Overhaul** - Phases 01-07 (shipped 2026-06-19)
- ✅ **Phase 08 — Activity Re-extraction** (interim phase, shipped 2026-06-23)
- ✅ **v2.1 Concerns Hardening** - Phases 09-14 (shipped 2026-07-01)
- 🚧 **v2.2 Structural Refactors** - Phases 15-19 (in progress)

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
Plans:

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
Plans:

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

## 🚧 v2.2 Structural Refactors (In Progress)

**Milestone goal:** Execute the deferred structural refactors now safe behind v2.1's golden-master tests — extract the shared `AccFolderPermission` join to `lib/server/folderPermQuery.ts`, split the three access-analysis monoliths (`folderTerrain.ts`, `FolderPermissionTerrain.tsx`, `HybridAnalyticsSurface.tsx`) into data-hook / pure transform / thin-view modules, and materialise an `AccFolderPermissionSummary` projection to retire the raw ~5M-row scan path — with zero change to what the workshop pages show.

**Source requirements:** `.planning/REQUIREMENTS.md` (v2.2, 8 requirements: QUERY-01, SPLIT-01–04, PROJ-01–03)

**Overarching guardrail:** behavior-preserving. Characterization tests (TEST-01, TEST-02, TEST-03) stay green and byte-identical after every phase; `/access-analysis`, `/template-mty`, and `/users/access-analysis` render identically; `/users/spatial-graph` is not touched.

## Phases

- [x] **Phase 15: Shared Query Extraction** - Extract the base `AccFolderPermission` join to `lib/server/folderPermQuery.ts`; both terrain routes import from it; TEST-03 contract passes byte-identical — COMPLETE 2026-07-01
- [x] **Phase 16: folderTerrain Monolith Split** - Split `folderTerrain.ts` (1,096 lines) and `FolderPermissionTerrain.tsx` (1,044 lines) into data-hook / pure transform / thin-view modules; TEST-02 golden masters pass byte-identical; `/access-analysis` renders identically (completed 2026-07-01)
- [ ] **Phase 17: HybridAnalyticsSurface Split** - Widen the `HybridAnalyticsSurface` characterization net to pin the DuckDB-Wasm main path (SPLIT-03), then split the 1,328-line file (SPLIT-04); all characterization tests pass byte-identical; `/users/access-analysis` renders identically
- [ ] **Phase 18: AccFolderPermissionSummary Foundation** - Add `AccFolderPermissionSummary` Prisma model + migration + backfill script + reconciliation proof that projection matches the live aggregate; no consumer switched yet
- [ ] **Phase 19: Raw Scan Retirement & Refresh** - Switch terrain consumers to `AccFolderPermissionSummary`, retire the `includePermissionContexts:true` raw-scan branch, and wire a refresh mechanism into the ingest cron; document staleness bound in INTEGRATIONS.md

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

**Plans**: 2 plans

Plans:

- [x] 17-01-PLAN.md — SPLIT-03 (wave 1, autonomous): add `HybridAnalyticsSurface.mainQuery.test.tsx` pinning the DuckDB-Wasm READY path (getDuckDbClient resolves + runGraphAnalyticsQueries returns `ready` → DuckDB-Wasm badge + Mosaic panels); keep the fallback pin byte-identical; commit green baseline BEFORE any split — COMPLETE 2026-07-02 (commit b6084f5f)
- [ ] 17-02-PLAN.md — SPLIT-04 (wave 2, depends_on 17-01): split `HybridAnalyticsSurface.tsx` (1,328 lines) into `useHybridAnalytics.ts` (DuckDB-client hook) + `hybridAnalyticsTransforms.ts` (pure) + presentational view/drilldown/panels + thin shell; both pinning tests byte-identical, every file ≤ ~400 lines, tsc clean, repo-map boundary check, owner visual parity (VERIFY route/flag)

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

**Plans**: TBD

Plans:

- [ ] 18-01: PROJ-01 — add `AccFolderPermissionSummary` Prisma model + migration + backfill script + reconciliation script; confirm row counts and spot-checked keys match live aggregate; tsc clean

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

**Plans**: TBD

Plans:

- [ ] 19-01: PROJ-02 — switch `includePermissionSummary` consumers to read from `AccFolderPermissionSummary`; retire or hard-guard `includePermissionContexts:true`; verify TEST-01 + TEST-02 golden masters + visual check on `/access-analysis` + `/template-mty`
- [ ] 19-02: PROJ-03 — wire refresh into `dc-daily-ingest.cjs` or document explicit rebuild step; add staleness-bound entry to `.planning/codebase/INTEGRATIONS.md`

## Progress

**Execution Order (v2.1):** 09 → 10 → 11 → 12 → 13 → 14
**Execution Order (v2.2):** 15 → 16 → 17 → 18 → 19
Note: Phase 18 depends on Phase 15 (shared query) but is independent of Phases 16–17 (monolith splits). The sequences 15→16→17 and 15→18→19 could run in parallel; they are ordered here for risk management on a solo workflow.

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
| 17. HybridAnalyticsSurface Split | 1/2 | In progress | - |
| 18. AccFolderPermissionSummary Foundation | 0/1 | Not started | - |
| 19. Raw Scan Retirement & Refresh | 0/2 | Not started | - |
