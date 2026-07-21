# Phase 40: Dimensions & Sliders at Scale - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Two requirements: **DIM-07, PERF-07**. `/users/spatial-graph` (the
`AccessAnalysisShellClient` → `ActivityUniverseShell` path shipped in Phase 39)
gains the dimension slider surface back, activity-native, plus deliberate motion:

1. **Dimensions (DIM-07)** — group-by / color-by / strength sliders over the
   activity universe. Dimension set = the payload's resident int columns, all
   already client-side (no new payload work): **verb (116), module/serviceGroup
   (7), objectType (14), month (~19), author role (91), author company (347),
   project (957)** — plus **author (2,328) as color-by/filter/hover only, never
   group-by** (owner decision 4). Control surface = the kept
   `CatalogSliderSidebar` shell (`GroupByControls`, `DimensionSlider`,
   `SliderContext`) repopulated with these 8 activity dims (owner decision 3);
   the instance-only 205-dim catalog DATA wiring (catalogTargets instance
   feeds, dimension search box, preset bar at 8 dims) retires with a clean
   diff. Layouts stay organic — category centroids get organic jitter/packing,
   never a grid. Per-dimension honest coverage labels via the established
   `dimensionCoverage` pattern (role/company are bounded by the 94.41% author
   resolution from payload meta; event-native dims cover the full corpus).
2. **Group-by semantics** — every category gets its own organic centroid, even
   at 957 (project archipelago); only top-N largest categories get labels
   (owner decision 4). No "Other" bucketing of positions — nothing merged away.
   Strength slider lerps rest (PaCMAP layout as computed) → full clump, the
   established morph contract from the 22k graph.
3. **Morph path (PERF-07)** — the CPU/rAF per-node morph is REPLACED GPU-side
   (owner decision 2): on group-by/strength change, compute target positions
   once on CPU, upload once (~6 MB for ~500k rendered), and a custom shader
   seam in `GraphCanvas2D` interpolates rest→target with a time/strength
   uniform. Per-frame CPU position writes at ≥250k are measured dead
   (37-BASELINE: 28.8 fps) — that path must not return. **Fallback clause** (if
   the cosmos v3 shader seam proves infeasible in-phase): decimated morph —
   animate a ~100k subset through the transition, snap the rest at the end —
   recorded as a deviation, not silently swapped.
4. **Ambient life (PERF-07)** — decimated CPU ambient: ~100k of the rendered
   ~500k points drift via the proven CPU-choreography path (73 fps at 106k in
   37-BASELINE); the rest stay still (owner decision 1). Custom-shader ambient
   at 500k explicitly rejected for this phase (unmeasured risk). Ambient
   respects the tier machinery conventions and is fully disabled under
   `prefers-reduced-motion`.
5. **Motion contract rewrite (PERF-07)** — the PERF-02 frozen-handle invariant
   is evolved deliberately: `activityPhysicsStub` grows into (or is replaced
   by) an activity physics layer whose tests PIN the new contract — what may
   mutate cosmos state (the morph uniform/upload seam, the ambient subset
   choreography) and what may not (no per-frame full-buffer CPU writes, no
   cosmos force sim). The contract change is recorded in the phase artifacts,
   never silently weakened.

**NOT this phase:** temporal scrubber, e2e re-baseline against
`__ACTIVITY_UNIVERSE_TEST__`, the measured ≥50fps Tier-0 hard gate, and
time-to-graph re-measurement (all Phase 41 — measure-last discipline). No new
payload columns or pipeline runs (all dims already resident). The 23-panel
`app/(dashboard)/access-analysis` charts page and `/template-mty` untouched;
TEST-01/02/03 stay green; person-graph untouched; `AccInstanceEmbedding` table
untouched (drop = milestone-close item).

**Traps:**
- `app/(dashboard)/access-analysis/` (charts) ≠
  `app/(dashboard)/users/access-analysis/` (this phase's home). One shell
  serves `/users/spatial-graph`; edit once.
- Region-LOD × morph: the `setPointSet` zoom-detail seam re-derives the
  rendered subset from PaCMAP positions — while group-by strength > 0 the
  positions on screen are NOT the embedding, so the detail seam must suspend
  (rendered set stays the deterministic stride-10 sample) until strength
  returns to 0. Don't let a zoom mid-morph teleport points.
- fps numbers in THIS phase are advisory only — the binding gate is Phase 41,
  headed + D3D11 + SwiftShader renderer guard (CONCERNS trap). Vitest pins
  contracts, not frame rates.
- Old PERF-02 frozen-handle tests assert the instance-era contract — rewrite
  them AS the new pins in the same plan that changes the behavior; never leave
  them deleted-but-unreplaced.
- The kept sidebar machinery was last compiled unmounted (39: single severing
  edit, MapClusterLabels type re-home) — expect prop contracts shaped for the
  205-dim instance catalog; adapt at the data boundary, don't fork components.
- Working tree already carries WIP edits to `catalogTargets.ts`,
  `dimensionCatalog.types.ts` and other users/access-analysis files — inspect
  `git status` per-file before editing, commit by explicit path only.

</domain>

<evidence>
## Grounding Sources

- `.planning/phases/37-scale-feasibility-spike/37-BASELINE.md` — the perf facts
  this phase builds to: full-set CPU choreography dead ≥250k (28.8 fps);
  cosmos GPU force sim NOT the ambient path (20.4 fps @500k); CPU ambient
  proven 73 fps @106,196; ≥50 fps static ceiling ≈500k rendered; L2 verdict
  "ambient on the rendered subset still needs custom-shader or decimated
  motion".
- `.planning/phases/39-activity-universe-swap/39-VERIFICATION.md` — what's
  live: 4,904,886 resident, stride-10 sample 490,489 rendered, frozen-mode
  canvas, module color legend, hover/click/lasso, deploy BUILD_ID
  `8Va2aGSw6-sTC0SXkgNxO`.
- Payload columns (verified in `scripts/build-activity-universe-payload.ts` +
  `.embedding/activity-universe-meta.json`): `positions, verbId(116),
  objectTypeId(14), moduleId(7), monthId, roleId(91), companyId(347),
  projectId(957), authorId(2328), folderId` — every DIM-07 minimum dimension
  is already resident client-side.
- Kept-for-Ph40 machinery (owner decision 2 of Phase 39, compiles unmounted):
  `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx`,
  `GroupByControls.tsx`, `DimensionSlider.tsx`, `SliderContext.tsx`,
  `physicsLayer` + `MapClusterLabels.tsx` (label path for top-N category
  labels).
- `app/(dashboard)/users/access-analysis/activity/activityPhysicsStub.ts` —
  the frozen PhysicsLayer stub Phase 40 evolves ("Phase 40 owns motion" is in
  its header comment); `ActivityUniverseShell.tsx` — mount point;
  `lodSample.ts` — the deterministic stride sample the morph/ambient operate
  on; `GraphCanvas2D.tsx` — `setPointSet`/`pushPointSet` seam + handle API
  where the shader seam lands.
- `dimensionCoverage` pattern (established v2.4) — per-dimension honest
  coverage labels; payload meta `resolvedEmailRate 0.94405` is the live
  denominator for role/company/author coverage.
- VERIFY: cosmos.gl v3 custom-shader/uniform access for the GPU lerp seam —
  confirm the extension point (or patch strategy) at plan time before
  committing to decision 2's primary path; the fallback clause exists for
  this.
- VERIFY: `MapClusterLabels` reuse for top-N category labels at activity
  grain — props were instance-shaped; confirm adapt-vs-simplify at plan time.
- VERIFY: month dimension cardinality (~19 from monthCount in meta dicts) —
  read the exact value from the live meta when building the dimension list.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Zinc semantic theming; color-by palettes theme-resolved; module keeps the
  established 7-color module language from Phase 39; high-cardinality color-by
  = top-N distinct colors + muted remainder, honest legend counts.
- Organic always: category centroids placed with organic packing/jitter, never
  rows/grids (standing owner constraint).
- `prefers-reduced-motion` → fully static: no ambient drift, morph becomes an
  instant reposition (≤200 ms fade at most).
- Honest labels persist through morph: LOD caption ("rendering ~500k of
  4,904,886"), coverage caption (94.41%/5.59%), plus per-dimension coverage
  line when a dimension is active.
- Empty/error states: a dimension whose dict fails to resolve degrades to an
  honest disabled state, never a blank sidebar.
- New pure transforms (target-position computation, centroid packing, coverage
  derivation) get co-located focused vitest; canvas wiring pinned via
  `activityTestBridge` counters, not fps assertions.
- Gates: `npx tsc --noEmit`, focused vitest on new/rewritten contract pins,
  full `npm test` (TEST-01/02/03 byte-identical), `node scripts/repo-map/check.cjs`
  (shared-module + component surface changes).
- Commit by explicit path; deploy per autoDeploy at phase completion with live
  probe; owner reviews morph quality live (ROADMAP UI hint: yes).

</defaults>

<decisions>
## Locked Owner Choices (2026-07-21)

1. **Ambient = decimated CPU, ~100k of the rendered subset.** The proven 73 fps
   CPU-choreography path animates ~100k points; the rest stay still.
   Custom-shader ambient at 500k rejected this phase (unmeasured); full-static
   rejected (owner wants life back).
2. **Morph = GPU lerp shader.** Target positions computed once per
   group-by/strength change, uploaded once, interpolated GPU-side via a
   custom-shader seam in `GraphCanvas2D`. Decimated-morph+snap is the recorded
   fallback if the cosmos v3 seam proves infeasible; crossfade-only rejected.
3. **Slider UI = reuse the kept sidebar shell with 8 activity dims.**
   `CatalogSliderSidebar`/`GroupByControls`/`DimensionSlider` repopulated
   activity-native; dimension search box and preset bar retire (dead weight at
   8 dims); instance-only catalog data wiring deletes with a clean diff.
4. **High-cardinality group-by = all categories, top-N labels.** Every category
   gets an organic centroid (957 project blobs read as an archipelago); only
   the largest N get labels; no "Other" position-bucketing. Author (2,328) is
   excluded from group-by — color-by/filter/hover only.

</decisions>
