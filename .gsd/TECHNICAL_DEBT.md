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

### TD-002: powerPreference hint via monkey-patching HTMLCanvasElement.prototype.getContext
- **Location:** `app/(dashboard)/users/graphRenderers.ts` `CosmosGraphRenderer.create()`
- **Why:** Cosmos.gl@3.0.0-beta.8 hardcodes luma.gl device creation with no `powerPreference` config option. We monkey-patch the prototype during graph construction and restore in `finally`.
- **Risk:** If Cosmos changes its device-creation timing (e.g. lazy WebGL context after `await graph.ready` returns), the patch window may close before the context is requested.
- **Resolution path:** File upstream issue/PR on cosmos.gl to expose `powerPreference` in Graph config. Remove monkey-patch.

### TD-003: Firefox/ANGLE renderer string is non-deterministic for GPU verification
- **Symptom:** Firefox returns `ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0)` even on machines with RTX 5070 Ti.
- **Why:** Firefox routes WebGL through Google's ANGLE library on Windows, which translates GPU identity strings to a Direct3D 11 baseline name. The model number is **not reliable** in Firefox.
- **Reliable signal:** vendor field (`NVIDIA` vs `Intel`) — that confirms dedicated vs integrated.
- **Documentation only — no code change needed.**

### TD-004: Cluster IDs derived only from `roles[0]`
- **Location:** `app/(dashboard)/users/AccUsersGraph.tsx` `restartOrganicLayout`
- **Limitation:** Multi-role users are clustered by their first role only.
- **Resolution:** Either (a) UI lets user pick which role drives clustering, or (b) compute a role-similarity vector and cluster on that. Defer to 02-03 or Phase 4.
