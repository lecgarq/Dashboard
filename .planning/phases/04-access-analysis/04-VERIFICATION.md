---
phase: 04-access-analysis
verified: 2026-05-08T00:00:00Z
status: passed
score: 13/13 must-haves verified
follow_up_phase_4_1:
  scope_note: "Owner approved DASH-01..13 functionality. Three polish items captured for a planned Phase 4.1 — they are NOT gaps against DASH-* spec."
  items:
    - "Move dashboard under the ACC Analysis page (replace it) — DASH-13 only mandates a single-page 2-col grid, not a specific route."
    - "Consolidate to 4–5 hero charts (visual density reduction)."
    - "Additional visual polish."
---

# Phase 04: ACC Access Analysis Dashboard — Verification Report

**Phase Goal:** Build the Phase 4 ACC Access Analysis Dashboard satisfying DASH-01..13 — coverage, active-tier, role analytics, recommendations, outliers, recently-added, admin-access, heatmap, inline severity, drill-down, drag-reorder, CSV exports, and locked Recommendations CSV column order.

**Verified:** 2026-05-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped 1:1 to DASH-01..13 in `.planning/REQUIREMENTS.md`)

| # | Truth (DASH ID) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | DASH-01: Junk-role recommendations with HIGH/MEDIUM/LOW priority | VERIFIED | `lib/acc/dashboardAnalytics.ts` `findJunkRoles` + `RecommendationsWidget.tsx` renders Type=Junk rows with severity column |
| 2 | DASH-02: Duplicate-role recommendations (overlap + ≥80% name token overlap) | VERIFIED | `findDuplicateRoles` + `lib/acc/nameSimilarity.ts` (token Jaccard) wired into `RecommendationsWidget.tsx` |
| 3 | DASH-03: Outlier module-combination widget (<5% holders) | VERIFIED | `findOutlierModuleCombos` + `OutlierCombosWidget.tsx` (96 lines) registered as `outliers` |
| 4 | DASH-04: Active-user tier stacked bar (7d/30d/90d/>90d/never) | VERIFIED | `lib/acc/activeUserTiers.ts` `bucketActiveUserTier` + `ActiveUserTiersWidget.tsx` (123 lines) |
| 5 | DASH-05: Account-admins list (project/shadow admins excluded) | VERIFIED | `AdminAccessWidget.tsx` filters `isAccountAdmin === true`; field plumbed end-to-end via `lib/server/acc-admin.ts` → `server/routers/users.ts` → `BulkAccUser` (Plan 04-01) |
| 6 | DASH-06: Recently-added widget with 7d/30d/90d toggle (default 30d) | VERIFIED | `RecentlyAddedWidget.tsx` (131 lines) — header comment confirms 7d/30d/90d, default 30d |
| 7 | DASH-07: ACC coverage donut (3 segments) | VERIFIED | `CoverageDonutWidget.tsx` `computeCoverage` produces both/onlyWorkspace/onlyAcc; data sourced from `workspace.getDirectory` tRPC query |
| 8 | DASH-08: Roles × Modules entitlement heatmap | VERIFIED | `RolesModulesHeatmapWidget.tsx` (252 lines, full-width col-span-2) with ECharts |
| 9 | DASH-09: Recommendations widget + inline severity badges on roles | VERIFIED | `roleSeverityIndex: Map<string, Severity>` from `computeAllFindings` consumed by Heatmap (axisLabel.rich badges) and Flow (custom nodeTypes) |
| 10 | DASH-10: Click any finding → right-side drill-down (no navigation) | VERIFIED | `DashboardSidePanel.tsx` (476 lines) + `selectionContext.tsx` `SelectionProvider` lifted above grid as sibling of DndContext |
| 11 | DASH-11: Per-widget Download CSV; Recommendations columns locked | VERIFIED | `downloadCsv` invoked in all 9 widgets + side panel; `RecommendationsWidget.tsx:135-142` emits exactly `Type, Severity, Roles, Members, Modules, SuggestedAction` and the comment at line 29 calls out the locked order |
| 12 | DASH-12: Drag-reorder widgets, persists across reloads | VERIFIED | `@dnd-kit/core` + `@dnd-kit/sortable` in `DashboardClient.tsx`; `useWidgetOrder.ts` hydrates from / writes to `localStorage` under `WIDGET_ORDER_STORAGE_KEY = "acc-dashboard-widget-order"` |
| 13 | DASH-13: Single-page 2-col grid at 1280px, no nav tabs | VERIFIED | `DashboardClient.tsx:120` `<div className="grid grid-cols-1 gap-4 md:grid-cols-2">`; `widgetRegistry.ts` locks span (col-span-1 / col-span-2) and DEFAULT_ORDER places coverage + tiers first |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `app/(dashboard)/users/dashboard/page.tsx` | Route shell (server) | VERIFIED | 26 lines, suspense + DashboardClient |
| `app/(dashboard)/users/dashboard/DashboardClient.tsx` | Client root with grid + DnD + provider | VERIFIED | 150 lines, wires findings + selection + dnd + side panel |
| `app/(dashboard)/users/dashboard/widgetRegistry.ts` | 9 widgets registered with locked spans | VERIFIED | 9 entries (coverage, tiers, kpi, recommendations, heatmap, outliers, flow, recent, admins) |
| `app/(dashboard)/users/dashboard/useWidgetOrder.ts` | localStorage-backed order hook | VERIFIED | Hydrates AFTER mount, validates keys, writes back on change |
| `app/(dashboard)/users/dashboard/widgets/CoverageDonutWidget.tsx` | DASH-07 | VERIFIED | 154 lines, Nivo Pie, 3 segments |
| `app/(dashboard)/users/dashboard/widgets/ActiveUserTiersWidget.tsx` | DASH-04 | VERIFIED | 123 lines |
| `app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx` | DASH-08 + DASH-09 (inline) | VERIFIED | 252 lines, ECharts heatmap, axisLabel rich severity dots |
| `app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx` | Overview KPI strip | VERIFIED | 95 lines, full-width |
| `app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx` | DASH-01/02/09 (widget) + DASH-11 locked CSV | VERIFIED | 218 lines, locked column order at lines 135-142 |
| `app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx` | DASH-03 | VERIFIED | 96 lines |
| `app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx` | DASH-09 (inline severity on flow) + DASH-10 click target | VERIFIED | 214 lines, xyflow custom nodeTypes |
| `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx` | DASH-06 | VERIFIED | 131 lines, 7d/30d/90d toggle |
| `app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx` | DASH-05 | VERIFIED | 89 lines, strict `=== true` filter |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | DASH-10 drill-down sheet | VERIFIED | 476 lines, shadcn Sheet + framer-motion |
| `app/(dashboard)/users/dashboard/findingsContext.tsx` | FindingsProvider | VERIFIED | 37 lines |
| `app/(dashboard)/users/dashboard/selectionContext.tsx` | SelectionProvider | VERIFIED | 62 lines |
| `app/(dashboard)/users/dashboard/SortableWidget.tsx` | DnD wrapper | VERIFIED | 65 lines |
| `lib/acc/dashboardAnalytics.ts` | computeAllFindings + roleSeverityIndex | VERIFIED | Provides JunkRoleFinding/DuplicateRoleFinding/OutlierFinding aggregator (DASH-01/02/03/09) |
| `lib/acc/activeUserTiers.ts` | bucketActiveUserTier (5 buckets) | VERIFIED | 7d/30d/90d/>90d/Never |
| `lib/acc/nameSimilarity.ts` | ≥80% normalized token overlap | VERIFIED | Used by findDuplicateRoles |
| `lib/acc/csvExport.ts` | UTF-8 BOM + RFC4180 escape via xlsx | VERIFIED | 32 lines, browser-only guard |
| `lib/server/acc-admin.ts` | isAccountAdmin extraction from ACC Admin API | VERIFIED | Plan 04-01 plumbing |
| `server/routers/users.ts` | bulkAccSummary propagates isAccountAdmin | VERIFIED | Plan 04-01 plumbing |
| `server/routers/workspace.ts` | getDirectory tRPC query for coverage donut | VERIFIED | `getDirectory: protectedProcedure.query(...)` at line 62 |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| `DashboardClient.tsx` | `users.bulkAccSummary` tRPC | `trpc.users.bulkAccSummary.useQuery` | WIRED |
| `DashboardClient.tsx` | `workspace.getDirectory` tRPC | `trpc.workspace.getDirectory.useQuery` | WIRED |
| `DashboardClient.tsx` | `computeAllFindings` | `findings = useMemo(...)` + `FindingsProvider` | WIRED |
| `widgetRegistry.ts` | All 9 widget components | direct imports | WIRED |
| `RecommendationsWidget.tsx` | `downloadCsv` with locked column order | direct call w/ object literal at lines 135-142 | WIRED |
| `useWidgetOrder.ts` | `window.localStorage` | `getItem` (mount) + `setItem` (on change) under `WIDGET_ORDER_STORAGE_KEY` | WIRED |
| Heatmap + Flow widgets | `roleSeverityIndex` | `useFindings()` consumed for inline badges | WIRED |
| Heatmap / Flow / Outliers / Recommendations / RecentlyAdded | `DashboardSidePanel` | `useSelection().setSelected` → SelectionProvider → SidePanel renders | WIRED |
| `lib/server/acc-admin.ts` | `BulkAccUser.isAccountAdmin` | `accountAdmin` field extraction → `bulkAccSummary` transform | WIRED |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| DASH-01 | 04-04, 04-06 | SATISFIED | findJunkRoles + RecommendationsWidget |
| DASH-02 | 04-03, 04-06 | SATISFIED | findDuplicateRoles + nameSimilarity + RecommendationsWidget |
| DASH-03 | 04-03, 04-07 | SATISFIED | findOutlierModuleCombos + OutlierCombosWidget |
| DASH-04 | 04-03, 04-07 | SATISFIED | bucketActiveUserTier + ActiveUserTiersWidget |
| DASH-05 | 04-07 | SATISFIED | AdminAccessWidget + isAccountAdmin pipeline |
| DASH-06 | 04-02 | SATISFIED | RecentlyAddedWidget toggle |
| DASH-07 | 04-01 (plumbing) + coverage widget | SATISFIED | CoverageDonutWidget + workspace.getDirectory |
| DASH-08 | 04-06 | SATISFIED | RolesModulesHeatmapWidget |
| DASH-09 | 04-06, 04-08 | SATISFIED | roleSeverityIndex consumed by Heatmap + Flow + Recommendations |
| DASH-10 | 04-08 | SATISFIED | DashboardSidePanel + SelectionProvider |
| DASH-11 | 04-05 | SATISFIED | downloadCsv per widget + locked Recommendations columns |
| DASH-12 | 04-05 | SATISFIED | dnd-kit + useWidgetOrder localStorage |
| DASH-13 | 04-05, 04-08 | SATISFIED | 2-col grid at md+, locked DEFAULT_ORDER, no nav tabs |

All 13 declared requirements satisfied. No orphaned requirements: REQUIREMENTS.md status table marks DASH-01..13 Complete.

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER markers in dashboard files; no empty handlers; no `return null` stubs; widgets all >85 lines with substantive rendering and CSV wiring.

### Human Verification Status

Phase 4 UAT was human-verified by the project owner on 2026-05-08 — all 16 UAT points approved (per 04-08-SUMMARY.md). No outstanding human-verification items.

### Phase 4.1 Follow-Up (NOT gaps against DASH-01..13)

Owner approved functionality but flagged three polish items for a planned Phase 4.1:

1. **Move the dashboard under the ACC Analysis page (replace it).** DASH-13 spec text: "All dashboard widgets render on a single page in a 2-column grid at 1280px... no navigation tabs are required to see any widget." It does NOT require the dashboard to live at `/users/dashboard` standalone — current location satisfies the spec.
2. **Consolidate to 4–5 hero charts.** Current 9-widget layout satisfies DASH-01..13 (each widget maps to its DASH ID). Reduction is a UX preference, not a spec requirement.
3. **Additional visual polish.** No spec requirement defines the polish bar; current rendering meets DASH-08 ("full-width, dense") and DASH-13 ("2-col grid").

These are scope-add items for a future Phase 4.1 and do NOT block Phase 4 closeout.

### Gaps Summary

None. All 13 DASH-* requirements are satisfied with substantive, wired implementations. Owner UAT passed 16/16. Phase 4 goal achieved.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
