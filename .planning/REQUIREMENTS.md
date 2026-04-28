# Requirements: LECG Dashboard — ACC Users Graph

**Defined:** 2026-04-28
**Core Value:** Project teams can monitor and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.

---

## v1.0 Requirements

### Foundation (FOUND)

- [ ] **FOUND-01**: Graph module loads correctly when deployed to production (not just `npm run dev`) — production webpack worker bundling verified with `npm run build && npm start`
- [ ] **FOUND-02**: User can navigate away from the graph page and return multiple times without the canvas going blank — renderer destroy lifecycle prevents WebGL context accumulation
- [ ] **FOUND-03**: New ACC Admin API endpoints work correctly without requiring developers to manually apply the hub ID prefix strip — `getAccountId(db)` helper centralizes `b.` stripping
- [ ] **FOUND-04**: Application recovers gracefully when graph position cache contains invalid values — `readPrecomputedPositions` rejects NaN/Infinity and triggers cache rebuild prompt

### Cosmos.gl Renderer (REND)

- [ ] **REND-01**: User can switch to GPU-accelerated Cosmos.gl renderer for graphs with 500+ nodes — `CosmosGraphRenderer` class implementing the existing `GraphRenderer` interface
- [ ] **REND-02**: User can adjust physics simulation parameters (repulsion, link spring, gravity) in real-time via sliders — bound to Cosmos.gl `setConfig()` live
- [ ] **REND-03**: User can visually distinguish User, Project, Role, and Module nodes and their relationship types in the Cosmos.gl renderer — four node colors, three edge color/weight mappings
- [ ] **REND-04**: User receives a working Canvas 2D graph when the browser does not support WebGL2 — existing `CanvasGraphRenderer` remains as fallback; dual-canvas pattern preserved

### Graph UI Completion (UI)

- [ ] **UI-01**: User can read node labels when zoomed in, with no labels cluttering the overview zoom level — zoom-threshold label rendering in `CanvasGraphRenderer.draw()` using existing `label` field
- [ ] **UI-02**: User can see when the physics simulation has stabilized — Web Worker auto-pauses when `averageVelocity < 0.0005` for 5+ consecutive seconds; UI shows "Stable" badge
- [ ] **UI-03**: User can access the filter panel and side detail panel simultaneously on screens ≤1280px wide — layout fix prevents both panels from occupying the same top-right position

### Access Analysis (ANAL)

- [ ] **ANAL-01**: User can identify members assigned duplicate roles with overlapping module entitlements — duplicate role detector highlights affected nodes with visual indicator
- [ ] **ANAL-02**: User can identify projects where members have inconsistent access to the same module — inconsistent access flagging per project, visible on graph and in side panel
- [ ] **ANAL-03**: User can export the current filtered graph view as a PNG image — `canvas.toBlob()` on settled frame, triggered from export button
- [ ] **ANAL-04**: User can export the current filtered member data as a CSV file — filter state drives export payload; no graph dependency

---

## v1.x Requirements (Deferred)

### Clustering

- **CLUS-01**: User can cluster nodes by project membership — requires Cosmos.gl v3 clustering API (not yet stable) or pre-computed cluster positions
- **CLUS-02**: User can search members by name or email with graph zoom-to-node — quality of life after base graph is validated

### Scale

- **SCALE-01**: Graph handles 2000+ nodes at 60fps — WebGPU WGSL shader implementation for the node-count ceiling above Canvas 2D
- **SCALE-02**: Bulk ACC sync does not time out for hubs with 50+ found users — background job architecture replacing tRPC mutation blocking

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time ACC sync / webhooks | Doubles implementation scope; polling + manual refresh sufficient for v1.0 |
| Permission editing from graph | Read-only for v1.0; write operations require ACC Admin API write scopes + audit logging |
| Folder-level permission nodes | Separate data model; grafting it onto user↔project↔role graph multiplies node count unmanageably |
| D3-force layout inside Cosmos.gl | Defeats GPU simulation purpose; two competing physics engines break layout |
| @cosmograph/react wrapper | Last published 7 months ago, no React 19 compatibility statement; plain useRef pattern is equivalent |
| Animated edge particle effects | Cosmetic only; adds GPU cost; static edge color/weight conveys the same relationship information |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| REND-01 | Phase 2 | Pending |
| REND-02 | Phase 2 | Pending |
| REND-03 | Phase 2 | Pending |
| REND-04 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| ANAL-01 | Phase 4 | Pending |
| ANAL-02 | Phase 4 | Pending |
| ANAL-03 | Phase 4 | Pending |
| ANAL-04 | Phase 4 | Pending |

**Coverage:**
- v1.0 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-04-28 — initial definition*
