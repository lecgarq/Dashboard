---
phase: 06-template-mty-forma-proposal-polish
plan: "01"
subsystem: template-mty/charts
tags: [echarts, premium-surface, donut-treatment, skeleton, loading]
dependency_graph:
  requires: [phase-01-primitives]
  provides: [TPL-02-chart-theming, TPL-03-premium-surface-charts, PERF-01-template-mty-skeleton]
  affects: [app/(dashboard)/template-mty]
tech_stack:
  added: []
  patterns: [PremiumSurface-variant-base, PremiumSurface-variant-inset, EChart-canonical-wrapper, gradient-donut-treatment, Next.js-loading.tsx]
key_files:
  created:
    - app/(dashboard)/template-mty/loading.tsx
  modified:
    - app/(dashboard)/template-mty/components/RoleAccessPie.tsx
    - app/(dashboard)/template-mty/components/PermissionAccessChart.tsx
    - app/(dashboard)/template-mty/components/ModuleAccessChart.tsx
decisions:
  - "lighten() helper added locally to RoleAccessPie (same implementation as RolesPieChart.tsx in /access-analysis — no shared utility import needed for a ~10-line pure function)"
  - "display-only pie: no cursor:pointer added to canvas; selectedMode not forced to false (the existing onEvents.click toggling the inline legend is retained per plan)"
  - "Empty-state icons are inline SVGs (no lucide-react import) to keep the components self-contained and avoid the need for an additional dependency"
metrics:
  duration: 5min
  completed: "2026-06-19"
  tasks_completed: 2
  files_modified: 4
status: complete
---

# Phase 6 Plan 01: /template-mty Chart Polish Summary

**One-liner:** Migrated all three /template-mty analytics charts to the shared themed EChart wrapper, applied the full gradient/rounded/glow donut treatment to the role pie, wrapped every chart panel and empty state in PremiumSurface, and added the route loading.tsx skeleton.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add loading.tsx + swap all three charts to shared EChart wrapper | f0a0c22e | loading.tsx, RoleAccessPie.tsx, PermissionAccessChart.tsx, ModuleAccessChart.tsx |
| 2 | Full donut treatment on RoleAccessPie + PremiumSurface roots + premium empty states | b7442058 | RoleAccessPie.tsx, PermissionAccessChart.tsx, ModuleAccessChart.tsx |

## Verification Results

- `grep -rn "access-analysis/components/EChart" app/(dashboard)/template-mty` → 0 matches (PASS)
- `npx tsc --noEmit` → exits 0 (PASS)
- `npm test -- --run RoleAccessPie ModuleAccessChart` → 3/3 tests pass (PASS)

## What Was Built

### Task 1: loading.tsx + EChart import swap

Created `app/(dashboard)/template-mty/loading.tsx` — a route-level Suspense skeleton matching the page's real layout sections: header strip + 4 stacked panel placeholders using `rounded-2xl bg-muted/20 animate-pulse` (PERF-01 ~200ms target).

In all three chart files, changed the EChart import from `@/app/(dashboard)/access-analysis/components/EChart` (old wrapper, no `mergeEChartsTheme`) to `@/components/ui/EChart` (canonical themed wrapper from Phase 1 that internally calls `mergeEChartsTheme` and remounts on theme switch via `key={resolvedTheme}`).

### Task 2: Donut treatment + PremiumSurface

**RoleAccessPie.tsx:**
- Added `lighten(hex, amt)` helper (mirrors `RolesPieChart.tsx` implementation)
- Applied full donut treatment to the pie series: per-slice linear gradient `itemStyle.color` (lighten +0.22 at offset 0, base at offset 1), `borderColor = cSlice` (card bg), `borderWidth: 3`, `borderRadius: 7` (rounded segment ends), `shadowBlur: 14` + `cShadow`, emphasis `scaleSize: 12` + `shadowBlur: 28` glow, `blur: { opacity: 0.22 }`, `universalTransition: true`, `animationType: "scale"`, `animationEasing: "elasticOut"`
- Active-slice glow via `shadowBlur: 24` / `shadowColor: base+"99"` on the selected slice data item
- Display-only: no `cursor: pointer` added; hover lift+glow does NOT imply click-through
- Replaced outer `<div className="panel-elevated p-5">` with `<PremiumSurface variant="base" className="p-5">`
- Empty state upgraded: `<PremiumSurface variant="inset" ...>` + pie SVG icon + existing message text

**PermissionAccessChart.tsx:**
- Replaced outer `<div className="panel-elevated p-5">` with `<PremiumSurface variant="base" className="p-5">`
- Empty state upgraded: `<PremiumSurface variant="inset" ...>` + horizontal-bars SVG icon + existing message text

**ModuleAccessChart.tsx:**
- Replaced outer `<div className="panel-elevated p-5">` with `<PremiumSurface variant="base" className="p-5">`
- Empty state upgraded: `<PremiumSurface variant="inset" ...>` + 4-square grid SVG icon + existing message text (code blocks preserved)

## Deviations from Plan

### Staging Index Hazard (pre-existing WIP)

**Found during:** Task 2 commit
**Issue:** A pre-staged `HierarchyView.test.tsx` file (from a concurrent WIP session — tracked in MEMORY.md as "ACC redesign WIP lives in working tree") was swept into the first Task 2 commit (`4e3efd2f`) because it was already in the index. The three intended chart files were NOT captured in that commit.
**Fix (Rule 3 — auto-fixed blocking issue):** Immediately detected via `git show --stat HEAD`. Staged and committed the three chart files separately in a corrective commit (`b7442058`) in the same task. Both commits are on the correct branch. The pre-staged `HierarchyView.test.tsx` commit is present but is harmless — it is a legitimate WIP file on this branch.
**Files modified:** No change to the intended plan output; all four planned files are correctly on HEAD.

## Known Stubs

None — all three chart components render real data from RSC props. The empty states are intentional (no data = legitimate empty state, not a stub).

## Threat Flags

None — presentation-layer only. No new network endpoints, auth paths, or data sources.

## Self-Check: PASSED

- loading.tsx: FOUND at app/(dashboard)/template-mty/loading.tsx
- RoleAccessPie.tsx: FOUND (modified)
- PermissionAccessChart.tsx: FOUND (modified)
- ModuleAccessChart.tsx: FOUND (modified)
- Commit f0a0c22e: FOUND in git log
- Commit b7442058: FOUND in git log
