# STATE.md — Project Memory

## Current Position
- **Phase**: 1
- **Plan**: 1 (complete)
- **Status**: Phase 1 in progress — Plan 1 executed

## Next Steps
1. `/execute 1-2` — Continue Phase 1 if additional plans exist, otherwise proceed to Phase 2 content blocks.

## Active Context
- **Feature**: Wiki Overhaul (v2.0)
- **Constraint**: Must fix permission inconsistency between TRPC and Yjs token endpoint.
- **Goal**: Notion/Miro/AEC integration.

## Key Decisions
- [x] Use `tldraw` or `Excalidraw` for Miro-style boards (Phase 3).
- [x] Use Tiptap native tables for basic Notion-like tables (Phase 2).
- [x] Integrate APS Viewer as a custom Tiptap Node (Phase 4).
- [x] EDITOR role gets implicit wiki module access (no explicit moduleAccess array required). Only VIEWERs need explicit membership. (Phase 1, Plan 1)
- [x] editorCanWrite (canEdit && !!collabSession) is the single source of truth for Tiptap editable state. (Phase 1, Plan 1)
