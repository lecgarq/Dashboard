---
phase: 01-foundation
plan: 01
subsystem: api
tags: [trpc, prisma, typescript, acc-admin, refactor]

# Dependency graph
requires: []
provides:
  - getAccountId(db) helper at module scope in server/routers/users.ts
  - Centralized b. prefix stripping for ACC Admin API hub UUID
affects: [future ACC Admin API endpoints, syncAccUser, bulkAccSync, syncHubRoles]

# Tech tracking
tech-stack:
  added: []
  patterns: [module-scope async helper with db: any parameter (matches rebuildAccGraphCache pattern)]

key-files:
  created: []
  modified:
    - server/routers/users.ts

key-decisions:
  - "Used db: any for getAccountId parameter type to match existing rebuildAccGraphCache(db: any) pattern — no PrismaClient import needed"
  - "Descriptive error message from syncAccUser used in helper (Set APS_HUB-ID in Railway environment variables) — replaces shorter bulkAccSync message"

patterns-established:
  - "Module-scope async helper pattern: async function helperName(db: any) placed before usersRouter export"
  - "All ACC Admin API endpoints must call await getAccountId(ctx.db) — never inline b. prefix strip"

requirements-completed: [FOUND-03]

# Metrics
duration: 8min
completed: 2026-04-28
---

# Phase 01 Plan 01: getAccountId Helper Extraction Summary

**Centralized ACC Admin API hub UUID extraction via getAccountId(db) helper, eliminating b. prefix strip duplication across all three ACC mutations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T00:00:00Z
- **Completed:** 2026-04-28T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `async function getAccountId(db: any): Promise<string>` at module scope before `usersRouter`
- Replaced inline 10-line `apsHubId` strip block in `syncAccUser` with single `await getAccountId(ctx.db)` call
- Replaced inline 8-line `apsHubId` strip block in `bulkAccSync` with single `await getAccountId(ctx.db)` call
- Also updated `syncHubRoles` (third duplicate discovered and fixed per Rule 2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract getAccountId helper and update call sites** - `93c9b3e` (refactor)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `server/routers/users.ts` - Added getAccountId helper at line 211; replaced 3 inline duplication blocks with calls

## Decisions Made

- Used `db: any` for the helper parameter type to match the existing `rebuildAccGraphCache(db: any)` pattern — avoids importing PrismaClient separately
- The more descriptive error message ("Set APS_HUB-ID in Railway environment variables.") was used in the shared helper, replacing the shorter bulkAccSync message

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated syncHubRoles — third inline apsHubId strip**
- **Found during:** Task 1 (verification grep)
- **Issue:** Plan targeted syncAccUser and bulkAccSync, but syncHubRoles at line 1399 had an identical inline pattern — leaving it would defeat the purpose of the helper
- **Fix:** Replaced 4-line inline block in syncHubRoles with `await getAccountId(ctx.db)`
- **Files modified:** server/routers/users.ts
- **Verification:** `grep -n "apsHubId.*replace"` returns only the helper's own line 213 — zero call-site duplicates remain
- **Committed in:** 93c9b3e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical consistency fix)
**Impact on plan:** Fix necessary to fully achieve FOUND-03 intent. No scope creep — same pattern, same file, same mechanism.

## Issues Encountered

- Pre-existing TypeScript error in `vitest.setup.ts` (NODE_ENV read-only) — unrelated to this refactor, out of scope, logged to deferred items

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FOUND-03 requirement met: getAccountId helper established as the authoritative source for hub UUID extraction
- All current ACC Admin mutations updated; any new mutations added in later phases must call `await getAccountId(ctx.db)`
- No blockers introduced

---
*Phase: 01-foundation*
*Completed: 2026-04-28*
