---
phase: 18-accfolderpermissionsummary-foundation
plan: "01"
subsystem: acc-data-layer
tags: [prisma-migration, backfill, reconciliation, proj-01, ref-03-foundation]
status: complete

# Dependency graph
requires:
  - phase: 15-shared-query-extraction
    provides: "folderPermQuery.ts shared AccFolderPermission join owner (QUERY-01/REF-02), which this projection builds on top of at the schema level"
provides:
  - "AccFolderPermissionSummary Prisma model + applied migration — a durable projection table mirroring the live includePermissionSummary GROUP BY aggregate"
  - "scripts/backfill-folder-perm-summary.cjs — idempotent, server-side (SQL-only) backfill populating the projection from AccFolderPermission"
  - "scripts/verify-folder-perm-summary.cjs — reconciliation harness proving projection == live aggregate (row counts, full-diff, spot-check)"
  - "18-RECONCILIATION.md — recorded PASS verdict with real DB evidence"
affects:
  - "Phase 19 (PROJ-02/PROJ-03, Raw Scan Retirement) — this projection is the foundation Phase 19 will switch consumers onto and use to retire the includePermissionContexts raw scan"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw-SQL migration + `prisma migrate resolve` fallback when `prisma migrate dev` fails on this DB's pgvector shadow-DB step (same precedent as Phase 09 DB-01, 20260623000000_add_acc_folder_permission_role_id_index)."
    - "Server-side-only aggregation: backfill runs one INSERT...SELECT...GROUP BY inside a widened-timeout interactive transaction (300s) — zero AccFolderPermission rows ever cross into Node heap, preserving the TEST-01 OOM guard's invariant."
    - "SQL-side reconciliation: the verify script never pulls raw permission rows into Node either — row counts, the FULL OUTER JOIN mismatch count, and the permTypes-array stable-sort normalization all happen in Postgres; only the small (~22k-row / 20-sample) result sets return to Node."

key-files:
  created:
    - "prisma/migrations/20260702163425_add_acc_folder_permission_summary/migration.sql"
    - "scripts/backfill-folder-perm-summary.cjs (105 lines)"
    - "scripts/verify-folder-perm-summary.cjs (129 lines)"
    - ".planning/phases/18-accfolderpermissionsummary-foundation/18-RECONCILIATION.md"
  modified:
    - "prisma/schema.prisma (added model AccFolderPermissionSummary, 19 lines, adjacent to AccFolderPermission)"

key-decisions:
  - "Primary `prisma migrate dev --name add_acc_folder_permission_summary` attempt failed exactly as STATE.md predicted (P3006/P3018 — shadow-DB extension \"vector\" is not available); fell back to hand-written migration.sql + local pg apply + `prisma migrate resolve --applied` + `prisma generate`, mirroring the Phase 09 DB-01 migration precedent."
  - "Widened the backfill's `$transaction` options to `{ timeout: 300_000, maxWait: 30_000 }` (Prisma's default interactive-transaction timeout is 5s). The first backfill run silently rolled back at the default timeout (48s actual runtime > 5s limit) — a Rule 1 auto-fix, since the transaction failing to commit is a bug, not a design change. Documented under Deviations."
  - "The reconciliation script's permTypes comparison normalizes array ordering via an `unnest(...) + array_agg(t ORDER BY t)` subquery over an already-materialized CTE, rather than nesting `array_agg(DISTINCT ...)` directly inside another aggregate scope (which Postgres rejects as 'aggregate function calls cannot be nested'). Both the live and projection sides are normalized identically before comparison."
  - "Wrote a `--out` flag on the reconciliation script so its full PASS/FAIL evidence (row counts, mismatch count, all 20 spot-checked keys) is captured directly into 18-RECONCILIATION.md verbatim — no hand-transcription of DB output."

requirements-completed: [PROJ-01]

# Metrics
duration: ~50min
completed: 2026-07-02
---

# Phase 18 Plan 01: AccFolderPermissionSummary Foundation Summary

**Added the `AccFolderPermissionSummary` Prisma model + migration, a server-side-only backfill script, and a reconciliation script — proving with real DB evidence (22,082 == 22,082 rows, 0 mismatches, 20/20 spot-checks matched) that the projection exactly mirrors the live `includePermissionSummary` GROUP BY aggregate before any consumer is switched onto it.**

## Performance

- **Duration:** ~50 min across 3 tasks
- **Tasks:** 3/3 (all `type="auto"`)
- **Files created/modified:** 5 (1 modified — `prisma/schema.prisma`; 4 created — migration.sql, 2 scripts, 1 reconciliation note)

## What Was Built

### Task 1 — `AccFolderPermissionSummary` model + migration

Added `model AccFolderPermissionSummary` to `prisma/schema.prisma`, adjacent to
`AccFolderPermission` (line 529), with columns that mirror the live
`includePermissionSummary` aggregate at `lib/server/acc-hot-cache.ts:304-317` exactly:
`id`, `projectId`, `roleId`, `folderCount`, `totalBytes` (BigInt), `permTypes` (String[]),
`refreshedAt`. Natural key `@@unique([projectId, roleId])` plus `@@index([projectId])` /
`@@index([roleId])`.

`npx prisma migrate dev --name add_acc_folder_permission_summary` failed on the shadow-DB
step exactly as STATE.md's guardrail predicted:
```
Error: P3006 / P3018 — Database error: extension "vector" is not available
Migration name: 20260416011500_fix_lod_search_foundation
```
Fell back to the Phase 09 DB-01 precedent: hand-wrote
`prisma/migrations/20260702163425_add_acc_folder_permission_summary/migration.sql`
(standard Prisma-shaped `CREATE TABLE` + unique index + 2 plain indexes), applied it to
the local DB with a `pg` `Client` one-liner (no-SSL, `DATABASE_URL` from `.env`, following
`count-acc-data.cjs`'s post-DB-02 connect pattern), registered it with
`npx prisma migrate resolve --applied 20260702163425_add_acc_folder_permission_summary`,
then `npx prisma generate`.

Evidence: `npx prisma migrate status` → `Database schema is up to date!` (20 migrations
found, all applied). `npx tsc --noEmit` → exit 0 (`db.accFolderPermissionSummary` now
typed). `lib/server/acc-hot-cache.ts` and all terrain loaders untouched.

### Task 2 — Server-side backfill (`scripts/backfill-folder-perm-summary.cjs`)

Follows the `verify-accds-merge.cjs` connection convention (`PrismaClient` +
`@prisma/adapter-pg` `PrismaPg`, `DIRECT_URL || DATABASE_URL`, `$disconnect` in `finally`,
optional `dotenv`). Inside one interactive transaction: `TRUNCATE
"AccFolderPermissionSummary"` then a single `INSERT INTO ... SELECT ... GROUP BY` whose
SELECT body is byte-identical to the live aggregate (`COUNT(DISTINCT fp."folderId")::int`,
`COALESCE(SUM(COALESCE(f."totalSizeBytes",0)),0)::bigint`, `array_agg(DISTINCT
fp."permType")`, joining `AccFolderPermission` → `AccFolder` → `AccProject`, carrying the
same `WHERE p."folderCrawlStatus" IN ('ok','partial')` filter). Row `id` generated
server-side with `gen_random_uuid()::text` (available — local PG 18, no fallback needed).
Prints an inserted-row-count + `n_projects x n_roles` upper-bound sanity report.

Evidence (real run against the live DB):
```
inserted rows:            22082
n_projects (filtered):    904
n_roles (filtered):       107
upper bound (n_p x n_r):  96728
within bound:             YES
```
Re-ran the script — identical 22,082-row result, confirming idempotency (TRUNCATE+INSERT
semantics). `npx vitest run lib/server/acc-hot-cache.test.ts` → 12/12 passed (TEST-01 OOM
guard byte-identical green). No `findMany` on `AccFolderPermission` anywhere in the script
(only a doc-comment mentions the term as the thing being avoided).

### Task 3 — Reconciliation (`scripts/verify-folder-perm-summary.cjs` + `18-RECONCILIATION.md`)

`verify-accds-merge.cjs`-style PASS/FAIL harness (`ok()` helper, `process.exit(1)` on any
failure). Three assertions, all evaluated in SQL via a shared CTE:
1. Row-count: live aggregate CTE count == projection count.
2. Full-diff: `FULL OUTER JOIN` on `(projectId, roleId)`, counting rows where the key is
   missing on either side or `folderCount`/`totalBytes`/`permTypes` differ (permTypes
   arrays normalized via `unnest(...) + array_agg(... ORDER BY ...)` before comparison).
3. Spot-check: 20 random `(projectId, roleId)` keys, live vs. projection printed
   side-by-side.

Real run against the live DB (captured verbatim into `18-RECONCILIATION.md` via `--out`):
```
live aggregate row count:       22082
projection row count:           22082
PASS  row-count: live (22082) == projection (22082)
full-outer-join mismatch count:  0
PASS  full-diff: 0 mismatches between live aggregate and projection
PASS  spot-check: sampled 20 keys (target ~20)
PASS  spot-check: 0/20 sampled keys mismatched
VERDICT: PASS
```
Script exited 0. No consumer read or modified — read-only against
`AccFolderPermissionSummary` and `AccFolderPermission`/`AccFolder`/`AccProject`.

## Commands Run (with real evidence)

| Command | Result |
|---|---|
| `npx prisma migrate dev --name add_acc_folder_permission_summary` | Failed — P3006/P3018 pgvector shadow-DB error (expected per STATE guardrail) |
| pg `Client` one-liner applying `migration.sql` | `Migration SQL applied.` |
| `npx prisma migrate resolve --applied 20260702163425_add_acc_folder_permission_summary` | `Migration ... marked as applied.` |
| `npx prisma generate` | `Generated Prisma Client (v7.8.0)` |
| `npx prisma migrate status` | `Database schema is up to date!` (20 migrations) |
| `npx tsc --noEmit` (x3, after each task) | Exit 0 every time |
| `node scripts/backfill-folder-perm-summary.cjs` (x2) | 22,082 rows both times — idempotent |
| `npx vitest run lib/server/acc-hot-cache.test.ts` | 12/12 passed |
| `node scripts/verify-folder-perm-summary.cjs --out .../18-RECONCILIATION.md` | Exit 0 — PASS, 0 mismatches, 20/20 spot-checks |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backfill transaction silently rolled back on first run — widened interactive-transaction timeout**
- **Found during:** Task 2, first execution of `scripts/backfill-folder-perm-summary.cjs`
- **Issue:** The `INSERT...SELECT...GROUP BY` over the ~6M-row `AccFolderPermission` table took ~48s, but Prisma's default interactive-transaction timeout is 5s. The transaction's work executed but `$transaction`'s commit failed with `PrismaClientKnownRequestError P2028` ("commit cannot be executed on an expired transaction"), and the table was left at 0 rows (rolled back).
- **Fix:** Passed `{ timeout: 300_000, maxWait: 30_000 }` as the second argument to `prisma.$transaction(fn, opts)`, giving the transaction up to 5 minutes to complete the aggregate + insert over the full table.
- **Files modified:** `scripts/backfill-folder-perm-summary.cjs`
- **Commit:** `9d55539c` (included in the Task 2 commit — the bug was caught and fixed before that commit was made, so no separate fix commit was needed)

No other deviations. The plan's model shape, migration fallback sequence, backfill SQL body, and reconciliation assertions were all implemented as specified.

## Auth Gates

None encountered — local-DB-only work, no external API/service auth involved.

## Workshop Impact

**ZERO.** No `app/` route, `components/`, tRPC procedure, or chart was touched. The four
workshop pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) and
`/users/spatial-graph` behave identically — nothing reads `AccFolderPermissionSummary` yet.
`lib/server/acc-hot-cache.ts` and all terrain loaders (`folderPermissionTerrainView.ts`,
`templateFolderTerrain.ts`) are byte-for-byte untouched (confirmed via scope-fence diff
below).

## Data-Truthfulness Note

The projection is a derived aggregate of existing Prisma data — no new metric, no new data
source. It inherits the live query's coverage boundary exactly: the
`folderCrawlStatus IN ('ok','partial')` filter is baked into the backfill's `WHERE` clause,
so projects with `inaccessible` crawl status remain excluded from the projection precisely
as the live aggregate excludes them today.

## Scope Fence Verification

```
git diff --name-only 3ec8f4a0 HEAD
.planning/phases/18-accfolderpermissionsummary-foundation/18-RECONCILIATION.md
prisma/migrations/20260702163425_add_acc_folder_permission_summary/migration.sql
prisma/schema.prisma
scripts/backfill-folder-perm-summary.cjs
scripts/verify-folder-perm-summary.cjs
```
Exactly `prisma/schema.prisma`, `prisma/migrations/**`, the two new `scripts/*.cjs`, and
`.planning/**`. `lib/server/acc-hot-cache.ts` and terrain loaders do not appear. All 3
commits used explicit-path `git add` (never `-A`/`.`); `git diff --cached --name-only` was
checked clean before each commit.

## Known Stubs

None — the projection is fully populated (22,082 real rows from the live DB) and the
reconciliation proves it matches the live aggregate. No placeholder data, no empty
hardcoded values reaching any UI (nothing reads this table yet).

## Threat Flags

None. This plan's `<threat_model>` (T-18-01 tampering, T-18-02 DoS, T-18-03 info
disclosure, T-18-SC supply-chain) fully covers the surface introduced — a local script →
local-DB trust boundary, no untrusted input, no new package installs. No new surface
outside that register was introduced.

## Self-Check

- [x] `prisma/schema.prisma` contains `model AccFolderPermissionSummary` — FOUND
- [x] `prisma/migrations/20260702163425_add_acc_folder_permission_summary/migration.sql` — FOUND
- [x] `scripts/backfill-folder-perm-summary.cjs` — FOUND (105 lines)
- [x] `scripts/verify-folder-perm-summary.cjs` — FOUND (129 lines)
- [x] `.planning/phases/18-accfolderpermissionsummary-foundation/18-RECONCILIATION.md` — FOUND
- [x] Commit `77909b10` — FOUND in `git log`
- [x] Commit `9d55539c` — FOUND in `git log`
- [x] Commit `fb8ba765` — FOUND in `git log`

## Self-Check: PASSED

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/config.json`,
  `.claude/skills/lecg-dashboard/SKILL.md`, `./CLAUDE.md`, `lib/server/acc-hot-cache.ts`
  (+ test), `prisma/schema.prisma`, `scripts/verify-accds-merge.cjs`,
  `scripts/count-acc-data.cjs`, and the Phase 09 raw-migration precedent were all read at
  execution start; all current.
- **Evidence:** model columns and backfill/reconciliation SQL grounded verbatim in
  `acc-hot-cache.ts:304-317`; source table shapes verified at `prisma/schema.prisma:437-541`;
  migration-resolve pattern verified against
  `prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql`;
  connection conventions verified against `scripts/verify-accds-merge.cjs` and
  `scripts/count-acc-data.cjs`.
- **Constraints applied:** behavior-preserving (zero consumer switch), zero UI/theme/WebGL
  change, Prisma DB as the only data source, `folderCrawlStatus IN ('ok','partial')`
  coverage boundary inherited exactly, `/users/spatial-graph` untouched.
- **Gates run:** `npx tsc --noEmit` (3x, all exit 0); `npx prisma migrate status` (applied);
  `npx vitest run lib/server/acc-hot-cache.test.ts` (12/12); reconciliation script (PASS,
  0 mismatches). Gates skipped: `next build`/rebuild (not required — backend/DB + scripts
  only phase, explicitly out of scope per plan); repo-map check (no import-boundary or
  app data-flow change — schema/scripts additions only, no source imports changed).
- **VERIFY:** none remaining — `gen_random_uuid()` availability was confirmed live (no
  fallback needed) and the pgvector `migrate dev` failure branch was confirmed live (not
  hypothetical).
