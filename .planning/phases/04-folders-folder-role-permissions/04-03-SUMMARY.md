---
phase: 04-folders-folder-role-permissions
plan: 03
subsystem: database
tags: [prisma, trpc, postgres, migration, acc-folders]

# Dependency graph
requires:
  - phase: 03-activity-pipeline
    provides: Hand-wrote migration pattern via prisma migrate diff + deploy (non-interactive shell)
provides:
  - AccProject.folderCrawlStatus column (TEXT NOT NULL DEFAULT 'never') — stable surface for Plan 04 crawl writer
  - accFoldersRouter registered under key 'accFolders' in appRouter — Plans 05/06 build against this
  - Migration file 20260511234124_acc_project_folder_crawl_status/migration.sql for Railway deploy traceability
affects: [04-04-folder-crawl, 04-05-folder-matrix, 04-06-folder-widget, 05-ui-enrichment-waves]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-write migration SQL + apply via prisma migrate deploy (non-interactive shell, Phase 3 precedent maintained)"
    - "Scaffold placeholder router with ping procedure so downstream plans have a stable import surface before real procedures exist"

key-files:
  created:
    - prisma/migrations/20260511234124_acc_project_folder_crawl_status/migration.sql
    - server/routers/acc-folders.ts
  modified:
    - prisma/schema.prisma
    - server/routers/root.ts

key-decisions:
  - "Migration timestamp: 20260511234124 — use this exact filename for any Railway deploy audit trail"
  - "Additive NOT NULL DEFAULT 'never' is safe on existing rows; no locking issue on Supabase pooled connection"
  - "accFoldersRouter contains only ping placeholder; getMatrix/getOrphanRoles/getProjectFolderTree are Plan 05 scope"

patterns-established:
  - "Wave 1 = schema + router scaffold; Wave 2 = real procedures against stable interface"

requirements-completed: [FLDR-01]

# Metrics
duration: 8min
completed: 2026-05-11
---

# Phase 04 Plan 03: Schema Migration + accFolders Router Scaffold Summary

**Additive `folderCrawlStatus` column on AccProject via hand-wrote migration (20260511234124) + placeholder accFoldersRouter registered at `trpc.accFolders` for Wave 2 build surface**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-11T23:38:00Z
- **Completed:** 2026-05-11T23:46:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Applied additive `ALTER TABLE "AccProject" ADD COLUMN "folderCrawlStatus" TEXT NOT NULL DEFAULT 'never'` — zero pending migrations after deploy
- Regenerated Prisma client (v7.8.0); `npx tsc --noEmit` exits 0
- Created `server/routers/acc-folders.ts` with `ping` placeholder; registered under `accFolders` key in `appRouter`
- All existing rows default to `'never'` — safe for Railway deploy on existing data

## Task Commits

Each task was committed atomically:

1. **Task 1: Add folderCrawlStatus + migration** - `0675ea1` (feat)
2. **Task 2: Scaffold accFolders router + root registration** - `29bf05b` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `prisma/schema.prisma` — Added `folderCrawlStatus String @default("never")` to AccProject between `status` and `createdAt`
- `prisma/migrations/20260511234124_acc_project_folder_crawl_status/migration.sql` — Single additive ALTER TABLE statement; safe for production
- `server/routers/acc-folders.ts` — New file; exports `accFoldersRouter` with `ping` placeholder
- `server/routers/root.ts` — Added import + `accFolders: accFoldersRouter` registration

## Decisions Made
- Hand-wrote migration SQL following Phase 3 precedent (`prisma migrate dev` is interactive-only; `prisma migrate deploy` is non-interactive and safe for Railway)
- Migration is additive-only (no DROP/RENAME); NOT NULL with DEFAULT avoids needing a backfill step on existing rows
- Router intentionally minimal — `ping` only. Plan 05 owns the real procedures. This prevents Plans 05 and 06 from being blocked by each other.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Railway will run `prisma migrate deploy` automatically on next deploy (migration is already applied to production DB via direct deploy from dev).

> **Railway deploy note:** The migration has already been applied to the production Supabase database (migrate deploy ran against the live DB). The `migration.sql` file is committed so Railway's release step will see it as already applied and skip it safely.

## Next Phase Readiness
- Plan 04 (`lib/acc/folderCrawl.ts`) can now write `folderCrawlStatus` on AccProject
- Plan 05 procedures (`getMatrix`, `getOrphanRoles`, `getProjectFolderTree`) have a registered router to extend
- Plan 06 widget can bind `trpc.accFolders.ping.useQuery()` today as a stub, swap to real procedures when Plan 05 lands
- No blockers for Wave 2

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-11*
