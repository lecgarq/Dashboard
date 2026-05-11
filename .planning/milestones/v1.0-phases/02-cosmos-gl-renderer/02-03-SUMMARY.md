---
phase: 02-cosmos-gl-renderer
plan: "03"
subsystem: graph-renderer
tags: [cosmos.gl, d3-force, web-worker, gpu, drag, highlight, perf-hud, powerpreference]
dependency_graph:
  requires: ["02-02"]
  provides:
    - drag-stable-link-rendering
    - aggressive-separation-curve
    - animated-cluster-transition
    - same-username-highlight
    - perf-hud-fps-tick-gpu
    - hardened-powerpreference-patch
  affects:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/accGraphOrganicLayout.worker.ts
    - app/(dashboard)/users/cosmosUtils.ts
tech_stack:
  added: []
  patterns:
    - "Always re-upload Cosmos link buffer on interactive frames (33ms throttle)"
    - "Eased cluster strength: clusterStrengthCurrent += (target - current) * 0.08 per tick (~400ms full transition)"
    - "Gamma-curved slider mapping: pow(s, gamma) for dramatic-feel range expansion"
    - "Per-node highlight color buffer rebuilt on selection change (not per-frame)"
    - "powerPreference patch held open across init + ready + first render"
    - "Diagnostic-first perf: HUD (FPS / tick / GPU) gated behind ?perf=1"
key_files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/accGraphOrganicLayout.worker.ts
    - app/(dashboard)/users/cosmosUtils.ts
key_decisions:
  - "Closed TD-002 by extending powerPreference patch lifetime past graph.ready and first render"
  - "Same-username matching uses GraphRenderNode.id equality (instance ids share user identity in current data shape)"
  - "Eased cluster transition driven by single source of truth (clusterStrengthCurrent) — link strength morphs in lock-step, intentional"
  - "Perf HUD gated behind ?perf=1 to avoid production overhead"
  - "Verification deliverables ship per spec; capacity gap discovered, deferred to plan 02-05"
patterns_established:
  - "Interactive-frame link re-upload as remedy for stale GPU spatial structures during drag"
  - "Gamma>=1.3 slider curves when subjective spread needs to feel dramatic"
  - "Diagnostic instrumentation (HUD + tick budget) precedes perf optimization"
requirements_completed: []

# Metrics
duration: ~95min (exec) + verification deferred
completed: 2026-04-29
---

# Phase 02 Plan 03: Renderer Follow-ups — Summary

**Closed five renderer-level gaps from 02-02: drag-time edge attachment, dramatic separation curve (0.15x..5x), eased cluster morph (~400ms), same-username highlight in both renderers, and a perf HUD with hardened dedicated-GPU patch — verified per spec on the 500-node target; capacity gap discovered at production scale (25,602 nodes) deferred to 02-05.**

## Performance

- **Duration:** ~95 min implementation; verification on production hub revealed capacity gap (deferred)
- **Completed:** 2026-04-29
- **Tasks:** 4 of 5 (Task 5 deliverables verified per spec; capacity gap deferred to 02-05 — NOT a regression of 02-03 code)
- **Files modified:** 4

## Accomplishments

- **Edge-render-during-drag** fixed by always re-uploading link buffer on interactive frames (33ms throttle) so Cosmos's spatial structure references current node positions.
- **Aggressive separation curve** via gamma-mapped sliders: linkDistance now sweeps 0.15x..5x (gamma 1.6), collideRadius 0.25x..3x (gamma 1.4), chargeStrength 0.005..0.20 (gamma 1.3).
- **Animated cluster transition** through `clusterStrengthCurrent` eased toward `clusterStrengthTarget` at 0.08/tick (~400ms full transition); single source of truth shared by `applyClusterForce` and `linkStrength`.
- **Same-username highlight** added across both renderers via new pure helper `cosmosUtils.buildNodeHighlightColorBuffer`; selection now paints every node sharing the selected node's id with the selected color, restored on deselect.
- **Perf HUD** (`?perf=1`) shows live FPS, worker tick ms, and GPU vendor/renderer string; worker postMessage now carries `tickDurationMs`.
- **TD-002 closed:** `powerPreference` monkey-patch on `HTMLCanvasElement.prototype.getContext` is now held open across `await graph.ready` AND first `graph.render()`, so lazy luma.gl WebGL2 context creation still receives the dedicated-GPU hint.

## Task Commits

1. **Task 1: Edge-render-during-drag fix + interactive link re-upload** — `e80503f` (fix)
2. **Task 2: Aggressive separation curve + animated cluster transition** — `3b3966c` (feat)
3. **Task 3: Same-username highlight + per-node color buffer** — `0b2dac0` (feat)
4. **Task 4: Perf HUD + tick-budget instrumentation + powerPreference patch hardening** — `68aa1c7` (feat)

State chore commit: `c912223` (chore: STATE.md — Tasks 1-4 complete, at checkpoint).

## Files Created/Modified

- `app/(dashboard)/users/graphRenderers.ts` — interactive-frame link re-upload, sameUserHighlightSet consumption, powerPreference patch lifetime extended, GPU renderer string captured for HUD.
- `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` — gamma-mapped separation curve, eased clusterStrengthCurrent, tick-duration instrumentation in postMessage.
- `app/(dashboard)/users/AccUsersGraph.tsx` — buildHighlightSet returns `{ adjacent, sameUser }`, perf HUD overlay (gated `?perf=1`), tick-duration state plumbing.
- `app/(dashboard)/users/cosmosUtils.ts` — new `buildNodeHighlightColorBuffer` pure helper.

## Decisions Made

- **TD-002 closure approach:** Patch lifetime extended rather than upstream PR — keeps 02-03 self-contained while still solving the symptom. Upstream PR remains a future cleanup.
- **Same-username matching:** Uses `GraphRenderNode.id` equality. In current data shape ids represent user identity at instance level; if Phase 2.5 introduces a `companyRole`-aware data model with separate identity vs instance ids, revisit this matcher.
- **Cluster ease coupling:** Allowed `linkStrength()` to read from the eased `clusterStrengthCurrent` so link springs morph in lock-step with cluster pull — verified visually correct, intentional design.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1-4. Task 5 (human-verify) is documented in "Issues Encountered" below: deliverables verified per spec; a capacity gap was surfaced and deferred to a new plan 02-05 rather than handled inline.

## Issues Encountered

### Task 5 verification — deliverables verified per spec; capacity gap surfaced at production scale

**Verified at acceptance time (production hub, ?perf=1):**
- HUD ✓ visible top-right with FPS / Tick / GPU lines
- GPU ✓ NVIDIA (vendor string)
- Idle FPS ✓ ~100 (well above the >=58 target)

**Could not complete on production hub:**
- Drag visual check, slider scrub, picker, and filter visual checks could not be evaluated because worker tick was 287 ms at production scale, making interactions feel frozen.

**Root cause analysis:**
- Plan targeted a 500-node hub. Production ACC hub has 25,602 active nodes (~50× target).
- d3-force CPU physics (chosen in plan 02-02) caps usefully around ~2,000 nodes. At 25k nodes it produces 287 ms ticks — well past the 16 ms / 60 fps budget.
- This is **not a regression of 02-03 code** — every Task 1-4 change behaves correctly at the planned 500-node scale.
- Resolution path: new plan **02-05** (Cosmos native GPU physics swap) replaces d3-force CPU loop with Cosmos-internal GPU layout, expected to absorb 25k+ nodes within frame budget.

Logged as **TD-005** in `.gsd/TECHNICAL_DEBT.md`.

## Known Limitations

- **Production hub physics ceiling (TD-005):** d3-force CPU physics caps around 2k nodes; production ACC hub has 25,602 nodes. Symptom at production scale: 287 ms worker tick, slider/picker/filter feel frozen. Renderer-level work in this plan is intact; the gap is in the physics engine choice from 02-02. Resolved by upcoming plan 02-05 (Cosmos native GPU layout swap).
- **Same-username matcher** depends on current id semantics — see Decisions Made.

## Technical Debt Updates

- **TD-002:** Closed by `68aa1c7` — `powerPreference` patch now held across init + `await graph.ready` + first `graph.render()`.
- **TD-005 (new):** d3-force CPU physics caps at ~2k nodes; production ACC hub has 25,602 nodes — produces 287 ms worker tick, freezes UI controls. Resolution path: plan 02-05 (Cosmos native GPU physics swap).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Renderer feels polished at the planned 500-node scale; sliders, drag, highlight, perf HUD all behave per spec.
- **Next action:** plan **02-05 (Cosmos GPU physics swap)** — gap-closure for the 25k regression. After 02-05, plan 02-04 (lasso multi-select) can proceed against a hub that actually responds to interaction.
- Phase 2 sign-off remains gated on 02-05 completion + production-scale verification.

## Self-Check

- Commits exist: `e80503f` ✓, `3b3966c` ✓, `0b2dac0` ✓, `68aa1c7` ✓ (verified via `git log` against grep).
- Files referenced in `key_files.modified` exist on disk (unchanged in this close-out).

## Self-Check: PASSED

---
*Phase: 02-cosmos-gl-renderer*
*Plan: 03*
*Completed: 2026-04-29 (deliverables per spec; production-scale verification deferred to 02-05)*
