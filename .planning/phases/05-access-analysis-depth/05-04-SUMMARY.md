---
phase: 05-access-analysis-depth
plan: "04"
subsystem: access-analysis
tags: [acc-01, acc-03, perf-02, perf-05, vis-01, vis-05, na-01, int-05, suspense-tiers, premium-surface, terrain-lazy, coverage-badge, kpi-guard, owner-approved]
dependencies:
  requires:
    - 05-01 (applySliceFilters, PillBar, ActivityCoverageBadge RED stub, EChart migration)
    - 05-02 (cross-filter wiring, sliceFilters state, View N people slide-in)
    - 05-03 (activityCoverageCounts helper, ActivityCoverageBadge component)
  provides:
    - Suspense-tiered page.tsx — KPIs+donuts fast path, timeline+terrain stream separately
    - DonutSkeletons (DonutPanelSkeleton, DonutGridSkeleton, KpiStripSkeleton, TimelineSkeleton)
    - TerrainReveal collapsed-lazy wrapper (ACC-03)
    - PremiumSurface 2.5D depth on every panel, 2-up donut grid (ACC-01, VIS-01)
    - ActivityCoverageBadge placed on 4 activity-derived panels (NA-01)
    - KPI no-reanimate guard via hasAnimatedKpi ref (VIS-05)
  affects:
    - app/(dashboard)/access-analysis/page.tsx — RSC shell w/ Suspense boundary
    - app/(dashboard)/access-analysis/mainCharts.tsx — new (extracted data tier)
    - app/(dashboard)/access-analysis/components/DonutSkeletons.tsx — new
    - app/(dashboard)/access-analysis/components/TerrainReveal.tsx — new
    - app/(dashboard)/access-analysis/__tests__/TerrainReveal.test.tsx — new
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx — PremiumSurface wrap, 2-up grid, badge placement, KPI guard, SectionHeader badge slot
tech_stack:
  added: []
  patterns:
    - RSC Suspense streaming (one Suspense boundary around the full data tier)
    - Controlled collapse/expand (TerrainReveal with useState(false) + on-demand loadOverview)
    - PremiumSurface variant="base" as single elevated surface per panel
    - Responsive 2-up donut grid (grid-cols-1 lg:grid-cols-2)
    - Active-slice glow (glow={!!sliceFilters.role|company} on PremiumSurface)
    - hasAnimatedKpi useRef guard for mount-once count-up
    - SectionHeader badge?: ReactNode slot for inline badge placement
key_files:
  created:
    - app/(dashboard)/access-analysis/mainCharts.tsx
    - app/(dashboard)/access-analysis/components/DonutSkeletons.tsx
    - app/(dashboard)/access-analysis/components/TerrainReveal.tsx
    - app/(dashboard)/access-analysis/__tests__/TerrainReveal.test.tsx
  modified:
    - app/(dashboard)/access-analysis/page.tsx
    - app/(dashboard)/access-analysis/page.test.tsx
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
decisions:
  - "Suspense decomposition: single boundary around MainCharts (whole data tier) rather than separate per-tier RSC components — avoids cross-filter state fragmentation across Suspense boundaries; timeline+terrain props flow through as server-computed props to one client owner"
  - "mainCharts.tsx extracted as a non-page RSC module to satisfy Next.js page.tsx named-export constraints (page.tsx may only export metadata/default/config/generateViewport)"
  - "TerrainReveal loads account-wide overview via loadOverview on first expand (not a default-project preload); initial={null} passed so no terrain data is fetched at page mount"
  - "KPI no-reanimate: StatStrip not keyed by filter values; hasAnimatedKpi useRef(false) gates any future count-up to first mount only"
  - "PremiumSurface double-nesting avoided by removing inner panel-elevated wrappers from donut sections — exactly one elevated surface per panel"
  - "ActivityCoverageBadge placed on 4 activity-derived panels only: timeline, activity-by-role, activity-by-company, activity-by-module; membership donuts not badged"
  - "Active-slice glow: glow={!!sliceFilters.role} on Role panel, glow={!!sliceFilters.company} on Company panel — visual cue of active filter source"
  - "Pre-existing FolderPermissionTerrain test failures (2 of 13) are unrelated concurrent WIP on this branch; not introduced by this plan"
metrics:
  duration: "~20 minutes (3 implementation commits)"
  completed: "2026-06-19"
  tasks: 4
  files_modified: 3
  files_created: 4
status: complete
---

# Phase 05 Plan 04: Presentation Surgery Summary

**One-liner:** Suspense-tiered fast-paint page with DonutSkeletons, collapsed-lazy TerrainReveal, PremiumSurface 2.5D depth on every panel, responsive 2-up donut grid, activity coverage badges, and mount-once KPI animation guard — owner-approved on live rebuild.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Suspense-tier page.tsx + DonutSkeletons (remove blocking terrain await) | 36106e2d | page.tsx, mainCharts.tsx, DonutSkeletons.tsx, page.test.tsx |
| 2 | TerrainReveal collapsed-lazy wrapper (ACC-03) | 2423398d | TerrainReveal.tsx, TerrainReveal.test.tsx, AccessAnalysisCharts.tsx |
| 3 | PremiumSurface panels + 2-up donut grid + coverage badges + KPI guard | a63a3297 | AccessAnalysisCharts.tsx, mainCharts.tsx, page.tsx, page.test.tsx |
| 4 | Human visual checkpoint — owner sign-off | (human gate) | — |

## What Was Built

### Task 1: Suspense-Tier page.tsx + DonutSkeletons

**Problem solved:** The original page.tsx had a sequential `await loadFolderPermissionTerrain(defaultProject.id)` after a `Promise.all` of 7 loaders. The terrain loader takes 2-3s, blocking the entire page from first paint.

**Decomposition chosen:**
- `page.tsx` (RSC shell): awaits only `loadTerrainProjects()` (cheap), wraps `<MainCharts>` in a `<Suspense fallback={<...Skeletons/>}>` boundary
- `mainCharts.tsx` (non-page RSC): awaits all 5 data loaders (`loadInstanceView`, `loadModuleActivity`, `loadActivityByActor`, `loadCoordinationByProject`, `loadProjectCoverage`), renders `<AccessAnalysisCharts>` client component with all props
- `DonutSkeletons.tsx` (presentational): four shaped shimmer components using `animate-shimmer` + `--shimmer-stop` token:
  - `DonutPanelSkeleton` — circular ring shimmer (~400px card)
  - `DonutGridSkeleton` — 2-up responsive grid of two DonutPanelSkeletons
  - `KpiStripSkeleton` — row of 6 KPI tile shimmers
  - `TimelineSkeleton` — horizontal bar shimmer card

`loadFolderPermissionTerrain` is entirely removed from page.tsx. The terrain builds its overview on first user expand.

### Task 2: TerrainReveal Collapsed-Lazy Wrapper (ACC-03)

**Component:** `TerrainReveal.tsx` ("use client")
- Default state: collapsed. Renders a `PremiumSurface variant="base"` header row with "Folder permission terrain" title, one-line subtitle, and a "Show" button (`data-testid="terrain-expand"`). No `<FolderPermissionTerrain>` mounted.
- On expand: mounts `<FolderPermissionTerrain initial={null} loadOverview={loadOverview} loadTerrain={loadTerrain} projects={projects} />`. The terrain's own `mode="overview"` effect fires `loadOverview()` — account-wide overview builds in ~1s (not 2-3s). Toggling collapse/expand re-mounts cleanly.
- `AccessAnalysisCharts.tsx`: replaced always-rendered `<FolderPermissionTerrain>` with `<TerrainReveal>`. Terrain stays full-width, outside the 2-up donut grid.

**Tests:** `TerrainReveal.test.tsx` — 3 passing tests:
1. Collapsed by default (no `data-testid="terrain-canvas"`)
2. Expand calls `loadOverview` (not `loadTerrain`)
3. Collapse hides terrain again

### Task 3: PremiumSurface + 2-Up Grid + Coverage Badges + KPI Guard

**PremiumSurface depth (ACC-01, VIS-01):**
- Every panel section wrapped in `<PremiumSurface variant="base">` — inner `panel-elevated` wrappers removed to prevent double-nesting
- Active-slice glow: `glow={!!sliceFilters.role}` on Role panel, `glow={!!sliceFilters.company}` on Company panel — card-level visual cue of what's driving the current filter

**2-up donut grid (ACC-02 layout):**
- Responsive `grid grid-cols-1 lg:grid-cols-2 gap-6` wrapping all 5 donuts: Role distribution, Users by company, Activity by role, Activity by company, Activity by module
- Timeline and TerrainReveal remain full-width (outside the grid)
- KPI StatStrip, ProjectPicker, PillBar stay full-width above the grid

**Activity coverage badges (NA-01):**
- `ActivityCoverageBadge` from 05-03 placed in the `SectionHeader` of 4 activity-derived panels: Activity over time (timeline), Activity by role, Activity by company, Activity by module
- `SectionHeader` gains an optional `badge?: ReactNode` slot for inline placement
- Membership donuts (Role distribution, Users by company) not badged — correct (membership data is not activity-derived)

**KPI no-reanimate guard (VIS-05):**
- `StatStrip` NOT keyed by filter values — filter changes update KPI numbers in-place without remounting
- `hasAnimatedKpi` ref (`useRef(false)`) guards any count-up animation to first mount only
- Documented: KPI entrance is mount-once; values update synchronously in place on filter change

## Checkpoint: Human Visual Verification (APPROVED)

**Approved by owner on 2026-06-19.** Owner rebuilt on an idle window, confirmed `next start` came up clean (Ready in 188ms), and responded: "YES I LIKE IT."

Verified behaviors confirmed by owner:
- Fast tiered paint — KPIs + donuts with shimmer skeletons, NOT a single page spinner
- 2.5D depth (PremiumSurface elevation visible across all panels)
- Cross-filter + pills working (click slice → others refocus, pill appears, clear works)
- Lazy terrain — starts collapsed ("Show"), expands to account-wide overview ~1s (no 2-3s freeze)
- Activity coverage badges on activity panels
- KPI no-reanimate on filter change
- `next start` Ready in 188ms — build is valid

## Verification Gates

- `npx tsc --noEmit`: exit 0
- `AccessAnalysisCharts.test.tsx`: 18/18 passing
- `page.test.tsx`: 2/2 passing
- `TerrainReveal.test.tsx`: 3/3 passing
- Pre-existing `FolderPermissionTerrain.test.tsx` failures: 2 of 13 unchanged (concurrent WIP on branch — not introduced by this plan)
- `next start` Ready in 188ms — valid build

## Requirements Delivered

| Requirement | Description | Status |
|-------------|-------------|--------|
| ACC-01 | PremiumSurface 2.5D depth + staggered reveal on every panel | DONE |
| ACC-03 | Terrain collapsed by default; expands to overview lazily | DONE |
| PERF-02 | Suspense tiers: KPIs+donuts fast path; terrain not blocking | DONE |
| PERF-05 | No new WebGL — depth via CSS/PremiumSurface only | DONE |
| VIS-01 | 2.5D depth + staggered entrance (Reveal already in place) | DONE |
| VIS-05 | KPI count animates only on first mount; no re-fire on filter change | DONE |
| NA-01 | Activity coverage badge on 4 activity-derived panels | DONE |
| INT-05 | Cross-filter pill bar wiring preserved from 05-02 (no regression) | DONE |

## Deviations from Plan

### Auto-fix: mainCharts.tsx extraction (Task 3)

- **Found during:** Task 3 (PremiumSurface + 2-up grid)
- **Issue:** Next.js requires that `page.tsx` export only specific named exports (`metadata`, `default`, `config`, `generateViewport`). The sub-tier RSC cannot be a named export in `page.tsx` without triggering build warnings. The `MainCharts` component (introduced in Task 1 to carry the 5 data loader awaits) needed to live in a separate module.
- **Fix:** Extracted `mainCharts.tsx` as a non-page RSC module. `page.tsx` imports `MainCharts` from `./mainCharts` and uses it as the Suspense-wrapped async component. `page.test.tsx` updated to import `MainCharts` from `./mainCharts` directly (bypasses the Suspense boundary in jsdom).
- **Files modified:** `mainCharts.tsx` (new), `page.tsx` (import), `page.test.tsx` (import path)
- **Commit:** a63a3297

### Pre-existing failures held (not fixed, not increased)

- `FolderPermissionTerrain.test.tsx`: 2 of 13 failures are pre-existing concurrent WIP on this branch. Task 2 was scoped to "not add new failures" — held at exactly 2. These are tracked as pre-existing and documented in Phase 02-01 decisions.

## Known Stubs

None. All 6 presentation features are wired to real data and components:
- Suspense tiers use real RSC data loaders
- TerrainReveal calls the real `loadOverview` server action
- PremiumSurface is the real primitive from 05-01 foundation
- ActivityCoverageBadge derives counts from real `ProjectCoverage[]` prop
- KPI values come from live `instanceView.summary`

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are presentation-layer only.

## Self-Check: PASSED

- `app/(dashboard)/access-analysis/page.tsx` — exists, contains `Suspense`, no `loadFolderPermissionTerrain` call
- `app/(dashboard)/access-analysis/mainCharts.tsx` — exists, exports `MainCharts`
- `app/(dashboard)/access-analysis/components/DonutSkeletons.tsx` — exists, contains `animate-shimmer`
- `app/(dashboard)/access-analysis/components/TerrainReveal.tsx` — exists, contains `loadOverview`
- `app/(dashboard)/access-analysis/__tests__/TerrainReveal.test.tsx` — exists, 3 tests
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — exists, contains `PremiumSurface`
- Commits 36106e2d, 2423398d, a63a3297 confirmed in git log
- Owner visual checkpoint approved 2026-06-19
