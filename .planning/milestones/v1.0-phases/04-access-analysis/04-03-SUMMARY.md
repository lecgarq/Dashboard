---
phase: 04-access-analysis
plan: 03
subsystem: lib/acc
tags: [analytics, vitest, pure-functions, dashboard, DASH-02, DASH-03, DASH-04, DASH-05, DASH-09]
requires:
  - lib/acc/acc-types.ts (BulkAccUser shape)
  - date-fns (^4.1.0, already installed)
  - vitest (^4.1.5, already installed)
provides:
  - lib/acc/nameSimilarity.ts (tokenize, nameTokenOverlap, DUPLICATE_ROLE_NAME_THRESHOLD)
  - lib/acc/activeUserTiers.ts (bucketActiveUserTier, ACTIVE_TIERS, ActiveTier)
  - lib/acc/dashboardAnalytics.ts (findJunkRoles, findDuplicateRoles, findOutlierModuleCombos, computeAllFindings, DashboardFindings, JunkRoleFinding, DuplicateRoleFinding, OutlierFinding, Severity)
affects:
  - downstream widgets (Plan 04-05 onward) consume DashboardFindings
tech_stack:
  added: []
  patterns: [pure-function analytics module, Vitest TDD, Jaccard token-overlap, role-aggregate map]
key_files:
  created:
    - lib/acc/nameSimilarity.ts
    - lib/acc/nameSimilarity.test.ts
    - lib/acc/activeUserTiers.ts
    - lib/acc/activeUserTiers.test.ts
    - lib/acc/dashboardAnalytics.ts
    - lib/acc/dashboardAnalytics.test.ts
  modified:
    - package.json (added vite as devDep — fix for vite-tsconfig-paths peer)
    - package-lock.json
decisions:
  - zeroMembers signal: a role with NO project-assignment binding is treated as zero-members; surfaced when listed in user.allRoles only. Real role-catalog source deferred.
  - Duplicate detection module sets are aggregated at role level (union across all projects); per-project-instance comparison deferred.
  - roleSeverityIndex max rule HIGH > MEDIUM > LOW; duplicate-flagged roles contribute severity MEDIUM.
metrics:
  duration: "4m 52s"
  completed_at: "2026-05-08T18:59:13Z"
  tasks: 6
  files: 6
  tests_passed: 45
---

# Phase 4 Plan 3: Dashboard Analytics Modules Summary

Pure, Vitest-tested analytics modules (`nameSimilarity`, `activeUserTiers`, `dashboardAnalytics`) plus a single `computeAllFindings(users, now)` entry point that powers DASH-02/03/04/05/09. 45 tests pass; TypeScript clean; no React/Next imports — fully node-runnable.

## Tasks Completed

| # | Description | Commit | Tests |
|---|-------------|--------|-------|
| 1 | RED: nameSimilarity test suite (Jaccard edge cases, Pitfall 5) | ba86399 | 14 failing |
| 2 | GREEN: nameSimilarity implementation | b3ea82a | 14/14 pass |
| 3 | RED: activeUserTiers test suite (boundary inclusivity, Pitfall 4) | 9f4dd14 | 12 failing |
| 4 | GREEN: activeUserTiers implementation | 2eb5d35 | 12/12 pass |
| 5 | RED: dashboardAnalytics test suite (junk/dup/outlier/aggregate) | 8cf263f | 19 failing |
| 6 | GREEN: dashboardAnalytics implementation | ba9b0e8 | 19/19 pass |

## Decisions Made

### 1. zeroMembers semantics
A role only enters the data via either `user.allRoles` or any `project.roles`. We treat a role as having "zero members" when it appears in `user.allRoles` but is **not** bound to any project assignment in the dataset. This is the closest user-derived proxy for "role exists in catalog but is unassigned"; a true account-level role catalog is deferred. Documented in `dashboardAnalytics.ts` JSDoc.

### 2. roleSeverityIndex aggregation rule
HIGH > MEDIUM > LOW. Junk findings contribute their tiered severity; duplicate findings contribute severity **MEDIUM** for both `roleA` and `roleB` (duplicates are "review and potentially merge" — middling priority). The map stores the **max** severity seen per role. Inline-badge consumers (DASH-09) read this single source of truth.

### 3. Duplicate-detection module-set scope
Module sets are aggregated at the role level (union across all projects where the role appears). This matches the user's mental model "this role grants these modules" and resolves Open Q3 from RESEARCH.md for the first pass. Per-project-instance comparison would be a future refinement.

### 4. Outlier threshold semantics
`pct < thresholdPct` is **strict less-than** (default 0.05). A boundary case of exactly 5/100 = 0.05 is **not** flagged. Tests cover both 4/100 (flagged) and 5/100 (not flagged), and a custom-threshold case raising it to 0.06.

### 5. Inactive-user definition for junk-role signal 3
`isInactive90d` returns true when `lastSignIn` is null/undefined/malformed (Pitfall 4 defensive fallback) OR strictly older than 90 days. The "all members inactive" signal is **vacuously true** when a role has zero members.

## Edge Cases Worth Noting for Widget Consumers

- **`affectedMembers` and `affectedProjects` are sorted**, deduplicated lists — safe to render directly without re-sorting.
- **Outlier `pct`** is a fraction (e.g., `0.04` = 4%). Widgets must format for display.
- **`computeAllFindings(users)` defaults `now` to `new Date()`** — pass an explicit `now` in tests to keep them deterministic.
- **All four finder return arrays are stable in shape**, never `undefined`. `roleSeverityIndex` is always a `Map` instance (may be empty).
- **Duplicate pairs are emitted once**: `(roleA, roleB)` only, not also `(roleB, roleA)`. Display order is insertion order from the per-role aggregate Map.
- **Module-set normalization** in outlier detection sorts + dedupes input — `{A,B}` and `{B,A}` count as the same combination.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed `vite` as devDependency**
- **Found during:** Task 1 (RED nameSimilarity)
- **Issue:** `npm run test` failed with "Cannot find package 'vite'" because `vitest.config.ts` imports `vite-tsconfig-paths` which has a peer requirement on `vite` that was not installed at the top level (only nested under `vitest/node_modules/vite`).
- **Fix:** `npm install --save-dev vite` (added 2 packages, removed 4 unused).
- **Files modified:** package.json, package-lock.json
- **Commit:** ba86399 (rolled into RED commit since it was a prerequisite)

### Concurrent-plan interference (informational, not a deviation)

After Task 6 GREEN, an external concurrent plan (04-01: `feat(04-01): plumb isAccountAdmin through ACC pipeline`, commit `3228a8a`) extended `BulkAccUser` with a non-optional `isAccountAdmin: boolean` field. A follow-up chore commit `c9c0fcb` from that lane updated `dashboardAnalytics.test.ts` `makeUser` factory to set `isAccountAdmin: false`. Tests still pass (45/45). My implementation does not consume `isAccountAdmin` — Plan 04-03's scope is junk/duplicate/outlier analytics only.

## Verification

- [x] `npm run test -- lib/acc/nameSimilarity` — 14/14 pass
- [x] `npm run test -- lib/acc/activeUserTiers` — 12/12 pass
- [x] `npm run test -- lib/acc/dashboardAnalytics` — 19/19 pass
- [x] Combined run — 45/45 pass
- [x] `npx tsc --noEmit` — no errors in the three new modules
- [x] Three RED commits + three GREEN commits per `tdd_integration` discipline

## Self-Check: PASSED

Files exist:
- FOUND: lib/acc/nameSimilarity.ts
- FOUND: lib/acc/nameSimilarity.test.ts
- FOUND: lib/acc/activeUserTiers.ts
- FOUND: lib/acc/activeUserTiers.test.ts
- FOUND: lib/acc/dashboardAnalytics.ts
- FOUND: lib/acc/dashboardAnalytics.test.ts

Commits exist:
- FOUND: ba86399 (test RED nameSimilarity)
- FOUND: b3ea82a (feat GREEN nameSimilarity)
- FOUND: 9f4dd14 (test RED activeUserTiers)
- FOUND: 2eb5d35 (feat GREEN activeUserTiers)
- FOUND: 8cf263f (test RED dashboardAnalytics)
- FOUND: ba9b0e8 (feat GREEN dashboardAnalytics)
