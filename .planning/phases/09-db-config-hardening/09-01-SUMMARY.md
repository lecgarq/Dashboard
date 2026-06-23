---
phase: 09-db-config-hardening
plan: "01"
subsystem: database
tags: [postgres, prisma, pg-client, env-config, vitest, oom, security]

requires: []

provides:
  - scripts/count-acc-data.cjs connects without any SSL/TLS-bypass flag (DB-02)
  - .env.example documents PG_POOL_MAX=32 and NODE_OPTIONS=--max-old-space-size=8192 with rationale comments (DB-03)
  - lib/server/acc-hot-cache.ts includePermissionContexts branch carries WARNING + VERIFY: guardrail (DB-04)
  - lib/server/acc-hot-cache.test.ts has DB-free OOM-regression test pinning the GROUP BY aggregate row-bound (TEST-01)

affects:
  - 09-02 (DB-01 index migration — no dependency, but completes the phase)
  - Any future contributor touching acc-hot-cache.ts (guardrail visible)
  - Any script using count-acc-data.cjs (no TLS bypass)

tech-stack:
  added: []
  patterns:
    - "DB-free Vitest pinning test: mock $queryRaw with mockResolvedValueOnce; assert row-bound contract without live DB"
    - ".gitignore opt-in for .env.example using negation rule !.env.example after .env* blanket"

key-files:
  created:
    - .env.example (first commit; was always gitignored, now tracked via !.env.example exception)
  modified:
    - scripts/count-acc-data.cjs (removed ssl:{rejectUnauthorized:false} fossil)
    - lib/server/acc-hot-cache.ts (added WARNING + VERIFY: comment on raw-scan branch)
    - lib/server/acc-hot-cache.test.ts (added TEST-01 pinning test)
    - .gitignore (added !.env.example exception to allow .env.example to be committed)

key-decisions:
  - "DB-02: removed ssl:{rejectUnauthorized:false} from pg Client in count-acc-data.cjs; local trust-auth Postgres inherits sslmode from DATABASE_URL"
  - "DB-03: .env.example was gitignored by .env* blanket; added !.env.example exception to .gitignore to commit it"
  - "DB-04: comment-only guardrail on includePermissionContexts:true branch; no behavior change"
  - "TEST-01: pinning test not new behavior — the OOM fix is already shipped; test protects the existing GROUP BY aggregate win"

patterns-established:
  - "OOM regression guard: mock db.$queryRaw returning group rows; assert assembled row-count <= n_roles * n_projects"

requirements-completed: [DB-02, DB-03, DB-04, TEST-01]

duration: 25min
completed: 2026-06-23
status: complete
---

# Phase 09 Plan 01: DB & Config Hardening (no-live-DB tasks) Summary

**SSL fossil removed from census script, PG_POOL_MAX/NODE_OPTIONS documented in .env.example, OOM raw-scan guardrail comment added, and DB-free Vitest regression test pins the AccFolderPermission GROUP BY aggregate row-bound**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-23T15:30:00Z
- **Completed:** 2026-06-23T15:55:00Z
- **Tasks:** 3 completed
- **Files modified:** 5 (scripts/count-acc-data.cjs, .env.example, lib/server/acc-hot-cache.ts, lib/server/acc-hot-cache.test.ts, .gitignore)

## Accomplishments

- **DB-02:** Removed the Supabase-era `ssl:{rejectUnauthorized:false}` TLS-bypass fossil from `scripts/count-acc-data.cjs`; the pg Client now inherits sslmode from DATABASE_URL (local trust-auth needs no SSL).
- **DB-03:** Added `PG_POOL_MAX=32` and `NODE_OPTIONS=--max-old-space-size=8192` with scaling-rationale comments to `.env.example`; no secret values added; also added `!.env.example` gitignore exception so the file is now tracked.
- **DB-04:** Added a `WARNING` + `VERIFY:` comment block immediately above the `includePermissionContexts:true` branch in `lib/server/acc-hot-cache.ts` to flag the ~5M-row heap risk and note that no active non-test caller enables that path; no behavior change.
- **TEST-01:** Extended `lib/server/acc-hot-cache.test.ts` with a DB-free Vitest pinning test that mocks `db.$queryRaw` to return 4 group rows (2 roles × 2 projects), asserts the GROUP BY aggregate row-bound (group rows <= n_roles × n_projects), proves the raw-row population is strictly larger, and confirms `accFolderPermission.findMany` is not called for the summary variant. All 12 tests pass.

## Task Commits

1. **Task 1: Remove SSL fossil from count-acc-data.cjs (DB-02)** — `66c9f404` (fix)
2. **Task 2: Document PG_POOL_MAX + NODE_OPTIONS; add raw-scan guardrail (DB-03, DB-04)** — `4b4db0d9` (feat)
3. **Task 3: DB-free OOM-regression test (TEST-01)** — `64311fac` (test)

## Files Created/Modified

- `scripts/count-acc-data.cjs` — Removed `ssl:{rejectUnauthorized:false}`; added DB-02 trust-auth comment
- `.env.example` — Added `PG_POOL_MAX=32` + `NODE_OPTIONS=--max-old-space-size=8192` with rationale (DB-03); first commit of this file
- `.gitignore` — Added `!.env.example` negation rule to opt-in the file from the `.env*` blanket
- `lib/server/acc-hot-cache.ts` — Added WARNING + VERIFY: guardrail comment on raw-scan branch (DB-04); no behavior change
- `lib/server/acc-hot-cache.test.ts` — Added TEST-01 pinning test for the GROUP BY aggregate row-bound

## Decisions Made

- **DB-03 gitignore exception:** `.env.example` was blocked by the `.env*` blanket rule in `.gitignore`. The comment "can opt-in for committing if needed" was present in .gitignore. Added `!.env.example` to allow it to be committed — this is the correct pattern for example env files. Secret-hygiene preserved: only scaling literals (PG_POOL_MAX=32, NODE_OPTIONS heap size) and comments were added; no DATABASE_URL or tokens.
- **TEST-01 is a pinning test:** The OOM fix (GROUP BY aggregate) was already shipped in 2026-06. This test protects the existing win rather than testing new behavior. It passes immediately in GREEN state, which is expected per 09-CONTEXT.md: "The OOM fix is already shipped — TEST-01 is a pinning test."
- **.gitignore added to Task 2 commit:** The .gitignore exception for .env.example was a necessary dependency to commit that file; it was included in the same Task 2 commit rather than a separate one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added !.env.example to .gitignore to allow committing the file**

- **Found during:** Task 2 (DB-03 — .env.example documentation)
- **Issue:** `.env.example` is gitignored by the `.env*` blanket rule; the plan requires committing it with the PG_POOL_MAX/NODE_OPTIONS entries.
- **Fix:** Added `!.env.example` negation rule to `.gitignore` immediately after the `.env*` line. The existing comment "can opt-in for committing if needed" confirms this is the intended mechanism. No secrets were added; only scaling literals and comments.
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore` confirmed the exception works; `git add .env.example` staged successfully; commit `4b4db0d9` includes `.env.example` as `create mode 100644`.
- **Committed in:** `4b4db0d9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking — gitignore exception for .env.example)
**Impact on plan:** Required to commit the file as planned. No scope creep.

## Issues Encountered

- **Pre-existing test failures (out of scope):** `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` has 2 pre-existing failing tests (polygon count assertions). These were present before this plan's commits — last modification to that file was well before Phase 09. They are not caused by any of the four target files. Per deviation rules, pre-existing failures in unrelated files are out of scope; documented here for visibility.

## Verification Gates Run

| Gate | Command | Result |
|------|---------|--------|
| SSL fossil removed | `grep -nE "ssl[[:space:]]*:|rejectUnauthorized" scripts/count-acc-data.cjs` | Empty (PASS) |
| DB-03 PG_POOL_MAX entry | Python count of exact literal `PG_POOL_MAX=32` in .env.example | 1 occurrence (PASS) |
| DB-03 NODE_OPTIONS entry | Python count of exact literal `NODE_OPTIONS=--max-old-space-size=8192` | 1 occurrence (PASS) |
| DB-04 WARNING token | `grep -nE "WARNING" lib/server/acc-hot-cache.ts` | Line 281 (PASS) |
| DB-04 VERIFY: token | `grep -nE "VERIFY:" lib/server/acc-hot-cache.ts` | Line 286 (PASS) |
| Full-tree typecheck | `npx tsc --noEmit` | Clean (PASS) |
| Targeted test | `npm test -- lib/server/acc-hot-cache.test.ts` | 12/12 passed (PASS) |
| Full suite | `npm test` | 2191 passed, 2 pre-existing unrelated failures (NOTED) |

## Workshop Impact

No visible workshop-page change. This is DB/config layer hardening behind the four workshop pages:

- The census script (`scripts/count-acc-data.cjs`) is more secure — no TLS bypass.
- The `.env.example` documentation helps future operators configure the server correctly for the 6M-row AccFolderPermission load.
- The guardrail comment on the raw-scan branch prevents future contributors from accidentally re-opening the OOM window.
- The TEST-01 pinning test ensures the GROUP BY aggregate fix is never silently regressed.

## Data Truthfulness Notes

No data values changed. No new analytics or ingestion changes. The aggregate under test is the verified source of truth (`AccFolderPermission` GROUP BY → ~13k group rows from ~5M raw rows); the test asserts the row-bound contract, not new numbers.

## Known Stubs

None — this plan contains no stubs. All changes are either deletions (ssl flag removal), documentation (env.example, comment), or a test that asserts existing behavior.

## Self-Check: PASSED

All files verified as present and committed. All verification gates passed or noted as pre-existing.

---

## Dashboard self-check

- **Context:** Read `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/phases/09-db-config-hardening/09-01-PLAN.md`, `.planning/phases/09-db-config-hardening/09-CONTEXT.md`, `.planning/config.json`, `scripts/count-acc-data.cjs`, `lib/server/acc-hot-cache.ts`, `lib/server/acc-hot-cache.test.ts`.
- **Evidence:** SSL fossil at count-acc-data.cjs:14 (verified); includePermissionContexts branch at acc-hot-cache.ts:281-295 (verified); GROUP BY aggregate at :296-328 (verified); existing test helpers `makePrewarmDb`, `versionedModel`, `invalidateAccHotCache` (verified in test file); .gitignore `.env*` blanket + "can opt-in" comment (verified); `vitest run` command from package.json (verified).
- **Constraints:** No UI surface changes; no workshop pages touched; zinc theme not engaged; no WebGL; no new tRPC procedures; `/users/spatial-graph` not touched; Prisma DB as data source (unchanged); `npx tsc --noEmit` run before any rebuild.
- **Gates:** `npx tsc --noEmit` (passed clean); `npm test -- lib/server/acc-hot-cache.test.ts` (12/12 PASS); `npm test` full suite (pre-existing unrelated failures in FolderPermissionTerrain.test.tsx noted, not caused by this plan).
- **VERIFY:** none — all claims grounded in repo evidence.

---

*Phase: 09-db-config-hardening*
*Completed: 2026-06-23*
