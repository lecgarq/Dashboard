# Roadmap: LECG Dashboard — Workshop-Grade UI/UX Overhaul

## Overview

A premium UI/UX overhaul of four existing pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) so the data looks, feels, and responds like a workshop showcase: fast, visually premium (2.5D depth — not flat), tactile, and explorable live. The stack is locked; this is presentation-layer surgery. The journey is foundation-first: ship the shared design language (depth/glow tokens, `PremiumSurface`, themed `EChart` wrapper, motion facade, slide-in `Sheet`) once so every page imports it. Then de-risk the largest structural liability — the 2,474-line `/users` monolith — by decomposing it behind a golden-path test before touching its visuals. Build the shared `DataTable` primitive once, then redesign the `/users` directory on it. With the foundation locked, the three per-page polish phases run in parallel. A pre-workshop UAT on a projector is the only valid acceptance test.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Shared Design Foundation** - Depth/glow tokens, `PremiumSurface`, themed `EChart`, motion facade, slide-in `Sheet` — every page imports this (completed 2026-06-17)
- [x] **Phase 2: /users Decomposition** - Break the 2,474-line monolith into a Zustand store + single data hook + sub-components behind a golden-path test (completed 2026-06-18)
- [x] **Phase 3: DataTable Primitive** - One virtualized `DataTable` (sort, sticky header, row-click, inline expand, density toggle) for the table pages (completed 2026-06-18)
- [x] **Phase 4: /users Table & Polish** - Premium clickable data-table directory, deferred heavy payload, header 3D accent, skeleton (completed 2026-06-18)
- [x] **Phase 5: /access-analysis Depth & Cross-Filtering** - Suspense tiers, depth/glow donuts, client-side cross-filtering, pill bar, lazy terrain (completed 2026-06-19)
- [ ] **Phase 6: /template-mty & /forma-proposal Polish** - Premium table + depth pies + graph drill; `HierarchyView` split + deferred d3 + 3D background accent
- [ ] **Phase 7: Pre-Workshop UAT** - Projector-brightness simulation, contrast/perf/motion/boundary gates across all 4 pages

## Phase Details

### Phase 1: Shared Design Foundation

**Goal**: A single shared design language exists — depth/glow/glass tokens, a card primitive, a theme-aware chart wrapper, a motion facade, and one slide-in detail panel — so every page phase imports it instead of reinventing styling.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, INT-01, VIS-06
**Success Criteria** (what must be TRUE):

  1. Depth/glow/glass design tokens live in `globals.css` and resolve in both light and dark (zinc) themes; no hardcoded hex needed in consuming TSX.
  2. A `PremiumSurface` card primitive renders base / float / glass / inset variants and can wrap any panel.
  3. A single shared `EChart` wrapper auto-applies the correct palette via `resolvedTheme` and remounts cleanly on theme switch (`key={resolvedTheme}`).
  4. A motion facade exposes reveal/stagger presets and zeroes durations under `prefers-reduced-motion` (verified via DevTools emulation).
  5. A single shared slide-in `Sheet` panel mounts and is importable as the one drill-target for all four pages; `npx tsc --noEmit` exits 0.

**Plans**: 6/6 plans complete

- [x] 01-01-PLAN.md — Add depth/glow/glass tokens + indigo/violet ambient glow to globals.css (FND-01) [wave 1]
- [x] 01-02-PLAN.md — Bump framer-motion to ^12.39.0 (VIS-06 prerequisite) [wave 1]
- [x] 01-03-PLAN.md — PremiumSurface card primitive: base/float/glass/inset + glow (FND-02) [wave 2]
- [x] 01-04-PLAN.md — Theme-aware EChart wrapper + echartsTheme palette (FND-03) [wave 2]
- [x] 01-05-PLAN.md — Motion facade: presets + useSafeVariants reduced-motion enforcement (FND-04, VIS-06) [wave 2]
- [x] 01-06-PLAN.md — DrillSheet shared right-slide ~480px shell (INT-01) [wave 3]

**UI hint**: yes

**Phase context / research note**: Standard patterns (token recipes, `EChart` wrapper, `motion.ts` facade fully specified in STACK.md + ARCHITECTURE.md) — no dedicated research-phase needed. Per-phase research should `npm run repo-map` then consult the dep graph and the `ast-grep` `react-use-effect` report to locate every chart's current `useTheme` call so the shared wrapper can replace them. `INT-01` builds the empty `Sheet` shell here (the drill *sources* are wired in the per-page phases). `VIS-06` lands the motion/3D *facade contract* and reduced-motion enforcement here; the actual R3F accents are placed on `/users` (Phase 4) and `/forma-proposal` (Phase 6). framer-motion is bumped to 12.39.0+ for the React 19 layout-animation fix.

### Phase 2: /users Decomposition

**Goal**: The `/users` monolith is decomposed into a Zustand store + single data hook + extracted sub-components, with all existing filter/sort/search/virtualization behavior unchanged — a refactor with zero user-visible change, guarded by a test.
**Depends on**: Phase 1
**Requirements**: USR-01, PERF-03
**Success Criteria** (what must be TRUE):

  1. A golden-path integration test (search → filter → click row → modal → close → filter unchanged) is written and passing BEFORE the first extraction.
  2. `UsersDirectoryClient.tsx` is reduced to a ~200-line orchestrator shell; search/filter/sort/viewMode live in a Zustand store and all tRPC queries in a single data hook.
  3. Existing filter, sort, search, and window-virtualization behavior is observably identical to before the refactor.
  4. Each tRPC endpoint is fetched at most once per `/users` load — shared query-key constants and matching `staleTime` eliminate the hydration-key cache-miss double-fetch; `npx tsc --noEmit` exits 0 and the full test count holds after every extraction step.

**Plans**: 5/6 plans executed

- [x] 02-01-PLAN.md — Install zustand + write the golden-path integration test, proven green on the monolith (USR-01, PERF-03) [wave 1]
- [x] 02-02-PLAN.md — Extract pure helpers + stateless display sub-components (directoryUtils, PersonDetailModal, DirectoryPills, DataCoverageStrip, CollapsibleGroup) (USR-01) [wave 2]
- [x] 02-03-PLAN.md — Extract PersonRow + PersonRowList with the virtualizer scroll-init hack verbatim (USR-01) [wave 3]
- [x] 02-04-PLAN.md — Create the Zustand store + migrate filter/search/sort/view/selectedEmail state (USR-01) [wave 4]
- [x] 02-05-PLAN.md — Single data hook + shared BULK_USERS_LEAN_INPUT prefetch/client constant (USR-01, PERF-03) [wave 5]
- [x] 02-06-PLAN.md — ActivityAuditPanel + filter bar extraction, ~200-line shell, projector zero-change sign-off (USR-01, PERF-03) [wave 6]

**UI hint**: yes

**Phase context / research note**: Highest structural risk; the Zustand + single-hook seam is the prerequisite for Phase 4. Standard patterns — decomposition strategy fully specified in ARCHITECTURE.md. Per-phase research should `npm run repo-map` and read the `dependency-graph` for `UsersDirectoryClient` before extraction, plus the `ast-grep` `fetch-calls` report to confirm the redundant-fetch surface (PERF-03 is owned here because the double-fetch lives in the `/users` data layer; run `npm run repo-map:check` after to ratchet against re-introduced fetches). `/users/spatial-graph` is strictly out of scope — verify `git diff --name-only` touches zero files under `users/access-analysis/`.

### Phase 3: DataTable Primitive

**Goal**: A reusable, virtualized `DataTable` primitive exists with sort, sticky header, row-click, inline row-expand, and density toggle — extracted once so the `/users` and `/template-mty` tables never diverge.
**Depends on**: Phase 1
**Requirements**: FND-05
**Success Criteria** (what must be TRUE):

  1. `@tanstack/react-table` v8 is installed and `@tanstack/react-virtual` is confirmed at v3 (upgrade from v2 if a peer-dep v2 is present — breaking API change).
  2. `components/ui/DataTable.tsx` renders a virtualized body with a sticky header, column sort, pinned column, `onRowClick`, inline row-expand, and a density toggle — typed with `ColumnDef<T>` generics.
  3. The primitive renders correctly in both light and dark themes and introduces no new WebGL context; `npx tsc --noEmit` exits 0.

**Plans**: 2/2 plans complete

- [x] 03-01-PLAN.md — Install @tanstack/react-table v8 + write the failing DataTable contract test suite (RED) (FND-05) [wave 1]
- [x] 03-02-PLAN.md — Implement components/ui/DataTable.tsx to GREEN: sort, glass sticky header, pinned column, accordion expand, density toggle, two-message empty state (FND-05) [wave 2]

**UI hint**: yes

**Phase context / research note**: Standard patterns — TanStack Table v8 + Virtual v3 well-documented. Isolated to `components/ui/DataTable.tsx`; depends only on Phase 1 (uses `PremiumSurface`/tokens for styling). Parallel-safe with Phase 5 but MUST precede Phase 4 and Phase 6's table work. Per-phase research: confirm the exact `@tanstack/react-virtual` version (`npm run repo-map` / dep graph) before installing to catch the v2→v3 break flagged in research.

### Phase 4: /users Table & Polish

**Goal**: The `/users` directory is a premium, clickable data-table presentation — fast to first paint, reduced initial payload, with one selective 3D accent confined to the page header (never the data region).
**Depends on**: Phase 2, Phase 3
**Requirements**: USR-02, PERF-01, PERF-04, INT-03, VIS-03, VIS-04
**Success Criteria** (what must be TRUE):

  1. The directory renders as a premium `DataTable`: pinned Name column, sticky frosted-glass header, sortable, density toggle, row-click → shared slide-in panel, row-expand → inline person summary (no full-page navigation).
  2. A skeleton/loading state appears within ~200ms of navigating to `/users`; content reveals with a staggered entrance under the motion budget (once per load).
  3. Initial client payload is reduced (heavy per-user data deferred until the detail panel opens) with no load-time regression vs. today.
  4. KPI / header numbers count up smoothly on first load; a subtle R3F particle accent renders only in the page header (`ssr:false`, `frameloop:demand`) and never on the data-table region.
  5. `npx tsc --noEmit` exits 0; the Network tab shows each tRPC endpoint called once per load.

**Plans**: 4/4 plans complete

- [x] 04-01-PLAN.md — DirectoryRow + buildDirectoryRows + 5 typed columns + PeekPanel (TDD) (USR-02, INT-03, PERF-04) [wave 1]
- [x] 04-02-PLAN.md — UserProfilePanel gains optional person chrome for the slide-in panel (Open Q1) (INT-03, USR-02) [wave 1]
- [x] 04-03-PLAN.md — Wire DataTable into the shell + DrillSheet migration + table skeleton + entrance fade + error/empty states (USR-02, INT-03, PERF-01, PERF-04, VIS-03) [wave 2]
- [x] 04-04-PLAN.md — Header KPI strip + count-up + R3F particle accent (install @react-three/fiber@9, CSS fallback) (VIS-04, USR-02) [wave 3]

**UI hint**: yes

**Phase context / research note**: Consumes the Phase 2 store/hook seam and the Phase 3 `DataTable`; not parallel with those, but parallel-safe with Phases 5 and 6 once both prerequisites land. WebGL is confined to the header region per Pitfall 1 (CSS 2.5D on the data table itself). Per-phase research: re-run `npm run repo-map:check` to confirm payload-deferral did not add fetches; verify GPU memory < 400MB for the header particle field in Chrome DevTools.

### Phase 5: /access-analysis Depth & Cross-Filtering

**Goal**: `/access-analysis` gains premium depth, progressive tiered loading, and the highest-impact differentiator — client-side cross-filtering where clicking one chart filters the others with zero new queries.
**Depends on**: Phase 1
**Requirements**: ACC-01, ACC-02, ACC-03, PERF-02, PERF-05, INT-02, INT-04, INT-05, VIS-01, VIS-02, VIS-05, THM-01, NA-01
**Success Criteria** (what must be TRUE):

  1. The first tier (KPIs + donuts) renders fast (~300ms target) with per-tier skeletons; the timeline and folder-permission terrain stream progressively instead of blocking on one `Promise.all`; the terrain is click-to-expand / lazy-loaded with no 2–3s first-interaction lag.
  2. All panels are wrapped in `PremiumSurface` with 2.5D depth and staggered reveal; donuts use the shared themed `EChart` wrapper with gradient fills, selected-segment glow, rounded segments, and `universalTransition` drill morphs — not flat, in both themes.
  3. Clicking a chart segment opens the relevant people in the shared slide-in panel AND cross-filters the other charts client-side (zero new queries); an active-filter pill bar shows current drill state with one-click dismiss.
  4. Drill/reveal motion is smooth and directional (≤200ms), fires only on mount/drill (never on filter change), and KPI numbers count up on first load; all data labels meet WCAG AA contrast at projector brightness in both themes (THM-01 verified here on the densest data surface).
  5. No new WebGL context is introduced (GPU < 400MB); each tRPC endpoint is fetched once; every new per-page metric passed a Prisma-schema feasibility gate (named model, stated coverage, no schema change) and under-covered sources (e.g. `AccActivity` 428/1,152) are labeled as such in the UI.

**Plans**: 5/5 plans complete

Plans:

- [x] 05-01-PLAN.md — Foundation: applySliceFilters helper + canonical EChart migration (6 charts, gradient/universalTransition) + AccActivity composite index + PillBar/ActivityCoverageBadge RED stubs [wave 1]
- [x] 05-02-PLAN.md — Cross-filter: sliceFilters state + PillBar + onSliceClick lift (4 donuts) + "View N people →" slide-in (INT-02/04/05, VIS-05) [wave 2]
- [x] 05-03-PLAN.md — ActivityCoverageBadge component + pure coverageCounts helper (NA-01) [wave 2]
- [x] 05-04-PLAN.md — Presentation surgery: Suspense tiers + PremiumSurface 2-up grid + lazy TerrainReveal + badge placement + KPI no-reanimate (ACC-01/03, PERF-02, VIS-01) [wave 3]
- [x] 05-05-PLAN.md — THM-01 WCAG AA chart-label contrast gate (automated + projector sign-off) [wave 4]

**UI hint**: yes

**Phase context / research note**: `/access-analysis` is the cleanest layout but the densest data surface — `THM-01` (light/dark + projector contrast parity) and `NA-01` (new-analytics feasibility gate) are owned here because this is where new analytics and the most data labels live. Parallel-safe with Phases 4 and 6 after Phase 1. Pitfalls in play: redundant fetching (Pitfall 2 — new panels consume RSC props / shared `FilterContext` only, never new `trpc.useQuery` for already-fetched data), WebGL on data pages (Pitfall 1 — depth via CSS/ECharts only), under-counting analytics (Pitfall 5). **Plan-time gate (not research-phase):** enumerate every proposed new metric's Prisma model + coverage before writing implementation tasks. Add the `AccActivity (email, projectId)` composite index here (not deferred). Per-phase research: `npm run repo-map` then consult `ast-grep-prisma-access.json` for the feasibility gate and the `fetch-calls` report for the redundant-fetch audit (`repo-map:check` ratchet after).

### Phase 6: /template-mty & /forma-proposal Polish

**Goal**: `/template-mty` and `/forma-proposal` reach the shared premium look — `/template-mty` gets the `DataTable`, depth pies, and a fixed graph drill; `/forma-proposal` gets its `HierarchyView` split with deferred d3 and one selective 3D background accent off the data.
**Depends on**: Phase 1, Phase 3
**Requirements**: TPL-01, TPL-02, TPL-03, FRM-01, FRM-02
**Success Criteria** (what must be TRUE):

  1. `/template-mty`'s members table uses the premium `DataTable` (sort + row-click → slide-in profile); all panels use `PremiumSurface` + staggered reveal + skeleton.
  2. `/template-mty` role pies use shared depth/glow theming; the role-similarity graph shows non-clipped hover labels and node-click → slide-in role members.
  3. `/forma-proposal`'s `HierarchyView` is split (layout hook + canvas render + thin shell) with its public API unchanged, and the heavy d3 bundle is deferred via `dynamic(ssr:false)`.
  4. `/forma-proposal` permission-editor panels use `PremiumSurface` depth and a selective real-3D background accent renders with `frameloop="demand"` and `pointer-events:none` (off the data region).
  5. Both pages are polished and legible in light and dark themes; `npx tsc --noEmit` exits 0 and no new WebGL context appears on a data surface.

**Plans**: 5 plans (3 waves)

Plans:
- [ ] 06-01-PLAN.md — /template-mty charts: loading.tsx + shared themed EChart swap + full donut treatment + PremiumSurface roots/empty-states (TPL-02, TPL-03) [wave 1]
- [ ] 06-02-PLAN.md — /forma-proposal HierarchyView split: useHierarchyLayout hook + HierarchyCanvas + thin shell, public API unchanged (FRM-01) [wave 1]
- [ ] 06-03-PLAN.md — /template-mty members table → premium DataTable (toolbar shell + 5 columns + row-click profile + test update) (TPL-01, TPL-03) [wave 2]
- [ ] 06-04-PLAN.md — /forma-proposal client wiring: dynamic(ssr:false) HierarchyView + skeleton + idle prefetch + FormaParticleAccent + PremiumSurface depth + loading.tsx (FRM-01, FRM-02) [wave 2]
- [ ] 06-05-PLAN.md — /template-mty role graph: settle-and-freeze + click-vs-drag + in-bounds label clamp + RoleOverviewSheet drill (TPL-02) [wave 3]

**UI hint**: yes

**Phase context / research note**: Depends on Phase 1 (foundation) and Phase 3 (`DataTable` for the `/template-mty` members table); parallel-safe with Phases 4 and 5. Mechanical work (PremiumSurface wiring + `HierarchyView` split). The Forma diff view is DEFERRED to v2 (needs a new `template.getBaseline(roleId)` tRPC query — out of this milestone). Pitfalls: WebGL competing with data panels (Pitfall 1 — the R3F accent is `frameloop:demand` + `pointer-events:none`, off the editor). Two independent page tracks run in parallel waves: /template-mty (06-01 → 06-03 → 06-05) and /forma-proposal (06-02 → 06-04); test-fixture updates land in the same plan as each migration so the suite is never left red. Per-phase research: `npm run repo-map` + dep graph for the `HierarchyView` split boundary; confirm GPU < 400MB for the background accent.

### Phase 7: Pre-Workshop UAT

**Goal**: All four pages pass a live-room projector simulation and the hard engineering gates — the only valid acceptance test for a workshop showcase.
**Depends on**: Phase 4, Phase 5, Phase 6
**Requirements**: (verification phase — exercises VIS-05, PERF-01..05, THM-01, INT-01..05 across all pages; introduces no new requirements)
**Success Criteria** (what must be TRUE):

  1. All 4 pages tested at 1280px on a secondary display at projector-reduced brightness — no horizontal overflow, no clipped modals, no invisible labels; WCAG AA contrast holds on all data values in both themes.
  2. Drill-down smoke passes across pages (role/activity donut → people, folder terrain expand, coordination panel, table row → panel); drill transitions are smooth/directional and motion fires only on mount/drill.
  3. `prefers-reduced-motion: reduce` (DevTools) leaves layout unchanged with animations disabled; the Network tab confirms each tRPC endpoint is called once per page load; GPU memory stays < 400MB.
  4. `npx tsc --noEmit` exits 0 including test files; `git diff --name-only` confirms zero `/users` work touched files under `users/access-analysis/` (spatial-graph boundary); a grep confirms no conditional `GraphCanvas` mount pattern was introduced.

**Plans**: TBD
**UI hint**: yes

**Phase context / research note**: Live-room projector simulation is the only valid acceptance test; runs last after all three polish phases. No new requirements — it is the cross-cutting verification gate (`VIS-05` drill-motion correctness and the negative-case boundary checks are asserted here in aggregate). Per-phase research: re-run `npm run repo-map:check` for a final regression ratchet (new fetch calls / effects) and the `router-push` report to confirm drills use the slide-in panel rather than full-page navigation.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

**Parallel-execution groups** (parallelization enabled):

- **Group A (sequential foundation):** Phase 1 → Phase 2 → Phase 3 (Phase 3 needs only Phase 1, but is grouped here as a shared prerequisite). Phase 2 and Phase 3 may themselves run in parallel after Phase 1 (Phase 2 = `/users` decomposition; Phase 3 = `DataTable`, independent).
- **Group B (parallel polish, after Group A):** Phase 4 (needs Phase 2 + Phase 3), Phase 5 (needs Phase 1 only — may start as early as Group A completes Phase 1), Phase 6 (needs Phase 1 + Phase 3) run in parallel — they share the foundation but do not depend on each other.
- **Group C (final gate):** Phase 7 runs alone after Phases 4, 5, and 6 all complete.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Design Foundation | 6/6 | Complete   | 2026-06-17 |
| 2. /users Decomposition | 6/6 | Complete   | 2026-06-18 |
| 3. DataTable Primitive | 2/2 | Complete   | 2026-06-18 |
| 4. /users Table & Polish | 4/4 | Complete   | 2026-06-18 |
| 5. /access-analysis Depth & Cross-Filtering | 5/5 | Complete   | 2026-06-19 |
| 6. /template-mty & /forma-proposal Polish | 0/5 | Planned | - |
| 7. Pre-Workshop UAT | 0/TBD | Not started | - |
