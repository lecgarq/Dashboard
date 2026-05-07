---
status: diagnosed
phase: 03-graph-ui-completion
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-05-07T00:00:00Z
updated: 2026-05-07T00:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Labels hidden at fit zoom, fade in past ~2× zoom
expected: At default fit zoom no labels are visible. Zoom in past ~2× fit scale → labels fade in (highest-degree nodes first, no overlapping text). Up to 200 labels max.
result: issue
reported: "The labels arent visible neither when zooming or when zooming out"
severity: major

### 2. Hover label at any zoom level
expected: At any zoom (including fit zoom where no other labels show), hovering a node makes that node's label appear immediately. Moving off the node hides it.
result: issue
reported: "No i cant see the lavels when hoovering my mouse on it"
severity: major

### 3. Selected node label persists
expected: Click/select a node — its label stays visible at all zoom levels until the node is deselected, even when other labels are hidden.
result: issue
reported: "No when hoovering my mouse in a node it doesnt show its label"
severity: major

### 4. Stability badge appears after settle
expected: On first load, no "Stable" badge visible during initial warm-up. Once the simulation settles (~500ms of low motion), badge fades in (top-right of canvas).
result: issue
reported: "No badge"
severity: major

### 5. Badge hides on drag/filter/select
expected: Once badge is visible, performing any of: drag a node, change a filter, or select a node — hides the badge while the simulation reheats. Badge re-appears after settle.
result: skipped
reason: blocked by Test 4 — badge never appears, so hide-on-action behavior is unobservable

### 6. Pan/zoom does NOT hide badge
expected: With badge visible, panning the canvas (drag empty space) or zooming (wheel) leaves the badge visible — these gestures should not reheat the simulation.
result: skipped
reason: blocked by Test 4 — badge never appears, so pan/zoom no-reheat behavior is unobservable

### 7. Diagnostics popover on badge click
expected: Click the "Stable" badge → small popover opens showing rows: Avg velocity, Visible nodes, Links (and Cosmos alpha if GPU renderer active). Click again or elsewhere to dismiss.
result: skipped
reason: blocked by Test 4 — no badge to click

## Summary

total: 7
passed: 0
issues: 4
pending: 0
skipped: 3

## Gaps

- truth: "Labels fade in when zooming past ~2× fit scale; hidden at fit zoom"
  status: failed
  reason: "User reported: The labels arent visible neither when zooming or when zooming out"
  severity: major
  test: 1
  root_cause: "Label rendering pass exists only in CanvasGraphRenderer.draw() (graphRenderers.ts:281-419). CosmosGraphRenderer.draw() (lines 682-828) never reads node.label, labelFadeStartScale/EndScale, or labelOverrideIndices. Production runtime defaults to Cosmos via isWebGL2Available() (AccUsersGraph.tsx:345-347), so the new label code never runs."
  artifacts:
    - path: "app/(dashboard)/users/graphRenderers.ts"
      issue: "CosmosGraphRenderer.draw() (~line 682) does not read frame.label* fields"
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Default renderBackend selects Cosmos when WebGL2 is available (line 345-347)"
  missing:
    - "Cosmos label rendering path — overlay 2D canvas driven by Cosmos rAF tick using existing frame.label* data"
    - "Reuse fade-band math (lastFitScale * 2.0 → * 3.5) and AABB collision logic from Canvas2D pass"
  debug_session: ".planning/debug/labels-not-appearing-on-zoom.md"

- truth: "Hovering a node shows its label immediately at any zoom level"
  status: failed
  reason: "User reported: No i cant see the lavels when hoovering my mouse on it"
  severity: major
  test: 2
  root_cause: "Same Cosmos vs Canvas2D split — hover label is part of the same Canvas2D-only override pass. Additionally, Cosmos has its own hover-label hook via onPointMouseOver (AccUsersGraph.tsx:968-988) but the DOM label uses page coordinates on a position:absolute div inside a relatively-positioned wrapper, so it lands off-screen. The Canvas2D pointer handler that updates hoveredNodeRef can't fire on the Cosmos path because the canvas is pointer-events-none when renderBackend !== 'canvas2d' (line ~2213)."
  artifacts:
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Cosmos hoverLabelRef positioning uses page coords but parent uses relative positioning (line ~968-988)"
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Canvas2D pointer-events-none when in Cosmos mode (line ~2213) — Canvas2D hover override path dormant"
  missing:
    - "Hover label rendering in Cosmos path (likely consolidated into the Cosmos label overlay from gap 1)"
    - "Convert hoverLabelRef positioning from page coords to wrapper-relative coords"
  debug_session: ".planning/debug/hover-label-not-appearing.md"

- truth: "Selecting a node makes its label persist at any zoom level"
  status: failed
  reason: "User reported: No when hoovering my mouse in a node it doesnt show its label (no label visible on hover or select)"
  severity: major
  test: 3
  root_cause: "Shared root cause with gaps 1 and 2. Frame builder correctly adds selectedIndex to labelOverrideIndices (AccUsersGraph.tsx:1460-1467) and setSelectedNode call sites all call markGraphDirty(). But CosmosGraphRenderer.draw() never reads labelOverrideIndices, so the override channel for selection is dead in Cosmos mode."
  artifacts:
    - path: "app/(dashboard)/users/graphRenderers.ts"
      issue: "CosmosGraphRenderer.draw() does not read labelOverrideIndices"
  missing:
    - "Selection-label rendering in Cosmos path (consolidate with gap 1 fix)"
  debug_session: ".planning/debug/selected-label-not-persisting.md"

- truth: "Stable badge fades in once simulation settles"
  status: failed
  reason: "User reported: No badge"
  severity: major
  test: 4
  root_cause: "Cosmos stability-polling useEffect (AccUsersGraph.tsx:1170-1194) reads cosmosRendererRef.current synchronously and exits when null. Its dependency array [isReady, isSimStable] doesn't include any signal for when the renderer ref is later assigned (CosmosGraphRenderer.create is async, ref assigned in .then() at ~line 896). setIsReady(true) fires synchronously at line 1314, so the effect almost always runs before the ref is set and never re-runs. The Canvas2D fallback detector (lines 1138-1165) is gated on hasReceivedTickRef which is only set inside the organic-layout worker — that worker effect early-returns when renderBackend === 'cosmos' (line 1080-1083), so the guard is permanently false. Both detection paths inert."
  artifacts:
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Cosmos polling effect deps array missing cosmosReady signal (lines 1170-1194)"
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Async renderer ref assignment (~line 896) not reflected in any reactive state"
    - path: "app/(dashboard)/users/AccUsersGraph.tsx"
      issue: "Worker-driven hasReceivedTickRef path skipped entirely in Cosmos mode (lines 1080-1083)"
  missing:
    - "cosmosReady state set immediately after ref assignment, included in polling effect deps"
    - "Alternative: setTimeout retry loop until ref is non-null before installing 100ms interval"
  debug_session: ".planning/debug/stable-badge-not-appearing.md"

## Out-of-Phase Observations

User-reported during Test 1, but not deliverables of plans 03-01 / 03-02:

- **Module filters not working** — non-module filters work; module toggles don't filter the graph
- **Missing `company` field extraction** — every ACC user instance has a per-project company assignment that isn't being pulled
- **Last Activity unreliable** — recently restored to side panel (commit 4d5c0be) but data appears unreliable
- **Collapsible menu (UI-03) works** — confirms 03-03 implementation, even though no SUMMARY exists yet

These should be captured as a separate phase or todo list — they aren't gaps for plans 03-01 / 03-02 specifically.
