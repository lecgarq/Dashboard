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

### TD-005: d3-force CPU physics caps at ~2k nodes; production ACC hub has 25,602 nodes
- **Location:** `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` (d3-force `forceSimulation` introduced in plan 02-02)
- **Symptom (observed during 02-03 Task 5 verification):** On the production ACC hub (25,602 active nodes — ~50× the 02-02/02-03 plan target of 500), worker tick duration is **287 ms**. This is ~18× the 16 ms / 60 fps budget. Slider scrub, node picker, and filter interactions feel visually frozen because each tick blocks the message loop that drives those UI updates. HUD ✓ visible, GPU ✓ NVIDIA, idle FPS ✓ ~100 — pure physics-loop bottleneck, not renderer or GPU.
- **Why this is not a 02-03 regression:** Every Task 1-4 deliverable (drag link re-upload, gamma separation curve, eased cluster, same-username highlight, perf HUD, hardened powerPreference) behaves correctly at the planned 500-node scale. The constraint is the d3-force CPU physics engine choice from plan 02-02, which never claimed 25k-node capacity.
- **Resolution path:** New plan **02-05 (Cosmos native GPU physics swap)** — replace the d3-force CPU loop with Cosmos's internal GPU layout (the engine we originally bypassed via `enableSimulation: false`). GPU layout is expected to absorb 25k+ nodes within frame budget. Plan 02-04 (lasso multi-select) is on hold until 02-05 lands, because lasso interactions require a responsive simulation.
- **Tracking:** Phase 2 sign-off gated on 02-05 completion + production-scale verification.
