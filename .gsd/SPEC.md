# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
To transform the LECG Dashboard's Clash Detection and Sim Automation wikis into a high-performance, Notion-like collaborative environment. This "Super Wiki" will support embedded Miro-style boards (collaborative diagrams) and interactive 3D AEC model viewers (APS Integration) directly within the document flow, maintaining 100% real-time cursor-synced collaboration across all blocks.

## Goals
1. **Fix Core Editing Blocker**: Resolve the bug currently preventing users from editing wiki sections (Role/Permissions validation).
2. **Notion-Parity Blocks**: Enhance the Tiptap editor with collaborative Tables, PDF scrollable previews, and refined Media (GIF/Video) handling.
3. **Miro-Style Boards**: Integrate `tldraw` or `Excalidraw` as a custom collaborative block within pages, supporting full spatial diagrams with synced cursors.
4. **APS "Model Drop"**: Allow users to browse ACC files and embed a rotatable, interactive 3D viewer directly into wiki pages as a block.
5. **Ultra-Smooth Collaboration**: Ensure Yjs synchronization extends to all new block types, providing a seamless multi-user experience.

## Non-Goals (Out of Scope)
- Developing a full-scale vector graphics editor (focus on whiteboard-style diagramming).
- Migrating the entire dashboard to a different framework (remain on Next.js/Tiptap).
- General-purpose file hosting (leverage UploadThing/S3/ACC).

## Users
- **BIM Managers**: Documenting clash detection workflows and standards.
- **AEC Engineers**: Reviewing simulation outcomes and 3D coordination states.
- **Project Leads**: Managing high-level sim automation roadmaps.

## Constraints
- **Authentication**: Must respect existing LECG Dashboard role-based access.
- **APS Credentials**: Requires valid Client ID/Secret and properly scoped tokens for ACC access.
- **Performance**: 3D viewers and large diagrams must not lag the text editor or cause memory leaks.

## Success Criteria
- [ ] Users with appropriate roles can edit wiki content without restriction.
- [ ] Collaborative diagram blocks support synced cursors and multi-user drawing.
- [ ] APS Viewer blocks correctly load and display models chosen from the ACC browser.
- [ ] Tables and PDF previews function as expected within the document flow.
