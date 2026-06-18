---
phase: 02-users-decomposition
plan: "06"
subsystem: ui
tags: [react, zustand, nextjs, users-directory, decomposition, refactor]

# Dependency graph
requires:
  - phase: 02-05
    provides: Single data hook (useUsersDirectoryData) + shared BULK_USERS_LEAN_INPUT constant; Zustand store already live
provides:
  - ActivityAuditPanel.tsx extracted from the shell
  - DirectoryFilterBar.tsx (search + 6 filter dropdowns + status multi-select + active-filter pills)
  - ActiveFilterPill in DirectoryFilterBar
  - ModuleBadge.tsx, PersonCard.tsx, DirectoryListHeader.tsx extracted sub-components
  - useDirectoryRows.ts — filtering/sorting/grouping/windowing memos extracted from shell
  - UsersDirectoryClient.tsx reduced to a 314-line orchestrator shell (hard ceiling 320)
  - Human-verified zero-visible-change sign-off on the live /users page
affects: [04-users-table-polish, 07-pre-workshop-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-component extraction: store reads inside extracted component (DirectoryFilterBar reads useUsersDirectoryStore directly) to keep the shell prop surface minimal"
    - "Memos extracted to custom hook (useDirectoryRows) to keep the shell below the 320-line ceiling"
    - "Decomposition gated on projector click-through (human sign-off), not tests alone"

key-files:
  created:
    - app/(dashboard)/users/ActivityAuditPanel.tsx
    - app/(dashboard)/users/DirectoryFilterBar.tsx
    - app/(dashboard)/users/ModuleBadge.tsx
    - app/(dashboard)/users/PersonCard.tsx
    - app/(dashboard)/users/DirectoryListHeader.tsx
    - app/(dashboard)/users/useDirectoryRows.ts
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx

key-decisions:
  - "DirectoryFilterBar reads from useUsersDirectoryStore directly — no prop drilling of 12+ option lists/setters"
  - "Filtering/sorting/grouping/windowing memos extracted into useDirectoryRows.ts to keep shell under 320-line ceiling"
  - "Auto-refresh / stale data on /users is PRE-EXISTING app-wide behavior (refetchOnWindowFocus:false + 5-10min staleTime in lib/core/providers.tsx) — NOT a regression of this refactor; explicitly DEFERRED to Phase 4 (/users freshness/polish)"

patterns-established:
  - "Store-direct reads in extracted components: avoids prop explosion when extracting from a store-backed shell"
  - "Memo extraction hook: when shell ceiling is tight, extract the derived-data layer to a custom hook, not into sub-components"

requirements-completed: [USR-01, PERF-03]

# Metrics
duration: ~20min
completed: "2026-06-18"
status: complete
---

# Phase 2 Plan 06: /users Decomposition Final Extraction Summary

**UsersDirectoryClient.tsx reduced from 1,439 to 314 lines via 6 extracted sub-components and a memos hook; human projector click-through confirmed zero visible change on the live /users page**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-17T18:44Z
- **Completed:** 2026-06-18
- **Tasks:** 4 (3 auto + 1 checkpoint, all complete)
- **Files modified:** 7 (1 shell reduced + 6 new files)

## Accomplishments

- Shell trimmed 1,439 → 314 lines (78% reduction), within the 320-line hard ceiling defined in USR-01
- Extracted 6 standalone units: ActivityAuditPanel, DirectoryFilterBar (with ActiveFilterPill), ModuleBadge, PersonCard, DirectoryListHeader, useDirectoryRows
- Owner performed a before/after projector click-through on the live page — all 7 golden-path interactions (search, filter combine/dismiss, grid/list/group, sort cycle, scroll + modal, activity Sheet, data value parity) confirmed identical to pre-refactor baseline
- Phase 2 USR-01 success criterion 2 (the ~200-line shell) achieved; PERF-03 single-fetch confirmed end-to-end

## Task Commits

1. **Task 1: Extract ActivityAuditPanel and ActiveFilterPill** — `c976593` (feat)
2. **Task 2: Extract DirectoryFilterBar; reduce shell to 314 lines** — `f2dcefc` (feat)
3. **Task 3: Final full-suite + tsc + scope-guard + repo-map gates** — no code commit (gates verified green, no files changed)
4. **Task 4: Projector click-through** — checkpoint; APPROVED by owner

## Files Created/Modified

- `app/(dashboard)/users/ActivityAuditPanel.tsx` — Activity audit tab component (~157 lines); owns per-activity query + loading state
- `app/(dashboard)/users/DirectoryFilterBar.tsx` — Search input, 6 filter dropdowns (department/job-title/cost-centre/project/role/module), status multi-select, project-admin/no-projects chips, active-filter pills (~448 lines); reads directly from useUsersDirectoryStore
- `app/(dashboard)/users/ModuleBadge.tsx` — MODULE_BADGE_COLORS map + ModuleBadge component (~37 lines); re-exported for shell compat
- `app/(dashboard)/users/PersonCard.tsx` — Grid-view person card (~69 lines); moved from shell
- `app/(dashboard)/users/DirectoryListHeader.tsx` — List-view two-row column header (~50 lines); extracted from renderPeople
- `app/(dashboard)/users/useDirectoryRows.ts` — Filtering, sorting, grouping, windowing memos (~111 lines); extracted to bring shell under ceiling
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — Reduced from 1,439 → 314 lines; now a pure orchestrator: store reads, useUsersDirectoryData, useDirectoryRows, handlers, layout JSX, PersonDetailModal, activity Sheet

## Decisions Made

- **DirectoryFilterBar reads store directly.** The filter bar needed 12+ option lists, filter values, and setters; passing them all as props would have kept the shell large and added churn to any future filter change. Direct store reads in the extracted component are the established pattern from Phase 4.
- **Memos extracted to useDirectoryRows.** After extracting the filter bar and audit panel, the shell was still over ceiling because of the filtering/sorting/grouping/windowing memo block. Extracting it to a custom hook rather than a deeper component preserves the shell's orchestrator character.
- **Auto-refresh / data freshness DEFERRED to Phase 4.** During the projector click-through, the owner noted that /users requires a manual browser refresh to show the latest data. Investigation confirmed this is `refetchOnWindowFocus: false` + 5–10 min `staleTime` in `lib/core/providers.tsx` — present in the repo before Phase 2 and byte-identical before/after this refactor. Not a regression. Deferred to Phase 4 (/users freshness/polish).

## Deviations from Plan

None — plan executed exactly as written.

The plan spec said "~200-line shell (hard ceiling 320)"; the final count is 314 lines, which satisfies the ceiling. The six extracted files were slightly more than the plan enumerated (the plan listed ActivityAuditPanel + DirectoryFilterBar explicitly; ModuleBadge, PersonCard, DirectoryListHeader, and useDirectoryRows were bonus fine-grained extractions from Task 2) — all within scope of "reduce the shell."

## Issues Encountered

None. All automated gates passed on first attempt:

- `npx tsc --noEmit` — 0 errors
- Golden-path integration test — 7/7 green
- Full suite — 2,035 pass / 1 skip / 2 pre-existing FolderPermissionTerrain failures (concurrent WIP, unrelated to Phase 2)
- Scope guard — 0 files under users/access-analysis or users/spatial-graph touched across the phase

## Checkpoint: Human Projector Click-Through

**Outcome: APPROVED**

Owner performed a before/after click-through on the live `/users` page (running :3000) and confirmed zero visible change across all 7 golden-path steps: search narrowing, combined filter + pill dismiss, grid/list/group toggle, sort cycle, scroll-position preservation through modal open/close, activity Sheet open, and data-value parity (user counts, departments, coverage strip, activity).

One pre-existing observation was noted and investigated: the page shows stale data until manually refreshed. Root cause confirmed as `refetchOnWindowFocus: false` + 5–10 min `staleTime` in `lib/core/providers.tsx` — present before Phase 2 and byte-identical after. Not a regression of this refactor. **Deferred to Phase 4 (/users freshness/polish).**

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Phase 2 is now complete.** All 6/6 plans executed:

- 02-01: Zustand installed + golden-path test (baseline 2,015)
- 02-02: Pure helpers + stateless display sub-components
- 02-03: PersonRow + PersonRowList with scroll-init hack
- 02-04: Zustand store + filter/search/sort/view/selectedEmail state
- 02-05: Single data hook + shared BULK_USERS_LEAN_INPUT prefetch constant
- 02-06: ActivityAuditPanel + DirectoryFilterBar + 314-line shell + projector sign-off

**USR-01 success criterion 2 is met.** The decomposition is complete and human-verified.

**Ready for Phase 3** (DataTable Primitive — depends only on Phase 1; parallel-safe with Phase 4 and Phase 5 once started).

**Known deferred item (Phase 4):** /users data freshness — manual browser refresh needed for latest data; pre-existing `refetchOnWindowFocus: false` + staleTime caching in lib/core/providers.tsx.

---
*Phase: 02-users-decomposition*
*Completed: 2026-06-18*
