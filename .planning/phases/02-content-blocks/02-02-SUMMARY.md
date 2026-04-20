---
phase: 02-content-blocks
plan: "02"
subsystem: ui
tags: [tiptap, table, xlsx, sheetjs, sticky-header, sort, filter, custom-extension]

requires:
  - phase: 02-content-blocks
    plan: "01"
    provides: "@tiptap/extension-table (TableKit) + xlsx installed; table-node-extension.ts scaffold"

provides:
  - "CustomTableCell extension with backgroundColor + textAlign attributes (Yjs-persisted)"
  - "setCellBackgroundColor and setCellTextAlign editor commands for right-click context menu (02-05)"
  - "extractTableRows() walks ProseMirror tree to 2D string array"
  - "exportTableAsXlsx() wraps SheetJS for one-click .xlsx download"
  - "useSortFilter hook with client-side sort/filter state and derived displayRows"
  - "FilterBar React component for filter input UI"
  - "table-overrides.css with sticky th row and visible cell borders, imported in app/globals.css"

affects:
  - 02-05-PLAN (wires CustomTableCell into WikiEditor.tsx extensions array; uses setCellBackgroundColor/setCellTextAlign in context menu)

tech-stack:
  added: []
  patterns:
    - "TableCell.extend() pattern: spread this.parent?.() to preserve built-in attrs, add custom attrs with parseHTML+renderHTML"
    - "setCellAttribute is built into @tiptap/extension-table Table extension — CustomTableCell addCommands() delegates to it"
    - "useSortFilter: header row always at index 0, never sorted/filtered; only dataRows (index 1+) are reordered"
    - "CSS @import in plain CSS globals.css uses relative path ../components/... (not SCSS @use)"

key-files:
  created:
    - "components/clash/wiki-editor/table-node/extensions/custom-table-cell.ts"
    - "components/clash/wiki-editor/table-node/table-utils.ts"
    - "components/clash/wiki-editor/table-node/table-sort-filter.tsx"
    - "components/clash/wiki-editor/table-node/styles/table-overrides.css"
  modified:
    - "app/globals.css (added @import for table-overrides.css)"

key-decisions:
  - "TableCell imported from @tiptap/extension-table (not a separate @tiptap/extension-table-cell package — v3 exports TableCell from the main package)"
  - "setCellAttribute exists on the built-in Table extension from TableKit — no need to reimplement; CustomTableCell addCommands() delegates to commands.setCellAttribute()"
  - "useSortFilter is standalone (VIEW-only); 02-05 will determine if the table node view wrapper can consume it or if it serves as fallback"
  - "CSS import path in globals.css: ../components/clash/wiki-editor/table-node/styles/table-overrides.css (relative from app/ up one level)"
  - "globals.css is plain CSS — using @import (not SCSS @use/@forward); confirmed by 02-01 SUMMARY decision note"

metrics:
  duration: 14min
  started: 2026-04-20T16:45:00Z
  completed: 2026-04-20T16:59:13Z
  tasks: 2
  files_modified: 5
---

# Phase 2 Plan 02: Table Node Implementation Summary

**CustomTableCell extension (backgroundColor + textAlign, Yjs-persisted), SheetJS xlsx export utilities, client-side sort/filter hook, and sticky header CSS — all ready for WikiEditor wiring in 02-05**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-20T16:45:00Z
- **Completed:** 2026-04-20T16:59:13Z
- **Tasks:** 2
- **Files modified:** 5 (4 created + 1 modified)

## Accomplishments

- Created `custom-table-cell.ts` extending TableCell with backgroundColor and textAlign (both with parseHTML+renderHTML for Yjs serialization) plus two editor commands
- Created `table-utils.ts` with ProseMirror document walker and SheetJS xlsx export
- Created `table-sort-filter.tsx` with `useSortFilter` hook (sort + filter state, derived displayRows) and `FilterBar` component
- Created `table-overrides.css` with sticky `th` header and visible cell borders
- Imported CSS into `app/globals.css` — build passes with zero errors
- TypeScript passes with zero new errors across all files

## Task Commits

1. **Task 1: CustomTableCell extension** - `28953d0` (feat)
2. **Task 2: Table utilities, sort/filter, CSS** - `c0f336c` (feat)

## Files Created/Modified

- `components/clash/wiki-editor/table-node/extensions/custom-table-cell.ts` — CustomTableCell export + Commands module augmentation + setCellBackgroundColor/setCellTextAlign
- `components/clash/wiki-editor/table-node/table-utils.ts` — extractTableRows, exportTableAsXlsx (SheetJS)
- `components/clash/wiki-editor/table-node/table-sort-filter.tsx` — useSortFilter hook, FilterBar component
- `components/clash/wiki-editor/table-node/styles/table-overrides.css` — sticky header, border enforcement
- `app/globals.css` — @import for table-overrides.css added at top with other imports

## Decisions Made

- **TableCell import path confirmed:** `@tiptap/extension-table` exports `TableCell` directly. There is no separate `@tiptap/extension-table-cell` package in v3. Import: `import { TableCell } from "@tiptap/extension-table"`.
- **setCellAttribute is built-in:** The `setCellAttribute` command is defined on the `Table` extension inside TableKit (`@tiptap/extension-table/dist/table/index.d.ts`). CustomTableCell's `addCommands()` delegates to `commands.setCellAttribute()` — no reimplementation needed.
- **useSortFilter is standalone:** The scaffold table handle from 02-01 (`ui/table-handle.tsx`) renders null. In 02-05, after examining what the table node view exposes, the author should determine whether to consume `useSortFilter` from a custom node view wrapper or treat it as a standalone utility/fallback.
- **globals.css CSS import:** `app/globals.css` is plain CSS (confirmed by 02-01). Used `@import "../components/clash/wiki-editor/table-node/styles/table-overrides.css"` with relative path (not SCSS `@use`). Build resolves correctly.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `components/clash/wiki-editor/table-node/extensions/custom-table-cell.ts` exists
- [x] `components/clash/wiki-editor/table-node/table-utils.ts` exists
- [x] `components/clash/wiki-editor/table-node/table-sort-filter.tsx` exists
- [x] `components/clash/wiki-editor/table-node/styles/table-overrides.css` exists
- [x] `CustomTableCell` export present in custom-table-cell.ts
- [x] `exportTableAsXlsx` export present in table-utils.ts
- [x] `useSortFilter` + `FilterBar` exports present in table-sort-filter.tsx
- [x] `position: sticky` in table-overrides.css
- [x] `table-overrides.css` imported in app/globals.css
- [x] Commit `28953d0` exists
- [x] Commit `c0f336c` exists
- [x] `npm run build` exits 0

## Self-Check: PASSED

## Next Phase Readiness

- `CustomTableCell` is ready to replace the scaffold in `table-node-extension.ts` (02-05 can import from `custom-table-cell.ts` directly or update the re-export in `table-node-extension.ts`)
- `exportTableAsXlsx(editor)` is ready to wire into the right-click context menu
- `useSortFilter` + `FilterBar` are ready for the table node view wrapper (02-05 decides if consumed or not)
- Sticky header CSS is globally applied via `app/globals.css` — no additional import needed in 02-05

---
*Phase: 02-content-blocks*
*Completed: 2026-04-20*
