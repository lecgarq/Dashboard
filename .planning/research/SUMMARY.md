# Project Research Summary

**Project:** LECG Dashboard - Workshop-Grade UI/UX Overhaul (4 pages)
**Domain:** Brownfield Next.js 16 / React 19 BIM analytics dashboard - presentation layer surgery
**Researched:** 2026-06-17
**Confidence:** HIGH (architecture, pitfalls - direct codebase audit); MEDIUM (stack techniques)

---

## Executive Summary

This is a presentation-layer overhaul of four existing, functioning pages in a mature BIM management dashboard. The audience model is unusual: Luis is the sole operator; all other users watch on a projected screen during live workshops. Every design and implementation decision must serve live, exploratory storytelling in front of a room - not self-service analytics engagement. The north-star aesthetic (landonorris.com, igloo.inc, orano.group) translates to: premium 2.5D depth via CSS/glass techniques, tasteful motion under a hard budget, selective real-3D accents off the data pages, and light/dark parity that functions on a projector. The brief resolves this tension by using CSS + ECharts depth techniques for 95% of the premium feel and reserving WebGL for one or two contained hero moments on non-data pages only.

The recommended approach is foundation-first, then /users decomposition, then per-page polish in parallel. The shared design foundation (depth/glow CSS tokens, PremiumSurface primitive, centralized EChart wrapper with automatic theme injection, motion.ts facade) must ship first because every per-page phase depends on it. The /users monolith (2,474 lines, 6+ tRPC queries, no real table) is the largest structural risk and must be decomposed with a golden-path integration test before any visual work. Per-page polish for /access-analysis, /template-mty, and /forma-proposal can run in parallel after the foundation is locked.

The highest-impact differentiator is client-side cross-filtering (charts dim/highlight each other through a Zustand FilterContext, zero new queries). The highest risk is performance regression: the prior 77s OOM on /access-analysis was fixed via SQL GROUP-BY aggregation; any new panel that independently calls the same tRPC endpoints will re-introduce it. Every proposed new analytic must pass a Prisma-schema feasibility gate: AccActivity covers only 428/1,152 projects, no historical snapshot tables exist, and addedOn is missing from the membership feed.

---

## Key Findings

### Recommended Stack

The stack is locked - no framework changes. Key additions: @tanstack/react-table (v8) + @tanstack/react-virtual (v3) for the /users data table; @react-three/fiber@9 + @react-three/drei for selective real-3D hero accents (Three.js already in bundle via cosmos.gl, marginal cost ~60KB gzip). framer-motion updates to 12.39.0+ for the React 19 layout-animation flicker fix. echarts-gl is explicitly rejected.

**Core technologies (locked decisions):**

- **ECharts 6.1.0** - depth via LinearGradient/RadialGradient fills, itemStyle.shadowBlur glow on accent series, itemStyle.borderRadius:8 on donuts, universalTransition for drill-down morphs, selectedMode:single for segment glow. key={resolvedTheme} forces clean remount on theme change; centralized mergeEChartsTheme(option, dark) in a shared wrapper eliminates per-chart useTheme drift. No echarts-gl.
- **TanStack Table v8 + Virtual v3** - headless, Tailwind-native, spacer-based virtualization; replaces current react-window list in /users. Provides sort, column pinning, row expand, density toggle without MUI or AG Grid.
- **Framer Motion 12.39.0** - GPU-only animation rules enforced via central motion.ts facade: animate only x/y/scale/rotate/opacity (never width/height/top/left); viewport once:true on all scroll reveals; stagger cap 20 items; useReducedMotion enforced at facade level.
- **2.5D depth - pure Tailwind/CSS** - backdrop-blur-md, layered multi-shadow with inset catch-light (inset 0 1px 0 rgba(255,255,255,0.06)), ambient color blobs (CSS blur-3xl positioned divs, pointer-events none, zero runtime cost), gradient borders via p-px wrapper. No JavaScript involved.
- **Selective real-3D - @react-three/fiber@9 + drei** - dynamic ssr:false import, frameloop:demand, dpr=[1,1.5], pointer-events:none. Used only on /forma-proposal (distorted sphere background) and /users page header (subtle particle field, 200 points). Explicitly NOT on /access-analysis or /template-mty data pages.
- **Tailwind 4.3.0** - semantic CSS-var tokens auto-switch via CSS layer; depth tokens added to globals.css (--glow-primary, --depth-card, --depth-float, --glass-fill-dark/light, --gradient-border). No hardcoded hex in TSX.

### Expected Features

**Must have (table stakes):**

- Clickable chart segments to slide-in detail panel (shadcn Sheet, ~40% width, no backdrop that blacks the chart)
- Clickable table rows to inline expand showing person summary (no modal navigation)
- Sticky column headers + window-virtualized rows (TanStack Virtual)
- Active-filter / drill-state pill bar with one-click dismiss
- Skeleton loading states visible within 200ms on all 4 pages
- Light + dark both polished (zinc dark #09090B; ECharts reads resolvedTheme)
- Responsive layout at 1280px - no horizontal overflow, no clipped modals, no invisible labels on projector

**Should have (differentiators):**

- Cross-filtering - click role donut => activity timeline + module donut filter client-side, zero new queries. Highest-impact differentiator.
- Staggered reveal on page load - 60ms stagger between panels, total < 400ms, once per load only
- Smooth count-up KPI numbers on first load (Framer useMotionValue + useSpring)
- Donut selected-segment glow (selectedMode:single + itemStyle.shadowBlur) across all donut charts
- Spotlight / focus mode - sidebar collapse shortcut for full-screen projection
- Animated slide-in/slide-out on drill-path change (directional, 200ms ease-out)
- universalTransition donut to bar on drill-down (most cinematic ECharts effect)
- Column density toggle on /users table (CSS-var row height)

**Defer to own phase or v2:**

- Forma-proposal diff view (HIGH complexity, needs new tRPC query template.getBaseline(roleId), fully independent)
- Project-grouped persistent accordion in /access-analysis (current dropdown is functional)
- Role-similarity graph node drill in /template-mty
- /users/spatial-graph - explicitly out of scope; separate future project

### Architecture Approach

The overhaul is three-zone surgery: (1) shared design-language foundation, (2) /users monolith decomposition creating Zustand + single-hook seam, (3) per-page polish on top. Backend unchanged. Critical moves: split /access-analysis single Promise.all into Suspense tiers (Tier 1 fast ~300ms; Tier 3 terrain ~9s streams later); centralize EChart in components/ui/EChart.tsx with automatic mergeEChartsTheme; create motion.ts facade for automatic reduced-motion compliance.

**Major components (new/moved):**

1. `components/ui/PremiumSurface.tsx` - RSC-safe card primitive (base/float/glass/inset variants); replaces ad-hoc shadow patterns across all 4 pages
2. `components/ui/EChart.tsx` - moved from access-analysis/components/, auto-injects mergeEChartsTheme(option, dark), key={resolvedTheme}; every chart drops its own useTheme call
3. `components/ui/DataTable.tsx` - TanStack Table v8 + Virtual v3 wrapper; sticky header, sort, row expand, density toggle; used by /users and /template-mty
4. `components/ui/motion.ts` - Framer re-export + shared variant presets (fadeUp, fadeIn, stagger) + useSafeVariants hook zeroing durations when useReducedMotion is true
5. `lib/colors/echartsTheme.ts` - ECHARTS_DARK / ECHARTS_LIGHT palette constants; single source of truth for all chart colors
6. `users/useDirectoryStore.ts` - Zustand store for search/filter/sort/viewMode (extracted from 2,474-line monolith)
7. `users/useDirectoryData.ts` - all tRPC queries consolidated; fixes hydration-key cache-miss double-fetch via shared query key constants and matching staleTime

### Critical Pitfalls

1. **WebGL on data pages** - DuckDB-WASM + 5 ECharts canvases already fill the GPU budget; adding Three.js causes 2-5s tab freezes. Rule: CSS 2.5D on data pages, WebGL only on /forma-proposal header and /users page header region. Chrome DevTools GPU memory < 400MB gate.

2. **Redundant tRPC fetching via new panels** - the 77s OOM was fixed by SQL GROUP-BY; new panels that independently call bulkUsers/activityMix/permSummary re-introduce it. Rule: new panels consume RSC props or shared context only; never new trpc.useQuery for already-fetched data. Pre-ship: Network tab, each endpoint called once per load.

3. **next build TypeScript gate** - build typechecks test files; prop renames not reflected in __tests__/ block the :3000 deploy. Rule: npx tsc --noEmit is the mandatory last step before any npm run build. Every prop-shape change updates test fixtures in the same commit.

4. **UsersDirectoryClient split regression** - filter state, virtualization ref, and tRPC cache live implicitly inside the monolith. Rule: write golden-path integration test BEFORE first extraction; run npm test count after every extraction step.

5. **New analytics silently under-counting** - AccActivity covers 428/1,152 projects; no historical snapshot tables; addedOn missing. Rule: every proposed metric must pass schema feasibility gate (which model, what coverage, schema change needed?) before entering the roadmap.

6. **Over-animation in live workshops** - hard limits: page stagger 400ms total, panel slide-in 200ms, count-up 800ms, chart selection 150ms. Motion only on mount (once) and explicit drill-down reveals; never on filter changes.

7. **GraphCanvas always-mounted invariant** - conditional rendering destroys WebGL context; reinit takes 2-5s for 17k nodes. Rule: CSS class toggle only (opacity-0 pointer-events-none absolute inset-0); never conditional unmount of GraphCanvas.

---

## Implications for Roadmap

### Phase 1: Shared Design Foundation

**Rationale:** Every subsequent phase imports from the foundation. Building it first prevents per-phase reinvention and eliminates theming drift across all 8+ chart components.

**Delivers:**
- globals.css depth/glow/glass token additions (--glow-primary, --depth-card, --depth-float, --glass-fill-dark/light, --gradient-border)
- components/ui/PremiumSurface.tsx (base / float / glass / inset variants)
- components/ui/EChart.tsx (moved, theme-aware, mergeEChartsTheme automatic injection, key={resolvedTheme})
- lib/colors/echartsTheme.ts (ECHARTS_DARK / ECHARTS_LIGHT palettes)
- components/ui/motion.ts (Framer re-export, fadeUp/fadeIn/stagger presets, useSafeVariants reduced-motion hook)
- ModuleBadge.tsx moved to components/ui/
- framer-motion updated to 12.39.0+

**Avoids:** Light/dark parity breakage (Pitfall 3), over-animation without central enforcement (Pitfall 6)

**Research flag:** Standard patterns - no additional research needed.

---

### Phase 2: /users Decomposition

**Rationale:** Highest structural risk. The Zustand + single-hook seam produced here is a prerequisite for Phase 3-A and 3-B. The golden-path integration test is the regression guard for all future /users work.

**Delivers:**
- Golden-path integration test (search => filter => click row => modal => close => filter unchanged) written BEFORE extraction
- users/useDirectoryStore.ts - Zustand store for search/filter/sort/viewMode
- users/useDirectoryData.ts - single hook; shared query key constants fix hydration-key cache-miss double-fetch
- Extracted: PersonCard, PersonRow, PersonRowList, PersonDetailModal, ActivityAuditPanel, DirectoryToolbar, ActiveFilterStrip, DataCoverageStrip
- UsersDirectoryClient.tsx reduced to ~200-line orchestrator shell
- npx tsc --noEmit + npm test green after each extraction step

**Avoids:** Split regression (Pitfall 4), redundant fetching re-introduction (Pitfall 2)

**Research flag:** Standard patterns - decomposition strategy fully specified in ARCHITECTURE.md.

---

### Phase 3-A: DataTable Primitive (parallel-safe after Phase 2)

**Rationale:** Required before /users table redesign and /template-mty members table upgrade. Isolated to components/ui/DataTable.tsx.

**Delivers:**
- Install @tanstack/react-table v8; confirm @tanstack/react-virtual v3 (may be present as peer dep - check version; v2 to v3 is a breaking API change)
- components/ui/DataTable.tsx - sort, sticky header, row expand, density toggle, column pinning, onRowClick, virtualized body; typed with ColumnDef<T> generics

**Research flag:** Standard patterns - TanStack Table v8 API well-documented.

---

### Phase 3-B: /users Table + Polish (after Phase 2 + 3-A)

**Delivers:**
- Premium DataTable wired to useDirectoryData - pinned Name column, sticky frosted-glass header, row expand with AnimatePresence inline person summary
- Column density toggle (CSS-var row height)
- Staggered reveal on page load (60ms stagger, initial={false} on re-renders)
- h-full overflow-y-auto page root wrapping the shell
- Payload reduction: getOrgDirectory + getDirectory with select narrowing; enrichedUsers deferred to panel open (target < 3MB from 7-15MB)
- Subtle particle field on /users page header only (Three.js Points, 200 particles, ssr:false, frameloop:demand - NOT on the data table region)
- loading.tsx skeleton (toolbar row + 12 ghost cards / 20 ghost rows)

**Avoids:** WebGL on data table area, redundant fetching (Pitfall 2)

---

### Phase 3-C: /access-analysis Depth + Cross-Filtering (parallel-safe after Phase 1)

**Rationale:** /access-analysis is already the cleanest layout. Work here is depth/motion polish + Suspense tier split (fixes 9s blank screen) + cross-filtering (highest-impact differentiator, zero new queries).

**Delivers:**
- Suspense tier split: Tier 1 (KPIs + donuts, ~300ms), Tier 2 (timeline, ~1s), Tier 3 (terrain + coordination, lazy)
- loading.tsx skeletons per tier: KPIStripSkeleton, DonutRowSkeleton, TimelineSkeleton, TerrainSkeleton
- FilterContext (Zustand) - setRole() / setModule() / clear() dispatch
- Chart click handlers => FilterContext => other charts re-render with filtered client-side data (zero new queries)
- Active-filter pill bar with AnimatePresence appear/disappear
- All donut charts: selectedMode:single, shadowBlur glow, borderRadius:8, universalTransition drill morphs
- KPI count-up via useMotionValue + useSpring on first load
- ECharts option objects wrapped in useMemo (prevents flicker on parent re-renders)
- All panels wrapped in PremiumSurface primitives
- Gradient animated mesh behind KPI strip (CSS @keyframes, no WebGL)
- FolderPermissionTerrain behind click-to-expand lazy-load (eliminates 2-3s lag on first click)
- AccActivity composite index (email, projectId) added

**Analytics gate (before any new metric):** Confirm Prisma model, project coverage (428/1,152 or all?), no schema change required. Confirmed safe sources: AccRole, AccUser, AccActivity (428/1,152 - label as such in UI), AccFolderPermission, AccIssue, AccDcProjectUser.

**Avoids:** Redundant fetching (Pitfall 2), new analytics silently under-counting (Pitfall 7), WebGL on data pages (Pitfall 1)

**Research flag:** New analytics proposals need schema feasibility gate enumerated in the plan phase before implementation tasks are written.

---

### Phase 3-D: /template-mty + /forma-proposal Polish (parallel-safe after Phase 1 + 3-A)

**Delivers:**

/template-mty:
- Members table => DataTable with sort + row click => slide-in Sheet profile
- Role pie charts: selectedMode:single glow, borderRadius:8, universalTransition
- Role-similarity graph: hover floating labels (not clipped tooltip), node click => Sheet with role members
- All panels: PremiumSurface, staggered reveal on load, loading.tsx skeleton

/forma-proposal:
- HierarchyView split: useHierarchyLayout.ts (d3 computation, no rendering) + HierarchyCanvas.tsx (SVG render) + thin HierarchyView.tsx shell (public API unchanged)
- dynamic(() => import HierarchyCanvas, ssr:false) to defer d3 bundle
- PremiumSurface wrapping on permission editor panels
- Distorted sphere background blob (R3F MeshDistortMaterial, ssr:false, frameloop:demand, pointer-events:none)
- Diff view: DEFERRED (needs new tRPC query template.getBaseline(roleId), independent, HIGH complexity)

**Avoids:** Scope creep into spatial-graph code (Pitfall 10), WebGL competing with data panels (Pitfall 1)

---

### Phase 4: Pre-Workshop UAT

**Rationale:** Projector simulation is the only valid acceptance test for a workshop showcase.

**Delivers:**
- All 4 pages tested at 1280px on secondary display at projector-reduced brightness
- WCAG AA contrast on all data labels (foreground not muted-foreground for chart values)
- Drill-down smoke: role donut => people, activity donut => people, folder terrain expand, coordination panel
- prefers-reduced-motion:reduce DevTools check - layout unchanged, animations disabled
- Network tab: each tRPC endpoint called once per page load
- npx tsc --noEmit exits 0 including test files
- git diff --name-only for /users work confirms zero files under users/access-analysis/ (spatial-graph boundary)
- No conditional GraphCanvas mount pattern (grep check)

---

### Phase Ordering Rationale

- Foundation before everything - EChart wrapper, PremiumSurface, motion.ts imported by every page phase; building first eliminates per-phase reinvention and ensures theming consistency automatically.
- /users decomposition before /users polish - Zustand store and single-hook seam are prerequisites for DataTable wiring; attempting polish on the monolith creates merge conflicts and state debt.
- DataTable primitive before per-page table work - extracted once, prevents two separately-styled tables diverging immediately.
- Per-page phases 3-A through 3-D are parallel - share the foundation but do not depend on each other.
- UAT last - live-room projector simulation is the only valid acceptance test.

### Research Flags

Phases with standard patterns (skip dedicated research-phase):
- Phase 1 (Foundation): token patterns, EChart wrapper, motion facade fully specified in STACK.md + ARCHITECTURE.md
- Phase 2 (/users decomposition): extraction strategy fully specified; golden-path test is standard
- Phase 3-A (DataTable): TanStack Table v8 + Virtual v3 well-documented
- Phase 3-D: PremiumSurface wiring + HierarchyView split are mechanical

Phases needing feasibility gates during planning (plan-time gates, not research-phase):
- Phase 3-C analytics: every proposed new analytic needs schema feasibility gate enumerated in phase plan before implementation tasks are written.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | ECharts 6 depth techniques verified via official docs + release notes; TanStack Table v8 from docs; R3F v9 React 19 compat from official install guide. echarts-x/custom-segmented-doughnut maturity LOW - verify before Phase 3-C |
| Features | HIGH | Direct codebase audit of all 4 pages + owner constraints in PROJECT.md; anti-features validated against workshop context |
| Architecture | HIGH | Direct inspection of all 4 page components, existing globals.css, and incident history from MEMORY.md. Decomposition boundaries verified against line-number audit |
| Pitfalls | HIGH | All 10 pitfalls derive from real incidents documented in MEMORY.md and CONCERNS.md - not hypothetical |

**Overall confidence:** HIGH for build order and structural decisions; MEDIUM for precise ECharts 6 API params (verify during Phase 1 execution).

### Gaps to Address

- @echarts-x/custom-segmented-doughnut maturity: one npm source confirmed; verify before adopting for KPI rings in Phase 3-C. Fallback: standard donut with borderRadius:8 - equally premium.
- @tanstack/react-virtual version: may already be installed as peer dep of react-query. Confirm exact version before Phase 3-A; if v2 is present, upgrade to v3 (breaking API change).
- AccActivity composite index: (email, projectId) missing - 218ms+ GROUP-BY at 623k rows. Add in Phase 3-C, not deferred.
- Forma-proposal diff view: when planned, confirm AccRole has a stable baseline snapshot before committing to the query design.

---

## Sources

### Primary (HIGH confidence - direct codebase audit)
- C:/LECG/Dashboard/.planning/codebase/CONCERNS.md - performance bottlenecks, fragile invariants, known bugs
- C:/LECG/Dashboard/.planning/codebase/TESTING.md - test framework, vitest patterns, e2e setup
- C:/LECG/Dashboard/.planning/PROJECT.md - constraints, requirements, theming conventions, design references
- C:/LECG/Dashboard/.planning/codebase/ARCHITECTURE.md - page structure, RSC patterns, component boundaries
- MEMORY.md incident history - 77s OOM fix, hydration cache miss, layout thrash, GraphCanvas destroy

### Secondary (MEDIUM confidence - official docs)
- ECharts 6 Features + 5.2/5.3 Release Notes - universalTransition, borderRadius, dynamic theme
- TanStack Virtual v3 docs - useVirtualizer API, spacer-based pattern
- Motion/Framer Motion v12 changelog - React 19 layout animation fixes in 12.39.0
- React Three Fiber v9 installation guide - React 19 requirement confirmed

### Tertiary (LOW confidence - single source or inference)
- @echarts-x/custom-segmented-doughnut npm page - existence confirmed, maturity unverified
- TanStack Table v8 virtualized rows - community blog pattern (verify against official example)
- Glassmorphism Tailwind class recipes - community sources

---

*Research completed: 2026-06-17*
*Ready for roadmap: yes*
