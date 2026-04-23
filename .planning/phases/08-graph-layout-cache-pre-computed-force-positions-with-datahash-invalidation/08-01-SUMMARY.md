---
phase: 08-graph-layout-cache-pre-computed-force-positions-with-datahash-invalidation
plan: "01"
subsystem: database
tags: [prisma, postgresql, supabase, migration, schema]

requires:
  - phase: 07-acc-analysis-graph
    provides: AccMemberCache model used as data source for graph cache invalidation

provides:
  - AccGraphLayoutCache singleton table in PostgreSQL (Supabase)
  - ctx.db.accGraphLayoutCache typed Prisma client accessor
  - Migration SQL on disk for audit/deploy reproducibility

affects:
  - 08-02 (tRPC getGraphLayout / saveGraphLayout procedures depend on this model)
  - 08-03 (client-side cache consumer reads via tRPC)

tech-stack:
  added: []
  patterns:
    - "Singleton table pattern: @id @default(\"singleton\") enforces exactly one row; safe upsert via Prisma"
    - "Float[] positions array: mirrors LodEmbedding.vector Float[] precedent for flat coordinate storage"
    - "migrate deploy (not migrate dev) for non-interactive migration runs"

key-files:
  created:
    - prisma/migrations/20260423000000_add_acc_graph_layout_cache/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Used migrate deploy (not migrate dev) for non-interactive CI-compatible migration execution"
  - "Singleton id @default(\"singleton\") enforces exactly one cache row without extra unique constraints"
  - "positions Float[] maps to PostgreSQL float8[] — no pgvector dependency needed for xy coordinate storage"

patterns-established:
  - "Singleton model pattern: fixed string @id @default(\"singleton\") + upsert = safe single-row cache"

requirements-completed:
  - GRAPH-CACHE-01

duration: 2min
completed: "2026-04-23"
---

# Phase 08 Plan 01: AccGraphLayoutCache Schema and Migration Summary

**AccGraphLayoutCache singleton Prisma model deployed to Supabase with Float[] positions, dataHash, nodeCount, and @updatedAt — ctx.db.accGraphLayoutCache now typed and available for tRPC procedures**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-23T22:16:50Z
- **Completed:** 2026-04-23T22:18:27Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `AccGraphLayoutCache` model to `prisma/schema.prisma` using singleton id pattern (`@id @default("singleton")`)
- Created and deployed migration `20260423000000_add_acc_graph_layout_cache` via direct Supabase connection (port 5432)
- Regenerated Prisma client — `ctx.db.accGraphLayoutCache` is fully typed with 29 references in `index.d.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AccGraphLayoutCache model and run migration** - `e389bcb` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified

- `prisma/schema.prisma` - Added AccGraphLayoutCache model at end of file under new section comment
- `prisma/migrations/20260423000000_add_acc_graph_layout_cache/migration.sql` - CREATE TABLE DDL for AccGraphLayoutCache

## Decisions Made

- Used `migrate deploy` instead of `migrate dev` — the environment is non-interactive (bash shell without TTY), consistent with Phase 6 Plan 01 decision recorded in STATE.md
- Manually created migration SQL file to avoid `migrate dev` TTY requirement, then deployed with `migrate deploy`
- `@id @default("singleton")` enforces one-row invariant without needing a separate UNIQUE constraint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched from migrate dev to migrate deploy + manual SQL**
- **Found during:** Task 1
- **Issue:** `migrate dev` detected a non-interactive environment and exited with error. Additionally, a pre-existing pgvector column drift warning appeared (unrelated, out of scope)
- **Fix:** Created migration SQL file manually matching Prisma's DDL format, then applied with `migrate deploy` — same pattern used in Phase 6 Plan 01
- **Files modified:** prisma/migrations/20260423000000_add_acc_graph_layout_cache/migration.sql
- **Verification:** `migrate deploy` output confirmed "All migrations have been successfully applied"
- **Committed in:** e389bcb (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — non-interactive migration environment)
**Impact on plan:** No scope change. Same migration deployed, same result. Pre-existing pgvector drift is out of scope and left for a future cleanup.

## Issues Encountered

- `migrate dev` exited immediately in non-interactive shell — resolved by creating SQL manually and using `migrate deploy` (consistent with documented Phase 6 approach)
- Pre-existing `pgvector` column on `LodEmbedding` table not in schema causes drift warning — out of scope for this plan, deferred

## User Setup Required

None - no external service configuration required. Migration runs automatically via Prisma deploy.

## Next Phase Readiness

- `ctx.db.accGraphLayoutCache` is available in all tRPC procedures immediately
- Plan 02 can add `getGraphLayout` and `saveGraphLayout` tRPC procedures using `accGraphLayoutCache.findFirst()` and `accGraphLayoutCache.upsert()`
- No blockers

---
*Phase: 08-graph-layout-cache-pre-computed-force-positions-with-datahash-invalidation*
*Completed: 2026-04-23*
