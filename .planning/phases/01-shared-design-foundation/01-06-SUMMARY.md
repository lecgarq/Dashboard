---
phase: 01-shared-design-foundation
plan: "06"
subsystem: shared-ui
status: complete
tags: [drill-panel, sheet, premium-surface, glass, INT-01]
dependency_graph:
  requires: [01-01, 01-03]
  provides: [INT-01]
  affects: [all-page-phases]
tech_stack:
  added: []
  patterns: [shadcn-sheet-wrap, radix-dialog, premium-glass-surface, tdd-red-green]
key_files:
  created:
    - components/ui/DrillSheet.tsx
    - components/ui/__tests__/DrillSheet.test.tsx
  modified: []
decisions:
  - "width override via w-[480px] sm:w-[480px] on SheetContent to beat shadcn sm:max-w-sm default (RESEARCH Pitfall 7)"
  - "PremiumSurface variant=glass wraps full panel body — bg-transparent on SheetContent lets glass surface control appearance"
  - "open animation trimmed from default 500ms to 350ms via data-[state=open]:duration-[350ms] for smooth-flowing motion budget"
metrics:
  duration: "1m 46s"
  completed: "2026-06-17"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 1 Plan 6: DrillSheet Empty Shell Summary

**One-liner:** Right-slide 480px externally-controlled drill panel shell wrapping shadcn Sheet with PremiumSurface glass body (INT-01).

## What Was Built

`components/ui/DrillSheet.tsx` — the single shared drill-target panel for all four pages (/users, /access-analysis, /template-mty, /forma-proposal). An empty shell that accepts arbitrary `children` and wires no content sources — per-page phases will supply `<UserProfilePanel>` or list content as children.

### Key Implementation Details

- **Shell contract:** `{ open: boolean; onClose: () => void; title?: string; description?: string; children: React.ReactNode }` — fully externally-controlled lifecycle.
- **Width override:** `w-[480px] sm:w-[480px]` on `SheetContent` overrides the shadcn default `sm:max-w-sm`, ensuring the panel is consistently ~480px wide at all breakpoints.
- **Slide direction:** `side="right"` wired on `SheetContent`; inherits shadcn's `slide-in-from-right` / `slide-out-to-right` Radix animations.
- **Premium surface:** `PremiumSurface variant="glass"` wraps the body area — frosted `backdrop-blur-md`, `bg-surface-2`, `border-surface-border`; `bg-transparent` on `SheetContent` prevents the default `bg-background` from covering the glass layer.
- **Conditional header:** `SheetHeader` with `SheetTitle` + `SheetDescription` only mounted when `title` is provided; omitting `title` renders no header at all.
- **Motion:** `data-[state=open]:duration-[350ms]` trims the open animation from the 500ms default to ~350ms (smooth-flowing budget).
- **Scope guardrail:** No imports from page-specific modules; no content sources wired. Children is the only seam.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| RED | DrillSheet tests (failing) | 2668df1 | components/ui/__tests__/DrillSheet.test.tsx |
| GREEN | DrillSheet implementation | 77494b4 | components/ui/DrillSheet.tsx |

## Verification

- `npx vitest run components/ui/__tests__/DrillSheet.test.tsx` — **10/10 tests pass**
- `npx tsc --noEmit` — **exits 0**

### Test assertions covered

1. `open=false` → children not in DOM
2. `open=true` → children rendered
3. Content node carries `w-[480px]` width class
4. Content node carries right-side slide class (`slide-in-from-right`)
5. `title` prop → `SheetTitle` rendered in `SheetHeader`
6. No `title` → no `SheetTitle` element
7. `description` prop → `SheetDescription` rendered
8. Built-in close button click → `onClose` spy called once
9. Glass variant → `backdrop-blur-md` class present in content area
10. Empty shell — only caller children, no page-specific content

## TDD Gate Compliance

- RED gate: commit `2668df1` — `test(01-06): add failing DrillSheet tests (RED)`
- GREEN gate: commit `77494b4` — `feat(01-06): DrillSheet empty shell…`
- REFACTOR: no refactor needed (implementation clean on first pass)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The shell renders first-party children only; Radix Dialog handles focus-trap, Escape-to-close, and ARIA (T-01-06b mitigated by reuse of audited primitive).

## Self-Check: PASSED

- [x] `components/ui/DrillSheet.tsx` exists and exports `DrillSheet`
- [x] `components/ui/__tests__/DrillSheet.test.tsx` exists with 10 assertions
- [x] Commit `2668df1` (RED test) exists in git log
- [x] Commit `77494b4` (GREEN implementation) exists in git log
- [x] `npx tsc --noEmit` exits 0
- [x] No pre-existing WIP files swept into commits (explicit-path staging verified)
