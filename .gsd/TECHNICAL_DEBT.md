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

### TD-006: Cosmos slider feel refinement — separation range and organic-vs-cluster transition
- **Location:** `app/(dashboard)/users/cosmosUtils.ts` `controlsToSimulationConfig`, `app/(dashboard)/users/AccUsersGraph.tsx` slider wiring
- **Surfaced:** 02-05 Task 6 human-verify checkpoint (2026-04-29)
- **Observation:** User approved 02-05 with explicit note: "approved it needs refinement but we can see it later" — separation range and the organic↔cluster transition feel still need tuning at 25k scale even after the final pass in commit 2978186.
- **What's good enough:** layout is interactive, sliders respond, drag/pick works, TD-005 capacity gap is closed. This is UX polish, not a blocker.
- **Resolution path:** Standalone follow-up pass on the gamma curves in `controlsToSimulationConfig` and the cluster pull strength curve, ideally A/B-tuned against the production hub. Could be folded into plan 02-04 (lasso) or handled as an out-of-band tweak.
- **Tracking:** Non-blocking; does not gate Phase 2 sign-off.
