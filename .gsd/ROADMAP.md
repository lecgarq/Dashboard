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
