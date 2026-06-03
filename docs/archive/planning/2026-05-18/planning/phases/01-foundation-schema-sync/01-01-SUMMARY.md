---
phase: 01-foundation-schema-sync
plan: 01
subsystem: database

tags: [prisma, postgres, schema-migration, acc-v2, supabase, ddl]

# Dependency graph
requires:
  - phase: v1.0 baseline
    provides: Existing Prisma schema (User, Project, AccMemberCache, AccGraphLayoutCache, etc.) with @prisma/adapter-pg driver-adapters mode
provides:
  - 8 ACC v2.0 domain models + SyncMeta in prisma/schema.prisma
  - Applied additive migration 20260511155810_acc_v2_foundation
  - AccActivity composite indexes with createdAt DESC sort (SCHEMA-02)
  - Regenerated @prisma/client exposing AccProject, AccProjectMember, AccRole, AccProjectRole, AccFolder, AccFolderPermission, AccActivity, AccDataConnectorJob, SyncMeta types
affects: [01-02 acc-helpers, 01-03 sync-orchestration, 01-04 freshness-indicator, phase-2 extraction, phase-3 ingest]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — pure schema work
  patterns:
    - Prisma 7.x composite index with per-field sort (createdAt(sort: Desc))
    - Cascade vs SetNull relation onDelete choices per CONTEXT.md
    - String columns for status enums (no Prisma enum types, per CONTEXT.md "Pure DDL")
    - migrate diff workaround for live-DB drift (additive-only generation bypasses migrate dev's reconciliation)

key-files:
  created:
    - prisma/migrations/20260511155810_acc_v2_foundation/migration.sql
    - .planning/phases/01-foundation-schema-sync/deferred-items.md
  modified:
    - prisma/schema.prisma

key-decisions:
  - Used 'prisma migrate diff' + 'migrate deploy' instead of 'migrate dev' to bypass pre-existing LodEmbedding.pgvector drift safely
  - Prisma 7.8.0 correctly emits "createdAt" DESC for @@index([..., createdAt(sort: Desc)]) — no manual SQL edit needed (Pitfall 3 resolved automatically)
  - SyncMeta uses String id with documented values ("quick" | "deep") — no Prisma enum, simpler migration
  - All status columns kept as plain String (no enum) per CONTEXT.md "Pure DDL"
  - AccProjectRole.memberId uses onDelete: SetNull (members can churn while role grants persist as audit)

patterns-established:
  - "Composite-DESC index pattern: @@index([fk, createdAt(sort: Desc)]) ships from day one — Phase 3 ingest will never need retroactive index addition"
  - "Strictly-additive migration policy: zero DROP/RENAME in generated SQL is a hard verification gate"
  - "Migration generation via diff-from-prior-schema works around live-DB drift without resetting tables"

requirements-completed: [SCHEMA-01, SCHEMA-02]

# Metrics
duration: ~4min
completed: 2026-05-11
---

# Phase 01 Plan 01: Foundation Schema — ACC v2.0 Relational Layer Summary

**8 ACC v2.0 domain models + SyncMeta added to Prisma with applied additive migration; AccActivity ships with createdAt DESC composite indexes from day one (SCHEMA-01 + SCHEMA-02 satisfied)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T15:56:45Z
- **Completed:** 2026-05-11T16:00:15Z
- **Tasks:** 2
- **Files modified:** 3 (schema, migration.sql, deferred-items.md)

## Accomplishments
- 9 new Prisma models appended cleanly after `AccGraphLayoutCache` — zero existing model touched
- Migration `20260511155810_acc_v2_foundation` generated, inspected (0 DROP, 9 CREATE TABLE, 2 DESC indexes), applied to dev Postgres successfully
- Prisma 7.8.0 emitted `"createdAt" DESC` correctly in both AccActivity composite indexes — Pitfall 3 (Research) did not materialize
- Prisma client regenerated; downstream plans can import AccDataConnectorJob, SyncMeta, AccProject, etc.
- Worked around pre-existing `LodEmbedding.pgvector` drift via `migrate diff` strategy (logged to deferred-items.md, not fixed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 8 ACC v2.0 models + SyncMeta to prisma/schema.prisma** — `47e06ad` (feat)
2. **Task 2: Generate and apply additive migration on local dev** — `7d222fc` (feat)

## Files Created/Modified
- `prisma/schema.prisma` — 9 new models appended in new `// ============ MODULE: ACC V2.0 RELATIONAL LAYER ============` section
- `prisma/migrations/20260511155810_acc_v2_foundation/migration.sql` — additive DDL: 9 CREATE TABLE, 18 CREATE INDEX, 6 FK constraints
- `.planning/phases/01-foundation-schema-sync/deferred-items.md` — documents pre-existing `LodEmbedding.pgvector` drift (out of scope, NOT fixed)

## Decisions Made
- **Migration generation strategy:** Used `npx prisma migrate diff --from-schema <pre-task1> --to-schema <post-task1> --script` to produce a strictly-additive SQL script, then applied via `npx prisma migrate deploy`. This bypassed `prisma migrate dev`'s interactive reconciliation, which would have tried to drop the unrelated `LodEmbedding.pgvector` column. The diff-based path preserves the additive-only invariant.
- **DESC emission verification:** Inspected generated SQL — Prisma 7.8.0 emitted `"createdAt" DESC` in both AccActivity composite indexes without manual editing. Schema annotation + SQL agree.
- **No manual SQL edits performed.** The generated SQL is exactly what Prisma produced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing LodEmbedding.pgvector drift prevented `prisma migrate dev`**
- **Found during:** Task 2 (initial `npx prisma migrate dev --name acc_v2_foundation --create-only` invocation)
- **Issue:** Prisma's reconciliation against the live Supabase Postgres detected a `pgvector` column on `LodEmbedding` that exists in the DB but is NOT in the schema model. `migrate dev` warned it would drop 24,619 non-null values. Additionally, the executor shell is non-interactive, so `migrate dev` exited before generating SQL anyway.
- **Fix:** Switched to a strictly-additive generation path:
  1. `git show 47e06ad^:prisma/schema.prisma > /tmp/schema_before.prisma` (capture pre-task-1 schema)
  2. `npx prisma migrate diff --from-schema /tmp/schema_before.prisma --to-schema prisma/schema.prisma --script -o prisma/migrations/20260511155810_acc_v2_foundation/migration.sql`
  3. Manually created the migration directory `20260511155810_acc_v2_foundation`
  4. Applied via `npx prisma migrate deploy` (non-interactive, applies pending migration files)
  5. Verified `prisma migrate status` reports "Database schema is up to date!"
- **Files modified:** prisma/migrations/20260511155810_acc_v2_foundation/migration.sql (created)
- **Verification:** `grep -cE "DROP|ALTER.*DROP COLUMN|RENAME" migration.sql` → 0; `grep -c "^CREATE TABLE" migration.sql` → 9; `grep -cE "createdAt\" DESC" migration.sql` → 2; `prisma migrate status` clean.
- **Committed in:** `7d222fc` (Task 2 commit)

**2. [Scope-boundary log only] LodEmbedding.pgvector drift NOT fixed — logged to deferred-items.md**
- **Found during:** Task 2 (same Prisma reconciliation warning)
- **Issue:** Live DB has a column not modeled in schema. Pre-existing condition unrelated to ACC v2.0 work.
- **Fix:** None applied. Per executor scope-boundary rule, only issues directly caused by the current task are auto-fixed. Logged to `.planning/phases/01-foundation-schema-sync/deferred-items.md` for future cleanup with stakeholder sign-off.
- **Files modified:** .planning/phases/01-foundation-schema-sync/deferred-items.md (created)
- **Committed in:** `7d222fc`

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking) + 1 deferred (scope-boundary)
**Impact on plan:** Auto-fix preserved the additive-only invariant the plan demanded (`Strict additive rule`). No scope creep. The plan's Pitfall 3 (`sort: Desc` might emit ASC) did NOT materialize — Prisma 7.8.0 emits DESC correctly.

## Issues Encountered
- **Non-interactive shell incompatible with `migrate dev`** — resolved by switching to the `migrate diff` + `migrate deploy` flow (above).
- **Branch already contained downstream plan 01-02 commits** (`625854f`, `80ce197`, `9e76f88`) when this executor started. Did not interfere — used `git show 47e06ad^` to recover the true pre-task-1 schema for the diff.

## User Setup Required

None — no external service configuration required. Migration applies on local dev DB via `npx prisma migrate deploy` (already done in Task 2). Railway production will pick it up on next deploy via `prisma migrate deploy` in the release command (added in plan 01-03).

## Next Phase Readiness
- **Plan 01-02 (helpers extraction)** — already executed on this branch (commits `625854f`, `80ce197`, `9e76f88`). Can now reference AccProject types from `@prisma/client`.
- **Plan 01-03 (sync orchestration)** — can write to `AccDataConnectorJob` and `SyncMeta` immediately.
- **Plan 01-04 (freshness indicator)** — `SyncMeta` and `AccDataConnectorJob.completedAt` available for tRPC freshness query.
- **Phase 2 (extraction)** — all 8 domain models ready for dual-write population.
- **Phase 3 (ingest)** — `AccActivity` indexes already in place; no retroactive index pain.

**Pre-existing concern (carried forward, not introduced here):** `LodEmbedding.pgvector` schema drift — see `deferred-items.md`. Future Prisma migrations on `LodEmbedding` will trip the same warning unless addressed.

## Self-Check

- File exists: `prisma/schema.prisma` ✓
- File exists: `prisma/migrations/20260511155810_acc_v2_foundation/migration.sql` ✓
- File exists: `.planning/phases/01-foundation-schema-sync/deferred-items.md` ✓
- Commit exists: `47e06ad` (Task 1) ✓
- Commit exists: `7d222fc` (Task 2) ✓

**Self-Check: PASSED**

---
*Phase: 01-foundation-schema-sync*
*Completed: 2026-05-11*
