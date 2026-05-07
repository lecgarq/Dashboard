---
status: complete
phase: 03-graph-ui-completion
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-05-07T00:00:00Z
updated: 2026-05-07T00:30:00Z
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
  artifacts: []
  missing: []

- truth: "Hovering a node shows its label immediately at any zoom level"
  status: failed
  reason: "User reported: No i cant see the lavels when hoovering my mouse on it"
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Selecting a node makes its label persist at any zoom level"
  status: failed
  reason: "User reported: No when hoovering my mouse in a node it doesnt show its label (no label visible on hover or select)"
  severity: major
  test: 3
  artifacts: []
  missing: []

- truth: "Stable badge fades in once simulation settles"
  status: failed
  reason: "User reported: No badge"
  severity: major
  test: 4
  artifacts: []
  missing: []

## Out-of-Phase Observations

User-reported during Test 1, but not deliverables of plans 03-01 / 03-02:

- **Module filters not working** — non-module filters work; module toggles don't filter the graph
- **Missing `company` field extraction** — every ACC user instance has a per-project company assignment that isn't being pulled
- **Last Activity unreliable** — recently restored to side panel (commit 4d5c0be) but data appears unreliable
- **Collapsible menu (UI-03) works** — confirms 03-03 implementation, even though no SUMMARY exists yet

These should be captured as a separate phase or todo list — they aren't gaps for plans 03-01 / 03-02 specifically.
