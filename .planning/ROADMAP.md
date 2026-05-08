# Roadmap: LECG Dashboard — v1.0 ACC Users Graph

## Overview

This milestone completes and hardens an ACC Users Graph module that is already ~80% built. The work proceeds in four phases: first stabilizing the foundation so production deployments are reliable, then adding the Cosmos.gl GPU renderer on top of that stable base, then polishing the graph UI gaps, and finally delivering the access analysis and export capabilities that make the tool actionable for project managers and BIM coordinators.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases: Created via `/gsd:insert-phase` if urgent work arises mid-milestone

- [x] **Phase 1: Foundation** - Harden production stability, renderer lifecycle, and data safety before adding new features
- [x] **Phase 2: Cosmos.gl Renderer** - Implement GPU-accelerated CosmosGraphRenderer for 500+ node performance with live physics controls
- [x] **Phase 2.5: ACC Data + Filter Refinement** - Extract `companyRole` from ACC, date-range filter, module on/off toggle filters with hide-on-filter
- [x] **Phase 3: Graph UI Completion** - Close the remaining UI gaps: zoom-level labels, physics auto-pause, and panel layout
- [x] **Phase 4: ACC Access Analysis Dashboard** - Single-page analytics dashboard for ACC access — junk/duplicate/outlier role detection, active-user tiers, Workspace↔ACC coverage, entitlement matrix, recommendations with drill-down, CSV-per-widget, drag-reorderable grid

## Phase Details

### Phase 1: Foundation
**Goal**: The graph module works correctly in production — not just dev — with no blank canvas after navigation, safe hub ID handling, and validated position data
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Running `npm run build && npm start` and visiting the graph page loads the canvas with nodes — no spinner hanging, no 404 on the worker script, no silent blank canvas
  2. A user who navigates away from `/users` and returns five times sees a working graph every time — DevTools shows no accumulating WebGL contexts
  3. Any new ACC Admin API endpoint added to `users.ts` that uses `getAccountId(db)` receives a bare UUID — no developer has to remember to strip the `b.` prefix manually
  4. When the graph position cache contains NaN or Infinity values, the application shows a "Rebuild Cache" prompt rather than rendering all nodes at the top-left corner or crashing the physics worker
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Extract getAccountId hub ID helper (FOUND-03)
- [x] 01-02-PLAN.md — Renderer lifecycle fix + cache corruption banner (FOUND-02, FOUND-04)
- [x] 01-03-PLAN.md — Navigation state persistence + loading timeout + API error recovery
- [x] 01-04-PLAN.md — Production build verification + human checkpoint (FOUND-01)

### Phase 2: Cosmos.gl Renderer
**Goal**: Users on 500+ node graphs can switch to a GPU-accelerated renderer and tune the physics simulation in real time; users on browsers without WebGL2 still get the Canvas 2D fallback
**Depends on**: Phase 1
**Requirements**: REND-01, REND-02 (deferred to TD-006), REND-03, REND-04
**Success Criteria** (what must be TRUE):
  1. A user with a large hub (500+ nodes) can click a renderer toggle and see the graph re-render via Cosmos.gl GPU instancing without a page reload
  2. A user can drag sliders for repulsion, link spring, and gravity and observe the graph layout shift in real time — changes take effect without restarting the simulation
  3. User nodes, Project nodes, Role nodes, and Module nodes are visually distinct in the Cosmos.gl renderer — four different colors, and edges have weight/color variation by relationship type
  4. A user on a browser that does not support WebGL2 still sees the Canvas 2D graph rendering correctly — no error screen, no empty canvas
**Plans**: 6 plans

Plans:
- [x] 02-01-PLAN.md — Install @cosmos.gl/graph, create cosmosUtils helpers, implement CosmosGraphRenderer class (REND-01, REND-03, REND-04)
- [x] 02-02-PLAN.md — D3-force worker + Cosmos GPU renderer + 2-slider UI + dedicated GPU hint (REND-01, REND-02, REND-03, REND-04)
- [x] 02-03-PLAN.md — Edge-render-during-drag fix, aggressive layout, animated cluster transition, same-username highlight, GPU perf HUD (deliverables per spec; production-scale capacity gap → 02-05)
- [x] 02-04-PLAN.md — Lasso/polygon multi-select with side panel summary (TD-007 logged: Canvas2D removal)
- [x] 02-05-PLAN.md — Cosmos native GPU physics swap — closes TD-005 (25k-node hub interactive)
- [x] 02-06-PLAN.md — Gap-closure: remove always-on [02-05-DEBUG] logs from graphRenderers.ts; reconcile REND-02 → Deferred (TD-006) and REND-04 acceptance note across REQUIREMENTS.md + ROADMAP.md

### Phase 2.5: ACC Data + Filter Refinement
**Goal**: Filter UI hides non-matching nodes from the canvas; ACC `companyRole` is extracted and available for filtering and display; date-range filtering works as a from-to range; module filters behave as on/off toggles where all-on shows everything and toggling off filters out
**Depends on**: Phase 2
**Requirements**: DATA-01, FILT-01, FILT-02, FILT-03
**Success Criteria** (what must be TRUE):
  1. Each ACC user record contains a `companyRole` field extracted from the ACC Admin API; it appears in the side panel and is usable as a filter dimension
  2. When a filter rule excludes a user, that user's node is removed from the visible graph (not greyed-out — fully hidden); edges to hidden nodes are also hidden
  3. The date filter exposes two inputs (`from` and `to`) and matches users whose relevant date falls inside that inclusive range
  4. The module filter renders one on/off toggle per module; with all toggles on, every user is visible; toggling a module off filters out users whose access intersects only that module
**Plans**: 6 plans

Plans:
- [x] 02.5-01-PLAN.md — Extract companyRole + lastSignIn from ACC API; surface through snapshot pipeline + SimNode (DATA-01)
- [x] 02.5-02-PLAN.md — Rewrite GraphFilters/nodeMatchesFilters with new semantics, recursive cascade, URL persistence, drag-defer, Vitest coverage (FILT-01, FILT-02, FILT-03)
- [x] 02.5-03-PLAN.md — Cosmos zero-size hide + edge-skip in both renderers, 150ms CSS fade, Company Role side-panel row (FILT-01, DATA-01)
- [x] 02.5-04-PLAN.md — Filter UI overhaul: date inputs, module toggles, companyRole multi-select, count header, empty-state, Clear-all + human-verify (FILT-02, FILT-03, DATA-01)
- [x] 02.5-05-PLAN.md — Gap closure: instrument + fix FILT-01 renderer hide (canvas not responding to filter changes); human re-verify (FILT-01)
- [x] 02.5-06-PLAN.md — Gap closure: companyRole dropdown, module toggle ON/OFF affordance, count/Clear-all/empty-state visual weight (DATA-01, FILT-03, FILT-02)

### Phase 3: Graph UI Completion
**Goal**: The graph UI has no remaining polish gaps — labels appear at the right zoom level, the physics simulation signals when it has settled, and the filter and detail panels do not fight for screen space on smaller monitors
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. When zoomed in close to a cluster, node labels appear legibly; when zoomed out to full-graph overview, no label text clutters the view — the transition happens at a consistent zoom threshold
  2. After the graph has been running for several seconds without interaction, a "Stable" badge appears in the UI and the physics worker drops to near-zero CPU usage — the badge disappears if the user drags a node and triggers new simulation
  3. On a 1280px wide screen (a common laptop resolution), the filter panel and the node detail side panel are both accessible simultaneously without one hiding the other
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — Zoom-threshold node labels in CanvasGraphRenderer (UI-01)
- [x] 03-02-PLAN.md — Stable badge with sustained-time stability detection + reheat wiring (UI-02)
- [x] 03-03-PLAN.md — Panel layout restructure (flex siblings, collapsible filter, auto-collapse) + phase human-verify (UI-03)
- [x] 03-04-PLAN.md — Gap closure: Cosmos label rendering overlay (UI-01 — closes UAT gaps 1, 2, 3)
- [x] 03-05-PLAN.md — Gap closure: Cosmos stability detection wiring (UI-02 — closes UAT gap 4)

### Phase 4: ACC Access Analysis Dashboard
**Goal**: Project managers see ACC access decision-support insights — junk/duplicate/outlier roles, active-user tiers, Workspace↔ACC coverage, entitlement matrix, recently-added members — in a single drag-reorderable dashboard with per-widget CSV export and drill-down side panel
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, DASH-12, DASH-13
**Note**: Replaces original ANAL-01..04 scope (graph-overlay flagging + PNG/CSV from graph). See `.planning/phases/04-access-analysis/04-CONTEXT.md` for the scope-replacement decision.
**Success Criteria** (what must be TRUE):
  1. Opening the ACC Access Analysis Dashboard page shows a 2-column widget grid with Coverage donut + Active-user tier breakdown above the fold and KPI strip / Recommendations / Roles × Modules matrix / Outlier combinations / Recently-added / Admin-access widgets below — all on one page (DASH-13)
  2. The Recommendations widget surfaces junk roles tiered HIGH/MEDIUM/LOW (zero members + zero modules + all-inactive-90d signals) and duplicate-role pairs (identical modules + ≥80% name token overlap), and roles flagged as findings carry inline severity badges wherever else they appear on the dashboard (DASH-01, DASH-02, DASH-09)
  3. Clicking any finding (junk/duplicate/outlier/recommendation) opens a right-side drill-down panel showing affected members, modules, projects, suggested action, and raw data without navigating away from the dashboard (DASH-10)
  4. The Coverage donut renders three segments — `In both` / `In Workspace, missing from ACC` / `In ACC, missing from Workspace` — by comparing Google Workspace directory against ACC members by email (DASH-07)
  5. The Active-user tier widget shows a stacked bar across 7d / 30d / 90d / >90d / never-signed-in buckets driven by `lastSignIn`; the Unusual Access Patterns widget surfaces module sets held by <5% of members; the Recently-added widget exposes a 7d/30d/90d toggle (default 30d) (DASH-04, DASH-03, DASH-06)
  6. The Admin-access widget lists ONLY ACC account-level admins (project admins and shadow admins excluded); the Roles × Modules entitlement heatmap renders full-width covering the entire organization (DASH-05, DASH-08)
  7. Every chart/table widget exposes a "Download CSV" button that exports the data currently displayed; the recommendations widget CSV uses columns `Type, Severity, Roles, Members, Modules, SuggestedAction` (DASH-11)
  8. The user can drag-reorder dashboard widgets and the chosen order persists across page reloads (DASH-12)
**Plans**: 8 plans

Plans:
- [x] 04-01-PLAN.md — Wave 0: Plumb isAccountAdmin end-to-end (DASH-07)
- [x] 04-02-PLAN.md — Wave 0: Plumb addedOn (member join date) end-to-end (DASH-06)
- [x] 04-03-PLAN.md — TDD: Pure analytics modules — junk/duplicate/outlier/tiers/nameSim with Vitest (DASH-02, DASH-03, DASH-04, DASH-05, DASH-09)
- [x] 04-04-PLAN.md — Workspace People API tRPC router (DASH-01)
- [x] 04-05-PLAN.md — Dashboard shell + dnd-kit grid + CSV helper + widget order localStorage (DASH-11, DASH-12, DASH-13)
- [x] 04-06-PLAN.md — Above-fold widgets: Coverage donut + Active tiers + Roles×Modules heatmap (DASH-01, DASH-02, DASH-08)
- [x] 04-07-PLAN.md — Findings widgets: KPI strip + Recommendations + Outliers + Role flow + Recently-added + Admins (DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-09, DASH-13)
- [x] 04-08-PLAN.md — Drill-down side panel + inline severity badges + Phase 4 UAT (DASH-09, DASH-10, DASH-13)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-28 |
| 2. Cosmos.gl Renderer | 6/6 | Complete | 2026-04-29 |
| 2.5. ACC Data + Filter Refinement | 6/6 | Complete | 2026-05-06 |
| 3. Graph UI Completion | 5/5 | Complete | 2026-05-07 |
| 4. Access Analysis | 8/8 | Complete | 2026-05-08 |

### Phase 04.1: Access Analysis tab — replace lists with astonishing, interactive graphics only (no name-list widgets) (INSERTED)

**Goal:** Replace the four name-list / table widgets in the Access Analysis dashboard (Recommendations, Outliers, RecentlyAdded, AdminAccess) with interactive SVG + d3-hierarchy + framer-motion graphics that match the cosmos.gl graph aesthetic; member identities exit the canvas and live exclusively in the existing DashboardSidePanel and CSV exports
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, DASH-13 (re-skin only — capabilities unchanged)
**Depends on:** Phase 4
**Plans:** 4 plans

Plans:
- [ ] 04.1-01-PLAN.md — Wave 0: shared tokens + skeleton primitives + selectionContext extensions (admin/day kinds + reconciliation) + DashboardSidePanel switch updates + d3 deps
- [ ] 04.1-02-PLAN.md — Wave 1: Rewrite RecommendationsWidget (severity bubble cluster) + OutlierCombosWidget (squarified treemap)
- [ ] 04.1-03-PLAN.md — Wave 1: Rewrite RecentlyAddedWidget (90-day calendar heatmap) + AdminAccessWidget (orbit constellation)
- [ ] 04.1-04-PLAN.md — Wave 2: Polish pass on existing 5 graphical widgets (token unification + spotlight) + Phase 4.1 human-verify
