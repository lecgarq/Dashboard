# 31-01 SUMMARY — Camera, focus lighting, edges, and hover tooltip

**Status:** COMPLETE · 2026-07-16

## What shipped

- `GraphCanvas2D` now exposes a three-method frozen camera seam:
  `captureView()` reads canvas-center space coordinates + zoom,
  `focusPoint()` calls Cosmos at 2.25× / 180ms / no zoom-out /
  `enableSimulation:false`, and `restoreView()` restores the captured center +
  zoom through `setZoomTransformByPointPositions(..., false)`.
- `GraphInteractions` owns one focus-session snapshot. The first isolate captures
  it, match-to-match isolate changes only move focus, and any clear transition
  restores it. Reduced motion uses duration 0.
- Isolate masking is now exactly selected + supplied distinct match indices.
  Same-user project memberships no longer light.
- `resolveFocusEdges` adds two pure transient layers over the existing indexed
  web: selected edges include every Phase-30 match and synthesize a missing
  selected→match curve when the capped global set omitted it; hover raises only
  incident global edges and never fetches.
- `SimilarityWebOverlay` keeps one canvas/affine projection: ambient web draws at
  15% while selected, selected curves draw next, hovered curves last. Focus
  resolution is cached until edge/focus inputs change and each redraw performs
  one point-position read.
- Hover ring/edge notification remains immediate. Tooltip disclosure is one
  cancellable 80ms timer anchored from the actual graph wrapper rect.
  `NodeTooltip` now shows compact identity/project context, permission tier,
  activity recency, and folder breadth; partial breadth is labeled and unknown
  permission coverage renders tier/breadth unavailable.

## Gates

- Focused Vitest:
  `GraphCanvas.test.ts`, `GraphInteractions.test.tsx`,
  `usePredicateEngine.test.ts`, `similarityWeb.test.ts`,
  `SimilarityWebOverlay.test.tsx`, `NodeTooltip.test.tsx`
  → **6 files / 47 tests passed**.
- `npx tsc --noEmit` → **clean** (exit 0).
- Scoped `git diff --check` → clean; only repository LF→CRLF warnings.
- Frozen-path grep: new camera calls pass `false` for simulation; no new
  `start()` or simulation-config call exists in the interaction/predicate/overlay
  path. Existing guarded GPU-mode starts in `GraphCanvas2D` are unchanged.

## Deviations

- Added a comment-only correction in `interactionTypes.ts` (not named in the
  plan file) so the public `neighborIndices` contract no longer claims
  same-user memberships are lit.
- jsdom prints its existing `HTMLCanvasElement.getContext` not-implemented
  warning while the overlay mount test runs; the test remains green.

