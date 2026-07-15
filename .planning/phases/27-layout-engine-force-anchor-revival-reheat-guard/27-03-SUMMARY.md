---
phase: 27-layout-engine-force-anchor-revival-reheat-guard
plan: 03
status: complete
completed: "2026-07-15T13:46:25.5165724-06:00"
commit: 1e5073ff
follow_up_commits: [43855798, 5ce79271]
requirements: [LAY-01, LAY-02, LAY-03, LAY-04]
---

# 27-03 Summary — General Layout and Actionable Dimensions

## Shipped

- Made `General · Similarity` the synthetic default and guaranteed an exact zero-strength
  projector on every flag-off page load, independent of stale persisted layout strengths.
- Replaced the noisy control aperture with 11 curated Layout choices: General, Role,
  Company, Users, Project name, Last activity, Activity volume, Folder permission type,
  Folder access, Activity type, and Modules.
- Added clear Position / Group / Color state, membership-versus-person labels, neutral
  coverage, and deterministic 60-strength transfers between the primary controls.
- Turned the lazy 208-row Dimensions catalog into real sliders. Generated action targets are
  built and registered only when Dimensions opens, while unavailable dimensions remain
  visibly disclosed.
- Made action coverage truthful from the generated catalog extractor; the live `Issue Create`
  gate reported 234 / 22,279 memberships rather than a structural-catalog fallback.

## Files

- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- `app/(dashboard)/users/access-analysis/GroupByControls.tsx`
- `app/(dashboard)/users/access-analysis/RightPanelStack.tsx`
- `app/(dashboard)/users/access-analysis/Toolbar.tsx`
- `app/(dashboard)/users/access-analysis/SliderContext.tsx`
- `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx`
- `app/(dashboard)/users/access-analysis/CatalogTreeSection.tsx`
- `app/(dashboard)/users/access-analysis/groupByDimensions.ts`
- `app/(dashboard)/users/access-analysis/dimensionCoverage.ts`
- focused unit and production Playwright coverage beside those surfaces

## Verification

- Final focused Vitest — 13 files, 110 tests passed.
- `npx tsc --noEmit` — exit 0.
- `node scripts/repo-map/check.cjs` — passed; baseline warnings only.
- Production Playwright catalog gate — 1 test passed against `http://localhost:3000`.
- Authenticated browser gate proved General at exact zero, all 11 primary choices in order,
  Role transfer to 60, 22,279 membership / 3,791 person labeling, 208 lazy rows, truthful
  action coverage, and a changed visible canvas after the 600 ms morph.
- Production build and local scheduled-task restart passed at BUILD_ID
  `kZKWbfeAqYW1R4bYrUx2U`; browser console warnings/errors were empty.

## Deviations / Preserved WIP

- Browser verification exposed two narrow gaps after the initial feature commit: generated
  action coverage used only the structural catalog, and stale persisted strengths could make
  the default look like General while projecting Role. Commits `43855798` and `5ce79271`
  closed both before the phase gate.
- No scrape, new loader, new table, dependency, embedding recomputation, grid layout, or
  worker-simulation path was added. Existing unrelated worktree changes remain untouched.

## Durable Follow-up

- Phase 28 should measure the one-time lazy target-build cost when Dimensions first opens;
  functional production gates passed, but Phase 27 does not claim an isolated hitch budget.
- The Impeccable detector reports one pre-existing indigo heading in
  `ComplianceScanPanel.tsx`, outside the Phase 27 surface.
