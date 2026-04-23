# Roadmap: Wiki Superpowers (v2.0)

## Overview

Transform the LECG Dashboard's Clash Detection and Sim Automation wikis into a high-performance, Notion-like collaborative environment. The "Super Wiki" supports embedded Miro-style boards, interactive 3D AEC model viewers, collaborative tables, PDF previews, and real-time cursor-synced collaboration across all blocks.

## Phases

- [x] **Phase 1: Foundation & Bug Fix** - Restore editing capabilities and Yjs infrastructure
- [ ] **Phase 2: Content Blocks** - Notion-parity blocks (tables, PDF, media)
- [ ] **Phase 3: Spatial Canvas** - Miro-style whiteboard blocks
- [ ] **Phase 4: AEC Intelligence** - APS 3D viewer and ACC integration
- [ ] **Phase 5: Polish & Excellence** - Performance, glassmorphism, audit
- [x] **Phase 7: ACC Analysis & Graph** - Bulk cache analysis, permission intelligence dashboard, users graph (completed 2026-04-23)

## Phase Details

### Phase 1: Foundation & Bug Fix
**Goal**: Restore editing capabilities — EDITOR role users can obtain a Yjs collab token and edit the wiki. Tiptap editor is responsive.
**Depends on**: Nothing
**Requirements**: REQ-01
**Success Criteria** (what must be TRUE):
  1. Users with EDITOR role can edit wiki content without restriction
  2. Yjs collab token endpoint unblocked for EDITOR role
  3. Tiptap editable prop uses editorCanWrite two-gate pattern
**Plans**: 1 plan

Plans:
- [x] 01-01: Fix role-based permissions and restore wiki edit access

### Phase 2: Content Blocks
**Goal**: Enrich the Tiptap editor with Notion-parity features — collaborative tables, scrollable PDF previews, and improved media (image/video/GIF) UX.
**Depends on**: Phase 1
**Requirements**: REQ-02
**Success Criteria** (what must be TRUE):
  1. Users can insert and collaboratively edit tables within wiki pages
  2. PDF files can be embedded and scrolled inline within documents
  3. Image, video, and GIF blocks render correctly with improved UX
  4. All new blocks sync via Yjs in real-time across connected users
**Plans**: 6 plans

Plans:
- [ ] 02-01-PLAN.md — Install Phase 2 deps and scaffold Tiptap CLI components
- [ ] 02-02-PLAN.md — Table extension (CustomTableCell, sort/filter, xlsx export)
- [ ] 02-03-PLAN.md — PDF node (PdfNode + PdfNodeView with react-pdf)
- [ ] 02-04-PLAN.md — Enhanced ImageNode (alignment, lightbox, caption, GIF)
- [ ] 02-05-PLAN.md — Wire all extensions into WikiEditor + slash menu + drag handle
- [ ] 02-06-PLAN.md — Human verification of all Phase 2 content blocks

### Phase 3: Spatial Canvas
**Goal**: Integrate a whiteboarding canvas as an embedded Tiptap block, synced via Yjs with real-time cursor support.
**Depends on**: Phase 2
**Requirements**: REQ-03
**Success Criteria** (what must be TRUE):
  1. Users can insert a tldraw or Excalidraw canvas block into wiki pages
  2. Canvas state syncs via Yjs to the global document
  3. Real-time cursor sync works for drawing actions
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: AEC Intelligence
**Goal**: Connect the wiki to real BIM data via ACC — users can browse ACC files and embed a rotatable 3D viewer block.
**Depends on**: Phase 3
**Requirements**: REQ-04
**Success Criteria** (what must be TRUE):
  1. Users can open an ACC file picker dialog within the wiki
  2. APS Viewer block loads and displays the selected 3D model
  3. Wiki text and 3D model views interact correctly
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Polish & Excellence
**Goal**: Final aesthetic and performance tuning — glassmorphism UI, performance audit for 3D/diagram blocks.
**Depends on**: Phase 4
**Requirements**: REQ-05
**Success Criteria** (what must be TRUE):
  1. Glassmorphism UI enhancements applied
  2. 3D viewer and diagram blocks pass performance audit
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: ACC Project Intelligence
**Goal**: In the Users tab, when a user card is clicked, surface that person's full Autodesk Construction Cloud (ACC/BIM 360) presence — whether they have an ACC account in the hub, which projects they belong to, their role per project, and which modules/products they have access to — matched by email address using hub admin API privileges.
**Depends on**: Nothing (independent feature)
**Requirements**: REQ-06
**Success Criteria** (what must be TRUE):
  1. Clicking any user in the Users tab shows an "Autodesk" section in the detail modal
  2. Section accurately reports whether that email exists as an ACC hub member
  3. For matched users, lists every hub project they belong to with their role
  4. For each project, shows which ACC modules/products they have access to
  5. Data is sourced from hub admin API (not the user's own Autodesk link account)
  6. Results are cached in the database and can be refreshed on demand
**Plans**: 4 plans

Plans:
- [x] 06-01-PLAN.md — Add AccMemberCache Prisma model and run migration
- [x] 06-02-PLAN.md — Create lib/server/acc-admin.ts ACC Admin API helper library
- [x] 06-03-PLAN.md — Add users.getAccProfile tRPC procedure with cache-first logic
- [x] 06-04-PLAN.md — Build AccProfileSection component and wire into PersonDetailModal

### Phase 7: ACC Analysis & Graph
**Goal**: Transform the Users section into a permission intelligence hub — bulk-read all cached ACC data in one DB query, expose filter chips and project-count badges in the General tab, add a dedicated ACC Analysis tab with 5 KPI cards and role/module breakdowns, and a force-directed graph tab visualizing user-role-project relationships.
**Depends on**: Phase 6 (AccMemberCache populated)
**Requirements**: REQ-07
**Success Criteria** (what must be TRUE):
  1. General tab shows amber "No Projects" filter chip and project-count badges with no Autodesk API calls
  2. bulkAccSummary tRPC procedure reads all AccMemberCache rows in one query
  3. ACC Analysis tab shows 5 KPI cards, role frequency table, module fingerprints, and outlier list
  4. ACC Users Graph tab shows force-directed SVG graph with user/role/project nodes
  5. Graph click-through opens user profile modal
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — Bulk ACC cache prefetch + "No Projects" filter chip + project-count badges
- [ ] 07-02-PLAN.md — ACC Analysis tab (AccAnalysisPanel with KPIs, role table, module fingerprints)
- [ ] 07-03-PLAN.md — ACC Users Graph v1 (force-directed SVG, third tab, LOD-style visuals)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Bug Fix | 1/1 | Complete | 2026-04-20 |
| 2. Content Blocks | 5/6 | In Progress|  |
| 3. Spatial Canvas | 0/TBD | Not started | - |
| 4. AEC Intelligence | 0/TBD | Not started | - |
| 5. Polish & Excellence | 0/TBD | Not started | - |
| 6. ACC Project Intelligence | 4/4 | Complete | 2026-04-22 |
| 7. ACC Analysis & Graph | 3/3 | Complete   | 2026-04-23 |
| 8. Graph Layout Cache | 0/2 | In Progress | - |

### Phase 8: Graph Layout Cache — pre-computed force positions with dataHash invalidation

**Goal:** ACC Users Graph loads instantly on repeat visits — node positions are pre-computed, persisted in the DB with a dataHash fingerprint, and reused across all users and devices until any AccMemberCache row changes.
**Requirements**: GRAPH-CACHE-01, GRAPH-CACHE-02, GRAPH-CACHE-03
**Depends on:** Phase 7
**Plans:** 2 plans

Plans:
- [ ] 08-01-PLAN.md — Add AccGraphLayoutCache Prisma model and run migration
- [ ] 08-02-PLAN.md — tRPC procedures (getGraphLayout, saveGraphLayout, invalidateGraphLayout) + AccUsersGraph.tsx cache integration + Refresh Layout button
