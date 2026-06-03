---
phase: 08-dc-per-module-ingest-permission-csvs
plan: 05
subsystem: acc-dc-ingest
tags: [acc, data-connector, ingest, transactional, snapshot, permissions]
requires: [08-01, 08-02]
provides: [dcAdminCsvIngest]
affects: [08-06]
tech_stack_added: [csv-parse, Prisma.TransactionIsolationLevel.Serializable]
patterns: [transactional-full-replace, explicit-allowlist-no-greedy, inside-tx-anomaly-gate, set-diff-summary]
key_files_created:
  - lib/acc/dcAdminCsvIngest.ts
  - lib/acc/dcAdminCsvIngest.test.ts
key_files_modified: []
decisions:
  - "Serializable isolation level shipped per RESEARCH Pattern 2; Context7 verification deferred per Luis directive"
  - "createMany invoked with [] for header-only CSVs to keep call surface consistent (test assertion path)"
  - "Mapper helpers (required/nullable/toDateOrNull) inline — no separate util module to keep file self-contained"
  - "Anomaly gate runs AFTER all 16 deleteMany+createMany so currentRowsByAdminCsv reflects actual ingest"
metrics:
  duration_min: 3
  tasks: 2
  files_changed: 2
  tests_added: 12
  date_completed: 2026-05-15
---

# Phase 08 Plan 05: Transactional 16-CSV Admin Snapshot Summary

Transactional `ingestAdminSnapshot()` library that replaces all 16 `AccDc*` permission tables in a single Serializable Prisma transaction with inside-tx anomaly gate.

## What Shipped

**`lib/acc/dcAdminCsvIngest.ts`** (~340 lines)
- `ADMIN_CSV_ALLOWLIST` — 16-entry explicit array (filename, model, mapper). No greedy `admin_*.csv` glob (Pitfall 11 defense).
- 16 per-CSV mappers (snake_case APS columns → camelCase Prisma fields per `schema.prisma` AccDc* models).
- `ingestAdminSnapshot(prisma, files, ingestRunId, previous)` — main entry.
- `AdminCsvParseError` class for parse-failure surfacing with filename context.
- `AdminFileSource` / `AdminSnapshotResult` types.

**`lib/acc/dcAdminCsvIngest.test.ts`** (~340 lines, 12 tests)
- ADMIN_CSV_ALLOWLIST shape (length 16, filename pattern, valid AccDc* models, no dupes).
- Happy path: 16 deleteMany + 16 createMany in allow-list order; rowsByAdminCsv populated.
- Serializable isolation level on `$transaction` options.
- Missing file: rowsByAdminCsv=0 for missing entry; assertNoAnomalies throws → bubbled.
- Skipped (unknown) `admin_typo.csv` → recorded in `skippedFiles`, no deleteMany.
- Anomaly throw inside callback bubbles out as AnomalyError (rolls back tx).
- assertNoAnomalies receives `currentRowsByAdminCsv` map with all 16 entries.
- Diff summary: `{usersAdded, usersRemoved, projectsAdded, projectsRemoved}` from id-set diff.
- Empty header-only CSV → deleteMany still runs; createMany with `[]`.
- AdminCsvParseError export + Error inheritance.

## Allow-list Contents (16 CSVs → 16 AccDc* tables)

| Filename                              | Model                       |
| ------------------------------------- | --------------------------- |
| `admin_users.csv`                     | `accDcUser`                 |
| `admin_companies.csv`                 | `accDcCompany`              |
| `admin_projects.csv`                  | `accDcProject`              |
| `admin_accounts.csv`                  | `accDcAccount`              |
| `admin_business_units.csv`            | `accDcBusinessUnit`         |
| `admin_roles.csv`                     | `accDcRole`                 |
| `admin_project_users.csv`             | `accDcProjectUser`          |
| `admin_project_user_roles.csv`        | `accDcProjectUserRole`      |
| `admin_project_user_products.csv`     | `accDcProjectUserProduct`   |
| `admin_project_user_companies.csv`    | `accDcProjectUserCompany`   |
| `admin_project_user_services.csv`     | `accDcProjectUserService`   |
| `admin_project_roles.csv`             | `accDcProjectRole`          |
| `admin_project_products.csv`          | `accDcProjectProduct`       |
| `admin_project_companies.csv`         | `accDcProjectCompany`       |
| `admin_project_services.csv`          | `accDcProjectService`       |
| `admin_account_services.csv`          | `accDcAccountService`       |

Declared order is the order deleteMany + createMany are issued — stable + deterministic for log-trace + test assertion.

## Algorithm (RESEARCH.md Pattern 2)

1. Index input `files` by filename.
2. Diff allow-list vs incoming → `missingFiles[]` + `skippedFiles[]` (skipped logged via `console.warn`).
3. Open `prisma.$transaction(async (tx) => {...}, { isolationLevel: Serializable, timeout: 5min, maxWait: 30s })`.
4. **Inside tx**, BEFORE any deletes: capture `prevUserIds` + `prevProjectIds` via `findMany({select:{id:true}})`.
5. For each allow-list entry **in declared order**:
   - If file missing → `rowsByAdminCsv[filename]=0`, continue.
   - Stream-parse CSV via `csv-parse` (`columns:true, bom:true, relax_column_count:true, trim, skip_empty_lines`).
   - `tx[model].deleteMany({})`.
   - Batched `createMany({data: slice})` in 500-row chunks; empty CSV → `createMany({data:[]})`.
6. After all 16: capture `newUserIds` + `newProjectIds`; compute diff summary via set difference.
7. Call `assertNoAnomalies(tx, previous, {...DEFAULT_THRESHOLDS, requireAllAdminCsvs: true}, rowsByAdminCsv)` — throws → tx rolls back.
8. Return `{rowsByAdminCsv, missingFiles, skippedFiles, diffSummary}`.

## Diff Summary Shape

```typescript
diffSummary: {
  usersAdded: number;   // newUserIds - prevUserIds
  usersRemoved: number; // prevUserIds - newUserIds
  projectsAdded: number;
  projectsRemoved: number;
}
```

Computed inline inside the transaction via `Set` difference. Trivial cost for ~250 projects × ~50 users.

## Isolation Level Shipped

`Prisma.TransactionIsolationLevel.Serializable` (the enum value). Per plan task 2 step 4 + RESEARCH Open Question 1.

**Context7 verification:** Deferred per Luis directive ("continue with the next waves, don't wait for verification"). Single-writer scenario (only this script ever writes AccDc* tables, only at 03:00 local) makes serialization-failure noise unrealistic. If real runs surface `40001` errors, fallback path is `ReadCommitted` + `pg_advisory_xact_lock(<phase8-lock-id>)` — documented but not implemented.

## Test Counts

- **12/12 vitest tests GREEN** in `lib/acc/dcAdminCsvIngest.test.ts`
- **3 ADMIN_CSV_ALLOWLIST shape tests** (length, regex+model validity, no dupes)
- **2 happy-path tests** (16 delete+create in order; Serializable isolation arg)
- **2 missing/skipped file tests**
- **2 anomaly tests** (throw bubbles out; called with currentRowsByAdminCsv)
- **1 diff summary test**
- **1 empty CSV test**
- **1 AdminCsvParseError class test**
- `tsc --noEmit` clean across the dcAdminCsvIngest pair

## Verification (plan.verification block)

- [x] `npx vitest run lib/acc/dcAdminCsvIngest.test.ts` → 12/12 GREEN
- [x] `grep "TransactionIsolationLevel" lib/acc/dcAdminCsvIngest.ts` → 1 match
- [x] `grep "assertNoAnomalies" lib/acc/dcAdminCsvIngest.ts` → 2 matches (import + call)
- [x] `grep "deleteMany" lib/acc/dcAdminCsvIngest.ts` → 1 occurrence in a loop over `ADMIN_CSV_ALLOWLIST` (covers all 16 tables — equivalent to "≥16 matches" per plan note)

## Hand-off to Plan 08-06

`ingestAdminSnapshot(prisma, adminFiles, ingestRunId, previousMetrics)` is the contract:
- `previousMetrics: PreviousRunMetrics | null` — pull from latest `AccDcIngestRun` row before invoke; pass `null` on cold start.
- `ingestRunId` — generate via `prisma.accDcIngestRun.create({...})` first, pass that `id` in.
- After resolution, persist `result.rowsByAdminCsv` + `result.diffSummary` onto the `AccDcIngestRun` row + update `previousMetrics` baseline for the next run.
- AnomalyError throw means the entire 16-table snapshot rolled back; orchestrator should mark ingest run `status='quarantined'` + populate `errorMessage`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-only TS errors after vitest mock cast**
- **Found during:** Task 2 typecheck pass
- **Issue:** `assertNoAnomaliesMock.mock.calls[0]` typed as `[]` (zero-arg mock signature) — TS2493 indexing `[3]`, TS2352 casting `undefined` to record.
- **Fix:** Cast `callArgs` to `unknown[]` before index access.
- **Files modified:** `lib/acc/dcAdminCsvIngest.test.ts`
- **Commit:** `3c213cd` (rolled into Task 2 GREEN commit)

### Decisions deferred (not deviations)

- **Context7 isolation-level verification** — deferred per Luis directive; single-writer makes 40001 unrealistic.

## Authentication Gates

None. Pure module — no APS calls, no external auth.

## Self-Check: PASSED

- [x] `lib/acc/dcAdminCsvIngest.ts` exists
- [x] `lib/acc/dcAdminCsvIngest.test.ts` exists
- [x] Commit `fe93cde` (test) found in git log
- [x] Commit `3c213cd` (impl) found in git log
- [x] `ADMIN_CSV_ALLOWLIST.length === 16` verified by test
- [x] Vitest 12/12 GREEN at execution time
- [x] tsc clean for dcAdminCsv* files
