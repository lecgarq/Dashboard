---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
plan: 06
subsystem: graph
tags: [filter-panel, url-persistence, edge-color, topology-wiring, 2d-shipping]

requires:
  - phase: 07-04
    provides: GraphFilters extensions (showFolders, permTiers, simDims, simMin, viewMode) + DEFAULT_FILTERS
  - phase: 07-05
    provides: buildAccTopologyGraph extensions + per-edge color buffer plumbing + folder render color override
provides:
  - AccUsersGraph fully wired to accFolders.getMatrix
  - Transitive user -> roleIds -> folderIds resolution (memoized, Pitfall 2)
  - Topology rebuild memoized on filter-SHAPE keys only (Pitfall 5 defended)
  - Filter panel: View mode + Show folders + Permission tiers (4) + Similarity dims (5) + simMin slider
  - URL round-trip for 5 new keys: folders, ptiers, simDims, simMin, view
  - Per-edge color buffer driven by permTier / dimension / kind LUTs
  - hasActiveFilters / activeFilterCount surface Phase 7 deviations
affects: [07-09]

tech-stack:
  added: []
  patterns:
    - "Adapter-boundary edge filtering: permTiers / simDims drop links AFTER buildAccTopologyGraph returns (kept memoized separately from topology shape)"
    - "URL letter-alias LUTs (PERM_TIER_TO_LETTER, SIM_DIM_TO_LETTER) compact 4-char param values"
    - "Non-default-only URL writing keeps share URLs short"
    - "Topology-shape useEffect deps deliberately exclude physics sliders to prevent slider-scrub recompute"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/cosmosUtils.ts
    - app/(dashboard)/users/graphRenderers.ts

key-decisions:
  - "Edge-color callback (projectTopologyLinksToIndexPairs accepts optional { linkColor }) chosen over a parallel post-build edge-color pass — keeps the colors[] array index-aligned with sources/targets by construction, avoids a second lookup table."
  - "URL persistence writes filters ONLY when non-default — keeps shared URLs clean and tolerates Phase 7 default churn without rewriting old links."
  - "Compact letter aliases for permTiers (v/u/e/c) and simDims (fa/r/p/c/a) chosen over full strings — keeps URL surface short for the 9-element worst case."
  - "viewMode + showFolders applied via DEFAULT_FILTERS spread in readFiltersFromUrl (already wired in 07-04 Rule 3 fix) — no new code path needed here."
  - "arraysEqualAsSets helper added inline rather than imported — Phase 7 is the only consumer; no need for shared util."
  - "Topology-rebuild useEffect dependency list: [snapshot, filters.showFolders, filters.permTiers, filters.simDims, filters.simMin, filters.viewMode, folderMatrixQuery.data]. Physics sliders (separation, cluster) DELIBERATELY excluded — that's the Pitfall 5 gate."

patterns-established:
  - "Filter-shape vs filter-edge separation: showFolders/viewMode/simMin trigger topology rebuild; permTiers/simDims trigger only edge re-filter + color re-bind (cheaper)."
  - "Color-LUT placement: PERM_TIER_COLOR / SIM_DIM_COLOR / FOLDER_PROJECT_EDGE_COLOR live in AccUsersGraph (single consumer); folder NODE color stays centralized in graphRenderers.resolveRenderNodeColor (Plan 07-05)."

requirements-completed: [GRAPH7-05, GRAPH7-06, GRAPH7-08, GRAPH7-09, GRAPH7-11]

duration: ~8 min
completed: 2026-05-12
---

# Phase 7 Plan 06: 2D AccUsersGraph Filter Panel + URL Persistence + Per-Edge Color Summary

**AccUsersGraph fully wired: fetches accFolders.getMatrix, resolves transitive folder access, renders the 4 new Phase 7 filter control groups + slider, round-trips 5 new URL keys, and drives per-edge color from permTier / dimension via parallel colors[] buffer — topology rebuild memoized on filter-shape only so physics-slider scrub stays smooth.**

## What Shipped

### Task 1 — Data fetch + transitive folder-access + per-edge color buffer plumbing (commit `0eb3cd9`)

- New tRPC consumer: `trpc.accFolders.getMatrix.useQuery()` near existing query cluster.
- `buildSimilarityInput(users, folderMatrixRows)` resolves each user's `roleIds` then walks the matrix to collect transitive `folderIds` (Pitfall 2 / RESEARCH Open Question 1). Memoized on `(enrichedUsers, folderMatrixQuery.data)`.
- `buildExtendedTopology` adapter applies `showFolders` / `permTiers` / `simDims` / `simMin` / `viewMode` at the boundary; routed through all 3 topology call sites (worker init, cosmos PATH-A, cosmos PATH-B).
- `projectTopologyLinksToIndexPairs` gains optional `{ linkColor }` callback emitting a parallel `colors[]` aligned with sources/targets; zero-arg back-compat preserved.
- `GraphRenderFrame.links` + `linksRef` widened with `colors?: string[]`.
- `CosmosGraphRenderer` feeds `frame.links.colors` to `buildLinkColorBuffer` via `perEdgeColors` on link-count change.
- New LUTs in AccUsersGraph: `PERM_TIER_COLOR` (4 tiers), `SIM_DIM_COLOR` (5 dims), `FOLDER_PROJECT_EDGE_COLOR`.

### Task 2 — Filter panel UI + URL persistence + topology rebuild on filter-shape change (commit `1183e32`)

- New "Topology" filter-panel section with 5 control groups:
  - **View mode** — toggle (multi / user-only)
  - **Show folders** — switch
  - **Permission tiers** — 4 checkboxes with color swatches matching PERM_TIER_COLOR
  - **Similarity dimensions** — 5 checkboxes with color swatches matching SIM_DIM_COLOR
  - **Min shared attributes** — range slider 1..5
- URL persistence: `readFiltersFromUrl` + `writeFiltersToUrl` round-trip 5 new keys (`folders`, `ptiers`, `simDims`, `simMin`, `view`). Compact letter aliases keep URL surface short. Non-default-only writing keeps clean URLs for shared links.
- Topology-shape `useEffect` rebuilds links (worker reflow OR cosmos PATH-B re-projection) only when filter-SHAPE deps change. Physics sliders (separation / cluster) deliberately NOT in dep list — Pitfall 5 gate.
- `hasActiveFilters` / `activeFilterCount` updated to include Phase 7 deviations so the Clear-all button + count badge surface correctly.
- `arraysEqualAsSets` helper added for non-default detection.

## Verification

### Automated (passed)

- **Vitest:** 81/81 (full suite) + 16/16 (`accGraphTopology.test.ts` + `cosmosUtils.test.ts`).
- **TypeScript:** `npx tsc --noEmit -p .` — clean (zero new errors in AccUsersGraph / cosmosUtils / graphRenderers).

### Manual UAT / FPS observation

**DEFERRED to Plan 07-09.** Per Luis directive ("continue with the next waves, don't wait for verification, we will verify it at the end"), Task 3's interactive checkpoint is skipped and FPS observation will be captured during phase-end UAT in Plan 07-09. All other success criteria (folder hub render, edge color, view-mode user-only isolation, URL round-trip, slider responsiveness) will be validated together at that point.

## Deviations from Plan

None — the two engineering tasks executed exactly as written. The only departure from the plan-as-authored is the auto-approval of the UAT checkpoint (Task 3), per direct user instruction; this is recorded as a deferral, not a deviation.

## Self-Check: PASSED

- Commit `0eb3cd9` present in `git log` (verified above).
- Commit `1183e32` present in `git log` (verified above).
- Modified files match: `AccUsersGraph.tsx`, `cosmosUtils.ts`, `graphRenderers.ts` (verified via `git show --stat`).
- SUMMARY.md exists at `.planning/phases/07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges/07-06-SUMMARY.md`.
