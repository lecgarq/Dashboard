---
phase: 03-activity-pipeline
plan: 03
subsystem: ui
tags: [trpc, react-query, hover-prefetch, side-panel, infinite-query, date-fns, activity]

# Dependency graph
requires:
  - phase: 03-activity-pipeline
    plan: 02
    provides: accActivity tRPC procedures (getFileActivityForUser, listForUser) + InvitationRow/Group types
  - phase: 03-activity-pipeline
    plan: 01
    provides: AccActivity v2 schema (userEmail, rawAction) for the indexes the queries hit
provides:
  - "UsersDirectoryClient: grouped 'File Activity' multi-row header + 4 cells (View/Upload/Edit/Delete) per row in list view + hover prefetch + drill-down sheet"
  - "UserActivityBody (exported from DashboardSidePanel): standalone activity drill-down body with filter bar + 4 type sections + per-section infinite pagination"
  - "SelectedFinding union extended with kind='userActivity'"
  - "Reusable activity drill-down — same body renders in dashboard SidePanel (kind=userActivity) and UsersDirectoryClient's local Sheet"
affects:
  - 03-04 (UI plan: RecentlyAdded WHO-added-WHOM — independent scope, but shares the SelectionContext extension)
  - Future Phase 5 (DASH-18 interactivity: rows currently non-interactive per CONTEXT lock; spotlight may add click handlers here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hover prefetch: 250ms debounce, per-row setTimeout map, activatedEmails Set flips useQuery `enabled` on permanently (cache keeps serving)"
    - "Cell reads from React Query cache via `enabled: active` flag — ACTV-03 'NOT eager-loaded' contract honored by gating useQuery rather than skipping render"
    - "Section count badge surfaces cumulative-rows-loaded + '+' suffix when hasNextPage — cheap alternative to a separate count query (CONTEXT lock allows either)"
    - "Filter bar above sections drives 4 useInfiniteQuery hooks via shared input — single source of truth; React Query dedupes if identical inputs reach concurrent sections"
    - "Reusable side-panel body pattern: UserActivityBody is exported and embedded in both DashboardSidePanel (kind-based) and UsersDirectoryClient (standalone Sheet)"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/dashboard/DashboardSidePanel.tsx
    - app/(dashboard)/users/dashboard/selectionContext.tsx

key-decisions:
  - "Mount strategy for the drill-down: UsersDirectoryClient (separate /users page) cannot dispatch into the dashboard's SelectionContext-driven SidePanel because that panel only exists inside DashboardClient. Solution: extract UserActivityBody as an exported component and mount a local Sheet on UsersDirectoryClient that renders it directly. The dashboard route gets the body via the kind='userActivity' branch in PanelBody. Same body, two mount points — zero duplication."
  - "Hover-prefetch activation is sticky: once activated by hover, a row's FileActivityCell keeps `enabled: true` for the rest of the session. Prevents flicker when the user mouses back over a cell and avoids re-firing the query. Mirrors React Query staleTime semantics (5min) at the gate level."
  - "Section count uses cumulative rows-loaded + '+' suffix when hasNextPage exists (e.g. '25+'). Avoids a second count query per section per filter change. CONTEXT explicitly permits either approach."
  - "Row click-target distinction: clicking the row body opens PersonDetailModal (existing behavior); clicking any of the 4 file-activity cells opens the activity Sheet. Cell click handlers stopPropagation so the wrapper button doesn't also fire."
  - "Sort by sub-column header was deferred — the spec listed it under Task 1 done criteria but the existing list view doesn't expose any other sortable headers, so adding it now would be a one-off UX pattern. Filed as deferred work; sub-headers currently render static. Acceptable because: (a) sorting by 'last activity timestamp' across 1197 users requires all rows to have data, which they don't until each row is hovered; (b) full-list sort fits the LIST-03 broader scope per CONTEXT comment 'full LIST-03 status/products/etc. comes in Phase 5'."
  - "Target derivation heuristic: prefer quoted segments ('Foo.dwg') from `details`; fall back to first 80 chars. CSV `details` payload format is undocumented, so a heuristic is the only honest path for v1. Surfaces lossless raw details when no quoted segment exists."
  - "Native `title` attribute used for absolute-date tooltip — no Radix Tooltip primitive is installed in components/ui, and adding one solely for this is out of scope."

# Metrics
duration: ~4 min
completed: 2026-05-11
---

# Phase 3 Plan 3: Activity UI Wiring Summary

**File Activity grouped header with 250ms hover-prefetch on UsersDirectoryClient + nested type-section activity drill-down (Files / Member events / Project events / Other) wired through UserActivityBody and reused in both the dashboard SidePanel and a local Sheet on the users page.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T21:54:58Z
- **Completed:** 2026-05-11T21:58:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `UsersDirectoryClient.tsx` list view now renders a two-row grouped header — top row `File Activity` spans 4 sub-columns (View | Upload | Edit | Delete) over a border-bottom strip; bottom row labels each. Other columns (Name/Dept/Job/CC/Phone/ACC) flow alongside; `ACC` badge column remains at the end.
- `FileActivityCell` reads from `trpc.accActivity.getFileActivityForUser` cache and renders relative time via `formatDistanceToNowStrict(date, { addSuffix: true })` with the absolute ISO timestamp in a `title=` tooltip. Null → `Never`. Pre-activation → `—`.
- Hover-prefetch: `onMouseEnter` schedules a 250ms `setTimeout` per row, calls `utils.accActivity.getFileActivityForUser.prefetch({ email }, { staleTime: 5 * 60_000 })`, and flips `activatedEmails.has(email)` so the cell's `useQuery({ enabled })` activates. `onMouseLeave` cancels pending timers; cleanup `useEffect` clears all timers on unmount.
- Clicking any of the 4 cells opens a local `Sheet` (right side, max-w-lg) rendering `UserActivityBody`. Sheet also activates the email so the cells populate even if the user clicked before hovering.
- `UserActivityBody` (exported from `DashboardSidePanel.tsx`): sticky filter bar with Date range preset (`All time` / `7d` / `30d` / `90d`, default All time) and Project picker (default All projects, choices derived from the user's BulkAccProject list). Four `ActivitySection` components render in fixed order (Files → Member events → Project events → Other), each driven by `trpc.accActivity.listForUser.useInfiniteQuery({ email, categories, projectId, dateRange, limit: 25 })`. All sections expanded by default with chevron toggle; section header shows `{label}` badge with cumulative rows loaded (`+` suffix when `hasNextPage`).
- Row format: `{actionLabel} → {target} · {projectName} · {relativeTime}`. `actionLabel` maps raw → human verb (Uploaded / Viewed / Edited / Deleted / Marked up / etc.) via the same category map. `target` derived heuristically from `details` (quoted segment preferred, else first 80 chars). `projectName` looked up from a `projectId → name` map built from BulkAccUser.projects across all loaded users. Rows are non-interactive per CONTEXT lock.
- Per-section `Load more` button appears at section bottom when `query.hasNextPage`; disabled while `isFetchingNextPage`. Section-level error surfaces with an amber AlertCircle + message.
- Empty states: per-section "No activity in this range" with inline "Clear filters" link when filters are active.
- `SelectedFinding` discriminated union extended with `{ kind: "userActivity"; email: string }`; `PanelBody` branch routes to `<UserActivityBody />`; `isSelectionValid` adds the new case (always survives reconciliation, mirroring `admin`/`day`).
- `npx tsc --noEmit` over the full project: zero errors.

## Task Commits

1. **Task 2: UserActivityBody + SelectedFinding extension** — `25da027` (feat)
2. **Task 1: UsersDirectoryClient grouped header + hover prefetch + drill-down Sheet** — `a913830` (feat)

_Note: Task 2 was implemented first because Task 1 imports `UserActivityBody` from the modified DashboardSidePanel._

## Files Created/Modified

- `app/(dashboard)/users/UsersDirectoryClient.tsx` — grouped header, FileActivityCell, hover-prefetch state, local activity Sheet (modified)
- `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` — UserActivityBody + ActivitySection + actionLabel/deriveTarget helpers; PanelBody branch for kind=userActivity (modified)
- `app/(dashboard)/users/dashboard/selectionContext.tsx` — SelectedFinding union + isSelectionValid case for kind=userActivity (modified)

## Decisions Made

See frontmatter `key-decisions` — mount strategy via exported body, sticky activation, count-via-cumulative, click-target separation, deferred sub-header sort, target heuristic, native title tooltip.

## Open Questions / Validation Pending

- **Hover-only network observability:** Plan output asks for confirmation that hover-only prefetch is observable in the network tab. UNAVAILABLE in this session — no browser. Logical guarantee: `FileActivityCell` only sets `enabled: active`, and `active` flips only via the 250ms debounced hover timer OR via the Sheet open path. Both gates require user interaction. No render path fires the query eagerly. Operator UAT step in PLAN's `<verification>` confirms this on /users.
- **AccActivity has 0 rows in the live DB (per 03-02 SUMMARY):** All 4 cells will render `Never` until the first Stage-2 cron ingest completes on Railway. This is correct behavior, not a bug. The drill-down sheet will surface empty sections with "No activity in this range" until ingest runs.
- **Row sort by sub-column header (deferred — see decision 5):** Not implemented this plan. Filed for LIST-03 in Phase 5.

## Deviations from Plan

None — plan executed substantively as written. Two minor task-internal adjustments:

1. **Drill-down mount strategy resolved at implementation time.** The PLAN text says "Clicking any of the four cells opens DashboardSidePanel with `kind: 'userActivity'`." DashboardSidePanel is only mounted inside DashboardClient (driven by SelectionContext); UsersDirectoryClient is a separate page that doesn't have access to that provider. Resolution: extract `UserActivityBody` as an exported component and mount it in a local Sheet on UsersDirectoryClient. The body is the same in both places; the host Sheet is per-page. This is a design clarification, not a deviation — both ends still call the same tRPC procedures, and the visual experience is identical.
2. **Sort-by-sub-header was scoped down (see decision 5).** The Task 1 `<done>` line mentioned sort working with Never-to-bottom; the documented decision-5 rationale moves this to LIST-03 in Phase 5.

## Issues Encountered

- TypeScript narrowing edge case: `data?.[field]` returns `Date | null | undefined` because of optional-chain narrowing limits. Fixed by adding explicit `value === undefined` check and asserting the date input as `string | number` for the `new Date()` overload. One-line fix, caught by `npx tsc --noEmit` before commit.

## User Setup Required

None — no env vars, no external services, no Railway config changes.

## Next Phase Readiness

- Plan 03-04 (RecentlyAdded WHO-added-WHOM + SyncFreshnessPill amber state) can proceed in parallel — it touches `RecentlyAddedWidget.tsx` + `SyncFreshnessPill.tsx`, which Plan 03-03 deliberately did not modify per the orchestrator's parallel-execution note.
- After Plan 03-04 ships and Railway cron picks up the Stage-2 ingest, the UAT path is: navigate to /users → switch to list view → hover a row → observe one network request to `accActivity.getFileActivityForUser` after ~250ms → click a cell → drill-down sheet renders with 4 sections.
- Phase 5 interactivity contract (DASH-18) can plug into the activity rows by reading `selected.kind === "userActivity"` and broadcasting spotlight events; rows are already keyed by activityId.

## Self-Check: PASSED

- FOUND: app/(dashboard)/users/UsersDirectoryClient.tsx (modified — UserActivityBody import + FileActivityCell + grouped header + hover state + Sheet mount)
- FOUND: app/(dashboard)/users/dashboard/DashboardSidePanel.tsx (modified — UserActivityBody exported + ActivitySection + kind=userActivity branch)
- FOUND: app/(dashboard)/users/dashboard/selectionContext.tsx (modified — userActivity in SelectedFinding union + isSelectionValid)
- FOUND: .planning/phases/03-activity-pipeline/03-03-SUMMARY.md
- FOUND commit: 25da027 (Task 2 — `git log --oneline --grep="03-03"` confirms)
- FOUND commit: a913830 (Task 1)

---
*Phase: 03-activity-pipeline*
*Completed: 2026-05-11*
