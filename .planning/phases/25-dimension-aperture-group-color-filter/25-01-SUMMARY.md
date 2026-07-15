---
phase: 25-dimension-aperture-group-color-filter
plan: 01
subsystem: spatial-graph-dimensions
tags: [dimension-aperture, banding, coverage, catalog, DIM-01, DIM-05]

# Dependency graph
requires: ["24-02"]
provides:
  - "dimensionBands.ts — pure fixed-cut-point labeled-tier banding for every continuous aperture dim (risk score, permission strength, activity volume, folder breadth, accessible data)"
  - "dimensionCoverage.ts — honest node-derived {covered,total,note?} per aperture dim + APERTURE_SOURCE_NOTES provenance map"
  - "dimensionCatalog.structural.ts — 10 owner-palette aperture dims appended as color-only CatalogDimensions (internalExternal, adminMember, permissionTier, activityRecency, signinRecency, membershipTenure, dominantActivity, riskScore, folderBreadth, accessibleDataTB)"
  - "dominantClusters.valueKeyLabel — ordinal branch bands aperture continuous dims into labeled tiers instead of collapsing to one None bucket"
affects: ["25-02", "25-03", "26-catalog-slider-wall"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Banding uses FIXED documented cut-points, not dataset quantiles, so band functions stay per-node pure and displayed tiers are inspectable; bandActivityVolume delegates to featureSnapshot.bucketActivity so grouping tiers can never drift from the tooltip's bucket."
    - "Aperture dims are surfaces:['color'] only — groupByDimensions filters on PRESET membership + available (not surface), so 25-02 can widen pickers without adding physics sliders or touching the Phase-26 slider wall."
    - "Coverage is node-derived from the loaded snapshot (covered/total), never a hardcoded figure; per-dim present-value overrides where the generic rule would lie (uncrawled ≠ no access)."

key-files:
  created:
    - app/(dashboard)/users/access-analysis/dimensionBands.ts
    - app/(dashboard)/users/access-analysis/dimensionBands.test.ts
    - app/(dashboard)/users/access-analysis/dimensionCoverage.ts
    - app/(dashboard)/users/access-analysis/dimensionCoverage.test.ts
  modified:
    - app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts
    - app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts
    - app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts
    - app/(dashboard)/users/access-analysis/dominantClusters.ts
    - app/(dashboard)/users/access-analysis/dominantClusters.test.ts

key-decisions:
  - "bandActivityVolume reuses featureSnapshot.bucketActivity (0 / 1–10 / 11–100 / 101+) instead of inventing new thresholds — single source for activity tiers."
  - "Activity-derived dims count only observed activity as covered (activityTotal > 0, recency bucket ≠ 'none') because DC coverage makes 'no activity' indistinguishable from 'not crawled' at node level; the DC-sourced note carries the caveat."
  - "Folder-derived dims (permissionTier, folderBreadth, folderAccessPermissions) require permissionCoverage/coverage ≠ 'unknown' to count as covered — a null tier under an uncrawled project is 'unknown', not 'no access'."
  - "APERTURE_SOURCE_NOTES distinguishes 'DC-sourced' from 'folder-crawl' provenance; dims absent from the map are computed from all loaded nodes."

patterns-established:
  - "APERTURE_BAND_BY_ID in dominantClusters.ts maps continuous catalog ids → band functions inside valueKeyLabel's ordinal branch; key = band label."

requirements-completed: []  # DIM-01/DIM-05 substrate only — completed when 25-02/25-03 wire the pickers

# Metrics
duration: ~20min
completed: 2026-07-15
status: complete
---

# Phase 25 Plan 01: Aperture Substrate (Banding, Coverage, Catalog) Summary

**Built the pure data/logic substrate for the widened dimension aperture: 10 owner-palette dims added to the structural catalog as color-only node-level CatalogDimensions, every continuous dim now bands into fixed labeled tiers via new `dimensionBands.ts`, and honest node-derived coverage is computable per dim via new `dimensionCoverage.ts`. No picker widened yet (25-02); no UI change.**

## Accomplishments
- `dimensionBands.ts` (NEW): `bandRiskScore` (0–1 Low · 2–3 Med · 4 High · 5 Crit), `bandPermissionStrength` (0 None · 1–2 Low · 3–4 Med · 5 High), `bandActivityVolume` (delegates to `bucketActivity`), `bandFolderBreadth` (None · <10 · <100 · <1k · 1k+), `bandAccessibleData` (None · <1 GB · <100 GB · <1 TB · 1 TB+). All total (null/undefined → labeled tier), deterministic, pure; cut-points documented in the header comment.
- `dimensionCatalog.structural.ts`: appended the 10 aperture dims, each reading an existing `NodeFeatureSnapshot` field (no new data): internalExternal (binary, `affiliation`), adminMember (binary, `isAdmin`), permissionTier (categorical, `permTier`), activityRecency (categorical, `activityRecencyBucket`), signinRecency (categorical, `signinBucket`), membershipTenure (categorical, `membershipBucket`), dominantActivity (categorical, `dominantActivityCategory(activityMix)` — reused from dimensionRegistry), riskScore / folderBreadth / accessibleDataTB (ordinal with `colorScale:"categorical"` — banded, never a ramp, per owner decision). All `available:true`, all `surfaces:["color"]` only.
- `dominantClusters.ts`: `valueKeyLabel`'s ordinal branch now consults `APERTURE_BAND_BY_ID` (riskScore, folderBreadth, accessibleDataTB, activityVolume, folderAccessPermissions) before the permission/tenure special cases and the activity-count quantile fallthrough — grouping by any continuous aperture dim yields >1 labeled cluster instead of one "None" bucket (the verified pre-existing collapse).
- `dimensionCoverage.ts` (NEW): `dimensionCoverage(features, dimId)` → `{covered, total, note?}` derived from the loaded snapshot; generic present-value predicate (null/""/"(none)"/"(unknown)"/"none"/"unknown"/empty-array → absent) plus per-dim overrides (permissionTier/folderBreadth/folderAccessPermissions require crawl coverage ≠ unknown; accessibleDataTB and activityVolume require > 0; adminMember requires the flag stamped). `APERTURE_SOURCE_NOTES` marks DC-sourced vs folder-crawl provenance. Empty snapshot → `{0,0}`; unknown dim id → 0 covered, no throw.

## Task Commit

Single coherent commit: **`662dc0da`** `feat(spatial-graph): banded, coverage-aware dimension aperture substrate (25-01)` — 9 files, +571/−101.

## Verification Evidence
- `npx vitest run dimensionBands` → 10/10 passed (every boundary value + null/undefined per function).
- `npx vitest run dimensionCatalog dominantClusters catalogSliders curatedSliders` → 9 files, 70/70 passed.
- `npx vitest run dimensionCoverage` → 7/7 passed (present-value, partial, uncrawled-tier, observed-activity, empty-array guard, unknown-id guard, notes map).
- `npx tsc --noEmit` → exit 0.
- `npm test` (full suite) → **331 files passed | 1 skipped; 2553 passed | 1 skipped; 0 failures.** Phase-24 invariance gates (`groupByDimensions.test.ts`, `nodeColors.test.ts`) green and byte-unmodified — PRESET not widened by this plan, as required.
- `node scripts/repo-map/check.cjs` → "Repo-map quality gate passed" (2 dep-cruiser warnings + 236 ast-grep findings, all baseline).
- Structural count assertions updated (9 → 19 structural dims in `dimensionCatalog.test.ts`/`dimensionCatalog.structural.test.ts`) — legitimate catalog growth; no behavioral assertion weakened; new assertions ADD extract + surface checks for all 10 aperture dims.
- Scope check: no file under `app/(dashboard)/access-analysis/**` (charts page) touched; no layout/physics engine file touched; no new WebGL; no new dependency, loader, or Prisma change.

## Data Truthfulness
- No data changes; all 10 dims read already-computed `NodeFeatureSnapshot` fields at node grain (user×project).
- Coverage is the node-derived fraction over the loaded snapshot — the "~48%" discussion figure was NOT shipped anywhere.
- `VERIFY:` (recorded in `dimensionCoverage.ts` header, still open): whether the ~550/1,153 project figure (AccDcProject vs AccProject) is the correct coverage *denominator* for DC-sourced dims; node-derived coverage is the shipped number either way.

## Deviations from Plan

**1. Pre-existing working-tree WIP swept into the commit for 4 already-modified files.**
`dimensionCatalog.structural.ts`, `dimensionCatalog.structural.test.ts`, `dimensionCatalog.test.ts` (and trivially `dominantClusters.test.ts`) carried uncommitted WIP from the branch's ongoing catalog rewrite (e.g. `user` label "User name"→"Users", the 10+5-slider → 9-structural catalog shape). Committing my edits to those files necessarily committed that in-file WIP too (index was verified empty before staging; only the plan's 9 files were staged). The swept WIP is the same surface/feature this plan builds on and all gates ran green against the working tree. Remaining WIP in files this plan did not touch (`dimensionCatalog.types.ts`, `featureSnapshot.ts`, `catalogTargets.ts`, etc.) is preserved untouched.

**2. Coverage predicate detail (Claude's-discretion area):** activity dims count only observed activity (`> 0`) rather than "field stamped" — chosen for honesty since DC crawl gaps make computed-zero indistinguishable from uncrawled. Noted under key-decisions.

**Total:** 1 environmental deviation (WIP-heavy tree, documented), 1 discretionary choice within the plan's granted discretion. No scope drift.

## Issues Encountered
None otherwise. The full-suite pass count (2553) vs the Phase-24 note (2538) reflects this plan's ~20 new tests plus branch WIP drift in the dirty tree; the meaningful gate is 0 failures and unmodified invariance tests, both confirmed.

## Next Plan Readiness (25-02)
- `groupByDimensions.ts` already filters on PRESET membership + `available` — widening = extending `PRESET_DIMENSION_IDS` in `dimensionIdSpace.ts` and wiring coverage labels from `dimensionCoverage.ts`.
- Banded labels for pickers/legends come free via `buildDominantClusters`/`valueKeyLabel` (color and grouping share the same tiers).
- No blockers.

---
*Phase: 25-dimension-aperture-group-color-filter*
*Completed: 2026-07-15*
