# Phase 27: Layout Engine — Force-Anchor Revival & Reheat Guard - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate the already-built dimension targets and weights on `/users/spatial-graph`
(the same shell as `/users/access-analysis`) so the current similarity map becomes an
explicit **General · Similarity** force-scatter baseline and selected dimensions morph
the same nodes into organic anchored structures. Make the Phase-26 catalog rows
actionable, simplify the right-rail information architecture, and land the explicit
Cosmos reheat guard first.

This phase covers LAY-01–04 and PERF-02. It does not change the 23-panel
`/access-analysis` charts page, add a data source/loader/Prisma table, recompute the
embedding, add issue/time dimensions, revive the parked 3D mode, perform Phase 28's
DuckDB/performance closeout, or broadly redesign every graph interaction.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 27 and `.planning/REQUIREMENTS.md` LAY-01–04/PERF-02:
  live target consumption, continuous organic morphing, no grid, and the reheat guard
  before/alongside force-anchor wiring.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`: structural
  `catalogTargets`/`catalogWeights` are built and then discarded when the default path
  creates `createStaticLayer`; the visible grouping morph instead uses an
  embedding-blob `layoutTarget`.
- `app/(dashboard)/users/access-analysis/staticLayer.ts`: the default embedding layer
  exposes no targets/weights and makes slider updates inert.
- `app/(dashboard)/users/access-analysis/previewLayer.ts` and
  `clusterTransitionLayer.ts`: allocation-stable interpolation primitives already exist;
  reuse them instead of introducing another layout engine.
- `app/(dashboard)/users/access-analysis/GraphCanvas.tsx`: the default 2D render path
  already pumps CPU-owned positions while Cosmos remains paused. Old GPU slider/clustering
  effects are removed from this path.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx`: dormant GPU-only
  `applySliders`, `setClustering`, `setClusters`, and `setClusterPositions` methods contain
  Cosmos `start(...)` calls. PERF-02 needs an invariant test covering every slider/
  clustering entry point when `gpuSimulation=false`.
- `app/(dashboard)/users/access-analysis/dominantClusters.ts` and
  `activeGrouping.ts`: strongest-dimension resolution and deterministic tie-breaking
  already exist. Reuse them; do not keep the multi-dimension grid path in
  `layoutDescriptor.ts`.
- `app/(dashboard)/users/access-analysis/RightPanelStack.tsx`,
  `CatalogSliderSidebar.tsx`, and `CatalogTreeSection.tsx`: the current production UI says
  “Grouping”, “Catalog preview”, and “Activates in Phase 27”; available catalog rows are
  intentionally browse-only.
- `app/(dashboard)/users/access-analysis/graphNodesFromUsers.ts`: `perm_tier` is
  hardcoded `null`, producing the observed 0/22,279 Permission-tier coverage.
  `BulkAccProject.permissionStrength` already carries the per-membership maximum 0..5;
  `lib/acc/dcUserAssembly.ts` defines the existing ladder
  `view=1, download=2, upload=3, edit=4, control=5`.
- Embedding audit on 2026-07-15: the live graph has 22,279 user×project memberships and
  every current node matched one current embedding; coordinates and ten-neighbor refs
  were finite/valid. The graph represents 3,791 distinct people. The visible
  `16,783/22,279` Role badge is partial field coverage, not missing graph nodes.
- `scripts/build-instance-features.ts`, `scripts/compute_instance_embeddings.py`, and
  `instanceFeatureTokens.ts`: General similarity is access-profile similarity over role,
  company, permission strength, activity/recency, affiliation, account/admin state, and
  module signature; project identity is intentionally excluded.
- Impeccable critique (2026-07-15): the graph is purpose-built, but three overlapping
  17-option controls, generic equal-weight tabs, conflicting position/group/color labels,
  warning-styled coverage, and roadmap copy create high cognitive load. The scoped Phase-27
  response is the Layout/Dimensions rail and explicit encoding language; broader loader,
  palette, and canvas-accessibility work stays deferred.
- VERIFY: 983 database embedding rows belong to older runs. They do not join the current
  node set, so pruning is data hygiene rather than a Phase-27 layout prerequisite.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Reuse the current structural catalog, lazy action catalog, target/weight builders,
  strongest-dimension helpers, slider context, transition buffers, and Cosmos renderer.
  No new dependency or parallel layout framework.
- **General · Similarity** is the initial state. All layout strengths at zero reproduce the
  complete current embedding scatter; no KMeans-cluster grouping is implied by the word
  “General”. Color remains an independent visual encoding.
- CPU/rAF-owned position interpolation may animate; it must never call Cosmos `start()` on
  the frozen default renderer.
- Use a 600ms target transition (inside the owner-approved 500–700ms workshop window).
  Live slider drags remain continuous, and reduced-motion users get an immediate settled
  state.
- Preserve zinc semantic theming, current search/filter/lasso/profile behavior, honest
  unavailable reasons, rail resizing, and Phase-26 lazy loading.
- Existing company data remains the current dominant/per-user firm value with an honest
  coverage/source label. Correcting COMPANY-GRAIN-01 to per-membership company is not
  silently folded into this layout phase.

</defaults>

<decisions>
## Implementation Decisions

### General similarity force scatter

- Add **General · Similarity** as the first/default Group-into option.
- General uses the verified current embedding as the zero-force anchor field; it does not
  request a new scrape or rebuild the embedding.
- Selecting General is an explicit reset to the pure similarity layout: all layout slider
  strengths return to zero. Its strength control is disabled/absent because General is the
  baseline rather than another grouping dimension.
- Present counts truthfully as memberships vs distinct people so 22,279 membership nodes are
  not mistaken for 22,279 unique users.

### Curated primary Group-into menu

Replace the broad 17-option Group-by menu with this owner-approved primary set, in order:

1. General · Similarity (synthetic zero-force baseline)
2. Role (`role`)
3. Company (`company`)
4. Users (`user`)
5. Project name (`project`)
6. Last activity (`activityRecency`, labeled buckets rather than unreadable exact dates)
7. Activity volume (`activityVolume`)
8. Folder permission type (`permissionTier`)
9. Folder access (`folderBreadth`, meaning reachable-folder count)
10. Activity type (`typeOfActivity`)
11. Modules (`moduleAccess`, meaning provisioned module access)

Active-module and per-action variants remain available in the advanced Dimensions catalog.
Color/filter retain their Phase-25 aperture in this phase; do not widen the primary layout
menu again through those lists.

### Existing-data permission repair

- Repair `permTier` from the already-loaded per-membership `permissionStrength` ladder:
  1 View, 2 Download, 3 Upload, 4 Edit, 5 Full Control; 0 remains missing/unknown.
- This is a narrow mapping fix with one focused regression test. No UI scraping, raw
  per-folder transfer, new API field, or new loader is needed.
- “Folder access” means `folderBreadth` (reachable-folder count), not individual folder
  names. Exact folder-name grouping is cross-grain and remains deferred.

### Primary selection and intentional advanced combinations

- Group-into/Color selection establishes the primary layout anchor; changing the primary
  selection transfers the current primary strength instead of accumulating hidden primary
  dimensions.
- Extra active dimensions happen only through the advanced Dimensions sliders.
- When multiple layout sliders are non-zero, **the strongest dimension wins**. Reuse the
  existing deterministic catalog-order tie-break. Never create composite grid rows/columns
  or combinatorial tuple clusters.
- The UI states the current model plainly: `Position: Similarity`,
  `Group into: <dimension> · <strength>`, and `Color: <dimension>`. If an advanced slider
  becomes strongest, the active-layout status names it.

### Layout/Dimensions right rail

- Rename the two rail views to **Layout** and **Dimensions**. Reuse the existing accessible
  tab primitive but give Layout clear primary hierarchy; do not add a drawer or route.
- Remove the repeated “Map grouping” heading and all roadmap language such as “Catalog
  preview” and “Activates in Phase 27”.
- Available Dimensions rows become real sliders when the lazy catalog loads. Unavailable
  rows stay greyed with their existing inline source reason.
- Coverage remains visible but neutral and explicit, e.g. `Role data · 16,783/22,279`, not a
  generic warning icon that suggests nodes failed to load.

### Continuous organic motion (LAY-01–04)

- Feed `catalogTargets` and `catalogWeights` into the live default render layer instead of
  discarding them at the embedding early return.
- Morph from the currently displayed positions to the winning dimension target over the
  600ms transition; changing the winner seeds from the visible buffer so there is no
  teleport back through the embedding origin.
- Zero strength returns continuously to the similarity embedding.
- The output is always an organic scatter/anchor layout. Delete/bypass the fixed grid path
  for 2+ active dimensions; strongest-wins means the grid is unnecessary.

### Reheat guard first (PERF-02)

- Land an explicit frozen-renderer invariant before/with target activation: slider and
  clustering calls in `gpuSimulation=false` mode must not call Cosmos `start`, resume the
  simulation, reseed Cosmos positions, or mutate GPU cluster membership.
- Add the narrowest regression test that invokes every exposed slider/clustering handle
  method in frozen mode and proves zero reheat calls. Keep existing GPU-mode behavior tests
  unchanged for the parked flag-on path.

### Codex's Discretion

- Exact component/file seam for registering lazy catalog slider ids after Dimensions opens.
- Whether the similarity origin is carried by an extended static layer or a small wrapper,
  provided the existing target/weight builders are consumed and no second engine appears.
- Exact compact visual styling for the Layout/Dimensions switch and neutral coverage copy,
  within existing zinc tokens and current rail width.

</decisions>

<workshop>
## Workshop Impact

- The presenter opens on an understandable similarity map, can switch to a curated business
  dimension, and sees the full 22,279-membership graph morph in roughly 600ms.
- Advanced combinations stay discoverable but intentional inside Dimensions; the common
  workshop path is no longer three repeated 17-option decisions.
- Coverage wording explains partial fields without implying that graph nodes failed to load.

</workshop>

<data_truth>
## Data Truthfulness

- Node grain stays one user×project membership. UI copy distinguishes membership nodes from
  distinct people.
- No new scraping is required for the approved layout set. Permission tier is derived from
  the existing maximum permission-strength ladder; folder access is the existing breadth
  aggregate.
- Company remains the current dominant/per-user firm value and keeps its coverage caveat.
- General similarity is the existing complete current embedding; stale historical embedding
  rows are ignored by the node-id join and are not represented as current data.

</data_truth>

<deferred>
## Deferred Ideas

- Exact folder-name grouping or per-folder permission visualization — different grain and
  data contract; only add if the owner explicitly opens that scope later.
- Pruning 983 historical embedding rows — maintenance cleanup, not needed for correct current
  rendering.
- Full canvas keyboard/screen-reader equivalent, truthful loader/progress redesign, palette
  reduction, projector label cap, and global mail/chat detector findings — important
  Impeccable follow-ups, but not hidden inside the layout-engine phase.
- Per-membership company authority fix (COMPANY-GRAIN-01), issue dimensions, temporal
  scrubber, DuckDB warm-up, lasso reliability, and first-paint remeasurement remain in their
  recorded later scopes.

</deferred>

<verification>
## Verification Expectations

- Focused tests prove: General resets to the exact embedding; strongest non-zero dimension
  wins deterministically; permission strength maps to the five named tiers; two active
  sliders never select a grid; a target change morphs without teleport; every frozen
  slider/clustering handle call causes zero Cosmos reheat.
- Catalog integration test proves available lazy rows become sliders after Dimensions opens,
  unavailable rows retain reasons, and the generated action catalog remains absent from
  initial Layout first paint.
- `npx tsc --noEmit` passes. Because shared render/layout imports change, run
  `node scripts/repo-map/check.cjs` and the relevant graph Vitest suites.
- Run the Impeccable detector for the touched spatial-graph surface and separate true
  viewport findings from offscreen global shell noise.
- Browser gate on `/users/spatial-graph`: 22,279 memberships remain present; General is the
  default; Role partial coverage is explanatory rather than an error warning; Layout and
  Dimensions are understandable; transitions land in the 500–700ms window; no fixed grid,
  frozen frame, or reheat is observed.
- Phase 28 owns the repeatable first-paint comparison against the Phase-24 baseline; Phase 27
  records any obvious regression but does not claim PERF-04.

</verification>

---

*Phase: 27-layout-engine-force-anchor-revival-reheat-guard*
*Context gathered: 2026-07-15*
