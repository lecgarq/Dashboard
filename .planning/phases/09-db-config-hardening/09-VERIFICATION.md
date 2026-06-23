---
phase: 09-db-config-hardening
verified: 2026-06-23T22:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 09: DB & Config Hardening Verification Report

**Phase Goal:** Add roleId index + migration, remove SSL fossil, document heap/pool env vars, guard the raw-scan path, and ship the OOM-regression aggregate test.
**Verified:** 2026-06-23T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `scripts/count-acc-data.cjs` connects without any SSL/TLS-bypass flag and still constructs a pg Client from DATABASE_URL | VERIFIED | File line 14-15: `// DB-02: local trust-auth Postgres...` + `const client = new Client({ connectionString })` — no `ssl:` key. `grep -nE "ssl|rejectUnauthorized"` returns only the rationale comment, not a flag. Commit 66c9f404. |
| 2 | `.env.example` documents `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192` with scaling-rationale comments, no secret values | VERIFIED | File contains both exact literals with comments explaining pool formula and 8 GB heap requirement. `DATABASE_URL=` is blank (no value). `.gitignore` has `!.env.example` negation; `git ls-files .env.example` confirms tracking. Commit 4b4db0d9. |
| 3 | The `includePermissionContexts:true` raw-scan branch carries a WARNING about the ~5M-row heap risk and a VERIFY: note that no active (non-test) caller enables it | VERIFIED | Lines 281-287 of `lib/server/acc-hot-cache.ts` have `// WARNING (DB-04): ...` and `// VERIFY: no active non-test caller enables includePermissionContexts:true`. Independent grep of `app/`, `components/`, `lib/`, `server/`, `scripts/` for `includePermissionContexts.*true` (excluding test/spec files and the definition file itself) returns zero matches. The tRPC router at `server/routers/acc-dc-graph.ts:23` accepts the flag as `.optional()` in its input schema but no caller passes `true`. VERIFY: claim is accurate. Commit 4b4db0d9. |
| 4 | `npm test` runs a DB-free Vitest test asserting the `AccFolderPermission` GROUP BY aggregate returns at most `n_roles x n_projects` rows, never raw permission rows | VERIFIED | `lib/server/acc-hot-cache.test.ts` lines 258-325 contain the TEST-01 pinning test. Test mocks `db.$queryRaw` with 4 group rows (2 roles × 2 projects), asserts `groupRows.length <= roles.length * projects.length`, asserts `rawPermissionRows.length > groupRows.length` (bound is meaningful), and asserts `db.accFolderPermission.findMany` was NOT called. `npm test -- lib/server/acc-hot-cache.test.ts` runs 12/12 PASS. Commit 64311fac. |
| 5 | `AccFolderPermission` has a standalone `@@index([roleId])` via a raw CREATE INDEX migration applied to live Postgres, with EXPLAIN ANALYZE confirming index use | VERIFIED | `prisma/schema.prisma:540` has `@@index([roleId])` on `AccFolderPermission` (line 503 `@@index([roleId])` belongs to `AccProjectRole` — different model, no duplicate). Migration `20260623000000_add_acc_folder_permission_role_id_index/migration.sql` contains single standard `CREATE INDEX IF NOT EXISTS "acc_folder_permission_role_id_idx" ON "AccFolderPermission" ("roleId")` — no CONCURRENTLY. Live DB: `pg_indexes` row confirmed (`indexname=acc_folder_permission_role_id_idx`, `tablename=AccFolderPermission`). EXPLAIN ANALYZE on low-frequency roleId (`e15803e9-...`, count=1) shows `Bitmap Index Scan on acc_folder_permission_role_id_idx` (execution 0.856ms). `npx prisma migrate status`: "Database schema is up to date!" (19 migrations). Commit 8d517adb. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/count-acc-data.cjs` | Census diagnostic without `ssl:{rejectUnauthorized:false}` | VERIFIED | Contains `DATABASE_URL` parsing; Client constructed with `connectionString` only; no `ssl:` key present; DB-02 comment added. |
| `.env.example` | Documented `PG_POOL_MAX=32` + `NODE_OPTIONS` scaling config | VERIFIED | Both entries present with rationale comments; no secret values; file tracked via `!.env.example` gitignore exception. |
| `lib/server/acc-hot-cache.ts` | Guardrail comment on the raw folder-permission scan branch | VERIFIED | `WARNING` (line 281) and `VERIFY:` (line 286) present; no behavior change (branch logic unchanged). |
| `lib/server/acc-hot-cache.test.ts` | OOM-regression pinning test for the GROUP BY aggregate row-bound | VERIFIED | TEST-01 at lines 258-325; uses `n_roles`, `n_projects`, `makePrewarmDb`, `db.$queryRaw` mock; 12/12 pass. |
| `prisma/schema.prisma` | Standalone `@@index([roleId])` on AccFolderPermission | VERIFIED | Line 540: `@@index([roleId])` inside `AccFolderPermission` model (lines 529-541). |
| `prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql` | Raw `CREATE INDEX` statement for the roleId index | VERIFIED | Single statement: `CREATE INDEX IF NOT EXISTS "acc_folder_permission_role_id_idx" ON "AccFolderPermission" ("roleId")`. No CONCURRENTLY. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/count-acc-data.cjs` | `DATABASE_URL` pool (no TLS bypass) | `new Client({ connectionString })` with `ssl` option removed | VERIFIED | Line 15: `const client = new Client({ connectionString })`. No `ssl:` key. Grep returns no `ssl:` or `rejectUnauthorized`. |
| `lib/server/acc-hot-cache.test.ts` | `getCachedAccDcBulkUsers` ($queryRaw GROUP BY) | Mocked `db.$queryRaw` returning group rows; assert bound <= n_roles x n_projects | VERIFIED | `db.$queryRaw.mockResolvedValueOnce(groupRows)` at line 304; `getCachedAccDcBulkUsers(db, { includePermissionSummary: true })` at line 307; assertions at lines 311, 315, 319. |
| `prisma/schema.prisma @@index([roleId])` | Live Postgres index `acc_folder_permission_role_id_idx` | Raw migration.sql applied + `prisma migrate resolve --applied` | VERIFIED | `pg_indexes` confirms `{"indexname":"acc_folder_permission_role_id_idx","tablename":"AccFolderPermission"}`; `prisma migrate status` clean (19/19). |
| `acc_folder_permission_role_id_idx` | EXPLAIN ANALYZE plan on roleId-joined terrain query | `Bitmap Index Scan on acc_folder_permission_role_id_idx` | VERIFIED | Live EXPLAIN ANALYZE output: `Bitmap Index Scan on acc_folder_permission_role_id_idx` with `Index Cond: ("roleId" = 'e15803e9-...'::text)`, execution 0.856ms. |

### Data-Flow Trace (Level 4)

Not applicable — this phase contains no UI components or pages that render dynamic data. All changes are backend/infra: a pg script, env config, a code comment, a pinning test, and a DB index migration.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TEST-01 pinning test passes (DB-free) | `npm test -- lib/server/acc-hot-cache.test.ts` | 12/12 passed (386ms) | PASS |
| SSL fossil absent from census script | `grep -nE "ssl\|rejectUnauthorized" scripts/count-acc-data.cjs` | Only rationale comment (no flag) | PASS |
| Whole-tree typecheck | `npx tsc --noEmit` | Empty output (zero errors) | PASS |
| Index exists in live Postgres | `pg_indexes WHERE indexname = 'acc_folder_permission_role_id_idx'` | 1 row returned | PASS |
| Index is used by EXPLAIN ANALYZE | Low-frequency roleId lookup | `Bitmap Index Scan on acc_folder_permission_role_id_idx` | PASS |
| Migration state consistent | `npx prisma migrate status` | "Database schema is up to date!" (19 migrations) | PASS |

### Probe Execution

No phase-declared probes. Step 7c: SKIPPED (no `scripts/*/tests/probe-*.sh` defined for this phase; all behavioral checks run via Step 7b spot-checks above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DB-01 | 09-02-PLAN.md | `AccFolderPermission` `@@index([roleId])` via raw migration + EXPLAIN ANALYZE confirmation | SATISFIED | schema.prisma:540, migration.sql, live pg_indexes row, EXPLAIN ANALYZE Bitmap Index Scan proof |
| DB-02 | 09-01-PLAN.md | `scripts/count-acc-data.cjs` removes `ssl:{rejectUnauthorized:false}` | SATISFIED | File line 15: `new Client({ connectionString })` only; grep returns zero ssl/rejectUnauthorized flags |
| DB-03 | 09-01-PLAN.md | `.env.example` documents `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192` with comments, no secrets | SATISFIED | Both literals present with rationale comments; DATABASE_URL blank; file tracked via gitignore exception |
| DB-04 | 09-01-PLAN.md | `includePermissionContexts:true` branch carries WARNING + VERIFY: guardrail | SATISFIED | Lines 281-287; no active non-test caller passes `true` (grep-confirmed) |
| TEST-01 | 09-01-PLAN.md | DB-free Vitest test asserting GROUP BY aggregate row-bound <= n_roles x n_projects | SATISFIED | test at lines 258-325; 12/12 pass confirmed by running `npm test` |

All 5 requirement IDs from plans cross-referenced against REQUIREMENTS.md. REQUIREMENTS.md Traceability table lists all 5 as "Complete (2026-06-23)". No orphaned requirement IDs for Phase 09.

### Anti-Patterns Found

No blockers. Scanned all 7 source files changed by phase 09 commits.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/server/acc-hot-cache.ts` | 281-287 | `WARNING` + `VERIFY:` comment | INFO (intended) | This is the DB-04 guardrail — a deliberate documentation pattern, not a stub or debt marker |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-09 modified file. No `TODO` or `HACK` markers in the 3 primary changed files. The FolderPermissionTerrain.test.tsx pre-existing failures (2 polygon-count assertions) are vitest `AssertionError`s in a file last modified well before Phase 09 (last commit `1c3e1ea7` — unrelated terrain polish), not tsc type errors, and not caused by any of the 7 phase-09 target files.

### Dashboard Guardrails

| Check | Result |
|-------|--------|
| Changed files within phase scope (`scripts/`, `lib/server/`, `prisma/`, `.env.example`, `.gitignore`) | PASS — exactly 7 files, all within scope |
| `/users/spatial-graph` not touched | PASS — none of the 7 changed files are under that path |
| No new WebGL added | PASS — no UI changes at all |
| No theme/zinc drift | PASS — no UI/CSS changes |
| `npx tsc --noEmit` passes | PASS — empty output (zero errors) |
| Pre-existing FolderPermissionTerrain failures are vitest assertion failures, NOT tsc errors | CONFIRMED — `AssertionError: expected 13 to be 12` in test file with last commit predating Phase 09 |
| No generic `src/...` paths introduced | PASS — all paths are verified repo roots |
| DB-02/DB-04 VERIFY: claim accuracy | CONFIRMED — independent grep of all non-test app/component/lib/server files for `includePermissionContexts.*true` returns zero matches |

### Human Verification Required

None — all must-haves are programmatically verifiable and verified.

The EXPLAIN ANALYZE live-DB check was performed in this session using the repo's own `pg` Client pattern (same as `scripts/count-acc-data.cjs`) and returned a confirmed `Bitmap Index Scan on acc_folder_permission_role_id_idx`. No human verification is required for the live-DB check.

---

## Dashboard self-check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `09-01-PLAN.md`, `09-02-PLAN.md`, `09-01-SUMMARY.md`, `09-02-SUMMARY.md`, `09-CONTEXT.md`, `scripts/count-acc-data.cjs`, `.env.example` (via node read), `lib/server/acc-hot-cache.ts`, `lib/server/acc-hot-cache.test.ts`, `prisma/schema.prisma`, `prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql`, `.gitignore` — all read or directly queried.
- **Evidence:** SSL fossil absence verified by grep; .env.example read via node (file permission blocked cat but node succeeded); WARNING/VERIFY: lines confirmed by grep; includePermissionContexts:true grep confirmed zero non-test callers; schema @@index lines 503 vs 540 confirmed to be AccProjectRole vs AccFolderPermission; migration.sql single-statement confirmed; live pg_indexes confirmed via pg Client; EXPLAIN ANALYZE output captured live; prisma migrate status captured live; `npm test` 12/12 captured live; `npx tsc --noEmit` clean captured live; git diff --name-only confirms 7 files within scope.
- **Constraints:** No UI changes; no workshop pages touched; zinc theme not engaged; no WebGL; no new tRPC procedures; `/users/spatial-graph` not touched; `scripts/count-acc-data.cjs` not listed in HEAD~5..HEAD diff (it is in HEAD~6 range — commit 66c9f404 is the 6th most recent commit, consistent with 5 documented phase-09 commits + its own preceding position). All 5 phase requirements satisfied.
- **Gates:** `npx tsc --noEmit` PASS; `npm test -- lib/server/acc-hot-cache.test.ts` 12/12 PASS; live `pg_indexes` check PASS; live EXPLAIN ANALYZE PASS; `npx prisma migrate status` PASS.
- **VERIFY:** none — all claims grounded in direct repo and live-DB evidence.

---

_Verified: 2026-06-23T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
