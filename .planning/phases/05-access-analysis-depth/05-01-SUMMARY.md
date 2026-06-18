---
phase: 05-access-analysis-depth
plan: "01"
subsystem: access-analysis
tags: [foundation, echarts, theming, performance, tdd-stubs]
dependencies:
  requires: []
  provides:
    - applySliceFilters pure helper + SliceFilters type (INT-04 engine seam)
    - six chart components on canonical @/components/ui/EChart (ACC-02, VIS-02)
    - AccActivity(userEmail, projectId) composite index (PERF-05)
    - PillBar RED stub (INT-05 contract)
    - ActivityCoverageBadge RED stub (NA-01 contract)
  affects:
    - app/(dashboard)/access-analysis/ — all six chart components + projectFilter
    - prisma/schema.prisma — AccActivity model index
tech_stack:
  added: []
  patterns:
    - ECharts universalTransition on donut series (morph on filter-state changes)
    - gradient itemStyle.color fills via ECharts linear colorStops
    - Object.hasOwn prototype-pollution-safe filter on Record<string,string>
    - @ts-expect-error on missing-component import keeps tsc exit 0 while tests stay RED
key_files:
  created:
    - app/(dashboard)/access-analysis/__tests__/PillBar.test.tsx
    - app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx
    - prisma/migrations/20260618230000_add_acc_activity_email_project_index/migration.sql
  modified:
    - app/(dashboard)/access-analysis/projectFilter.ts
    - app/(dashboard)/access-analysis/__tests__/projectFilter.test.ts
    - app/(dashboard)/access-analysis/components/RolesPieChart.tsx
    - app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx
    - app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx
    - app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx
    - app/(dashboard)/access-analysis/components/ModulesPieChart.tsx
    - app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx
    - prisma/schema.prisma
decisions:
  - "Migration applied via raw CREATE INDEX + prisma migrate resolve (pgvector blocks shadow DB in prisma migrate dev — pre-existing known issue)"
  - "cTitle/cSub kept in all six charts (used in center-label textStyle and tooltip formatter HTML, not injected by mergeEChartsTheme)"
  - "cSlice/cShadow/cShadowHover kept (series itemStyle, emphasis — intentionally caller-owned per mergeEChartsTheme scope guard)"
  - "Tooltip formatter cTipText ref replaced with cTitle (bold % text) since cTipText removed; visual parity maintained"
  - "lighten() helper duplicated per-file (no shared dep to avoid coupling 5 chart files to a new utility module)"
  - "ActivityTimelineChart keeps dark + cAxis for dataZoom slider chrome (not injected by wrapper)"
metrics:
  duration: "7 minutes"
  completed: "2026-06-18"
  tasks: 3
  files_modified: 9
  files_created: 3
status: complete
---

# Phase 05 Plan 01: Phase 5 Foundation — Charts Migration + Cross-filter Helper + Index Summary

**One-liner:** EChart canonical wrapper migration with universalTransition + gradient fills across all six access-analysis donuts, plus applySliceFilters helper, AccActivity composite index, and PillBar/ActivityCoverageBadge RED stubs.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | applySliceFilters helper + SliceFilters type + 6 new tests | 1869926a |
| 2 | Migrate 6 chart components to @/components/ui/EChart + universalTransition + gradients | 5601a9f3 |
| 3 | AccActivity composite index migration + PillBar + ActivityCoverageBadge RED stubs | ff1292a6 |

## What Was Built

### Task 1: applySliceFilters + SliceFilters

- Added `SliceFilters = Record<string, string>` type to `projectFilter.ts`
- Added `applySliceFilters<T>()` pure helper that AND-stacks "role" and "company" dimensions
- Uses `Object.hasOwn()` (not `in` operator or direct access) for prototype-pollution safety
- Empty filters: referential pass-through (no copying), allowing identity checks upstream
- 6 new tests covering: empty pass-through, role filter, company filter, AND-stack, null exclusion, unknown-key ignore
- All 13 projectFilter tests pass

### Task 2: EChart Canonical Wrapper Migration

Six components migrated from local `./EChart` to `@/components/ui/EChart`:

| Component | cTitle/cSub kept? | Reason |
|-----------|-------------------|--------|
| RolesPieChart | Yes | Center label textStyle + formatter HTML |
| CompaniesPieChart | Yes | Center label textStyle + formatter HTML |
| ActivityByRolePieChart | Yes | Center label textStyle + formatter HTML |
| CompaniesActivityPieChart | Yes | Center label textStyle + formatter HTML |
| ModulesPieChart | Yes | tooltipByName formatter HTML (computed in useMemo) |
| ActivityTimelineChart | Yes (cTitle only) | Tooltip formatter heading; cAxis kept for dataZoom chrome |

All five donuts now have:
- `universalTransition: true` inside `series[0]`
- `notMerge={false}` on `<EChart>` (required for universalTransition to morph)
- Gradient `itemStyle.color` via ECharts `{ type: "linear", colorStops: [lighter, base] }` (VIS-02)
- A local `lighten(hex, amt)` pure hex helper

ActivityTimelineChart:
- `notMerge={false}` added (animate refocus)
- Axis chrome removed (injected by mergeEChartsTheme)
- Tooltip chrome removed (injected by mergeEChartsTheme)
- `dark` and `cAxis` kept for dataZoom `backgroundColor`, `fillerColor`, `textStyle`

Removed from all six files: `cTipBg`, `cTipBorder`, `cTipText`, and their corresponding `tooltip.backgroundColor/borderColor/borderWidth/textStyle` option fields.

Zero `from "./EChart"` imports remain in `app/(dashboard)/access-analysis/components/`.

All 32 chart + page tests pass.

### Task 3: AccActivity Index + RED Stubs

**Index (PERF-05):**
- Added `@@index([userEmail, projectId])` to `AccActivity` in `schema.prisma`
- `npx prisma migrate dev` failed — expected (pgvector extension missing from shadow DB; pre-existing known issue per memory note)
- Fallback applied: `CREATE INDEX IF NOT EXISTS "AccActivity_userEmail_projectId_idx"` via raw SQL
- Created migration dir `20260618230000_add_acc_activity_email_project_index/migration.sql` manually
- Reconciled via `npx prisma migrate resolve --applied` → `npx prisma migrate status` reports "Database schema is up to date!"
- `npx prisma validate` passes

**RED Stubs:**
- `PillBar.test.tsx` (INT-05): 4 tests for pill render, per-pill dismiss, clear-all, empty-state. Fails at runtime with import error — component does not exist yet.
- `ActivityCoverageBadge.test.tsx` (NA-01): 2 tests for covered/total counts and projects label. Fails at runtime with import error — component does not exist yet.
- Both use `// @ts-expect-error not yet implemented` on the import line → `tsc --noEmit` exits 0.

## Verification

- `npx tsc --noEmit`: exit 0 (no TypeScript errors)
- `npx prisma validate`: schema valid
- `npx prisma migrate status`: 18 migrations, "Database schema is up to date!"
- Test suite: 2125 pass / 2 skip / 2 pre-existing failures (FolderPermissionTerrain) / 2 intentional RED (PillBar + ActivityCoverageBadge)
- Zero `from "./EChart"` imports in components directory
- Zero new `import { trpc }` or `useQuery` introduced
- AccessAnalysisCharts.tsx untouched

## Deviations from Plan

### Auto-fixed Issues

None.

### Intentional Deviations

**Migration fallback (pre-existing constraint):** `npx prisma migrate dev` rejected by pgvector extension missing in shadow DB. This is a known pre-existing issue on Luis's machine (documented in memory: "Local migrate broken (pgvector); used raw ALTER"). Applied via raw SQL + manual migration dir + `prisma migrate resolve --applied`. Status is clean.

**Tooltip formatter % color:** `cTipText` (removed) was used as bold `%` text color in formatter HTML. Replaced with `cTitle` (the stronger heading color) which is already kept. Visual result is identical or slightly stronger emphasis — no test regression.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| PillBar component missing | `__tests__/PillBar.test.tsx` | Intentional RED — Wave 1 implements |
| ActivityCoverageBadge component missing | `__tests__/ActivityCoverageBadge.test.tsx` | Intentional RED — Wave 2 implements |

These stubs are the contracted RED state for INT-05 and NA-01. Later waves implement against them.

## Self-Check: PASSED

- `app/(dashboard)/access-analysis/projectFilter.ts` — exists with `applySliceFilters` export
- `prisma/schema.prisma` — contains `@@index([userEmail, projectId])`
- `app/(dashboard)/access-analysis/__tests__/PillBar.test.tsx` — created
- `app/(dashboard)/access-analysis/__tests__/ActivityCoverageBadge.test.tsx` — created
- All 6 chart components: `@/components/ui/EChart` import confirmed, `universalTransition: true` present
- Commits 1869926a, 5601a9f3, ff1292a6 all in git log
