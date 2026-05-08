# Requirements: LECG Dashboard — ACC Users Graph

**Defined:** 2026-04-28
**Core Value:** Project teams can monitor and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.

---

## v1.0 Requirements

### Foundation (FOUND)

- [x] **FOUND-01**: Graph module loads correctly when deployed to production (not just `npm run dev`) — production webpack worker bundling verified with `npm run build && npm start`
- [x] **FOUND-02**: User can navigate away from the graph page and return multiple times without the canvas going blank — renderer destroy lifecycle prevents WebGL context accumulation
- [x] **FOUND-03**: New ACC Admin API endpoints work correctly without requiring developers to manually apply the hub ID prefix strip — `getAccountId(db)` helper centralizes `b.` stripping
- [x] **FOUND-04**: Application recovers gracefully when graph position cache contains invalid values — `readPrecomputedPositions` rejects NaN/Infinity and triggers cache rebuild prompt

### Cosmos.gl Renderer (REND)

- [x] **REND-01**: User can switch to GPU-accelerated Cosmos.gl renderer for graphs with 500+ nodes — `CosmosGraphRenderer` class implementing the existing `GraphRenderer` interface
- [ ] **REND-02**: User can adjust physics simulation parameters in real-time via sliders — Phase 2 Plan 02-05 redesigned the sliders to Separation + Cluster (driving Cosmos's `simulationRepulsion` / `simulationLinkSpring` / `simulationLinkDistance` / `simulationCluster` via `setConfigPartial`). The original three-slider model (repulsion / link spring / gravity) and the precise feel-tuning are deferred to **TD-006**; this requirement remains open until TD-006 is closed.
- [x] **REND-03**: User can visually distinguish User, Project, Role, and Module nodes and their relationship types in the Cosmos.gl renderer — four node colors, three edge color/weight mappings
- [x] **REND-04**: User receives a working Canvas 2D graph when the browser does not support WebGL2 — existing `CanvasGraphRenderer` remains as fallback; dual-canvas pattern preserved. **Note (2026-04-29):** User accepted the fallback as code-only without live-browser exercise — Firefox is WebGL2-compatible, so the fallback path is unlikely to be exercised in production. See also TD-007 (vestigial Canvas2D branch) for eventual removal.

### ACC Data + Filter Refinement (DATA, FILT)

- [x] **DATA-01**: User sees `companyRole` for each ACC user — extracted from ACC Admin API user record, persisted alongside other user fields, surfaced in side panel and usable as a filter dimension
- [x] **FILT-01**: When a filter rule excludes a user, that user's node is removed from the visible graph — fully hidden, not greyed-out; edges to hidden nodes are also hidden
- [x] **FILT-02**: Date filter exposes `from` and `to` inputs and matches users whose relevant date falls inclusively within the range
- [x] **FILT-03**: Module filter renders one on/off toggle per module; with all toggles on every user is visible; toggling a module off filters out users whose access intersects only that module

### Graph UI Completion (UI)

- [x] **UI-01**: User can read node labels when zoomed in, with no labels cluttering the overview zoom level — zoom-threshold label rendering in `CanvasGraphRenderer.draw()` using existing `label` field
- [x] **UI-02**: User can see when the physics simulation has stabilized — Web Worker auto-pauses when `averageVelocity < 0.0005` for 5+ consecutive seconds; UI shows "Stable" badge
- [ ] **UI-03**: User can access the filter panel and side detail panel simultaneously on screens ≤1280px wide — layout fix prevents both panels from occupying the same top-right position

### Access Analysis (ANAL) — DEPRECATED, REPLACED BY DASH-*

> **Scope replacement (2026-05-08):** The original ANAL-01..04 requirements (graph-overlay flagging + PNG/CSV export) were replaced by Phase 4's ACC Access Analysis Dashboard (DASH-01..13) per `.planning/phases/04-access-analysis/04-CONTEXT.md`. ANAL-01..04 are deferred — they may be revisited in a future phase but are NOT delivered in v1.0.

- [~] **ANAL-01** *(deferred)*: ~~User can identify members assigned duplicate roles with overlapping module entitlements via graph overlay~~ — replaced by DASH-02 (duplicate-role detection on dashboard)
- [~] **ANAL-02** *(deferred)*: ~~User can identify projects where members have inconsistent access to the same module via graph overlay~~ — partially replaced by DASH-03 (outlier module combinations) and DASH-08 (Roles × Modules matrix)
- [~] **ANAL-03** *(deferred)*: ~~Export the current filtered graph view as a PNG image~~ — not delivered; CSV-per-widget on dashboard (DASH-11) replaces export need
- [~] **ANAL-04** *(deferred)*: ~~Export filtered member data as CSV from graph~~ — replaced by DASH-11 (CSV export per dashboard widget)

### ACC Access Analysis Dashboard (DASH)

- [x] **DASH-01**: User sees a junk-role recommendations list with HIGH / MEDIUM / LOW cleanup priority — score derived from three signals (zero members, zero modules, all members inactive >90 days)
- [x] **DASH-02**: User sees a duplicate-role recommendations list — pairs of roles ranked by overlap, triggered when module entitlements are identical AND role names share ≥80% normalized token overlap
- [x] **DASH-03**: User sees an "Unusual Access Patterns" widget surfacing module-combination outliers — module sets held by <5% of members
- [x] **DASH-04**: User sees active-user tier distribution as a stacked bar across 7d / 30d / 90d / >90d / never-signed-in buckets (driven by `lastSignIn`)
- [x] **DASH-05**: User sees an admin-access list of ACC account-level admins (project admins and shadow admins excluded)
- [x] **DASH-06**: User sees a recently-added members widget with a configurable timeframe toggle (7d / 30d / 90d, default 30d) based on member-creation / ACC-join date
- [x] **DASH-07**: User sees an ACC coverage donut comparing Google Workspace directory to ACC members — three segments: `In both` / `In Workspace, missing from ACC` / `In ACC, missing from Workspace`
- [ ] **DASH-08**: User sees a Roles × Modules entitlement heatmap covering the entire organization (full-width, dense)
- [x] **DASH-09**: User sees decision-support recommendations both as a dedicated widget AND as inline severity badges on roles wherever they appear elsewhere on the dashboard
- [ ] **DASH-10**: Clicking any finding (junk/duplicate/outlier/recommendation) opens a right-side drill-down panel with affected members, modules, projects, suggested action, and a raw data table — without navigating away from the dashboard
- [ ] **DASH-11**: Every chart and table widget on the dashboard has a "Download CSV" button that exports the data currently displayed; the recommendations widget exports columns `Type, Severity, Roles, Members, Modules, SuggestedAction`
- [ ] **DASH-12**: User can drag-reorder dashboard widgets and the chosen order persists across page reloads
- [ ] **DASH-13**: All dashboard widgets render on a single page in a 2-column grid at 1280px with the Coverage donut + Active-user tiers above the fold; no navigation tabs are required to see any widget

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
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| REND-01 | Phase 2 | Complete |
| REND-02 | Phase 2 | Deferred (TD-006) |
| REND-03 | Phase 2 | Complete |
| REND-04 | Phase 2 | Complete |
| DATA-01 | Phase 2.5 | Complete |
| FILT-01 | Phase 2.5 | Complete |
| FILT-02 | Phase 2.5 | Complete |
| FILT-03 | Phase 2.5 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Pending |
| ANAL-01 | Phase 4 | Deferred (replaced by DASH-02) |
| ANAL-02 | Phase 4 | Deferred (replaced by DASH-03/DASH-08) |
| ANAL-03 | Phase 4 | Deferred (PNG export not delivered) |
| ANAL-04 | Phase 4 | Deferred (replaced by DASH-11) |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 4 | Complete |
| DASH-03 | Phase 4 | Complete |
| DASH-04 | Phase 4 | Complete |
| DASH-05 | Phase 4 | Complete |
| DASH-06 | Phase 4 | Complete |
| DASH-07 | Phase 4 | Complete |
| DASH-08 | Phase 4 | Pending |
| DASH-09 | Phase 4 | Complete |
| DASH-10 | Phase 4 | Pending |
| DASH-11 | Phase 4 | Pending |
| DASH-12 | Phase 4 | Pending |
| DASH-13 | Phase 4 | Pending |

**Coverage:**
- v1.0 requirements: 28 total (15 active + 13 DASH new); 4 ANAL-* deferred to v1.x
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-05-08 — Phase 4 scope replacement: ANAL-01..04 deferred, DASH-01..13 added*
