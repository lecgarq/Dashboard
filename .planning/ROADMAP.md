# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 ACC Graph** - Phases 01-06 (shipped ~2026-05)
- ✅ **v2.0 Workshop UI Overhaul** - Phases 01-07 (shipped 2026-06-19)
- ✅ **Phase 08 — Activity Re-extraction** (interim phase, shipped 2026-06-23)
- 🚧 **v2.1 Concerns Hardening** - Phases 09-14 (in progress)

---

## 🚧 v2.1 Concerns Hardening (In Progress)

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
- [ ] **Phase 14: Characterization Tests** - Pin access-analysis monolith tRPC boundaries and shared terrain query output so deferred splits are safe

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

- [x] 12-01-PLAN.md — OBS-01: `getSessionHealth()` helper in `lib/acc/accdsToken.ts` + crawl-side startup `[WARN]` preflight in `scripts/accds-activity-ingest.cjs` + always-on session-health line on the `:4321` monitor (`scripts/progress-monitor.cjs`); local cookie-expiry read, &lt;12h threshold, estimate-labeled (wave 1) — COMPLETE 2026-06-30
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

**Plans**: 1/2 plans executed

- [ ] 14-01-PLAN.md — TEST-02: golden-master `loadFolderPermissionTerrain` / `loadFolderPermissionOverview` (+ `loadTerrainProjects` shape pin) in `lib/server/__tests__/folderPermissionTerrainView.test.ts`; add `// SPLIT-PENDING:` REF-01 comments to the three monoliths + REF-02 comment on `folderPermissionTerrainView.ts` (wave 1)
- [x] 14-02-PLAN.md — TEST-03: pin the shared `AccFolderPermission` terrain-query contract (5-column set + row-bound + project scope, references REF-02) via `loadTemplateFolderTerrain` in `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts`; add `// SPLIT-PENDING:` REF-02 comment on `templateFolderTerrain.ts` (wave 1)

## Progress

**Execution Order:** 09 → 10 → 11 → 12 → 13 → 14
Note: Phase 11 depends on Phase 09 (not 10) — UI labeling is independent of boundary fixes. Phases 12, 13, 14 can begin once their named dependency is complete.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 09. DB & Config Hardening | 2/2 | Complete    | 2026-06-23 |
| 10. Layering & Boundary Fixes | 3/3 | Complete    | 2026-06-23 |
| 11. Data-Truthfulness Labels | 4/4 | Complete    | 2026-06-30 |
| 12. Integration Health & Observability | 2/2 | Complete    | 2026-06-30 |
| 13. Type-Safety Guards | 1/1 | Complete    | 2026-06-30 |
| 14. Characterization Tests | 1/2 | In Progress|  |
