---
phase: 09-db-config-hardening
plan: "02"
subsystem: database
tags: [prisma, postgresql, index, migration, db-hardening]

# Dependency graph
requires:
  - phase: 09-01
    provides: SSL fossil removed, env vars documented, raw-scan guardrail added, OOM regression test added
provides:
  - "Standalone acc_folder_permission_role_id_idx index on AccFolderPermission.roleId in live Postgres"
  - "prisma/schema.prisma AccFolderPermission @@index([roleId]) declaration"
  - "Tracked raw migration 20260623000000_add_acc_folder_permission_role_id_index registered via prisma migrate resolve"
  - "EXPLAIN ANALYZE evidence: Bitmap Index Scan using acc_folder_permission_role_id_idx"
  - "Rebuilt and restarted :3000 with npx tsc --noEmit clean"
affects: [10-boundary-fixes, 11-truth-labels, 14-char-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw CREATE INDEX migration + prisma migrate resolve pattern (not prisma migrate dev — pgvector Unsupported column choke)"
    - "pg Client via DATABASE_URL for applying raw SQL when psql is available but dotenv-loaded connection is preferred"

key-files:
  created:
    - prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Apply index now + rebuild (per 09-CONTEXT.md locked decision — local single-user DB, brief lock acceptable)"
  - "Standard CREATE INDEX (not CONCURRENTLY) — correct for local single-user Postgres"
  - "Used node pg Client with dotenv DATABASE_URL to apply SQL (psql on PATH but pg Client is the repo's existing raw-SQL pattern)"
  - "EXPLAIN ANALYZE witness: low-frequency roleId (count=1) producing Bitmap Index Scan (not Seq Scan)"

patterns-established:
  - "Raw index migration: CREATE INDEX IF NOT EXISTS + prisma migrate resolve --applied (not migrate dev)"

requirements-completed: [DB-01]

# Metrics
duration: 15min
completed: 2026-06-23
status: complete
---

# Phase 09 Plan 02: DB-01 roleId Index Migration Summary

**Standalone acc_folder_permission_role_id_idx index added to AccFolderPermission (~6M rows), proven with EXPLAIN ANALYZE Bitmap Index Scan, and dashboard rebuilt on :3000 with clean tsc gate**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-23
- **Completed:** 2026-06-23
- **Tasks:** 3 (all complete)
- **Files modified:** 2 (prisma/schema.prisma, migration.sql)

## Accomplishments

- Added `@@index([roleId])` to `AccFolderPermission` in `prisma/schema.prisma` (after existing `@@index([folderId])`, keeping `@@unique([folderId, roleId])`)
- Created and applied raw migration `20260623000000_add_acc_folder_permission_role_id_index/migration.sql` with `CREATE INDEX IF NOT EXISTS "acc_folder_permission_role_id_idx" ON "AccFolderPermission" ("roleId")` (standard, no CONCURRENTLY)
- Registered migration via `npx prisma migrate resolve --applied` — `prisma migrate status` returned "Database schema is up to date!" (19 migrations)
- Proved index with EXPLAIN ANALYZE on low-frequency roleId (count=1): `Bitmap Index Scan on acc_folder_permission_role_id_idx` with `Index Cond: ("roleId" = ...)`, Execution Time 0.272ms
- `npx tsc --noEmit` passed cleanly (zero errors/warnings)
- `npm run build` succeeded; `LECG Dashboard Local` scheduled task restarted; port 3000 confirmed Listening

## Task Commits

1. **Task 1: Declare @@index([roleId]) and author raw CREATE INDEX migration** - `8d517adb` (feat)
2. **Task 2: Apply index to live Postgres + migrate resolve + EXPLAIN ANALYZE** — no file commit (pure DB operations; migration.sql already committed in Task 1)
3. **Task 3: Typecheck gate, rebuild, restart :3000** — no new file commit (rebuild is a build artifact, not a source commit; `docs/erd.md` auto-updated by `npx prisma generate` but not staged — it is a generated file)

## Files Created/Modified

- `prisma/schema.prisma` — Added `@@index([roleId])` to AccFolderPermission model (line 540); no other model changed
- `prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql` — Single `CREATE INDEX IF NOT EXISTS "acc_folder_permission_role_id_idx" ON "AccFolderPermission" ("roleId")` statement (no CONCURRENTLY); follows precedent of `20260618230000_add_acc_activity_email_project_index`

## Evidence Log

### Task 2: DB Operations

**Index applied:**
```
CREATE INDEX result: CREATE
```

**pg_indexes confirmation:**
```json
{"indexname":"acc_folder_permission_role_id_idx","tablename":"AccFolderPermission"}
```

**prisma migrate resolve:**
```
Migration 20260623000000_add_acc_folder_permission_role_id_index marked as applied.
```

**prisma migrate status:**
```
19 migrations found in prisma/migrations
Database schema is up to date!
```

**Low-frequency roleId used as witness:** `e15803e9-e6d7-4c11-9cf2-c43429efaadd` (count=1 — guarantees planner chooses index over seqscan)

**EXPLAIN ANALYZE output (full):**
```
Bitmap Heap Scan on "AccFolderPermission" fp  (cost=11.21..3305.65 rows=875 width=63) (actual time=0.207..0.207 rows=1.00 loops=1)
  Recheck Cond: ("roleId" = 'e15803e9-e6d7-4c11-9cf2-c43429efaadd'::text)
  Heap Blocks: exact=1
  Buffers: shared read=4
  ->  Bitmap Index Scan on acc_folder_permission_role_id_idx  (cost=0.00..10.99 rows=875 width=0) (actual time=0.086..0.086 rows=1.00 loops=1)
        Index Cond: ("roleId" = 'e15803e9-e6d7-4c11-9cf2-c43429efaadd'::text)
        Index Searches: 1
        Buffers: shared read=3
Planning Time: 1.192 ms
Execution Time: 0.272 ms
```

Note: The planner chose `Bitmap Index Scan` (not plain `Index Scan`) because it's fetching from heap pages after the index lookup. This is correct index usage for this query shape — the index `acc_folder_permission_role_id_idx` is the access path. The plan satisfies the DB-01 success criterion: the index is in use.

### Task 3: Typecheck + Rebuild

**npx tsc --noEmit:** Clean (zero output = zero errors)

**npm run build:** Succeeded — all four workshop routes confirmed in build output (`/access-analysis`, `/template-mty`, `/forma-proposal`, `/users`)

**Scheduled task:** `LECG Dashboard Local` stopped before build, restarted after; state confirmed `Running`; port 3000 confirmed `Listen`

## Decisions Made

- **Raw SQL apply method:** Used `node pg Client` with `DATABASE_URL` (consistent with repo's existing connection pattern; `psql` also available on PATH but the pg Client approach avoids psql shell-escaping complexity)
- **EXPLAIN ANALYZE approach:** Used low-frequency roleId (count=1) directly — no need for `SET enable_seqscan = off` fallback; the planner chose the index naturally
- **docs/erd.md:** Auto-generated by `npx prisma generate` (ERD plugin); not staged or committed — it is a generated artifact, not a source file tracked by this plan

## Deviations from Plan

None — plan executed exactly as written.

- The EXPLAIN ANALYZE plan line is `Bitmap Index Scan on acc_folder_permission_role_id_idx` rather than plain `Index Scan`. This is the correct planner choice for a 1-row heap fetch after index lookup; both variants confirm the index is being used. The DB-01 success criterion is met.

## Issues Encountered

None.

## Workshop Impact

No visible change to the four workshop pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`). Indirect benefit: role-joined terrain queries (e.g., `folderPermissionTerrainView.ts` top-roles GROUP BY, `templateFolderTerrain.ts` per-project join, `acc-hot-cache.ts` GROUP BY aggregate) now have a roleId index available, speeding roleId-leading scans over the ~6M AccFolderPermission rows.

## Data Truthfulness Notes

No data values changed. The index is a pure performance optimization on the existing `AccFolderPermission` data. No analytics, ingestion, or data-coverage labeling changed.

## Next Phase Readiness

- DB-01 is closed. Phase 09 is now complete (09-01 + 09-02 both done).
- `:3000` is rebuilt and running with the new index active.
- Phase 10 (boundary fixes) can proceed independently; no DB-01 prerequisite for boundary work.
- Phase 11 (TRUTH labels) depends on Phase 09 only — now unblocked.

---

## Dashboard self-check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md`, `09-CONTEXT.md`, `09-02-PLAN.md`, `prisma/schema.prisma` (lines 529-540), `prisma/migrations/20260618230000_add_acc_activity_email_project_index/migration.sql`, `.claude/skills/lecg-dashboard/references/deploy-sequence.md` — all read.
- **Evidence:** AccFolderPermission model verified at schema lines 529-541; migration precedent at `20260618230000_add_acc_activity_email_project_index/migration.sql`; pg_indexes row confirmed; EXPLAIN ANALYZE output captured; tsc clean; build succeeded; port 3000 listening.
- **Constraints:** No UI changes; no WebGL; zinc theme untouched; `/users/spatial-graph` not touched; diff touches only `prisma/schema.prisma` and `prisma/migrations/20260623000000_add_acc_folder_permission_role_id_index/migration.sql`. `npx tsc --noEmit` gated before rebuild. `not prisma migrate dev` — pgvector choke locked decision followed.
- **Gates:** `prisma migrate resolve` → `prisma migrate status` clean → `EXPLAIN ANALYZE` index proof → `npx tsc --noEmit` → `npm run build` → Task Scheduler restart → port 3000 confirmed.
- **VERIFY:** none.

---
*Phase: 09-db-config-hardening*
*Completed: 2026-06-23*
