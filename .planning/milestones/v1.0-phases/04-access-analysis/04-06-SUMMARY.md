---
phase: 04-access-analysis
plan: 06
subsystem: app/users/dashboard
tags: [dashboard, nivo, echarts, csv-export, DASH-01, DASH-02, DASH-08]

requires:
  - phase: 04-access-analysis
    plan: 03
    provides: bucketActiveUserTier + ACTIVE_TIERS for DASH-02
  - phase: 04-access-analysis
    plan: 04
    provides: trpc.workspace.getDirectory for DASH-01 set arithmetic
  - phase: 04-access-analysis
    plan: 05
    provides: WIDGETS registry contract, downloadCsv helper, SortableWidget chrome
provides:
  - CoverageDonutWidget (Nivo Pie 3-segment donut + CSV)
  - ActiveUserTiersWidget (Nivo Bar horizontal stacked + CSV)
  - RolesModulesHeatmapWidget (ECharts heatmap + visualMap + dataZoom + CSV)
  - WidgetCommonProps cross-plan contract (users + workspaceEmails)
  - DashboardClient query-lift pattern (one bulkAccSummary + one getDirectory fetch)
affects: [04-07, 04-08]

tech-stack:
  added: []
  patterns:
    - "Per-widget Download CSV button rendered in widget body (not Card header) — keeps SortableWidget chrome unchanged"
    - "Distinct-member aggregation for heatmap cells: Set<email> per (role, module) instead of raw assignment counts"
    - "Empty-state inline message when workspaceEmails=[] (non-Workspace tenant, scope missing, or query error) instead of crashing the donut"
    - "DashboardClient lifts both trpc queries once and spreads to all widgets via WidgetCommonProps"

key-files:
  created:
    - app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx
    - app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx
    - .planning/phases/04-access-analysis/04-06-SUMMARY.md
  modified:
    - app/(dashboard)/users/dashboard/widgetRegistry.ts
    - app/(dashboard)/users/dashboard/DashboardClient.tsx

key-decisions:
  - "Heatmap uses DISTINCT MEMBER counts per (role, module) cell — count Set<email> size, NOT raw role-module assignment count. A single user holding (role, module) across many projects must contribute 1 to the cell, not N."
  - "Coverage donut empty-Workspace state renders an inline 'Sign in with a Workspace account to see coverage' message instead of an empty pie. Triggered by workspaceEmails.length === 0, which covers: workspaceQuery error, non-Workspace tenant (server returns []), and not-yet-loaded."
  - "Container heights chosen explicit (Pitfall 2): donut 300px, bar 200px (single horizontal stacked row needs less vertical), heatmap 500px (full-width col-span-2 with up to ~50 modules x ~30 roles)."
  - "WidgetCommonProps shape (users + workspaceEmails) published as the cross-plan contract. Plan 04-07 widgets accept the same shape; placeholders ignore props. DashboardClient spreads the same object to every widget."
  - "Refresh button now invalidates BOTH queries (was no-op in 04-05); reuses trpc.useUtils() pattern from existing AccAnalysisPanel."
  - "Workspace error is non-fatal; ACC users error blocks the dashboard with an inline error banner. Skeleton cards render in widget bodies while ACC users load."

requirements-completed: [DASH-01, DASH-02, DASH-08]

metrics:
  duration: "~10 min"
  started: "2026-05-08T19:17:00Z"
  completed: "2026-05-08T19:24:00Z"
  tasks: 3
  files_created: 4
  files_modified: 2
---

# Phase 4 Plan 06: Coverage / Tiers / Heatmap Widgets Summary

**Three production widgets — Coverage donut (Nivo Pie, DASH-01), Active-user tiers (Nivo Bar, DASH-02), Roles x Modules heatmap (ECharts, DASH-08) — wired into the locked WIDGETS registry and consumed by DashboardClient with a single lifted ACC + Workspace query pair. Each widget owns its Download CSV button. tsc clean, npm run build succeeds, /users/dashboard renders with real data above-the-fold.**

## Tasks Completed

| # | Description | Commit |
|---|-------------|--------|
| 1 | CoverageDonutWidget + ActiveUserTiersWidget (Nivo + CSV) | `09f5285` |
| 2 | RolesModulesHeatmapWidget (ECharts + CSV) | `2d39109` |
| 3 | Wire into registry + lift queries in DashboardClient | `a9f65b8` |

## Decisions Made

### 1. Heatmap distinct-member semantics

The heatmap's cell value is the count of DISTINCT user emails that hold both the row's role AND the column's module via at least one project assignment. The aggregator builds `Map<role|module, Set<email>>` and uses `Set.size` per cell.

The alternative — counting raw role-module assignment occurrences across all `user.projects[]` — would inflate the heatmap. A single user holding "BIM Coordinator" + "Docs" across 20 projects would contribute 20 to the cell instead of 1. Distinct-member matches the user's mental model of "how many people effectively have this entitlement combination" and is consistent with how junk-role / duplicate-role finders in 04-03 also reduce per-user.

CSV export uses the same distinct-member counts.

### 2. Coverage donut empty-Workspace fallback

`workspaceEmails.length === 0` is treated as "no Workspace integration" and renders an inline message "Sign in with a Workspace account to see coverage" with a still-functional CSV button (will export zeros for `In Workspace` segments). This single branch covers three cases:

- **Personal Gmail user**: `trpc.workspace.getDirectory` server-side returns `{ emails: [] }` (the FAILED_PRECONDITION → empty mapping in 04-04).
- **Workspace scope missing**: `getDirectory` throws FORBIDDEN; client treats `data === undefined` as `[]`.
- **Query in flight or errored**: same empty fallback.

Plan 04-04 documented the typed tRPC error vocabulary; the donut intentionally collapses all three to a single inline state to minimize widget chrome surface area. A more granular UX (separate "re-authorize Workspace" prompt for FORBIDDEN) is a future refinement.

### 3. Container heights + responsive behavior

Pitfall 2 (Nivo / ECharts need a parent with explicit height) was honored:

| Widget | Height | Rationale |
|--------|--------|-----------|
| Coverage donut | 300 px | Half-width col-span-1; donut + arc labels need ~280-320 px to read. |
| Active tiers | 200 px | Single horizontal row; legend below adds ~40 px → 240 px total card height. |
| Heatmap | 500 px | Full-width col-span-2; up to ~50 modules x ~30 roles needs vertical room; ECharts dataZoom inside lets the user pan/scroll within. |

Width is responsive (Nivo Responsive* + ECharts `style.width: 100%`); no horizontal-resize observer is needed because parent grid cells use `min-w-0` (already set in SortableWidget from 04-05).

### 4. WidgetCommonProps cross-plan contract

DashboardClient spreads a single `widgetProps = { users, workspaceEmails }` object to every WIDGETS[id].component. Widgets ignore the props they don't need (Active tiers ignores `workspaceEmails`; Heatmap ignores both — but the type accepts both). This avoids prop-drilling separate fetches into each widget (Pattern 3 in the plan).

The shape is published in `widgetRegistry.ts` as `export interface WidgetCommonProps`. Plan 04-07 widgets MUST either accept the same shape or extend it additively; renaming or narrowing breaks the spread call site.

## Edge Cases Worth Noting for Downstream Plans (04-07 / 04-08)

- **Empty users**: All three widgets render empty/zero states gracefully (donut shows three zero-segments which Nivo collapses; bar shows an empty stacked row; heatmap shows "No data — sync ACC first" inline). DashboardClient renders Skeleton cards instead of widgets while `usersQuery.isLoading`, so users only see the empty states post-load.
- **Workspace query error**: Non-fatal; `workspaceEmails: []` flows through. Coverage widget surfaces this; other widgets ignore.
- **ACC users query error**: Fatal — DashboardClient renders an inline destructive-styled error banner above the grid. Widgets still render with `users: []` underneath the banner.
- **Refresh button**: Now functional — invalidates both queries via `trpc.useUtils()`. Disabled while either is fetching.
- **`isAccountAdmin` and `addedOn` fields**: Available on `BulkAccUser` from Plans 04-01 and 04-02. Not consumed by these three widgets — left for Plan 04-07's Admins / Recently-Added widgets.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] tRPC import path**
- **Found during:** Task 3 (DashboardClient lift)
- **Issue:** Plan referenced `@/lib/trpc/client`. The project's actual path is `@/lib/core/trpc` (verified via `Grep "from \"@/lib/trpc"` in app/ — no matches; `Grep "@/lib/core/trpc"` confirms the canonical path used by `AccAnalysisPanel.tsx` and `UsersDirectoryClient.tsx`).
- **Fix:** Imported from `@/lib/core/trpc` instead.
- **Files modified:** DashboardClient.tsx (Task 3 commit).

**2. [Concurrent-plan reconciliation, NOT a deviation] Registry imports for 04-07's six widgets**
- **Found during:** Post-Task-3 build
- **Observation:** Plan 04-07 (running in parallel) committed first to `widgetRegistry.ts` (commits `ff14f81` and `aaa3184`) AND its six widget files. After my Task 3 finished writing the file, a final-state reconciliation showed the registry referenced all 9 real widget components (mine + 04-07's). The build passed end-to-end.
- **Action taken:** None — this is the intended end state. The cross-plan contract (WidgetCommonProps) I introduced in this plan is consumed by 04-07's widgets without modification. Documented here for traceability rather than as a scope deviation.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking — tRPC path mismatch). One concurrent-plan reconciliation observed but not a deviation.

## Verification

- [x] All three widget files exist with `"use client"` + correct chart imports
- [x] `widgetRegistry.ts` references real components for `coverage`, `tiers`, `heatmap` (and 04-07's six)
- [x] `DashboardClient.tsx` fetches users + workspaceEmails once, spreads to widgets
- [x] `npx tsc --noEmit` — no errors in any file modified by this plan (only stale `.next/types` pre-existing noise)
- [x] `npm run build` — succeeds; `/users/dashboard` listed as dynamic route
- [x] CSV export call sites use `downloadCsv` from `@/lib/acc/csvExport`
- [ ] Live browser smoke (visit page, see 3 real widgets, drag works, CSV downloads) — **DEFERRED to Plan 04-08 UAT** per phase plan; build success + tsc clean confirm the SSR boundary (Pitfall 1) holds.

## Self-Check: PASSED

Files exist:
- FOUND: app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx
- FOUND: app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx

Commits exist:
- FOUND: 09f5285 (Task 1: Coverage + Tiers widgets)
- FOUND: 2d39109 (Task 2: Heatmap widget)
- FOUND: a9f65b8 (Task 3: registry + DashboardClient wiring)

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
