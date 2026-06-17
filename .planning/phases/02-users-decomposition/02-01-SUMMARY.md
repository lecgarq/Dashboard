---
phase: 02-users-decomposition
plan: 01
subsystem: users-directory
tags: [zustand, testing, golden-path, regression-safety-net, PERF-03, USR-01]
dependency_graph:
  requires: []
  provides: [zustand-5.x-installed, golden-path-test-green, baseline-test-count]
  affects: [02-02, 02-03, 02-04, 02-05, 02-06]
tech_stack:
  added: [zustand@5.0.14]
  patterns: [vi.hoisted spy, jsdom stub pattern for Radix Select + window.scrollTo]
key_files:
  created:
    - app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx
  modified:
    - package.json
    - package-lock.json
decisions:
  - "zustand installed as a dependency (not devDep) since the store is shipped app code"
  - "vi.hoisted() used for bulkUsersQuerySpy to allow PERF-03 to inspect call args despite vi.mock hoisting"
  - "HTMLElement.prototype.scrollIntoView stubbed globally to prevent Radix Select from throwing in jsdom"
  - "window.scrollTo stubbed globally to suppress jsdom 'Not implemented' warning from scrollDirectoryToTop"
  - "Pre-existing FolderPermissionTerrain failures (2) excluded from baseline — concurrent session WIP, not caused by this plan"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-17"
  tasks: 3
  files: 3
status: complete
---

# Phase 02 Plan 01: Zustand Install + Golden-Path Test Summary

zustand 5.0.14 installed and golden-path integration test (7 cases) proven GREEN against the un-refactored 2,474-line monolith.

## What Was Built

**Task 1 — zustand installed** (`8f731fb`):
- `npm install zustand` added `^5.0.14` to `dependencies`
- Confirmed via `npm view zustand version` (5.0.14) and `require('zustand/package.json').version`

**Task 2 — Golden-path integration test** (`e83fc6f`):
- File: `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
- 453 lines, 7 test cases, all GREEN against unmodified `UsersDirectoryClient.tsx`
- Test cases:
  1. Search narrows list (150ms debounce respected via `vi.advanceTimersByTime(200)`)
  2. Multiple field-token filters combine (`dept:Engineering job:BIM` matches only Alice)
  3. viewMode toggle (grid ↔ list) preserves active search filter
  4. groupBy switch preserves active search filter
  5. Clicking a person card opens the profile modal with the person's name in an `<h2>`
  6. Closing the modal preserves search text, active filter, AND `window.scrollY=800`
  7. PERF-03: `bulkUsers.useQuery` called with `{ leanProjects: true }`, zero conflicting calls

**Task 3 — Full suite + TSC gates** (`no separate commit — gates verified in Task 2 commit`):
- `npx tsc --noEmit`: exits 0
- Full suite: 2015 tests total (2012 passed, 1 skipped, 2 pre-existing failures in `FolderPermissionTerrain.test.tsx`)
- Scope guard: `git diff --name-only HEAD~2..HEAD | grep -E "users/access-analysis|users/spatial-graph"` → empty

## Baseline Test Count

**Baseline: 2015 tests total** (2012 passed + 2 pre-existing FolderPermissionTerrain failures + 1 skipped).
Every subsequent extraction plan in Phase 02 must hold or exceed this count.

The 2 pre-existing failures are in `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` — polygon count assertion mismatch (expects 12, gets 13). This is uncommitted WIP from a concurrent session and not a regression from this plan.

## Zustand Version

`zustand@5.0.14` — confirmed via registry (`npm view zustand version`) before install.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Stubbed `HTMLElement.prototype.scrollIntoView` and `window.scrollTo`**
- **Found during:** Task 2 test debugging
- **Issue:** Radix Select calls `scrollIntoView` in a React effect; jsdom throws "not implemented". `window.scrollTo` emits a console warning. Both would cause misleading test failures unrelated to the behavior under test.
- **Fix:** Added `HTMLElement.prototype.scrollIntoView = () => {}` and `vi.stubGlobal("scrollTo", () => {})` at the top of the test file (before component import).
- **Files modified:** `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
- **Commit:** `e83fc6f`

**2. [Rule 2 - Missing] Used `vi.hoisted()` for PERF-03 spy**
- **Found during:** Task 2, first run
- **Issue:** `bulkUsersQuerySpy` referenced in `vi.mock` factory is subject to hoisting — using a top-level `const` caused `ReferenceError: Cannot access 'bulkUsersQuerySpy' before initialization`.
- **Fix:** Wrapped spy creation in `vi.hoisted()` which executes before module registration.
- **Files modified:** `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
- **Commit:** `e83fc6f`

## Known Stubs

None. The test renders the real `UsersDirectoryClient` with mocked tRPC hooks returning deterministic fixtures. No data stubs leak into production code.

## Threat Flags

None. This plan only adds a test file and a package dependency. No new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

Files exist:
- `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` — FOUND
- `package.json` (with `zustand` entry) — FOUND

Commits exist:
- `8f731fb` — chore(02-01): install zustand 5.0.14
- `e83fc6f` — test(02-01): add golden-path integration test
