---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 01
subsystem: database
tags: [prisma, postgres, vitest, acc-data-connector, snapshot-tables, tdd-scaffold]

# Dependency graph
requires:
  - phase: 03-acc-activity-deep-sync
    provides: AccActivity v2 schema + AccDataConnectorJob stale-lock pattern (mirrored in AccDcIngestRun)
provides:
  - 16 AccDc* permission snapshot tables (User, Company, Project, Account, BusinessUnit, Role + 10 join tables)
  - AccDcIngestRun (every-run telemetry: rowsByModule, rowsByAdminCsv, quotaUsed, diffSummary, unknownModulesSeen)
  - AccDcBackfillProgress (per-project earliest/latestCovered + newProjectFlag for progressive backfill)
  - 6 RED Vitest stub files for Wave-1 TDD drivers
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []  # zero npm installs (all deps already in repo)
  patterns:
    - "Hand-filtered prisma migrate diff (mirrors Phase 3 03-01 pattern — prisma migrate dev refuses non-interactive shell)"
    - "ingestRunId + ingestedAt columns on every snapshot table (no FKs, audit trail via run id)"
    - "expect.fail('NOT YET IMPLEMENTED — ...') in test stubs so Wave-1 sees RED, not silent skip"

key-files:
  created:
    - prisma/migrations/20260516000000_acc_dc_tables/migration.sql
    - lib/acc/dcKnownBots.test.ts
    - lib/acc/dcAnomalyChecks.test.ts
    - lib/acc/dcActivityCsvIngest.test.ts
    - lib/acc/dcProgressiveBackfill.test.ts
    - lib/acc/dcAdminCsvIngest.test.ts
    - lib/acc/dcIngest.test.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Migration timestamp 20260516000000 — UTC date the snapshot tables landed; before any other Phase 8 plan."
  - "Zero FKs across the 18 AccDc* tables per CONTEXT.md decision (orphans tolerated; DC wins on conflict)."
  - "ingestRunId + ingestedAt columns added to ALL 16 snapshot tables, not stored centrally — cheap audit per row, no JOIN needed for 'which run wrote this'."
  - "AccDcProject.createdAt is NULLABLE despite being the floor for progressive backfill — admin_projects.csv may not always carry it; planner downgraded to nullable so the migration doesn't fail under partial CSVs. Wave 1 (plan 08-03) must handle null createdAt as 'use earliest known activity timestamp as floor'."
  - "Test stubs use expect.fail() instead of describe.skip() — guarantees Wave-1 executors see real RED, can't accidentally land green-by-skip."

patterns-established:
  - "AccDc* prefix namespace: parallel snapshot tables sit beside live-API Acc* tables; no overlap in writers."
  - "Composite @@id on join tables (no surrogate cuid) — matches CSV natural keys (projectId+userId+productKey) so re-ingest is deterministic."
  - "Wave-0 dependency-gate plan pattern: schema migration + RED test scaffolds in a single plan unblocks all downstream waves."

requirements-completed:
  - DC8-05
  - DC8-08
  - DC8-11

# Metrics
duration: 7min
completed: 2026-05-15
---

# Phase 8 Plan 01: Schema Foundation Summary

**18 new Prisma models (16 AccDc* snapshot + AccDcIngestRun + AccDcBackfillProgress) migrated to dev DB + 6 RED Vitest stubs scaffolded for Wave-1 TDD drivers — Wave-0 dependency gate satisfied.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-15T18:05:00Z
- **Completed:** 2026-05-15T18:12:09Z
- **Tasks:** 3
- **Files modified:** 8 (1 schema + 1 migration + 6 test stubs)

## Accomplishments
- Authored 18 Prisma models in `prisma/schema.prisma` (16 admin/permission snapshot tables + AccDcIngestRun + AccDcBackfillProgress) — `npx prisma validate` clean.
- Generated and hand-filtered migration SQL via `prisma migrate diff --from-empty --to-schema` (legacy `--to-schema-datamodel` flag removed in newer Prisma); 18 CREATE TABLE + 6 CREATE INDEX, zero ALTER/DROP on existing tables.
- Applied migration via `prisma migrate deploy`; runtime verification (`prisma.accDcIngestRun.count() === 0`, `prisma.accDcUser.count() === 0`, `prisma.accDcBackfillProgress.count() === 0`, `prisma.accDcProjectUserService.count() === 0`) confirms tables exist and respond.
- Scaffolded 6 RED Vitest stub files mapped to Wave-1 plans (08-02, 08-03, 08-04, 08-05, 08-06); all 6 fail with "NOT YET IMPLEMENTED" messages naming the implementing plan.

## Task Commits

1. **Task 1: Author Prisma schema additions for the 18 new models** — `af37a72` (feat)
2. **Task 2: Hand-write the additive migration SQL and apply on dev DB** — `8203344` (feat)
3. **Task 3: Scaffold 6 Vitest test files that RED-fail with NOT-IMPLEMENTED messages** — `6a5d20a` (test)

## Files Created/Modified
- `prisma/schema.prisma` — 196 lines appended: 16 snapshot models + AccDcIngestRun + AccDcBackfillProgress
- `prisma/migrations/20260516000000_acc_dc_tables/migration.sql` — 18 CREATE TABLE + 6 CREATE INDEX (additive)
- `lib/acc/dcKnownBots.test.ts` — DC8-02 RED stub → plan 08-02
- `lib/acc/dcAnomalyChecks.test.ts` — DC8-09 RED stub → plan 08-02
- `lib/acc/dcActivityCsvIngest.test.ts` — DC8-01, DC8-03 RED stub → plan 08-04
- `lib/acc/dcProgressiveBackfill.test.ts` — DC8-07, DC8-11, DC8-13 RED stub → plan 08-03
- `lib/acc/dcAdminCsvIngest.test.ts` — DC8-05, DC8-06 RED stub → plan 08-05
- `lib/acc/dcIngest.test.ts` — DC8-10 RED stub → plan 08-06

## Decisions Made
- **Model column type for AccDcProject.createdAt:** Nullable. CONTEXT calls it the floor for progressive backfill, but `admin_projects.csv` is observation-only — Wave-1 (08-03) must defend against null with an "earliest known activity timestamp" fallback rather than blocking ingest.
- **Migration generation flag:** `prisma migrate diff --to-schema` (NOT `--to-schema-datamodel` which was removed in @prisma/client ^7.8.0). Pattern documented for future phases.
- **No FK declarations on any of the 18 tables.** CONTEXT explicit: orphans tolerated, DC wins on conflict. Keeps migration trivial (no insert order dependency) and lets the transactional snapshot use `deleteMany` + `createMany` per table without referential constraint dance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate diff --to-schema-datamodel` flag removed**
- **Found during:** Task 2 (migration generation)
- **Issue:** Plan instructed `--to-schema-datamodel`; @prisma/client v7.8.0 removed it.
- **Fix:** Substituted `--to-schema` (per Prisma's own error message); identical output.
- **Files modified:** none (CLI invocation only)
- **Verification:** `migration.sql.raw` generated 1046 lines; filter kept 18 CREATE TABLE + 6 CREATE INDEX as expected.
- **Committed in:** `8203344` (Task 2 commit)

**2. [Rule 3 - Blocking] Plan's verify command can't construct PrismaClient without driver adapter**
- **Found during:** Task 2 (verification step)
- **Issue:** Plan suggested `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();..."` which throws PrismaClientInitializationError — this codebase requires `PrismaPg` adapter and explicit `connectionString`.
- **Fix:** Used the same `createPrisma()` shape as `scripts/dc-ingest-where-i-admin.cjs`: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 2 }), log: ['error'] })` after loading `dotenv`.
- **Files modified:** none (CLI invocation only — verification step ran inline).
- **Verification:** All 4 sample table counts returned 0 (table exists, empty).
- **Committed in:** `8203344` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking, both CLI-invocation only — no source code touched)
**Impact on plan:** Zero. Both deviations were tooling drift between the plan author's mental model and the live repo. Schema, migration content, and test contracts all match the plan exactly.

## Issues Encountered
- None. All three task verifications passed first try after the two Rule-3 CLI fixups.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 1 plans (08-02, 08-03, 08-04, 08-05) unblocked — RED test files exist, Prisma client knows the new models.
- AccActivity wipe (DC8-04) intentionally NOT done here; will live inside the first new ingest's transaction (per RESEARCH Pitfall 10) so the dashboard never sees an empty intermediate.
- AccDcProject.createdAt nullability is a known constraint Wave-1 (08-03) must handle.

## Self-Check: PASSED
- prisma/schema.prisma: FOUND (196 lines added, validate clean, 18 AccDc* models)
- prisma/migrations/20260516000000_acc_dc_tables/migration.sql: FOUND (applied successfully)
- lib/acc/dcKnownBots.test.ts: FOUND (RED)
- lib/acc/dcAnomalyChecks.test.ts: FOUND (RED)
- lib/acc/dcActivityCsvIngest.test.ts: FOUND (RED)
- lib/acc/dcProgressiveBackfill.test.ts: FOUND (RED)
- lib/acc/dcAdminCsvIngest.test.ts: FOUND (RED)
- lib/acc/dcIngest.test.ts: FOUND (RED)
- Commit af37a72: FOUND
- Commit 8203344: FOUND
- Commit 6a5d20a: FOUND

---
*Phase: 08-dc-per-module-ingest-permission-csvs*
*Completed: 2026-05-15*
