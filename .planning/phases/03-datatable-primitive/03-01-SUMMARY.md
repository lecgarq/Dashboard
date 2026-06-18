---
phase: 03-datatable-primitive
plan: "01"
subsystem: ui
tags: [tanstack-table, react-table, vitest, tdd, datatable, primitives]

requires:
  - phase: 01-foundation
    provides: PremiumSurface glass variant, motion facade, Phase 1 CSS-var tokens (bg-surface-2, backdrop-blur-md)
  - phase: 02-users-decomposition
    provides: baseline test count (2015), vitest jsdom conventions (ResizeObserver stub, no jest-dom matchers)

provides:
  - "@tanstack/react-table v8 installed as a production dependency"
  - "DataTable behavioral contract locked in 12 FND-05 assertions (RED step — Plan 02 GREEN)"
  - "vi.mock pattern for @tanstack/react-virtual in jsdom established"
  - "@ts-expect-error pattern for test imports of not-yet-implemented components"

affects:
  - 03-02-datatable-implementation
  - 04-users-table-redesign
  - 06-template-mty-table-redesign

tech-stack:
  added:
    - "@tanstack/react-table@^8.21.3 (production dep; headless sort + expand + pinning)"
  patterns:
    - "ColumnDef<T, string>[] explicit value-type annotation avoids TS incompatibility with createColumnHelper"
    - "@ts-expect-error on unresolved import for RED-step test files"
    - "vi.mock('@tanstack/react-virtual') with deterministic 5-row virtual items for jsdom"
    - "data-testid='row-expand-btn' | data-expand | aria-label='Expand row' convention for chevron buttons"
    - "data-testid='density-toggle' | aria-label='Toggle density' convention for density toggle button"
    - "data-testid='clear-filters-btn' | data-clear-filters convention for empty state clear button"

key-files:
  created:
    - components/ui/__tests__/DataTable.test.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "ColumnDef<MockRow, string>[] (explicit value-type param) required instead of ColumnDef<MockRow>[] to satisfy TanStack Table v8 strict generics (createColumnHelper returns AccessorKeyColumnDef<T, string>, not compatible with ColumnDef<T, unknown>)"
  - "@ts-expect-error suppresses the missing-module TSC error on the RED-step import while keeping tsc --noEmit at exit 0"
  - "Test file uses data attributes (data-expand, data-cell, data-density, data-clear-filters) + data-testid as the selector surface — Plan 02 MUST implement these attributes on the corresponding elements"

patterns-established:
  - "Pattern: vi.mock('@tanstack/react-virtual') for deterministic 5-row virtual items — copy in any component test that uses useVirtualizer"
  - "Pattern: ColumnDef<T, string>[] with createColumnHelper<T>() — use explicit value-type param in all DataTable test fixtures"
  - "Pattern: @ts-expect-error on RED-step component imports keeps tsc exit 0 while preserving the real RED failure in the test runner"

requirements-completed: [FND-05]

duration: 9min
completed: "2026-06-18"
status: complete
---

# Phase 03 Plan 01: DataTable TDD Setup Summary

**@tanstack/react-table v8 installed and 12-assertion FND-05 behavioral contract locked in a RED test suite — Plan 02 GREEN step will implement DataTable.tsx to satisfy all assertions.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-18T15:44:08Z
- **Completed:** 2026-06-18T15:53:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Installed `@tanstack/react-table@^8.21.3` as a production dependency; `@tanstack/react-virtual` unchanged at `^3.13.24`
- Authored `components/ui/__tests__/DataTable.test.tsx` with twelve FND-05 assertions covering every locked CONTEXT.md decision (sort, accordion, row-click, density+localStorage, two empty states, glass header tokens, no-WebGL import guard)
- `npx tsc --noEmit` exits 0 — strict generics resolved; `@ts-expect-error` suppresses the expected missing-module error cleanly
- Test suite fails RED on `Failed to resolve import "../DataTable"` — RED→GREEN contract is established for Plan 02

## Task Commits

1. **Task 1: Install @tanstack/react-table v8** — `b4c2850` (chore)
2. **Task 2: Write failing DataTable contract suite (RED)** — `f178b4a` (test)

## Files Created/Modified

- `components/ui/__tests__/DataTable.test.tsx` — 12 FND-05 assertions; vi.mock virtualizer; ResizeObserver stub; @ts-expect-error RED import
- `package.json` — @tanstack/react-table@^8.21.3 added to dependencies
- `package-lock.json` — lockfile updated (2 packages added)

## Decisions Made

- **ColumnDef generic typing:** `ColumnDef<MockRow, string>[]` required (not `ColumnDef<MockRow>[]`) because `createColumnHelper<MockRow>()` returns `AccessorKeyColumnDef<MockRow, string>` — the `string` value-type parameter must be explicit. This is a TanStack Table v8 strict-generics constraint, not a workaround.
- **@ts-expect-error for RED import:** Suppresses the `Cannot find module '../DataTable'` TSC error while keeping `tsc --noEmit` at exit 0. The vitest runtime still fails on the import, preserving the RED test contract.
- **Data attribute selector surface:** Tests use `data-expand`, `data-cell`, `data-density`, `data-clear-filters`, and `data-testid` values as selectors. Plan 02 MUST implement these attributes on the chevron button, row cells, density toggle, and clear-filters button respectively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ColumnDef generic incompatibility causing tsc failure**
- **Found during:** Task 2 (write test file) — `npx tsc --noEmit` revealed 3 identical TS2322 errors
- **Issue:** `ColumnDef<MockRow>[]` is `ColumnDef<MockRow, unknown>[]` which is incompatible with `AccessorKeyColumnDef<MockRow, string>` returned by `createColumnHelper<MockRow>().accessor()`. Pitfall 6 from the RESEARCH.md.
- **Fix:** Changed array type to `ColumnDef<MockRow, string>[]` (explicit value-type param) + `@ts-expect-error` on the missing-module import
- **Files modified:** `components/ui/__tests__/DataTable.test.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; `npm test -- DataTable` still fails RED on missing module
- **Committed in:** f178b4a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - tsc type incompatibility, anticipated in RESEARCH Pitfall 6)
**Impact on plan:** Necessary fix — tsc gate is a hard repo rule. No scope creep.

## Issues Encountered

None beyond the deviation above.

## Known Stubs

None — this plan creates a test file only. No component implementation with stubs was created.

## Threat Flags

None — test file only; no new network endpoints, auth paths, or schema changes.

## Next Phase Readiness

- Plan 02 (`03-02-PLAN.md`) can proceed immediately — the RED contract is locked
- Plan 02 must implement `components/ui/DataTable.tsx` with the following selector surface:
  - Chevron button: `data-expand` attribute OR `aria-label="Expand row"` OR `data-testid="row-expand-btn"`
  - Data cells: `data-cell` attribute OR `data-testid="row-cell"` (non-expand cells only)
  - Density toggle: `data-density` attribute OR `aria-label="Toggle density"` OR `data-testid="density-toggle"`
  - Clear-filters button: `data-clear-filters` attribute OR `data-testid="clear-filters-btn"`
  - Sticky header: must carry `bg-surface-2 backdrop-blur-md` classes (glass token, FND-05-j)
  - Row density classes: row element must include "compact" string or `data-density="compact"` when density is compact (FND-05-g)

---
*Phase: 03-datatable-primitive*
*Completed: 2026-06-18*
