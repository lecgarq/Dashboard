# Phase 40 Verification — Dimensions & Sliders at Scale

**Date:** 2026-07-21 · Plans: 40-01, 40-02, 40-03 (all summarized)
**Commits:** `6b7be17a` (40-01), `2356e659` (40-02), `5f11dada` (40-03), plus
docs commits `8489a6c7`/`ff357a78`/`9ee3abf1`.

## Requirement coverage

### DIM-07 — activity-native dimension surface

- **Criterion 1 (7+ dims, honest coverage):** SHIPPED. `activityDimensions.ts`
  defines 8 descriptors (verb 116, module 7, objectType 14, month 20, role 91,
  company 347, project 957, author 2,328); author is color-by only (owner
  decision 4). Coverage = sentinel-aware nonzero-id counts
  (`activityDimensionCoverage`), surfaced as "covered/total" captions in
  `ActivityDimensionsPanel` (established coverageText format). Pins:
  `activityDimensions.test.ts`, panel test option-split + coverage-line pins.
- **Criterion 2 (group-by/color-by/strength UX, organic never grid):**
  SHIPPED. Panel drives shell state; `buildGroupLayout` places EVERY category
  on a size-aware golden-angle spiral with seeded jitter + reflected overflow
  (K=957 distinctness pinned in `activityGroupLayout.test.ts`); per-node
  targets preserve rest texture (RMS-normalized offsets — clumps are shrunken
  constellations). Color-by swaps buffer + honest legend
  (`activityColorBy.test.ts`); labels ride the morph via MapClusterLabels.

### PERF-07 — morph/ambient inside the perf bar, contract evolved

- **Criterion 3 (GPU-side morph):** SHIPPED. CPU/rAF per-node morph REPLACED
  by cosmos v3.3's built-in GPU position transition
  (`morphPointSet` → `setPointPositions` + `render(undefined, durationMs)`,
  one upload per commit; drag commits rAF-coalesced). Decimated ambient ≤100k
  via the 37-BASELINE-proven choreography (owner decision 1). **fps numbers
  this phase are advisory by design** — the binding ≥50fps Tier-0 measurement
  is Phase 41 REND-04 (headed + D3D11 + renderer guard), per the CONTEXT
  measure-last discipline. Not a gap; recorded.
- **Criterion 4 (motion contract evolved + pinned):** SHIPPED. Contract
  may/may-not list in the `activityMotion.ts` header; pinned by
  `activityMotion.test.ts` (one-upload-per-morph, ambient subset bounds,
  Proxy-guarded no-force-sim, reduced-motion static). Instance-era pins kept
  for the kept sidebar modules — nothing deleted-but-unreplaced (40-02).

### Criterion 5 — gates actually run (40-03 close)

| Gate | Outcome |
|---|---|
| Focused vitest (panel) | 5/5 pass |
| Activity dir sweep | 8 files / 37 pass |
| `npx tsc --noEmit` | clean, whole tree |
| `node scripts/repo-map/check.cjs` | passed (1 pre-existing dep-cruiser warn; ast-grep baseline-checked) |
| Full `npm test` | 337 files passed / 1 skipped · 2556 tests passed / 1 skipped (TEST-01/02/03 green) |

## Retirement (owner decision 3)

Deleted clean with zero importers (rg-verified): `DimensionSearchBox.tsx`,
`PresetBar.tsx` (+test), `CatalogSliderSidebar.tsx` (+test),
`RightPanelStack.tsx` (+test). WIP-carrying files
(`catalogTargets.ts`, `dimensionCatalog.types.ts`, `catalogTargets.test.ts`)
untouched per plan.

## Deviations (carried from summaries)

- 40-01: rim-clamp → reflection in `categoryCentroids` (K=957 distinctness);
  module `hasSentinel: false` ("(none)" is a real displayed category).
- 40-02: GPU morph is cosmos-native (no patch/custom shader); fallback clause
  unused. Ambient uploads the full buffer per frame (only ≤100k entries
  mutate) — Phase 41 measures.
- 40-03: GroupByControls/SliderContext not reused (instance-shaped contracts);
  panel composes DimensionSlider directly. Chip colors legend-aligned only
  when group-by === color-by, else honest grey. Strength drag in region mode
  restores the sample before morphing.

## Over-engineering pass (completion step 2)

Phase diff reviewed: 40-03 is net-negative (−776/+719 incl. docs); the pure
modules (dimensions/layout/colors/motion) each have a single consumer path +
focused tests, no speculative abstraction found. No further deletions taken;
the instance-era orphan sweep is deliberately deferred to milestone close
(WIP-adjacent files, see CONCERNS).

## Remaining VERIFY / gaps

- None blocking. fps + time-to-graph + e2e re-baseline are Phase 41 by
  roadmap design (measure-last).
- Owner live morph-quality review (ROADMAP UI hint) happens on the deployed
  build — route probe below.

## Deploy (autoDeploy)

Deployed 2026-07-21: deploy-sequence run end-to-end (task stopped, port freed,
`npx tsc --noEmit` clean, `npm run build` succeeded, task restarted).

- **BUILD_ID:** `nisFtHzavDZXZs-Ej75XB`
- **Probe:** `http://localhost:3000/users/spatial-graph` → HTTP 200, 10,338
  bytes (auth shell for the unauthenticated probe — established health
  pattern). `LECG Dashboard Local` task Running; Postgres listening on 5432.
- Owner live morph-quality review pending on this build (ROADMAP UI hint).
