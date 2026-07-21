# Phase 39: Activity Universe Swap - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three requirements: **ACT-01, ACT-03, ACT-04**. `/users/spatial-graph` +
`/users/access-analysis` (same shell — `AccessAnalysisShellClient`; spatial-graph
`page.tsx` is a thin alias) render the activity universe from the Phase-38 payload
route; the user×project instance data path retires.

1. **Render (ACT-01)** — one node per activity event at rung L2: all 4,904,886
   resident (binary payload `/api/activity-universe/payload`), far zoom renders a
   **deterministic uniform-sample subset ≤ ~500k** (owner decision 4) with a muted
   honest label ("rendering ~500k of 4,904,886 — zoom for detail"); zoom reveals
   per-region detail via the existing `setPointSet`/`pushPointSet` LOD seam in
   `GraphCanvas2D`. First-paint color-by = **module/serviceGroup** (owner decision 3,
   theme-resolved, matches the /access-analysis module color language). Node sizing
   from real event data. Organic PaCMAP layout as computed — never a grid.
2. **Retire (ACT-03)** — clean-diff removal of the instance path:
   - compact instance payload + its prefetch (`prefetchAccessAnalysisRouteData`
     node-payload part, `graphSnapshotCompression.*`, `graphNodesFromCompactPayload`,
     the `acc-dc-graph` node/similarity procedures feeding it);
   - instance embedding pipeline: `scripts/build-instance-features.ts`,
     `scripts/compute_instance_embeddings.py` (+ its pytest), the nightly
     instance-embedding block in `scripts/dc-daily-ingest.cjs`;
   - `AccInstanceEmbedding` consumers (`lib/acc/embedding/neighborPayload.ts`,
     `similarityEdgeSet.ts`, `similarityEdges` procedure) — activity grain computed
     NO kNN, so similarity web + NeighborMatchesPanel retire outright;
   - **3D mode retires** (owner decision 1): `GraphCanvas3D` + 3D lasso + the 2D/3D
     switch in `GraphCanvas.tsx`; 3D is a v2.8 candidate if missed;
   - instance-bound side surfaces **hidden, machinery kept** where Phase 40 reuses
     it (owner decision 2): 205-dim catalog slider sidebar (`CatalogSliderSidebar`,
     `DimensionSlider`, GroupByControls…) unmounts but files stay — Phase 40
     restores the slider UX activity-native. Instance-ONLY code (kNN panels,
     3D, compression codec) deletes now.
   - `AccInstanceEmbedding` TABLE stays (drop = milestone-close cleanup item);
     person-graph (`rebuild-person-graph.ts`, PersonGraph surfaces) untouched —
     separate product surface.
3. **Interaction (ACT-04)** — hover tooltip from resident ints + payload-meta dicts
   (verb, module, project, month, author name/role/company); object/folder names +
   exact timestamp fetched on-demand per event id (new small tRPC procedure — PK
   lookup). Click opens the detail surface: event story + author profile reusing
   `UserProfilePanel` where the author resolves; authorId 0 events show the explicit
   "Unknown author" grouping. Lasso/selection operates on the RENDERED subset with
   an honest selected-count (visible = selectable at L2). Coverage label from the
   payload meta (resolvedEmailRate 94.41% / unknownAuthorRate 5.59%) lands on the
   graph surface — this completes ACT-02's surface obligation.

**NOT this phase:** activity-native dimension sliders, group-by/strength morph, any
NEW ambient motion at 4.9M (Phase 40 — PERF-07 decides custom-shader vs bounded
subset from 37-BASELINE; Phase 39 ships the graph static/frozen-mode, existing
ambient tier machinery disabled for the activity canvas); temporal scrubber, e2e
re-baseline, ≥50fps hard gate, time-to-graph re-measurement (Phase 41). The 23-panel
`app/(dashboard)/access-analysis` charts page and `/template-mty` untouched;
TEST-01/02/03 stay green.

**Traps:**
- `app/(dashboard)/access-analysis/` (charts) ≠ `app/(dashboard)/users/access-analysis/`
  (this phase's home). Both routes render ONE shell — edit once.
- Existing graph e2e specs (`acc-dc-graph.spec.ts`, lasso, cluster-labels, ambient)
  assert the 22,279-node instance universe — they WILL break on swap. E2E-03
  re-baseline is Phase 41 by design; Phase 39 records the expected breakage and
  keeps its own gates green (vitest/tsc/repo-map + new focused tests), does NOT
  chase the old specs.
- RSC hydration: superjson-wrapped dehydrate must pass through
  `lib/server/hydrationState.ts` (v2.4 PERF-04 trap) — touching the page prefetch
  means preserving that seam.
- Activity hover fetch: PK lookup by event id only; never `LOWER(userEmail)` on
  activity tables (index-kill trap).

</domain>

<evidence>
## Grounding Sources

- `.planning/phases/38-activity-data-pipeline/38-03-SUMMARY.md` + 38-VERIFICATION —
  payload route contract (10 columns, ETag=runId, `?meta=1` dicts+coverage), 424 ms
  median fetch+decode, artifact 149.7 MB.
- `.planning/phases/37-scale-feasibility-spike/37-BASELINE.md` — L2 build target:
  ≥50 fps static proven at 500k rendered (71.9/68.1); full-set render 8 fps (why
  far-zoom MUST decimate); no context loss at 4.86M resident; JS heap ~1.13 GB.
- `app/(dashboard)/users/scale-spike/ScaleSpikeClient.tsx` — working 4.86M cosmos
  wiring (decode → color derive → upload) the real canvas path adapts.
- `app/(dashboard)/users/access-analysis/GraphCanvas2D.tsx` — cosmos v3 frozen-mode
  renderer, `setPointSet`/`pushPointSet` seam, handle API; `GraphCanvas.tsx` — 2D/3D
  switch (3D branch retires); `CosmosCanvasClient.ts` — node-id conventions.
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` +
  `AccessAnalysisShellClient.tsx` — mount points for canvas, sidebar, panels;
  `server/routers/acc-dc-graph.ts` — procedures to retire vs keep.
- `app/(dashboard)/users/UserProfilePanel` surface (unified profile panel,
  `project_unified_user_profile_panel` lineage) — ACT-04 author profile reuse.
- `lib/acc/activityClassification.ts` — verb→module mapping for hover labels where
  serviceGroup is "(none)".
- `graphTestBridge.ts` — `NEXT_PUBLIC_ACC_GRAPH_TEST` counter bridge; activity
  canvas must expose equivalent counters so Phase 41 can re-baseline.
- VERIFY: exact consumer set of `acc-dc-graph` procedures before deleting any —
  some may feed panels that survive (audit at plan time with rg + repo-map).
- VERIFY: `UserProfilePanel` props contract — whether it accepts email-only lookup
  (activity author) or needs a user-instance node id; adapt or wrap, don't fork.
- VERIFY: uniform-sample stride math at ~500k of 4,904,886 (≈1:10) — confirm the
  rendered density still reads as organic regions on the live iGPU, not noise.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Zinc semantic theming; module colors resolve from the active theme (ECharts/graph
  share the module color language); reduced-motion → fully static (no drift, no
  transitions); interaction motion ≤200 ms.
- Payload fetch client-side from the route (binary, zero-copy decode via the
  Phase-37 codec already in the tree); loading skeleton via the established
  `GraphLoadingSkeleton`/`loading.tsx` pattern; honest error state when the route
  404s (artifact absent) — never a blank canvas.
- Honest labels: coverage line (94.41%/5.59% from meta), LOD line ("~500k of
  4,904,886"), month floor ("data from Dec 2024") — muted, established caption style.
- Empty/error states for hover fetch failures ("details unavailable") — never
  silently blank fields.
- New pure transforms get co-located focused vitest; canvas wiring pinned via the
  test bridge counters, not fps assertions (fps = Phase 41, headed + D3D11 +
  SwiftShader guard).
- Gates: tsc, focused vitest, `npm test` (TEST-01/02/03 byte-identical),
  repo-map check (router + shared module changes), `node --check` for touched cjs.
- Commit by explicit path; deploy per autoDeploy at phase completion with a live
  populated-graph probe; owner sees the live universe before the phase closes
  (ROADMAP UI hint: yes).

</defaults>

<decisions>
## Locked Owner Choices (2026-07-21)

1. **3D retires with the instance path.** `GraphCanvas3D`, 3D lasso, and the 2D/3D
   switch delete in the ACT-03 sweep. Activity universe is 2D-only this milestone;
   3D returns only as a future-milestone candidate.
2. **Instance-bound surfaces hide until Phase 40; instance-ONLY code deletes now.**
   Catalog slider sidebar + dimension machinery unmount (files kept for Ph40
   activity-native restore). Similarity web, NeighborMatchesPanel, kNN payload code,
   compression codec, 3D — deleted (no data source at activity grain). One-phase
   visual regression accepted (local box, Ph40 next).
3. **First-paint color-by = module/serviceGroup** — 4 live groups + "(none)",
   theme-resolved, one stable legend; verb/author cardinalities rejected for first
   paint (unreadable).
4. **Far-zoom LOD = deterministic uniform sample ≤ ~500k + honest label.** Stable
   across sessions (hash/stride on row index), statistically density-preserving;
   recency-weighted and density-stratified variants rejected for Ph39 (bias /
   build-weight); refine only on Ph40 evidence.

</decisions>
