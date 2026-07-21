# 37-01 Summary — Spike render harness (SCALE-01 track a)

**Status:** COMPLETE 2026-07-21
**Requirement:** SCALE-01 (render-track harness; measurement run is 37-04)

## Discovery (task 1 — read-only census, resolves the verb-set VERIFY)

`SELECT COUNT(DISTINCT "activityVerb"), COUNT(DISTINCT "objectType") FROM "AccActivityAccds"`
→ **57 verbs, 13 objectTypes** (2026-07-21, pg client, count-acc-data.cjs connection pattern).
Column dtypes locked: verbId/objectTypeId/month = Uint8; projectId (956)/authorId (2,313) = Uint16.
Recorded in `SPIKE_CARDINALITIES` (spikeSynthetic.ts) for 37-02/37-03 reuse.

## Files added (additive only — no live-surface edits)

- `app/(dashboard)/users/scale-spike/spikeSynthetic.ts` — deterministic (mulberry32) Gaussian-mixture
  positions (48 clusters, ±350 spread, stride-3, z=0), skewed attribute columns at live
  cardinalities, verb-derived RGBA palette. Pure module (shared with the 37-02 route).
- `app/(dashboard)/users/scale-spike/spikePhysicsStub.ts` — minimal PhysicsLayer
  (`frozen:true`, `getPositions()`, `getSliders()`; rest inert; one documented
  `as unknown as PhysicsLayer` for never-read members).
- `app/(dashboard)/users/scale-spike/ScaleSpikeClient.tsx` — mounts production `GraphCanvas2D`;
  `window.__SCALE_SPIKE__` bridge: `isReady/getInfo/runScenario/getResults/setResult`;
  scenarios `rest` / `panzoom` (restoreView oscillation) / `cpuAmbient` (full-set stride-3
  sin/cos + `pushPositions` — the CPU ceiling) / `gpuDrift` (`?gpu=1` → `gpuSimulation:true`,
  cosmos GPU sim owns motion). Sampling: rAF deltas ≥10 s (default 12 s), median inst-fps +
  min 1 s-window fps, windows also fed to the PRODUCTION `createAmbientFpsController` for its
  tier verdict. Also records: `webglcontextlost/restored` events, `WEBGL_debug_renderer_info`
  renderer/vendor (throwaway context — never pokes cosmos's canvas), JS alloc accounting,
  `performance.memory` when present, `readyAtMs`, synthetic `genMs`.
- `app/(dashboard)/users/scale-spike/page.tsx` — `NEXT_PUBLIC_ACC_SCALE_SPIKE !== "1"` →
  `notFound()`; `?n=` (default 4,862,301), `?seed=`, `?gpu=1` parsed server-side.
- `app/(dashboard)/users/scale-spike/spikeSynthetic.test.ts` — determinism/shape/bounds/
  cardinality pins (4 tests).

## Deviations from plan

- `createAmbientMotionLayer` NOT reused (as planned — per-node id strings prohibitive at 4.86M);
  only `createAmbientFpsController` reused, per plan context note.
- Honest caveat encoded in the harness: `rest` fps can reflect idle rAF cadence (cosmos draws
  on demand); pan/zoom + ambient scenarios are the load-bearing numbers. Note lands in results.
- `cpuAmbient` is auto-skipped (with note) under `?gpu=1` — `pushPositions` is gated off in GPU
  mode by GraphCanvas2D; the 37-04 spec runs it on the frozen-mode pass.

## Gates

- `npx vitest run app/(dashboard)/users/scale-spike/spikeSynthetic.test.ts` → **4/4 passed**.
- `npx tsc --noEmit` → **0 errors**.
- `node scripts/repo-map/check.cjs` → **passed** (3 dep-cruiser warnings + 248 ast-grep findings
  are the pre-existing baseline, unchanged).
- Isolation grep: no file outside `users/scale-spike/` imports spike modules; flag gate present.

## Follow-ups / debt

- None durable. The remove-or-re-gate decision for the spike route belongs to milestone close
  (noted in page.tsx comment).
