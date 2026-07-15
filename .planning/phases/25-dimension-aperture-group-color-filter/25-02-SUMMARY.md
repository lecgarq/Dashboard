---
phase: 25-dimension-aperture-group-color-filter
plan: 02
subsystem: spatial-graph-dimensions
tags: [dimension-aperture, group-by, color-by, coverage, optgroups, DIM-01, DIM-02, DIM-05]

# Dependency graph
requires: ["25-01"]
provides:
  - "dimensionIdSpace.APERTURE_THEME_GROUPS — themed grouping metadata (Baseline · Identity · Activity · Risk & tenure · Permission & reach); PRESET_DIMENSION_IDS is its flattening (17 catalog ids, role at index 0)"
  - "GroupByControls.apertureOptionGroups(catalog, features) — shared option-group view-model: themed optgroups over groupByDimensions(catalog), each option 'Label · covered/total' + ⚠ when under-covered; coverage omitted when total 0"
  - "Toolbar — Color-by select over the SAME aperture (catalog id-space) + persistent amber coverage caveat chip on the active grouping dim (data-testid toolbar-grouped-by-coverage)"
  - "AccessAnalysisShell — catalog-native banded color: picker id → catalog.find → buildDominantClusters → bucketedColorsFromClustering (banded swatches + shared legend, ramp never taken)"
  - "dimensionCoverage.isUnderCovered/coverageText/UNDER_COVERAGE_RATIO (0.9) — shared under-coverage predicate + display formatter"
affects: ["25-03", "26-catalog-slider-wall"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single id-space preserved: both pickers derive options from PRESET_DIMENSION_IDS via groupByDimensions; APERTURE_THEME_GROUPS is display metadata, not a second id list (PRESET is derived from it by flattening)."
    - "Color went catalog-native: the picker value is a catalog id string; nodeColors.COLOR_MODES is decoupled and PINNED to role/project/user for the parked flag-ON registry path only."
    - "Coverage marker: covered/total < 0.9 → ⚠ (fixed documented threshold); node-derived figures only, DC-project denominator stays a VERIFY note."

key-files:
  created: []
  modified:
    - app/(dashboard)/users/access-analysis/dimensionIdSpace.ts
    - app/(dashboard)/users/access-analysis/dimensionIdSpace.test.ts
    - app/(dashboard)/users/access-analysis/nodeColors.ts
    - app/(dashboard)/users/access-analysis/groupByDimensions.test.ts
    - app/(dashboard)/users/access-analysis/GroupByControls.tsx
    - app/(dashboard)/users/access-analysis/GroupByControls.test.tsx
    - app/(dashboard)/users/access-analysis/RightPanelStack.tsx
    - app/(dashboard)/users/access-analysis/Toolbar.tsx
    - app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx
    - app/(dashboard)/users/access-analysis/dimensionCoverage.ts
    - app/(dashboard)/users/access-analysis/graphTestBridge.ts

key-decisions:
  - "PRESET_DIMENSION_IDS = APERTURE_THEME_GROUPS.flatMap(ids) — the themed structure IS the single source; no parallel array exists."
  - "The 17 ids: role/project/user + company/internalExternal/adminMember + activityVolume/activityRecency/signinRecency/dominantActivity/moduleAccess + riskScore/membershipTenure + permissionTier/folderAccessPermissions/folderBreadth/accessibleDataTB (permission strength = folderAccessPermissions per plan)."
  - "Under-covered threshold 0.9 (Claude's discretion): ⚠ appears when >10% of loaded nodes lack a real value; ponytail comment records the ceiling."
  - "Shell keeps colorOverride: string | null (inits/resets 'role') so the documented unreachable branches 2–3 stay intact for the parked flag-ON route; unknown picker ids fall back to the legacy registry path instead of throwing."
  - "Coverage omitted from option labels when the snapshot is empty (total 0) so labels never read '0/0' in harnesses."

patterns-established:
  - "apertureOptionGroups lives in GroupByControls.tsx and is imported by Toolbar — one view-model for both pickers; move to its own module only if a third consumer appears."

requirements-completed: [DIM-01, DIM-02]  # DIM-05 partially (pickers + active-group chip); 25-03 extends coverage labels to the filter

# Metrics
duration: ~25min
completed: 2026-07-15
status: complete
---

# Phase 25 Plan 02: Widened Themed Group-by/Color-by Pickers Summary

**Both `/users/spatial-graph` pickers now offer the full 17-dim owner palette from the single shared `PRESET_DIMENSION_IDS`, organized into themed native optgroups, with honest node-derived coverage inline on every option and a persistent amber caveat chip on the active grouping dim. Color-by is catalog-native: any aperture dim colors into the SAME banded categorical swatches Group-by clusters into (shared legend, sequential ramp unreachable), on the unchanged static embedding.**

## Accomplishments
- `dimensionIdSpace.ts`: `APERTURE_THEME_GROUPS` (5 themes) added; `PRESET_DIMENSION_IDS` widened 3 → 17 by flattening it (role stays index 0/default). Bridge (`REGISTRY_ID_BY_CATALOG_ID`, `colorModeIdForCatalogId`) retained but no longer on the picker path.
- `nodeColors.ts`: `COLOR_MODES` decoupled from PRESET and pinned to `["role","project","user"]`; `categoryForColor`/`buildNodeColors`/ordered-ramp helpers untouched (parked flag-ON path). Phase-24 `nodeColors.test.ts` green **byte-unmodified**.
- `GroupByControls.tsx`: exports `apertureOptionGroups()`; select renders themed optgroups with `Label · covered/total ⚠` option text; new `features` prop threaded from the shell via `RightPanelStack` (one-line pass-through).
- `Toolbar.tsx`: color `<select>` swapped from `COLOR_MODES` to the same themed aperture optgroups (value = catalog id string); "Grouped by" now carries a persistent `⚠ covered/total` amber chip when the active grouping dim is under-covered, `title` names the provenance note (DC-sourced / folder-crawl).
- `AccessAnalysisShell.tsx`: color state is a catalog id; resolved dim → `bucketedColorsFromClustering(buildDominantClusters(features, colorDim), 12)` — same `valueKeyLabel` + `dimensionBands` tiers as Group-by, so color buckets == group buckets and the legend (already fed from `bucketed.legend`) is shared. Defaults to "role" (first paint unchanged). Static embedding, morph wiring, and physics untouched. `catalog` + `groupedByDimId` passed to Toolbar.
- `dimensionCoverage.ts`: added `UNDER_COVERAGE_RATIO` (0.9), `isUnderCovered`, `coverageText` — shared by both pickers.
- `graphTestBridge.ts`: `ShellState.colorMode`/`getColorMode()` typed to the catalog-id space (`string`).

## Task Commit

Single coherent commit: **`917a98c9`** `feat(spatial-graph): widened themed Group-by/Color-by aperture with inline coverage (25-02)` — 11 files, +269/−71.

## Verification Evidence
- `npx vitest run groupByDimensions nodeColors dimensionIdSpace` → 3 files, **45/45 passed** (Task 1 gate).
- `npx vitest run GroupByControls Toolbar RightPanelStack` → 4 files, **18/18 passed** (Task 2 gate).
- `npx vitest run AccessAnalysis bucketedColors dominantClusters mapGrouping graphTestBridge` → 5 files, **85/85 passed** (Task 3 gate).
- `npx tsc --noEmit` → exit 0 (run after Task 1 and again after Task 3).
- `npm test` (full suite) → **331 files passed | 1 skipped; 2557 passed | 1 skipped; 0 failures** (2553 baseline + 4 new tests). `nodeColors.test.ts` green verbatim; `groupByDimensions.test.ts` asserts the widened set with all structural invariants (unavailable dropped, deterministic order, single-source resolution) intact.
- `node scripts/repo-map/check.cjs` → "Repo-map quality gate passed" (2 dep-cruiser warnings + 236 ast-grep findings, unchanged baseline).
- Scope check: no file under `app/(dashboard)/access-analysis/**` (charts page) touched; no layout/physics/reheat file touched; no WebGL, dependency, loader, or Prisma change; pre-existing WIP in sibling files (`featureSnapshot.ts`, `catalogTargets.ts`, `dimensionCatalog.types.ts`, …) left unstaged and untouched.
- **Human-check still pending** (plan's visual UAT): themed optgroups ~17 options in both pickers, inline coverage readable, caveat chip, banded swatches only, no node motion on select. To be exercised at phase completion / deploy probe.

## Data Truthfulness
- Coverage figures are computed from the loaded snapshot at render time (node-derived), never hardcoded. The DC-project denominator (550/1,153) remains a `VERIFY:` note in `dimensionCoverage.ts`/Toolbar comment and is NOT displayed.

## Deviations from Plan

**1. Two test files updated beyond `files_modified`:** `dimensionIdSpace.test.ts` (asserted the old 3-id PRESET verbatim — updated to the widened aperture + new single-source/catalog-resolution invariants) and `GroupByControls.test.tsx` (asserted "Company absent" — inverted to the intended DIM-01 behavior, plus a new coverage-label test). Both are the plan's intended content updates landing in files the plan text didn't enumerate; no behavioral assertion weakened.

**2. `dimensionCoverage.ts` and `graphTestBridge.ts` edited (not in `files_modified`):** coverage formatting/threshold helpers belong beside `dimensionCoverage` (both pickers consume them), and the bridge's `colorMode` field had to follow the catalog-id space (plan Task 3 names this field explicitly; the type lives in the bridge file). Smallest-diff placements.

**3. "Update the color-pref persistence" was moot:** no color-mode persistence exists (`migrateColorMode` is referenced only by its own test; color state is session-local React state). Nothing to migrate — persisted slider prefs are keyed by catalog ids already.

**Total:** 3 documented deviations, all within plan intent; no scope drift.

## Issues Encountered
None. All gates passed first run.

## Next Plan Readiness (25-03 — add-a-chip filter, DIM-04)
- Filter must swap its chip source from `SliderContext.DIMENSIONS` (12 registry dims) to the unified aperture; `apertureOptionGroups` + `dimensionCoverage` are reusable as-is for the dimension-picker menu.
- `DimensionFilterPopover` + `FilterContext`/`usePredicateEngine` are the surfaces to rewire; banded value lists for continuous dims come from `valueKeyLabel`/`dimensionBands` (same tiers the pickers now show).
- No blockers.

---
*Phase: 25-dimension-aperture-group-color-filter*
*Completed: 2026-07-15*
