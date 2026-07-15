---
phase: 25-dimension-aperture-group-color-filter
plan: 03
subsystem: spatial-graph-dimensions
tags: [dimension-aperture, filter, add-a-chip, banded-values, DIM-04, DIM-05]

# Dependency graph
requires: ["25-02"]
provides:
  - "usePredicateEngine.buildApertureValueResolvers(catalog, features) — one banded-label resolver per aperture dim (valueKeyLabel + per-dim thresholds), threaded through PredicateInputs.valueResolvers"
  - "featureValueForDim(f, dim, resolvers?) — aperture dims resolve to banded tiers; legacy 6-id switch preserved as fallback"
  - "FilterContext — dynamic aperture-keyed activeFilters (no SliderContext.DIMENSIONS seed); addFilterDim/removeFilterDim; rehydration gated on aperture + facet keys"
  - "Toolbar — '+ Filter' themed aperture menu (inline coverage, DIM-05) + per-added-dim value chips (multi-select values-to-keep, AND across dims)"
  - "DimensionFilterPopover — aperture {id,label} props + onRemove ×; no SliderContext type dependency"
affects: ["26-catalog-slider-wall"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver-map seam: the predicate body is untouched; featureValueForDim gains a first-chance dimId→label dictionary with the legacy switch as fallback, so all pre-aperture predicate tests pass verbatim."
    - "Filter keys are DYNAMIC: a key present in activeFilters == an added chip (even with an empty value set); facet families (RISK/PERM) stay seeded for persistence."
    - "drillDown deliberately stays on the legacy switch — SelectionPanel pie slices are built from raw snapshot values, not banded labels."

key-files:
  created: []
  modified:
    - app/(dashboard)/users/access-analysis/usePredicateEngine.ts
    - app/(dashboard)/users/access-analysis/FilterContext.tsx
    - app/(dashboard)/users/access-analysis/Toolbar.tsx
    - app/(dashboard)/users/access-analysis/DimensionFilterPopover.tsx
    - app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx
    - app/(dashboard)/users/access-analysis/GraphInteractions.tsx
    - app/(dashboard)/users/access-analysis/interactionTypes.ts
    - app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx
    - app/(dashboard)/users/access-analysis/__tests__/FilterContext.test.tsx
    - app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx

key-decisions:
  - "Resolvers built once per (catalog, features) in ShellBody and shared by the mask predicate, the visible-subset rule (filterSelectionByPredicate), and the Toolbar value chips — one label source for filter/blob/swatch."
  - "Filter values use valueKeyLabel .label (plan-mandated) so a filter tier matches its blob label; multiHot '3 items' collapse is the same collapse Group-by shows."
  - "clearAll/removeFilterDim delete dynamic keys entirely (chip disappears); an added-but-unvalued chip counts as non-default so 'Clear all' can remove it."
  - "'+ Filter' affordance is a native <select> with themed optgroups (Claude's-discretion area) — same idiom as the two pickers, coverage text free via apertureOptionGroups."
  - "Persisted-filter rehydration ignores keys outside aperture ∪ facets (T-25-03-T); retired SliderContext ids (tier/activity/signin/module) drop silently."

patterns-established:
  - "PredicateInputs.valueResolvers?: Record<dimId,(f)=>string> — optional, absent = fully legacy behavior."

requirements-completed: [DIM-04, DIM-05]

# Metrics
duration: ~25min
completed: 2026-07-15
status: complete
---

# Phase 25 Plan 03: Add-a-chip Aperture Filter Summary

**The `/users/spatial-graph` toolbar filter is now add-a-chip over the unified 17-dim aperture: a themed "+ Filter" menu (honest coverage inline per option) adds dimension chips, each chip's popover multi-selects which banded VALUES to keep, and non-matching nodes filter out — composing AND across dimensions. DIM-04's third divergent list (`SliderContext.DIMENSIONS`, 12 registry dims) is retired from the filter path; all three controls now resolve from the single aperture, and filter values are the SAME `valueKeyLabel` tiers Group-by clusters into and Color-by swatches.**

## Accomplishments
- `usePredicateEngine.ts`: `buildApertureValueResolvers(catalog, features)` builds one banded-label resolver per `groupByDimensions(catalog)` dim (mirrors `buildDominantClusters`' thresholds rule); `featureValueForDim` gains an optional resolvers param — first-chance dictionary, legacy 6-id switch untouched as fallback. `buildMaskPredicate`/`filterSelectionByPredicate` bodies unmodified except passing the resolvers into the existing filter loops; `PredicateInputs.valueResolvers` added (optional) in `interactionTypes.ts`.
- `FilterContext.tsx`: `makeEmptyFilters` no longer imports/iterates `SliderContext.DIMENSIONS` — it seeds only the two P7 facet families; `activeFilters` keys are dynamic (key present = chip added). New `addFilterDim`/`removeFilterDim`. Same localStorage key and set↔array shape; rehydration validates keys against aperture ∪ facets. `isDefault` treats an added-but-unvalued chip as non-default.
- `Toolbar.tsx`: chip wall (every `DIMENSIONS` entry) replaced by add-a-chip — "+ Filter" native select over `apertureOptionGroups(catalog, features)` (themed, coverage inline, ⚠ when under-covered) minus already-added dims; chips render only for added dims, ordered by aperture display order; per-chip value lists = distinct banded labels across `features` (most common first). `BUCKET_VALUES` deleted. Search, lasso, Risk & Access, color select, and Clear-all intact.
- `DimensionFilterPopover.tsx`: accepts aperture `{id,label}` + banded value list + `onRemove` (× clears the dimension); radix Popover, chip toggles, zinc-dense styling, and active-count badge preserved; `SliderContext` type dependency removed.
- Shell/interactions threading: `AccessAnalysisShell.ShellBody` memoizes the resolvers and feeds the predicate engine (via new `GraphInteractions.valueResolvers` prop), the visible-subset rule, and the Toolbar — one label source everywhere.

## Task Commit

Single coherent commit: **`7ae2f29a`** `feat(spatial-graph): add-a-chip aperture filter with banded values (25-03)` — 10 files, +426/−83.

## Verification Evidence
- `npx tsc --noEmit` → exit 0 (run after Task 1 and again after Task 3).
- `npx vitest run usePredicateEngine selectionFilters` → 4 files, **24/24 passed** (Task 1 gate; legacy predicate tests verbatim-green, 4 new aperture cases: banded resolution, riskScore "High" filter, AND across company+riskScore, visible-subset with resolvers).
- `npx vitest run FilterContext` → **8/8 passed** (Task 2 gate; 2 new: add/remove chip lifecycle, rehydration key gate incl. tampered/retired keys).
- `npx vitest run Toolbar DimensionFilterPopover FilterContext usePredicateEngine` → 6 files, **43/43 passed** (Task 3 gate).
- `npm test` (full suite) → **331 files passed | 1 skipped; 2565 passed | 1 skipped; 0 failures** (2557 baseline + 8 new). Phase-24 invariance gates (`groupByDimensions.test.ts`, `nodeColors.test.ts`) green and byte-unmodified.
- `node scripts/repo-map/check.cjs` → "Repo-map quality gate passed" (2 dep-cruiser warnings + 236 ast-grep findings, unchanged baseline).
- Scope check: no file under `app/(dashboard)/access-analysis/**` (charts page) touched; no layout/physics/reheat file touched; no WebGL, dependency, loader, or Prisma change.
- **Human-check pending** (plan's visual UAT): "+ Filter" menu, themed coverage options, Company multi-select keeps only checked nodes, second dimension composes, chips show counts, zinc theme. To be exercised at phase completion / deploy probe.

## Data Truthfulness
- No data changes. Filter reads the already-loaded snapshot and only toggles the alpha mask. Coverage figures in the menu are node-derived at render time (25-01 `dimensionCoverage`), never hardcoded.

## Deviations from Plan

**1. Three files edited beyond `files_modified`:** `interactionTypes.ts` (PredicateInputs owns the new optional `valueResolvers` field — the plan's own "thread the resolver through PredicateInputs" instruction lands in the file that defines the type), `AccessAnalysisShell.tsx` and `GraphInteractions.tsx` (the two predicate call sites the plan names must receive the resolvers; smallest-diff pass-throughs, +15/+5 lines). All within plan intent.

**2. Pre-existing WIP swept in `interactionTypes.ts`:** the file carried an uncommitted `projectStatus?: string` snapshot field from the branch's ongoing WIP; committing my `valueResolvers` addition necessarily included it (index verified empty before staging; only the plan's 10 files staged). Same-surface, type-only, harmless — all gates ran green against the working tree.

**3. `clearAll` contract update:** one pre-existing FilterContext test asserted `activeFilters.role?.size === 0` after clearAll (seeded-keys assumption); with dynamic keys the key is deleted entirely. Assertion updated to the new contract (`"role" in activeFilters === false`) — behavioral intent (everything cleared) unchanged.

**4. drillDown loop kept legacy (discretion):** SelectionPanel's pies drill with raw snapshot values ("role"/"project"), so the drill comparison deliberately does NOT use the resolvers; commented at the site.

**Total:** 4 documented deviations, all within plan intent; no scope drift.

## Issues Encountered
None. All gates passed first or second run (the one failure was the intended clearAll contract change, deviation 3).

## Phase Completion Readiness
- All three Phase 25 plans (25-01/25-02/25-03) are summarized. DIM-01/02/04/05 shipped.
- Remaining before advancing: roadmap audit, `25-VERIFICATION.md`, debt roll-forward, autoDeploy ship + route probe, human visual check of both pickers + the new filter.

---
*Phase: 25-dimension-aperture-group-color-filter*
*Completed: 2026-07-15*
