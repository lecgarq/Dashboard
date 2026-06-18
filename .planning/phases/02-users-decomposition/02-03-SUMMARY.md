---
phase: 02-users-decomposition
plan: "03"
subsystem: users-directory
tags: [extraction, virtualizer, scroll, list-view]
status: complete

dependency_graph:
  requires: ["02-02"]
  provides: ["PersonRow", "PersonRowList"]
  affects: ["app/(dashboard)/users/UsersDirectoryClient.tsx"]

tech_stack:
  added: []
  patterns:
    - "useWindowVirtualizer window-scroll with setMounted/scrollMargin init hack"
    - "IntersectionObserver-backed useVisibleRowEmails for lazy batch query"
    - "Hover-prefetch enabled-gate pattern (FileActivityCell)"

key_files:
  created:
    - app/(dashboard)/users/PersonRow.tsx
    - app/(dashboard)/users/PersonRowList.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx

decisions:
  - "PersonRow import into shell is transitive via PersonRowList; no direct shell import needed after Task 2"
  - "Removed Skeleton + Tooltip sub-components from shell imports after cells moved"
  - "Removed useWindowVirtualizer + useVisibleRowEmails from shell imports after list moved"
  - "setMounted hack preserved verbatim — removing it would break scroll-position correctness (RESEARCH Pitfall 3)"

metrics:
  duration_seconds: 372
  completed_date: "2026-06-18"
  tasks_completed: 3
  files_modified: 3
---

# Phase 02 Plan 03: PersonRow + PersonRowList Extraction Summary

Extracted the list-view row component and the window-virtualized list (the
riskiest behavioral seam in the decomposition) into PersonRow.tsx and
PersonRowList.tsx. The virtualizer scrollMargin-init hack and viewport-driven
batch activity query moved verbatim; scroll position and lazy loading are
observably identical to pre-extraction.

## What Was Built

PersonRow.tsx + PersonRowList.tsx extracted from UsersDirectoryClient.tsx;
shell imports PersonRowList; golden-path test 7/7 including scroll-preservation.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extract PersonRow + FileActivityCell + LastFileActivityCell | 259f258 | PersonRow.tsx (new, 262 lines), UsersDirectoryClient.tsx |
| 2 | Extract PersonRowList with virtualizer hack verbatim | 52d1be1 | PersonRowList.tsx (new, 117 lines), UsersDirectoryClient.tsx |
| 3 | Confirm parity gates and scope guard | — | (verification only, no code changes) |

## Shell Line Count

UsersDirectoryClient.tsx after extraction: **1619 lines** (was ~1944; shell shed 325 lines net).

## Scroll-Preservation Invariant

The `const [, setMounted] = useState(false); useEffect(() => setMounted(true), [])` hack in PersonRowList.tsx is preserved verbatim at lines 49-50. It forces a single re-render after parentRef mounts so `scrollMargin: parentRef.current?.offsetTop ?? 0` in `useWindowVirtualizer` picks up the real DOM offset (not 0). Without it, the virtualizer would miscalculate scroll position on first render. The golden-path Case 6 (`window.scrollY = 800` survives modal open/close) confirms this invariant holds.

PersonRowList is not remounted on filter/selection changes — it occupies a stable position in the render tree (the list-view branch of `renderPeople`), so React reuses the instance across filter updates.

## Deviations from Plan

None — plan executed exactly as written.

## Scope Guard

```
git diff --name-only HEAD~3 HEAD | grep -E "users/access-analysis|users/spatial-graph"
→ (empty) — scope clean
```

## Test Gates

- `npx tsc --noEmit`: exit 0
- Golden-path test: 7/7 passed (incl. scroll-preservation Case 6)
- Full suite: 2 failed / 2012 passed / 1 skipped — baseline 02-01 holds exactly (2 pre-existing FolderPermissionTerrain failures from concurrent WIP, NOT a regression)

## Known Stubs

None — all extraction is behavioral parity (no stubs, no placeholder data).

## Threat Flags

None — this plan performs a pure code extraction with no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- `app/(dashboard)/users/PersonRow.tsx`: FOUND
- `app/(dashboard)/users/PersonRowList.tsx`: FOUND
- Commit 259f258: FOUND
- Commit 52d1be1: FOUND
- Golden-path test: 7/7 PASSED
- TSC: exit 0
- Scope guard: clean
