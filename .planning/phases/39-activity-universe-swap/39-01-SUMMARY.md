# 39-01 SUMMARY — Activity universe render swap (ACT-01)

**Completed:** 2026-07-21

## What shipped

- **Codec promoted to shared:** `app/(dashboard)/users/scale-spike/columnar.ts`
  → `lib/acc/columnarPayload.ts` (git mv, history preserved) + test. Importers
  updated: ScaleSpikeClient, scale-spike route, activity-universe route builder
  script, activity-payload e2e spec.
- **New `activity/` module** under `app/(dashboard)/users/access-analysis/`:
  - `moduleColors.ts` — first-paint color-by = module/serviceGroup (owner
    decision 3); 7 real dict labels each mapped to the established
    ModulesPieChart color language (docs→azul, admin→wine-rose, issues→naranja,
    rfis→goldenrod, sheets→palm, submittals→wine, "(none)"→zinc-500); palette
    table lookup for the 4.9M buffer; legend with honest full-set counts.
  - `lodSample.ts` — rung L2 (owner decision 4): deterministic uniform sample
    stride 10 → 490,489 of 4,904,886; exact `viewportIndices` region detail
    when the visible region fits the 500k cap; gather helpers return the
    renderedIndex→fullIndex mapping; honest LOD captions.
  - `activitySizes.ts` — sizing from real event data: monthId recency ramp,
    radii 1.5–3.5 world units (tight so density carries the picture).
  - `useActivityUniversePayload.ts` — meta (`?meta=1`) + binary fetch + shared
    codec decode; honest error copy for 404/HTTP/decode/count-mismatch.
  - `activityPhysicsStub.ts` — frozen PhysicsLayer stub (spike-proven pattern).
  - `activityTestBridge.ts` — `window.__ACTIVITY_UNIVERSE_TEST__` counters
    (ready/resident/rendered/lodMode/stride/selected) behind
    `NEXT_PUBLIC_ACC_GRAPH_TEST=1` — Phase-41 re-baseline seam.
  - `ActivityUniverseShell.tsx` — GraphCanvas2D frozen-mode mount (no
    gpuSimulation, no ambient — static this phase by design); LOD state machine
    on debounced wheel/pointerup (250 ms) using `setPointSet` + `screenToSpace`
    viewport bounds; GraphLoadingSkeleton loading state; honest error card;
    caption stack (LOD line, count + month floor "data from Dec 2024"); module
    legend card. Theme-resolved background (#09090B dark / #FFFFFF light).
- **Mount swap:** `AccessAnalysisShellClient` now renders ActivityUniverseShell
  (dynamic, ssr:false). PersonGraph3D opt-in branch preserved (separate
  surface). Old AccessAnalysisShell still on disk — deleted in 39-03.
- **Instance bytes off the route:** `spatial-graph/page.tsx` is now a simple
  sync page (no helpers/HydrationBoundary — nothing left to prefetch);
  `prefetchAccessAnalysisRouteData` removed from `acc-route-hydration.ts` and
  its test block dropped. `/users` prefetch seam untouched (v2.4 PERF-04 trap
  respected — hydrationState.ts still owns the /users boundary).

## Deviations

- `/users/access-analysis/page.tsx` needed no edit — it is already a redirect
  to `/users/spatial-graph` (single mount point confirmed).
- Camera fit needs no new plumbing: the canvas mounts only after payload
  decode, with the sampled set as the physics stub's initial positions, so the
  existing fitViewOnInit + spread-fit path frames the cloud (spike-proven).

## Gates

- Focused vitest: 13/13 (codec 3, lodSample 5, moduleColors+sizes 4,
  acc-route-hydration 1).
- `npx tsc --noEmit`: clean.
- `node scripts/repo-map/check.cjs`: PASS (pre-existing warning baseline:
  3 depcruise warns, 248 ast-grep findings — unchanged class).
- Live-browser probe deferred to phase deploy (no dev server on this repo;
  isolated/prod verification at completion per deploy-sequence).

## Follow-ups / debt

- Hover/click/lasso are NOOP handlers until 39-02 (by wave design).
- Region-LOD full-set scan (~4.9M bounds checks per debounced interaction-end)
  is O(n) JS — fine single-user; revisit only if Phase 41 measures it hot.
- VERIFY (carried): sampled density must read as organic regions on the live
  iGPU — checked at the phase deploy probe (owner sees the live universe).
