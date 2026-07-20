# Plan 34-02 Summary — TEST-04 usePredicateEngine aperture failures resolved

**Status:** COMPLETE — 2026-07-20
**Requirement:** TEST-04
**Commit:** `49e1202c` `fix(access-analysis): build aperture resolvers over the full filter aperture (TEST-04)`
(one file: `app/(dashboard)/users/access-analysis/usePredicateEngine.ts`)

## Verdict (Decision 3): LIVE PRODUCT BUG — code fixed, tests untouched

**Repro (2026-07-20, pre-fix):** `npx vitest run` on
`__tests__/usePredicateEngine.test.tsx` → `Tests 3 failed | 12 passed (15)`.
`featureValueForDim(f, "riskScore", resolvers)` returned `""` (expected `"High"`);
both mask-predicate aperture tests got `0.15` for nodes that should match.
(CONTEXT said the resolver test passed; live tree had it failing too — CONTEXT
staleness only, same root cause, scope unchanged.)

**Root cause:** commit `1e5073ff` ("feat(27): simplify layout controls", v2.4
Phase 27) rewrote `groupByDimensions()` to a curated 10-id
`PRIMARY_GROUP_OPTIONS` list for the Group-into menu.
`buildApertureValueResolvers` still iterated `groupByDimensions(catalog)`, but
the "+ Filter" aperture (`Toolbar.tsx` → `apertureOptionGroups` →
`PRESET_DIMENSION_IDS`, 17 dims) kept offering the full Phase-25 aperture. Any
filter on a non-curated banded dim (`riskScore`, `membershipTenure`,
`signinRecency`, `dominantActivity`, `adminMember`, `folderAccessPermissions`,
`accessibleDataTB`) had no resolver → `featureValueForDim` fell to the legacy
switch → `""` → zero nodes matched → the whole graph dimmed. Confirmed
reachable in the live UI: `riskScore` sits in `APERTURE_THEME_GROUPS`
("Risk & tenure") and `FilterContext.tsx` accepts all `PRESET_DIMENSION_IDS`
as `activeFilters` keys. Tests encoded the intended behavior correctly.

**Fix (narrowest shared boundary):** `buildApertureValueResolvers` now filters
the catalog by `available && PRESET_DIMENSION_IDS` membership instead of
calling `groupByDimensions()`. 5-line diff + comment; both call sites
(`Toolbar.tsx:92`, `AccessAnalysisShell.tsx:406`) and the hook path fixed at
once. No test edits; no consolidation of the three duplicate predicate test
files (CONTEXT deferred item honored).

## Gate outcomes (exact)

- Three predicate files (`usePredicateEngine.test.ts`,
  `__tests__/usePredicateEngine.test.ts`, `__tests__/usePredicateEngine.test.tsx`):
  `Test Files 3 passed (3)`, `Tests 21 passed (21)`.
- Full `npm test`: `Test Files 339 passed | 1 skipped (340)`,
  `Tests 2629 passed | 1 skipped (2630)` — **fully green, zero carried
  failures** (includes 34-01's 10 new guard tests).
- `npx tsc --noEmit`: exit 0.

## Deviations / debt

- None. The 1-skipped test is a pre-existing suite-level skip, not a failure.
- Note for Phase 35/36 UAT: aperture filters on the 7 previously-broken dims now
  actually filter — visible behavior change in the live graph (was: everything
  dims). This is the bug fix working, not a regression.
