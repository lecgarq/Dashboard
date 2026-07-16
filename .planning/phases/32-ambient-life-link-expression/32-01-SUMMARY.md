# 32-01 SUMMARY — Ambient micro-orbits and FPS degradation

**Status:** COMPLETE · 2026-07-16

## What shipped

- `ambientMotion.ts` adds one deterministic, allocation-free typed-array layer.
  Node-id hashes seed anchor-relative x/y micro-orbits; the six existing recency
  buckets monotonically control amplitude and speed; z and node radius remain
  unchanged. Hovered, selected, and ten-match foreground indices freeze while a
  focused background continues at 45% amplitude.
- Catalog/Group-by movement pauses offsets until the existing transition layer
  settles, then resumes from zero over 180ms. Reduced motion and hidden-tab state
  use exact anchors and reset the FPS sampler.
- The locked controller starts at Tier 0, downgrades one tier after two consecutive
  3-second windows below 50fps, caps Tier 1 recent-node output at 30Hz, makes Tier 2
  static, and recovers one tier only after at least 10 seconds at >=55fps.
- `GraphCanvas` composes the layer after the existing catalog anchor transition and
  sends its reused buffer through the unchanged `getPositionsOverride` -> rAF ->
  `pushPositions` path. No simulation start/resume/reheat was added.
- The existing flag-gated graph bridge now reports ambient tier, animated count,
  sampled FPS, position version, and mapped similarity-edge count. Its node screen
  lookup reads Cosmos's rendered positions so test-driven hover remains accurate
  while ambient offsets are active.
- `phase32-ambient.spec.ts` covers both route entry points, the full-data timed gate,
  the real controller sequence, and reduced-motion click continuity.

## Gates

- Focused Vitest: `ambientMotion.test.ts` + `GraphCanvas.test.ts` -> **2 files / 33
  tests passed**.
- `npx tsc --noEmit` -> **clean** before the isolated build.
- Isolated webpack production build (`NEXT_DIST_DIR=.next-e2e`, test bridge flag) ->
  **passed**, BUILD_ID `j80DJGvEkQdGJsb27cpbm`.
- `tests/e2e/phase32-ambient.spec.ts` against production `:3100` -> **3 passed**.
- Hard full-data sample: **22,279 nodes**, **14,200 mapped links**, **60.04fps** over
  **10.010s**, Tier **0 -> 0**, **22,279 animated nodes**. Full mode therefore passes
  the locked >=50fps workshop-machine gate.
- Injected locked-window evidence through the same controller: tier sequence
  **`[0,1,2,1]`**, proving two-window downgrades and one-tier hysteretic recovery.
- Scoped diff check clean; added-line simulation grep found no `start`,
  `resumeSimulation`, `setClustering`, or `setClusters` call.

## Deviations

- The established production harness uses `playwright.verify.config.ts` because the
  default config starts a webpack development server; product behavior is unchanged.
- `/users/access-analysis` canonicalizes to `/users/spatial-graph`. The browser gate
  now asserts the shared rendered surface after that existing redirect instead of
  requiring the alias URL to remain in the address bar.
- The live 18k server budget maps to 14,200 client edges for the current 22,279-node
  snapshot after unknown endpoints/self-pairs are dropped; verification records the
  rendered count rather than repeating the configured budget.

## Durable follow-up

None. Tier 0 passed on the workshop machine; the shipped degradation path remains the
safety net required by LIFE-03.
