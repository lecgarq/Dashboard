# Phase 26: Catalog Slider Wall - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose the existing dimension catalog on `/users/spatial-graph` as a second,
lazy-loaded right-rail view without replacing Phase 25's Grouping controls or
depending on `NEXT_PUBLIC_ACC_3D_GRAPH`. The default rail view remains
**Grouping**; the user explicitly opens **Catalog preview** to load and browse
the catalog.

Phase 26 delivers production rendering, deferred loading, search, and truthful
unavailable reasons (CAT-01–04). It does **not** make catalog weights move the
default embedding map. Available catalog entries stay browse-only until Phase
27 activates the force-anchor layout; Phase 26 must not ship controls that look
interactive but silently do nothing.

The affected surface is `/users/spatial-graph` and its identical shell alias
`/users/access-analysis`. The 23-panel `/access-analysis` charts page is not in
scope. Group-by/Color-by/filter aperture behavior from Phase 25, graph layout,
cosmos.gl physics, loaders, and Prisma data are unchanged.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 26 and `.planning/REQUIREMENTS.md` CAT-01–04:
  production render first, then lazy-load, search, and visible unavailable
  reasons. CAT-01 must precede CAT-02/03/04.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`: the live
  shell currently passes `useGroupByControls={!ACC_3D_GRAPH_ENABLED}` to
  `RightPanelStack`; the flag therefore chooses either Grouping or the catalog.
- `app/(dashboard)/users/access-analysis/RightPanelStack.tsx`: the base rail is
  an exclusive `GroupByControls` / `CatalogSliderSidebar` branch. The existing
  resizable rail and overlay priority remain the owning shell.
- `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx` already has
  the search box, section tree, reset action, and disabled-row render paths, but
  it calls `curatedSliderDimensions`, which filters out unavailable dimensions
  before they can reach those disabled-row paths.
- `app/(dashboard)/users/access-analysis/catalogSearch.ts` and
  `catalogSearch.test.ts` already implement case-insensitive label search,
  module/group matches, branch pruning, and search expansion. Reuse them.
- `app/(dashboard)/users/access-analysis/SliderContext.tsx` derives slider ids
  and defaults from the whole catalog at provider mount. `AccessAnalysisShell`
  also builds catalog targets, weights, known ids, and default slider state
  before the rail is opened; this is the CAT-02 first-paint cost.
- Eager import chain:
  `dimensionCatalog.ts` → `dimensionCatalog.actions.ts` / `accTaxonomy.ts` →
  `accTaxonomyActions.generated.ts` (176 entries). Structural catalog code also
  imports `getModuleForEntitlement` from `accTaxonomy.ts`, so merely skipping
  `buildActionDimensions` does not prove the generated action module is lazy.
- The full catalog currently totals 218 entries: 19 structural entries (9
  slider-capable + 10 Phase-25 color-only), 176 generated actions, 4 live
  folder-reach entries, and 19 folder placeholders. The slider-wall vocabulary
  is 208 entries because the 10 Phase-25 color-only entries do not belong in
  the wall.
- VERIFY: profile the production graph before/after the lazy boundary and record
  evidence that the 176-action module and catalog slider state are untouched on
  initial Grouping view. Code inspection alone does not satisfy CAT-02.
- VERIFY: runtime available/unavailable counts against the real snapshot. The
  19 folder placeholders are always unavailable, but action availability is
  data-derived, so the roadmap's “~189 available / 19 unavailable” is not a
  fixed truth for every dataset.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Reuse the current resizable right rail and overlay stack; add no new drawer,
  floating panel, route, or WebGL surface.
- Use two compact rail views: **Grouping** (default) and **Catalog preview**.
  Opening Catalog is the load trigger; returning to Grouping does not reload a
  catalog already loaded in the same session.
- Reuse `DimensionSearchBox`, `filterSections`, and the existing
  Structural / Activity / Folder hierarchy. Search expands matching branches
  immediately and shows a useful no-match state.
- Available preview rows render at normal contrast with a concise “Activates in
  Phase 27” status and no writable slider/state action. Truly unavailable rows
  alone use the greyed treatment.
- Unavailable reasons are visible inline, not title-only. Keep the full source
  or note available as secondary text/title when useful.
- Preserve zinc theming, the ≤200ms motion budget, reduced-motion behavior,
  keyboard/search accessibility, and existing rail width persistence.

</defaults>

<decisions>
## Implementation Decisions

### Rail access and default view

- Keep Phase 25's **Grouping** controls as the default production rail view.
- Add a second **Catalog preview** view inside the same rail. Do not replace
  Grouping and do not add a separate drawer or route.
- The 3D feature flag gates only the parked 3D graph after CAT-01; it no longer
  decides whether the catalog view exists.

### Phase-26 interaction contract

- Catalog preview is intentionally **browse-only** in Phase 26.
- Available entries must not call `setSliderValue`, create persisted catalog
  weights, or imply graph response. Show them at full contrast with the explicit
  “Activates in Phase 27” status.
- Phase 27 owns enabling the controls and consuming `catalogTargets` /
  `catalogWeights`. No partial force-anchor or highest-slider bridge belongs in
  Phase 26.

### Lazy boundary (CAT-02)

- The Grouping first paint keeps only the small aperture catalog needed by the
  live Group-by/Color-by/filter controls.
- Opening Catalog preview dynamically loads the 176 generated actions and
  constructs the 208-entry wall. The generated action module must not enter the
  initial dependency path through `accTaxonomy.ts` or structural helpers.
- Browse-only Phase 26 does not initialize action slider values in
  `SliderProvider`; Phase 27 may extend state when it activates those controls.

### Search and unavailable truth (CAT-03 / CAT-04)

- Search matches dimension, module, and group labels using the existing helper;
  matching activity branches open immediately. Empty results say no dimensions
  match the query.
- Include all 19 fixed folder placeholders and any data-derived unavailable
  actions. Unavailable rows are visibly greyed and state the reason inline:
  per-folder identity, not collected yet, or no matching activity in the loaded
  graph. “No data” alone or a hover-only title is insufficient.

### Sequencing

- Plan CAT-01 first: introduce the Grouping/Catalog rail seam and remove the 3D
  flag from catalog visibility while preserving Grouping as default.
- Plan CAT-02/03/04 only after that seam is observable. Do not combine layout
  activation from Phase 27 into this phase.

### Codex's Discretion

- Exact tab/segmented-control primitive, provided it is keyboard accessible and
  visually compact.
- Internal split between core catalog and lazy activity catalog, and the exact
  dynamic-import boundary, provided profiling proves the generated actions and
  action slider state are absent from first paint.
- Exact compact wording/layout for inline reasons and the no-match state.

</decisions>

<deferred>
## Deferred Ideas

- Enabling catalog sliders and making them restructure the graph — Phase 27.
- Full registry retirement and any new issue/time dimensions — v2.5 or later.
- No new drawer, route, catalog analytics, data collection, or catalog-count
  badge in Phase 26.

</deferred>

---

*Phase: 26-catalog-slider-wall*
*Context gathered: 2026-07-15*
