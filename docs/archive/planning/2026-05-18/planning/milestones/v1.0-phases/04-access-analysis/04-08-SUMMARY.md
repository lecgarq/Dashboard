---
phase: 04-access-analysis
plan: 08
subsystem: ui
tags: [react, shadcn, sheet, framer-motion, echarts, xyflow, dashboard, drill-down]

# Dependency graph
requires:
  - phase: 04-access-analysis
    provides: FindingsContext + roleSeverityIndex + 9 production widgets + locked Recommendations CSV columns (04-06, 04-07)
provides:
  - Right-side drill-down panel (shadcn Sheet + framer-motion) for junk / duplicate / outlier / role findings
  - SelectionContext + useSelection hook (Pattern 4 single source of truth for selected finding)
  - Inline severity badges on heatmap y-axis labels (ECharts rich-text formatter) and flow nodes (custom node type)
  - Heatmap y-axis label / cell click and flow node / edge click both route into the drill-down panel
  - Phase 4 UAT human-verify gate passed (16/16 verification points approved)
affects:
  - phase-4.1-polish (visual polish + tab integration follow-up — see Deferred Items)
  - any future widget that needs to dispatch a finding selection (just call useSelection().setSelected)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 4: SelectionContext + useSelection hook lifted ABOVE the widget grid, panel rendered as sibling of grid (NOT inside DndContext) — mirrors AccUserSidePanel.tsx precedent"
    - "ECharts axisLabel.rich + axisLabel.formatter for inline severity dots without DOM overlay"
    - "@xyflow/react custom nodeTypes for inline severity badges; onNodeClick/onEdgeClick dispatch into SelectionContext"

key-files:
  created:
    - "app/(dashboard)/users/dashboard/selectionContext.tsx — SelectionProvider + useSelection hook (62 lines)"
    - "app/(dashboard)/users/dashboard/DashboardSidePanel.tsx — Sheet-based drill-down panel, 4 finding kinds, framer-motion slide-in, CSV export (476 lines)"
  modified:
    - "app/(dashboard)/users/dashboard/DashboardClient.tsx — wraps grid in SelectionProvider; renders panel as sibling outside DndContext"
    - "app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx — onClick → setSelected (junk + duplicate)"
    - "app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx — row onClick → setSelected({kind:'outlier'})"
    - "app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx — rich-text severity dots on y-axis + onEvents click handler"
    - "app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx — custom node type with severity badge; node/edge clicks route into selection"
    - "components/layout/navigation.ts — sidebar entry pointing to /users/dashboard (out-of-plan polish, b0bc6a5)"

key-decisions:
  - "SelectionProvider wraps INSIDE FindingsProvider so the panel can read findings + roleSeverityIndex without prop-drilling"
  - "DashboardSidePanel is rendered as a SIBLING of the widget grid (not inside DndContext) to keep drag-and-drop and panel content isolated"
  - "Heatmap inline severity uses ECharts rich-text formatter (no DOM overlay); flow widget uses @xyflow/react custom nodeTypes — both consume the same useFindings().roleSeverityIndex (single source of truth)"
  - "Panel width sm:max-w-lg keeps the dashboard grid visible behind it at 1280px — preserves CONTEXT.md density requirement"
  - "RecommendationsWidget onSelect prop removed in favor of useSelection() context — eliminates prop-drilling through DashboardClient"

patterns-established:
  - "Pattern 4: Selection-via-context — discriminated SelectedFinding union (junk | duplicate | outlier | role) consumed by a single sibling panel; widgets only know setSelected(...)"
  - "ECharts rich-text severity dots (no overlay DOM) — `{hi|●} RoleName` formatter with axisLabel.rich color map"

requirements-completed: [DASH-09, DASH-10]

# Metrics
duration: ~25min (impl) + UAT
completed: 2026-05-08
---

# Phase 4 Plan 08: Drill-Down + Inline Badges + Phase UAT Summary

**Right-side drill-down panel (shadcn Sheet + framer-motion) for junk/duplicate/outlier/role findings, with inline severity dots on the Roles×Modules heatmap y-axis and the role-relationship flow nodes; Phase 4 UAT passed 16/16.**

## Performance

- **Duration:** ~25 min implementation, plus UAT human-verify cycle
- **Started:** 2026-05-08T19:30:00Z (approx, Task 1 commit at 13:31 local)
- **Completed:** 2026-05-08T21:25:00Z (UAT approval)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 7 (2 created + 5 modified, plus 1 nav polish)

## Accomplishments

- DASH-10 shipped — clicking any junk row, duplicate pair, outlier row, heatmap label/cell, or flow node/edge opens a right-side panel with affected members, modules, projects, suggested action, raw data, and a Download-CSV button. Closing the panel does not navigate away (URL unchanged).
- DASH-09 closed — inline severity indicators now appear on heatmap y-axis labels (rich-text dots) and flow widget nodes (custom node badge), in addition to the Recommendations widget.
- Phase 4 UAT passed (16/16): all 9 widgets render in the 2-col grid at 1280px, drag-reorder persists, CSV downloads succeed per widget, Recommendations CSV header matches the locked DASH-13 contract, drill-down works for all four finding kinds, no console errors observed.
- Phase 4 / Milestone v1.0 functionality is end-to-end complete (production build passes; all 13 DASH-* requirements satisfied).

## Task Commits

1. **Task 1: SelectionContext + DashboardSidePanel (shadcn Sheet) with all four finding kinds** — `e745750` (feat)
2. **Task 2: Wire setSelected into Recommendations + Outliers + heatmap labels + flow nodes; render inline severity badges** — `0da5bb7` (feat)
3. **Task 3: Phase 4 UAT — verify all 13 ROADMAP success criteria end-to-end** — checkpoint, approved by user 2026-05-08

**Out-of-plan polish:** `b0bc6a5` (feat) — added Access Analysis sidebar nav entry pointing to /users/dashboard so the route is reachable without typing the URL. Logged here for traceability; not strictly part of the plan tasks.

**Plan metadata commit:** captured by the docs commit closing this plan.

## Files Created/Modified

- `app/(dashboard)/users/dashboard/selectionContext.tsx` — SelectionProvider + useSelection hook; discriminated SelectedFinding union (junk | duplicate | outlier | role | null)
- `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` — Sheet-based drill-down panel; per-kind body (junk / duplicate / outlier / role); affected-members table + Download CSV; framer-motion slide-in
- `app/(dashboard)/users/dashboard/DashboardClient.tsx` — wraps subtree in SelectionProvider INSIDE FindingsProvider; renders DashboardSidePanel as sibling of grid (outside DndContext)
- `app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx` — replaced onSelect prop with useSelection().setSelected for junk + duplicate rows
- `app/(dashboard)/users/dashboard/widgets/OutlierCombosWidget.tsx` — row onClick → setSelected({kind:"outlier", finding})
- `app/(dashboard)/users/dashboard/widgets/RolesModulesHeatmapWidget.tsx` — yAxis.axisLabel.rich/formatter renders severity dot from roleSeverityIndex; onEvents click on yAxis label or cell dispatches setSelected({kind:"role"})
- `app/(dashboard)/users/dashboard/widgets/RoleRelationshipFlowWidget.tsx` — custom nodeTypes with inline severity dot/badge; onNodeClick → setSelected({kind:"role"}); onEdgeClick → setSelected({kind:"duplicate"})
- `components/layout/navigation.ts` — sidebar entry for Access Analysis dashboard (out-of-plan polish, b0bc6a5)

## Decisions Made

- **SelectionProvider placement:** Inside FindingsProvider, outside DndContext — allows the panel to read findings/severity without prop-drilling, while keeping drag-and-drop isolated from panel interactions.
- **Panel width sm:max-w-lg:** Keeps the 2-col grid visible behind the panel at 1280px, preserving the dashboard's density requirement from 04-CONTEXT.md.
- **Heatmap severity rendering:** ECharts rich-text formatter (`{hi|●} BIM Coordinator`) instead of a sibling DOM overlay — single source of truth via useFindings().roleSeverityIndex, no scroll/sync bugs.
- **Flow widget severity rendering:** Custom @xyflow/react nodeTypes reading severity from node `data` (passed in by the widget when constructing nodes from useFindings) — keeps the registry-component contract clean.
- **Removed RecommendationsWidget.onSelect prop:** Switched to useSelection() context to eliminate prop-drilling through DashboardClient and to align with the new Pattern 4.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2. The sidebar nav entry (b0bc6a5) was a small ergonomic polish added after Task 2 to make the dashboard reachable without typing the URL; recorded above for traceability and discussed with the user during UAT.

## Issues Encountered

None — production build (`npm run build`) and `npx tsc --noEmit` both passed cleanly across both tasks. UAT surfaced visual-polish feedback (see Deferred Items) but no functional defects.

## UAT Outcome (Task 3 — checkpoint:human-verify)

**Status: APPROVED 2026-05-08 — all 16 verification points passed.**

| # | Criterion | Result |
|---|-----------|--------|
| 1 | /users/dashboard renders while logged in as Workspace Google user | PASS |
| 2 | DASH-13 — All 9 widgets visible in 2-col grid at 1280px (Coverage + Active tiers above fold) | PASS |
| 3 | DASH-01 — Coverage donut shows 3 segments with non-zero "In both" | PASS |
| 4 | DASH-02 — Active-tier stacked bar with 5 buckets summing to total | PASS |
| 5 | DASH-03 + DASH-09 — Recommendations lists junk roles with HIGH/MEDIUM/LOW badges; click opens panel | PASS |
| 6 | DASH-04 — Duplicate-role pairs in Recommendations; click opens panel with both roles + module union | PASS |
| 7 | DASH-05 — Outlier widget lists module sets <5% of members (or empty state) | PASS |
| 8 | DASH-06 — Recently-added defaults 30d; toggling 7d / 90d filters | PASS |
| 9 | DASH-07 — Admin-access shows ONLY isAccountAdmin === true users | PASS |
| 10 | DASH-08 — Heatmap full-width, cell colors, tooltip, dataZoom | PASS |
| 11 | DASH-09 — Inline severity badges on heatmap y-axis + flow nodes | PASS |
| 12 | DASH-10 — Drill-down panel opens for junk/duplicate/outlier/role; URL stable on close | PASS |
| 13 | DASH-11 — Per-widget Download CSV downloads non-empty file | PASS |
| 14 | DASH-13 — Recommendations CSV header exactly `Type,Severity,Roles,Members,Modules,SuggestedAction` | PASS |
| 15 | DASH-12 — Drag-reorder persists across reload | PASS |
| 16 | No console errors during navigation, drag, or finding clicks | PASS |

## Deferred Items (User Feedback During UAT)

The user approved all 16 functional verification points but flagged the following follow-ups to be addressed in a separate **Phase 4.1 Polish** phase (not in scope for 04-08):

1. **Visual polish — "lacks UI impact":** Dashboard functionality is correct but the visual treatment is too plain; needs typography, spacing, hierarchy, and color refinement to feel like a premium analytics surface.
2. **Move under existing ACC Analysis page as a tab (not standalone /users/dashboard):** The dashboard currently lives at its own route; user wants it integrated as a tab inside the existing ACC Analysis page so the graph and dashboard share a parent route.
3. **Graph-only treatments — remove list-based widgets:** Replace the four list-style widgets (Recommendations, Outliers, Recently-added, Admin-access) with chart treatments. The drill-down panel can continue to surface row-level detail; the widgets themselves should be visual/graphical, not tabular.

These are explicitly out of scope for 04-08 (which closes DASH-09 + DASH-10 + the Phase 4 UAT gate as planned). They will be planned and executed under a follow-up **Phase 4.1 Polish** plan.

## Performance Observations

The 25k-node hub continues to load the dashboard cleanly:
- FindingsContext computes once via useMemo in DashboardClient (Pattern 3, established in 04-07) — drill-down panel reads pre-computed roleSeverityIndex without recomputation.
- SelectionContext state changes only re-render the DashboardSidePanel (sibling of grid); widgets do not re-render on selection change because they don't subscribe to useSelection().
- Heatmap rich-text formatter and flow custom nodes consume the same severity index — no duplicated computation, no per-render allocations of severity maps.

## User Setup Required

None — no external service configuration required for this plan.

## Next Phase Readiness

- Phase 4 functionally complete; all 13 DASH-* requirements satisfied.
- Milestone v1.0 functionality is end-to-end ready, pending the Phase 4.1 Polish follow-up before user-visible launch.
- No blockers carried forward from 04-08.

## Self-Check: PASSED

- Files exist: `app/(dashboard)/users/dashboard/selectionContext.tsx`, `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx`, modified DashboardClient.tsx + 4 widgets + navigation.ts — all confirmed via git show on commits e745750 / 0da5bb7 / b0bc6a5.
- Commits exist on branch deploy: `e745750`, `0da5bb7`, `b0bc6a5` — confirmed via git log.
- UAT outcome documented: 16/16 PASS approved by user.
- Deferred items recorded for Phase 4.1.

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
