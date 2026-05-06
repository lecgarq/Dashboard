---
phase: 03-graph-ui-completion
plan: 01
subsystem: graph-ui
tags: [canvas2d, labels, zoom, ui-01]
requires:
  - GraphRenderFrame
  - GraphRenderNode
  - CanvasGraphRenderer.draw
provides:
  - "GraphRenderNode.label / GraphRenderNode.degree"
  - "GraphRenderFrame.labelFadeStartScale / labelFadeEndScale / labelOverrideIndices"
  - "Late-zoom label render pass in CanvasGraphRenderer.draw()"
  - "lastFitScaleRef + hoveredNodeRef in AccUsersGraph"
affects:
  - "Canvas2D fallback rendering path (Cosmos GPU path untouched)"
tech_stack:
  added: []
  patterns:
    - "Screen-space label pass after world-space node draw (resetTransform + dpr scale)"
    - "Reference-equality cache for per-node degree recompute"
    - "Override set assembled per-frame from hover + selection refs"
key_files:
  created:
    - .planning/phases/03-graph-ui-completion/03-01-SUMMARY.md
  modified:
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/AccUsersGraph.tsx
decisions:
  - "Fade band: 2.0× → 3.5× of lastFitScale (per RESEARCH.md, no tuning deviation)"
  - "Priority key: degree desc (per plan); ties resolved by iteration order"
  - "Cosmos persistent labels deferred (Open Question 1) — Canvas2D-only pass; Cosmos hover labels via onPointMouseOver remain untouched"
  - "label fallback chain: name || email || id (instead of name || id) so empty-name records still get a readable label"
  - "Degree recompute gated on linksRef reference identity rather than memoized via useMemo — avoids React-state coupling for a value the rAF loop reads from refs"
metrics:
  duration_minutes: 8
  tasks: 3
  files_modified: 2
  completed_at: "2026-05-06T22:53:32Z"
requirements:
  - UI-01
---

# Phase 03 Plan 01: Zoom-Threshold Node Labels Summary

Canvas2D late-zoom label pass with degree-priority + AABB collision, hover/select bypass, and 200-label hard cap; Cosmos path intentionally untouched.

## Results

- 3 tasks completed (all `type="auto"`)
- All verifications passed: `npx tsc --noEmit` clean after each task
- UI-01 implementation merged into the deploy branch via three atomic commits

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Extend `GraphRenderNode` / `GraphRenderFrame` with label fields | `5036ab7` | done |
| 2 | Add zoom-threshold label render pass to `CanvasGraphRenderer.draw()` | `2805e94` | done |
| 3 | Populate label/degree + thresholds in `AccUsersGraph` render frame | `496fc96` | done |

## Implementation Notes

### Fade band

`labelFadeStartScale = lastFitScale * 2.0`, `labelFadeEndScale = lastFitScale * 3.5`. `lastFitScaleRef` is seeded from `loadSavedView()` (default 600 when no saved view) and refreshed inside `zoomToFit()` after `clampedFitScale` is computed.

### Priority + collision

- Override candidates (hover/select) drawn first at `globalAlpha = 1`, bypass collision check, but their AABBs are pushed into `drawnAabbs` so subsequent normal labels respect them.
- Normal candidates sorted by `degree` descending, drawn at the fade opacity, AABB-tested against `drawnAabbs` (O(n²) — fine at n ≤ 200 per RESEARCH.md).
- AABB: `[sx - textWidth/2, sy - 18, textWidth + 4, 14]` (text sits 8px above the node center, alphabetic baseline).
- 200-label hard cap; override labels DO count against the cap but are guaranteed slots.

### Hover wiring

- Added `hoveredNodeRef` mirror because the rAF render loop runs in a `useEffect([])` and would otherwise see stale `hoveredNode` state.
- All three `setHoveredNode(...)` call sites now also update the ref.
- `handlePointerMove` calls `markGraphDirty()` only when hover identity changes — preserves the existing rAF gating.

### Cosmos status (Open Question 1)

Deferred. The Canvas2D label pass is gated to the Canvas2D renderer (the new code lives in `CanvasGraphRenderer.draw`, not `CosmosGraphRenderer.draw`). Cosmos retains its existing `onPointMouseOver` hover label behavior. A future plan can add `setPointLabels`/equivalent if/when the v3 API surface is confirmed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `hoveredNodeRef` mirror for rAF closure**

- **Found during:** Task 3
- **Issue:** The render loop is inside `useEffect([])` and would have closed over the initial `hoveredNode` (always `null`). Reading the React state would never reflect actual hover.
- **Fix:** Added `hoveredNodeRef` and updated all three `setHoveredNode` call sites to mirror. Frame builder reads from the ref.
- **Files modified:** `app/(dashboard)/users/AccUsersGraph.tsx`
- **Commit:** `496fc96`

**2. [Rule 3 - Blocking] Added `markGraphDirty()` to hover handler on identity change**

- **Found during:** Task 3
- **Issue:** Plan step 5 anticipated this — the existing hover handler did NOT call `markGraphDirty()` on the non-drag path, so override labels would not appear immediately at steady-state zoom.
- **Fix:** Hover handler now calls `markGraphDirty()` when `hoveredNodeRef.current?.id` changes. Gated on identity to avoid spurious frame churn while the cursor moves over the same node.
- **Files modified:** `app/(dashboard)/users/AccUsersGraph.tsx`
- **Commit:** `496fc96`

### Out-of-scope items (not addressed)

- Pre-existing lint errors in `.local/postgresql18/...` and `scripts/start-production.cjs` / `scripts/yjs-server.mjs` — unrelated to graph UI; flagged but not fixed (scope boundary).

## Files Changed

- `app/(dashboard)/users/graphRenderers.ts`
  - +2 fields on `GraphRenderNode` (`label?`, `degree?`)
  - +3 fields on `GraphRenderFrame` (`labelFadeStartScale?`, `labelFadeEndScale?`, `labelOverrideIndices?`)
  - +141 lines: late-zoom label pass in `CanvasGraphRenderer.draw()` (screen-space, override-first, degree-priority, AABB collision, 200-cap)
- `app/(dashboard)/users/AccUsersGraph.tsx`
  - +`label?` / +`degree?` on `UserNode`
  - +`lastFitScaleRef` (seeded from `view.current.scale`; updated in `zoomToFit`)
  - +`hoveredNodeRef` mirror (3 update sites)
  - +`lastLinksForDegreeRef` and per-frame degree recompute on link reference change
  - Frame builder now writes `labelFadeStartScale/EndScale` + `labelOverrideIndices`
  - `handlePointerMove` calls `markGraphDirty` on hover identity change

## Verification

- `npx tsc --noEmit` — passed (after each task)
- `npm run lint` — only pre-existing failures in unrelated files (scope boundary, see deviations)
- Manual smoke (recommended post-merge): `npm run dev` → /users → no labels at fit zoom; wheel-zoom past ~2× fit → labels fade in; hover at any zoom → that node's label appears immediately; select a node → its label persists.
- Cosmos GPU path: not modified (verified by inspection — no edits inside `CosmosGraphRenderer`).

## Self-Check: PASSED

- `app/(dashboard)/users/graphRenderers.ts` — FOUND
- `app/(dashboard)/users/AccUsersGraph.tsx` — FOUND
- `.planning/phases/03-graph-ui-completion/03-01-SUMMARY.md` — FOUND (this file)
- Commit `5036ab7` — FOUND in `git log`
- Commit `2805e94` — FOUND in `git log`
- Commit `496fc96` — FOUND in `git log`
