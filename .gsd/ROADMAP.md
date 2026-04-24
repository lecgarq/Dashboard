# Project Roadmap — Wiki Superpowers

> **Current Phase**: Phase 1: Foundation & Bug Fix
> **Milestone**: v2.0 (Super Wiki)

## Must-Haves (from SPEC)
- [ ] Fix for the "Read-Only" editing bug.
- [ ] Collaborative Miro-style diagram blocks.
- [ ] Interactive APS 3D Viewer blocks with ACC integration.
- [ ] Notion-style Tables and PDF previews.
- [ ] Cursor-synced multi-user collaboration across all blocks.

## Phases

### Phase 1: Foundation & Bug Fix
**Status**: ✅ Complete
**Objective**: Restore editing capabilities and ensure the Yjs infrastructure is stable for extensions.
**Tasks**:
- [x] Debug role-based permissions in `useRole` and `WikiEditor`.
- [x] Fix Yjs session connection if failing.
- [x] Clean up existing Tiptap extension configurations.

### Phase 2: Content Blocks (Notion Era)
**Status**: ✅ Complete (Verified 2026-04-22)
**Objective**: Enrich the editor with standard "Notion" features.
**Tasks**:
- [x] Implement collaborative Tables.
- [x] Add PDF embedding with scrollable previews.
- [x] Improve Media (Image/Video/GIF) UX.
- [x] Stabilize Sync & Layout (Gap Closure 2.5).

### Phase 3: Spatial Canvas (Miro Era)
**Status**: ⬜ Not Started
**Objective**: Integrate a whiteboarding canvas as an embedded block.
**Tasks**:
- [ ] Integrate `tldraw` or `Excalidraw` as a custom Tiptap Node.
- [ ] Sync canvas state via Yjs to the global document state.
- [ ] Implement real-time cursor sync for drawing.

### Phase 4: AEC Intelligence (APS Integration)
**Status**: ⬜ Not Started
**Objective**: Connect the wiki to real BIM data via ACC.
**Tasks**:
- [ ] Build ACC File Picker dialog.
- [ ] Create APS Viewer Tiptap Node.
- [ ] Implement interaction between Wiki text and 3D Model views.

### Phase 5: Polish & Excellence
**Status**: ⬜ Not Started
**Objective**: Final aesthetic and performance tuning.
**Tasks**:
- [ ] Glassmorphism UI enhancements.
- [ ] Final performance audit for 3D/Diagram blocks.
- [ ] "Super Full" architectural update for GSD.

---

### Phase 6: ACC Users Profile Intelligence
**Status**: 🟡 In Progress
**Objective**: Enrich the user directory with accurate Autodesk ACC/Forma member data — company, join date, correct Forma module names, and a polished toggle-based access UI.
**Depends on**: Phase 1

**Tasks**:
- [x] Fix roles endpoint (GET /users/{userId}/roles)
- [x] Fix modules endpoint (GET /users/{userId}/products)
- [x] Fix React Query cache key mismatch on refresh
- [x] Resizable user detail modal (CSS resize:both)
- [x] Apple-style module toggle indicators per project
- [x] Aggregate stats bar (projects / active / admin / roles / modules)
- [x] Search, filter, sort on project list
- [x] Collapsible project cards with full module grid
- [x] Update module list to 9 Forma-renamed modules (Forma Data Management, Forma Build, etc.)
- [x] Add Company field from ACC member record
- [x] Add Added On date from ACC member record
- [ ] Verify company_name / created_at field names against live API response
- [ ] Handle cache invalidation when ACC data updates

**Verification**:
- User modal shows Company + Added On for ACC members
- Module toggles reflect exactly 9 Forma modules
- Search/filter/sort works across 440 projects

---

### Phase 7: ACC Users Intelligence Suite
**Status**: ⬜ Not Started
**Objective**: Transform the Users section from a list into a full analysis and decision-support space — with instant no-project filtering, a cross-user permission analysis dashboard, and a spatial graph for visual pattern detection.
**Depends on**: Phase 6

**Tasks**:
- [ ] `bulkAccSummary` tRPC procedure — reads all AccMemberCache in one DB query
- [ ] "No ACC Projects" filter chip in General tab (instant, no API calls)
- [ ] Project count badge on user cards from cache
- [ ] `AccAnalysisPanel.tsx` — ACC Analysis tab with KPI cards, role frequency, module fingerprints
- [ ] `AccUsersGraph.tsx` — force-directed graph of users, roles, projects (ACC Users Graph v1)
- [ ] Three-tab navigation: General / ACC Analysis / ACC Users Graph v1
- [ ] Cross-user duplicate role detection
- [ ] Multi-role-per-project detection
- [ ] Module access combination fingerprinting + outlier detection
- [ ] Click-through from graph node → user profile in General tab

**Verification**:
- Filter chip shows correct count of users with 0 ACC projects
- ACC Analysis tab loads instantly from cached data
- Graph renders with user/role nodes, correct color coding
- Clicking graph node opens user profile modal

---

### Phase 8: ACC Users Graph v2 — Canvas Particle Engine
**Status**: ⬜ Not Started
**Objective**: Rewrite AccUsersGraph using the same high-performance canvas rendering engine as LodGraphCanvas — with animated flowing particles along edges, proper viewport/camera system (no clipping), and guaranteed display of ALL users from the hub. The graph must feel alive and match the LOD Checker's visual quality.
**Depends on**: Phase 7

**Tasks**:
- [ ] Port LodGraphCanvas rendering engine to AccUsersGraph (canvas + requestAnimationFrame, not SVG)
- [ ] Implement flowing particle animation along edges (user→role and user→project connections)
- [ ] Fix viewport clipping — use proper world-space coordinates with camera lerp (same pattern as LOD)
- [ ] Guarantee ALL users render (currently some are missing — force-layout must include every cached user)
- [ ] Sprite-based node rendering with category-based color sprites (same createCircleSprite pattern)
- [ ] Spatial grid for fast hit testing (same grid-based approach as LOD)
- [ ] Edge color batching for performance (same batch-draw pattern as LOD)
- [ ] Zoom-to-fit that accounts for all nodes, not just visible ones
- [ ] Smooth camera lerp on pan/zoom (lerp factor 0.2 like LOD)
- [ ] User info tooltip on hover (name, email, roles, project count, admin status)
- [ ] Node click → opens user profile modal in General tab

**Verification**:
- ALL cached users appear as nodes in the graph (count matches bulkAccSummary total)
- Particles flow along edges continuously
- No clipping/cropping at viewport edges
- Zoom to fit shows entire graph without loss
- Performance: 60fps with 500+ nodes

---

### Phase 9: ACC Graph Physics & Filter Optimization
**Status**: ✅ Completed
**Objective**: Fix graph repulsion math, correct vertical scaling, recolor nodes by Role instead of access level, add exact Role/Module filters, and globally rename 'Docs' to 'Forma Data Management' across both Graph and Overview tables.
**Depends on**: Phase 8

**Tasks**:
- [x] Fix d3-force simulation parameters (charge strength, link distance) to achieve proper repulsion and avoid node compaction.
- [x] Fix vertical graph scaling/cropping so nodes spread out uniformly in space.
- [x] Refactor graph coloring logic: Assign distinct colors to every unique Role (instead of Admin vs Member colors).
- [x] Update Module names globally: Replace "Docs" with "Forma Data Management".
- [x] Graph Filters: Add exact filtering by Role Name (list all roles) and Module Access. Remove filtering by Project or Admin/Member in the graph.
- [x] Overview Users Table Filters: Add dropdown/select filters for "Project on ACC", "Role Name on ACC", and "Module Access on ACC".

**Verification**:
- Graph simulation spreads out users neatly with distinct role-based coloring.
- Filter dropdowns exist in both the Graph and the Overview tabs for Roles and Modules.
- "Docs" is successfully renamed to "Forma Data Management" globally.
