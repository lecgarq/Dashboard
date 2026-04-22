---
phase: 06-acc-project-intelligence
plan: "01"
subsystem: database
tags: [prisma, migration, acc, cache, postgresql]
dependency_graph:
  requires: []
  provides: [AccMemberCache-table]
  affects: [prisma/schema.prisma, prisma/migrations]
tech_stack:
  added: []
  patterns: [prisma-migrate-deploy, direct-url-migration]
key_files:
  created:
    - prisma/migrations/20260422000000_add_acc_member_cache/migration.sql
  modified:
    - prisma/schema.prisma
decisions:
  - "Used prisma migrate deploy (not migrate dev) because migrate dev requires interactive TTY — created migration SQL manually and deployed via direct URL (port 5432)"
  - "Migration used DIRECT_URL (port 5432) not pooler URL (port 6543) — pgbouncer rejects DDL statements via pooler"
  - "Did not use db push with --accept-data-loss — that would have dropped LodEmbedding.pgvector column containing 24619 live values"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 01: AccMemberCache Prisma Model and Migration Summary

**One-liner:** PostgreSQL AccMemberCache table created via hand-authored migration using direct Supabase URL, with email unique index and jsonb data column for ACC profile caching.

## What Was Built

Added the `AccMemberCache` Prisma model to `schema.prisma` and created the corresponding PostgreSQL table via a new migration. This table is the persistence layer for the ACC member profile cache that Plan 03's tRPC procedure will use.

**Model shape:**
- `id` — cuid primary key
- `email` — String, @unique (one cache entry per person)
- `data` — Json / PostgreSQL jsonb (stores full AccProfile: found/not-found shape)
- `syncedAt` — DateTime, no default (procedure sets explicitly for TTL logic)
- `createdAt` — DateTime, @default(now())
- Indexes on `email` (query optimization) and `syncedAt` (future stale-record cleanup)

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add AccMemberCache model to schema.prisma | 8b3fb85 | Complete |
| 2 | Run Prisma migration to create AccMemberCache table | db5a241 | Complete |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] prisma migrate dev cannot run non-interactively**
- **Found during:** Task 2
- **Issue:** `prisma migrate dev` requires an interactive TTY. Running it in a non-interactive shell produces "environment is non-interactive" error.
- **Fix:** Created migration SQL file manually at `prisma/migrations/20260422000000_add_acc_member_cache/migration.sql` and applied with `prisma migrate deploy` (non-interactive, deployment-safe command).
- **Files modified:** `prisma/migrations/20260422000000_add_acc_member_cache/migration.sql`
- **Commit:** db5a241

**2. [Rule 3 - Blocking] pgbouncer pooler rejects DDL statements**
- **Found during:** Task 2
- **Issue:** `prisma db push` against the pooler URL (port 6543) fails with `prepared statement "s0" does not exist` — pgbouncer in transaction mode does not support prepared statements used by Prisma's schema engine.
- **Fix:** Used `DIRECT_URL` (port 5432, direct PostgreSQL connection) for all migration commands.
- **Commit:** db5a241

**3. [Rule 3 - Blocked, avoided] db push --accept-data-loss rejected**
- **Found during:** Task 2
- **Issue:** `prisma db push` detected a pending drift on `LodEmbedding.pgvector` (24619 non-null rows) and required `--accept-data-loss`. This flag would have destroyed live data.
- **Fix:** Used `migrate deploy` with the hand-authored migration instead of `db push`, keeping all existing data intact.

## Self-Check

- [x] `prisma/schema.prisma` contains `model AccMemberCache` with all required fields
- [x] `prisma/migrations/20260422000000_add_acc_member_cache/migration.sql` exists
- [x] `npx prisma validate` passes: "The schema at prisma/schema.prisma is valid"
- [x] `npx prisma migrate status` shows "Database schema is up to date!"
- [x] Prisma Client regenerated (v7.7.0) — `ctx.db.accMemberCache` is now accessible in TypeScript
- [x] Existing LodEmbedding data preserved (no --accept-data-loss used)
