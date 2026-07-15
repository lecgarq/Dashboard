---
phase: 26-catalog-slider-wall
plan: 02
subsystem: spatial-graph-catalog
tags: [catalog, lazy-loading, search, availability, CAT-02, CAT-03, CAT-04]
requires: ["26-01"]
provides:
  - "React.lazy Catalog preview boundary triggered by the rail tab"
  - "208-entry browse-only catalog with label/module/group search"
  - "Inline reasons for fixed and snapshot-derived unavailable dimensions"
  - "Production-browser coverage proof for generated actions and SliderProvider state"
affects: ["27-layout-engine-force-anchor-revival-reheat-guard"]
requirements-completed: [CAT-02, CAT-03, CAT-04]
completed: 2026-07-15
status: complete
---

# Phase 26 Plan 02: Lazy Browse-Only Catalog Summary

Catalog preview now loads only when its tab opens. Initial Grouping render and
`SliderProvider` use the 19-dimension structural aperture (9 slider ids); the lazy component
then constructs the full 208-entry wall without adding action slider state. Available rows
say “Activates in Phase 27”; unavailable rows remain visible with an inline reason.

## Changed Files

- `AccessAnalysisShell.tsx`, `dimensionCatalog.structural.ts`: initial catalog is structural-only;
  entitlement lookup now uses `accTaxonomyStatic`, removing the generated-action import edge.
- `RightPanelStack.tsx`: React.lazy + Suspense boundary behind the Catalog tab.
- `CatalogSliderSidebar.tsx`, `CatalogTreeSection.tsx`: browse-only 208-entry hierarchy,
  existing search reuse, no-match state, and inline unavailable reasons.
- `catalogSliders.ts`, `dimensionCatalog.actions.ts`: preview vocabulary helper and the
  snapshot-derived “No matching activity in the loaded graph.” reason.
- Focused component/pure tests plus `tests/e2e/catalog-preview-lazy.spec.ts`.

## Commit

- `aaa20f4e` — `feat(spatial-graph): lazy-load catalog preview (26-02)`

## Verification

- Focused Vitest gate → 10 files, 49/49 tests passed.
- `npx tsc --noEmit` → exit 0, no diagnostics.
- `node scripts/repo-map/check.cjs` → passed; existing baseline remains 2 dependency warnings and 236 AST findings.
- Impeccable detector over the three changed UI components → `[]`.
- Isolated `.next-e2e` production build → compiled successfully; live `.next/BUILD_ID` unchanged.
- `catalog-preview-lazy.spec.ts` on isolated `:3100` → 1/1 passed. Chromium JS coverage
  proved the generated-action marker absent after initial Grouping render and present only
  after the Catalog click. Persisted slider ids were exactly 9 before the click and unchanged
  after it, proving action state was not initialized.
- Runtime catalog truth: **208 total, 110 available, 98 unavailable** on the loaded snapshot.
  The roadmap’s approximate 189/19 split was not treated as fixed truth.

## Deviations

- The first isolated-server attempt used an `npx.cmd` wrapper across separate shell calls;
  the wrapper exited before Playwright connected. Logs/process checks identified tool-call
  process lifetime as the cause. The successful runs started the Next node process and
  Playwright within one managed command, then stopped it in `finally`; no product code changed.
- The existing filename `CatalogSliderSidebar` remains for import stability even though its
  Phase-26 UI is browse-only. Renaming would add churn without changing behavior.

## Deferred

- Enabling catalog sliders and consuming their weights remains Phase 27.
- The runtime 98 unavailable dimensions are truthful for this snapshot, not a permanent count.

---
*Phase: 26-catalog-slider-wall*
*Completed: 2026-07-15*
