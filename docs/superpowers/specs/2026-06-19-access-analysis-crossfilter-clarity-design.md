# Access-Analysis Cross-Filter Clarity — Design

**Date:** 2026-06-19
**Status:** Approved (owner)
**Context:** Phase 5 gap closure. Phase 5 shipped the donut cross-filter engine (`applySliceFilters`), a `PillBar`, a "View N people →" affordance, and slice glow/dim. At verification the owner confirmed the page *looks* right but the **interaction** reads as confusing on all four axes: (1) what just happened after a click is unclear, (2) slice-click vs "View people" is muddled, (3) it's not obvious slices are clickable, (4) it's hard to undo / get back to the full view.

## Goal

Make the cross-filter interaction legible at a glance for a non-technical workshop audience — clarify cause→effect, discoverability, reversibility, and mode separation — **without rebuilding the engine**. This is a feedback-and-affordance layer over the working `applySliceFilters` engine.

## Non-Goals (YAGNI / preserved invariants)

- Do NOT touch the `applySliceFilters` engine or the donut memo wiring.
- Preserve locked decisions: a slice click must NOT open the people panel and must NOT re-animate the KPI count; "Clear filters" clears only `sliceFilters`, never the Project Picker selection.
- Preserve the slice glow/dim and the tactile click-the-chart gesture the owner liked.
- No new server queries. All new numbers derive from already-loaded rows.
- Scope is limited to `app/(dashboard)/access-analysis/`. `/users/access-analysis/` and `/users/spatial-graph` are out of scope.

## Components

### 1. `FilterBanner.tsx` (new) — the primary feedback surface

Replaces the tiny `text-xs` pill row (`AccessAnalysisCharts.tsx:243`) as the headline "you are filtering" signal.

- Renders **null** when `sliceFilters` is empty (no layout waste) — the idle tip (below) occupies that slot instead.
- When one or more filters are active, renders a full-width, elevated band:
  - `🔍 Filtered:` label + one readable chip per active dimension (`Role = Architect ✕`), reusing the existing tested `PillBar` chip remove/clear logic folded inside the banner.
  - **Scope line:** `Showing N of M projects`.
    - `M` = distinct `projectId` count in `filterRowsBySelection(roleRows, selected)` (the current Project-Picker view; default all ≈ 1,152).
    - `N` = distinct `projectId` count after `applySliceFilters(...)` (i.e. `sliceFilteredProjectIds.size`).
    - Both derived from rows already in memory — zero new queries.
  - **`Clear filters`** button — prominent, always visible while filtered; calls the existing clear handler (clears `sliceFilters` only).
- Motion: slide/fade in on first activation via the existing `useSafeVariants` motion facade (reduced-motion safe). Must not re-fire on every filter change beyond the chip add/remove animation already in `PillBar`.

### 2. Idle tip (discoverability, words)

A single muted caption under the dashboard title, shown **only while no filter is active**: *"Tip — click any chart slice to filter the dashboard."* It and the `FilterBanner` are mutually exclusive (tip when idle, banner when filtered), so the same slot always tells the user the current mode.

### 3. Donut click affordance (discoverability, feel)

The 4 filterable donut components — `RolesPieChart`, `CompaniesPieChart`, `ActivityByRolePieChart`, `CompaniesActivityPieChart` — set the ECharts series `cursor: 'pointer'` so the pointer changes on hover (the existing emphasis hover-lift already provides motion feedback). No change to the non-filterable charts (`ModulesPieChart`, `ActivityTimelineChart`).

### 4. "View N people" mode separation

In `SectionHeaderWithPeople` (inside `AccessAnalysisCharts.tsx`), change `View N people →` from a look-alike text link into a distinct **outlined button with a people icon** (`👤 View 340 people`), spatially set apart in the panel header. Result: "click the chart = filter" and "click the button = open the list" are two visually distinct actions. Behavior unchanged — it still opens the shared slide-in people panel for the current filtered view.

## Data Flow

```
slice click → toggleSliceFilter(dim, val)        (unchanged)
  → sliceFilters state                            (unchanged)
  → applySliceFilters in donut/timeline memos     (unchanged)
  → sliceFilteredProjectIds (Set)                 (unchanged; now also feeds N)
  → FilterBanner reads { sliceFilters, N, M, onRemove, onClear }   (new wiring)
  → idle tip hidden, banner shown                 (new)
```

`N`/`M` are computed in `AccessAnalysisCharts.tsx` from existing memos and passed to `FilterBanner` as props. `FilterBanner` is presentational — no data fetching, no engine logic.

## Testing

- **`FilterBanner.test.tsx` (new):**
  - renders null when no filters active;
  - renders `Showing N of M projects` with provided counts;
  - renders one chip per active dimension; chip ✕ calls `onRemove(dim)`;
  - `Clear filters` calls `onClear`.
- **`AccessAnalysisCharts.test.tsx` (update):**
  - idle tip visible when no filter; replaced by banner after a slice click;
  - banner scope text reflects the filtered project count;
  - the "View people" control is a distinct button (`data-testid`) that opens the sheet and does NOT fire on a slice click.
- Donut cursor: assert the series option carries `cursor: 'pointer'` (token-level check, consistent with `chartContrast.test.ts` style) OR cover via the existing donut tests.
- Hold baseline: the 2 pre-existing `FolderPermissionTerrain` failures are unrelated concurrent WIP and must remain the only known failures; `npx tsc --noEmit` exits 0.

## Files Modified

| File | Change |
|------|--------|
| `app/(dashboard)/access-analysis/components/FilterBanner.tsx` | NEW — banner: icon + chips + scope line + Clear filters |
| `app/(dashboard)/access-analysis/__tests__/FilterBanner.test.tsx` | NEW — banner unit tests |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | swap pill row → FilterBanner, add idle tip, compute N/M scope, restyle "View people" as a button |
| `app/(dashboard)/access-analysis/components/PillBar.tsx` | chips reused inside the banner; keep public API (may be imported by FilterBanner) |
| `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` | `cursor: 'pointer'` on filterable series |
| `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` | `cursor: 'pointer'` on filterable series |
| `app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx` | `cursor: 'pointer'` on filterable series |
| `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx` | `cursor: 'pointer'` on filterable series |
| `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx` | banner + tip + people-button assertions |

## Requirements Touched

Clarity refinement of Phase 5's INT-04 (cross-filter), INT-05 (active-filter surface), INT-02 (view people). No new requirement IDs; this is gap closure on the interaction legibility of the existing ones.

## Verification

Re-run the owner interaction check on a rebuilt `:3000`: click a slice → an unmissable banner names the filter and shows "N of M projects"; the slices show a pointer cursor and the idle tip; "Clear filters" returns to the full view in one click; the people button reads as separate from the filter gesture.
