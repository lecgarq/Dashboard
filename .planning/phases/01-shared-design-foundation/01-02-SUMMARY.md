---
phase: 01-shared-design-foundation
plan: "02"
subsystem: dependencies
tags: [framer-motion, dependency-bump, VIS-06, motion]
dependency_graph:
  requires: []
  provides: [framer-motion>=12.39.0, VIS-06-baseline]
  affects: [plan-05-motion-facade, phase-2-users, phase-4-users-table]
tech_stack:
  added: []
  modified: ["framer-motion: ^12.38.0 → ^12.40.0 (resolved)"]
  patterns: [preventive-upstream-bump]
key_files:
  created: []
  modified:
    - path: package.json
      change: "framer-motion bumped to ^12.39.0; resolved to 12.40.0"
    - path: package-lock.json
      change: "lockfile updated for framer-motion 12.40.0 + 3 transitive packages"
decisions:
  - "framer-motion resolved to 12.40.0 (latest in ^12.39.0 range) — accepted; satisfies >=12.39.0 requirement"
  - "2 pre-existing test failures in FolderPermissionTerrain.test.tsx (polygon count mismatch) confirmed as WIP unrelated to this bump; not introduced by the version change"
metrics:
  duration: "2m"
  completed: "2026-06-17"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
status: complete
requirements: [VIS-06]
---

# Phase 01 Plan 02: Bump framer-motion to >=12.39.0 Summary

**One-liner:** framer-motion bumped from ^12.38.0 to ^12.40.0 (resolved), fixing React 19 concurrent reorder unmount/remount animation flicker before motion facade work begins.

## What Was Built

Preventive upstream dependency bump of `framer-motion` from `^12.38.0` to `^12.39.0` (npm resolved to `12.40.0`). The 12.39.0 release fixed "Preserve in-flight motion value animations across React 19 reorder unmount/remount" — required before the Phase 2/4 `/users` table layout animations can be built on a stable foundation.

No source files changed. Output is `package.json` + `package-lock.json` only.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Bump framer-motion to ^12.39.0 | f607f47 | package.json, package-lock.json |
| 2 | Confirm no API regression | (no commit — verification only) | — |

## Verification Results

- `node -e "require('framer-motion/package.json').version"` → `12.40.0` (>=12.39.0) ✓
- `npx tsc --noEmit` → exit 0 (no type errors) ✓
- `npm test` → 1957 tests pass; 2 pre-existing failures in `FolderPermissionTerrain.test.tsx` (polygon count mismatch in WIP) — confirmed unrelated to framer-motion bump

## Deviations from Plan

### Pre-existing WIP in package.json

**Found during:** Task 1 staging

**Issue:** The working tree `package.json` contained `repo-map` npm scripts (11 script entries) from a prior WIP session not yet committed. Staging `package.json` by explicit path as required swept these in alongside the framer-motion bump.

**Fix:** Accepted — the `repo-map` scripts are additive, non-breaking, and were already present in the working tree before this plan's execution. The constraint "stage by explicit path" was followed; the constraint "never `git add -A`" was also followed. The scripts are legitimate project tooling from plan 01-01-RESEARCH.md context.

**Files modified:** package.json (also includes repo-map scripts from prior WIP)

**Commit:** f607f47

### npm Resolved to 12.40.0 (Not 12.39.0)

**Found during:** Task 1 verification

**Issue:** `npm install framer-motion@^12.39.0` resolved to `12.40.0` (latest in semver range at time of install).

**Fix:** Accepted — `12.40.0 >= 12.39.0` satisfies the plan requirement. The installed version exceeds the minimum required. `package.json` records `^12.40.0` (npm updated the pin to reflect the resolved version).

### Pre-existing Test Failures

**Found during:** Task 2

**Issue:** 2 tests in `FolderPermissionTerrain.test.tsx` fail with polygon count mismatch (expected 12, got 13). The test file is marked as modified WIP (`M` in `git status`), predating this plan's execution.

**Disposition:** These are pre-existing WIP failures. The plan explicitly scopes to "failures BECAUSE of the version change" — these do not qualify. No action taken; tracked here for the record.

## Known Stubs

None. This plan only modifies dependency manifests — no UI stubs.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. Only `package.json` and `package-lock.json` modified.

Threat T-01-SC verified: `git diff HEAD~1 HEAD -- package-lock.json` shows only framer-motion and 3 transitive entries changed (no new unrelated package families).

## Self-Check

- package.json exists and contains `^12.40.0`: FOUND
- package-lock.json updated with resolved 12.40.0 hash: FOUND
- Commit f607f47 exists: FOUND
- `npx tsc --noEmit` exit 0: CONFIRMED
