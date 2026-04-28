# Roadmap: LECG Dashboard — v1.0 ACC Users Graph

## Overview

This milestone completes and hardens an ACC Users Graph module that is already ~80% built. The work proceeds in four phases: first stabilizing the foundation so production deployments are reliable, then adding the Cosmos.gl GPU renderer on top of that stable base, then polishing the graph UI gaps, and finally delivering the access analysis and export capabilities that make the tool actionable for project managers and BIM coordinators.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases: Created via `/gsd:insert-phase` if urgent work arises mid-milestone

- [x] **Phase 1: Foundation** - Harden production stability, renderer lifecycle, and data safety before adding new features
- [ ] **Phase 2: Cosmos.gl Renderer** - Implement GPU-accelerated CosmosGraphRenderer for 500+ node performance with live physics controls
- [ ] **Phase 3: Graph UI Completion** - Close the remaining UI gaps: zoom-level labels, physics auto-pause, and panel layout
- [ ] **Phase 4: Access Analysis** - Deliver duplicate role detection, inconsistent access flagging, and PNG/CSV exports

## Phase Details

### Phase 1: Foundation
**Goal**: The graph module works correctly in production — not just dev — with no blank canvas after navigation, safe hub ID handling, and validated position data
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Running `npm run build && npm start` and visiting the graph page loads the canvas with nodes — no spinner hanging, no 404 on the worker script, no silent blank canvas
  2. A user who navigates away from `/users` and returns five times sees a working graph every time — DevTools shows no accumulating WebGL contexts
  3. Any new ACC Admin API endpoint added to `users.ts` that uses `getAccountId(db)` receives a bare UUID — no developer has to remember to strip the `b.` prefix manually
  4. When the graph position cache contains NaN or Infinity values, the application shows a "Rebuild Cache" prompt rather than rendering all nodes at the top-left corner or crashing the physics worker
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Extract getAccountId hub ID helper (FOUND-03)
- [x] 01-02-PLAN.md — Renderer lifecycle fix + cache corruption banner (FOUND-02, FOUND-04)
- [x] 01-03-PLAN.md — Navigation state persistence + loading timeout + API error recovery
- [x] 01-04-PLAN.md — Production build verification + human checkpoint (FOUND-01)

### Phase 2: Cosmos.gl Renderer
**Goal**: Users on 500+ node graphs can switch to a GPU-accelerated renderer and tune the physics simulation in real time; users on browsers without WebGL2 still get the Canvas 2D fallback
**Depends on**: Phase 1
**Requirements**: REND-01, REND-02, REND-03, REND-04
**Success Criteria** (what must be TRUE):
  1. A user with a large hub (500+ nodes) can click a renderer toggle and see the graph re-render via Cosmos.gl GPU instancing without a page reload
  2. A user can drag sliders for repulsion, link spring, and gravity and observe the graph layout shift in real time — changes take effect without restarting the simulation
  3. User nodes, Project nodes, Role nodes, and Module nodes are visually distinct in the Cosmos.gl renderer — four different colors, and edges have weight/color variation by relationship type
  4. A user on a browser that does not support WebGL2 still sees the Canvas 2D graph rendering correctly — no error screen, no empty canvas
**Plans**: TBD

### Phase 3: Graph UI Completion
**Goal**: The graph UI has no remaining polish gaps — labels appear at the right zoom level, the physics simulation signals when it has settled, and the filter and detail panels do not fight for screen space on smaller monitors
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. When zoomed in close to a cluster, node labels appear legibly; when zoomed out to full-graph overview, no label text clutters the view — the transition happens at a consistent zoom threshold
  2. After the graph has been running for several seconds without interaction, a "Stable" badge appears in the UI and the physics worker drops to near-zero CPU usage — the badge disappears if the user drags a node and triggers new simulation
  3. On a 1280px wide screen (a common laptop resolution), the filter panel and the node detail side panel are both accessible simultaneously without one hiding the other
**Plans**: TBD

### Phase 4: Access Analysis
**Goal**: Project managers can use the graph to identify specific access problems — duplicated roles, inconsistent module access — and export findings as PNG screenshots or CSV data for reporting
**Depends on**: Phase 3
**Requirements**: ANAL-01, ANAL-02, ANAL-03, ANAL-04
**Success Criteria** (what must be TRUE):
  1. Members who hold two roles with overlapping module entitlements are visually flagged on the graph — selecting a flagged node shows the duplicate role detail in the side panel
  2. Projects where some members have access to a module and others do not (despite having the same role) are identifiable — the graph highlights the inconsistency and the side panel describes it
  3. Clicking the export button downloads a PNG image of the current graph view — the exported image reflects the active filter state and includes the visible nodes and edges
  4. Clicking the CSV export button downloads a file containing the currently filtered member data — opening the file in Excel or a spreadsheet shows correct columns and rows matching what the user sees in the filter panel
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-28 |
| 2. Cosmos.gl Renderer | 0/TBD | Not started | - |
| 3. Graph UI Completion | 0/TBD | Not started | - |
| 4. Access Analysis | 0/TBD | Not started | - |
