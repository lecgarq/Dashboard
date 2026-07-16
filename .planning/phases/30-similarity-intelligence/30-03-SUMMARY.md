# 30-03 SUMMARY — Panel redesign: twin affordance + why chips

**Status:** COMPLETE · commit `9666da74` · 2026-07-16

## What shipped

- **`whySimilar.ts`** (new, pure): `resolveWhyKey(key, center, match)` per the
  30-03 mapping table — token keys render from the embedded value
  (`company:ACME` → "Same company: ACME"), numeric-column keys render LIVE
  values from both snapshots ("Similar activity volume: 120/100"). Module keys
  resolve display names via the existing `lib/acc/modules.ts` `moduleLabel`.
  `cov:*`/`*_missing`/`admin:0`/unknown keys → null. Permission-derived keys
  (`perm`, `permstr`, `permissionStrength`, `folderBreadth`,
  `accessibleDataBytes`) suppressed when EITHER endpoint has
  `permissionCoverage === "unknown"`. Exports `WHY_COVERAGE_DIM_IDS` for the
  shell's coverage map. Local 6-line byte formatter (deliberate: the existing
  `formatBytes` lives in the OTHER access-analysis surface — standing
  collision trap, no cross-surface import).
- **`NeighborMatchesPanel.tsx`** redesigned, still pure/presentational:
  new props `center`, `twins`, `coverageByDim`; twin chip
  ("N identical twins", exact count, useState toggle — no animation, Phase 31
  owns choreography) expanding to capped member rows (snapshot join, click
  re-isolates) + honest "+N more" overflow; per-match why chips (zinc
  `bg-muted` pills, coverage suffix in muted). Renders null only when both
  matches and twins are empty. `max-h-[70vh] overflow-y-auto`, width w-72.
  No center snapshot → no chips (never fabricates center values).
- **`AccessAnalysisShell.tsx`**: memoized `coverageByDim`
  (`WHY_COVERAGE_DIM_IDS` × `dimensionCoverage(features, id, catalog)` →
  `coverageText`), passes `center`/`twins`/`coverageByDim`; `neighborIndices`
  already matches-only from 30-02 (twins never light).
- **Tests**: `whySimilar.test.ts` (5 tests: every prefix, live numeric values,
  null keys, suppression both directions, coverage-id export);
  `NeighborMatchesPanel.test.tsx` (5 jsdom tests: twin chip count/expand/
  overflow/re-isolate, chip labels + coverage suffix, suppression, old-shape
  plain list, match click + fully-empty null render).

## Gates

- `npx vitest run whySimilar.test.ts NeighborMatchesPanel.test.tsx` → **10 passed**.
- `embeddingMapSeam.test.tsx` (shell seam) → **5 passed** (no regression).
- `npx tsc --noEmit` → clean (exit 0).
- **Design gate**: impeccable source-mode detect hook scanned every edit to
  `NeighborMatchesPanel.tsx` / `AccessAnalysisShell.tsx` — no deterministic
  design-quality issues. Chrome intentionally modest per CONTEXT (Phase 31
  owns the reveal).

## Deviations

- None functional. `formatBytes` reuse skipped deliberately (collision trap,
  noted above).
