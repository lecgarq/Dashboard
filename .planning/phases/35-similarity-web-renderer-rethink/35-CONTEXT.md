# Phase 35: Similarity-Web Renderer Rethink - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the existing similarity web on `/users/spatial-graph` and its
`/users/access-analysis` alias off the main-thread Canvas2D raster bottleneck while
preserving the Phase-32 visual and interaction contract.

This phase covers **REND-01** and **REND-03**:

1. Prototype and measure the three approved levers against the full live ~14.2k-link
   web: Cosmos-native links, OffscreenCanvas worker rasterization, and zoom-based edge
   decimation, alone or in the smallest useful combination.
2. Implement the measured winner on the live flag-OFF 2D path and record the comparison.
3. Preserve strength bands, monotone width/alpha, ambient < selected < hover priority,
   the 25% morph floor, reduced-motion snap, and the frozen-handle invariant.

**What does NOT change here:**

- The hard sustained Tier-0 >=50 fps acceptance gate belongs to Phase 36 (REND-02).
  Phase 35 must materially reduce the measured raster/main-thread cost but does not
  close the milestone on its own.
- No edge-set, similarity-score, embedding, database, API, control, legend, or graph
  data change. `AccInstanceEmbedding.neighbors` remains authoritative.
- No parked 3D renderer work, GPU simulation start/reheat, new WebGL surface, npm
  dependency, or test-file split.
- The unrelated 2D camera restore gap, default e2e harness repair, and cluster-label
  visibility concern remain in `CONCERNS.md`.

**Name-collision trap:** change `app/(dashboard)/users/access-analysis/` (the spatial
graph), not `app/(dashboard)/access-analysis/` (the 23-panel charts page).
</domain>

<evidence>
## Grounding Sources

- Historical `.planning/phases/33-perf-closeout-verification/33-BASELINE.md` at commit
  `27297514`: 22,279 nodes / ~14.2k mapped links; overlay visible 17.57 fps versus hidden
  60.00 fps; approximately 40 ms/frame of Canvas2D raster work. Phase-33 throttling
  improved the final path to 41.33 fps but still degraded below the 50 fps Tier-0 gate.
- `app/(dashboard)/users/access-analysis/SimilarityWebOverlay.tsx`: current main-thread
  canvas owns projection, quadratic Path2D batching, opacity easing, focus layering, and
  the 10 Hz ambient-only redraw throttle. This is the bottleneck/replacement boundary.
- `app/(dashboard)/users/access-analysis/similarityWeb.ts` and
  `similarityWeb.test.ts`: pure authoritative mapping, exact strength-band boundaries,
  palette construction, focus resolution, curve geometry, morph target, and opacity
  easing. Renderer work must reuse or extend these contracts rather than recompute data.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`: maps the server edge
  set once and composes `GraphCanvas` plus `SimilarityWebOverlay`. It already owns morph,
  position-version, selected-match, and hover state; no new store or query is needed.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx`: the installed Cosmos graph
  already exposes `setLinks` and `setLinkColors` through the frozen imperative handle.
  Add only the smallest missing native-link controls at this boundary.
- Installed `@cosmos.gl/graph` 3.3.0 types prove the prior "native means straight links"
  assumption stale: it supports `curvedLinks`, curve segment/weight/control-point tuning,
  per-link `setLinkColors`, per-link `setLinkWidths`, global `linkOpacity`, highlighting,
  and GPU link rendering. The existing package is patched only to remove simulation-space
  clamps; no dependency change is required.
- `app/(dashboard)/users/access-analysis/graphTestBridge.ts` and
  `tests/e2e/phase32-ambient.spec.ts` already expose full-data node/link/tier evidence and
  the LIFE-03 sampling method. Extend this seam narrowly for renderer identity and
  comparison counters instead of adding a second browser harness.
- `tests/e2e/acc-dc-graph.spec.ts` is Phase-34 re-baselined at the exact 22,279-node
  snapshot and must remain green.
- `VERIFY:` measure the current full-data edge count again at execution; the server cap
  is 18k and historical mapped observations vary slightly around 14.2k.
- `VERIFY:` tune Cosmos curve parameters against the current 0.14 quadratic bow and
  capture visual evidence; the APIs exist, but geometric equivalence is not assumed.
</evidence>

<defaults>
## Inferred Dashboard Defaults

- Prototype in this order: Cosmos-native curved links first (most direct existing-platform
  path), OffscreenCanvas worker second as the exact-geometry comparator, deterministic
  zoom decimation third as an allowed fallback. Measurement, not order, selects the ship.
- Prototype code is disposable. Keep only the winning live path plus the smallest useful
  fallback; do not ship three renderer implementations or a renderer framework.
- Preserve `NEXT_PUBLIC_ACC_SIM_WEB` as the single-flip rollback. No new user-facing
  renderer switch, quality setting, toast, or legend.
- Native-link integration must not mix the similarity web with the existing same-user
  footprint-edge props used by the parked 3D path. The flag-OFF 2D similarity buffer has
  explicit ownership; the 3D path remains unchanged.
- Reuse the existing indexed edge and paint buffers. Convert to the exact Cosmos buffers
  once per data/theme change, not per frame; keep the ambient position upload path and
  frozen simulation behavior unchanged.
- Selected and hovered focus edges are always complete and render above ambient links,
  including synthesized selected-match edges absent from the capped global web.
- Reduced motion keeps identical static visual states and snaps opacity transitions.
- Candidate measurements use the established isolated `:3100` production harness, full
  live snapshot, same camera/view, warm-up, and repeated >=10-second samples. Record FPS,
  renderer, edge count, active tier, and relevant main-thread/raster counters.
- Phase-32 pure tests are extended, not weakened. Application changes require focused
  Vitest, `npx tsc --noEmit`, repo-map when boundaries/imports move, re-baselined graph
  e2e, and the design gate because the rendered surface changes.
</defaults>

<decisions>
## Locked Owner Decisions (2026-07-20)

1. **Cosmos-native curved GPU links are preferred when measurements win.** Close-but-not
   pixel-identical curve geometry is acceptable. Exact data membership, strength-band
   boundaries, monotone width/alpha, palette meaning, draw priority, morph floor, and
   interaction behavior remain non-negotiable. Tune Cosmos's installed curved-link
   controls to the closest credible Phase-32 appearance and record visual evidence.

2. **Zoom decimation is allowed only as a fallback.** It may thin the ambient web while
   zoomed out, using a deterministic stable subset, only if the non-decimated winning
   path still needs it. Selected and hovered links are never decimated. The full ambient
   web must return for the settled close view; no popping or reshuffling between frames.

3. **Evidence chooses the final combination.** Prototype all three requirement-named
   levers, but ship the smallest combination that materially removes the Phase-33
   Canvas2D/main-thread ceiling while satisfying Decisions 1–2 and REND-03. If native
   curved links meet the visual/performance bar alone, delete or omit the worker and
   decimation prototypes.

## Requirement Traceability

- REND-01 -> Decision 3 + full-data comparison defaults + recorded Phase-33 baseline.
- REND-03 -> Decisions 1–2 + pure-model/test reuse + focus/reduced-motion defaults.

## Deferred Items

- Hard >=50 fps Tier-0 milestone gate and tier-controller-idle proof -> Phase 36.
- Pixel-identical reproduction of the old quadratic bow -> not required if the chosen
  GPU curve is visually credible and all semantic contracts remain exact.
- User-facing renderer/quality controls and persistent multiple-renderer architecture ->
  skipped; add only if later UAT proves automatic behavior insufficient.
</decisions>
