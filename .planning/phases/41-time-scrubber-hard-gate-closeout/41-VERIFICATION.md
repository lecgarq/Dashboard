# Phase 41 Verification — Time Scrubber, Hard Gate & Closeout

**Date:** 2026-07-21 · Plans: 41-01 through 41-04 (all summarized)
**Feature commits:** `f2c7bad8` (scrubber), `2eefe742` (activity E2E),
`c28cb962` (instance cleanup), `72a8b71d` (ambient upload bound),
`8aa4c3e2` (stale catalog E2E retirement).

## Requirement coverage

### TIME-01 — exact-month temporal scrubber

**SHIPPED.** The activity universe opens on All and filters the real point set
to one exact month via the native `month` column. The bottom scrubber exposes
All, Play/Pause, a one-second oldest→newest cadence, month label, and honest
active/total count. Time changes atomically rebuild the rendered→full mapping,
LOD candidates, active legend, and grouped layout while clearing hover,
selection, and lasso state. `prefers-reduced-motion` disables playback and
retains static manual stepping. Evidence: `activityTime.ts`,
`ActivityUniverseShell.tsx`, `activityTime.test.ts`, `lodSample.test.ts`, and
the fixture-backed activity Playwright suite.

### E2E-03 — activity-universe closeout harness

**SHIPPED.** `activityUniverseTestFixture.ts` provides 180 deterministic
organic events across three exact 60-event months and all ten aligned binary
columns. It is reachable only when both `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and the
server-only `ACC_ACTIVITY_TEST_FIXTURE=1` are set. `acc-dc-graph.spec.ts` now
pins both route aliases, finite populated state, exact-month/All/playback,
dimension composition, and reduced-motion behavior; `acc-3d-lasso.spec.ts`
pins a real strict-subset lasso and time-change clearing. The isolated `:3100`
production harness passed **4/4 tests in 11.8 s**.

The instance-era bridge suites and the final clean catalog-preview spec were
retired after importer/runtime audits showed their surfaces no longer exist.
The separate person graph remains untouched.

### REND-04 — binding full-scale renderer gate

**SHIPPED at the Phase-37 owner-approved L2 rung.** All **4,904,886** events
remain resident and counted while **490,489** are rendered at far-zoom LOD.
The first headed hardware sample correctly blocked closeout: **47.8238 fps**
over 12.002 s / 574 frames with ambient active but Tier **0→2**. Investigation
traced the miss to uploading the full rendered-position buffer every animation
frame even though only the ≤100k ambient subset moved.

The final measured implementation bounds new ambient targets to 10 Hz at Tier
0 and 5 Hz at Tier 1; cosmos interpolates between targets on the GPU. Rebuilt
full-artifact result:

| Evidence | Result |
|---|---:|
| Renderer | `ANGLE (Intel, Intel(R) Graphics (0x00007D67) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| Sample | 12,004.4 ms · 807 frames |
| FPS | **67.22535070467484** (floor 50) |
| Ambient | active before and after |
| Tier | **0 before / 0 after** |
| Controller windows | 60.5436 fps before / 66.1965 fps after |

No SwiftShader, tier demotion, inactive ambient, or floor miss remained.

## Full closeout gates

| Gate | Exact outcome |
|---|---|
| Focused Vitest | 7 files / 33 tests passed |
| `npx tsc --noEmit` | passed, no output |
| Full `npm test` | 339 files passed / 1 skipped; 2,562 passed / 1 skipped (2,563 total), 66.72 s |
| `node scripts/repo-map/check.cjs` | passed; existing non-blocking dependency-cruiser 1 and ast-grep 231 baseline warnings |
| Isolated fixture Playwright | 4/4 passed, 11.8 s |
| Payload fetch+decode, 5 runs | 457 / 451 / 463 / 431 / 415 ms; **451 ms median**, budget 2,500 ms; 156,957,160 bytes |
| Navigation-ready, 5 runs | 2,306.8 / 1,699.7 / 1,581.4 / 1,757.7 / 1,553.1 ms; **1,699.7 ms median**; first paint median 308 ms |
| Headed D3D11 hard gate | **67.225 fps**, 12.004 s, ambient active, Tier 0→0 |

The full test total includes the standing TEST-01/02/03 characterization pins.

## Cleanup and scope audit

- Dropped the unused `AccInstanceEmbedding` table with idempotent raw SQL and
  removed its Prisma model, create SQL/script, dead mocks, and ERD block.
- Deleted only the zero-importer `SelectionContext`; every other audited
  sidebar candidate still has a source importer and was retained.
- Preserved the dirty `catalogTargets.ts`, `catalogTargets.test.ts`, and
  `dimensionCatalog.types.ts` files, plus the user's unstaged ERD addition.
- Final diff inspection found no drive-by dependency or production-surface
  expansion.

## Deploy and authenticated production probe

With all gates green and `autoDeploy:true`, the `LECG Dashboard Local` task was
stopped, PID 64804 was terminated, `npx tsc --noEmit` passed, and
`npm run build` completed. The task was restarted on PID 63728.

- **BUILD_ID:** `QJVfBFWLtaVk9USrIvqbD`
- **Health:** `GET http://localhost:3000/api/health` → 200,
  `status: ok`, database connected (2026-07-22T01:19:41.207Z).
- **Authenticated populated route:** Playwright session loaded
  `/users/spatial-graph` and proved the activity canvas, time scrubber,
  `All months`, docs legend, and exact
  `4,904,886 / 4,904,886 events` count — **1/1 passed in 4.6 s**.

## Deviations and remaining gaps

- The binding first renderer run failed and was fixed before deployment; both
  failing and passing numbers are retained above.
- An initial deployment probe used the obsolete
  `catalog-preview-lazy.spec.ts`; its captured DOM already showed the fully
  populated activity route, but its retired `group-by-controls` selector timed
  out. A current-selector probe passed, and the clean obsolete spec was
  removed in `8aa4c3e2`.
- Remaining `VERIFY:` items or Phase-41 blockers: **none**.

Phase 41 is verified and deployed. Milestone closure remains a separate
`$lecg-close-milestone` audit as required.
