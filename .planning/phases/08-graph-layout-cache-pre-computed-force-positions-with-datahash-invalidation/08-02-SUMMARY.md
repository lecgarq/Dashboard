---
phase: 08-graph-layout-cache-pre-computed-force-positions-with-datahash-invalidation
plan: "02"
subsystem: graph-cache
tags: [trpc, react, cache, force-layout, performance]

requires:
  - phase: 08-graph-layout-cache
    plan: "01"
    provides: ctx.db.accGraphLayoutCache Prisma accessor (singleton table)

provides:
  - getGraphLayout adminProcedure (hit/miss with positions + dataHash)
  - saveGraphLayout adminProcedure (upsert Float[] positions + nodeCount)
  - invalidateGraphLayout adminProcedure (deleteMany for safe fresh-DB reset)
  - AccUsersGraph cache integration: skip simulation on hit, save on miss
  - Refresh Layout toolbar button with spinner and double-click guard

affects:
  - 08-03 (end-to-end validation reads from these procedures)

tech-stack:
  added: []
  patterns:
    - "tRPC adminProcedure discriminated union: hit: true as const / hit: false as const for TypeScript narrowing"
    - "fire-and-forget useMutation save after simulation — onError swallowed silently"
    - "useEffect dependency on layoutQuery.data causes re-run when cache result arrives"
    - "isRefreshingRef double-click guard — prevents two concurrent simulations"

key-files:
  created: []
  modified:
    - server/routers/users.ts
    - app/(dashboard)/users/AccUsersGraph.tsx

key-decisions:
  - "Three adminProcedure entries added to usersRouter — consistent with bulkAccSummary and bulkAccSync (non-admins never see the graph)"
  - "positions: cached.positions returned directly as number[] — consumer reconstructs Float32Array client-side"
  - "deleteMany (not deleteUnique) for invalidateGraphLayout — safe when singleton row may not exist yet on fresh DB"
  - "layoutQuery.data in useEffect dependency array — ensures cache hit applies on query resolution not just mount"
  - "Refresh Layout uses existing ControlButton visual language (same className) — no new styles needed"

metrics:
  duration: "~2 min"
  tasks_completed: 2
  files_modified: 2
  completed: "2026-04-23"
---

# Phase 08 Plan 02: tRPC Graph Layout Cache Procedures + AccUsersGraph Integration Summary

**Three adminProcedure cache endpoints (getGraphLayout/saveGraphLayout/invalidateGraphLayout) added to usersRouter; AccUsersGraph now skips force simulation on cache hit and saves positions in background on miss, with a Refresh Layout toolbar button**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-23T22:20:52Z
- **Completed:** 2026-04-23T22:23:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `import crypto from "crypto"` to users.ts and three `adminProcedure` entries to `usersRouter`
- `getGraphLayout`: computes sha256 dataHash from all `accMemberCache` rows (sorted by email), fetches singleton layout, returns discriminated union `{ hit: true, positions, dataHash, nodeCount }` or `{ hit: false, positions: null, dataHash, nodeCount: 0 }`
- `saveGraphLayout`: upserts `positions: Float[]`, `dataHash`, `nodeCount` to the singleton row
- `invalidateGraphLayout`: `deleteMany({})` safely removes singleton regardless of whether it exists
- `AccUsersGraph.tsx`: added `trpc` import, `refreshKey` state, `isRefreshingRef`, three tRPC hooks
- Simulation `useEffect` replaced: cache-hit path applies `new Float32Array(layout.positions)` directly, skipping `runSimulation`; cache-miss path runs simulation then fires `saveLayout.mutate` fire-and-forget
- Refresh Layout button added to toolbar — matches existing `ControlButton` visual style, shows spinner on `isPending`, guarded by `isRefreshingRef.current` against double-click

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getGraphLayout, saveGraphLayout, invalidateGraphLayout to usersRouter** - `52d3e52` (feat)
2. **Task 2: Integrate cache into AccUsersGraph.tsx + Refresh Layout button** - `2550c5d` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified

- `server/routers/users.ts` - Added crypto import + 3 adminProcedure entries (70 lines inserted)
- `app/(dashboard)/users/AccUsersGraph.tsx` - Cache integration: tRPC import, state/refs, hooks, replaced simulation useEffect, Refresh Layout button in toolbar

## Decisions Made

- Three `adminProcedure` entries (not `protectedProcedure`) — consistent with `bulkAccSummary` and `bulkAccSync`; graph is admin-only
- `positions: cached.positions` returned as `number[]` directly; client uses `new Float32Array(...)` — avoids server-side Float32Array serialization issues
- `deleteMany({})` for `invalidateGraphLayout` — safe on empty table; `deleteUnique` would throw if row absent
- `layoutQuery.data` in useEffect dependency array — ensures effect re-runs once query result arrives (cache hit applied on query completion)
- Refresh Layout button uses same `px-2.5 py-1 text-[11px] font-medium rounded-lg border` className as `ControlButton` — visual consistency without new component

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. Used `ControlButton` className values directly in the Refresh Layout button (equivalent visual result) rather than wrapping in `ControlButton` component (which didn't accept `disabled` prop).

## Issues Encountered

None. TypeScript compiled cleanly after both tasks. Full `npx tsc --noEmit` passes with zero errors.

## User Setup Required

None — no environment changes, no new migrations, no new dependencies.

## Next Phase Readiness

- Plan 03 (end-to-end validation / smoke test) can proceed immediately
- Graph will attempt to load cached positions on next open; simulation runs only on cache miss
- Refresh Layout button is functional in toolbar

---
*Phase: 08-graph-layout-cache-pre-computed-force-positions-with-datahash-invalidation*
*Completed: 2026-04-23*
