# 41-02 Summary — Activity fixture and E2E re-baseline

## Shipped

- Added a deterministic 180-event organic fixture with three exact 60-event
  months, multiple values across every activity dimension, honest meta, and all
  ten aligned binary columns.
- The payload route selects the fixture only when
  `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and `ACC_ACTIVITY_TEST_FIXTURE=1`; without the
  server-only flag it retains the full artifact path.
- Replaced the retired instance/3D suites with compact activity contracts for
  both aliases, finite populated state, dimension morph composition,
  exact-month/All/playback truth, reduced-motion static stepping, and real
  strict-subset lasso with time-change clearing.
- Ported the median-of-five baseline to navigation-to-activity-ready, added the
  headed D3D11 ≥10-second Tier-0 hard-gate recorder, and extended the existing
  orchestrator to combine payload, navigation, and hard-gate artifacts.

## Deviation

- TypeScript exposed five additional specs whose only typing/runtime authority
  was the retired `__ACC_GRAPH_TEST__` bridge. After inspection, their finite
  position/group-morph/ambient coverage was subsumed by the new gates and their
  user-focus/similarity contracts no longer exist, so they were deleted. The
  separate person-graph suite remains untouched.

## Gates

- Fixture Vitest: **1 file / 1 test passed**.
- `npx tsc --noEmit`: **passed**.
- Isolated `NEXT_PUBLIC_ACC_GRAPH_TEST=1` production build: **passed**.
- Fixture-backed Playwright on `:3100`: **4 tests passed** in 15.1 s.
- `node scripts/repo-map/check.cjs`: **passed** (existing non-blocking warnings:
  dependency-cruiser 1, ast-grep 231 against baseline).
- `node --check scripts/measure-spatial-graph-baseline.cjs`: **passed**.
- Retired E2E-reference audit: **clean**.
- Commit: `2eefe742` (`test(activity): rebaseline universe e2e`).

## Follow-up

- Plan 41-04 owns the full-artifact median-of-five payload/navigation runs and
  the binding headed D3D11 hard gate; fixture measurements are not scale proof.
