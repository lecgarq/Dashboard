---
status: complete
phase: 03-graph-ui-completion
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-05-07T00:00:00Z
updated: 2026-05-07T01:30:00Z
retest: true
---

## Current Test

[testing complete]

## Tests

### 1. Labels hidden at fit zoom, fade in past ~2× zoom
expected: At default fit zoom no labels are visible. Zoom in past ~2× fit scale → labels fade in (highest-degree nodes first, no overlapping text). Up to 200 labels max.
result: pass

### 2. Hover label at any zoom level
expected: At any zoom (including fit zoom where no other labels show), hovering a node makes that node's label appear immediately. Moving off the node hides it.
result: pass

### 3. Selected node label persists
expected: Click/select a node — its label stays visible at all zoom levels until the node is deselected, even when other labels are hidden.
result: issue
reported: "YES, BUT THE SCALE FEELS WRONG WHEN DOING TOO MUCH ZOOM LIKE ITS TOO BIG"
severity: cosmetic
note: Core behavior (label persists on select) works. Sub-issue: font scales too aggressively at high zoom levels.

### 4. Stability badge appears after settle
expected: On first load, no "Stable" badge visible during initial warm-up. Once the simulation settles (~500ms of low motion), badge fades in (top-right of canvas).
result: issue
reported: "NO THAT DOESNT APPEAR"
severity: major
note: Re-test confirms gap from prior UAT — badge still does not render in Cosmos mode despite 03-04/03-05 fix attempts.

### 5. Badge hides on drag/filter/select
expected: Once badge is visible, performing any of: drag a node, change a filter, or select a node — hides the badge while the simulation reheats. Badge re-appears after settle.
result: skipped
reason: blocked by Test 4 — user confirmed "THRES NO BADGE", behavior unobservable

### 6. Pan/zoom does NOT hide badge
expected: With badge visible, panning the canvas (drag empty space) or zooming (wheel) leaves the badge visible — these gestures should not reheat the simulation.
result: skipped
reason: blocked by Test 4 — "NO BADGE ANYWAY"

### 7. Diagnostics popover on badge click
expected: Click the "Stable" badge → small popover opens showing rows: Avg velocity, Visible nodes, Links (and Cosmos alpha if GPU renderer active). Click again or elsewhere to dismiss.
result: skipped
reason: blocked by Test 4 — "NO BADGE ANYWAY"

## Summary

total: 7
passed: 2
issues: 2
pending: 0
skipped: 3

## Gaps

- truth: "Selected label scales appropriately across zoom levels"
  status: failed
  reason: "User reported: YES, BUT THE SCALE FEELS WRONG WHEN DOING TOO MUCH ZOOM LIKE ITS TOO BIG"
  severity: cosmetic
  test: 3
  artifacts: []
  missing: []

- truth: "Stable badge fades in once simulation settles"
  status: failed
  reason: "User reported: NO THAT DOESNT APPEAR"
  severity: major
  test: 4
  artifacts: []
  missing: []
  note: "Recurrence of prior gap — 03-04/03-05 fix attempts did not resolve. See memory: rAF gate (line ~1414) blocks overlay; badge cosmosReady race."
