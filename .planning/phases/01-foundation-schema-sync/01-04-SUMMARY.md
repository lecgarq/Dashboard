---
phase: 01-foundation-schema-sync
plan: 04
subsystem: ui
tags: [trpc, prisma, sidebar, date-fns, sync-freshness, sync-03]

requires:
  - phase: 01-foundation-schema-sync
    provides: SyncMeta + AccDataConnectorJob tables (Plan 01-01); persistent SyncMeta writes from Quick Sync release shell + Deep Sync cron (Plan 01-03)
provides:
  - tRPC accSync router (getSyncFreshness + getActiveDeepSyncJob) reading Postgres directly
  - Sidebar bottom "Last synced" pill with adaptive polling and collapsed-state dot
  - SYNC-03 visibility surface: restart-surviving sync freshness in existing dashboard chrome
affects: [phase-02-core-extraction, phase-03-activity-pipeline, sidebar-chrome]

tech-stack:
  added: []
  patterns:
    - "tRPC accSync router pattern: protectedProcedure queries reading SyncMeta + AccDataConnectorJob via ctx.db (no memory cache — Postgres is source of truth so status survives container restart)"
    - "Adaptive refetch cadence: pill switches getSyncFreshness refetchInterval to 15s when a non-terminal AccDataConnectorJob exists, else 5min — implements SYNC-03 5–30s window without burning queries during idle"
    - "Sidebar pill mount pattern: client component placed inside existing border-t bottom div above collapse button; reads parent collapsed prop to condense to a tooltip-only dot"

key-files:
  created:
    - server/routers/acc-sync.ts
    - components/layout/SyncFreshnessPill.tsx
  modified:
    - server/routers/root.ts
    - components/layout/Sidebar.tsx

key-decisions:
  - "Sidebar collapsed prop is named `collapsed` (verified in Sidebar.tsx:234 useState) — matches plan's primary guess; no fallback context lookup needed"
  - "Polling cadence: 15s active / 5min idle (default from plan), kept verbatim at human-verify — sits inside the SYNC-03 5–30s acceptance window while a deep sync is in flight and idles cheaply otherwise"
  - "Pill freshness picks max(quick.lastRunAt, deep.lastSuccessCompletedAt) so a successful Quick Sync after a stale Deep Sync still reads fresh — matches the user-facing intent of 'last time data was refreshed'"
  - "Failed/skipped states render emerald/red/amber dots with title-attribute error message — no click-through drill (deferred per CONTEXT.md no-new-views rule)"

patterns-established:
  - "accSync router as the single read surface for sync-status UI — Plan 02+ extractors write SyncMeta; future widgets read via accSync.* procedures rather than re-querying SyncMeta directly"
  - "Restart-survival contract: any sync-status UI must source from Postgres (SyncMeta or AccDataConnectorJob); in-memory caches are forbidden for status because Railway restarts the container on every deploy"

requirements-completed: [SYNC-03]

duration: ~2 min (autonomous tasks 1-2; human-verify same-day approval)
completed: 2026-05-11
---

# Phase 01 Plan 04: Sidebar Sync Freshness Pill Summary

**SYNC-03 visibility: tRPC accSync router (getSyncFreshness + getActiveDeepSyncJob) reading SyncMeta + AccDataConnectorJob, surfaced as a "Last synced" pill in the sidebar bottom with adaptive 15s/5min polling and a collapsed-state dot.**

## Performance

- **Duration:** ~2 min execution (autonomous tasks); human-verify approved same day
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `accSyncRouter` (`server/routers/acc-sync.ts`) with two protected queries that read directly from Postgres — `getSyncFreshness` returns Quick + Deep last-run state plus the latest successful Data Connector `completedAt`, and `getActiveDeepSyncJob` returns the most-recent pending/running job to drive adaptive polling.
- Registered as `accSync` on `appRouter` in `server/routers/root.ts`.
- `SyncFreshnessPill` client component reads both queries, picks the most-recent timestamp, formats via `date-fns` `formatDistanceToNow`, and renders distinct visual states for never-synced / success / failed / skipped / deep-sync-running.
- Mounted inside `Sidebar.tsx`'s existing border-t bottom section above the collapse button, respecting the existing `collapsed` state to condense to a tooltip-only dot.
- Restart-survival (SYNC-03 acceptance) verified: freshness is read live from Postgres on each refetch, no in-memory cache.

## Task Commits

1. **Task 1: accSync tRPC router with getSyncFreshness + getActiveDeepSyncJob** — `49de888` (feat)
2. **Task 2: SyncFreshnessPill component + mount in Sidebar** — `19332aa` (feat)
3. **Task 3: Human verify — sidebar freshness pill in dev** — approved by user

**Plan metadata:** this commit (docs: complete sync freshness pill plan)

## Files Created/Modified

- `server/routers/acc-sync.ts` (created) — accSyncRouter with getSyncFreshness + getActiveDeepSyncJob, both `protectedProcedure` reading `ctx.db.syncMeta` and `ctx.db.accDataConnectorJob` directly (no caching layer).
- `server/routers/root.ts` (modified) — added `accSync: accSyncRouter` to `appRouter`.
- `components/layout/SyncFreshnessPill.tsx` (created) — client component; `trpc.accSync.getSyncFreshness.useQuery` with adaptive `refetchInterval` (15s when `getActiveDeepSyncJob` returns non-null, else 5min); collapsed-mode renders only a colored dot with full status as `title`.
- `components/layout/Sidebar.tsx` (modified) — imports `SyncFreshnessPill`, mounts `<SyncFreshnessPill collapsed={collapsed} />` in the existing border-t bottom div above the collapse button.

## Decisions Made

- **Collapsed prop name = `collapsed`** (Sidebar.tsx:234 `useState`). Matched the plan's primary guess; no context lookup fallback needed.
- **Polling cadence retained as 15s / 5min** (default from plan) — kept after human-verify since it sits inside the SYNC-03 5–30s window during active jobs without burning queries while idle.
- **Freshness = max(quick.lastRunAt, deep.lastSuccessCompletedAt)** — matches the user-facing intent of "last time data was refreshed" regardless of which sync produced it.
- **No drill-through on failed pill** — clicking the pill does nothing; failure detail is surfaced via the `title` attribute only. A dedicated sync-status page is explicitly out-of-scope per CONTEXT.md "no new tabs/pages/views".

## Deviations from Plan

None — plan executed exactly as written. The plan also called out that an edited `SyncFreshnessPill.tsx` might already exist in the workspace; on inspection there was no prior committed version, so Task 2 created the file fresh per the plan spec.

## Issues Encountered

None during the planned execution. After tasks 1-2 were committed, the user iterated on the pill's visual treatment locally (glassmorphic styling, animated glow) — see "Open items" below. That polish is not part of this plan's committed scope.

## Open items

- **Local-only visual polish on `components/layout/SyncFreshnessPill.tsx`** is present in the working tree at the time of this metadata commit (additional glassmorphic styling and an animated glow effect added by the user post-checkpoint). It is intentionally left as an uncommitted working-tree modification and is **not** part of plan 01-04's committed deliverable (which is the version captured in commit `19332aa`). If the polish ships, it should land via its own commit and reference its own scope rather than retroactively expanding 01-04.
- **No drill-through page for sync failures.** A failed pill exposes the error string via tooltip only. If future UX wants a dedicated failure-history view, that is a new scope beyond CONTEXT.md's no-new-views rule and would need a separate plan/requirement.

## Next Phase Readiness

- **Phase 1 of v2.0 is now 4/4 plans complete** (01-01, 01-02, 01-03, 01-04). SCHEMA-01, SCHEMA-02, SCHEMA-03, SYNC-03 closed; SYNC-01, SYNC-02, SYNC-04 remain pending against later phases per the active 2026-05-11 amendment (Phase 1 is intentionally backend-only — no Quick/Deep Sync trigger UI).
- The accSync router is the read contract Phase 2+ widgets should consume rather than re-querying `SyncMeta` directly.
- Ready to begin **Phase 2 — Core Extraction (MEM / PROJ / ROLE)**; the SyncMeta + AccDataConnectorJob writes that Phase 2 produces will surface automatically through the pill with no additional wiring.

## Self-Check: PASSED

- `server/routers/acc-sync.ts` exists on disk
- `components/layout/SyncFreshnessPill.tsx` exists on disk
- `.planning/phases/01-foundation-schema-sync/01-04-SUMMARY.md` exists on disk
- Commit `49de888` (Task 1) present in git history
- Commit `19332aa` (Task 2) present in git history

---
*Phase: 01-foundation-schema-sync*
*Completed: 2026-05-11*
