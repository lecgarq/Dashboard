---
phase: 04-users-table-polish
plan: "04"
subsystem: users-directory
tags: [kpi, count-up, r3f, particle-accent, header, animation]
dependency_graph:
  requires: ["04-03"]
  provides: [UsersTableHeader, HeaderParticleAccent, AnimatedNumber]
  affects: [UsersDirectoryClient]
tech_stack:
  added: ["@react-three/fiber@9.6.1"]
  patterns: [dynamic-import-ssr-false, rAF-count-up, frameloop-demand, glass-kpi-tile]
key_files:
  created:
    - app/(dashboard)/users/UsersTableHeader.tsx
    - app/(dashboard)/users/UsersTableHeader.test.tsx
    - app/(dashboard)/users/HeaderParticleAccent.tsx
  modified:
    - app/(dashboard)/users/UsersDirectoryClient.tsx
    - app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx
    - package.json
    - package-lock.json
decisions:
  - "AnimatedNumber uses useRef(initialTarget) + empty dep array to fire ONCE on mount; re-renders with same value do not restart the animation"
  - "R3F Canvas rendered via dynamic() ssr:false inside header; frameloop=demand + 80ms setInterval for ambient drift at ~12fps"
  - "bufferAttribute typed with direct Float32Array arg (not lazy initializer) to satisfy TypeScript strict overloads"
  - "Integration test updated to find dynamic panel with truthy data-email (not first panel — HeaderParticleAccent also creates an empty dynamic panel)"
metrics:
  duration: "9 minutes"
  completed: "2026-06-18"
  tasks_completed: 3
  files_changed: 7
status: complete
---

# Phase 04 Plan 04: KPI Header + R3F Particle Accent Summary

Premium page header for /users: glass KPI tiles with rAF-driven ease-out count-up (once per mount) and a subtle R3F particle accent canvas confined to the header strip.

## What Was Built

**UsersTableHeader.tsx** — Glass KPI strip with three tiles (Total users, Active 30d, Admins) and an `AnimatedNumber` component that counts up once on mount using `requestAnimationFrame` with ease-out cubic. The header has `position: relative` so `HeaderParticleAccent` can absolutely-position within it. `PremiumSurface variant="glass"` wraps each tile. KPIs are display-only (no onClick) and receive values via props from the shell.

**HeaderParticleAccent.tsx** — R3F particle field (~180 drifting points, indigo-tinted, 0.35 opacity). Canvas is `position:absolute, inset:0, pointerEvents:none, z-index:0` — strictly confined to the header strip, never overlapping the DataTable. `frameloop="demand"` with 80ms `setInterval` invalidate for ambient drift at ~12fps. Default export for `dynamic(() => import(...), { ssr: false })`.

**UsersDirectoryClient.tsx** — Added `UsersTableHeader` above the sub-header row (count + Group-by Select), inside the existing `motion.div` fade wrapper. KPIs derived in-memory from existing `people` + `accSummaryMap` data — no new tRPC query. Removed the old inline `<h1>Users</h1>` title block (now owned by the header).

**@react-three/fiber@9.6.1** installed (T-04-SC checkpoint cleared by human before install; pmndrs org, 1M+ weekly downloads, React 19 compatible v9).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Checkpoint | Verify @react-three/fiber legitimacy | (pre-cleared by human) | — |
| 1 | KPI glass strip + AnimatedNumber count-up | 2c1bad2e | UsersTableHeader.tsx, UsersTableHeader.test.tsx |
| 2 | R3F particle accent (install + Canvas) | 68168277 | HeaderParticleAccent.tsx, package.json, package-lock.json |
| 3 | Mount header in shell above DataTable | 9ba0c150 | UsersDirectoryClient.tsx, integration test |

## Verification Results

- `npx vitest run "app/(dashboard)/users"` — 1120/1120 PASS
- `npx vitest run` — 2100 pass, 2 pre-existing FolderPermissionTerrain failures (same as baseline), 8 e2e files skipped (need :3100 server)
- `npx tsc --noEmit` — 0 new errors (pre-existing DataTable.test.tsx overload errors unchanged)
- `npm run repo-map:check` — PASS (no new fetch/effect on data path)
- WebGL confinement: `grep Canvas|@react-three UsersDirectoryClient.tsx DirectoryTableColumns.tsx PeekPanel.tsx` — 0 matches
- Scope boundary: `git diff --name-only` touches 0 files under `users/access-analysis/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Integration test: dynamic panel selector too broad**
- **Found during:** Task 3
- **Issue:** The integration test's `next/dynamic` mock created an empty-email `DynamicMock` for `HeaderParticleAccent`, making `querySelector("[data-testid='dynamic-panel']")` find it first (empty `data-email` fails assertion)
- **Fix:** Updated selector to find all panels and filter to the one with a truthy `data-email` (the DrillSheet's UserProfilePanel)
- **Files modified:** `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
- **Commit:** 9ba0c150

**2. [Rule 1 - Bug] TypeScript error: useRef with lazy-initializer factory**
- **Found during:** Task 2 (tsc run after implementation)
- **Issue:** `useRef<Float32Array>(() => { ... })` is not valid — `useRef` does not accept a function initializer (unlike `useState`); TypeScript overloads reject the factory shape
- **Fix:** Extracted `buildPositions()` and `buildVelocities()` as module-level functions; called them directly as `useRef(buildPositions())`
- **Files modified:** `app/(dashboard)/users/HeaderParticleAccent.tsx`
- **Commit:** 68168277

## Known Stubs

None — KPI values are derived from live in-memory data (`people.length`, `accSummaryMap` project activity, `adminCount`/`projectAdmin`/`isAccountAdmin` fields). The particle accent is ambient-visual with no data dependency.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. T-04-SC mitigated (human verified npmjs.com provenance before install). T-04-01 mitigated (frameloop=demand + ~180 points, header-only). T-04-02 accepted (KPI counts from already-loaded data).

## Self-Check: PASSED
