---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-08T22:40:10.112Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 33
  completed_plans: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** Project teams can monitor and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 04.1 (Access Analysis tab — replace lists with astonishing graphics) — IN PROGRESS
Plan: 04.1-02 — COMPLETE 2026-05-08. Wave 2 RecommendationsWidget (severity bubble cluster, d3 pack + framer-motion) and OutlierCombosWidget (squarified treemap, d3 treemap + interpolateOranges reversed domain) rewritten — zero <table>/<ul>/<li>/member-name DOM; click dispatches setSelected({kind:junk|duplicate|outlier}) into existing DashboardSidePanel; CSV downloads preserved (DASH-13 column order intact for recommendations); widgetRegistry IDs/spans untouched (drag-order localStorage survives). Sibling 04.1-03 already landed in parallel (RecentlyAdded calendar + AdminAccess constellation, commits fae0a11, 72df67d). tsc green. See 04.1-02-SUMMARY.md.
Status: Phase 04.1 — 3/4 plans complete (04.1-01, 04.1-02, 04.1-03). 04.1-04 queued (final wave widget polish).
Last activity: 2026-05-08 — Completed 04.1-02 (commits e1a693a, a7f1cfe).
Prior phase: Phase 04 — 8/8 plans complete; UAT 16/16 PASSED 2026-05-08.

Progress: [██████████] 100% (33/33 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 8 | 1 tasks | 1 files |
| Phase 02-cosmos-gl-renderer P06 | 12min | 2 tasks | 3 files |
| Phase 02.5-acc-data-filter-refinement P03 | 12min | 2 tasks | 4 files |
| Phase 02.5 P02 | 7m 37s | 3 tasks | 3 files |
| Phase 03-graph-ui-completion P01 | 8m | 3 tasks | 2 files |
| Phase 03-graph-ui-completion P02 | 6 min | 3 tasks | 1 files |
| Phase 03-graph-ui-completion P05 | 2min | 3 tasks | 1 files |
| Phase 03-graph-ui-completion P04 | 4min | 3 tasks | 2 files |
| Phase 04-access-analysis P04 | 3min | 2 tasks | 2 files |
| Phase 04-access-analysis P03 | 4m 52s | 6 tasks | 6 files |
| Phase 04-access-analysis P01 | 5min | 3 tasks | 5 files |
| Phase 04-access-analysis P02 | 3min | 3 tasks | 6 files |
| Phase 04-access-analysis P05 | 5min | 3 tasks | 8 files |
| Phase 04-access-analysis P06 | 10min | 3 tasks | 5 files |
| Phase 04-access-analysis P07 | 7min | 3 tasks | 9 files |
| Phase 04-access-analysis P08 | 25min | 3 tasks | 7 files |
| Phase 04.1 P01 | 4m | 3 tasks | 8 files |
| Phase 04.1 P03 | 12m | 2 tasks | 2 files |
| Phase 04.1 P02 | 8m | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Milestone start: Module is ~80% built — this milestone is completion and hardening, not greenfield
- Phase 1 priority: Pitfall mitigations (production worker build, renderer destroy, `b.` strip, position sanitization) go first so all later phases build on a verified base
- Cosmos.gl chosen: `WebGpuGraphRenderer` stub replaced by `CosmosGraphRenderer` implementing the existing `GraphRenderer` interface; Canvas 2D remains as fallback (REND-04)
- Stack context: Stack is stable post-Core-Dependency-Update (npm 11, tRPC 11, TypeScript 6, Vitest harness); APS SDK already integrated
- [Phase 01-foundation]: Used db: any for getAccountId parameter (matches rebuildAccGraphCache pattern) — no PrismaClient import needed
- [Phase 01-foundation]: All ACC Admin API mutations must call await getAccountId(ctx.db) — pattern established in FOUND-03
- [Phase 01-foundation P02]: positionCacheCorrupt state initialized from localStorage — banner persists across page reloads without server round-trip
- [Phase 01-foundation P02]: Detection block placed in data useEffect after readPrecomputedPositions — re-detection runs automatically on refetch so clearing happens only when positions are confirmed valid
- [Phase 01-foundation P03]: loadSavedView() placed at module scope (not inside component) because useRef does not support lazy initialization like useState
- [Phase 01-foundation P03]: Saved view (acc-graph-view) discarded via localStorage.removeItem when dataHash changes — auto-fit runs for new data instead of restoring stale pan/zoom
- [Phase 01-foundation P03]: API error overlay rendered before loading overlay in JSX to establish correct z-50 stacking priority
- [Phase 01-foundation P04]: next.config.ts left unchanged — Next.js 16 webpack 5 natively handles new Worker(new URL(..., import.meta.url)) without workerPublicPath or worker-loader
- [Phase 01-foundation P04]: localStorage view key (acc-graph-view) discards saved view when dataHash mismatches — auto-fit runs for new data instead of restoring stale pan/zoom (fix 637a228)
- [Phase 02-cosmos-gl P01]: @cosmos.gl/graph@3.0.0-beta.8 (beta) pinned exactly — plan specified this over v2.6.1 stable
- [Phase 02-cosmos-gl P01]: selectNode() uses v3 selectPointByIndex/unselectPoints API — highlightedPointIndices does not exist in v3
- [Phase 02-cosmos-gl P01]: GraphRenderNode.kind expanded to user|project|role|module for Phase 2 multi-type node support
- [Phase 02-cosmos-gl P03]: Closed TD-002 by extending powerPreference patch lifetime past graph.ready and first render (commit 68aa1c7)
- [Phase 02-cosmos-gl P03]: Logged TD-005 — d3-force CPU physics caps ~2k nodes; production ACC hub has 25,602 nodes (287 ms tick); resolution path = plan 02-05 (Cosmos native GPU physics swap)
- [Phase 02-cosmos-gl P03]: Same-username highlight uses GraphRenderNode.id equality — revisit if Phase 2.5 introduces separate identity vs instance ids
- [Phase 02-cosmos-gl P03]: 02-03 deliverables verified per 500-node spec; 25k-node capacity gap is NOT a 02-03 regression — gap stems from physics engine choice in 02-02
- [Phase 02-cosmos-gl P05]: TD-005 closed by adopting Cosmos native GPU force layout; d3-force worker retained as Canvas2D fallback (engine swap, not loop optimization)
- [Phase 02-cosmos-gl P05]: Cosmos.gl API traps documented (start vs render, setConfig vs setConfigPartial, sim run-flag re-arm) — see 02-05-SUMMARY.md "Three Cosmos.gl API Traps"
- [Phase 02-cosmos-gl P05]: Slider feel refinement (TD-006) deferred per user — approved 02-05 with explicit note that further tuning is wanted but non-blocking
- [Phase 02-cosmos-gl-renderer P04]: Lasso uses screen-space polygon + forward-project nodes (NOT inverse-view-transform on polygon) — robust across Canvas2D and Cosmos GPU-physics renderers; bug surfaced when Cosmos getPointPositions() became the source of truth post-02-05
- [Phase 02-cosmos-gl-renderer P04]: TD-007 logged: Canvas2D rendering branch + dual-path forward-projection scaffolding now vestigial — Cosmos/GPU is the only production path; defer removal to standalone plan that also deprecates REND-04
- [Phase 02-cosmos-gl-renderer]: [Phase 02-cosmos-gl P06] Removed all unconditional [02-05-DEBUG] logs from graphRenderers.ts; gated peers in AccUsersGraph.tsx preserved
- [Phase 02-cosmos-gl-renderer]: [Phase 02-cosmos-gl P06] REND-02 reconciled to Deferred (TD-006); REND-04 carries Firefox-WebGL2 acceptance note; Phase 2 rollup stays [x] Complete
- [Phase 02.5-acc-data-filter P01]: companyRole and lastSignIn use string|null (not optional) on AccGraphInstanceNode — every instance node always has the field, matches lastAddedBucket style
- [Phase 02.5-acc-data-filter P01]: lastSignIn alias covers three variants: last_sign_in||last_activity||lastSignIn — field names unverified live; diagnostic log will confirm on next sync
- [Phase 02.5-acc-data-filter-refinement]: setVisibleIndices identity-caches the last Set reference to skip redundant GPU uploads on steady-state redraws
- [Phase 02.5-acc-data-filter-refinement]: BulkAccUser.companyRole added as optional field; AccUserSidePanel shows Unspecified when undefined or null — API population deferred
- [Phase 02.5]: nodeMatchesFilters extracted to accGraphFilters.ts (pure module) — AccUsersGraph.tsx use client prevents direct Vitest import
- [Phase 02.5]: URL param keys: roles, moff (disabledModules), croles (companyRoles), from, to, admin — lastAddedBuckets excluded (volatile derived state)
- [Phase 02.5]: page.tsx Suspense wrapper already present pre-02.5-02 — no change needed for useSearchParams
- [Phase 03-graph-ui-completion]: P01: Canvas2D late-zoom label pass uses fitScale*2.0/3.5 fade band, degree-priority, 200-cap, hover/select override; Cosmos persistent labels deferred (Open Q1)
- [Phase 03-graph-ui-completion]: P02: UI-02 stability badge — STABLE_THRESHOLD=0.0001, STABLE_DURATION_MS=500, Cosmos alpha<0.005 + !isSimulationRunning; dual-path detection (tick-driven Canvas2D + 100ms poll Cosmos); resetStability wired to drag/filter/select; pan/zoom NOT wired; worker NOT terminated; lasso polygon-select intentionally not wired (multi-select UX, not pick-a-node)
- [Phase 03-graph-ui-completion]: P05: cosmosReady boolean state promotes async renderer-init to React state; added to Cosmos stability polling effect deps so it re-runs after CosmosGraphRenderer.create().then() resolves; closes UAT gap 4 (Stable badge on Cosmos GPU renderer)
- [Phase 03-graph-ui-completion]: P04: Cosmos label overlay (UI-01 gap closure) — sibling 2D canvas above Cosmos GL canvas with pointer-events-none; CosmosGraphRenderer.drawLabelOverlay reuses 03-01 fade-band/AABB/200-cap/override pipeline; world->screen via Graph.spaceToScreenPosition; fade band in zoom-level units (2.0..3.5) via Graph.getZoomLevel public API; legacy hoverLabelRef DOM element removed entirely (subsumed by labelOverrideIndices)
- [Phase 04-access-analysis]: P04: workspaceRouter.getDirectory uses already-granted directory.readonly scope; module-level Map cache 1h TTL; sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE; non-Workspace users get { emails: [] } via 400/FAILED_PRECONDITION mapping; PRECONDITION_FAILED/FORBIDDEN typed errors for UI
- [Phase 04-access-analysis]: P04: Plan referenced server/routers/_app.ts; project app router lives at server/routers/root.ts (Rule 3 deviation, registered there)
- [Phase 04-access-analysis]: Plan 04-03: zeroMembers signal proxied via user.allRoles minus project assignments; real role catalog deferred
- [Phase 04-access-analysis]: Plan 04-03: roleSeverityIndex max rule HIGH>MEDIUM>LOW; duplicate-flagged roles contribute MEDIUM
- [Phase 04-access-analysis]: Plan 04-03: duplicate detection compares role-aggregate module sets (union across projects); per-instance comparison deferred
- [Phase 04-access-analysis]: P01: ACC account-admin = HQ v1 user.role === 'account_admin' (verified via scraped APS docs); BulkAccUser.isAccountAdmin non-optional boolean; written by bulkAccSync into accMemberCache.data JSON (no Prisma migration); default-false for legacy cache rows in bulkAccSummary; distinct from per-project accessLevels.projectAdmin AND from HQ v1 service-level role='project_admin'
- [Phase 04-access-analysis]: P02: ACC member-creation date = HQ v1 user.created_at (verified via scraped APS docs); BulkAccUser.addedOn non-optional string|null; bulkAccSync normalizes (Date.parse->toISOString, null on parse failure) at write boundary; default-null fallback for legacy cache rows in bulkAccSummary; Path A (no first-seen-in-cache fallback needed)
- [Phase 04-access-analysis]: P05: Locked widget registry contract published — WIDGETS (9 ids: coverage/tiers/kpi/recommendations/heatmap/outliers/flow/recent/admins) + DEFAULT_ORDER + WIDGET_ORDER_STORAGE_KEY='acc-dashboard-widget-order'. Downstream widget plans (04-06/04-07/04-08) replace WIDGETS[id].component per id without renaming id, title, or span.
- [Phase 04-access-analysis]: P05: useWidgetOrder validates stored localStorage on every mount (parse → array-of-strings → known-id check → coverage check); falling any check returns DEFAULT_ORDER without throwing — adding a NEW WIDGETS entry never orphans stored arrays.
- [Phase 04-access-analysis]: P05: Per-file '// @vitest-environment jsdom' directive instead of switching global env — preserves node default for analytics tests committed in 04-03; jsdom + @testing-library/react added as devDeps.
- [Phase 04-access-analysis]: P06: Heatmap uses distinct-member counts (Set<email>.size per role x module cell), NOT raw role-module assignment counts — single user holding pair across N projects contributes 1 not N.
- [Phase 04-access-analysis]: P06: Coverage donut empty-Workspace fallback (workspaceEmails.length === 0) covers all three cases (non-Workspace tenant returns [], FORBIDDEN scope-missing, query in flight) with one inline message — granular re-auth UX deferred.
- [Phase 04-access-analysis]: P06: WidgetCommonProps (users + workspaceEmails) published as cross-plan contract; DashboardClient spreads once to all widgets; widgets ignore unused fields; heights pinned (donut 300px, tiers 200px, heatmap 500px) per Pitfall 2.
- [Phase 04-access-analysis]: P07: Pattern 3 FindingsContext shipped — findings computed ONCE in DashboardClient via useMemo(computeAllFindings) and consumed by widgets via useFindings(); FindingsProvider always wraps with empty sentinel during load to prevent throw races.
- [Phase 04-access-analysis]: P07: Recommendations CSV column order LOCKED per DASH-13: Type,Severity,Roles,Members,Modules,SuggestedAction. Junk findings emit Modules empty when zeroModules signal fired; otherwise union of affected-member modules via per-user lookup.
- [Phase 04-access-analysis]: P07: RecentlyAddedWidget uses Path A (real ACC created_at via 04-02) — no fallback caveat shown; users with addedOn=null excluded from every window. Inline 3-button 7d/30d/90d toggle in lieu of unavailable shadcn ToggleGroup component.
- [Phase 04-access-analysis]: P08: SelectionContext + useSelection hook (Pattern 4) — discriminated SelectedFinding union (junk | duplicate | outlier | role | null); SelectionProvider wraps INSIDE FindingsProvider so panel reads roleSeverityIndex without prop-drilling.
- [Phase 04-access-analysis]: P08: DashboardSidePanel rendered as SIBLING of widget grid (NOT inside DndContext) — drag-and-drop and panel content stay isolated; panel width sm:max-w-lg keeps grid visible at 1280px.
- [Phase 04-access-analysis]: P08: Heatmap inline severity uses ECharts rich-text axisLabel.formatter ({hi|●} RoleName) — no DOM overlay; flow widget uses @xyflow/react custom nodeTypes; both consume the same useFindings().roleSeverityIndex.
- [Phase 04-access-analysis]: P08: Phase 4 UAT 16/16 PASSED 2026-05-08; user-flagged Phase 4.1 Polish follow-up — visual polish, move dashboard under ACC Analysis page as tab, replace list widgets (Recommendations/Outliers/Recently-added/Admin) with chart treatments.
- [Phase 04.1]: P01: Wave 1 foundation — _shared/ primitives (dashboardTokens, useTransition, HoverSpotlight, FocusRing, WidgetSkeleton) + SelectedFinding extended with admin+day kinds + reconciliation effect in SelectionProvider (Pitfall 4 single-place reconciliation); DashboardFindings real fields (junkRoles/duplicateRoles/outlierCombos) used in isSelectionValid (plan placeholder names ignored)
- [Phase 04.1]: P02: Bubble cluster uses deterministic two-pack layout (junk left half, duplicate right half, 16px gutter) — chosen over force-displacement for stable layout + perf
- [Phase 04.1]: P02: Outlier treemap color via scaleSequential(interpolateOranges).domain([0.05, 0]) reversed-domain — rarer pct → deeper orange visual intensity
- [Phase 04.1]: P02: PackNode helper type (Partial<Leaf> + recursive children) added to satisfy d3-hierarchy generic constraint that plan ignored
- [Phase 04.1]: P02: Duplicate findings hard-coded MEDIUM severity for bubble color (matches Phase 4 P03 decision; DuplicateRoleFinding has no Severity field)

### Roadmap Evolution

- Phase 04.1 inserted after Phase 4: Access Analysis tab — replace lists with astonishing, interactive graphics only (no name-list widgets) (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- **TD-005:** CLOSED 2026-04-29 (commit 2978186) — Cosmos GPU physics swap ships; 25,559-node hub is interactive (sliders, drag, pick, same-user highlight, perf HUD all behave).
- **TD-006 (non-blocking):** Cosmos slider feel refinement — separation range and organic-vs-cluster transition need additional tuning per user feedback during 02-05 verification. User explicitly deferred ("approved it needs refinement but we can see it later").
- **TD-007 (non-blocking):** Canvas2D renderer branch + dual-path forward-projection scaffolding now vestigial — Cosmos/GPU is the only production path. Surfaced 2026-04-29 at 02-04 human-verify checkpoint. Removal deferred to standalone plan that also deprecates REND-04.
- Phase 1 risk (HIGH): Worker production build failure (Pitfall 5) — must verify `npm run build && npm start` in CI before merging Phase 1 work

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Implement label readability polish per 03-06 design spec | 2026-05-07 | 55e2378 | [1-implement-label-readability-polish-per-0](./quick/1-implement-label-readability-polish-per-0/) |

## Session Continuity

Last session: 2026-05-08
Stopped at: Completed 04.1-02-PLAN.md (commits e1a693a, a7f1cfe). RecommendationsWidget = severity bubble cluster (d3 pack); OutlierCombosWidget = squarified treemap (d3 treemap, reversed-domain interpolateOranges). Sibling 04.1-03 already landed in parallel. tsc green. 04.1-04 queued.
Resume file: .planning/phases/04.1-access-analysis-tab-replace-lists-with-astonishing-interactive-graphics-only-no-name-list-widgets/04.1-04-PLAN.md
