# 2D GPU Real-Time Physics — Design

- **Date:** 2026-05-28
- **Status:** Approved (brainstorming) — pending spec review
- **Branch:** `feat/access-analysis-redesign`
- **Owner:** Luis
- **Supersedes (for 2D only):** the B.2 "preview interpolation" path (`previewLayer.ts` + `getPositionsOverride` wiring in `GraphCanvas.tsx`). 3D is unaffected.

---

## 1. Goal

Make the **2D graph environment move in real time from the slider physics, on its own**, so it feels alive and **does not depend on the 3D environment being stable**. Moving a slider while in 2D must animate the 2D nodes immediately, driven by the 2D view's own engine — never by the shared 3D simulation.

Two user-locked constraints from brainstorming:

1. **Real physics, fully independent** of the 3D engine (not a kinematic glide).
2. **Fully GPU** — the expensive layout work runs on the GPU, not the CPU.
3. Implemented as a **standalone module**, leaving `physicsLayer.ts` untouched.

---

## 2. Background — why 2D currently depends on 3D

The current architecture (verified in code):

- There is **one shared simulation**: `d3-force-3d`, a *3D* force sim in `physicsLayer.ts:309`. It runs on the **CPU** via d3's internal timer, settling at ~4 ticks/sec on the 16,942-node dataset (`forceManyBody` is the bottleneck).
- The 2D renderer (`GraphCanvas2D.tsx`) runs cosmos.gl v3 **frozen** (`enableSimulation: false`, line 171). It is a GPU *painter* only — it displays whatever positions are pushed to it; it runs no physics.
- Both 2D and 3D read positions from the same `physics.getPositions()` (`useGraphRafLoop.ts:77`).
- **B.2 preview** (`previewLayer.ts`, `GraphCanvas.tsx:138-200`) gives *transient* 2D motion: while a slider drags, it lerps nodes toward a slider-weighted target (kinematic, no repulsion), then a **250ms idle timer** (`SliderContext.tsx:172`) hands positions **back to the shared 3D sim** (`GraphCanvas.tsx:171`).

**The coupling:** after every drag, the 2D resting layout is recomputed by the shared 3D simulation. If that sim is slow, janky, or its renderer crashes, 2D inherits the problem. The "alive while dragging" already exists; the dependency is the *handback to the 3D sim* and the fact that 2D samples a 3D-shaped, CPU-bound sim.

**Key enabling fact:** the layout is already mathematically 2D. In `mathLayer.ts:98-130` every dimension pole sits on the XY circle (`u_d = (cos θ_d, sin θ_d, 0)`) and **`target.z` is always 0**. The 3D-ness comes only from repulsion pushing nodes apart in z. A 2D engine therefore loses **zero** semantic information.

---

## 3. Decision summary

Drive the 2D view with **cosmos.gl v3's own GPU force simulation**, using the **cluster force as a per-node positional anchor**:

- Assign **one cluster per node**: `setPointClusters([0, 1, …, n-1])`.
- Set each cluster's anchor to that node's **slider-weighted dimension target**: `setClusterPositions(anchors)`.
- Enable `simulationCluster` (the pull toward anchors) + `simulationRepulsion` (spread) + a small `simulationGravity`.
- Carry per-node `dimWeights` (confidence × availability) into `setPointClusterStrength`, so availability-gated nodes get zero pull — identical semantics to the 3D engine.

cosmos docs confirm: *"Clusters without specified positions via `setClusterPositions` will be positioned at their centermass"* — i.e. explicitly-set positions act as **fixed anchors**. No custom shader code; all stock cosmos API.

Rejected alternatives:
- **Few real clusters** (group by dominant dimension): cheaper but nodes snap to a handful of centroids — loses per-node precision. Rejected.
- **Plain repulsion + gravity** (no anchors): loses dimension meaning entirely. Rejected.
- **A second CPU `d3-force` 2D sim:** real physics and independent, but CPU-bound — violates the "fully GPU" constraint. Rejected.

**Idle behavior:** the GPU sim cools via `simulationDecay` and **pauses at rest** (stable positions for lasso/selection/screenshots/tests); any slider move calls `start(alpha)` to revive it instantly. (Perpetual gentle drift is cheap on GPU and remains a one-constant tuning option, but is not the default.)

---

## 4. Architecture

```
        sliders (SliderContext, normalized 0..1)
                     │
        (2D mode only) │ GraphCanvas reads slider values
                     ▼
   ┌──────────────────────────────────────────┐
   │  gpuLayout2D.ts   (NEW — pure, no React)   │
   │  • computeAnchors(sliders, targets,        │
   │       dimWeights, n) → Float32Array(n*2)   │  ← Σ u_d·f_d·s_d / Σ s_d, 2D
   │  • mapForceConfig(sliders) → {repulsion,   │
   │       cluster, gravity, decay, friction}   │
   │  • clusterStrengthFromWeights(dimWeights,  │
   │       sliders) → Float32Array(n)           │
   └──────────────────────────────────────────┘
                     │  anchors + force config
                     ▼
   ┌──────────────────────────────────────────┐
   │  GraphCanvas2D.tsx (cosmos.gl v3)          │
   │  enableSimulation: TRUE (GPU)              │
   │  setPointClusters([0..n-1])  (once)        │
   │  setClusterPositions(anchors)  (per change)│
   │  setPointClusterStrength(...)              │
   │  setConfigPartial({simulation*})           │
   │  start(alpha)  ← reheat on slider change   │
   │  GPU runs repulsion + cluster + gravity    │
   └──────────────────────────────────────────┘

   physicsLayer.ts (d3-force-3d) + GraphCanvas3D  →  UNTOUCHED, serves 3D only
```

The 3D path (`physicsLayer`, `GraphCanvas3D`, `useGraphRafLoop`'s 3D branch) is unchanged. In 2D GPU mode the 2D branch of the rAF loop stops pushing positions (cosmos self-drives).

### 4.1 New module: `gpuLayout2D.ts` (pure)

Follows the repo's purity discipline (cf. `mathLayer.purity.test.ts`, `physicsLayer.purity.test.ts`). No React, no DOM, no cosmos import — only types.

```ts
export interface GpuForceConfig {
  simulationRepulsion: number;
  simulationCluster: number;
  simulationGravity: number;
  simulationDecay: number;
  simulationFriction: number;
}

/** Per-node 2D anchor = Σ_d (u_d · f_d · s_d) / Σ_d s_d, from precomputed per-dim targets.
 *  Mirrors previewLayer's blend but in 2D (stride-2). All sliders 0 → (0,0). */
export function computeAnchors(
  sliders: Record<string, number>,
  targets: TargetArrays,                 // reuse physicsLayer's TargetArrays (x/y/z; z ignored)
  dimWeights: Record<string, Float32Array>,
  nodeCount: number,
): Float32Array;                          // length n*2

/** Slider intensity → GPU force coefficients. Analogue of applySliderForces():
 *  max(sliders)=0 → tight/low-repulsion organic blob; =1 → spread for legibility. */
export function mapForceConfig(sliders: Record<string, number>): GpuForceConfig;

/** Per-node cluster pull strength = product of active-dim weights (availability gate). */
export function clusterStrengthFromWeights(
  dimWeights: Record<string, Float32Array>,
  sliders: Record<string, number>,
  nodeCount: number,
): Float32Array;                          // length n
```

`computeAnchors` reuses the exact weighted-blend math already proven in `previewLayer.ts:37-76` (and consistent with `mathLayer.computeTargetPositions`), but emits stride-2 directly.

**Where `targets` / `dimWeights` come from:** they are read **once at init** from the physics handle (`physics.getTargets()`, `physics.getDimWeights()`) — these are *static input data* computed by `mathLayer`/`dimensionWeights` and merely held by the physics object; they are **not** live simulation state. Reading them is type-only/data-only and does not couple 2D to the *running* 3D sim. (A later refactor could lift them to a shared source so the 2D module needn't reference the physics handle at all; not required for this work.) The independence guarantee is specifically: the 2D view never reads `physics.getPositions()` and never waits on the d3 timer.

### 4.2 `GraphCanvas2D.tsx` changes (behind flag)

- Construct cosmos with `enableSimulation: true` and initial `simulation*` coefficients from `mapForceConfig(initialSliders)`. Keep `spaceSize`, `pixelRatio`, event wiring, greyout, rings as today.
- On init (after `graph.ready`):
  - `setPointClusters(identityClusters(n))` — `[0,1,…,n-1]`.
  - `setClusterPositions(computeAnchors(initialSliders, …))`.
  - `setPointClusterStrength(clusterStrengthFromWeights(…))`.
  - seed `setPointPositions(anchors)` (so the sim starts near targets, not random), then `start(alpha₀)`.
- New handle method:
  ```ts
  applySliders(sliders: Record<string, number>): void
  ```
  → recompute anchors + force config → `setClusterPositions` + `setConfigPartial({simulation*})` + `setPointClusterStrength` → `start(reheatAlpha)`.
- Retain `applyAlphaMask`, `setColors`, `setLinks/Colors`, `findPointsInPolygon`, `screenToSpace/spaceToScreen`, selection/hover ring methods **unchanged** — they operate on cosmos's live positions and keep working.
- `pushPositions` becomes a **no-op in GPU mode** (cosmos owns positions); retained for flag-off fallback.
- fitView: rely on cosmos `fitViewOnInit` + a one-shot `fitView()` on first `onSimulationEnd` (or first settle) so the moving cloud is framed without the bespoke `fitPendingRef`/`fittedScaleRef` machinery (that machinery stays for flag-off path only).

### 4.3 Slider → 2D wiring (`GraphCanvas.tsx`)

- `GraphCanvas` already calls `useSliders()`. Add: when `ENABLE_GPU_2D_SIM` and `mode === "2d"`, on `sliders.values` change call `handle2D.current?.applySliders(normalize(values))`.
- Use the existing `subscribePreviewActive` signal only to bump reheat alpha during an active drag (snappier) and to trigger the settle/fit afterward. The `setActiveInput`/repulsion-detach trick is **not** needed (GPU repulsion is cheap).
- In GPU mode, the 2D branch of `useGraphRafLoop` no longer pushes physics positions; `getPositionsOverride`/`previewLayer` are not constructed.

### 4.4 Force-config mapping (initial tuning, to refine empirically)

| Quantity | All sliders 0 | Sliders engaged (max=1) |
|---|---|---|
| `simulationRepulsion` | low (tight blob) | higher (cluster legibility) |
| `simulationCluster` | ~0 (no targets) | strong (snap to dimension poles) |
| `simulationGravity` | small (keep cohesive) | small |
| `simulationDecay` | fast cooldown | slower (visible motion while separating) |
| `simulationFriction` | cosmos default (0.85) | cosmos default |

Anchors at zero-state collapse to the origin (per `mathLayer` zero-state); gravity + repulsion then produce an organic blob, matching the 3D engine's "featureless globe at rest" behavior.

---

## 5. What is explicitly untouched

- `physicsLayer.ts`, `mathLayer.ts` — no edits (satisfies the standalone-module constraint).
- The entire 3D path: `GraphCanvas3D.tsx`, the 3D branch of `useGraphRafLoop`, camera/transition animations.
- Mask bus, selection, colors, links, lasso — they ride on cosmos's live positions and are layout-agnostic.
- `SliderContext.tsx` — no new responsibilities (the 2D fan-out lives in `GraphCanvas`).
- DuckDB positions cache — used by the 3D d3 path only; 2D GPU recomputes (GPU is fast; no cache needed).

---

## 6. Edge cases & error handling

- **All sliders 0:** anchors → (0,0); `simulationCluster` contributes nothing; gravity+repulsion yield an organic blob. No divide-by-zero (zero-state guard mirrors `mathLayer.ts:127`).
- **Node-count mismatch:** `computeAnchors` asserts `n` matches `targets` length (throws in dev, like `previewLayer.seedFrom`).
- **cosmos not ready:** all cluster/config calls gated behind the existing `graph.ready` await (Pitfall 3); `applySliders` before ready is queued/ignored safely.
- **Mode switch 3D→2D:** on entering 2D, push current sliders via `applySliders` so the GPU layout reflects the latest state immediately, then `start(alpha)`.
- **Mode switch 2D→3D:** optional `pause()` of the 2D sim while hidden to free the GPU; `unpause()`/`start()` on return. (3D continues to use the d3 path.)
- **Flag off (`ENABLE_GPU_2D_SIM = false`):** exact current behavior — frozen cosmos + B.2 preview + d3 positions. Single-flip rollback.

---

## 7. Testing strategy

- **Unit (pure):** `gpuLayout2D.test.ts` + `gpuLayout2D.purity.test.ts` — anchor math (weighted blend, zero-state, dimWeight gating), force-config monotonicity (more slider → more repulsion), cluster-strength gating (weight 0 → strength 0). Deterministic, fast, no GPU.
- **e2e determinism:** the GPU sim **pauses at rest**, so lasso/selection e2e (`npm run test:e2e`, flag `NEXT_PUBLIC_ACC_GRAPH_TEST`) run against stable positions. If needed, the test flag forces an immediate settle (`step()`-to-rest or `enableSimulation:false` after first layout) so `findPointsInPolygon` is deterministic. Existing 2D lasso/selection tests must stay green.
- **Manual / Playwright probe:** in 2D mode, drag a slider and confirm nodes animate immediately (target ~real-time, comparable to the B.2 681ms-to-first-motion baseline) with **0 runtime errors**, and that the motion continues smoothly even if the 3D view was previously janky.
- **Independence check:** force the 3D path into a slow/error state and confirm 2D slider motion is unaffected.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| 17k single-member clusters slow on GPU | Cluster texture is ~132² for 17k — trivial. Validate with the FPS monitor / probe; fall back to grouped clusters only if measured slow. |
| e2e flakiness from live motion | Pause-at-rest + test-mode forced settle (§7). |
| `fitView` framing a moving cloud | cosmos `fitViewOnInit` + one-shot fit on first settle; user pan/zoom afterward. |
| cosmos beta API drift (3.0.0-beta.9) | Pin verified against local `.d.ts`; all methods used (`setPointClusters`, `setClusterPositions`, `setPointClusterStrength`, `start`, `pause`, `setConfigPartial`) confirmed present in this beta. |
| Regression to current 2D | `ENABLE_GPU_2D_SIM` flag — flip off to restore exact current path. |

---

## 9. Rollout / rollback

- Ship behind `ENABLE_GPU_2D_SIM` (default decided at implementation time; start `true` on the feature branch for UAT).
- Rollback = flip the flag to `false`. No data migration, no schema change.

---

## 10. Deferred / out of scope

- Applying the GPU cluster approach to 3D (3D keeps the d3-force-3d engine).
- Persisting GPU 2D layouts to the positions cache.
- Perpetual idle drift as default (available as a tuning constant if requested after UAT).
- Removing `previewLayer.ts` / B.2 wiring entirely (kept for flag-off fallback; cleanup is a later, separate task once GPU mode is confirmed).
