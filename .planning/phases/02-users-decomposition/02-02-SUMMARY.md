---
phase: 02-users-decomposition
plan: "02"
subsystem: users-directory
tags: [refactor, decomposition, extraction, tsx]
dependency_graph:
  requires: [02-01]
  provides: [directoryUtils, PersonDetailModal, DirectoryPills, DataCoverageStrip, CollapsibleGroup]
  affects: [UsersDirectoryClient, PersonCard, PersonRow, PersonRowList]
tech_stack:
  added: []
  patterns: [module-extraction, re-export-pattern, named-exports-only]
key_files:
  created:
    - app/(dashboard)/users/directoryUtils.ts
    - app/(dashboard)/users/PersonDetailModal.tsx
    - app/(dashboard)/users/DirectoryPills.tsx
    - app/(dashboard)/users/DataCoverageStrip.tsx
    - app/(dashboard)/users/CollapsibleGroup.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
decisions:
  - "OrgPerson/LocalDirectoryUser re-exported from useMergedAccUsers via directoryUtils to avoid a second source of truth"
  - "PersonDetailModal stays a centered shadcn Dialog — Sheet migration deferred to Phase 4 (per RESEARCH Open Q1)"
  - "PersonAvatar exported from PersonDetailModal because PersonCard and PersonRow still in the shell need it"
  - "STATUS_PILL_LABEL exported from DirectoryPills because shell Status filter dropdown references labels at lines 1862/1865"
metrics:
  duration: "~11 minutes"
  completed: "2026-06-18"
  tasks_completed: 3
  files_created: 5
  files_modified: 1
status: complete
---

# Phase 02 Plan 02: Low-Risk Component Extraction Summary

Pure move of helpers and stateless display sub-components out of the
UsersDirectoryClient monolith into 5 dedicated files; zero logic changes,
behavior byte-identical.

## What Was Built

Extracted 5 units from UsersDirectoryClient.tsx (was 2475 lines, now 1943 lines):

| File | Exports | Lines |
|------|---------|-------|
| `directoryUtils.ts` | OrgPerson, LocalDirectoryUser, GroupByField, ViewMode, normalize, uniqueSorted, parseSearchTokens, matchesPerson | 116 |
| `PersonDetailModal.tsx` | PersonDetailModal, PersonAvatar | 245 |
| `DirectoryPills.tsx` | STATUS_PILL_LABEL, StatusPill, AdminPill, AccBadge | 139 |
| `DataCoverageStrip.tsx` | DataCoverageStrip | 60 |
| `CollapsibleGroup.tsx` | CollapsibleGroup | 46 |

UsersDirectoryClient.tsx reduced from ~2475 to **1943 lines** (-532 lines, -21.5%).

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract pure helpers + types into directoryUtils.ts | ac19f9c | directoryUtils.ts, UsersDirectoryClient.tsx |
| 2 | Extract profile Dialog into PersonDetailModal.tsx | c2263ae | PersonDetailModal.tsx, UsersDirectoryClient.tsx |
| 3 | Extract pills, coverage strip, collapsible group | cb5d756 | DirectoryPills.tsx, DataCoverageStrip.tsx, CollapsibleGroup.tsx, UsersDirectoryClient.tsx |

## Verification

- `npx tsc --noEmit` exits 0 after every task
- Golden-path integration test: 7/7 pass after every task
- Full suite: **2012 pass / 1 skip / 2 pre-existing FolderPermissionTerrain failures** — identical to 02-01 baseline
- Staged scope clean: no files under users/access-analysis or users/spatial-graph touched

## Deviations from Plan

### Auto-Decisions (within task scope)

**1. [Rule 2 - Re-export pattern] OrgPerson/LocalDirectoryUser via re-export**
- **Found during:** Task 1
- **Issue:** Both types were already defined in `useMergedAccUsers.ts` (exported). Creating duplicate definitions in `directoryUtils.ts` would produce two sources of truth.
- **Fix:** `directoryUtils.ts` uses `export type { OrgPerson, LocalDirectoryUser } from "./useMergedAccUsers"` + `import type { OrgPerson }` for internal function signatures.
- **Files modified:** directoryUtils.ts
- **Commit:** ac19f9c

**2. [Rule 1 - Cleanup] Removed unused imports during each extraction**
- **Found during:** Tasks 2 and 3
- **Issue:** After moving components, their icon/component imports remained in UsersDirectoryClient.tsx producing unused-import warnings (Mail, Copy, Check, ExternalLink in Task 2; ChevronDown, ChevronRight, CircleDashed, Database in Task 3).
- **Fix:** Removed each unused import from the shell in the same commit that moved the components.
- **Commit:** c2263ae (Task 2), cb5d756 (Task 3)

**3. [Decision] PersonAvatar exported from PersonDetailModal**
- **Found during:** Task 2
- **Issue:** PersonCard and PersonRow (remaining in the shell) both use PersonAvatar. The plan said "export it if referenced elsewhere in the shell render." Confirmed at lines ~420, ~731.
- **Fix:** `export function PersonAvatar(...)` in PersonDetailModal.tsx; `import { PersonDetailModal, PersonAvatar } from "./PersonDetailModal"` in the shell.
- **Commit:** c2263ae

## Scope Guard

Scope guard (`git diff --cached --name-only`) confirms no files under `users/access-analysis` or `users/spatial-graph` were staged or committed. The working-tree check shows pre-existing uncommitted WIP in those directories (from concurrent sessions), which is expected and not a regression.

## Known Stubs

None — this plan moves existing code verbatim; no new data flows or UI stubs introduced.

## Threat Flags

None — pure refactor within module boundaries; no new network endpoints, auth paths, or file access patterns.

## Self-Check: PASSED

Files exist:
- app/(dashboard)/users/directoryUtils.ts — FOUND
- app/(dashboard)/users/PersonDetailModal.tsx — FOUND
- app/(dashboard)/users/DirectoryPills.tsx — FOUND
- app/(dashboard)/users/DataCoverageStrip.tsx — FOUND
- app/(dashboard)/users/CollapsibleGroup.tsx — FOUND

Commits verified:
- ac19f9c (Task 1)
- c2263ae (Task 2)
- cb5d756 (Task 3)
