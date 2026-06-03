# Phase 7 Performance Report

Measured: 2026-05-12 (administrative close — see "Status" below)

## Status

**Administrative close per Luis directive 2026-05-12:**
> "continue with the next waves, don't wait for verification, we will verify it at the end."

This report captures the **automatable** acceptance signals (test-suite green, tsc
green, interactivity contract observable at code level, 3D gate decision). Live-
browser FPS observation and visual UAT are DEFERRED to a single phase-end manual
pass after all waves close. Plan 07-09 is closed administratively; the manual UAT
will either ratify this report (PHASE-7-ACCEPT=APPROVED) or open a gap-closure
plan via `/gsd:plan-phase 07 --gaps`.

## Configuration

- **Hub-scale user count:** DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12.
  (Production target: ~hub-scale BulkAccUser count. Library is data-shape agnostic — 50/50 + 81/81 Vitest covers correctness; FPS is the only live-data signal still owed.)
- **Total folder hubs (depth-2 collapsed):** DEFERRED TO MANUAL UAT — `collapseFoldersToDepth(rows, 2)` exercised by 7-case Vitest; production count requires live `accFolders.getMatrix` hit.
- **Total similarity edges (all 5 dims, minShared=2):** DEFERRED TO MANUAL UAT — `computeSimilarityEdges` with all 5 dims passes 9-case Vitest including perf smoke (500 users × 10 roles < 500ms); production count requires live data.
- **3D shipped:** **NO** (per PHASE-DEPS.md `DECISION: 3D-WIRING=DEFER`). Plans 07-07 + 07-08 deferred-complete with stub SUMMARYs; zero sphere3d/* files on disk; Phase 6 has 0/10 SUMMARYs shipped.

## 2D Surface (AccUsersGraph)

### Automated acceptance signals (this report)

- **Vitest:** 258/258 pass (full repo) — 2026-05-12 10:15 UTC.
- **tsc --noEmit:** clean (0 errors) — 2026-05-12.
- **Filter contract code-level:** All 5 new filter axes (showFolders, permTiers×4, simDims×5, simMin, viewMode) implemented + URL round-trip + non-default-only writer — see 07-06-SUMMARY.
- **Edge-color contract code-level:** PERM_TIER_COLOR (4 hues) + SIM_DIM_COLOR (5 hues) + FOLDER_PROJECT_EDGE_COLOR LUTs wired through `buildLinkColorBuffer` → cosmos colors[] buffer — see 07-05/07-06 SUMMARYs.
- **Interactivity contract surfaces present:** folder-kind handling exists in `AccUsersGraph.tsx`, `graphRenderers.ts`, `accGraphTopology.test.ts`, `DashboardSidePanel.tsx`, `selectionContext.tsx`. Hover/click hooks already accept folder hubs (kind:'folder' branch in render + selection).

### Live-browser observation (DEFERRED)

- **FPS idle:** DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12.
- **FPS during pan/zoom:** DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12.
- **FPS during physics-slider scrub:** DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12. (Pitfall 5 gate: topology rebuild deps exclude physics sliders, so this should stay smooth.)
- **Interactivity:**
  - Hover detail on folder hub: DEFERRED TO MANUAL UAT — surfaces present; needs Luis observation.
  - Click-through to side panel: DEFERRED TO MANUAL UAT — surfaces present; needs Luis observation.
  - Cross-widget spotlight: DEFERRED TO MANUAL UAT — surfaces present; needs Luis observation.

## 3D Surface (Sphere3DGraph) — N/A

- **FPS idle:** N/A — 3D wiring deferred.
- **FPS during orbit/zoom:** N/A — 3D wiring deferred.
- **Edge-LUT color visibly differentiates permTier and dimension:** N/A — 3D wiring deferred.

**Reason:** PHASE-DEPS.md records `DECISION: 3D-WIRING=DEFER` and
`DECISION: 3D-FOLDERS=NO-GO`. Plans 07-07 + 07-08 are deferred-complete (stub
SUMMARYs only). 3D parity for Phase 7 will re-open when Phase 6 (3D spherical
graph) ships its SUMMARYs and the gate re-probes to PROCEED. See
`.planning/phases/07-.../PHASE-DEPS.md` for the re-probe trigger list.

## Findings

### What is verifiable now (without a live browser)

1. **Pure libraries shipped and Vitest-green:**
   - `lib/acc/permissionMapping.ts` (Plan 04-01, 14 tests)
   - `lib/acc/folderHubCollapse.ts` (Plan 07-02, 7 tests)
   - `lib/acc/userSimilarity.ts` (Plan 07-03, 9 tests, incl. 500-user perf smoke <500ms)
   - `accGraphFilters.ts` extensions (Plan 07-04, 50 tests)
   - `buildAccTopologyGraph` Phase 7 extensions (Plan 07-05, 5 new tests on top of 3 existing)
2. **Adapter wiring complete (Plan 07-05):**
   - `AccTopologyHubKind` += 'folder'; `AccTopologyLink` += {permTier, dimension, weight}.
   - `resolveRenderNodeColor` centralizes folder-color override across Canvas2D + cosmos color buffer (Pitfall 4 defended in both render paths).
   - `PERM_TIER_LUT` defaults unknown PermType to 'view' (least-privilege) — defensive against future APS tier additions.
3. **UI wiring complete (Plan 07-06):**
   - Full filter-panel section (View mode + Show folders + 4 permTiers + 5 simDims + simMin slider).
   - URL round-trip for 5 keys (`folders`, `ptiers`, `simDims`, `simMin`, `view`) with compact letter aliases (v/u/e/c, fa/r/p/c/a) — non-default-only writes keep URLs short.
   - Topology-rebuild useEffect deps deliberately exclude physics sliders → Pitfall 5 gate stays closed.
   - Filter-shape vs filter-edge separation: `showFolders` / `viewMode` / `simMin` trigger topology rebuild; `permTiers` / `simDims` trigger only edge re-filter + colors[] re-bind (cheaper path).
   - `hasActiveFilters` / `activeFilterCount` surface the 5 new Phase 7 axes.
4. **Interactivity contract code-level:** folder-kind branches exist in render, selection, and side-panel surfaces. The kind:'folder' path uses the same hover/click hooks as kind:'user' and kind:'project' — no new wiring gap visible.

### What still needs live observation (deferred)

1. Hub-scale FPS (idle, pan/zoom, slider scrub) in 2D with all 5 sim dims ON + folders ON.
2. Hover popover layout on folder hubs (visual polish only — wiring confirmed).
3. Click-through into DashboardSidePanel for a folder hub — verify the body content is informative and not blank.
4. URL paste-in-new-tab restore (functional — readFiltersFromUrl already covered by 07-04 Rule 3 fix).

### Risk register (pre-UAT)

- **LOW:** All 4 known pitfalls are defended at code level (Pitfall 2 transitive resolution memoized; Pitfall 4 folder color routed through both render paths; Pitfall 5 physics sliders excluded from topology-rebuild deps; cross-project folder-id collisions impossible because IDs are project-scoped).
- **MEDIUM:** FPS at hub-scale is the only signal not covered by automated tests. The 500-user × 10-role × 5-dim perf smoke (<500ms in `userSimilarity.test.ts`) gives a CPU-side confidence floor; the open variable is cosmos.gl GPU upload + render at hub scale.
- **N/A:** 3D path entirely out of scope this phase (gate deferred).

## DECISION: PHASE-7-ACCEPT=PENDING-MANUAL-UAT

**Administrative status:** Plan 07-09 closes here so subsequent waves (none
remaining in Phase 7) and downstream phases are not blocked on UAT scheduling.
The phase-end manual UAT pass will flip this to one of:

- **PHASE-7-ACCEPT=APPROVED** → Phase 7 closes cleanly; v3.0 (Graph Topology) milestone tracks Phase 7 as shipped.
- **PHASE-7-ACCEPT=GAPS** → run `/gsd:plan-phase 07 --gaps` to plan closure; this report becomes the gap-input.
- **PHASE-7-ACCEPT=REVERT** → unwind via git revert; document why in retrospective.

3D scope (folder hubs + 3D wiring) is **NOT** part of the manual UAT for this
phase — it re-opens only when Phase 6 ships and the PHASE-DEPS.md re-probe
trigger fires.
