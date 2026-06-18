---
phase: 05-access-analysis-depth
plan: "02"
subsystem: access-analysis
tags: [cross-filter, INT-04, INT-05, INT-02, VIS-05, slice-filter, pill-bar, people-sheet]
dependencies:
  requires:
    - applySliceFilters + SliceFilters from 05-01 (projectFilter.ts)
    - PillBar RED stub from 05-01 (__tests__/PillBar.test.tsx)
    - Six chart components on @/components/ui/EChart from 05-01
  provides:
    - PillBar component (INT-05) — turns 05-01 RED stub GREEN
    - sliceFilters state + toggleSliceFilter + applySliceFilters in all 4 donut memos + timeline (INT-04)
    - onSliceClick + activeSlice (glow/dim) on all 4 filterable donuts
    - View N people affordance on 4 filterable panels (INT-02)
    - DrillSheet + PeopleDrillList people sheet, sourced from in-memory summaries
  affects:
    - app/(dashboard)/access-analysis/components/ — AccessAnalysisCharts, PillBar (new), 4 donut components
    - app/(dashboard)/access-analysis/__tests__/ — PillBar (GREEN), AccessAnalysisCharts (7 new tests)
tech_stack:
  added: []
  patterns:
    - AnimatePresence fade/scale pill enter/exit (useSafeVariants reduced-motion safe, ≤150ms)
    - sliceFilteredProjectIds memo — Set intersection of slice-filtered roleRows + selected for timeline narrowing
    - SectionHeaderWithPeople — deduplicates people by email across drill buckets before count
    - activeSlice visual anchor — selectedMode:"single" + selected:true + opacity:0.45 on siblings + shadowBlur glow
    - DrillSheet + PeopleDrillList for people list (no tRPC, in-memory summaries)
    - Security: PillBar uses React text nodes only, no dangerouslySetInnerHTML
key_files:
  created:
    - app/(dashboard)/access-analysis/components/PillBar.tsx
  modified:
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
    - app/(dashboard)/access-analysis/components/RolesPieChart.tsx
    - app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx
    - app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx
    - app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx
    - app/(dashboard)/access-analysis/__tests__/PillBar.test.tsx
    - app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx
decisions:
  - "Timeline slice-narrowing uses sliceFilteredProjectIds: Set of projectIds from applySliceFilters(filterRowsBySelection(roleRows,selected),sliceFilters). No projectId intersection needed — the filtered roleRows already carry only the selected+slice-matching projects."
  - "moduleSummary NOT wrapped in applySliceFilters: ModuleActivityRow has no roles/company fields — TypeScript type constraint prevents it; safe no-op anyway. Module stays picker-scoped only (consistent with Terrain + MC out-of-scope boundary)."
  - "People sheet sources from [...summaryMap.values()].flat(), deduped by email in SectionHeaderWithPeople. No new queries — pure in-memory derivation (Pitfall 2 / PERF-03)."
  - "Slice click (toggleDrill in donut legend) fires both local drill and onSliceClick — they coexist. Chart click events (EChart onEvents.click) also call onSliceClick for real slice names."
  - "Others(...) and warning bucket names excluded from onSliceClick calls in all 4 donuts."
  - "Locked: slice click does NOT open people sheet. Only the View N people button opens it."
metrics:
  duration: "8 minutes"
  completed: "2026-06-18"
  tasks: 3
  files_modified: 7
  files_created: 1
status: complete
---

# Phase 05 Plan 02: Cross-filter + PillBar + View People Summary

**One-liner:** INT-04 cross-filter via sliceFilters state + applySliceFilters in 4 donut memos + timeline narrowing, INT-05 PillBar with animated per-pill dismiss, INT-02 "View N people" affordance opening a shared in-memory DrillSheet.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | PillBar component — turns 05-01 RED stub GREEN (INT-05) | abb3d305 |
| 2 | Wire sliceFilters + applySliceFilters + onSliceClick + activeSlice glow (INT-04) | fff9fdc9 |
| 3 | View N people affordance + INT-04/INT-02 interaction tests | 5e6e67a9 |

## What Was Built

### Task 1: PillBar (INT-05)

- `PillBar.tsx` ("use client") with `PillBarProps`: `filters: SliceFilters`, `onRemove`, `onClear`, optional `labels`
- Returns `null` when `Object.keys(filters).length === 0` — no layout waste
- One animated pill per active filter: `AnimatePresence` fade/scale (≤150ms), `useSafeVariants` reduced-motion safe
- Per-pill X dismiss button with `aria-label="Remove {label} filter"`, calling `onRemove(dim)`
- "Clear all" trailing button calling `onClear`
- Security: filter values rendered as React text nodes only — no `dangerouslySetInnerHTML`
- `data-testid="slice-pill-bar"` on container
- Removed `@ts-expect-error` from `PillBar.test.tsx`; all 4 stub tests now pass (GREEN)

### Task 2: sliceFilters + applySliceFilters wiring (INT-04)

`AccessAnalysisCharts.tsx`:
- `sliceFilters: SliceFilters` state + `toggleSliceFilter(dim, val)` toggle (same value removes)
- `sliceFilteredProjectIds` memo: `Set` of projectIds from `applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters)` — drives timeline narrowing
- **Timeline**: `summarizeActivityTimeline(timelineRows, sliceFilteredProjectIds)` — refocuses with donuts when active
- **roleSummary**: `summarizeRoles(applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters))`
- **companySummary**: same wrap on roleRows
- **activityByRoleSummary**: membershipRows wrapped in `applySliceFilters`; actorRows follow naturally via join
- **activityByCompanySummary**: same pattern
- **moduleSummary**: picker-only (ModuleActivityRow lacks roles/company — TypeScript prevents the wrap; see Decisions)
- `PillBar` rendered under `ProjectPicker` with `onRemove`/`onClear`; `Clear all` only clears `sliceFilters` — `selected` is untouched

Four donut components (Roles, Companies, ActivityByRole, CompaniesActivity):
- New optional props: `onSliceClick?: (value: string) => void` and `activeSlice?: string`
- `toggleDrill` extended to call `onSliceClick?.(name)` for real slice names (not Others/warnings)
- `selectedMode: "single"` on active filter; active datum: `selected: true`, full opacity, `shadowBlur: 24`, `shadowColor: base+"99"`; sibling datums: `opacity: 0.45`

### Task 3: View N people affordance + tests (INT-02)

- `SectionHeaderWithPeople` replaces `SectionHeader` on the 4 filterable panels
- Deduplicates people by email (one person may appear in multiple drill buckets)
- "View {n} people →" button (`data-testid="view-people-role"` etc.) visible when `uniquePeople.length > 0`
- Opens `peopleSheet` state: `{ title, people }` → `DrillSheet` + `PeopleDrillList` (in-memory, no queries)
- People-sheet person click: `setProfileEmail(email.toLowerCase())` + closes sheet
- `data-testid="people-sheet"` on inner content div for test assertion

7 new tests in `AccessAnalysisCharts.test.tsx`:
- INT-04: legend click sets slice pill + rebuckets role legend to filter-only rows
- INT-04: second click on same legend button removes the pill (toggle off)
- INT-04: Clear all removes pills but leaves Project Picker checkboxes checked
- INT-04: AND-stack — role + company both show as pills with labels
- INT-02: View people button opens sheet with expected person
- INT-02: slice click alone does NOT open people-sheet

## Verification

- `npx tsc --noEmit`: exit 0 (no TypeScript errors)
- PillBar.test.tsx: 4 tests pass (GREEN — 05-01 RED stub now implemented)
- AccessAnalysisCharts.test.tsx: 18 tests pass (15 pre-existing + 3 new per-describe × 2–3 tests = 7 new total across 2 new describe blocks, total 18)
- No `import { trpc }` / `useQuery` added (verified by inspection — Pitfall 2 / PERF-03)
- No WebGL added (PERF-05)
- `selected` state path unchanged; Clear all only clears `sliceFilters` (verified by test)
- Terrain + CoordinationByProject receive NO sliceFilters (scope boundary held — only 4 donuts + timeline in scope)
- Pre-existing failures: FolderPermissionTerrain (2) + ActivityCoverageBadge (1 RED stub) — unchanged from 05-01 baseline

## Deviations from Plan

### Intentional Deviations

**[Rule 2 - Missing functionality] moduleSummary NOT wrapped in applySliceFilters:**
- Plan stated "wrap moduleRows (ModuleActivityRow has no roles/company → applySliceFilters is a safe no-op, but include the wrap for consistency)"
- TypeScript's generic constraint on `applySliceFilters<T extends { roles?: string[]; company?: string | null }>` correctly rejects `ModuleActivityRow` (which has `rawAction` + `count` instead) — tsc produces TS2345
- Decision: keep `moduleSummary` picker-scoped only. This is correct behavior: Module activity is not role/company-attributed data; cross-filtering it would be a no-op anyway. Documented in Decisions.

**Timeline narrowing implementation:**
- Plan mentioned "projectId-intersection approach" suggesting `Set.intersection(selected, narrowed)`
- Implemented as: `new Set(applySliceFilters(filterRowsBySelection(roleRows, selected), sliceFilters).map(r => r.projectId))` — this IS the intersection (filterRowsBySelection already limits to `selected`; applySliceFilters then narrows further). No explicit Set intersection needed; result is correct.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| ActivityCoverageBadge component missing | `__tests__/ActivityCoverageBadge.test.tsx` | Intentional RED — Wave 2 (05-03) implements |

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. People list is sourced entirely from in-memory summaries already in the browser; no new data surface.

## Self-Check: PASSED

- `app/(dashboard)/access-analysis/components/PillBar.tsx` — exists, exports PillBar
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — contains `applySliceFilters`, `sliceFilters`, `toggleSliceFilter`, `PillBar`, `onSliceClick`, `activeSlice`, `SectionHeaderWithPeople`, `peopleSheet`, `DrillSheet`
- Commits abb3d305, fff9fdc9, 5e6e67a9 all confirmed in `git log --oneline -5`
- `npx tsc --noEmit` exits 0
- 22 target tests pass (PillBar 4 + AccessAnalysisCharts 18)
