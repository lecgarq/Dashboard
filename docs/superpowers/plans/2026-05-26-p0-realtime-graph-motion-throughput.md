# P0 — Real-Time Graph Motion Throughput Strategy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Tasks use checkbox (`- [ ]`) syntax. Graph internals are touched
> (`physicsLayer.ts`, `GraphCanvas2D.tsx`, `GraphCanvas3D.tsx`) — every such task MUST run the
> `access-analysis-graph-development` workflow §4 layout-math validation, keep purity/clustering tests
> green, and verify P7 mask-bus invariants. Staging is surgical, explicit-path only
> (`surgical-staging-workflow`).
>
> **⛔ PLAN-GATED: do not implement any task until the user approves this plan. T0 and T2–T5 individually
> require their own go-ahead before merging.**

**Goal:** Make node motion *visibly real-time* while a slider is being dragged on the 16,942-node Access
Analysis graph — i.e. the user perceives the cloud following the slider continuously, not "tick → freeze →
tick." The bug is **throughput**, not wiring: the renderer-chain probe (commits e9dcaed → b2e4098)
confirmed that slider input correctly reaches physics, physics reheats, d3 ticks, position buffers mutate,
and both 2D and 3D renderers consume those buffers. What is failing is the *rate* at which d3-force can
produce new positions for 16,942 nodes, plus a secondary issue where 2D skips refresh while frozen.

**Tech Stack:** Next.js client components, d3-force-3d (physics), cosmos.gl (2D WebGL), three.js
(3D), Vitest + fast-check (unit), Playwright + `graphTestBridge` (e2e on :3100).

**Constraints (non-negotiable, propagated from user directive):**
- Do not blindly raise `ALPHA_REHEAT_FLOOR` as a first fix.
- Do not rewrite the renderer stack.
- Do not add new sliders/dimensions.
- Do not add edge taxonomy.
- Do not touch routes/nav/R1.
- Do not touch DC files.
- Do not weaken tests.
- Do not hide the problem with "positions eventually changed" — visible cadence is the bar.

---

## 1. Root cause

- d3-force-3d's per-tick cost on **16,942 nodes** with `forceManyBody` plus three named `forceX/Y/Z`
  per-dimension forces is high enough that the in-browser tick rate sits at **~5–20 Hz** under load
  (`__debugRuntimeStats` diagnostic, 2026-05-26). Even after the accumulator + `SKIP_THRESHOLD=0.005`
  fixes (commits e9dcaed, b2e4098) made every keystroke reheat physics, the cloud only moves at the
  rate d3 can produce new positions.
- `physics.updateSliders` correctly reheats; `d3.timer` runs; `useGraphRafLoop` pumps `getPositions()`
  to the active renderer every rAF tick; renderers consume the buffer. **All wired correctly.**
- 2D has a secondary issue: while `physics.frozen === true`, `GraphCanvas2D.pushPositions` takes an
  early-return (line 264–303) that skips both `setPointPositions` and `g.render()`. The 2D canvas is
  static during freeze. 3D's self-driving `renderLoop()` keeps rendering, so 3D feels "more alive"
  while idle, but neither renderer changes the fundamental d3 throughput ceiling during drag.

**The dominant problem is d3-force per-tick cost on 16,942 nodes. The 2D frozen-refresh asymmetry is a
real but secondary user-perception issue, addressed separately as T1.**

## 2. Current architecture (the chain we are optimizing)

```
Radix Slider keystroke / mouse drag
    │ aria-valuenow bumps; onValueChange fires
    ▼
SliderContext.setSliderValue
    │ rAF-coalesced via schedulePush; one flush per animation frame
    ▼
physics.updateSliders(normalized values)
    │ - merges into _sliders
    │ - applySliderForces: per-dim force strengths + alphaDecay + manyBody.strength
    │ - skip gate: cumulative delta vs _slidersAtLastReheat against SKIP_THRESHOLD=0.005
    │ - on reheat: unpin fx/fy/fz, sim.alpha(0.15).restart()
    ▼
d3-force-3d sim (d3.timer driven)
    │ - per tick: force computations on 16,942 nodes
    │ - mutates node.x/y/z in place
    │ - "end" event fires at alphaMin → frozen=true, savePositions, sim.stop()
    ▼
useGraphRafLoop (single master rAF)
    │ - every frame: physics.getPositions() (Float32Array n*3)
    │ - routes to mode-active renderer only
    ▼
GraphCanvas2D.pushPositions     │     GraphCanvas3D.pumpPositions3D
- if frozen + scale stable:     │     - writes per-node matrices
   EARLY RETURN (no upload, no  │     - mesh.instanceMatrix.needsUpdate = true
   render)                      │     - self-driving renderLoop: render(scene, camera)
- else: setPointPositions(xy,   │       every rAF tick regardless of position changes
   dontRescale=true) + render() │
```

**Critical asymmetry:**
- 2D's render is event-driven (`g.render()` only fires when explicit). When physics is frozen, no render.
- 3D's render is always-on (rAF render loop). Even with stale matrices, frames keep going.

**Two-bus invariant (P0/P7 — must not regress):**
- PHYSICS bus drives positions only; reheat path is the *only* writer to alpha/restart.
- MASK bus owns `alphaMask` and `maskVersion`; filter/search/lasso events must NEVER trigger ticks.
- Any throughput change MUST preserve this separation (see stop condition §9).

## 3. Options to evaluate

For each option, we measure: ticks/sec during drag, first visible upload latency after slider input,
visible-update cadence over a 3-second drag, CPU impact (probe overhead must be light), and any
qualitative "feel" change. T0 establishes the baseline; T2–T4 are individual experiments comparing to it.

### A. Tune d3-force parameters (cheapest; first to try)

Knobs in `physicsLayer.ts`:
- **`forceManyBody.theta`** — Barnes-Hut approximation parameter (default 0.9). Higher = looser
  approximation, faster ticks, less accurate repulsion. Worth measuring 0.9 → 1.5.
- **`forceManyBody.distanceMax`** — cap range; pairs beyond don't contribute. Default ∞. Setting
  e.g. 200 in our ±350 cube would cut the per-tick cost dramatically. Risk: cloud may collapse if
  long-range repulsion is the only thing holding the cluster apart.
- **`alphaDecay`** — currently `lerp(0.1, 0.02, maxSlider)`. Slower decay = more ticks per reheat
  = more visible motion *per drag*. Already tuned, but worth re-checking after T2 decisions land.
- **`velocityDecay`** — currently 0.4 (d3 default). Lowering → nodes drift further per tick,
  perception of "movement" increases without changing tick rate. Trade-off: looks less stable.
- **Per-dimension force strength scaling during drag** — currently `STRENGTH_AT_ONE=0.1`. A
  temporary "drag mode" could bump this higher so per-tick displacement is larger, giving more
  *visible* motion per tick. Auto-revert on slider release.

**Hypothesis:** `distanceMax` + a looser `theta` together cut per-tick cost ~3–5×. Combined with a
"drag-mode" strength bump, perceived motion goes from "ticks visible" to "fluid."

### B. Drag-preview mode

Distinct physics behavior while a slider is being actively manipulated:
- On first keystroke / mousedown, enter drag-preview mode: lower-cost force config (looser `theta`,
  capped `distanceMax`, higher per-dim strength).
- On slider commit (mouseup / blur / debounce after no input for ~250ms), exit drag-preview: restore
  normal config and let the sim run to settle.
- **Node identity preserved** (same indices, same node array, same `nodeIds`). Only force parameters
  change.

**Open questions:**
- How do we detect "drag is over"? `onValueChange` fires continuously but there's no
  `onValueCommit` wired today. Options: bounce on no-input-for-N-ms, or wire Radix's `onValueCommit`.
- Two-bus invariant is preserved (only the physics bus changes config).

**Hypothesis:** During drag, user sees 30+ Hz of visible motion at lower fidelity; on release, the
sim settles to the accurate equilibrium. Closest match to "real-time feel."

### C. Subsample / anchor-driven live preview

Run d3 ticks during drag on a representative subset (e.g. 2k nodes; could be the cluster centroids
or a stratified sample). Followers are tweened toward their nearest anchor.
- On release, run the full 17k-node simulation to a settle.
- **Same node identity** — the 17k-node mesh is still the source of truth; the 2k anchors merely
  drive a temporary visual approximation.

**Risks:**
- Implementation complexity is substantially higher than A or B.
- Choice of subsample affects perceived motion direction; bad choice could look wrong.
- We'd be running TWO position-update paths (subset live, full on release) which complicates
  the mask bus (mask is per-full-index).

**Hypothesis:** Effective tick rate scales by 8× (2k/17k). High implementation cost; defer unless
A and B together aren't enough.

### D. Precomputed target interpolation (no live physics during drag)

Treat slider motion as interpolation between target *fields*, not a live simulation:
- Per slider state, the *target* positions for each node are deterministic (computed by `mathLayer`
  given dim weights × per-dim targets).
- During drag, position the cloud by linearly tweening between the *target* fields of the old and
  new slider state. Fast (O(n) per frame, no force computation).
- Run d3-force only on slider commit, to actually equilibrate to the new state.

**Risks:**
- Live preview is *kinematic* (forces aren't doing work) — clusters won't separate, they'll just
  glide. The user may notice the difference vs. true physics.
- Doesn't honor `forceManyBody` repulsion during drag — overlapping nodes stay overlapping.
- The `mathLayer.computeTargetPositions` API is shaped for *single-call* derivation, not
  per-frame tweening; may need a re-shape.

**Hypothesis:** Best raw frame rate of all options (kinematic = no physics CPU). Visual feel
is *qualitatively different* from current — depends on whether user accepts "tweened toward
new layout, with proper physics on commit" as the right model.

### E. Web Worker physics

Move d3 tick computation off the main thread:
- d3-force-3d itself does not natively support workers, but the simulation tick is pure
  arithmetic — feasible to reimplement / fork to run inside a Worker.
- Main thread receives position buffer (`Float32Array(n*3)`) via `postMessage` / `Transferable`
  per frame.
- Main thread renders without competing with physics for CPU.

**Risks:**
- d3-force-3d's API is built around the main-thread simulation object — exposing it to a worker
  requires non-trivial wrapping.
- 16,942 × 3 × 4 bytes = ~200 KB copy per frame. Negligible with `Transferable` semantics.
- Significant implementation cost. Doesn't help if the *single-tick* cost is the bottleneck
  (it just moves it off the main thread, which DOES still help responsiveness even if total
  throughput is unchanged).

**Hypothesis:** Roughly doubles main-thread headroom, lets the renderer hit 60 fps even when
physics is heavy. Largest scope of any option. Defer until A/B fall short.

### F. Renderer cadence optimization

Refine when renderers do work:
- **2D:** Remove the `frozen + scale stable` early-return, OR keep it but trigger a *one-shot*
  upload when the layout transitions to `frozen=true`. Today, `frozen=true` saves GPU at the
  cost of a stale canvas; the one-shot upload would guarantee the canvas matches the cached layout.
- **3D:** Already always rendering; could *gate* the renderLoop to skip frames when
  `positions unchanged AND camera unchanged AND mask unchanged`, saving battery without
  hurting perception.
- **Both:** Skip uploads when `posSig` hasn't changed since last upload (avoid GPU work on
  identical frames).

**Risks:**
- Removing 2D's frozen early-return increases idle GPU cost. Negligible per frame, but if the
  page sits frozen for minutes, it adds up.
- Gating 3D could mask a real bug (something thinks it changed but didn't).

**Hypothesis:** Mostly a polish play. Will not fix the dominant throughput issue. Worth doing
*only as T1* (small) and possibly T6 (3D skip) if T0 baseline shows excessive idle render cost.

## 4. Small 2D frozen-refresh fix (T1 — optional, separate)

The 2D early-return at `GraphCanvas2D.pushPositions` (line 264–303) is correct as a GPU optimization
but creates a visible asymmetry vs 3D. Two safe interventions, pick one after T0 baseline:

**Option T1a:** Trigger a **one-shot upload + render on the `frozen=false → frozen=true` transition**.
- Track `prevFrozenRef` in `GraphCanvas2D`.
- On the rising edge of `frozen`, push positions once and `g.render()` once, then return to the
  early-return behavior on subsequent calls.
- Same idle GPU cost as today; canvas is guaranteed up-to-date at freeze time.

**Option T1b:** Remove the early-return entirely; rely on cosmos.gl's internal change-detection.
- Higher idle GPU cost (one upload + one render per rAF tick = ~60/sec). Acceptable on modern
  hardware; measurable via T0 baseline.
- Simpler code; symmetric with 3D's behavior.

**Decision rule:** If T0 measures idle GPU > 2% of frame budget with T1b, choose T1a. Otherwise T1b.

**Must not:** spam re-renders while truly idle (no input, no physics activity). Verify with
explicit idle-state measurement in T1's verification.

## 5. What not to do (reiterated for clarity)

- **No blind ALPHA_REHEAT_FLOOR bump.** That's the lazy alternative to fixing throughput; raises
  alpha and runs physics longer per drag, which makes the *perception* better but compounds the
  CPU problem on weaker hardware. Defer to a tuning conversation after A/B are explored.
- **No renderer rewrite.** cosmos.gl + three.js stay. Surface changes only via the existing
  handle methods.
- **No new sliders / dimensions.** P6 closed the dimension registry; further additions out of
  scope here.
- **No edge taxonomy changes.** Edges are derived; the same-user footprint stays the only edge
  semantic for now.
- **No routes/nav/R1.** No DC files. No Task 6.
- **No test weakening.** Existing unit + e2e suites must stay green at every task boundary.
- **No "positions eventually changed" as a success metric.** The bar is *visible-during-drag
  cadence*, not eventual settlement.

## 6. Pass criteria (the bar for merging any task)

A throughput change is acceptable only if, measured by the T0 baseline probe:

1. **2D visible update latency after slider input** ≤ 100 ms (today: 681 ms baseline from
   verify-slow-drag, but that measures *first detectable position change* — the new bar is
   first *upload + render* after input).
2. **3D visible update latency after slider input** ≤ 100 ms (baseline: 1672 ms).
3. **Frame/update cadence during a 3-second drag** ≥ 30 effective render frames in each mode
   (today's measured: 2D had 0 renders during drag because physics didn't reach the renderer;
   under correct conditions, the target is 30+ visible upload/render events).
4. **No `Duplicate key` / `primary key` / `constraint` runtime errors** (the original blocker
   stays closed).
5. **Node count unchanged** at 16,942 (`EXPECTED_NODE_COUNT` in e2e suite).
6. **No camera movement on selection** (P0 regression guard).
7. **P7 mask bus preserved** — filter/search/lasso events still must not call `sim.alpha().restart()`
   (purity test asserts this).
8. **Existing unit + e2e suites green** (no test weakening; no skipped specs).

## 7. Measurement strategy

**Lessons from the prior probe (2026-05-26 renderer-chain run):**
- Heavy per-frame work inside `requestAnimationFrame` (e.g. 50k-float FNV hashing) **starves the
  React-side `schedulePush` rAF** in headless Chrome, causing physics to never reheat even though
  the keystroke landed. We will not repeat this mistake.

**Measurement principles for T0 and all subsequent tasks:**

- **Light instrumentation only.** Counters that increment in O(1), exposed via the existing
  `graphTestBridge` (temporary, removed before merge). NO per-frame full-array hashes inside the
  probe's rAF capture.
- **Sample at controlled intervals**, NOT every animation frame. 100 ms `setTimeout` poll is
  plenty for measuring tick/upload/render rates.
- **Use `performance.now()` timestamps** on counter increments, not on every sample.
- **Bypass-test for isolation.** Each task includes a "direct physics" sanity check (call
  `physics.updateSliders` from the bridge, observe outcome) to separate slider-chain failure
  modes from physics/renderer failures.
- **Before/after comparison.** Every option produces a JSON snapshot:
  ```json
  {
    "ticksPerSec": ...,
    "uploadsPerSec2D": ...,
    "rendersPerSec2D": ...,
    "uploadsPerSec3D": ...,
    "rendersPerSec3D": ...,
    "firstUploadAfterInputMs2D": ...,
    "firstUploadAfterInputMs3D": ...,
    "framesIn3sDrag2D": ...,
    "framesIn3sDrag3D": ...,
    "cpuApproxPctMain": ...
  }
  ```
- **CPU impact via `performance` API.** Use `performance.mark` / `performance.measure` around the
  d3 tick + renderer push paths to estimate wall-clock cost. Worker (option E) is the only one
  where main-thread CPU should drop materially.
- **Visual regression.** A screenshot after a controlled drag, compared structurally (the cloud
  should remain visibly cohesive — no NaN, no degenerate collapse). Pixel-diff is too brittle for
  a physics-driven layout; check shape/spread/density instead.
- **Probe artifacts MUST be temporary.** Add via test-flag-gated bridge methods + a single
  diagnostic spec; remove before each task's commit. Commit messages document what was measured
  and the result.

## 8. Atomic task plan

Each task is independently committable. Approval required before each. Subagents permitted with
the `subagent-driven-development` skill once a task is approved.

### T0 — Measurement baseline (no production code changes)

- [ ] Re-add temporary bridge methods: `getRendererCounters`, `getPositionSignature` (FNV only at
      sample time, NOT every rAF tick), `__bypassUpdateSliders` (for isolation testing).
- [ ] Re-add counter `inc*` helpers to `GraphCanvas2D.tsx` and `GraphCanvas3D.tsx` (clean, single-line
      increments at upload/render call sites).
- [ ] Write `tests/e2e/baseline-throughput.spec.ts`:
  - Drive a controlled drag scenario (5 ArrowRight keystrokes, 200 ms apart).
  - Sample counters every 100 ms for the full 5 s.
  - Compute the 11 metrics in the JSON snapshot above.
  - Print as a single block to stdout.
- [ ] Run the probe; archive the output as `docs/superpowers/research/2026-05-26-baseline-throughput.md`.
- [ ] **Remove all temporary instrumentation** in a separate cleanup commit after the baseline is
      archived. Production code path is restored byte-identical.
- [ ] **Gate before T1:** the baseline numbers are documented and reviewed. Pass criteria for T0:
      probe runs to completion, all 11 metrics captured, no `Duplicate key` errors.

### T1 — Small 2D frozen-refresh fix (optional; only if T0 shows the asymmetry materially affects perception)

- [ ] Choose T1a (one-shot on frozen-edge) or T1b (remove early-return) based on T0 idle GPU cost.
- [ ] Implement in `GraphCanvas2D.tsx` only.
- [ ] Idle-state test: page is idle (no input), measure renders/sec — must be ≤ 2/sec for T1a,
      ≤ 65/sec for T1b. Spec: `tests/e2e/2d-idle-render-rate.spec.ts`.
- [ ] Re-run baseline probe; T1 metrics must show first-upload latency ≤ 100 ms.
- [ ] Gate: existing `acc-dc-graph.spec.ts` e2e suite green; idle-render test green; manual
      runtime check confirms 2D and 3D feel symmetric while idle.

### T2 — d3 parameter tuning experiment

- [ ] Add a temporary "tuning mode" knob to `physicsLayer.ts` (env-var-gated, NOT a config file)
      so the experiment can sweep `theta`, `distanceMax`, `STRENGTH_AT_ONE` without touching production
      defaults yet.
- [ ] Run baseline probe at: (a) default, (b) `theta=1.5`, (c) `distanceMax=200`, (d) `STRENGTH_AT_ONE=0.2`,
      (e) all-combined.
- [ ] Compare ticks/sec, visible cadence, cluster cohesion (clustering test ratio at slider=1).
- [ ] **Decision gate:** if combined config produces ≥ 30 effective renders/sec during drag AND
      cluster cohesion stays within ±10 % of baseline, commit the new defaults and remove the env-var
      knob. If not, T3.

### T3 — Drag-preview mode experiment

- [ ] Wire `onValueCommit` (or a `no-input-for-250ms` debounce) in `SliderContext.tsx` to detect
      drag end.
- [ ] In `physicsLayer.ts`, add an internal "drag mode" flag; `updateSliders` consults it and applies
      a relaxed force config (the winning combo from T2 if T2 partially helped, plus higher
      `STRENGTH_AT_ONE`).
- [ ] On commit, restore full-fidelity config and run a final settle.
- [ ] Same metric run as T2.
- [ ] Decision gate: combined T2+T3 must clear pass criteria §6.1–6.3. If not, T4.

### T4 — Decide: precompute (D) or worker (E)

- [ ] Write a short eval doc (`docs/superpowers/research/2026-05-26-d3-throughput-tradeoffs.md`)
      summarizing T2+T3 results and choosing between (D) target-tween-during-drag and (E)
      worker-driven physics.
- [ ] Estimate implementation cost. If both are estimated > 4 days, escalate to a separate
      milestone plan.
- [ ] If proceeding, write a sub-plan for the chosen option as its own document. Do NOT inline
      the implementation here — that scope is too large for this plan.

### T5 — End-to-end runtime verification

- [ ] Re-run the full `tests/e2e/acc-dc-graph.spec.ts` suite to assert no regressions.
- [ ] Drive a slow continuous drag (mouse-down on the thumb, slide across the full track in 3
      seconds) via Playwright; assert visible-cadence metrics meet §6.1–6.3.
- [ ] Manual-equivalent runtime smoke: capture a 5-second screen recording of the page under the
      same drag; attach to the verification doc as a proof artifact.
- [ ] Gate before plan closure: unit + e2e green, runtime probe meets pass criteria, no production
      code carries leftover temporary instrumentation.

## 9. Stop conditions

Halt the plan and escalate if any of these occur during any task:

- **Node identity changes.** If a candidate fix renames, re-indexes, or re-orders the 16,942 nodes
  in any way — STOP. The mask bus, edges, selection state, and positions cache all index by
  `nodeIds`; identity is sacrosanct.
- **Data semantics change.** Any change that alters what a node *represents* (e.g. user → user×
  project, instance collapse) is out of scope.
- **2D and 3D diverge in meaning.** Both must continue to render the same node set with the same
  positions. Different *visual styles* are fine; different *positions or counts* are not.
- **A solution requires replacing the renderer stack** (cosmos.gl, three.js) — STOP and re-plan.
- **Any existing test must be weakened** to make a change pass — STOP.
- **Runtime improves in the probe but feels worse in the actual graph** when verified manually —
  STOP, archive the probe data, write a research doc explaining the divergence.
- **Two-bus invariant violation.** If filter/search/lasso events end up triggering `sim.alpha`/
  `sim.restart` calls (PHYS-04 in `physicsLayer.purity.test.ts`) — STOP.

---

## Files this plan will touch (when implemented)

| Task | File | Purpose | Gate |
|------|------|---------|------|
| T0 | `graphTestBridge.ts` | Temp counters + bypass; removed in cleanup commit | tsc + unit green |
| T0 | `GraphCanvas2D.tsx` | Temp inc calls; removed in cleanup commit | tsc + unit green |
| T0 | `GraphCanvas3D.tsx` | Temp inc calls; removed in cleanup commit | tsc + unit green |
| T0 | `tests/e2e/baseline-throughput.spec.ts` | New probe spec; archived doc, then deleted | runs to completion |
| T0 | `docs/superpowers/research/2026-05-26-baseline-throughput.md` | Baseline measurements | n/a — archive |
| T1 | `GraphCanvas2D.tsx` | Frozen-refresh fix (T1a or T1b) | new spec + acc-dc-graph e2e |
| T1 | `tests/e2e/2d-idle-render-rate.spec.ts` | New permanent idle-rate guard | green |
| T2 | `physicsLayer.ts` | New defaults for `theta` / `distanceMax` / `STRENGTH_AT_ONE` | physics + clustering tests, e2e |
| T2 | `physicsLayer.test.ts` | Updated specs if any constant assertion needs adjusting | green |
| T3 | `SliderContext.tsx` | `onValueCommit` wiring or debounce | new spec |
| T3 | `physicsLayer.ts` | Drag-mode flag + config switch | physics tests, two-bus invariant |
| T3 | `physicsLayer.test.ts` | New specs for drag-mode entry/exit | green |
| T4 | `docs/superpowers/research/2026-05-26-d3-throughput-tradeoffs.md` | Decision doc | n/a |
| T5 | (verification only — no code changes) | e2e + manual smoke | green |

## Open questions (resolve before T2 starts)

1. **Drag-detection mechanism for T3.** Radix exposes `onValueCommit` for click-and-release, but
   keyboard input (ArrowRight) doesn't have a natural "commit" event. Options: (a) debounce-on-quiet,
   (b) wire `onPointerUp` on the thumb, (c) treat keyboard input as committed immediately.
2. **T2 cluster cohesion tolerance.** ±10 % of baseline `clustering ratio at slider=1` is a guess.
   Verify against `physicsClustering.test.ts` baseline before T2 starts.
3. **T4 selection — D or E.** Pre-commitment to neither; decided post-T2/T3 from measured data.

---

**Status:** Plan written 2026-05-26. **Not yet approved for implementation.** Awaiting user
go-ahead per task.
