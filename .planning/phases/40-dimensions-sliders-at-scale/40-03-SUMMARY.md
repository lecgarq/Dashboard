# 40-03 Summary — Sidebar repopulated, shell wiring, labels, retirement

**Status:** COMPLETE · 2026-07-21

## Changed files

- `app/(dashboard)/users/access-analysis/activity/ActivityDimensionsPanel.tsx`
  (new) — the repopulated right-rail sidebar: group-by select ("None ·
  Embedding" + 7 dims, author absent per owner decision 4), color-by select
  (8 dims, module default), kept `DimensionSlider` ("Grouping strength", shown
  when group-by active), active-state summary box, per-dim honest coverage
  lines, corpus line ("4,904,886 events · rendering ~490,489"), dict-failure
  degradation (disabled options + explanatory note, never a blank sidebar).
  Pure data boundary — options/coverage/counts injected by the shell.
- `app/(dashboard)/users/access-analysis/activity/ActivityUniverseShell.tsx` —
  DIM-07/PERF-07 wiring: groupBy/colorBy/strength state; memoized per-dim
  color buffers (full corpus, honest legend), sample-set group layout
  (`buildGroupLayout`), coverage text; rAF-coalesced strength commits →
  `mix(rest, clump, s)` into a reused buffer → `motion.morphTo` (drag 120ms /
  settle 250ms / group-switch 600ms — one CPU upload per commit, GPU
  interpolates); color-by swap recolors the CURRENT rendered set via
  `handle.setColors` + legend swap; `MapClusterLabels` mounted through a
  `{mode:"2d", handle}` adapter ref (stats from groupStats, live-strength
  progress getter, chips fade with strength); region-LOD seam SUSPENDED while
  strength > 0 (applyLod guard + morph-first sample restore) and re-runs once
  at strength 0; ambient started via `createActivityMotion` on the sample set
  only (stopped before every LOD set flip, rebased+restarted on sample
  restore); `prefers-reduced-motion` via one matchMedia read → static ambient
  + snap morphs (handled inside activityMotion); hover cleared on morph start.
- `app/(dashboard)/users/access-analysis/activity/activityTestBridge.ts` —
  new fields: `groupBy`, `colorBy`, `strength`, `morphCount`, `ambientActive`.
- `app/(dashboard)/users/access-analysis/activity/ActivityDimensionsPanel.test.tsx`
  (new) — 5 pins: 7-vs-8 option split (author absent from group-by, present in
  color-by), corpus + coverage line text, slider hidden at none / fires
  onStrengthChange, disabled-option degradation, and the transform-level pin
  that a group-by switch changes morph targets.

## Retired (deleted, all clean + zero importers verified by rg sweep)

- `DimensionSearchBox.tsx`, `PresetBar.tsx`, `__tests__/PresetBar.test.tsx`
  (owner decision 3 — dead weight at 8 dims).
- `CatalogSliderSidebar.tsx` + `CatalogSliderSidebar.test.tsx` — zero mounts;
  its only importer was the also-unmounted `RightPanelStack`.
- `RightPanelStack.tsx` + `RightPanelStack.groupBy.test.tsx` — the instance
  rail's z-stack manager; zero importers since the Phase-39 shell swap.

Remaining references are comments + the pre-existing-red e2e spec
(`tests/e2e/acc-dc-graph.spec.ts`, Phase-41 re-baseline scope).

## Deviations

- **GroupByControls NOT reused** (plan's anticipated branch): its contract is
  instance-shaped (`SliderContext` physics/catalog, `NodeFeatureSnapshot`
  coverage). The panel composes the same visual pattern directly and reuses
  `DimensionSlider` as-is; GroupByControls stays untouched on disk.
- **SliderContext NOT reused** for strength (same instance-shaped reason);
  the shell holds strength state with the plan's ~20-line rAF-coalesced
  commit path (`rafPendingRef` + `commitMorph`).
- **Chip colors**: label chips take legend colors only when group-by ===
  color-by; otherwise neutral grey dots (dots aren't colored by the grouped
  dim — colored chips would mislead). Honest, recorded here.
- **Strength drag in region mode**: commitMorph restores the deterministic
  sample first (morph targets are defined over the sample), so a zoomed-in
  strength drag cannot teleport region points.

## WIP-carrying files flagged, NOT deleted (milestone-close debt)

`catalogTargets.ts`, `dimensionCatalog.types.ts`, `catalogTargets.test.ts`
carry uncommitted WIP — untouched per plan. Newly orphaned instance-era
candidates for the milestone-close sweep: `GroupByControls.tsx` (+test),
`SliderContext.tsx`, `sidebarWidth.ts` (+test), `SelectionPanel`,
`SelectionContext`, `groupByDimensions.ts`, `dimensionCoverage.ts` — verify
importers at close; some are still type-imported by kept files.

## Design gate (impeccable detect tier, self-check vs DESIGN.md)

Dense zinc chrome (bg-card/border-l/muted-foreground), no gradients; captions
muted + honest; interaction motion ≤200ms (150ms transitions); morph is a
deliberate data transition (120–600ms) with reduced-motion snap; disabled and
empty states explanatory. Kept DimensionSlider visuals unchanged.

## Gates

- Focused vitest: ActivityDimensionsPanel 5/5.
- Activity dir sweep: 8 files / 37 pass.
- `npx tsc --noEmit`: clean (whole tree).
- `node scripts/repo-map/check.cjs`: passed (1 pre-existing dep-cruiser warn,
  ast-grep findings baseline-checked).
- Full `npm test`: 337 files passed / 1 skipped · 2556 tests passed / 1
  skipped (TEST-01/02/03 included, green).

## Follow-ups / debt

- Orphan sweep above → CONCERNS (milestone-close).
- Ambient pushes the full rendered-set buffer per frame (40-02 debt, Phase 41
  headed D3D11 gate is the binding proof).
- Month color-by sequential ramp = Phase-41 taste call (40-01 note).
