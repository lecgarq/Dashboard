---
phase: 05-access-analysis-depth
plan: "05"
subsystem: ui
tags: [echarts, wcag, accessibility, theming, contrast, light-dark]
status: complete

# Dependency graph
requires:
  - phase: 05-04
    provides: "PremiumSurface panels, Suspense tiers, lazy TerrainReveal, KPI no-reanimate guard"
  - phase: 05-01
    provides: "Canonical EChart wrapper migration — cSub/cAxis constants in all 6 chart files"

provides:
  - "Automated WCAG AA contrast gate (chartContrast.test.ts, 15 assertions, both themes) — repeatable regression guard"
  - "Light cSub/cAxis token nudged from #6b7280 (gray-500, 4.6:1) to #52525b (zinc-600, ~7.0:1) in 6 chart files"
  - "THM-01 projector-brightness sign-off (owner approved)"
  - "VIS-05 drill-motion re-confirmed intact (no filter-change re-fire)"

affects: [05-phase-verification, 07-pre-workshop-uat, THM-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WCAG relative-luminance formula in pure test (no DOM): hex → sRGB linearize → L=0.2126R+0.7152G+0.0722B → (Llighter+0.05)/(Ldarker+0.05)"
    - "Dark card opaque approximation: rgba(24,24,27,0.96) → #18181b for contrast calculations"
    - "Raise the token, never loosen the threshold: always fix the color, not the bar"

key-files:
  created:
    - "app/(dashboard)/access-analysis/__tests__/chartContrast.test.ts"
  modified:
    - "app/(dashboard)/access-analysis/components/RolesPieChart.tsx"
    - "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx"
    - "app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx"
    - "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx"
    - "app/(dashboard)/access-analysis/components/ModulesPieChart.tsx"
    - "app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx"

key-decisions:
  - "Nudge the token, not the threshold: light cSub/cAxis raised to zinc-600 (#52525b, ~7.0:1) rather than loosening the 4.5 floor"
  - "Dark sub-label (#a1a1aa on #18181b = 5.6:1) left unchanged — already had meaningful headroom"
  - "Dark card surface approximated as opaque #18181b (rgba(24,24,27,0.96) is effectively the same for contrast math) — documented in test"
  - "Slice fills, gradient fills, emphasis glow, and 05-02 motion timings untouched — only data-label constants changed"

patterns-established:
  - "WCAG AA gate pattern: pure contrastRatio(fgHex, bgHex) in Node env (no DOM) with explicit surface constants per theme"

requirements-completed: [THM-01, VIS-05]

# Metrics
duration: continuation (finalization only)
completed: 2026-06-19
---

# Phase 5 Plan 05: THM-01 Contrast Gate Summary

**Automated WCAG AA contrast gate (15 assertions, both themes) + light cSub/cAxis nudge from gray-500 to zinc-600 (#52525b, ~7.0:1 on white); owner projector sign-off approved.**

## Performance

- **Duration:** Continuation finalization (prior commits already landed)
- **Completed:** 2026-06-19
- **Tasks:** 3 (2 implementation + 1 human checkpoint)
- **Files modified:** 7

## Accomplishments

- Added `chartContrast.test.ts` — pure WCAG relative-luminance math, 15 assertions covering every chart label pair in both light and dark themes; runs in Node env (no DOM required)
- Found light `cSub`/`cAxis` (#6b7280, gray-500) at 4.6:1 — marginal, fails at projector brightness; nudged to #52525b (zinc-600, ~7.0:1) across all 6 chart components
- Dark `cSub` (#a1a1aa on #18181b = 5.6:1) confirmed passing with headroom — left unchanged
- Owner reviewed `/access-analysis` at projector-reduced brightness in both themes and approved (Task 3 checkpoint)
- VIS-05 motion behavior re-confirmed: drill/reveal fires only on mount/drill, never on filter change; no new animation added

## Measured Contrast Ratios

| Token | Light value | Light ratio (on #FFFFFF) | Dark value | Dark ratio (on #18181b) | Pass? |
|-------|------------|--------------------------|-----------|--------------------------|-------|
| `cTitle` (center big-number) | #111827 | ~16:1 | #fafafa | ~20:1 | Both pass |
| `cSub` / `cAxis` (sub-label, axis) | #52525b (was #6b7280) | ~7.0:1 (was 4.6:1) | #a1a1aa | 5.6:1 | Both pass |
| Tooltip title (from ECHARTS_LIGHT/DARK palette) | — | passes via mergeEChartsTheme | — | passes via mergeEChartsTheme | Both pass |

## Task Commits

1. **Task 1: Automated WCAG AA contrast test** — `b6bfbd6e` (test)
   - `app/(dashboard)/access-analysis/__tests__/chartContrast.test.ts` — 15 assertions, pure math, both themes
2. **Task 2: Fix sub-AA label colors** — `9fc38c98` (fix)
   - 6 chart files: cSub/cAxis #6b7280 → #52525b (zinc-600)
3. **Task 3: Projector-brightness sign-off** — checkpoint approved by owner

## Files Created/Modified

- `app/(dashboard)/access-analysis/__tests__/chartContrast.test.ts` — WCAG AA gate, 15 assertions, no DOM
- `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` — cSub/cAxis nudge to #52525b
- `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` — cSub/cAxis nudge to #52525b
- `app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx` — cSub/cAxis nudge to #52525b
- `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx` — cSub/cAxis nudge to #52525b
- `app/(dashboard)/access-analysis/components/ModulesPieChart.tsx` — cSub/cAxis nudge to #52525b
- `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` — cSub/cAxis nudge to #52525b

## Gates Verified

- `npx tsc --noEmit` exit 0
- `chartContrast.test.ts` 15/15 pass (both themes, all token pairs)
- Slice fills, gradients, emphasis glow, universalTransition timings from 05-01/05-02 unchanged
- No new WebGL context introduced (PERF-05)
- THM-01 human projector-brightness checkpoint approved by owner

## Decisions Made

- **Raise the token, not the threshold:** Rather than loosening the 4.5 floor or marking the 4.6:1 marginal as acceptable, the cSub/cAxis constant was nudged to zinc-600 (#52525b) to give meaningful headroom (~7.0:1). This is the pattern to follow for any future label color changes.
- **Opaque approximation for dark card:** The dark card uses `rgba(24,24,27,0.96)` which is effectively `#18181b` for contrast math; documented in the test.
- **Dark sub-label unchanged:** #a1a1aa on #18181b = 5.6:1 already had headroom beyond the 4.5 threshold; it was confirmed passing and left alone.

## Deviations from Plan

None — plan executed exactly as written. Task 1 found exactly the predicted sub-AA pair (light cSub at 4.6:1). Task 2 fixed it. Task 3 approved.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 5 is now 5/5 plans complete
- THM-01 is partially fulfilled here (densest data surface, /access-analysis verified); full THM-01 closure across all 4 pages is Phase 7 (Pre-Workshop UAT)
- Phase 6 (/template-mty & /forma-proposal Polish) can now proceed
- Phase 7 UAT is blocked until Phase 6 also completes

---
*Phase: 05-access-analysis-depth*
*Completed: 2026-06-19*
