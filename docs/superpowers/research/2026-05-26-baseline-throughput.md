# T0 — Baseline Motion-Throughput Measurements

**Date:** 2026-05-26
**Plan:** `docs/superpowers/plans/2026-05-26-p0-realtime-graph-motion-throughput.md`
**Spec:** `tests/e2e/baseline-throughput.spec.ts`
**Branch:** `feat/access-analysis-redesign`
**Probe commit base:** `b4149f7` (plan only — instrumentation kept in working tree per
operator directive; not committed)

> **What this is:** the *unmodified* default-configuration baseline. No tuning, no
> drag mode, no parameter changes. Just instrumentation + a controlled 5-keystroke
> slider drag, sampled at 100 ms cadence in both 2D and 3D modes.
> **What it is NOT:** a real-hardware benchmark. The probe runs in headless
> Chromium under Playwright; rAF cadence is materially throttled vs a focused
> real browser. The shape of the bottleneck transfers; the absolute milliseconds
> are an upper bound — see §5 caveats.

---

## 1. Raw output

```json
{
  "EXPECTED_NODE_COUNT": 16942,
  "keystrokes": 5,
  "keystrokeGapMs": 200,
  "dragWindowMs": 5000,
  "sampleIntervalMs": 100,
  "passes": [
    {
      "label": "2D",
      "ticksPerSec": 4.062,
      "uploadsPerSec2D": 4.062,
      "rendersPerSec2D": 4.062,
      "uploadsPerSec3D": 0,
      "rendersPerSec3D": 6.451,
      "firstUploadLatencyMs2D": 453.6,
      "firstUploadLatencyMs3D": -1,
      "framesIn3sDrag2D": 3,
      "framesIn3sDrag3D": 0,
      "totalTicks": 17,
      "durationMs": 4185.4
    },
    {
      "label": "3D",
      "ticksPerSec": 0.744,
      "uploadsPerSec2D": 0,
      "rendersPerSec2D": 0,
      "uploadsPerSec3D": 3.225,
      "rendersPerSec3D": 3.225,
      "firstUploadLatencyMs2D": -1,
      "firstUploadLatencyMs3D": 2,
      "framesIn3sDrag2D": 0,
      "framesIn3sDrag3D": 6,
      "totalTicks": 3,
      "durationMs": 4031
    }
  ]
}
```

Probe ran to completion. No `Duplicate key` / `primary key` / `constraint` errors.
Node count stayed at 16,942 throughout.

## 2. Reading the metrics

### 2.1 d3 tick rate IS the dominant bottleneck

| Mode | Ticks/s | Per-tick budget | What this means |
|------|---------|-----------------|-----------------|
| 2D | 4.06 | 246 ms | d3 can produce ~4 new positions per second for 16,942 nodes |
| 3D | 0.74 | 1,344 ms | d3 produces fewer than 1 new position per second |

The plan's §1 hypothesis ("~5–20 Hz under load") was **optimistic** for headless;
the actual 2D baseline is **4 Hz**, and the 3D baseline is **<1 Hz**. The hard
ceiling on perceived motion is *the rate d3 produces positions*, full stop.

### 2.2 Pass-asymmetry: the 3D self-driving renderLoop starves physics

This is the biggest surprise of T0. Same physics, same node count, same drag
inputs — but switching to 3D mode drops physics tick rate **5.5× lower** (4.06 →
0.74 Hz). The only material runtime difference between the two passes is that
`GraphCanvas3D.renderLoop` (line 426: `controls.update()` + `renderer.render(scene,
camera)` on a 16k-node `InstancedMesh`) is *actively rendering visible* in 3D
mode, vs CSS-hidden but still firing in 2D mode.

In headless Chromium the cost gap appears to be CPU competition: the 3D render
path is heavy enough that when it's not occluded, it siphons cycles from d3's
`d3.timer` callback. Option F in the plan ("gate the renderLoop to skip frames
when positions unchanged AND camera unchanged AND mask unchanged") is no longer
just a polish play — **it directly affects 3D physics throughput**.

### 2.3 Uploads track ticks 1:1 in 2D — the renderer is not the bottleneck

`uploadsPerSec2D == rendersPerSec2D == ticksPerSec` in the 2D pass. Every tick
that d3 produces gets uploaded and rendered. The 2D early-return at frozen
state happens AFTER each settle window; it does not appear to be the limiting
factor *during the drag*. The 2D frozen-refresh asymmetry (plan T1) is real
between drags, not within one.

### 2.4 First-upload latency

| Mode | Measured | Plan §6 bar | Verdict |
|------|----------|-------------|---------|
| 2D | 453.6 ms | ≤ 100 ms | **Fail (4.5×)** |
| 3D | 2 ms | ≤ 100 ms | Pass (but see §2.5) |

### 2.5 The 3D "2 ms" first-upload is an artifact, not real responsiveness

The 3D pass shows `firstUploadLatencyMs3D = 2 ms` because:
- `useGraphRafLoop` (the master rAF) had a callback already in flight when
  `markSliderInput()` ran inside a `page.evaluate`.
- That in-flight callback called `pumpPositions3D` → `incUpload3D` ~2 ms after
  the mark, claiming the "first after input" slot.
- The position values it uploaded were *still the pre-input frozen layout* —
  the physics tick that responds to the keystroke hadn't happened yet.

The user wouldn't perceive that as "the cloud followed the slider in 2 ms."
The honest 3D latency is closer to `1 / ticksPerSec ≈ 1340 ms` — the time to
the **next physics tick** that contains new data. We should harden this metric
in any follow-on probe by stamping not just the first upload but the first
upload that follows a tick (i.e., the first upload that carries *new*
positions). The current bridge undercounts here.

### 2.6 Frames in 3-second drag

| Mode | Measured | Plan §6 bar | Verdict |
|------|----------|-------------|---------|
| 2D | 3 | ≥ 30 | **Fail (10×)** |
| 3D | 6 | ≥ 30 | **Fail (5×)** |

The visible cadence during a drag is somewhere between 1 and 2 frames per
**second** in 3D, and ~1 frame per second in 2D. Both are below the perceptual
"smooth" threshold by a wide margin.

## 3. Two-bus invariant + safety gates

| Check | Result |
|-------|--------|
| Node count = 16,942 throughout | Pass |
| No `Duplicate key` / primary key errors | Pass |
| Camera does not move on selection (P0 guard) | Not exercised in this spec — covered by `acc-dc-graph.spec.ts` |
| P7 mask bus unchanged | Not touched by instrumentation (counter increments only) |
| Existing unit + e2e suites green | Not re-run yet — instrumentation is uncommitted; full re-run gated on cleanup decision |

## 4. Recommendation — which option to attempt first

Ranked by *expected throughput delta per implementation hour*, against the
measured baseline:

### Primary: **A — d3 parameter tuning** (`distanceMax`)

The 2D per-tick cost of 246 ms on 16,942 nodes is dominated by `forceManyBody`'s
N²-by-default cost (Barnes-Hut θ=0.9 still has a per-pair touch count). The
single highest-leverage knob is **capping `forceManyBody.distanceMax` to ~200**
in the ±350 layout cube. A pair beyond `distanceMax` contributes nothing, which
typically cuts per-tick cost 3–5× on this geometry without collapsing the cloud
(provided the per-dimension `forceX/Y/Z` strengths still hold the structure
together). Pair `distanceMax` with `theta = 1.5` as a secondary cut.

Estimated effect: 4 Hz → 12–20 Hz in 2D. Latency 454 ms → 100–150 ms. Still not
fluid, but the visible cadence target of 30 frames in 3 s becomes reachable.

### Secondary: **B — drag-preview mode**

Plan §3.B. While the slider is being actively manipulated, switch d3 into a
lower-cost configuration (the A combo plus a higher `STRENGTH_AT_ONE` so per-
tick *displacement* is larger). On commit (Radix `onValueCommit` or a 250 ms
debounce on no input), restore full-fidelity config and let the sim settle.
Node identity preserved; two-bus invariant preserved. This compounds with A.

### Tertiary: **A and B will likely not be enough on weak hardware**

If A+B don't land the 30-frames-in-3s bar on the deployment machine, the next
step is decision T4 (D — target-tween-during-drag, or E — worker physics).
That's a separate larger plan; do not preempt it from T0 data.

### Polish item raised by T0 (NEW): 3D renderLoop gating

The 3D self-driving renderLoop costs d3 ~5× of its tick budget when 3D is the
active mode. Option F (gate 3D renderLoop when positions/camera/mask are
unchanged) should be re-evaluated as part of T1, not deferred to T6. Without
it, 3D drag will not feel real-time no matter how we tune d3.

## 5. Caveats

- **Headless Chromium rAF throttling.** The 3D self-driving renderLoop fired
  6.45/s in the 2D pass (vs the expected ~60/s in a focused real browser). All
  cadence numbers are floor-bounded by Playwright's headless rAF behavior. The
  ratio between modes and the per-tick CPU cost are likely faithful; the
  absolute frames-per-second are not.
- **Single-machine, single-run.** No variance estimate. Re-run on Luis's PC in a
  real focused Chrome window before pre-committing to a fix size.
- **`firstUploadLatencyMs3D` is unreliable.** See §2.5 — it measures the next
  rAF turn, not the next post-tick rAF. Don't compare it to the 2D number until
  the metric is sharpened.

## 6. Files touched (uncommitted working tree)

| File | What | Disposition |
|------|------|-------------|
| `app/(dashboard)/users/access-analysis/graphMotionCounters.ts` | NEW; counter module | Delete on cleanup |
| `app/(dashboard)/users/access-analysis/graphTestBridge.ts` | Added 3 T0 methods | Revert the 3 additions |
| `app/(dashboard)/users/access-analysis/physicsLayer.ts` | 1 import + 1 `sim.on("tick", incTick)` line | Revert both |
| `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` | 1 import + 3 `incUpload2D`/`incRender2D` lines | Revert all |
| `app/(dashboard)/users/access-analysis/GraphCanvas3D.tsx` | 1 import + 2 inc lines | Revert both |
| `tests/e2e/baseline-throughput.spec.ts` | NEW; the probe spec | Delete on cleanup OR promote to a permanent regression after T2 lands |

## 7. Next gate

The plan's T0 is complete. **Do not proceed to T1/T2/T3 without explicit user
go-ahead.** When go-ahead arrives, the working tree should be cleaned (per §6)
in a separate commit BEFORE the chosen experiment begins, so each task's diff
remains surgical.
