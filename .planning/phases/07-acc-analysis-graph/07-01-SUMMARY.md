---
phase: 7
plan: 1
subsystem: users/acc-analysis
tags: [trpc, acc, filter, cache, ui]
dependency_graph:
  requires: [06-04]
  provides: [bulkAccSummary-endpoint, no-projects-filter-chip, acc-card-badges]
  affects: [UsersDirectoryClient, usersRouter]
tech_stack:
  added: []
  patterns: [bulk-cache-read, map-keyed-by-email, instant-filter-chip]
key_files:
  created: []
  modified:
    - server/routers/users.ts
    - app/(dashboard)/users/UsersDirectoryClient.tsx
decisions:
  - bulkAccSummary is adminProcedure (not protectedProcedure) — consistent with other admin-only data queries in usersRouter
  - AccBadge extracted as a standalone component to keep PersonCard and PersonRow clean and avoid duplicating badge logic
  - accSummaryMap built with useMemo keyed by email for O(1) per-card lookup without re-renders
  - filterNoProjects excluded from hasActiveFilters pills section (no ActiveFilterPill shown) — the chip itself serves as the visual indicator
metrics:
  duration: ~12 minutes
  completed: 2026-04-23
  tasks_completed: 2
  files_modified: 2
---

# Phase 7 Plan 1: Bulk ACC Cache Prefetch + "No Projects" Filter Summary

**One-liner:** Bulk ACC cache read via `bulkAccSummary` tRPC procedure powers an instant "No ACC Projects" filter chip and per-card project count badges in the Users directory.

## What Was Built

### Task 1 — `bulkAccSummary` tRPC Procedure (`server/routers/users.ts`)

Added a new `adminProcedure` named `bulkAccSummary` to `usersRouter`. It:
- Reads ALL `AccMemberCache` rows in one `findMany` call (no per-user API calls)
- Parses each row's `data` JSON blob into `{ found, projects }` shape
- Returns an array of `{ email, found, projectCount, activeCount, adminCount, hasNoProjects, syncedAt }`
- `hasNoProjects = found === true && projectCount === 0`
- Returns empty array (no throw) when no cache rows exist

### Task 2 — Filter Chip + Card Badges (`app/(dashboard)/users/UsersDirectoryClient.tsx`)

Added:
- `AccSummaryItem` interface type
- `trpc.users.bulkAccSummary.useQuery()` call with `staleTime: 300_000`
- `accSummaryMap: Map<string, AccSummaryItem>` built via `useMemo` for O(1) lookup
- `noProjectsCount` — count of directory people with `hasNoProjects === true`
- `filterNoProjects` boolean state (default `false`)
- `AccBadge` sub-component — renders amber "No projects" or green "N projects" badge
- Amber chip button in filter bar: "No ACC Projects (N)" — amber border/text when active
- `filterNoProjects` applied as AND condition in `filtered` useMemo
- `PersonCard` and `PersonRow` updated to accept optional `accSummary` prop and render `AccBadge`
- List view header gains an "ACC" column
- `clearAllFilters()` now resets `filterNoProjects`

## Success Criteria Check

- [x] `bulkAccSummary` returns project summaries for all cached users from DB in one query
- [x] "No ACC Projects" chip appears in the General tab filter bar
- [x] Clicking the chip instantly shows only users with 0 ACC projects (no API calls)
- [x] User cards show project count badge from cache when available
- [x] TypeScript compiles with no errors in modified files

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| a4b8b18 | feat(07-01): add bulkAccSummary tRPC procedure |
| 81dcf1b | feat(07-01): add No ACC Projects filter chip and card badges |

## Self-Check: PASSED

- `server/routers/users.ts` — modified, committed at a4b8b18
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — modified, committed at 81dcf1b
- TypeScript: `npx tsc --noEmit` exits clean with no output
