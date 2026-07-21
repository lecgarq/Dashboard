# 40-02 Summary — GPU morph seam, decimated ambient, evolved contract pins

**Status:** COMPLETE · commit `2356e659` · 2026-07-21

## Changed files

- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — new optional
  handle method `morphPointSet(positions2, durationMs)`: one
  `setPointPositions(p, true)` + `render(undefined, durationMs)`; resets the
  prevUploaded no-op-skip. `transitionEasing: "quad-in-out"` added at construct
  (config `transitionDuration` stays 0 → every existing call path still
  snaps; only morphPointSet passes a per-call duration).
- `app/(dashboard)/users/access-analysis/activity/activityMotion.ts` (new) —
  absorbs `activityPhysicsStub.ts` (deleted; `createActivityPhysicsStub` +
  `toStride3` re-homed, sole importer ActivityUniverseShell updated).
  `createActivityMotion`: base-buffer ownership, `morphTo` (delegates to
  morphPointSet, suspends ambient for the transition window, rebases),
  ambient on a deterministic every-k-th subset ≤100k (owner decision 1) using
  the 37-spike choreography constants (cos/sin drift, amp 2.4/0.72 — the
  73 fps @106k proven pattern), reusing `createAmbientFpsController` tier
  machinery (tier 1 → 30 Hz throttle, tier 2 → parked), reduced-motion → fully
  static + snap morphs. Header carries the evolved motion contract
  (may/may-not list) — the recorded PERF-02 evolution.
- `activityMotion.test.ts` (new) — the rewritten pins: one-upload-per-morph +
  zero pushes inside the transition window; ambient mutates only its subset
  within amplitude bounds; a Proxy-guarded handle proves the layer can never
  reach a force-sim surface; reduced-motion static; stopAmbient settles to
  base; setBase length guard; Phase-39 stub compat.

## Key mechanism (plan-time VERIFY resolved)

Cosmos v3.3 ships a built-in GPU position transition — sourcePositionFbo/
targetPositionFbo + interpolatePosition shader with config easing;
`render(simulationAlpha?, transitionDuration?)` (dist/index.d.ts:375) is the
public per-call duration override. Owner decision 2's "GPU lerp shader" is
therefore cosmos-native — NO patch/custom shader. Hit-testing stays correct
mid-morph (currentPositionTexture "matches what's on screen" invariant).
Fallback clause (decimated morph + snap) NOT needed; remains available if
owner UAT at 490k shows visual issues (Phase 41 owns fps measurement).

## Instance-era pins disposition

`physicsLayer.test.ts` / `useGraphRafLoop.test.ts` / `staticLayer.test.ts`
keep pinning the instance-era d3 physics module (still type-imported by the
kept sidebar). They are superseded FOR THE ACTIVITY PATH by
activityMotion.test.ts — nothing deleted-but-unreplaced.

## Gates

- Focused vitest: activityMotion 7/7; full activity dir + CosmosCanvasClient
  regression sweep 8 files / 35 pass.
- `npx tsc --noEmit`: clean.
- `node scripts/repo-map/check.cjs`: passed (1 pre-existing dep-cruiser warn,
  ast-grep findings baseline-checked).

## Follow-ups / debt

- Ambient uploads the full rendered-set buffer per frame (only ≤100k entries
  mutate); 37-BASELINE says the CPU write loop, not the upload, was the killer
  — Phase 41's headed D3D11 gate is the binding proof.
