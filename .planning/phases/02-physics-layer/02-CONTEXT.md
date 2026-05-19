# Phase 2: Physics Layer - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

`physicsLayer.ts` drives a d3-force-3d simulation using the math layer's per-dimension target arrays. It registers named per-dimension forces, maps `max(sliderValues)` to global engine parameters (alpha, alphaDecay, repulsion), freezes positions to the DuckDB-WASM positions cache when the simulation settles, and owns an `alphaMask` Float32Array so filter/search/lasso events from later phases never restart the simulation.

Out of scope for this phase: rendering (Phase 3), interaction wiring (Phase 4), and any UI surface.

</domain>

<decisions>
## Implementation Decisions

### Force composition
- **Per-dim forces**: one named force per dimension (6 total) — `simulation.force("dim-activity", ...)`, `"dim-recency"`, `"dim-role"`, `"dim-perms"`, `"dim-admin"`, `"dim-external"`. Each force pulls toward that dim's target via `forceX/Y/Z(d => targets[d.index])` with its own `.strength()` tracking the matching slider value. Matches PHYS-01 example literally.
- **Baseline force**: `forceManyBody` (repulsion) only — required by PHYS-03. No `forceCollide`, no `forceCenter`.
- **2D/3D**: simulation always runs in 3D. Render layer flattens Z when in 2D mode. Single source of truth; no force reconfiguration on mode switch.
- **Math input contract**: math layer exposes per-dim target Float32Arrays (e.g., `activityTargetsX/Y/Z`); each named force reads its own dim's array. Physics never calls `computeTargetPositions` directly.
- **Initial seeding**: cached positions if `hashNodeSet(nodeIds) + slider-bucket` cache hits — node starts frozen, no sim. Cache miss → small random seed in `[-1, 1]^3`.
- **velocityDecay**: d3 default `0.4`.
- **Per-dim force.strength() at slider = 1.0**: `0.1` (d3 `forceX` default). Slider value scales linearly to `[0, 0.1]`.
- **Force composition rule**: pure additive (d3 default). Math layer's monotonic-blend invariant from Phase 1 already validates this is sound.

### Slider→physics mapping
- **Reheat target alpha on slider change**: `alpha = max(sliderValues)`, capped at `0.3`. Gentle reheat — sim resumes warm and settles fast; never a full-restart shock.
- **alphaDecay**: inverse coupling — `alphaDecay = lerp(0.1, 0.02, max(sliderValues))`. Low max → fast decay → quick freeze. High max → slow decay → user sees motion.
- **manyBody.strength**: `lerp(-10, -60, max(sliderValues))`. Sliders at zero = nodes pack tight; sliders engaged = nodes spread so dim clusters are legible.
- **No-reheat optimization**: if sim is frozen AND `abs(newSlider - oldSlider) < 0.02`, skip reheat entirely. Prevents thrashing on scroll-wheel slider tweaks.
- **Mutation API**: slider change → `force.strength(newValue)` on that dim's named force + `simulation.alpha(target).restart()` (the `d3ReheatSimulation` pattern). Never `simulation.restart()` from scratch.

### Freeze-on-rest behavior
- **Trigger**: d3's native `"end"` event (alpha < `alphaMin` = `0.001`). No polling, no custom velocity check, no tick cap.
- **Cache key**: `hash(nodeIds) + hash(sliders quantized to 0.05 buckets)`. Near-equal slider configs share cached positions. Extends Phase 1's positions cache schema.
- **On freeze**: write the position Float32Array to DuckDB-WASM positions cache under the composite key, then call `simulation.stop()` so the tick counter halts (literal PHYS-03 success criterion).
- **Post-freeze slider change**: unfreeze, reheat per the mapping rules above, re-settle, write new cache entry under the new (nodeSet, slider-bucket) key. Old entries remain and are evicted by LRU.

### AlphaMask semantics
- **Value range**: continuous `0.0–1.0` (per-node opacity). Supports lasso's "highlight one cluster, dim the rest" pattern without a second channel.
- **Allocation & ownership**: `physicsLayer` owns the `Float32Array`, sized to node count, and exposes `setMask(predicate: (node) => number)`. Interaction code in Phase 4 calls into this API; it does not own the array.
- **Animation**: render layer eases `current → target` mask values over ~200ms per frame. Physics writes the target instantaneously and does **not** tick interpolation. Keeps physics free of animation concerns.
- **Change notification**: monotonic `maskVersion` counter. `setMask` bumps it; render's RAF loop compares last-seen vs current and re-uploads only when changed. No event emitter, no callbacks.
- **Filter/search/lasso contract (cross-phase)**: these events MUST go through `setMask` and MUST NOT touch the simulation. PHYS-03 invariant: tick counter does not increment after a mask update.

### Claude's Discretion
- Exact module file layout inside `src/` (where `physicsLayer.ts` lives, helper splits).
- Vitest test naming conventions and fixture shape.
- TypeScript type definitions for the public physics API (`PhysicsLayer`, `MaskPredicate`, etc.).
- Internal helper for `lerp`, `quantize`, `hashSliders` — colocate or share with math layer.
- Whether `simulation.alphaMin` and `simulation.alphaTarget` get exposed as tunables or stay hardcoded constants.

</decisions>

<specifics>
## Specific Ideas

- The `d3ReheatSimulation` pattern from PHYS-02 is shorthand for `simulation.alpha(target).restart()` — not a real d3 method. Plans should make this explicit.
- Cache extension: Phase 1's plan `01-01` already extended the positions cache for "z/slider key extension" — Phase 2 consumes that schema, doesn't redesign it.
- Test the PHYS-03 invariant directly: assert tick counter is unchanged across a `setMask` call.
- Test slider sweep 0→1 across one dim while logging `simulation.alpha()`, `simulation.alphaDecay()`, `manyBody.strength()` per step — produces the "observable" log PHYS-03 success criterion requires.

</specifics>

<deferred>
## Deferred Ideas

- Per-dim easing curves for slider → `force.strength` (non-linear ramps) — Phase 2 ships with linear; revisit if motion feels wrong during UAT.
- `forceCollide` or `forceCenter` as opt-in baselines — not needed for Phase 2 acceptance; add later if visual layout calls for it.
- Slider debouncing/coalescing at the input side — belongs in Phase 4 (Interactions), not physics.
- Two-channel mask (visibility + emphasis) — future enhancement if single continuous mask proves insufficient.
- Mode-switch force reconfiguration — deferred; current decision is "always 3D, render flattens".

</deferred>

---

*Phase: 02-physics-layer*
*Context gathered: 2026-05-19*
