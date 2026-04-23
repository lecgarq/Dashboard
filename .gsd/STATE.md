# STATE.md — Project Memory

## Current Position
- **Phase**: 8 (ACC Users Graph v2 — Canvas Particle Engine)
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
- **Phase 6**: Completed ACC Users Profile Intelligence — company/addedOn fields, Forma module rename, visual overhaul of toggle UI.
- **Phase 7**: Planned ACC Users Intelligence Suite — bulkAccSummary endpoint, "No Projects" filter, ACC Analysis dashboard, ACC Users Graph v1.
- **Phase 8**: Planned ACC Users Graph v2 — full canvas rewrite with particle animation, fixing missing users + viewport clipping.

## Next Steps
1. `/execute 8` — Rewrite AccUsersGraph with canvas engine + particles

## Active Context
- **Feature**: ACC Users Graph v2 (Canvas Particle Engine)
- **Constraint**: Must port LodGraphCanvas patterns exactly (Float32Array, sprites, spatial grid, camera lerp)
- **Goal**: All users visible, flowing particles, no viewport clipping, 60fps

## Key Decisions
- [x] Use `tldraw` or `Excalidraw` for Miro-style boards (Phase 3).
- [x] Use Tiptap native tables for basic Notion-like tables (Phase 2).
- [x] Integrate APS Viewer as a custom Tiptap Node (Phase 4).
- [x] EDITOR role gets implicit wiki module access (no explicit moduleAccess array required). Only VIEWERs need explicit membership. (Phase 1, Plan 1)
- [x] editorCanWrite (canEdit && !!collabSession) is the single source of truth for Tiptap editable state. (Phase 1, Plan 1)
- [x] Canvas-based rendering (not SVG) for AccUsersGraph — matches LodGraphCanvas for consistency and performance (Phase 8)
- [x] No d3 dependency — custom spring simulation + normalize to [0,1] world space (Phase 8)
