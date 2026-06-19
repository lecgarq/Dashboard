---
phase: 06-template-mty-forma-proposal-polish
plan: "03"
subsystem: template-mty/members-table
tags: [datatable, migration, toolbar, columns, test]
status: complete

dependency_graph:
  requires: [06-01]
  provides: [TPL-01, TPL-03-table]
  affects:
    - app/(dashboard)/template-mty/components/TemplateMembersTableShell.tsx
    - app/(dashboard)/template-mty/components/templateMemberColumns.tsx
    - app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
    - app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
    - app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx

tech_stack:
  added: []
  patterns:
    - DataTable migration with external toolbar wrapper (pre-filter then pass to DataTable)
    - ColumnDef<T> (no value-type param) for DataTable assignment compatibility
    - Re-export alias pattern for retiring old implementation without breaking callers
    - @tanstack/react-virtual mock for jsdom DataTable testing

key_files:
  created:
    - app/(dashboard)/template-mty/components/templateMemberColumns.tsx
    - app/(dashboard)/template-mty/components/TemplateMembersTableShell.tsx
  modified:
    - app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
    - app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
    - app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx

decisions:
  - "ColumnDef<TemplateMember>[] (no value-type param) used — avoids assignability error with DataTableProps<T>['columns'] which uses unknown as TValue"
  - "Re-export alias retained rather than deleting TemplateMembersTable.tsx — keeps test import path unchanged and prevents stray-importer breakage"
  - "virtualizer mock (useVirtualizer returns count-based items) enables DataTable row rendering in jsdom without real scroll geometry"

metrics:
  duration: "4 minutes"
  completed_date: "2026-06-19"
  tasks_completed: 2
  files_modified: 5
---

# Phase 06 Plan 03: /template-mty Members Table → DataTable Migration Summary

**One-liner:** Members table migrated from custom ARIA-div grid to premium DataTable with 5 typed columns, external toolbar pre-filtering, email-guarded row-click, and updated test suite (6 tests green, tsc 0).

## What Was Built

### Task 1 — templateMemberColumns + TemplateMembersTableShell (commit 3e729be7)

Created `templateMemberColumns.tsx`: exports `MEMBER_COLUMNS: ColumnDef<TemplateMember>[]` with 5 columns using `createColumnHelper`:
- `name` (240px, sortable): two-line Member cell (name bold + email muted; `opacity-60` applied when no email)
- `role` (160px, sortable): role text or muted "No role" fallback
- `company` (160px, sortable): company text or muted em-dash
- `accessLevel` (110px, sortable): admin → primary-tinted pill; else muted pill
- `origin` (120px, sortable): Internal (emerald) / External (amber) pill; sort value from `accessorFn` returning `"Internal"` or `"External"`

Created `TemplateMembersTableShell.tsx`: holds `query` + `filter` state, computes `rows = filterMembers(members, query, filter)` via useMemo, renders a toolbar (`<div>`, not PremiumSurface) with search input (`aria-label="Search members"`), 4 filter chips with `aria-pressed`, and count badge, then passes pre-filtered rows to `<DataTable>` with `pinnedColumn="name"`, `defaultSort`, `hasActiveFilter`, `onClearFilters`, and `onRowClick` guarded on `row.original.email`. DataTable is NOT wrapped in PremiumSurface (it self-wraps).

### Task 2 — Wire + retire + update test (commit 4f8014f1)

- `TemplateAnalysisCharts.tsx`: replaced `TemplateMembersTable` import/usage with `TemplateMembersTableShell`; `onSelectMember` handler and `AuthorProfileDrawer` dynamic import left unchanged (INT-01).
- `TemplateMembersTable.tsx`: converted to thin re-export alias (`export { TemplateMembersTableShell as TemplateMembersTable }`); old ARIA-div implementation removed.
- `TemplateMembersTable.test.tsx`: rewrote for new DataTable DOM structure — mocks `@tanstack/react-virtual`, stubs `ResizeObserver` / `scrollIntoView` / `matchMedia`; uses `td[data-cell][data-col]` selectors (not `role="row"` / `role="columnheader"` ARIA divs); asserts sort by checking rendered cell order; added non-clickable-no-email test. All 6 tests pass.

## Verification

- `npx tsc --noEmit`: exits 0 (whole tree including test files)
- `TemplateMembersTable.test.tsx`: 6/6 tests pass
- Old ARIA-div implementation: gone from tree (file is now a 1-line re-export alias)
- No forma-proposal files captured in any commit (confirmed via `git diff --cached --name-only` check before each commit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ColumnDef<TemplateMember, string>[] not assignable to DataTableProps columns**
- **Found during:** Task 1 TypeScript check
- **Issue:** `DataTableProps<T>` declares `columns: ColumnDef<T>[]` (TValue = unknown). Passing `ColumnDef<TemplateMember, string>[]` causes a TS2322 assignability error because TanStack Table's ColumnDef is invariant in TValue.
- **Fix:** Changed column array type to `ColumnDef<TemplateMember>[]` with casts per column via `as ColumnDef<TemplateMember>` — mirrors the pattern in the existing DataTable test.
- **Files modified:** `templateMemberColumns.tsx`
- **Commit:** 3e729be7 (fixed before commit, in same task)

## Known Stubs

None. The shell is fully wired to real data (`overview.members` RSC prop), real `filterMembers` helper, and real `DataTable` — no placeholders or hardcoded empty values.

## Threat Flags

None. This plan introduces no new API routes, auth paths, network endpoints, or schema changes. All data flows through existing RSC props and the existing `AuthorProfileDrawer` dynamic import.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `templateMemberColumns.tsx` exists | FOUND |
| `TemplateMembersTableShell.tsx` exists | FOUND |
| `TemplateMembersTable.test.tsx` exists | FOUND |
| `06-03-SUMMARY.md` exists | FOUND |
| commit 3e729be7 exists | FOUND |
| commit 4f8014f1 exists | FOUND |
