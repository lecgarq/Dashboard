---
phase: 7
plan: 3
subsystem: users
tags: [graph, visualization, acc, force-directed, svg]
dependency_graph:
  requires: [07-01, 07-02]
  provides: [AccUsersGraph, graph-tab]
  affects: [UsersDirectoryClient]
tech_stack:
  added: []
  patterns: [custom-spring-simulation, svg-graph, resize-observer, cross-tab-navigation]
key_files:
  created:
    - app/(dashboard)/users/AccUsersGraph.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
decisions:
  - No d3 installed — custom Hooke-law spring simulation with requestAnimationFrame-style loop (200 iterations, frozen result)
  - SVG chosen over canvas for ACC graph — smaller node count (~50 users + ~10 roles) makes SVG practical and avoids canvas sprite complexity
  - Simulation runs in setTimeout(0) to avoid blocking first render — loading overlay shown until settled
  - selectedPersonEmail state + useEffect used for cross-tab navigation (consistent with Phase 6 forceRefresh pattern using state, not imperative calls)
metrics:
  duration: 35m
  completed: 2026-04-23
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 7 Plan 3: ACC Users Graph v1 — Spatial Permission Visualizer Summary

**One-liner:** Force-directed SVG permission graph with custom spring simulation mapping Users-to-Roles — zero new npm dependencies.

## What Was Built

### AccUsersGraph.tsx (NEW)

A self-contained SVG force-directed graph component that visualizes ACC permission relationships:

- **User nodes** (circles, r=14): indigo for normal users, amber for no-project users, green for Hub Admins
- **Role nodes** (diamonds): violet, radius scales with frequency (more users = larger diamond)
- **Edges**: user-to-role lines with weighted attraction that pulls same-role users into clusters
- **Custom spring simulation**: Hooke repulsion between all node pairs + attraction along edges + center gravity. Runs 200 iterations on mount, then freezes into a static layout
- **Controls**: Show/Hide Roles, Highlight Outliers, Highlight No-Project Users, Reset Layout
- **Zoom/pan**: scroll wheel zoom (0.2x to 5x), mouse drag to pan
- **Tooltip on hover**: shows name, email, project count, roles
- **Side panel on click**: full user detail with View Profile button (for users) or role user list (for role nodes)
- **View Profile callback**: fires `onSelectUser(email)` so parent can switch tabs and open the PersonDetailModal

### UsersDirectoryClient.tsx (MODIFIED)

- Extended `activeTab` type: `"general" | "analysis" | "graph"`
- Added third tab "ACC Users Graph" with `v1` badge in the tab switcher
- Renders `<AccUsersGraph>` at `calc(100vh - 200px)` height in the graph tab
- Added `selectedPersonEmail: string | null` state
- `useEffect` watches for `selectedPersonEmail + activeTab === "general"` → finds the matching person in the people array → opens `PersonDetailModal` → clears `selectedPersonEmail`
- `onSelectUser` callback: `setSelectedPersonEmail(email)` + `setActiveTab("general")`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `app/(dashboard)/users/AccUsersGraph.tsx` exists and exports `AccUsersGraph`
- [x] `app/(dashboard)/users/UsersDirectoryClient.tsx` updated with graph tab
- [x] TypeScript compiles clean (no errors on `npx tsc --noEmit`)
- [x] Commit `5248379` — AccUsersGraph.tsx created
- [x] Commit `0cb2e86` — UsersDirectoryClient.tsx tab wiring

## Self-Check: PASSED
