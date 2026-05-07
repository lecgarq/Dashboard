# Technical Debt Log

Tracks known sub-optimal implementations, scaling concerns, and known workarounds. Update after each completed plan.

---

## 2026-04-29 — Phase 02 Plan 02 (D3-Force + Cosmos GPU)

### TD-001: Float32Array snapshot posting won't scale to 100K+ nodes
- **Location:** `app/(dashboard)/users/accGraphOrganicLayout.worker.ts`
- **Pattern:** Worker allocates a fresh `Float32Array` of size `nodeCount * 2` every 16ms (60fps) and `postMessage`s it as a transferable.
- **Current cost:** ~500 nodes × 2 × 4 bytes × 60Hz = ~240 KB/s allocation churn. Acceptable.
- **Scaling cost:** 100K nodes = ~48 MB/s allocation. GC pressure becomes unacceptable.
- **Mitigation when needed:** Double-buffer two persistent Float32Arrays in worker, ping-pong via `postMessage` + Atomics, or move to `SharedArrayBuffer`.

### TD-002: powerPreference hint via monkey-patching HTMLCanvasElement.prototype.getContext — CLOSED 2026-04-29 (commit 68aa1c7)
- **Location:** `app/(dashboard)/users/graphRenderers.ts` `CosmosGraphRenderer.create()`
- **Why:** Cosmos.gl@3.0.0-beta.8 hardcodes luma.gl device creation with no `powerPreference` config option. We monkey-patch the prototype during graph construction and restore in `finally`.
- **Original risk:** If Cosmos changes its device-creation timing (e.g. lazy WebGL context after `await graph.ready` returns), the patch window may close before the context is requested.
- **Resolution (Phase 02 Plan 03, commit 68aa1c7):** Patch `finally { restore }` moved to AFTER `await graph.ready` AND after first `graph.render()`, so the patch window now spans the full init + ready + first-render path. Lazy luma.gl WebGL2 context creation still observes the `powerPreference: high-performance` hint. Verified via HUD GPU line reading `NVIDIA` vendor on dual-GPU laptop.
- **Future cleanup (optional):** Upstream PR on cosmos.gl to expose `powerPreference` in Graph config — would remove the monkey-patch entirely. Not blocking.

### TD-003: Firefox/ANGLE renderer string is non-deterministic for GPU verification
- **Symptom:** Firefox returns `ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0)` even on machines with RTX 5070 Ti.
- **Why:** Firefox routes WebGL through Google's ANGLE library on Windows, which translates GPU identity strings to a Direct3D 11 baseline name. The model number is **not reliable** in Firefox.
- **Reliable signal:** vendor field (`NVIDIA` vs `Intel`) — that confirms dedicated vs integrated.
- **Documentation only — no code change needed.**

### TD-004: Cluster IDs derived only from `roles[0]`
- **Location:** `app/(dashboard)/users/AccUsersGraph.tsx` `restartOrganicLayout`
- **Limitation:** Multi-role users are clustered by their first role only.
- **Resolution:** Either (a) UI lets user pick which role drives clustering, or (b) compute a role-similarity vector and cluster on that. Defer to 02-03 or Phase 4.

---

## 2026-04-29 — Phase 02 Plan 03 (Renderer Follow-ups close-out)

### TD-005: d3-force CPU physics caps at ~2k nodes; production ACC hub has 25,602 nodes — CLOSED 2026-04-29 (commit 2978186)
- **Location:** `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` (d3-force `forceSimulation` introduced in plan 02-02)
- **Symptom (observed during 02-03 Task 5 verification):** On the production ACC hub (25,602 active nodes — ~50× the 02-02/02-03 plan target of 500), worker tick duration is **287 ms**. This is ~18× the 16 ms / 60 fps budget. Slider scrub, node picker, and filter interactions feel visually frozen because each tick blocks the message loop that drives those UI updates. HUD ✓ visible, GPU ✓ NVIDIA, idle FPS ✓ ~100 — pure physics-loop bottleneck, not renderer or GPU.
- **Why this is not a 02-03 regression:** Every Task 1-4 deliverable (drag link re-upload, gamma separation curve, eased cluster, same-username highlight, perf HUD, hardened powerPreference) behaves correctly at the planned 500-node scale. The constraint is the d3-force CPU physics engine choice from plan 02-02, which never claimed 25k-node capacity.
- **Resolution (Phase 02 Plan 05, closing commit `2978186`):** Replaced d3-force CPU loop with Cosmos.gl native GPU force-directed layout (`enableSimulation: true`) on the dedicated-GPU path. Slider onChange now routes through `CosmosGraphRenderer.setSimulationConfig` (`setConfigPartial` over `simulationRepulsion`/`simulationLinkSpring`/`simulationLinkDistance`/`simulationCluster`) instead of worker postMessage. Drag is Cosmos-native (`enableDrag:true` + `onDragStart`/`onDragEnd` paired with `start(α)+render(α)`). Worker spawn gated to Canvas2D-only path so non-dedicated-GPU clients still get the d3-force fallback. Verified at the 25,559-node production hub: layout reaches stable look within ~5s, sliders perturb the layout in real time, drag releases settle, click-on/click-off behave, same-user highlight from 02-03 preserved.
- **Three Cosmos API traps surfaced and documented in 02-05-SUMMARY.md** (institutional knowledge): (1) `start(α)` arms run-flag; `render(α)` spins rAF loop — both required, neither aliases the other. (2) `setConfig` is destructive (resets defaults then merges); use `setConfigPartial` for true partial mutation. (3) After Cosmos's internal `end()` flips `isSimulationRunning=false` at ALPHA_MIN, must pair `start(α)+render(α)` at every re-warm site to revive the force pass.
- **Followup (TD-006, non-blocking):** User approved with note that separation feel and organic-vs-cluster transition need additional tuning — deferred per user.

### TD-007: Remove vestigial Canvas2D renderer branch
- **Location:** `app/(dashboard)/users/AccUsersGraph.tsx` (Canvas2D rendering branch, `renderBackend` auto-detect, `view.current` Canvas2D camera, `posRef.current` seed-only fallback paths); `app/(dashboard)/users/graphRenderers.ts` (CanvasGraphRenderer class); the dual-path forward-projection scaffolding added in `1f47874`.
- **Surfaced:** 02-04 Task 4 human-verify checkpoint (2026-04-29) — user explicitly noted "there's no Canvas 2D anymore, only GPU."
- **What's vestigial:**
  1. `CanvasGraphRenderer` class and its render loop
  2. `renderBackend` auto-detect that picks Canvas2D when WebGL2 is unavailable (REND-04 fallback was a Phase 2 plan-level requirement, but production target is dedicated-GPU-only per user)
  3. The Canvas2D branch of the forward-projection hit-test (`posRef.current` + `view.current` path) added in `1f47874` — once Canvas2D is gone, only the Cosmos `getPointPositions() + spaceToScreenPosition()` path remains
  4. `view.current` Canvas2D camera state and its sync logic
  5. Pointer/drag handlers' Canvas2D-specific code paths
  6. Worker spawn gate (currently spawns d3-force worker only on Canvas2D path) becomes unconditional-skip — d3-force worker becomes dead code
- **Why kept now:** Phase 2 success criteria #4 still references Canvas2D fallback (REND-04). Removal is a meaningful surface-area cut and warrants its own plan with explicit decision to deprecate REND-04. Recording as debt now so it's not forgotten.
- **Resolution path:** Standalone phase or plan that (a) updates ROADMAP.md / REQUIREMENTS.md to deprecate REND-04, (b) deletes `CanvasGraphRenderer`, (c) collapses the dual forward-projection branch in AccUsersGraph.tsx to the Cosmos-only path, (d) rips `renderBackend` auto-detect and toolbar toggle, (e) removes worker spawn gate (d3-force worker becomes dead code unless retained for a different purpose).
- **Tracking:** Non-blocking; does not gate Phase 2 sign-off.

### TD-006: Cosmos slider feel refinement — separation range and organic-vs-cluster transition — PARTIALLY MITIGATED 2026-05-06
- **Location:** `app/(dashboard)/users/cosmosUtils.ts` `controlsToSimulationConfig`, `app/(dashboard)/users/AccUsersGraph.tsx` slider wiring
- **Surfaced:** 02-05 Task 6 human-verify checkpoint (2026-04-29)
- **Observation:** User approved 02-05 with explicit note: "approved it needs refinement but we can see it later" — separation range and the organic↔cluster transition feel still need tuning at 25k scale even after the final pass in commit 2978186.
- **2026-05-06 update — visible square boundary on Railway production:** With 25k+ ACC hub nodes loaded, hub nodes piled against all four walls of the `spaceSize: 16384` GPU-physics texture, forming a visible square "border" (user screenshot). Math: at default `spacing: 54` repulsion was ~21.7 with gravity ~0.115 (22× imbalance); at `spacing: 100` gravity hit 0 entirely → no inward force counteracted repulsion → wall-clamp.
- **Mitigation applied:** Re-tuned `controlsToSimulationConfig` curves so the cluster cannot fully reach the wall at any slider value:
  - `simulationRepulsion` ceiling 50 → 20 (still spreads, no wall-saturation)
  - `simulationLinkDistance` ceiling 500 → 250 (matches lower repulsion)
  - `simulationLinkSpring` floor 0.005 → 0.1 (springs always contribute)
  - `simulationGravity` floor 0.0 → 0.1 (always pulls inward)
- **What's good enough:** layout is interactive, sliders respond, drag/pick works, TD-005 capacity gap is closed. This is UX polish, not a blocker.
- **Remaining work:** A/B tune the gamma exponents (currently 1.4/1.6/1.1/1.0) against the production hub for the *feel* of the slider sweep, not just the endpoints. Could be folded into plan 02-04 (lasso) or handled as an out-of-band tweak.
- **Tracking:** Non-blocking; does not gate Phase 2 sign-off.

---

## 2026-05-07 — Phase 03 stable-badge debug session close-out

### TD-008: cosmos.gl getter semantics are not contract-checked against d3-force conventions
- **Location:** `app/(dashboard)/users/graphRenderers.ts` `CosmosGraphRenderer` (any method that proxies a cosmos.gl Graph field), notably `getSimulationAlpha()` and `isSimulationRunning()`.
- **Surfaced:** Debug session `stable-badge-not-appearing` (2026-05-06 → 2026-05-07, fix shipped in commit `5b14ae9`).
- **What went wrong:** `getSimulationAlpha()` returned cosmos.gl v3's `graph.progress` field directly while its docstring (and every caller in `AccUsersGraph.tsx`) assumed the d3-force `alpha` convention (1=hot, 0=cool). cosmos.gl v3 defines `progress` as 0=start, 1=end — the **inverse** semantic. The polling threshold `alpha < 0.005` could therefore never fire once the sim cooled, and the "Stable" badge never appeared. Fixed by inverting (`return 1 - progress`) so the getter actually conforms to its own docstring and to all callers' expectations.
- **The deeper debt:** The `CosmosGraphRenderer` adapter wraps cosmos.gl in d3-force-flavored method names (`getSimulationAlpha`, `isSimulationRunning`, etc.) without an explicit contract test or comment block documenting the semantic mapping. Future cosmos.gl version bumps could silently re-introduce similar drifts (boolean inversions, range remappings, `undefined`-vs-`0` defaults).
- **Mitigation options (non-blocking):**
  1. Add a short contract block at the top of `CosmosGraphRenderer` documenting the d3-force semantic each getter must preserve, with the cosmos.gl v3 source field cited inline.
  2. Add a smoke test (Playwright or unit) that loads the Cosmos backend, lets it cool, and asserts `getSimulationAlpha() < 0.005 && !isSimulationRunning()` — would have caught this in CI.
  3. On cosmos.gl version bumps, manually diff the relevant Graph getters' docs against this adapter.
- **Tracking:** Non-blocking; the immediate bug is fixed in `5b14ae9` and UAT-confirmed.
