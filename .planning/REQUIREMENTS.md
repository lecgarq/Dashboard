# Requirements: LECG Dashboard — Access Analysis Redesign

**Defined:** 2026-05-19
**Core Value:** The Access Analysis spatial graph reveals how people relate to projects through real math on real data — not vibes, not patches.

## v1 Requirements

Scope locked for the 2026-05-19 19:00 demo. Each maps to exactly one roadmap phase.

### Data

- [x] **DATA-01**: Node table built from existing tRPC sources (AccProjectMember + AccActivity + AccFolderPermission) — one row per `(email, projectId)` instance
- [x] **DATA-02**: Feature columns wired: activity count, last sign-in age, role IDs, folder permission tier, isAdmin, isExternal, module IDs
- [x] **DATA-03**: DuckDB-WASM materializes the node table client-side for fast filtering/aggregation
- [x] **DATA-04**: Position cache survives filter changes (positions never recomputed when only filter changes)

### Math

- [x] **MATH-01**: Semantic seed positioning function — `f(node_features, weights) → (x, y, z)` with deterministic output for fixed inputs
- [x] **MATH-02**: Dimension axes distributed evenly: `angle_d = (d / D) × 2π`; each dimension has its own seed contribution
- [x] **MATH-03**: Slider composition formula `finalTarget(node) = Σ(u_d × f_d(node) × s_d) / Σ(s_d)` — multiple sliders compose, not modal
- [x] **MATH-04**: Slider semantics: 0 = pure organic (repulsion-only); 100 = full clustering on that dimension; intermediate values blend continuously and monotonically
- [x] **MATH-05**: Math layer is pure TypeScript with no React, no DOM, no engine dependency — independently unit-testable with Vitest

### Physics

- [x] **PHYS-01**: d3-force-3d simulation with named per-dimension forces (`simulation.force("dim-activity")`, etc.)
- [x] **PHYS-02**: Slider changes call `force.strength()` + `d3ReheatSimulation()` — never a full restart
- [x] **PHYS-03**: `max(slider_values)` drives engine params (alpha, alphaDecay, repulsion, attraction) continuously
- [x] **PHYS-04**: Filter, search, and lasso events do NOT touch the simulation — they only mutate an alphaMask Float32Array
- [x] **PHYS-05**: Positions freeze to position cache when alpha settles

### Render

- [x] **REND-01**: 2D mode via @cosmos.gl/graph v3 (WebGL, GPU) running in frozen mode (enableSimulation: false). Per-node RGBA colors via setPointColors. Alpha mask expressed via highlightedPointIndices + pointGreyoutOpacity: 0.15. (Supersedes the prior react-force-graph-2d v1.29.1 spec — replaced 2026-05-19 per CONTEXT.md.)
- [ ] **REND-02**: 3D mode via three.js r184 InstancedMesh (SphereGeometry low-poly) + OrbitControls (unconstrained: enableDamping=true, autoRotate=false, no polar clamp). Camera auto-fits to node bounding box on initial 3D entry. Per-instance RGBA via vertexColors=true + InstancedBufferAttribute. (Supersedes prior react-force-graph-3d spec — replaced 2026-05-19 per CONTEXT.md and RESEARCH Open Question #2: cosmograph has no 3D mode; three.js is the implementation.)
- [ ] **REND-03**: Seamless 2D ↔ 3D switch: same `graphData` object reference, position continuity preserved (no jump, no remount jitter)
- [x] **REND-04**: GraphCanvas component receives only `Float32Array positions`, `Float32Array alphaMask`, and `mode: "2d"|"3d"` — no slider values, no feature data inside the component
- [x] **REND-05**: Smooth animations during slider drag (no flash, no popping, no jitter)

### Interactions

- [ ] **INTR-01**: Real-time filter — togglable dimension filters update alphaMask immediately, position state preserved
- [ ] **INTR-02**: Real-time search — text input highlights matching nodes (focus + halo); position state preserved
- [ ] **INTR-03**: Click-isolate — clicking a node dims everything else via alphaMask
- [ ] **INTR-04**: Hover detail — hovering surfaces tooltip with node feature snapshot
- [ ] **INTR-05**: Lasso tool — freehand polygon selection over the canvas → returns `selectedNodeIds[]`
- [ ] **INTR-06**: Dimension sliders UI — one slider per dimension with 0–100 range and live value readout
- [ ] **INTR-07**: 2D / 3D toggle button — single click switches mode

### Analytics Bridge

- [ ] **ANLY-01**: Lasso selection → DuckDB aggregation → pie chart widget showing breakdown of the selected subset (e.g. by role, by permission tier, by activity bucket)
- [ ] **ANLY-02**: Pie chart updates in real time as lasso selection changes; uses canonical `ChartDatum[]` shape

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Graph Pies (next milestone slice)

- **PIES-01**: Pie chart widgets embedded across other dashboard tabs (Sync Center, Users Directory, etc.)
- **PIES-02**: Cross-filter between graph lasso and tab-level pies

### Polish

- **POLISH-01**: Cluster hull rendering (d3-polygon convex hulls around dense regions)
- **POLISH-02**: Cluster labels with anti-overlap layout
- **POLISH-03**: Per-dimension color theme

### Engine Hardening

- **HARD-01**: Lasso coordinate transform robustness under pan/zoom (MEDIUM confidence gap from research)
- **HARD-02**: d3-force-cluster-3d version pin verification (MEDIUM confidence gap)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Manual sync UI (Sync All / Refresh / stale banner) | Sync is automatic via Task Scheduler; manual UI intentionally removed |
| Similarity edges as visible lines/nodes | Similarity is positional/clustering only — never rendered |
| Modularity / community-detection clustering | Mathematically redundant with force layout; clusters come from DC parameter buckets only |
| Server-side physics | Layout runs client-side via d3-force-3d |
| Undo history for interactions | Out of demo scope |
| Tutorial overlays | Out of demo scope |
| UMAP / t-SNE pre-processing | Math layer formula is the layout; no ML reduction step |
| Cosmograph / cosmos.gl simulation | cosmos.gl is used as 2D renderer in frozen mode (enableSimulation: false); its runtime force-weight mutation API is not used |
| Manual cluster annotations | All clustering driven by sliders + data; no manual override |
| Mobile / responsive layout | Desktop demo only |
| Re-platforming to cloud / Railway | Localhost only via Task Scheduler |
| Patches on existing access-analysis internals | Entire internals get rewritten; band-aids forbidden |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| MATH-01 | Phase 1 | Complete |
| MATH-02 | Phase 1 | Complete |
| MATH-03 | Phase 1 | Complete |
| MATH-04 | Phase 1 | Complete |
| MATH-05 | Phase 1 | Complete |
| PHYS-01 | Phase 2 | Complete |
| PHYS-02 | Phase 2 | Complete |
| PHYS-03 | Phase 2 | Complete |
| PHYS-04 | Phase 2 | Complete |
| PHYS-05 | Phase 2 | Complete |
| REND-01 | Phase 3 | Complete |
| REND-02 | Phase 3 | Pending |
| REND-03 | Phase 3 | Pending |
| REND-04 | Phase 3 | Complete |
| REND-05 | Phase 3 | Complete |
| INTR-01 | Phase 4 | Pending |
| INTR-02 | Phase 4 | Pending |
| INTR-03 | Phase 4 | Pending |
| INTR-04 | Phase 4 | Pending |
| INTR-05 | Phase 4 | Pending |
| INTR-06 | Phase 4 | Pending |
| INTR-07 | Phase 4 | Pending |
| ANLY-01 | Phase 4 | Pending |
| ANLY-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-19*
*Last updated: 2026-05-19 after roadmap creation*
