---
phase: 03-graph-ui-completion
plan: 02
subsystem: graph-ui
tags: [stability, badge, motionMetric, cosmos, ui-02, accessibility]
requires:
  - phase: 03-graph-ui-completion
    provides: "AccUsersGraph render frame plumbing (motionMetric state, cosmosRendererRef API access, isReady gating)"
provides:
  - "isSimStable state with sustained-below-threshold debounce (Canvas2D + Cosmos paths)"
  - "stableStartedAtRef + hasReceivedTickRef detection refs"
  - "resetStability() helper wired into drag/filter/select reheat paths"
  - "Stable badge JSX with aria-live=polite, motion-reduce:transition-none"
  - "Diagnostics popover with avg velocity, visible nodes, link count, Cosmos alpha"
affects:
  - "AccUsersGraph (overlay layer above canvas, alongside perf HUD)"

tech-stack:
  added: []
  patterns:
    - "Sustained-below-threshold debounce via Date.now() + setTimeout self-recheck (handles worker self-pause case)"
    - "Dual-path stability detection: tick-driven (Canvas2D) + 100ms poll (Cosmos)"
    - "Warm-up guard ref (hasReceivedTickRef) prevents badge flash before first tick"

key-files:
  created:
    - .planning/phases/03-graph-ui-completion/03-02-SUMMARY.md
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx

key-decisions:
  - "STABLE_THRESHOLD = 0.0001 (slightly looser than worker self-pause 0.00008) — RESEARCH default, no tuning"
  - "STABLE_DURATION_MS = 500 — RESEARCH default"
  - "Cosmos alpha threshold = 0.005 AND !isSimulationRunning() — RESEARCH default; both methods exist on CosmosGraphRenderer (graphRenderers.ts:925/932)"
  - "Cosmos polling cadence = 100ms setInterval — matches RESEARCH recommendation"
  - "Lasso polygon select does NOT call resetStability — plan specified setSelectedNode sites only; lasso uses separate polygonSelection state, multi-select UX, not a 'pick a node' interaction"
  - "Diagnostics popover uses simple absolute div (no Radix dependency) — RESEARCH 'Don't Hand-Roll' guidance allowed simple approach since shadcn Popover not already in active use here"
  - "Diagnostic fields: avg velocity (.toFixed(6)), visible nodes (visibleCount state), link count (motionMetric.linkCount), Cosmos alpha (when active)"

patterns-established:
  - "Dual-renderer stability detection: tick-driven for worker path, polling for GPU path"
  - "Stability reset is a single resetStability() callback called from N specific user-action call sites — never coupled to redraw or view-transform paths"

requirements-completed: [UI-02]

duration: 6 min
completed: 2026-05-06
---

# Phase 03 Plan 02: Stability Badge Summary

Stability badge for AccUsersGraph that fades in once worker velocity (Canvas2D) or Cosmos alpha (GPU) sustains below threshold for 500ms, hides on drag/filter/select, ignores pan/zoom, and exposes diagnostics on click.

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-06T22:56:16Z
- **Completed:** 2026-05-06T23:02:29Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- UI-02 satisfied: badge appears on stability, hides on drag/filter/select, stays during pan/zoom, doesn't appear during initial warm-up
- Worker remains subscribed (NOT terminated) — badge is purely a UI signal layered on existing `motionMetric` state
- Dual-path detection: Canvas2D uses tick-driven debounce on `motionMetric.averageVelocity`; Cosmos uses 100ms polling on `getSimulationAlpha()` + `isSimulationRunning()`
- Diagnostics popover with live readings (avg velocity, visible nodes, link count, Cosmos alpha when applicable)

## Task Commits

1. **Task 1: stability detection state and debounce effects** — `86f11f9` (feat)
2. **Task 2: reheat triggers (drag/filter/select)** — `661a01e` (feat)
3. **Task 3: Stable badge JSX + diagnostics popover** — `d09d4e1` (feat)

## Files Created/Modified

- `app/(dashboard)/users/AccUsersGraph.tsx`
  - +`Check` import from `lucide-react`
  - +`isSimStable` / `stableStartedAtRef` / `hasReceivedTickRef` / `showStableDiagnostics` state and refs
  - +`resetStability` useCallback helper
  - +`hasReceivedTickRef.current = true` in worker `onmessage` tick handler (warm-up guard)
  - +Canvas2D stability debounce useEffect (watches `motionMetric.averageVelocity`)
  - +Cosmos alpha polling useEffect (100ms setInterval; gates on `cosmosRendererRef.current`)
  - +`resetStability()` calls in: Canvas2D node-drag pointerdown, filter-change effect, Canvas2D `handlePointerUp` positive select, Cosmos `onNodeSelectCallback` positive index
  - +NOTE comments on `handleWheel` and pan branch in `handlePointerDown` documenting the no-reheat contract
  - +Stable badge JSX (`absolute top-3 right-3 z-30`, fade-opacity transition, motion-reduce honored)
  - +Diagnostics popover JSX (absolute div, conditional on `isSimStable && showStableDiagnostics`)

## Decisions Made

### Final tuning vs RESEARCH defaults

| Param | RESEARCH default | Adopted | Notes |
|-------|------------------|---------|-------|
| STABLE_THRESHOLD | 0.0001 | 0.0001 | No tuning — looser than worker's 0.00008 self-pause so badge can settle before worker fully halts |
| STABLE_DURATION_MS | 500 | 500 | No tuning |
| Cosmos alpha threshold | 0.005 | 0.005 | No tuning |
| Cosmos poll cadence | 100ms | 100ms | No tuning |

### Cosmos API method names

Verified against `graphRenderers.ts`:
- `getSimulationAlpha(): number` (line 925)
- `isSimulationRunning(): boolean` (line 932)

Both invoked with optional-chaining + defaults in case of future API drift: `cosmos.getSimulationAlpha?.() ?? 1`, `cosmos.isSimulationRunning?.() ?? true`.

### Diagnostics popover content

Used four rows: `Avg velocity`, `Visible nodes` (existing `visibleCount` state — no helper needed), `Links` (from `motionMetric.linkCount`), and a conditional `Cosmos alpha` row only rendered when `cosmosRendererRef.current` is truthy.

### Closure capture for Cosmos onNodeSelectCallback

`renderer.onNodeSelectCallback` is assigned inside the renderer-init useEffect (deps `[renderBackend]`). It captures `resetStability` at init time. Since `resetStability` is `useCallback(..., [])` with empty deps it's referentially stable, so the closure captures a stable reference — no stale-state risk. Did NOT add `resetStability` to that effect's dep array because doing so would force an unnecessary renderer recreate cycle when stability semantics change (which they won't — stable callback).

## Deviations from Plan

### Deliberate scope decisions (not auto-fixes)

**1. Lasso polygon-select not wired to resetStability**

- Plan said: "When `setSelectedNode` is called with a non-null value (user picked a node via click, lasso single-select, or search), call `resetStability()`"
- Reality: lasso in this codebase produces `polygonSelection` state, not `setSelectedNode`. It is a multi-node summary panel, not a single-node pick. The plan's "lasso single-select" framing doesn't match the implementation.
- Decision: Not wired. The four `setSelectedNode(state)` non-null sites that DO exist (Canvas2D `handlePointerUp`, Cosmos `onNodeSelectCallback`) are wired.
- Impact: drawing a lasso to summarize a region will not reheat. This matches the lasso UX (it's a read-only inspection tool, not a node-pick).

**2. No `filtersAffectMembership` gate on filter-change reheat**

- Plan offered an optional optimization: only reheat when filter changes alter visible-node set.
- Decision: Adopted the plan's "simplest" path — reheat on every filter-change effect run. Stability re-establishes within 500ms anyway, and writing a correct membership-diff predicate would risk subtle no-reheat bugs.

### Auto-fixed Issues

None during this plan — all three tasks executed cleanly with `npx tsc --noEmit` passing after each.

---

**Total deviations:** 0 auto-fixes; 2 deliberate scope-narrowing decisions documented above.
**Impact on plan:** Plan executed essentially as written. The two scope decisions are documented for verification in plan 03 UAT.

## Issues Encountered

None.

## Verification

- `npx tsc --noEmit` — passed after each task (clean both incrementally and at the end)
- `npm run lint` — pre-existing parsing errors in unrelated files (same scope-boundary as plan 01); no errors or warnings on `AccUsersGraph.tsx`
- Manual smoke (deferred to plan 03 UAT per plan's verification section): badge fade-in after warm-up, drag/filter/select hide, pan/zoom don't reheat, popover opens on click, worker stays alive

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- 03-02 ships UI-02. Plan 03 (final UAT / phase rollup) can run end-to-end manual smoke against this badge plus 03-01's labels.
- No blockers introduced.
- Position vs perf HUD: HUD is `top-2 right-2 z-50`, badge is `top-3 right-3 z-30`. They will visually stack with HUD above badge when `?perf=1` is in URL — confirm acceptability during plan 03 human-verify.

---
*Phase: 03-graph-ui-completion*
*Completed: 2026-05-06*

## Self-Check: PASSED

- `.planning/phases/03-graph-ui-completion/03-02-SUMMARY.md` — FOUND
- `app/(dashboard)/users/AccUsersGraph.tsx` — FOUND
- Commit `86f11f9` — FOUND in `git log`
- Commit `661a01e` — FOUND in `git log`
- Commit `d09d4e1` — FOUND in `git log`
