# 41-04 Summary — Binding hard gate, deploy, and closeout

## Shipped

- Ran the final full-artifact payload, navigation, and headed D3D11 renderer
  measurements on the workshop machine.
- The first binding renderer sample exposed an ambient-upload bottleneck at
  47.82 fps with Tier 0→2 demotion. `activityMotion.ts` now bounds ambient
  target uploads to 10 Hz at Tier 0 and 5 Hz at Tier 1 while cosmos performs
  the in-between GPU interpolation.
- The repeated hard gate passed at 67.225 fps for 12.004 s / 807 frames with
  ambient active, D3D11 hardware rendering, and Tier 0 before and after.
- Retired the clean `catalog-preview-lazy.spec.ts` after the deployment probe
  proved it targeted a Phase-40-deleted sidebar rather than the live activity
  surface.
- Rebuilt and restarted the local production service, then proved health plus
  the authenticated, populated 4,904,886-event activity route.

## Deviations

- The plan expected measurement to be verification-only, but the first hard
  gate correctly blocked at 47.82 fps. The bounded-target cadence is the
  narrowest measured fix and is pinned by `activityMotion.test.ts`.
- The initial live probe used a committed catalog E2E whose selector no longer
  exists. Its failure capture showed the activity universe was populated; a
  current-selector Phase 41 probe then passed and the obsolete spec was
  deleted instead of weakening the production check.

## Gates

- Final focused Vitest: **7 files / 33 tests passed**.
- Final full `npm test`: **339 files passed / 1 skipped; 2,562 tests passed /
  1 skipped (2,563 total)**.
- `npx tsc --noEmit`: **passed**.
- `node scripts/repo-map/check.cjs`: **passed** (existing non-blocking
  dependency-cruiser 1 / ast-grep 231 baseline warnings).
- Isolated fixture Playwright: **4/4 passed** in 11.8 s.
- Full artifact: payload **451 ms median** (budget 2,500 ms); navigation-ready
  **1,699.7 ms median**; renderer **67.225 fps**, Tier 0→0.
- Production: BUILD_ID `QJVfBFWLtaVk9USrIvqbD`; health 200/database connected;
  authenticated populated-route probe **1/1 passed** in 4.6 s.

## Follow-up

- Phase 41 is complete. The milestone audit/archive is intentionally left to
  `$lecg-close-milestone`.
