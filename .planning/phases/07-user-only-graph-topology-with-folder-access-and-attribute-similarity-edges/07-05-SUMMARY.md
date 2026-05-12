---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
plan: 05
subsystem: graph
tags: [topology, folder-hubs, similarity-edges, cosmos-gl, render-pipeline]

requires:
  - phase: 07-02
    provides: collapseFoldersToDepth + FolderHubInputRow type
  - phase: 07-03
    provides: computeSimilarityEdges + SimilarityDim/SimilarityInput types
  - phase: 07-04
    provides: PermTierKey + SimilarityDimKey + GraphFilters extensions
provides:
  - AccTopologyHubKind extended with 'folder'
  - AccTopologyLink extended with optional permTier, dimension, weight
  - buildAccTopologyGraph(nodes, extensions) — folder hubs + role-folder + folder-project + user-similarity edges
  - collapsePermTierKey LUT (6-tier APS PermType -> 4-tier UI bucket)
  - GraphRenderNode.kind extended with 'folder'
  - resolveRenderNodeColor + FOLDER_NODE_COLOR (#5EEAD4) override (Pitfall 4)
  - buildLinkColorBuffer extended with { defaultColor, perEdgeColors } options
  - hexToRgba01 helper
affects: [07-06, 07-07, 07-08]

tech-stack:
  added: []
  patterns:
    - "Adapter extension via optional bag (AccTopologyExtensions) preserves single-arg back-compat"
    - "Kind-based color override resolved once via resolveRenderNodeColor — both backends call it (Canvas2D + Cosmos)"
    - "perEdgeColors override falls back to defaultColor on missing/short arrays"

key-files:
  created: []
  modified:
    - app/(dashboard)/users/accGraphOrganicLayout.ts
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/cosmosUtils.ts
    - app/(dashboard)/users/accGraphTopology.test.ts

key-decisions:
  - "Folder hub IDs use raw `hub:folder:<encoded(folder.id)>` form — bypasses normalizeHubValue() because collapseFoldersToDepth already produces deterministic project-scoped IDs (`collapsed:<projectId>::<path>`). Normalizing would lossily lowercase/strip the path separators."
  - "role-folder edges run role -> folder direction (not folder -> role) to match the role-as-source convention already used by user -> role edges."
  - "PERM_TIER_LUT defaults unknown PermType to 'view' (least privilege rendering) rather than throwing — defends against APS adding a new tier without crashing the adapter."
  - "Phase 7 similarity edges land in the topology regardless of viewMode — viewMode is a render-time visibility filter (Pattern 3)."
  - "resolveRenderNodeColor is the single source of truth for folder color override — Canvas2D draw loop AND buildNodeColorBuffer both route through it (no risk of one backend forgetting the Pitfall 4 branch)."
  - "buildLinkColorBuffer keeps no-arg signature working — existing graphRenderers.ts call site at line 759 (`buildLinkColorBuffer(linkCount)`) needs zero changes."

patterns-established:
  - "Pure-module wiring: adapter (this plan) calls collapseFoldersToDepth + computeSimilarityEdges; both stay zero-Prisma/zero-React. Plan 07-06 memoizes the similarity call at adapter caller (per must_haves key_links)."
  - "Color override centralization: resolveRenderNodeColor + FOLDER_NODE_COLOR exported once; future kind-specific overrides extend the same helper."

requirements-completed: [GRAPH7-01, GRAPH7-02, GRAPH7-03, GRAPH7-04, GRAPH7-11]

duration: ~10 min
completed: 2026-05-12
---

# Phase 7 Plan 05: 2D Topology Adapter Wiring Summary

**Folder hubs + role-folder permission edges + user-similarity edges wired into buildAccTopologyGraph; folder kind bypasses palette via resolveRenderNodeColor; cosmosUtils.buildLinkColorBuffer accepts perEdgeColors for Plan 07-06 filter-driven edge colors.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-12T15:54:14Z
- **Completed:** 2026-05-12T15:59:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `AccTopologyHubKind` + `AccTopologyLinkKind` extended; new optional `permTier`, `dimension`, `weight` fields on `AccTopologyLink`
- `buildAccTopologyGraph` now consumes `AccTopologyExtensions = { folderMatrix, similarityInput, similarityDims, simMin, folderDepth }` — fully backward compatible
- Folder hubs (id `hub:folder:<encoded>`) + folder-project edges + role-folder edges (permTier-tagged via `collapsePermTierKey`) emitted from the new pure modules wired into the adapter
- `GraphRenderNode.kind` accepts `"folder"`; `resolveRenderNodeColor` + `FOLDER_NODE_COLOR` override defends Pitfall 4 in both Canvas2D draw loop and `buildNodeColorBuffer`
- `buildLinkColorBuffer(count, { defaultColor, perEdgeColors })` ready to consume the Plan 07-06 filter panel's per-edge color drive
- 5 new Vitest cases cover folder emission, similarity emission, permTier collapse, and both no-input regression guards (8/8 green)

## Task Commits

1. **Task 1: Extend topology types + buildAccTopologyGraph** — `a62d8b9` (feat)
2. **Task 2: Folder color override + per-edge color buffer plumbing** — `7076e51` (feat)
3. **Task 3: Topology integration tests** — `d5cea6c` (test)

## Files Created/Modified

- `app/(dashboard)/users/accGraphOrganicLayout.ts` — types extended, `collapsePermTierKey` exported, `buildAccTopologyGraph` accepts `extensions` bag and emits folder/similarity edges
- `app/(dashboard)/users/graphRenderers.ts` — `GraphRenderNode.kind` += `"folder"`; `FOLDER_NODE_COLOR` + `resolveRenderNodeColor` exported; CanvasGraphRenderer routes through it
- `app/(dashboard)/users/cosmosUtils.ts` — `buildNodeColorBuffer` routes folder kind through `resolveRenderNodeColor`; `buildLinkColorBuffer` gains optional `{ defaultColor, perEdgeColors }`; new `hexToRgba01` helper
- `app/(dashboard)/users/accGraphTopology.test.ts` — 5 new Phase 7 cases (folder hubs, no-folder regression guard, similarity edges, permTier collapse, no-similarity regression guard)

## Decisions Made

See `key-decisions` frontmatter. Highlights:

- Folder hub IDs bypass `normalizeHubValue()` — `collapseFoldersToDepth` already produces project-scoped deterministic IDs; normalizing would corrupt path separators
- `role-folder` direction = role -> folder (matches existing user -> role convention)
- `PERM_TIER_LUT` unknown -> `"view"` default (least privilege; defends against unannounced APS tier additions)
- `resolveRenderNodeColor` centralized so both render backends share one Pitfall 4 branch

## Deviations from Plan

None - plan executed exactly as written.

The plan's task 2 instruction said to find the `getCategoryColor` call site in `graphRenderers.ts`; in this codebase `getCategoryColor` lives upstream in `lib/acc/graphSnapshot.ts` and writes `node.color` BEFORE the render frame is built. The plan's intent (per must_haves: "per-kind color resolver branches on folder") was satisfied by introducing `resolveRenderNodeColor` in `graphRenderers.ts` — it reads `node.color` for non-folder kinds and overrides to `FOLDER_NODE_COLOR` for `kind === "folder"`. Same defensive boundary, different placement.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 07-06 (filter panel UI)** unblocked: `perEdgeColors` plumbing ready; `permTier`/`dimension`/`weight` already on `AccTopologyLink` for the panel to drive edge color from filter state.
- **Plan 07-07 (3D wiring)** — per PHASE-DEPS.md remains DEFER (no 3D in Phase 7 ship).
- Plan 07-06 callsite reminder: memoize `computeSimilarityEdges` at adapter caller per RESEARCH key-link guidance (still O(n²) over bucket pairs even with bucketed indexing).

---
*Phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges*
*Completed: 2026-05-12*

## Self-Check: PASSED

- FOUND: app/(dashboard)/users/accGraphOrganicLayout.ts
- FOUND: app/(dashboard)/users/graphRenderers.ts
- FOUND: app/(dashboard)/users/cosmosUtils.ts
- FOUND: app/(dashboard)/users/accGraphTopology.test.ts
- FOUND commit: a62d8b9
- FOUND commit: 7076e51
- FOUND commit: d5cea6c
- 8/8 vitest pass (npx vitest run app/(dashboard)/users/accGraphTopology.test.ts)
- 0 tsc errors (npx tsc --noEmit -p .)
