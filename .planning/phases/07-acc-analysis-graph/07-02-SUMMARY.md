---
phase: 7
plan: 2
subsystem: users-acc-analysis
tags: [acc, analysis, trpc, react, dashboard]
dependency_graph:
  requires: [07-01-bulkAccSummary]
  provides: [AccAnalysisPanel, bulkAccSummary-extended]
  affects: [UsersDirectoryClient, users.ts]
tech_stack:
  added: []
  patterns: [useMemo-metrics, css-bar-charts, tab-switcher]
key_files:
  created:
    - app/(dashboard)/users/AccAnalysisPanel.tsx
  modified:
    - server/routers/users.ts
    - app/(dashboard)/users/UsersDirectoryClient.tsx
decisions:
  - bulkAccSummary extended in-place (not duplicated) — Plan 7.1's lightweight version replaced with extended version that is backward compatible
  - AccAnalysisPanel receives BulkAccUser[] prop — no separate tRPC call, reuses existing query from Plan 7.1
  - CSS-width bar chart for module patterns — no chart library dependency added
  - activeTab conditional renders Fragment wrapper to contain multiple sibling elements
metrics:
  duration_minutes: 18
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
  completed_date: 2026-04-23
---

# Phase 7 Plan 2: ACC Analysis Module — Hub-Wide Permission Intelligence Summary

**One-liner:** Hub-wide ACC permission analysis dashboard with role frequency table, multi-role detection, module fingerprint bars, and outlier identification — all computed client-side from cached ACC data.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Extend bulkAccSummary with roles + modules detail | ac5feca | server/routers/users.ts |
| 2 | Build AccAnalysisPanel + wire ACC Analysis tab | a26c0e7 | AccAnalysisPanel.tsx, UsersDirectoryClient.tsx |

## What Was Built

### server/routers/users.ts — `bulkAccSummary` extended

Replaced Plan 7.1's lightweight cache-only version with a full extended shape:
- Joins registered `user` table so all hub members appear even if uncached
- Returns `allRoles[]` and `allModules[]` (deduplicated flat lists across all projects per user)
- Returns full `projects[]` array for cross-project analysis
- Backward compatible: Plan 7.1 filter chip fields (`found`, `projectCount`, `activeCount`, `adminCount`, `hasNoProjects`, `syncedAt`) preserved
- Proper JSON.parse with try/catch for malformed cache entries

### app/(dashboard)/users/AccAnalysisPanel.tsx — NEW

Full analytical dashboard component. Accepts `users: BulkAccUser[]` and `refetch()` as props.

**Row 1 — 5 KPI cards:**
- Total ACC Users (blue)
- Total Unique Roles (violet)
- Users w/ Duplicate Roles (amber, clickable — expands detailed list)
- Hub Projects (green)
- Module Combinations (cyan)

**Row 2 — Side-by-side panels:**
- Role Frequency Table: sortable by count, clickable rows expand user list, orphan roles (1 user) highlighted amber
- Multi-Role Projects: users who have >1 role in the same project, with project breakdown

**Row 3 — Module Access Patterns:**
- Top 10 most-common module fingerprints as CSS width bar chart (no library)
- Outlier section: fingerprints appearing only once with user + project attribution

**Row 4 — Users Without Projects (conditional):**
- Table of name, email, synced-at
- "Force Refresh All" button calls `utils.users.bulkAccSummary.invalidate()` + refetch

### app/(dashboard)/users/UsersDirectoryClient.tsx — Tab Navigation

- `[General] [ACC Analysis]` tab switcher added below the page header
- `activeTab` state (`"general" | "analysis"`) controls rendering
- Analysis tab: hides search/filter bar and directory grid; renders `<AccAnalysisPanel>`
- General tab: full existing directory UI unchanged
- Reuses same `bulkAccSummary` query already present from Plan 7.1 — zero extra API calls
- `BulkAccUser` type imported from AccAnalysisPanel for type safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Conflict] Plan 7.1 ran concurrently and added a lightweight `bulkAccSummary`**
- **Found during:** Task 1 — `bulkAccSummary` already existed at line 727
- **Issue:** Duplicate property in router object literal (`TS1117`)
- **Fix:** Replaced Plan 7.1's lightweight version in-place with the extended version. All Plan 7.1 filter fields preserved — additive extension, not a breaking change.
- **Files modified:** server/routers/users.ts
- **Commit:** ac5feca

## Self-Check: PASSED

- AccAnalysisPanel.tsx: FOUND
- server/routers/users.ts: FOUND (single bulkAccSummary at line 727)
- Commits ac5feca and a26c0e7: FOUND
- TypeScript: ALL CLEAN (npx tsc --noEmit exits 0)
