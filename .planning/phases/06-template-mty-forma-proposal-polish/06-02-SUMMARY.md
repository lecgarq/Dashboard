---
phase: 06-template-mty-forma-proposal-polish
plan: "02"
subsystem: forma-proposal
tags: [refactor, hierarchy-view, d3-hierarchy, hook-extraction, code-splitting]
dependency_graph:
  requires: []
  provides: [FRM-01-split]
  affects: [app/(dashboard)/forma-proposal/components/HierarchyView.tsx]
tech_stack:
  added: []
  patterns: [layout-hook-extraction, canvas-render-separation, thin-shell-pattern]
key_files:
  created:
    - app/(dashboard)/forma-proposal/components/useHierarchyLayout.ts
    - app/(dashboard)/forma-proposal/components/HierarchyCanvas.tsx
    - app/(dashboard)/forma-proposal/components/__tests__/HierarchyView.test.tsx
  modified:
    - app/(dashboard)/forma-proposal/components/HierarchyView.tsx
decisions:
  - "fit callback stays in HierarchyCanvas (requires containerRef DOM ref) — hook returns bbox only; canvas computes fit locally"
  - "useHierarchyLayout accepts explicit map param (void-suppressed) so the hook signature matches the full context available at the call site and is ready for plan 06-04"
  - "HierarchyView return type changed from JSX.Element to implicit (React 17+ inference) — removes need for React import in the thin shell"
metrics:
  duration: "~9 minutes"
  completed: "2026-06-19"
  tasks_completed: 2
  files_changed: 4
status: complete
---

# Phase 06 Plan 02: HierarchyView Split (FRM-01) Summary

**One-liner:** d3-hierarchy bundle isolated in `useHierarchyLayout.ts` hook; SVG/DOM render extracted to `HierarchyCanvas.tsx`; `HierarchyView.tsx` rewritten as a 21-line thin shell with unchanged 8-prop public API.

---

## What Was Built

### Task 1 — HierarchyView shell test (contract lock)

Created `app/(dashboard)/forma-proposal/components/__tests__/HierarchyView.test.tsx` with:
- `@vitest-environment jsdom`
- `buildFolderIndex` used to build a valid single-root `FolderIndex` fixture
- Stubs for `ResizeObserver`, `scrollIntoView`, `setPointerCapture`
- Two `it()` blocks: (1) mounts without throwing + asserts `activeRoleLabel` + `rootLabel` appear; (2) asserts `"Viewing"` prefix in role picker button

The test was first run against the un-split `HierarchyView` to prove the fixture is valid; it passed, locking the public contract before the split.

**Note:** This file was incidentally committed in the prior 06-01 executor run (commit `4e3efd2f`). The content is correct and canonical.

### Task 2 — Three-file split

**`useHierarchyLayout.ts`** ("use client"):
- Contains the sole `import { stratify, tree } from "d3-hierarchy"` — the heavy bundle isolation boundary
- Owns: `collapsed` state + `toggle` callback; `useMemo` that walks visible folders → `stratify` → `tree` → `{ nodes, links, bbox }`
- Exports: `VNode`, `VLink`, `ROOT`, `NODE_W`, `NODE_H`, `MIN_SCALE`, `MAX_SCALE`, `clamp`, `curve`, `sortFolders`, `initialCollapsed` (all consumed by `HierarchyCanvas`)
- Hook return: `{ nodes, links, bbox, collapsed, toggle }`

**`HierarchyCanvas.tsx`** ("use client", 232 lines):
- Receives layout output (`nodes, links, bbox, collapsed, onToggle`) + all 8 public props
- Contains: `containerRef`, `view` state + `setView`, wheel zoom/pan effect, `pan` ref + pointer effects, `zoomBy`, `fit` (computed locally from `bbox` + `containerRef`), `rolesByGroup`/`groupOrder` memos, `TierMenuItems` component
- Full JSX: background-grid div, SVG links, node divs with dropdown tier menus, role picker, hint, zoom controls — byte-for-byte faithful to the original

**`HierarchyView.tsx`** ("use client", 21 lines, thin shell):
- Same 8-prop public signature — `FormaProposalClient.tsx` compiles unchanged without any modification
- Body: `const layout = useHierarchyLayout(props.index, props.explicit); return <HierarchyCanvas {...layout spread} {...props} />;`
- All 8 public props are forwarded: `index, explicit, rootLabel, roles, activeRoleId, activeRoleLabel, onPickRole, onSetTier, onApplySubtree, onClear`

---

## Verification

- `npx tsc --noEmit` exits 0 (whole tree including caller and test files)
- `grep -rn "from \"d3-hierarchy\"" app/(dashboard)/forma-proposal/components` → only `useHierarchyLayout.ts`
- `git diff --name-only` does NOT include `FormaProposalClient.tsx`
- HierarchyView shell test: 2/2 pass
- Full test suite: 2170 pass / 2 pre-existing fail (FolderPermissionTerrain concurrent WIP, documented in STATE.md — not caused by this plan)

---

## Deviations from Plan

### Auto-fixed Issues

None.

### Discovery

**Test file pre-committed in 06-01 run:** `HierarchyView.test.tsx` was accidentally staged and committed as part of the 06-01 executor run (commit `4e3efd2f`). The content was already correct for Task 1 of this plan. Task 1 was confirmed complete by verifying the tests pass against the split shell.

**`fit` seam design (plan note honored):** The plan's RESEARCH.md specified the seam: hook returns `bbox` only; canvas computes `fit` locally using its own `containerRef`. Implemented exactly as specified.

---

## Known Stubs

None — this plan is a pure refactor. No data sources, no placeholder values, no TODO items in the produced code.

---

## Threat Flags

None — pure client-side refactor. No new API routes, authentication paths, data sources, or trust boundaries.

---

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `useHierarchyLayout.ts` exists | FOUND |
| `HierarchyCanvas.tsx` exists | FOUND |
| `HierarchyView.test.tsx` exists | FOUND |
| Commit `c348b4b0` (split) exists | FOUND |
| Commit `4e3efd2f` (test file) exists | FOUND |
| `npx tsc --noEmit` exits 0 | PASSED |
| HierarchyView tests pass | 2/2 PASS |
| `FormaProposalClient.tsx` untouched | CONFIRMED |
| `d3-hierarchy` only in `useHierarchyLayout.ts` | CONFIRMED |
