---
phase: 02-cosmos-gl-renderer
plan: "05"
subsystem: graph-renderer
tags: [cosmos.gl, gpu-physics, force-directed, simulation, drag, slider, 25k-nodes, td-005]
dependency_graph:
  requires: ["02-03"]
  provides:
    - cosmos-native-gpu-physics
    - usephysics-renderer-path
    - controlsToSimulationConfig-mapping
    - buildClusterIdsFromNodes-helper
    - cosmos-native-drag-pickup
    - sim-alpha-perf-hud
    - canvas2d-fallback-d3force-preserved
  affects:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/cosmosUtils.ts
    - app/(dashboard)/users/accGraphOrganicLayout.worker.ts
tech_stack:
  added: []
  patterns:
    - "Cosmos-native GPU force layout (enableSimulation:true) replaces d3-force CPU loop on dedicated-GPU path"
    - "Slider→sim mapping is a pure function (controlsToSimulationConfig) with gamma curves over Cosmos's documented sim* fields"
    - "Cluster ids built once on data load via dense integer mapping (buildClusterIdsFromNodes); only simulationCluster *strength* changes per slider"
    - "Re-warm protocol: pair graph.start(α) + graph.render(α) at every re-warm site (drag start/end, link arrival, slider apply)"
    - "Cosmos config mutation uses setConfigPartial — never setConfig (destructive merge)"
    - "Worker spawn gated on Canvas2D-only path; dedicated-GPU clients never start the d3-force worker"
key_files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/cosmosUtils.ts
    - app/(dashboard)/users/cosmosUtils.test.ts
    - app/(dashboard)/users/accGraphOrganicLayout.worker.ts
key_decisions:
  - "Closed TD-005 by adopting Cosmos's native GPU force layout instead of porting d3-force off the main thread; engine swap, not loop optimization"
  - "Dedicated-GPU detection is the gate for usePhysics — non-dedicated clients still use d3-force worker so Canvas2D fallback remains usable"
  - "Slider mapping uses gamma curves (1.3-1.6) over documented Cosmos sim* fields; pure-function helper kept in cosmosUtils for unit testability"
  - "Three Cosmos API traps documented as institutional knowledge (start vs render, setConfig vs setConfigPartial, sim run-flag re-arming)"
  - "Slider tuning approved by user with note that separation feel and organic-vs-cluster transition need additional refinement — deferred to TD-006 rather than re-blocking checkpoint"
patterns_established:
  - "Cosmos GPU-physics path is the production renderer at scale; d3-force worker is fallback only"
  - "Always pair start(α) + render(α) when re-warming a Cosmos sim that may have already cooled past ALPHA_MIN"
  - "Always use setConfigPartial for Cosmos config mutations after init — setConfig is destructive"
  - "Pure helpers in cosmosUtils (buildClusterIdsFromNodes, controlsToSimulationConfig) are unit-tested and decouple slider semantics from rendering"
requirements_completed: []

# Metrics
duration: ~4h (planned ~95 min execute path + extended debug cycle for grey-canvas regression at 25k scale)
completed: 2026-04-29
---

# Phase 02 Plan 05: Cosmos GPU Physics Swap — Summary

**Replaced the d3-force CPU worker with Cosmos.gl's native GPU force-directed simulation on the dedicated-GPU path, restoring interactive behavior on the 25,559-node production ACC hub (sliders, drag, pick, same-user highlight) and closing TD-005. Three Cosmos API traps surfaced and were resolved during the debug cycle and are documented below as institutional knowledge.**

## Performance

- **Duration:** ~4h end-to-end (5-task execute path + extended debug cycle on grey-canvas regression at production scale)
- **Completed:** 2026-04-29
- **Tasks:** 5 of 5 (Task 6 human-verify checkpoint passed: user "approved it needs refinement but we can see it later")
- **Files modified:** 5

## Accomplishments

- **Cosmos-native GPU physics live at 25k+ nodes.** `CosmosGraphRenderer` now boots with `enableSimulation: true` on the dedicated-GPU path, exposing `setSimulationConfig`, `setInitialPositions`, `setPointClusters`, `setClusterPositions`, `getSimulationAlpha`, `isSimulationRunning`. Position feed via `setPointPositions` is suppressed in physics mode so Cosmos owns positions.
- **Slider semantics ported to Cosmos sim fields.** `controlsToSimulationConfig` (pure helper, unit-tested) maps `[separation, clusterStrength]` 0–100 sliders to `simulationRepulsion` (0.1–2.0, γ=1.4), `simulationLinkDistance` (4–40, γ=1.6), `simulationLinkSpring` (1.5→0.5, γ=1.3), `simulationCluster` (0–1). Round-trip is renderer-direct in physics mode; worker postMessage path retained as Canvas2D fallback.
- **Cluster wiring through Cosmos APIs.** `buildClusterIdsFromNodes(nodes, 'role')` returns dense integer ids (unit-tested for density and identity), pushed once via `setPointClusters` on data load. Only the strength changes per slider — ids stable.
- **Cosmos-native drag.** `enableDrag:true` with `onDragStart`/`onDragEnd` calling `graph.start(α)+graph.render(α)` to re-heat (0.3) and settle (0.05). No worker round-trip in physics mode; pointer-drag worker calls short-circuited.
- **Click-pick + same-user highlight preserved.** 02-03's `buildNodeHighlightColorBuffer` still works because `draw()` continues to upload colors per frame in physics mode.
- **Worker gated to Canvas2D path.** d3-force worker only spawns when `usePhysicsRef.current === false`.
- **Perf HUD differentiates paths.** GPU mode shows `Sim α: 0.xxx / 25559 nodes`; Canvas2D mode shows `Tick: Xms / N springs`.
- **TD-005 closed.** 25,559-node hub reaches stable layout, sliders are responsive, drag releases settle, click-on/click-off behaves.

## Task Commits

### Plan tasks (5)

1. **Task 1: usePhysics path on CosmosGraphRenderer** — `d8e3e46` (feat)
2. **Task 2: Initial position seed + cluster proxies + buildClusterIdsFromNodes** — `9c5a389` (feat)
3. **Task 3: Slider onChange routes through Cosmos GPU physics** — `dda3bc7` (feat)
4. **Task 4: Drag/pick + short-circuit pointer-drag worker calls** — `b57fa85` (feat)
5. **Task 5: Gate worker spawn + perf HUD reads simulation alpha** — `e840613` (feat)

### Debug-cycle fix commits (post-Task 5; grey-canvas regression at 25k scale)

6. **Build link buffer on main thread for GPU-physics path** — `900f821` (fix) — H1/H3: link projection paths weren't running because the worker no longer ran in GPU mode; ported `projectTopologyLinksToIndexPairs` to main thread and wired it into both renderer-init and data-load paths.
7. **Gated `[02-05-DEBUG]` instrumentation** — `0914b31` (chore) — proved code paths fire in expected order; eliminated H1/H2/H3/H4/H7.
8. **`render(alpha)` instead of `start(alpha)` (later reverted-in-spirit by dd12c2b)** — `a8cd0db` (fix) — discovered Cosmos's rAF loop dies after the first empty-data init; `render()` re-spins it. Trap #1.
9. **Use `setConfigPartial` — `setConfig` wipes drag/pick handlers** — `a6afd2e` (fix) — every slider-driven `setSimulationConfig` was destructively resetting `enableDrag`, `onDragStart/End`, `onPointClick`, hover handlers to defaults. Trap #2.
10. **Pair `start(α) + render(α)` — sliders/drag-drop/deselect dead after sim cools** — `dd12c2b` (fix) — Cosmos's `frame()` calls `end()` once `alpha < ALPHA_MIN`, flipping `isSimulationRunning=false` permanently; `render(α)` alone pumps the loop but leaves the run-flag false so `runSimulationStep` early-exits the force pass. Must call `start(α)` (which arms the flag) AND `render(α)` (which pumps the loop). Trap #3.
11. **Widen separation range, expand spaceSize, decouple worm-shape forces** — `2978186` (fix) — final tuning pass per checkpoint feedback; user approved with note that further refinement is wanted but non-blocking.

**Plan metadata commit:** (this commit) — `docs(02-05): summary, close TD-005, log TD-006 (slider tuning followup)`.

## Files Created/Modified

- `app/(dashboard)/users/graphRenderers.ts` — `usePhysics` option, `setSimulationConfig`/`setInitialPositions`/`setPointClusters`/`setClusterPositions`/`getSimulationAlpha`/`isSimulationRunning`, drag callbacks (`enableDrag` + `onDragStart/End` paired `start+render`), `setConfigPartial` everywhere, render-loop fixes, link-arrival re-warm in `draw()`, spaceSize tuning.
- `app/(dashboard)/users/AccUsersGraph.tsx` — `usePhysicsRef`, slider effect routes to `setSimulationConfig` in physics mode (skips worker postMessage), main-thread link projection, `setPointClusters` on data load, perf HUD branches on physics-vs-worker, drag short-circuit when physics active, fitView-on-first-physics-load.
- `app/(dashboard)/users/cosmosUtils.ts` — `buildClusterIdsFromNodes`, `controlsToSimulationConfig`, `projectTopologyLinksToIndexPairs` (lifted from worker for main-thread use).
- `app/(dashboard)/users/cosmosUtils.test.ts` — vitest coverage for `buildClusterIdsFromNodes` (density + same-key identity + undefined for missing key) and `controlsToSimulationConfig` (endpoint values + monotonicity sweep).
- `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` — gated to Canvas2D-only path; behavior otherwise unchanged.

## Decisions Made

- **Engine swap, not loop optimization.** d3-force CPU is structurally bounded around 2k nodes; tweaking it for 25k would have cost more time than adopting the engine that's already loaded.
- **`usePhysics` is gated by dedicated-GPU detection** — clients without a dedicated GPU keep the d3-force worker so the Canvas2D fallback remains a real product path, not a degraded one.
- **Slider mapping kept as a pure function in `cosmosUtils.ts`** — unit-testable, replaceable without touching React, and the gamma curves are documented in code.
- **Final slider tuning (commit 2978186) approved with refinement deferred** — user explicitly accepted: "approved it needs refinement but we can see it later" — logged as TD-006 so the followup doesn't drift.

## Three Cosmos.gl API Traps — Institutional Knowledge

These cost ~3h of debug cycles on the 25k-node hub. Document and flag in any future Cosmos work.

### Trap #1 — `start(α)` vs `render(α)`: only `render()` spins the rAF loop
- **Surface:** `Graph.start(α?)` and `Graph.render(α?)` look like aliases. They are not.
- **Reality (cosmos.gl@3.0.0-beta.8 `dist/index.js` 6033–6053, 6396–6398, 6537–6562):**
  - `start(α)` sets `store.alpha = α` and `store.isSimulationRunning = true`. **Does not touch the rAF loop.**
  - `render(α)` calls `update(α)` (sets `store.alpha`, NOT `isSimulationRunning`) and `startFrames()`. **Spins the rAF loop.** Does NOT set the run flag.
- **Failure mode if you only call `start(α)`:** flag is set but the rAF loop is dormant from the empty-init or post-cool state — no frames render. Symptom: grey canvas at 25k nodes despite `Sim α` updating in HUD-side polling but no visual motion.
- **Fix commit (rAF revival):** `a8cd0db`.

### Trap #2 — `setConfig` vs `setConfigPartial`: `setConfig` is destructive
- **Surface:** `Graph.setConfig(partial)` reads like a partial merge.
- **Reality (`dist/index.js` 5780–5797):** `setConfig(t)` does `Object.assign(this.config, defaults)` THEN merges `t`. It **resets every key not present in `t` to its default**. Drag callbacks, click callbacks, hover callbacks all become `undefined` on every call.
- **`setConfigPartial(t)` is the actual partial-merge** — preserves untouched keys.
- **Failure mode:** drag and pick worked once on init, died on the very first slider change because `setSimulationConfig({simulationRepulsion: ...})` reset `enableDrag=false`, `onDragStart=undefined`, `onPointClick=undefined`.
- **Fix commit:** `a6afd2e`. **Rule:** never call `setConfig` after init. Always `setConfigPartial`.

### Trap #3 — `start()` + `render()` interaction with Cosmos's internal `end()`
- **Surface:** Even after fixing Traps #1 and #2, sliders moved values in `this.config` but the canvas didn't react. Drag drops didn't settle. Click-off didn't refresh highlight.
- **Reality (`dist/index.js` 6551–6562, 6571–6577, 6605–6612):**
  - `frame()` (the rAF body) calls `end()` once `alpha < ALPHA_MIN`. `end()` flips `store.isSimulationRunning = false` and parks `simulationProgress = 1`.
  - From that point on, `runSimulationStep(t)` early-exits its force pass on `(t || isSimulationRunning && !zoomBusy)`. With `t=false` (default) and `isSimulationRunning=false`, **forces never recompute** — config mutations have no effect.
  - `render(α)` updates `store.alpha` and pumps the loop, **but does not re-arm `isSimulationRunning`**. Only `start(α)` does that.
- **Failure mode:** initial sim cools to ALPHA_MIN, `end()` fires, run flag latches to `false`. Every subsequent slider change / drag-end / link arrival pumps the loop via `render(α)` but the force pass is dead.
- **Fix commit:** `dd12c2b`. **Rule:** at every re-warm site (`onDragStart`, `onDragEnd`, link-arrival re-warm in `draw()`, `setSimulationConfig`), pair `graph.start(α)` (arms the run flag) with `graph.render(α)` (pumps the loop). Both are required after a previous `end()`.

These three together explain why "grey canvas / Sim α: 0.000 / 25559 nodes / 0 springs" persisted across `900f821`, `0914b31`, `a8cd0db`, `a6afd2e` and only fully resolved at `dd12c2b`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Link projection moved to main thread for GPU-physics path**
- **Found during:** Task 5 (post-merge runtime — grey canvas at 25k)
- **Issue:** With the worker gated off in GPU mode, the link buffer was never built — Cosmos rendered 0 springs because nothing fed `setLinks`. Plan assumed Cosmos would receive the link buffer the worker had been producing.
- **Fix:** Lifted `projectTopologyLinksToIndexPairs` from the worker into `cosmosUtils.ts` and called it from both the renderer-init `.then` and the data-load `useEffect` in `AccUsersGraph.tsx`.
- **Files:** `cosmosUtils.ts`, `AccUsersGraph.tsx`.
- **Commit:** `900f821`.

**2. [Rule 1 - Bug] rAF loop dead after empty-init `start(α)` (Trap #1)**
- **Found during:** Task 5 verification
- **Issue:** Calling only `graph.start(α)` to re-warm leaves the rAF loop dormant; canvas stays grey.
- **Fix:** Switched all GPU-physics re-warm sites to `graph.render(α)`.
- **Commit:** `a8cd0db`.

**3. [Rule 1 - Bug] `setConfig` wiped drag/pick handlers (Trap #2)**
- **Found during:** post-`a8cd0db` re-verify — drag and pick stopped working after first slider apply.
- **Fix:** Replaced all `graph.setConfig(...)` mutations with `graph.setConfigPartial(...)`.
- **Commit:** `a6afd2e`.

**4. [Rule 1 - Bug] Sim run-flag not re-armed after cool-down (Trap #3)**
- **Found during:** post-`a6afd2e` re-verify — sliders moved values but no visible motion; drag drops didn't settle.
- **Fix:** Paired `graph.start(α) + graph.render(α)` at every re-warm site (`onDragStart`, `onDragEnd`, link-arrival re-warm in `draw()`, `setSimulationConfig`).
- **Commit:** `dd12c2b`.

**5. [Rule 2 - Missing critical] Slider feel tuning at 25k scale**
- **Found during:** Task 6 human-verify checkpoint — user signaled separation range too narrow and organic↔cluster transition too snap at production scale.
- **Fix:** Widened separation range, expanded `spaceSize`, decoupled the worm-shape force coupling.
- **Commit:** `2978186`.
- **User decision:** approved with refinement deferred → logged as TD-006.

---

**Total deviations:** 5 auto-fixed (1 blocking, 3 bugs, 1 missing-critical tuning). All necessary for plan success at 25k scale. No scope creep — every fix targets the plan's success criteria.
**Impact on plan:** Tasks 1–5 implementation matched the plan; the production-scale debug cycle that followed exposed Cosmos API behavior the plan couldn't have anticipated, all resolved within the same plan's commit chain.

## Issues Encountered

- **Grey-canvas regression at 25k nodes after Task 5 merge** — surfaced three cascading Cosmos.gl behaviors (Traps #1–#3 above). Resolved across `900f821 → 0914b31 → a8cd0db → a6afd2e → dd12c2b`. Full debug log in `.planning/debug/02-05-gpu-physics-grey-canvas.md`.
- **Slider feel at 25k** — addressed in `2978186`; user approved with explicit note that further refinement is wanted (TD-006).

## Technical Debt Updates

- **TD-005 (CLOSED):** d3-force 25k-node regression resolved by Cosmos-native GPU layout. Closing commit `2978186` (final tuning, after which user approved). Date: 2026-04-29.
- **TD-006 (NEW):** Cosmos slider feel refinement — separation range and organic-vs-cluster transition need additional tuning per user feedback during 02-05 verification. Non-blocking; user explicitly deferred.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 25k-node ACC hub is interactive end-to-end on the dedicated-GPU path; sliders, drag, pick, same-user highlight, perf HUD all behave.
- **Plan 02-04 (lasso multi-select)** is unblocked and can proceed against a responsive hub.
- **TD-006 (slider feel refinement)** is a small UX pass that can be folded into 02-04 or handled standalone — non-blocking.
- Phase 2 sign-off contingent on 02-04 completion.

## Self-Check

- Commits exist (verified by `git log --oneline`):
  - Plan tasks: `d8e3e46` ✓, `9c5a389` ✓, `dda3bc7` ✓, `b57fa85` ✓, `e840613` ✓
  - Debug cycle: `900f821` ✓, `0914b31` ✓, `a8cd0db` ✓, `a6afd2e` ✓, `dd12c2b` ✓, `2978186` ✓
- Files referenced in `key_files.modified` exist on disk.
- TypeScript clean per prior agent verification (per executor constraint).

## Self-Check: PASSED

---
*Phase: 02-cosmos-gl-renderer*
*Plan: 05*
*Completed: 2026-04-29 — TD-005 closed, TD-006 logged for deferred tuning refinement*
