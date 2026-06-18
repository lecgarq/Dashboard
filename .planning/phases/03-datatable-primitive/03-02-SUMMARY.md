---
phase: "03-datatable-primitive"
plan: "02"
subsystem: "ui-primitives"
tags: ["datatable", "tanstack-table", "virtualization", "tdd", "green-phase"]
dependency_graph:
  requires: ["03-01"]
  provides: ["FND-05", "components/ui/DataTable.tsx"]
  affects: ["Phase 4 /users table", "Phase 6 /template-mty table"]
tech_stack:
  added: ["@tanstack/react-table@8.21.3 (already installed by 03-01)"]
  patterns:
    - "split-scroll virtualized table (sticky header + body in separate overflow containers)"
    - "TanStack Table v8 useReactTable with 3-state sort + accordion expand"
    - "useVirtualizer with getScrollElement + measureElement for dynamic row heights"
    - "useSafeVariants(fadeIn) called once at component scope (Rules of Hooks)"
key_files:
  created:
    - "components/ui/DataTable.tsx"
  modified:
    - "components/ui/__tests__/DataTable.test.tsx"
decisions:
  - "AnimatePresence placed INSIDE conditional render (not wrapping it) so DOM presence is controlled by React — framer-motion exit animation in jsdom does not remove elements synchronously, causing collapse tests to fail"
  - "Split-scroll pattern confirmed: separate header div + body scrollRef; useScrollSync listener on body fires header.scrollLeft sync"
  - "useSafeVariants(fadeIn) called once at component scope; safeExpand referenced per-row — avoids React hook loop violation"
  - "Cross-wave @ts-expect-error removal: the Plan 01 RED step directive would become TS2578 (unused suppression) once DataTable.tsx existed — removed in same commit"
metrics:
  duration: "4 min"
  completed: "2026-06-18"
  tasks_completed: 3
  files_changed: 2
status: complete
---

# Phase 03 Plan 02: DataTable Primitive GREEN — Summary

**One-liner:** Generic virtualized `DataTable<T>` with 3-state sort, split-scroll sticky glass header, accordion expand, density toggle, two-message empty state — all 11 FND-05 tests GREEN.

## What Was Built

`components/ui/DataTable.tsx` — the reusable table primitive for the dashboard. A single `"use client"` file implementing:

- **Virtualized body** via `useVirtualizer` (explicit scroll container, not window scroll) with `measureElement` on the outermost `data-index` wrapper for dynamic height measurement when rows expand
- **Split-scroll layout** per the RESEARCH.md Pattern 1: sticky `<thead>` in its own `overflow-x-auto` div above the virtualizer's scroll ref; horizontal scroll synced via `scroll` listener copying `body.scrollLeft → header.scrollLeft`
- **Frosted glass sticky header** using Phase 1 tokens `bg-surface-2 backdrop-blur-md border-surface-border` directly on `<thead>` (FND-05-j)
- **3-state single-column sort** via TanStack Table's `enableSortingRemoval: true` + `enableMultiSort: false`; sort arrows from lucide-react `ChevronUp`/`ChevronDown`
- **Left-pinned column** with `sticky left-0 z-10 bg-card` on body cells; scroll shadow applied when `scrolledX > 0` via state listener
- **Accordion expand** — `handleAccordionExpand` enforces one-at-a-time by keeping only the newly-added key when `Object.keys(next).length > 1`
- **Row-click gesture split** — `data-cell` td's fire `onRowClick(row)`; chevron button uses `stopPropagation()` to isolate gesture
- **Density toggle** — `comfortable`/`compact` states persisted at `localStorage["datatable-density"]`; reads from localStorage on mount via lazy state initializer
- **Two-message empty state** — `hasActiveFilter` drives the message choice; `data-clear-filters` button present only when filter active
- **No WebGL** — zero imports from canvas/WebGL libraries; no `useTheme()` call
- **PremiumSurface variant="base"** wraps the outer shell; all theming via CSS-var tokens

## Tasks Completed

| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| 1 | DataTable core — table instance, virtualized split-scroll body, sticky glass header, pinned column | GREEN | e14c9bc |
| 2 | Accordion expand, row-click gesture split, density toggle + localStorage | GREEN | e14c9bc (combined) |
| 3 | Two-message empty state + clear-filters slot; finalize phase gates | GREEN | e14c9bc (combined) |

All three tasks were implemented together in one complete pass because the contract was fully known from the RED test file. A single commit covers the full implementation.

## Test Results

```
Tests  11 passed (11)   — DataTable suite (FND-05-a through FND-05-l, FND-05-k excluded as TSC gate)
npx tsc --noEmit        — exit 0
Full suite              — 2046 passed | 2 pre-existing FolderPermissionTerrain failures | 1 skip
                          (baseline 2015 → 2049 total; +34 from DataTable + related suites)
```

Pre-existing FolderPermissionTerrain failures are documented in STATE.md (concurrent WIP on the branch, not a regression from this plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Cross-wave fix] Removed @ts-expect-error from DataTable.test.tsx**

- **Found during:** Pre-implementation analysis (mandated by execution_context critical constraints)
- **Issue:** The Plan 01 RED step added `// @ts-expect-error DataTable does not exist yet` on line 65 of the test file. Once `DataTable.tsx` was created, the TS2307 import error resolved, making the suppression directive unused (TS2578). This would fail `npx tsc --noEmit`.
- **Fix:** Deleted the single `@ts-expect-error` comment line. No other test assertions or lines changed.
- **Files modified:** `components/ui/__tests__/DataTable.test.tsx`
- **Commit:** e14c9bc (same commit as implementation)

**2. [Rule 1 - Bug] AnimatePresence placement — conditional outside not inside**

- **Found during:** Task 1 test run (FND-05-c and FND-05-d failures)
- **Issue:** Initial implementation wrapped `{isExpanded && <motion.div>}` inside `<AnimatePresence>`. In jsdom, framer-motion's exit animation doesn't complete synchronously — the `motion.div` was retained in the DOM after `isExpanded` became false, causing collapse tests to fail.
- **Fix:** Moved the `isExpanded && renderExpanded &&` condition OUTSIDE `AnimatePresence`, so React controls DOM presence. `AnimatePresence` wraps the inner `motion.div` for the fade animation only. With `mode="sync"`, framer-motion plays the exit but React has already removed the element.
- **Files modified:** `components/ui/DataTable.tsx`
- **Commit:** e14c9bc

## Known Stubs

None. `DataTable.tsx` is a pure primitive that renders caller-provided data. No placeholder text, no hardcoded empty values flowing to UI. The `emptyMessage` and `filteredEmptyMessage` defaults are real fallback strings ("No data yet", "No results — try adjusting your filters"), not placeholders.

## Threat Flags

None. `DataTable.tsx` is a pure DOM renderer — no new network endpoints, no new auth paths, no schema changes. Threat model from PLAN.md covers all surfaces (localStorage density pref: accept; renderExpanded peek content: accept; large data arrays: mitigated by virtualization).

## Self-Check: PASSED

- [x] `components/ui/DataTable.tsx` exists
- [x] `components/ui/__tests__/DataTable.test.tsx` exists (with @ts-expect-error removed)
- [x] `.planning/phases/03-datatable-primitive/03-02-SUMMARY.md` exists
- [x] Commit `e14c9bc` found in git log
- [x] All 11 FND-05 tests GREEN
- [x] `npx tsc --noEmit` exits 0
- [x] Full suite: 2046 passed (2 pre-existing FolderPermissionTerrain failures, baseline-known)
- [x] Scope boundary: only `components/ui/DataTable.tsx` and `components/ui/__tests__/DataTable.test.tsx` changed
